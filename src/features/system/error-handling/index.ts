/**
 * @deprecated 错误处理基础设施已迁至 shared/infrastructure/error-handling/
 * 请从 @/shared/infrastructure/error-handling 导入纯函数，
 * 从 @/shared/viewModel/hooks/ 导入 React Hook，
 * 从 @/shared/view/components/ToastProvider 导入 ToastProvider。
 */

// 纯函数和类型 → shared/infrastructure/error-handling/
export { notify } from "@/shared/infrastructure/error-handling/notify";
export { translateError, inferErrorCodeFromMessage } from "@/shared/infrastructure/error-handling/error-dictionary";
export { LONG_RUNNING_CONFIG } from "@/shared/infrastructure/error-handling/constants";
export type {
  ErrorCode,
  ToastInput,
  ToastFunction,
  TranslateErrorInput,
  TranslateErrorOutput,
  VisibilityState,
  UseVisibilityChangeOptions,
  WorkerRecoverConfig,
} from "@/shared/infrastructure/error-handling/types";

// React Hook → shared/viewModel/hooks/
export { useToast } from "@/shared/viewModel/hooks/useToast";
export { useVisibilityChange } from "@/shared/viewModel/hooks/useVisibilityChange";

// 这些 Hook 已迁至 simulation，但仍从此 barrel 向后兼容导出
export { useAutoPause } from "@/features/simulation/hooks/useAutoPause";
export { useLongRunningDetector } from "@/features/simulation/hooks/useLongRunningDetector";
export { useWorkerRecovery } from "@/features/simulation/hooks/useWorkerRecovery";

// handleGlobalErrors 仍然在此定义（综合使用上述导出）
import { inferErrorCodeFromMessage, translateError } from "@/shared/infrastructure/error-handling/error-dictionary";
import { notify } from "@/shared/infrastructure/error-handling/notify";

/**
 * 接收 INF-01 的全局错误捕获回调，自动翻译并 Toast。
 */
export function handleGlobalErrors(errors: string[]): void {
  if (!errors.length) return;
  const latest = errors[errors.length - 1]!;
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
