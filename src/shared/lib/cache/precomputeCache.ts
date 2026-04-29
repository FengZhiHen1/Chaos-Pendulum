import { openDB, getStore, putStore } from "./indexed-db";
import { notify } from "@/features/system/error-handling/notify";
import { translateError } from "@/features/system/error-handling/error-dictionary";
import type { PrecomputeErrorCode } from "@/features/analyze/types";
import type {
  PrecomputeDataType,
  PrecomputeCacheEntry,
  UsePrecomputeDataInput,
  PrecomputeDataState,
} from "@/features/analyze/types";

const DB_NAME = "chaos-pendulum-cache";
const DB_VERSION = 1;
const STORE_NAME = "precompute";
const MAX_ENTRIES = 10;
const SOLVER_VERSION = "1.0.0";

let dbInstance: IDBDatabase | null = null;
let dbAvailable = true;

async function getDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return dbInstance;
  if (!dbAvailable) return null;

  try {
    const db = await openDB(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    });
    dbInstance = db;
    return db;
  } catch {
    dbAvailable = false;
    return null;
  }
}

// ─── 核心缓存读写 ──────────────────────────────────

async function getCachedData<T extends PrecomputeDataType>(
  cacheKey: string,
): Promise<PrecomputeCacheEntry<T> | undefined> {
  const db = await getDB();
  if (!db) return undefined;

  try {
    const entry = await getStore<PrecomputeCacheEntry<T>>(db, STORE_NAME, cacheKey);
    if (!entry) return undefined;

    // 命中时递增 hitCount
    const updated: PrecomputeCacheEntry<T> = {
      ...entry,
      hitCount: (entry.hitCount ?? 0) + 1,
    };
    await putStore(db, STORE_NAME, updated);
    return entry;
  } catch {
    return undefined;
  }
}

async function setCachedData<T extends PrecomputeDataType>(
  cacheKey: string,
  data: T,
): Promise<void> {
  const db = await getDB();
  if (!db) return;

  const serialized = JSON.stringify(data);
  const entry: PrecomputeCacheEntry<T> = {
    cacheKey,
    data,
    cachedAt: new Date().toISOString(),
    size: new TextEncoder().encode(serialized).length,
    hitCount: 0,
  };

  try {
    await putStore(db, STORE_NAME, entry);
    await evictLRU();
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      // 激进 LRU：删除最旧的 5 条，重试一次
      try {
        await evictLRU(5);
        await putStore(db, STORE_NAME, entry);
      } catch {
        dbAvailable = false;
        console.warn("[precomputeCache] IndexedDB 写入失败，已切换至无缓存模式");
      }
    }
  }
}

async function evictLRU(extraSlots: number = 0): Promise<void> {
  const db = await getDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const entries: PrecomputeCacheEntry[] = req.result;
      const limit = MAX_ENTRIES - extraSlots;
      if (entries.length <= limit) {
        resolve();
        return;
      }

      // 按 cachedAt 排序，最旧的优先淘汰
      entries.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
      const toDelete = entries.slice(0, entries.length - limit);

      const delTx = db.transaction(STORE_NAME, "readwrite");
      const delStore = delTx.objectStore(STORE_NAME);
      for (const entry of toDelete) {
        delStore.delete(entry.cacheKey);
      }

      delTx.oncomplete = () => resolve();
      delTx.onerror = () => resolve();
    };

    req.onerror = () => resolve();
  });
}

export async function clearPrecomputeCache(): Promise<void> {
  const db = await getDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

// ─── 错误状态构建 ──────────────────────────────────

function buildErrorState<T extends PrecomputeDataType>(
  code: PrecomputeErrorCode,
  message: string,
  input: UsePrecomputeDataInput,
): PrecomputeDataState<T> {
  const translated = translateError({ code, context: { reason: message } });
  notify({
    title: translated.message,
    variant: translated.level === "error" ? "error" : "warning",
    durationMs: translated.durationMs,
    errorCode: code,
  });
  return {
    status: "error",
    data: null,
    errorMessage: message,
    errorCode: code,
    source: null,
    retry: () => loadPrecomputeData<T>(input),
  };
}

// ─── 主加载函数 ────────────────────────────────────

export async function loadPrecomputeData<T extends PrecomputeDataType>(
  input: UsePrecomputeDataInput,
): Promise<PrecomputeDataState<T>> {
  const {
    dataType,
    dataUrl,
    expectedGridHash,
    expectedType,
    expectedSolverVersion = SOLVER_VERSION,
    fetchTimeoutMs = 10000,
    maxRetries = 3,
    retryBaseMs = 1000,
  } = input;

  const cacheKey = `${dataType}-${expectedGridHash}`;

  // 1. 尝试 IndexedDB 缓存
  try {
    const cached = await getCachedData<T>(cacheKey);
    if (cached) {
      return {
        status: "ready",
        data: cached.data as T,
        errorMessage: null,
        errorCode: null,
        source: "cache",
        retry: () => loadPrecomputeData<T>(input),
      };
    }
  } catch {
    /* IndexedDB 不可用，静默降级 */
  }

  // 2. fetch + 重试
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

      const response = await fetch(dataUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Python json.dumps 将 float('nan')/inf 序列化为 NaN/Infinity，
      // 这些 token 不在 JSON 标准中，JS 的 JSON.parse 会抛 SyntaxError。
      // 清洗为 null 后再解析。
      const rawText = await response.text();
      const cleanText = rawText
        .replace(/\bNaN\b/g, "null")
        .replace(/-?Infinity/g, "null");
      const json = JSON.parse(cleanText);

      // 3. 校验 metadata
      if (json.metadata?.type !== expectedType) {
        return buildErrorState<T>(
          "PRECOMPUTE_FORMAT_ERROR",
          `期望类型 ${expectedType}，实际 ${json.metadata?.type}`,
          input,
        );
      }
      if (json.metadata?.gridHash !== expectedGridHash) {
        return buildErrorState<T>(
          "PRECOMPUTE_FORMAT_ERROR",
          `gridHash 不匹配：期望 ${expectedGridHash}，实际 ${json.metadata?.gridHash}`,
          input,
        );
      }

      // 4. 版本校验（不阻止加载）
      if (json.metadata?.solverVersion && json.metadata.solverVersion !== expectedSolverVersion) {
        const translated = translateError({
          code: "PRECOMPUTE_VERSION_MISMATCH",
          context: {
            expected: expectedSolverVersion,
            actual: json.metadata.solverVersion ?? "未知",
          },
        });
        notify({
          title: translated.message,
          variant: "warning",
          durationMs: translated.durationMs,
          errorCode: "PRECOMPUTE_VERSION_MISMATCH",
        });
      }

      // 5. 写入缓存
      try {
        await setCachedData(cacheKey, json);
      } catch {
        /* IndexedDB 不可用，静默跳过 */
      }

      return {
        status: "ready",
        data: json as T,
        errorMessage: null,
        errorCode: null,
        source: "network",
        retry: () => loadPrecomputeData<T>(input),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = retryBaseMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // 6. 所有重试失败
  return buildErrorState<T>(
    "PRECOMPUTE_FETCH_FAILED",
    lastError?.message ?? "未知错误",
    input,
  );
}

// ─── React Hook ────────────────────────────────────

import { useState, useEffect, useCallback } from "react";

export function usePrecomputeData<T extends PrecomputeDataType>(
  input: UsePrecomputeDataInput,
): PrecomputeDataState<T> {
  const [state, setState] = useState<PrecomputeDataState<T>>({
    status: "idle",
    data: null,
    errorMessage: null,
    errorCode: null,
    source: null,
    retry: () => {},
  });

  useEffect(() => {
    if (input.enabled === false) return;

    setState((s) => ({
      ...s,
      status: "loading",
      errorMessage: null,
      errorCode: null,
    }));

    let cancelled = false;

    loadPrecomputeData<T>(input).then((result) => {
      if (!cancelled) setState(result);
    });

    return () => {
      cancelled = true;
    };
  }, [input.dataUrl, input.expectedGridHash, input.enabled]);

  const retry = useCallback(() => {
    setState((s) => ({
      ...s,
      status: "loading",
      errorMessage: null,
      errorCode: null,
    }));

    loadPrecomputeData<T>(input).then(setState);
  }, [input.dataUrl, input.expectedGridHash]);

  return { ...state, retry };
}

// ─── 向后兼容导出（ANL-01/ANL-02 迁移期间使用）──────

export { getCachedData as getPrecomputeData, setCachedData as setPrecomputeData };
