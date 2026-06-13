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
