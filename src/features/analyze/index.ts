export { useAnalyzeStore } from "./store";
export { AnalyzeModePage } from "./ui/AnalyzeModePage";
export { LyapunovHeatmap } from "./ui/LyapunovHeatmap";
export { BifurcationPlot } from "./ui/BifurcationPlot";
export { EnergyLandscape } from "./ui/EnergyLandscape";
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
