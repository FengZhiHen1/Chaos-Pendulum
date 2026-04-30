import type { StateCreator } from "zustand";
import type { LyapunovLayerType, HoverTooltipData, LoadStatus } from "@/features/analyze/types";
import type { PoincareSectionCondition, PoincarePoint } from "@/shared/types";

export type AnalysisView = "lyapunov" | "bifurcation" | "poincare" | "energy-landscape";

const DEFAULT_POINCARE_CONDITION: PoincareSectionCondition = {
  variable: "theta1",
  targetValue: 0,
  direction: "positive",
};

export interface AnalyzeSlice {
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

  // ── ANL-03 庞加莱截面 ──
  poincareSection: {
    condition: PoincareSectionCondition;
    points: PoincarePoint[];
    baseline: PoincarePoint[] | null;
    isActive: boolean;
    pointCount: number;
    lastPointTime: number | null;
    setCondition: (cond: PoincareSectionCondition) => void;
    addPoints: (pts: PoincarePoint[]) => void;
    clearPoints: () => void;
    saveBaseline: () => void;
    clearBaseline: () => void;
    reset: () => void;
  };

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

export const createAnalyzeSlice: StateCreator<AnalyzeSlice, [], [], AnalyzeSlice> = (set) => ({
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

  poincareSection: {
    condition: { ...DEFAULT_POINCARE_CONDITION },
    points: [],
    baseline: null,
    isActive: false,
    pointCount: 0,
    lastPointTime: null,

    setCondition: (condition) =>
      set((s) => ({
        poincareSection: { ...s.poincareSection, condition },
      })),

    addPoints: (pts) =>
      set((s) => {
        const all = [...s.poincareSection.points, ...pts];
        const trimmed = all.length > 10_000 ? all.slice(-5_000) : all;
        const lastPointTime = trimmed.length > 0 ? trimmed[trimmed.length - 1]!.time : null;
        return {
          poincareSection: {
            ...s.poincareSection,
            points: trimmed,
            pointCount: trimmed.length,
            lastPointTime,
          },
        };
      }),

    clearPoints: () =>
      set((s) => ({
        poincareSection: {
          ...s.poincareSection,
          points: [],
          pointCount: 0,
          lastPointTime: null,
        },
      })),

    saveBaseline: () =>
      set((s) => {
        const current = s.poincareSection.points;
        if (current.length === 0) return s;
        const baseline = current.slice(-5_000);
        return {
          poincareSection: {
            ...s.poincareSection,
            baseline,
            points: [],
            pointCount: 0,
            lastPointTime: null,
          },
        };
      }),

    clearBaseline: () =>
      set((s) => ({
        poincareSection: {
          ...s.poincareSection,
          baseline: null,
        },
      })),

    reset: () =>
      set((s) => ({
        poincareSection: {
          ...s.poincareSection,
          condition: { ...DEFAULT_POINCARE_CONDITION },
          points: [],
          baseline: null,
          isActive: false,
          pointCount: 0,
          lastPointTime: null,
        },
      })),
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
});
