import { create } from "zustand";
import type { AppMode, DeviceType, LoadingState, ModeDefinition } from "@/shared/domain/valueObjects";
import { MODE_REGISTRY } from "@/shared/domain/valueObjects";

interface DebugInfo {
  fps: number;
  workerLatencyMs: number[];
  errors: string[];
  pyodideLoadPct: number;
  /** FPS 历史时间线（最近 10s，每秒一个平均值） */
  fpsHistory: number[];
}

interface AppState {
  // ── 已有字段 ──
  deviceType: DeviceType;
  loadingState: LoadingState;
  debugInfo: DebugInfo;

  // ── SIM-03 新增 ──
  activeMode: AppMode;
  previousMode: AppMode | null;
  modeRegistry: ModeDefinition[];

  // ── SIM-03 导航锁定 ──
  isNavigationLocked: boolean;
  navigationLockReason: string;

  // ── Actions ──
  setMode: (newMode: AppMode) => void;
  lockNavigation: (reason: string) => void;
  unlockNavigation: () => void;
  setDeviceType: (type: DeviceType) => void;
  setLoadingState: (state: LoadingState) => void;
  updateDebugInfo: (patch: Partial<DebugInfo>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  deviceType: "desktop",
  loadingState: "loading",
  debugInfo: {
    fps: 0,
    workerLatencyMs: [],
    errors: [],
    pyodideLoadPct: 0,
    fpsHistory: [],
  },

  activeMode: "explore",
  previousMode: null,
  modeRegistry: MODE_REGISTRY,
  isNavigationLocked: false,
  navigationLockReason: "",

  setMode: (newMode) => {
    const { activeMode, isNavigationLocked, navigationLockReason } = get();
    // 幂等：相同模式不触发
    if (newMode === activeMode) return;

    // 模式名有效性校验
    if (!MODE_REGISTRY.some((m) => m.id === newMode)) {
      console.warn(`[SIM-03] 非法 mode 值: ${newMode}`);
      return;
    }

    // 导航锁检查：故事模式自动播放期间锁定
    if (isNavigationLocked) {
      console.warn(`[SIM-03] 导航已锁定(${navigationLockReason})，拒绝切换至 ${newMode}`);
      return;
    }

    console.info("mode_switch", {
      from: activeMode,
      to: newMode,
      timestamp: Date.now(),
    });

    set({ previousMode: activeMode, activeMode: newMode });
  },

  /** 锁定导航（故事模式调用）。阻止手动切换，显示脉冲动画引导。 */
  lockNavigation: (reason) => {
    console.info("navigation_locked", { reason, timestamp: Date.now() });
    set({ isNavigationLocked: true, navigationLockReason: reason });
  },

  /** 解锁导航。故事结束或用户打断后恢复。 */
  unlockNavigation: () => {
    console.info("navigation_unlocked", { timestamp: Date.now() });
    set({ isNavigationLocked: false, navigationLockReason: "" });
  },

  setDeviceType: (type) => {
    if (type !== "desktop" && type !== "tablet" && type !== "mobile") {
      console.warn(`[SYS-01] 非法 deviceType: ${type}`);
      return;
    }
    set({ deviceType: type });
  },
  setLoadingState: (state) => set({ loadingState: state }),
  updateDebugInfo: (patch) =>
    set((s) => ({ debugInfo: { ...s.debugInfo, ...patch } })),
}));
