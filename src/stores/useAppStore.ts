import { create } from "zustand";
import type { AppMode, DeviceType, LoadingState, ModeDefinition } from "@/shared/types";
import { MODE_REGISTRY } from "@/shared/types";

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

  // ── Actions ──
  setMode: (newMode: AppMode) => void;
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

  setMode: (newMode) => {
    const { activeMode } = get();
    // 幂等：相同模式不触发
    if (newMode === activeMode) return;

    // 模式名有效性校验
    if (!MODE_REGISTRY.some((m) => m.id === newMode)) {
      console.warn(`[SIM-03] 非法 mode 值: ${newMode}`);
      return;
    }

    console.info("mode_switch", {
      from: activeMode,
      to: newMode,
      timestamp: Date.now(),
    });

    set({ previousMode: activeMode, activeMode: newMode });
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
