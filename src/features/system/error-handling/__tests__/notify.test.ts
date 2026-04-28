import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast as sonnerToast } from "sonner";
import { notify, _resetNotifyState, markToastProviderMounted } from "../notify";

vi.mock("sonner");

describe("notify", () => {
  beforeEach(() => {
    _resetNotifyState();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Provider 未挂载时进入 pending 队列", () => {
    notify({ title: "消息1" });
    notify({ title: "消息2" });
    expect(sonnerToast.info).not.toHaveBeenCalled();
  });

  it("Provider 挂载后消费 pending 队列", () => {
    notify({ title: "消息1" });
    notify({ title: "消息2" });
    markToastProviderMounted();
    expect(sonnerToast.info).toHaveBeenCalledTimes(2);
  });

  it("pending 队列超过 10 条丢弃最旧", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    for (let i = 0; i < 12; i++) {
      notify({ title: `消息${i}` });
    }
    markToastProviderMounted();
    expect(sonnerToast.info).toHaveBeenCalledTimes(10);
    expect(debugSpy).toHaveBeenCalledWith(
      "[SYS-02] pendingToasts 队列已满，丢弃最旧消息",
    );
    debugSpy.mockRestore();
  });

  it("相同 title+variant 在 2s 内去重并附加计数", () => {
    markToastProviderMounted();
    notify({ title: "积分已发散", variant: "error" });
    notify({ title: "积分已发散", variant: "error" });
    notify({ title: "积分已发散", variant: "error" });

    // 三次调用均触发 sonner（同 id 更新），但对外只应产生一个 Toast
    expect(sonnerToast.error).toHaveBeenCalledTimes(3);
    // 第三次调用时 description 应包含 (×3)
    const lastCall = sonnerToast.error.mock.calls.at(-1);
    expect(lastCall?.[1]?.description).toContain("(×3)");
    // 三次调用使用同一个 toast id
    const ids = sonnerToast.error.mock.calls.map((c) => c[1]?.id);
    expect(new Set(ids).size).toBe(1);
  });

  it("超过 2s 后相同 title+variant 创建新 Toast", () => {
    markToastProviderMounted();
    notify({ title: "积分已发散", variant: "error" });
    vi.advanceTimersByTime(3000);
    notify({ title: "积分已发散", variant: "error" });

    // 两次独立调用，id 不同
    expect(sonnerToast.error).toHaveBeenCalledTimes(2);
    const firstId = sonnerToast.error.mock.calls[0]![1]!.id;
    const secondId = sonnerToast.error.mock.calls[1]![1]!.id;
    expect(firstId).not.toBe(secondId);
  });

  it("ErrorCode 级别 5s 节流", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    markToastProviderMounted();
    notify({ title: "A", variant: "error", errorCode: "ENGINE_DIVERGED" });
    notify({ title: "B", variant: "error", errorCode: "ENGINE_DIVERGED" });

    // 第一次调用创建 Toast，第二次被节流
    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      "[SYS-02] ErrorCode ENGINE_DIVERGED 在 5s 内已被节流",
    );
    debugSpy.mockRestore();
  });

  it("durationMs = 0 时传给 sonner 的 duration 为 Infinity", () => {
    markToastProviderMounted();
    notify({ title: "持久提示", durationMs: 0 });
    expect(sonnerToast.info).toHaveBeenCalledWith("持久提示", {
      id: expect.any(String),
      description: undefined,
      duration: Infinity,
      action: undefined,
    });
  });
});
