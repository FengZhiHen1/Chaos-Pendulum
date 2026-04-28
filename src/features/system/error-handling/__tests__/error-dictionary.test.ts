import { describe, it, expect, vi } from "vitest";
import {
  translateError,
  inferErrorCodeFromMessage,
  INFRA_ERROR_PATTERNS,
} from "../error-dictionary";
import type { ErrorCode } from "../types";

describe("translateError", () => {
  it("ENGINE_DIVERGED：正确替换占位符", () => {
    const result = translateError({
      code: "ENGINE_DIVERGED",
      context: { simTime: "5.23" },
    });
    expect(result.message).toBe(
      "积分已发散于 t=5.23s，请减小步长或更换积分方法",
    );
    expect(result.level).toBe("error");
    expect(result.retryable).toBe(true);
    expect(result.durationMs).toBe(8000);
    expect(result.code).toBe("ENGINE_DIVERGED");
  });

  it("PRECOMPUTE_VERSION_MISMATCH：多占位符替换", () => {
    const result = translateError({
      code: "PRECOMPUTE_VERSION_MISMATCH",
      context: { expected: "2.0", actual: "1.5" },
    });
    expect(result.message).toBe(
      "预计算数据版本不匹配（期望 v2.0，实际 v1.5），渲染可能不准确",
    );
    expect(result.level).toBe("warning");
  });

  it("附加 originalMessage", () => {
    const result = translateError({
      code: "UNCAUGHT_JS_ERROR",
      context: { message: "出错了" },
      originalMessage: "TypeError: x is undefined",
    });
    expect(result.message).toBe(
      "发生了未预期的错误：出错了 (TypeError: x is undefined)",
    );
  });

  it("未知 code → 降级为 UNCAUGHT_JS_ERROR", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = translateError({
      code: "CUSTOM_NEW_ERROR" as ErrorCode,
    });
    // 未提供 context 时，模板中的 {message} 占位符保留原样
    expect(result.message).toBe("发生了未预期的错误：{message}");
    expect(result.level).toBe("error");
    expect(warnSpy).toHaveBeenCalledWith(
      "[SYS-02] 未知错误码: CUSTOM_NEW_ERROR，已降级翻译",
    );
    warnSpy.mockRestore();
  });

  it("未提供 context 的占位符保留原样", () => {
    const result = translateError({ code: "ENGINE_DIVERGED" });
    expect(result.message).toBe(
      "积分已发散于 t={simTime}s，请减小步长或更换积分方法",
    );
  });
});

describe("inferErrorCodeFromMessage", () => {
  it("匹配 '发散' → ENGINE_DIVERGED", () => {
    expect(inferErrorCodeFromMessage("Worker 积分发散于 t=5s")).toBe(
      "ENGINE_DIVERGED",
    );
  });

  it("匹配 'Worker 崩溃' → ENGINE_WORKER_CRASH", () => {
    expect(inferErrorCodeFromMessage("仿真引擎 Worker 崩溃")).toBe(
      "ENGINE_WORKER_CRASH",
    );
  });

  it("匹配 '超时' → ENGINE_WORKER_TIMEOUT", () => {
    expect(inferErrorCodeFromMessage("仿真计算超时")).toBe(
      "ENGINE_WORKER_TIMEOUT",
    );
  });

  it("无匹配 → UNCAUGHT_JS_ERROR", () => {
    expect(inferErrorCodeFromMessage("something completely random")).toBe(
      "UNCAUGHT_JS_ERROR",
    );
  });

  it("INFRA_ERROR_PATTERNS 全部正则可编译", () => {
    for (const { pattern } of INFRA_ERROR_PATTERNS) {
      expect(() => "test".match(pattern)).not.toThrow();
    }
  });
});
