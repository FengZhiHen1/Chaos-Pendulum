/**
 * 预计算数据加载器（纯基础设施层）。
 *
 * 职责：从 IndexedDB 缓存或网络加载 JSON 数据，校验元数据，管理 LRU 缓存淘汰。
 * 不依赖任何 feature 模块，不直接调用 notify/translateError——改为回调通知。
 *
 * 使用方（analyze feature）负责将加载结果转换为 UI 状态和用户通知。
 */

import { openDB, getStore, putStore } from "./indexed-db";

// ═══════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════

/** 加载器输入参数 */
export interface PrecomputeLoadInput {
  /** 缓存键前缀，如 "lyapunov_max" */
  dataType: string;
  /** fetch URL */
  dataUrl: string;
  /** 期望的参数网格哈希（16 字符 hex） */
  expectedGridHash: string;
  /** 期望的 metadata.type */
  expectedType: string;
  /** 期望的 solverVersion，默认 "2.0.0" */
  expectedSolverVersion?: string;
  /** fetch 超时时间（毫秒），默认 10000 */
  fetchTimeoutMs?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试退避基础时间（毫秒），默认 1000 */
  retryBaseMs?: number;
}

/** 加载器输出结果 */
export interface PrecomputeLoadResult<T = unknown> {
  status: "ready" | "error";
  data: T | null;
  errorMessage: string | null;
  errorCode: string | null;
  source: "cache" | "network" | null;
  /** 非致命警告（如版本不匹配），由调用方决定如何呈现 */
  warning?: { code: string; message: string } | null;
}

/** 缓存条目（泛型） */
export interface PrecomputeCacheEntry<T = unknown> {
  cacheKey: string;
  data: T;
  cachedAt: string;
  size: number;
  hitCount: number;
}

/** 非致命通知回调 */
export type PrecomputeNoticeHandler = (warning: { code: string; message: string }) => void;

// ═══════════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════════

const DB_NAME = "chaos-pendulum-cache";
const DB_VERSION = 1;
const STORE_NAME = "precompute";
const MAX_ENTRIES = 10;
const DEFAULT_SOLVER_VERSION = "2.0.0";
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1000;

// ═══════════════════════════════════════════════════════════════════
// IndexedDB 连接管理
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// 缓存读写
// ═══════════════════════════════════════════════════════════════════

async function getCachedEntry<T>(
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

async function setCachedEntry<T>(
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
      try {
        await evictLRU(5);
        await putStore(db, STORE_NAME, entry);
      } catch {
        dbAvailable = false;
        console.warn("[precomputeLoader] IndexedDB 写入失败，已切换至无缓存模式");
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

/** 清除所有预计算缓存 */
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

// ═══════════════════════════════════════════════════════════════════
// JSON 清洗：处理 Python json.dumps 的 NaN/Infinity token
// ═══════════════════════════════════════════════════════════════════

function sanitizeJsonText(rawText: string): string {
  return rawText
    .replace(/\bNaN\b/g, "null")
    .replace(/-?Infinity/g, "null");
}

// ═══════════════════════════════════════════════════════════════════
// 主加载函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 加载预计算数据：IndexedDB 缓存 → 网络 fetch（含重试）→ 校验 → 回填缓存。
 *
 * 此函数不依赖 React 或任何 feature 模块。
 * 非致命警告（如 solverVersion 不匹配）通过 onNotice 回调通知调用方。
 *
 * @returns 加载结果对象——调用方负责将其转换为 UI 状态。
 */
export async function loadPrecomputeData<T = unknown>(
  input: PrecomputeLoadInput,
  onNotice?: PrecomputeNoticeHandler,
): Promise<PrecomputeLoadResult<T>> {
  const {
    dataType,
    dataUrl,
    expectedGridHash,
    expectedType,
    expectedSolverVersion = DEFAULT_SOLVER_VERSION,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
  } = input;

  const cacheKey = `${dataType}-${expectedGridHash}`;

  // 1. 尝试 IndexedDB 缓存
  try {
    const cached = await getCachedEntry<T>(cacheKey);
    if (cached) {
      return {
        status: "ready",
        data: cached.data as T,
        errorMessage: null,
        errorCode: null,
        source: "cache",
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

      const rawText = await response.text();
      const cleanText = sanitizeJsonText(rawText);
      const json = JSON.parse(cleanText);

      // 3. 校验 metadata
      if (json.metadata?.type !== expectedType) {
        return {
          status: "error",
          data: null,
          errorMessage: `期望类型 ${expectedType}，实际 ${json.metadata?.type}`,
          errorCode: "PRECOMPUTE_FORMAT_ERROR",
          source: null,
        };
      }
      if (json.metadata?.gridHash !== expectedGridHash) {
        return {
          status: "error",
          data: null,
          errorMessage: `gridHash 不匹配：期望 ${expectedGridHash}，实际 ${json.metadata?.gridHash}`,
          errorCode: "PRECOMPUTE_FORMAT_ERROR",
          source: null,
        };
      }

      // 4. 版本校验（不阻止加载，仅触发回调）
      if (
        json.metadata?.solverVersion &&
        json.metadata.solverVersion !== expectedSolverVersion
      ) {
        onNotice?.({
          code: "PRECOMPUTE_VERSION_MISMATCH",
          message: `求解器版本不匹配：期望 ${expectedSolverVersion}，实际 ${json.metadata.solverVersion}`,
        });
      }

      // 5. 写入缓存
      try {
        await setCachedEntry(cacheKey, json);
      } catch {
        /* IndexedDB 不可用，静默跳过 */
      }

      return {
        status: "ready",
        data: json as T,
        errorMessage: null,
        errorCode: null,
        source: "network",
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
  return {
    status: "error",
    data: null,
    errorMessage: lastError?.message ?? "未知错误",
    errorCode: "PRECOMPUTE_FETCH_FAILED",
    source: null,
  };
}
