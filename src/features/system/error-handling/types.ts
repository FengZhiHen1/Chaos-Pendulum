/**
 * SYS-02 运行时异常处理 — 类型定义
 */

// ===== ErrorCode =====

export type ErrorCode =
  // Worker/仿真引擎 (SIM-01)
  | "ENGINE_DIVERGED"
  | "ENGINE_INVALID_STATE"
  | "ENGINE_INVALID_PARAM"
  | "ENGINE_WORKER_CRASH"
  | "ENGINE_WORKER_TIMEOUT"
  | "ENGINE_POOL_EXHAUSTED"

  // 预计算数据 (SYS-03 / ANL-01~04)
  | "PRECOMPUTE_FETCH_FAILED"
  | "PRECOMPUTE_FORMAT_ERROR"
  | "PRECOMPUTE_VERSION_MISMATCH"
  | "PRECOMPUTE_GRID_INVALID"

  // Pyodide/用户沙箱 (LAB-03)
  | "PYODIDE_LOAD_FAILED"
  | "PYODIDE_TIMEOUT"
  | "PYODIDE_IMPORT_BLOCKED"
  | "PYODIDE_RUNTIME_ERROR"

  // WebGL/渲染
  | "WEBGL_CONTEXT_LOST"
  | "WEBGL_NOT_SUPPORTED"

  // 通用运行时
  | "UNCAUGHT_JS_ERROR"
  | "UNHANDLED_PROMISE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "CLIPBOARD_UNAVAILABLE";

// ===== ToastInput =====

export interface ToastInput {
  title: string;
  description?: string;
  variant?: "error" | "warning" | "info" | "success" | "loading";
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  id?: string;
  /** 内部用于 ErrorCode 级别节流 */
  errorCode?: string;
}

export type ToastFunction = (input: ToastInput) => void;

// ===== TranslateError =====

export interface TranslateErrorInput {
  code: ErrorCode;
  context?: Record<string, string>;
  originalMessage?: string;
}

export interface TranslateErrorOutput {
  message: string;
  level: "error" | "warning" | "info" | "success";
  durationMs: number;
  retryable: boolean;
  code: ErrorCode;
}

export interface ErrorTranslationEntry {
  code: ErrorCode;
  template: string;
  level: "error" | "warning" | "info" | "success";
  durationMs: number;
  retryable: boolean;
}

// ===== VisibilityChange =====

export interface UseVisibilityChangeOptions {
  onHidden?: () => void;
  onVisible?: () => void;
  enabled?: boolean;
}

export interface VisibilityState {
  isVisible: boolean;
  wasHidden: boolean;
}

// ===== WorkerRecoverConfig =====

export interface WorkerRecoverConfig {
  maxAutoRecovery: number;
  retryDelayMs: number;
  autoResumeAfterRecovery: boolean;
}
