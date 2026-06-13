/**
 * analyze.contracts — 动力学分析工具功能域的契约聚合出口。
 *
 * 提供 5 大契约：
 * 1. ANL-01 Lyapunov指数热力图（预计算网格 + Canvas 2D + 双向联动）
 * 2. ANL-02 参数空间分岔图（单参数扫描 + d3-zoom 框选）
 * 3. ANL-03 庞加莱截面（实时穿越检测 + 动态生长散点图）
 * 4. ANL-04 能量景观地形图（3D R3F 半透明曲面 + 实时光点）
 * 5. SYS-03 预计算数据管线（离线Python + IndexedDB缓存 + LRU驱逐）
 *
 * Usage:
 *     import { ILyapunovGrid, IPoincareController } from "@/features/analyze/contracts";
 *     import { IPrecomputePipeline, PrecomputeDataType } from "@/features/analyze/contracts";
 */

export type {
  IGridParamAxis,
  IDampingSlice,
  LyapunovLayerType,
  ILyapunovGrid,
  IHoverTooltipData,
  IHeatmapCursor,
  IScannedParam,
  ISampledVariable,
  IBifurcationData,
  IBifurcationCursor,
  IPoincareController,
  IEnergyLandscapeConfig,
  IEnergyLandscapePoint,
  PrecomputeDataType,
  IPrecomputeCacheEntry,
  IPrecomputeDataState,
  IPrecomputePipeline,
  IAnalysisSceneBridge,
} from "./analysis-tools.contract";
export { DEFAULT_ENERGY_LANDSCAPE_CONFIG } from "./analysis-tools.contract";

export { PrecomputeLoadError, CacheError } from "./exceptions";
