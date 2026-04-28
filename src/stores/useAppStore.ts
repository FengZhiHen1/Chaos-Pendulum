import { create } from "zustand";
import type { AppMode, DeviceType, LoadingState } from "@/shared/types";

interface DebugInfo {
  fps: number;
  workerLatencyMs: number[];
  errors: string[];
  pyodideLoadPct: number;
}

interface AppState {
  currentMode: AppMode;
  deviceType: DeviceType;
  loadingState: LoadingState;
  debugInfo: DebugInfo;

  setMode: (mode: AppMode) => void;
  setDeviceType: (type: DeviceType) => void;
  setLoadingState: (state: LoadingState) => void;
  updateDebugInfo: (patch: Partial<DebugInfo>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentMode: "explore",
  deviceType: "desktop",
  loadingState: "loading",
  debugInfo: {
    fps: 0,
    workerLatencyMs: [],
    errors: [],
    pyodideLoadPct: 0,
  },

  setMode: (mode) => set({ currentMode: mode }),
  setDeviceType: (type) => set({ deviceType: type }),
  setLoadingState: (state) => set({ loadingState: state }),
  updateDebugInfo: (patch) =>
    set((s) => ({ debugInfo: { ...s.debugInfo, ...patch } })),
}));
