import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../useAppStore";
import { MODE_REGISTRY } from "@/shared/types";
import type { AppMode } from "@/shared/types";

function resetStore(): void {
  useAppStore.setState({
    activeMode: "explore",
    previousMode: null,
    deviceType: "desktop",
    loadingState: "ready",
  });
}

describe("useAppStore", () => {
  beforeEach(resetStore);

  // ── 正向测试 1：正常模式切换 ──────────────────

  it("setMode 切换到新模式并保存 previousMode", () => {
    const store = useAppStore.getState();
    store.setMode("analyze");
    const s = useAppStore.getState();
    expect(s.activeMode).toBe("analyze");
    expect(s.previousMode).toBe("explore");
  });

  it("setMode 相同模式幂等——不触发变更", () => {
    const store = useAppStore.getState();
    store.setMode("explore"); // 已经是 explore
    const s = useAppStore.getState();
    expect(s.activeMode).toBe("explore");
    expect(s.previousMode).toBeNull();
  });

  it("链式切换正确追踪 previousMode", () => {
    const store = useAppStore.getState();
    store.setMode("lab");
    expect(useAppStore.getState().previousMode).toBe("explore");
    store.setMode("story");
    expect(useAppStore.getState().previousMode).toBe("lab");
    expect(useAppStore.getState().activeMode).toBe("story");
  });

  // ── 正向测试 2：模式注册表 ──────────────────

  it("modeRegistry 包含 4 个模式", () => {
    const s = useAppStore.getState();
    expect(s.modeRegistry).toHaveLength(4);
    const ids = s.modeRegistry.map((m) => m.id);
    expect(ids).toEqual(["explore", "analyze", "lab", "story"]);
  });

  it("每个模式定义包含必要字段", () => {
    for (const m of MODE_REGISTRY) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.shortLabel).toBeTruthy();
      expect(["Compass", "BarChart3", "FlaskConical", "Play"]).toContain(m.iconName);
      expect(["1", "2", "3", "4"]).toContain(m.shortcut);
      expect(m.tooltip).toBeTruthy();
    }
  });

  // ── 正向测试 3：默认值 ──────────────────────

  it("默认 activeMode 为 explore", () => {
    expect(useAppStore.getState().activeMode).toBe("explore");
  });

  it("默认 previousMode 为 null", () => {
    expect(useAppStore.getState().previousMode).toBeNull();
  });

  // ── 异常测试 1：非法模式 ────────────────────

  it("非法 mode 值被忽略", () => {
    const store = useAppStore.getState();
    const origMode = store.activeMode;
    const origPrev = store.previousMode;
    store.setMode("invalid" as AppMode);
    const s = useAppStore.getState();
    expect(s.activeMode).toBe(origMode);
    expect(s.previousMode).toBe(origPrev);
  });

  // ── 键盘快捷键映射 ──────────────────────────

  it("数字键 1-4 映射到正确模式", () => {
    const shortcutMap: Record<string, AppMode> = {
      "1": "explore",
      "2": "analyze",
      "3": "lab",
      "4": "story",
    };
    expect(shortcutMap["1"]).toBe("explore");
    expect(shortcutMap["2"]).toBe("analyze");
    expect(shortcutMap["3"]).toBe("lab");
    expect(shortcutMap["4"]).toBe("story");
  });

  // ── deviceType 保持兼容 ─────────────────────

  it("deviceType 默认值为 desktop", () => {
    expect(useAppStore.getState().deviceType).toBe("desktop");
  });

  it("setDeviceType 正常工作", () => {
    useAppStore.getState().setDeviceType("mobile");
    expect(useAppStore.getState().deviceType).toBe("mobile");
  });
});
