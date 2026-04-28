/**
 * SYS-02 运行时异常处理模块的公共接口。
 * 所有消费模块（ANL-01~04、SIM-01、LAB-03 等）从此文件导入。
 */

// ---- Toast 通知 ----
export { useToast } from "./hooks/useToast";
export { notify } from "./notify";

// ---- 错误翻译 ----
export { translateError, inferErrorCodeFromMessage } from "./error-dictionary";

// ---- 后台检测 ----
export { useVisibilityChange } from "./hooks/useVisibilityChange";
export { useAutoPause } from "./hooks/useAutoPause";

// ---- 长运行降级 ----
export { useLongRunningDetector } from "./hooks/useLongRunningDetector";

// ---- Worker 崩溃恢复 ----
export { useWorkerRecovery } from "./hooks/useWorkerRecovery";

// ---- 类型导出 ----
export type {
  ErrorCode,
  ToastInput,
  ToastFunction,
  TranslateErrorInput,
  TranslateErrorOutput,
  VisibilityState,
  UseVisibilityChangeOptions,
  WorkerRecoverConfig,
} from "./types";

export { LONG_RUNNING_CONFIG } from "./constants";

// ---- INF-01 桥接初始化 ----
import { inferErrorCodeFromMessage, translateError } from "./error-dictionary";
import { notify } from "./notify";

/**
 * 接收 INF-01 的全局错误捕获回调，自动翻译并 Toast。
 * 在 main.tsx 中通过 ObservabilityCoordinator.init 的第二个参数传入。
 */
export function handleGlobalErrors(errors: string[]): void {
  if (!errors.length) return;
  const latest = errors[errors.length - 1]!;
  // 解析时间戳前缀 `[ISO] message`
  const message = latest.replace(/^\[.*?\]\s*/, "");
  const code = inferErrorCodeFromMessage(message);
  const translated = translateError({ code, originalMessage: message });

  notify({
    title: translated.message.split("：")[0] ?? translated.message,
    description: translated.message.includes("：")
      ? translated.message.slice(translated.message.indexOf("：") + 1)
      : undefined,
    variant: translated.level,
    durationMs: translated.durationMs,
    action: translated.retryable
      ? {
          label: "重试",
          onClick: () => window.location.reload(),
        }
      : undefined,
    errorCode: code,
  });
}
