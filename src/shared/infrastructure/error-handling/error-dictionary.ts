import type { ErrorCode, ErrorTranslationEntry, TranslateErrorInput, TranslateErrorOutput } from "./types";

/**
 * 完整的错误码 → 中文消息映射表。
 */
const ERROR_DICTIONARY: Record<ErrorCode, ErrorTranslationEntry> = {
  // ---- Worker/仿真引擎 ----
  ENGINE_DIVERGED: {
    code: "ENGINE_DIVERGED",
    template: "积分已发散于 t={simTime}s，请减小步长或更换积分方法",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  ENGINE_INVALID_STATE: {
    code: "ENGINE_INVALID_STATE",
    template: "仿真引擎状态异常：{reason}",
    level: "error",
    durationMs: 5000,
    retryable: false,
  },
  ENGINE_INVALID_PARAM: {
    code: "ENGINE_INVALID_PARAM",
    template: "参数 {paramName} 非法，已拒绝本次更新",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },
  ENGINE_WORKER_CRASH: {
    code: "ENGINE_WORKER_CRASH",
    template: "仿真引擎意外崩溃，正在自动恢复（第 {attempt} 次）...",
    level: "error",
    durationMs: 0,
    retryable: true,
  },
  ENGINE_WORKER_TIMEOUT: {
    code: "ENGINE_WORKER_TIMEOUT",
    template: "仿真计算超时（{duration}s 未响应），已重置引擎",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  ENGINE_POOL_EXHAUSTED: {
    code: "ENGINE_POOL_EXHAUSTED",
    template: "传输缓冲区不足，仿真帧率临时降低",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },

  // ---- 预计算数据 ----
  PRECOMPUTE_FETCH_FAILED: {
    code: "PRECOMPUTE_FETCH_FAILED",
    template: "预计算数据加载失败：{reason}。已切换至离线模式，实时仿真仍可用",
    level: "warning",
    durationMs: 6000,
    retryable: true,
  },
  PRECOMPUTE_FORMAT_ERROR: {
    code: "PRECOMPUTE_FORMAT_ERROR",
    template: "预计算数据格式错误：{reason}。请尝试重新生成数据",
    level: "error",
    durationMs: 8000,
    retryable: false,
  },
  PRECOMPUTE_VERSION_MISMATCH: {
    code: "PRECOMPUTE_VERSION_MISMATCH",
    template: "预计算数据版本不匹配（期望 v{expected}，实际 v{actual}），渲染可能不准确",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PRECOMPUTE_GRID_INVALID: {
    code: "PRECOMPUTE_GRID_INVALID",
    template: "数据扫描范围无效：{reason}",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },

  // ---- Pyodide/用户沙箱 ----
  PYODIDE_LOAD_FAILED: {
    code: "PYODIDE_LOAD_FAILED",
    template: "Python 沙箱不可用：{reason}。请检查网络连接或刷新重试。实时仿真仍可用",
    level: "error",
    durationMs: 0,
    retryable: true,
  },
  PYODIDE_TIMEOUT: {
    code: "PYODIDE_TIMEOUT",
    template: "代码执行超时（>5s），已被中断。请检查循环或计算量",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PYODIDE_IMPORT_BLOCKED: {
    code: "PYODIDE_IMPORT_BLOCKED",
    template: "导入被阻止：{module} 不在允许列表中。仅支持 numpy、scipy.integrate、math",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PYODIDE_RUNTIME_ERROR: {
    code: "PYODIDE_RUNTIME_ERROR",
    template: "代码运行错误：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },

  // ---- WebGL/渲染 ----
  WEBGL_CONTEXT_LOST: {
    code: "WEBGL_CONTEXT_LOST",
    template: "3D 渲染上下文丢失。可能是 GPU 驱动问题或设备休眠。尝试恢复中...",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  WEBGL_NOT_SUPPORTED: {
    code: "WEBGL_NOT_SUPPORTED",
    template: "您的浏览器不支持 WebGL，3D 仿真不可用。请使用 Chrome、Firefox 或 Edge 最新版",
    level: "error",
    durationMs: 0,
    retryable: false,
  },

  // ---- 通用运行时 ----
  UNCAUGHT_JS_ERROR: {
    code: "UNCAUGHT_JS_ERROR",
    template: "发生了未预期的错误：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },
  UNHANDLED_PROMISE: {
    code: "UNHANDLED_PROMISE",
    template: "异步操作失败：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },
  STORAGE_QUOTA_EXCEEDED: {
    code: "STORAGE_QUOTA_EXCEEDED",
    template: "浏览器存储空间已满，快照保存失败。请清理旧快照后重试",
    level: "warning",
    durationMs: 6000,
    retryable: false,
  },
  CLIPBOARD_UNAVAILABLE: {
    code: "CLIPBOARD_UNAVAILABLE",
    template: "剪贴板不可用。请手动复制所选文本",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },
};

/**
 * 将 ErrorCode + context 翻译为中文消息 + Toast 配置。
 */
export function translateError(input: TranslateErrorInput): TranslateErrorOutput {
  let entry = ERROR_DICTIONARY[input.code];

  if (!entry) {
    entry = ERROR_DICTIONARY["UNCAUGHT_JS_ERROR"];
    console.warn(`[SYS-02] 未知错误码: ${input.code}，已降级翻译`);
  }

  let message = entry.template;
  if (input.context) {
    for (const [key, value] of Object.entries(input.context)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
  }

  if (input.originalMessage && input.originalMessage.length > 0) {
    message += ` (${input.originalMessage})`;
  }

  return {
    message,
    level: entry.level,
    durationMs: entry.durationMs,
    retryable: entry.retryable,
    code: input.code,
  };
}

/**
 * 全局错误消息 → ErrorCode 的正则匹配表。
 * 供 INF-01 回调自动翻译使用。
 */
export const INFRA_ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCode }> = [
  { pattern: /发散|diverg/i, code: "ENGINE_DIVERGED" },
  { pattern: /Worker.*崩溃|worker.*crash|engine.*crash/i, code: "ENGINE_WORKER_CRASH" },
  { pattern: /超时|timeout/i, code: "ENGINE_WORKER_TIMEOUT" },
  { pattern: /池耗尽|pool.*exhaust|buffer.*full/i, code: "ENGINE_POOL_EXHAUSTED" },
  { pattern: /预计算.*加载失败|precompute.*fetch.*fail/i, code: "PRECOMPUTE_FETCH_FAILED" },
  { pattern: /预计算.*格式|precompute.*format/i, code: "PRECOMPUTE_FORMAT_ERROR" },
  { pattern: /版本不匹配|version.*mismatch/i, code: "PRECOMPUTE_VERSION_MISMATCH" },
  { pattern: /Pyodide.*加载|pyodide.*load/i, code: "PYODIDE_LOAD_FAILED" },
  { pattern: /Pyodide.*超时|pyodide.*timeout/i, code: "PYODIDE_TIMEOUT" },
  { pattern: /导入.*阻止|import.*block/i, code: "PYODIDE_IMPORT_BLOCKED" },
  { pattern: /WebGL.*上下文丢失|webgl.*context.*lost/i, code: "WEBGL_CONTEXT_LOST" },
  { pattern: /WebGL.*不支持|webgl.*not.*support/i, code: "WEBGL_NOT_SUPPORTED" },
  { pattern: /存储.*已满|storage.*quota|quota.*exceed/i, code: "STORAGE_QUOTA_EXCEEDED" },
  { pattern: /剪贴板|clipboard/i, code: "CLIPBOARD_UNAVAILABLE" },
  { pattern: /未处理.*Promise|unhandled.*rejection/i, code: "UNHANDLED_PROMISE" },
];

/**
 * 将 INF-01 的原始错误消息字符串解析为 ErrorCode。
 */
export function inferErrorCodeFromMessage(message: string): ErrorCode {
  for (const { pattern, code } of INFRA_ERROR_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return "UNCAUGHT_JS_ERROR";
}
