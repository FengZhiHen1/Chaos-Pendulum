import { create } from "zustand";
import type { LyapunovLayerType, HoverTooltipData, LoadStatus } from "./types";

export type AnalysisView = "lyapunov" | "bifurcation" | "poincare" | "energy-landscape";

interface AnalyzeState {
  // ── 视图与图层 ──
  activeView: AnalysisView;
  activeLayer: LyapunovLayerType;

  // ── 加载状态 ──
  loadStatus: LoadStatus;
  loadError: string | null;

  // ── Tooltip ──
  hoverTooltip: HoverTooltipData;

  // ── 图层缓存 ──
  layerCacheStatus: Record<LyapunovLayerType, LoadStatus>;

  // ── Actions ──
  setActiveView: (view: AnalysisView) => void;
  setActiveLayer: (layer: LyapunovLayerType) => void;
  setLoadStatus: (status: LoadStatus) => void;
  setLoadError: (error: string | null) => void;
  setHoverTooltip: (data: HoverTooltipData) => void;
  setLayerCacheStatus: (layer: LyapunovLayerType, status: LoadStatus) => void;
  resetLoadState: () => void;
}

const defaultTooltip: HoverTooltipData = {
  visible: false,
  position: { x: 0, y: 0 },
  lambdaValue: null,
  lambdaLabel: "",
  paramXValue: 0,
  paramYValue: 0,
  paramXName: "",
  paramYName: "",
};

export const useAnalyzeStore = create<AnalyzeState>((set) => ({
  activeView: "lyapunov",
  activeLayer: "lyapunov_max",

  loadStatus: "idle",
  loadError: null,

  hoverTooltip: { ...defaultTooltip },

  layerCacheStatus: {
    lyapunov_max: "idle",
    lyapunov_min: "idle",
    energy_curvature: "idle",
  },

  setActiveView: (activeView) => set({ activeView }),

  setActiveLayer: (activeLayer) =>
    set((s) => {
      if (s.activeLayer === activeLayer) return s;
      return { activeLayer, loadStatus: "idle", loadError: null };
    }),

  setLoadStatus: (loadStatus) => set({ loadStatus }),

  setLoadError: (loadError) => set({ loadError }),

  setHoverTooltip: (hoverTooltip) => set({ hoverTooltip }),

  setLayerCacheStatus: (layer, status) =>
    set((s) => ({
      layerCacheStatus: { ...s.layerCacheStatus, [layer]: status },
    })),

  resetLoadState: () =>
    set({
      loadStatus: "idle",
      loadError: null,
    }),
}));
