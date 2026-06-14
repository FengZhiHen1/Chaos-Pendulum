export { useAnalyzeStore } from "./store";
export { AnalyzeModePage } from "./view/components/AnalyzeModePage";
export { LyapunovHeatmap } from "./view/components/LyapunovHeatmap";
export { BifurcationPlot } from "./view/components/BifurcationPlot";
export { EnergyLandscape } from "./view/components/EnergyLandscape";
export type {
  LyapunovGrid, LyapunovLayerType, HoverTooltipData, HeatmapCursor,
  BifurcationData, BifurcationHoverData, BifurcationCursor,
  PrecomputeDataType, PrecomputeCacheEntry,
  UsePrecomputeDataInput, PrecomputeDataState,
} from "./types";

// ─── Contracts ──────────────────────────────────
export type {
  IEnergyLandscapeConfig,
  IEnergyLandscapePoint,
  IPoincareController,
  IPrecomputePipeline,
  IAnalysisSceneBridge,
} from "./contracts";
export { DEFAULT_ENERGY_LANDSCAPE_CONFIG } from "./contracts";
export { PrecomputeLoadError, CacheError } from "./contracts";
