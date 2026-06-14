/**
 * 模块: analyze.infrastructure.repositories.PrecomputeDataRepo
 * 职责: 实现 IPrecomputePipeline 端口，包装 shared/infrastructure/storage/precomputeLoader
 *       提供预计算数据的缓存检查、加载、LRU 清理与状态查询。
 * 边界:
 *   - implements IPrecomputePipeline
 *   - 可依赖: shared/infrastructure/storage/*, analyze/contracts
 *   - 禁止依赖: ViewModel / View 层
 */

import { loadPrecomputeData } from "@/shared/infrastructure/storage/precomputeLoader";
import { openDB, getStore } from "@/shared/infrastructure/storage/indexed-db";
import type {
  PrecomputeDataType,
  IPrecomputeDataState,
  IPrecomputePipeline,
} from "@/features/analyze/contracts";
import { PrecomputeLoadError, CacheError } from "@/features/analyze/contracts";

const DB_NAME = "chaos-pendulum-cache";
const DB_VERSION = 1;
const STORE_NAME = "precompute";

interface ExtractedLoadParams {
  readonly dataUrl: string;
  readonly gridHash: string;
  readonly expectedSolverVersion: string | undefined;
  readonly fetchTimeoutMs: number | undefined;
  readonly maxRetries: number | undefined;
  readonly retryBaseMs: number | undefined;
}

export class PrecomputeDataRepo implements IPrecomputePipeline {
  private readonly stateMap = new Map<PrecomputeDataType, IPrecomputeDataState>();
  private cancelled = false;

  constructor() {
    for (const type of ["lyapunov", "bifurcation"] as PrecomputeDataType[]) {
      this.stateMap.set(type, this.makeIdleState(type));
    }
  }

  async load(
    type: PrecomputeDataType,
    params: Record<string, number | string>,
  ): Promise<ArrayBuffer> {
    if (this.cancelled) {
      throw new PrecomputeLoadError(type, "加载已被取消");
    }

    const {
      dataUrl,
      gridHash,
      expectedSolverVersion,
      fetchTimeoutMs,
      maxRetries,
      retryBaseMs,
    } = this.extractParams(params);

    this.updateState(type, { status: "loading", error: null, progress: 0 });

    try {
      const result = await loadPrecomputeData<unknown>(
        {
          dataType: type,
          dataUrl,
          expectedGridHash: gridHash,
          expectedType: type,
          expectedSolverVersion,
          fetchTimeoutMs,
          maxRetries,
          retryBaseMs,
        },
        undefined,
      );

      if (result.status === "error") {
        this.updateState(type, {
          status: "error",
          error: result.errorMessage ?? "未知错误",
          progress: 0,
        });
        throw new PrecomputeLoadError(type, result.errorMessage ?? "未知错误");
      }

      const buffer = this.serializeToBuffer(result.data);
      this.updateState(type, {
        status: "ready",
        error: null,
        progress: 1,
        cachedAt: new Date().toISOString(),
      });
      return buffer;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateState(type, { status: "error", error: message, progress: 0 });
      throw new PrecomputeLoadError(type, message);
    }
  }

  async checkCache(type: PrecomputeDataType, gridHash: string): Promise<boolean> {
    const db = await this.openCacheDB();
    if (!db) return false;

    try {
      const entry = await getStore<{ cacheKey: string }>(db, STORE_NAME, `${type}-${gridHash}`);
      return entry != null;
    } catch {
      return false;
    }
  }

  async evictLRU(maxEntries: number): Promise<void> {
    const db = await this.openCacheDB();
    if (!db) return;

    try {
      const entries = await this.getAllEntries(db);
      if (entries.length <= maxEntries) return;

      entries.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
      const toDelete = entries.slice(0, entries.length - maxEntries);

      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const entry of toDelete) {
        store.delete(entry.cacheKey);
      }
    } catch (err) {
      throw new CacheError(
        "evictLRU",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  getState(type: PrecomputeDataType): IPrecomputeDataState {
    return this.stateMap.get(type) ?? this.makeIdleState(type);
  }

  cancel(): void {
    this.cancelled = true;
    for (const [type, state] of this.stateMap) {
      if (state.status === "loading") {
        this.updateState(type, { status: "idle", error: null, progress: 0 });
      }
    }
  }

  private extractParams(params: Record<string, number | string>): ExtractedLoadParams {
    const dataUrl = typeof params.dataUrl === "string" ? params.dataUrl : "";
    const gridHash = typeof params.gridHash === "string" ? params.gridHash : "";

    if (!dataUrl) {
      throw new PrecomputeLoadError("unknown", "缺少 params.dataUrl");
    }
    if (!gridHash) {
      throw new PrecomputeLoadError("unknown", "缺少 params.gridHash");
    }

    return {
      dataUrl,
      gridHash,
      expectedSolverVersion: typeof params.expectedSolverVersion === "string"
        ? params.expectedSolverVersion
        : undefined,
      fetchTimeoutMs: typeof params.fetchTimeoutMs === "number" ? params.fetchTimeoutMs : undefined,
      maxRetries: typeof params.maxRetries === "number" ? params.maxRetries : undefined,
      retryBaseMs: typeof params.retryBaseMs === "number" ? params.retryBaseMs : undefined,
    };
  }

  private serializeToBuffer(data: unknown): ArrayBuffer {
    const text = JSON.stringify(data);
    const encoder = new TextEncoder();
    return encoder.encode(text).buffer;
  }

  private async openCacheDB(): Promise<IDBDatabase | null> {
    try {
      return await openDB(DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        }
      });
    } catch {
      return null;
    }
  }

  private async getAllEntries(
    db: IDBDatabase,
  ): Promise<Array<{ cacheKey: string; cachedAt: string }>> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result as Array<{ cacheKey: string; cachedAt: string }>);
      req.onerror = () => reject(req.error);
    });
  }

  private makeIdleState(type: PrecomputeDataType): IPrecomputeDataState {
    return {
      type,
      status: "idle",
      error: null,
      progress: 0,
      cachedAt: null,
    };
  }

  private updateState(
    type: PrecomputeDataType,
    patch: Partial<IPrecomputeDataState>,
  ): void {
    const prev = this.stateMap.get(type) ?? this.makeIdleState(type);
    this.stateMap.set(type, { ...prev, ...patch });
  }
}
