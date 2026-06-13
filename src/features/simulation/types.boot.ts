// ─── 启动配置 ────────────────────────────────────

export interface BootConfig {
  /** 是否启用 Pyodide 预加载。默认 true。 */
  enablePyodide?: boolean;
  /** 是否启用预计算数据预加载（后台 fetch）。默认 true。 */
  enablePrecomputePrefetch?: boolean;
  /** 是否在启动时显示混沌名言轮播。默认 true。 */
  showQuotes?: boolean;
  /** Pyodide 加载策略。默认 "lazy"。 */
  pyodideLoadStrategy?: "lazy" | "eager";
  /** Worker 初始化超时时间（毫秒）。默认 3000。 */
  workerTimeoutMs?: number;
  /** 加载完成后淡入过渡的持续时间（毫秒）。默认 600。 */
  transitionDurationMs?: number;
}

// ─── 启动阶段 ────────────────────────────────────

export type BootPhase =
  | "idle"
  | "mounting"
  | "worker_init"
  | "pyodide_local_check"
  | "pyodide_indexeddb_check"
  | "pyodide_downloading"
  | "pyodide_initializing"
  | "precompute_fetching"
  | "finalizing"
  | "ready"
  | "error";

/** 各阶段权重（影响总体进度百分比） */
export const BOOT_PHASE_WEIGHTS: Record<BootPhase, number> = {
  idle: 0,
  mounting: 0.05,
  worker_init: 0.10,
  pyodide_local_check: 0.02,
  pyodide_indexeddb_check: 0.03,
  pyodide_downloading: 0.60,
  pyodide_initializing: 0.10,
  precompute_fetching: 0.05,
  finalizing: 0.05,
  ready: 0,
  error: 0,
};

/** 启动进度快照 */
export interface BootProgress {
  phase: BootPhase;
  phaseProgress: number;
  overallProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  etaSeconds: number;
  description: string;
}

export const DEFAULT_BOOT_PROGRESS: BootProgress = {
  phase: "idle",
  phaseProgress: 0,
  overallProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  etaSeconds: -1,
  description: "准备启动...",
};

// ─── Pyodide 缓存 ────────────────────────────────

export interface PyodideCacheEntry {
  resourceKey: string;
  data: ArrayBuffer;
  size: number;
  cachedAt: string;
  version: string;
  mimeType: string;
}

export const PYODIDE_CACHE_DB_NAME = "chaos-pendulum-cache";
export const PYODIDE_CACHE_DB_VERSION = 1;
export const PYODIDE_CACHE_STORE = "pyodide-cache";
export const PYODIDE_VERSION = "0.26.1";

// ─── 错误类型 ────────────────────────────────────

export type BootErrorType = "worker" | "pyodide" | "unknown";

export interface BootError {
  type: BootErrorType;
  message: string;
  retryable: boolean;
}
