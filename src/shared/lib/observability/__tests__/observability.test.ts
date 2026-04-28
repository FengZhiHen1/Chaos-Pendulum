import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FPSTracker,
  measure,
  initErrorCapture,
  getErrors,
  clearErrors,
  ObservabilityCoordinator,
} from "@/shared/lib/observability";

// ─── FPSTracker ────────────────────────────────

describe("FPSTracker", () => {
  it("空样本时 average 返回 0", () => {
    const tracker = new FPSTracker();
    expect(tracker.average).toBe(0);
  });

  it("tick 后计算正确 FPS", () => {
    const tracker = new FPSTracker(60);
    tracker.tick(1000);
    tracker.tick(1016.667); // ~60fps
    expect(tracker.average).toBeCloseTo(60, 0);
  });

  it("reset 清空样本", () => {
    const tracker = new FPSTracker();
    tracker.tick(0);
    tracker.tick(16.667);
    tracker.reset();
    expect(tracker.average).toBe(0);
  });
});

// ─── measure ───────────────────────────────────

describe("measure", () => {
  let originalMark: typeof performance.mark;
  let originalMeasure: typeof performance.measure;
  let originalClearMarks: typeof performance.clearMarks;

  beforeEach(() => {
    originalMark = performance.mark;
    originalMeasure = performance.measure;
    originalClearMarks = performance.clearMarks;
  });

  afterEach(() => {
    performance.mark = originalMark;
    performance.measure = originalMeasure;
    performance.clearMarks = originalClearMarks;
  });

  it("正常测量返回正耗时", () => {
    const duration = measure("test", () => {
      /* no-op */
    });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("performance.mark 不可用时返回 -1", () => {
    performance.mark = undefined as any;
    const duration = measure("test", () => {});
    expect(duration).toBe(-1);
  });

  it("fn 抛出异常时 mark 仍被清理", () => {
    const clearSpy = vi.fn();
    performance.clearMarks = clearSpy;

    try {
      measure("test-throw", () => {
        throw new Error("boom");
      });
    } catch {
      /* expected */
    }

    expect(clearSpy).toHaveBeenCalledWith("test-throw-start");
    expect(clearSpy).toHaveBeenCalledWith("test-throw-end");
  });
});

// ─── initErrorCapture ──────────────────────────

describe("initErrorCapture", () => {
  let prevOnError: typeof window.onerror;
  let prevOnUnhandledRejection: typeof window.onunhandledrejection;

  beforeEach(() => {
    prevOnError = window.onerror;
    prevOnUnhandledRejection = window.onunhandledrejection;
    clearErrors();
  });

  afterEach(() => {
    window.onerror = prevOnError;
    window.onunhandledrejection = prevOnUnhandledRejection;
  });

  it("捕获同步异常并回调", () => {
    const onError = vi.fn();
    initErrorCapture(onError);

    window.onerror!("msg", "file.js", 1, 1, new Error("test error"));

    expect(onError).toHaveBeenCalledTimes(1);
    const errors = onError.mock.calls[0]![0] as string[];
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("test error");
  });

  it("捕获未处理的 Promise rejection", () => {
    const onError = vi.fn();
    initErrorCapture(onError);

    const event = new Event("unhandledrejection") as any;
    event.reason = new Error("rejected");
    window.onunhandledrejection!(event);

    expect(onError).toHaveBeenCalledTimes(1);
    const errors = onError.mock.calls[0]![0] as string[];
    expect(errors[0]).toContain("rejected");
  });

  it("链式调用原有钩子", () => {
    const oldOnError = vi.fn();
    window.onerror = oldOnError;

    const onError = vi.fn();
    initErrorCapture(onError);

    window.onerror!("msg", "file.js", 1, 1, new Error("test"));
    expect(oldOnError).toHaveBeenCalledTimes(1);
  });

  it("回调抛错时不无限递归", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn(() => {
      throw new Error("callback boom");
    });
    initErrorCapture(onError);

    window.onerror!("msg", "file.js", 1, 1, new Error("real error"));

    // 回调被调用一次，抛错后不再递归调用
    expect(onError).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Observability] 错误回调异常:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("错误日志环形缓冲超过 50 条时丢弃最旧", () => {
    const onError = vi.fn();
    initErrorCapture(onError);

    for (let i = 0; i < 55; i++) {
      window.onerror!(`msg-${i}`, "file.js", 1, 1, new Error(`e${i}`));
    }

    const errors = getErrors();
    expect(errors.length).toBe(50);
    expect(errors[0]).not.toContain("e0");
    expect(errors[49]).toContain("e54");
  });
});

// ─── ObservabilityCoordinator ──────────────────

describe("ObservabilityCoordinator", () => {
  let coordinator: ObservabilityCoordinator;
  let rafCallbacks: Array<(now: number) => void> = [];
  let rafId = 0;

  beforeEach(() => {
    coordinator = new ObservabilityCoordinator({
      fpsStoreThrottleMs: 100,
      workerLatencyBatchSize: 3,
    });
    rafCallbacks = [];
    rafId = 0;

    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    coordinator.dispose();
    vi.unstubAllGlobals();
  });

  it("init 后 FPS 写入 store", () => {
    const updates: Array<Record<string, unknown>> = [];
    coordinator.init((patch) => updates.push(patch));

    // 模拟 rAF 循环运行超过 throttle 间隔
    const loop = rafCallbacks[0];
    loop(0);
    loop(50);
    loop(150); // 超过 100ms，触发 store 写入

    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(typeof updates[0]!.fps).toBe("number");
    expect(Array.isArray(updates[0]!.fpsHistory)).toBe(true);
  });

  it("重复 init 不重复注册", () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    coordinator.init(() => {});
    coordinator.init(() => {}); // 重复调用

    coordinator.dispose();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("recordWorkerLatency 批量写入 store", () => {
    const updates: Array<Record<string, unknown>> = [];
    coordinator.init((patch) => updates.push(patch));

    coordinator.recordWorkerLatency(1.0);
    coordinator.recordWorkerLatency(2.0);
    expect(updates.filter((u) => "workerLatencyMs" in u).length).toBe(0);

    coordinator.recordWorkerLatency(3.0); // 第 3 次，达到 batchSize
    const latencyUpdates = updates.filter((u) => "workerLatencyMs" in u);
    expect(latencyUpdates.length).toBe(1);
    expect((latencyUpdates[0]!.workerLatencyMs as number[]).length).toBe(3);
  });

  it("updatePyodideProgress 写入 store", () => {
    const updates: Array<Record<string, unknown>> = [];
    coordinator.init((patch) => updates.push(patch));

    coordinator.updatePyodideProgress(50);
    expect(updates.some((u) => u.pyodideLoadPct === 50)).toBe(true);
  });

  it("reset 清空所有 tracker", () => {
    coordinator.init(() => {});
    coordinator.recordWorkerLatency(1.0);
    coordinator.recordWorkerLatency(2.0);
    coordinator.recordWorkerLatency(3.0);

    coordinator.reset();
    coordinator.dispose(); // 允许重新 init

    const updates: Array<Record<string, unknown>> = [];
    coordinator.init((patch) => updates.push(patch));
    coordinator.recordWorkerLatency(4.0);
    coordinator.recordWorkerLatency(5.0);
    coordinator.recordWorkerLatency(6.0);

    const latencyUpdates = updates.filter((u) => "workerLatencyMs" in u);
    expect(latencyUpdates.length).toBe(1);
    expect((latencyUpdates[0]!.workerLatencyMs as number[]).length).toBe(3);
    expect(latencyUpdates[0]!.workerLatencyMs).toContain(6.0);
    expect(latencyUpdates[0]!.workerLatencyMs).not.toContain(1.0);
  });

  it("dispose 取消 rAF 循环", () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    coordinator.init(() => {});
    coordinator.dispose();

    expect(cancelSpy).toHaveBeenCalled();
  });
});
