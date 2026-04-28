// ─── ANL-01 / ANL-02 共享类型定义 ──────────────────

/** 预计算网格参数轴元数据（ANL-01） */
export interface GridParamAxis {
  name: string;      // 参数名，如 "L₂/L₁"、"θ₁"
  symbol: string;    // LaTeX 符号，如 "L_2/L_1"
  min: number;       // 扫描最小值
  max: number;       // 扫描最大值
  steps: number;     // 网格点数，典型值 100
  unit: string;      // 单位，如 ""、"rad"
}

/** 预计算时固定的其他参数（ANL-01） */
export interface FixedParams {
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  omega1_0: number;
  omega2_0: number;
  g: number;
  damping: number;
  integrationTime: number;
  dt: number;
}

/** 扫描图层类型（ANL-01） */
export type LyapunovLayerType = "lyapunov_max" | "lyapunov_min" | "energy_curvature";

/** 预计算数据文件结构（ANL-01） */
export interface LyapunovGrid {
  metadata: {
    type: LyapunovLayerType;
    paramX: GridParamAxis;
    paramY: GridParamAxis;
    fixedParams: FixedParams;
    gridHash: string;
    generatedAt: string;
    solverVersion: string;
  };
  grid: number[][]; // [row][col] = value; row 0 对应 paramY.max（顶部）
}

/** ─── ANL-02 参数空间分岔图 ─────────────────────── */

/** ANL-02 扫描的控制参数 */
export interface ScannedParam {
  name: string;
  symbol: string;
  min: number;
  max: number;
  steps: number;
  unit: string;
}

/** ANL-02 采样的状态变量 */
export interface SampledVariable {
  name: string;
  symbol: string;
  min: number;
  max: number;
  unit: string;
}

/** ANL-02 固定参数 */
export interface BifurcationFixedParams {
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  theta1_0: number;
  theta2_0: number;
  omega1_0: number;
  omega2_0: number;
  g: number;
  damping: number;
  transientTime: number;
  sampleTime: number;
  dt: number;
}

/** ANL-02 预计算数据文件结构 */
export interface BifurcationData {
  metadata: {
    type: "bifurcation";
    scannedParam: ScannedParam;
    sampledVariable: SampledVariable;
    fixedParams: BifurcationFixedParams;
    gridHash: string;
    generatedAt: string;
    solverVersion: string;
  };
  samples: number[][]; // [step][pointIndex] = sampledValue
}

/** 预计算数据联合类型 */
export type PrecomputeDataType = LyapunovGrid | BifurcationData;

/** ─── ANL-01 专用 UI 类型 ────────────────────────── */

/** 热力图组件 Props */
export interface LyapunovHeatmapProps {
  dataPaths: {
    lyapunov_max: string;
    lyapunov_min: string;
    energy_curvature: string;
  };
  width?: number;
  height?: number;
}

/** 悬停 Tooltip 数据（ANL-01） */
export interface HoverTooltipData {
  visible: boolean;
  position: { x: number; y: number };
  lambdaValue: number | null;
  lambdaLabel: string;
  paramXValue: number;
  paramYValue: number;
  paramXName: string;
  paramYName: string;
}

/** 双向联动游标（ANL-01） */
export interface HeatmapCursor {
  visible: boolean;
  x: number;
  y: number;
  paramXValue: number;
  paramYValue: number;
}

/** 参数填充动作（ANL-01） */
export interface ParameterFillAction {
  source: "lyapunov-heatmap";
  gridCell: { col: number; row: number };
  paramXValue: number;
  paramYValue: number;
  fixedParams: FixedParams;
  timestamp: number;
}

/** ─── ANL-02 专用 UI 类型 ────────────────────────── */

/** 分岔图组件 Props */
export interface BifurcationPlotProps {
  dataPath: string;
  width?: number;
  height?: number;
  pointRadius?: number;
}

/** 悬停 HUD 数据（ANL-02） */
export interface BifurcationHoverData {
  visible: boolean;
  position: { x: number; y: number };
  scannedParamValue: number;
  scannedParamName: string;
  sampledValues: number[] | null;
  sampledVariableName: string;
  pointCount: number;
  regime: "周期-1" | "周期-2" | "周期-4" | "倍周期" | "混沌" | "无数据";
}

/** 竖直游标（ANL-02） */
export interface BifurcationCursor {
  visible: boolean;
  paramValue: number;
  x: number;
  label: string;
}

/** ─── 共享基础设施 ───────────────────────────────── */

/** 缓存条目结构（泛型） */
export interface PrecomputeCacheEntry<T = PrecomputeDataType> {
  key: string;
  data: T;
  cachedAt: number;
  size: number;
}

/** 数据加载生命周期状态 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** 参数名 → Zustand 字段映射 */
export const PARAM_NAME_TO_STORE_KEY: Record<
  string,
  { key: string; transform?: (v: number, fixed: { L1: number; m1: number }) => number }
> = {
  "L₂/L₁": { key: "L2", transform: (v, fixed) => v * fixed.L1 },
  "L₂": { key: "L2" },
  "θ₁": { key: "theta1" },
  "θ₂": { key: "theta2" },
  "m₂/m₁": { key: "m2", transform: (v, fixed) => v * fixed.m1 },
  "m₂": { key: "m2" },
  "ω̇₁": { key: "omega1_0" },
  "ω₁": { key: "omega1_0" },
  "ω₂": { key: "omega2_0" },
  "g": { key: "g" },
};

/** 混沌判定标签（ANL-01） */
export function classifyLambda(value: number | null): { label: string; tone: "chaos" | "quasi" | "stable" | "missing" } {
  if (value === null || value === undefined || isNaN(value)) {
    return { label: "数据缺失", tone: "missing" };
  }
  if (value > 0.01) return { label: "混沌", tone: "chaos" };
  if (value < -0.01) return { label: "稳定", tone: "stable" };
  return { label: "准周期", tone: "quasi" };
}

/** ANL-02 分岔图 regime 判定 */
export function classifyRegime(pointCount: number): BifurcationHoverData["regime"] {
  if (pointCount === 0) return "无数据";
  if (pointCount === 1) return "周期-1";
  if (pointCount === 2) return "周期-2";
  if (pointCount <= 4) return "周期-4";
  if (pointCount <= 8) return "倍周期";
  return "混沌";
}

/** 从预计算参数名提取 store 字段名与转换函数 */
export function resolveStoreParam(
  paramName: string,
  value: number,
  fixedParams: { L1: number; m1: number },
): { storeKey: string; storeValue: number } | null {
  const mapping = PARAM_NAME_TO_STORE_KEY[paramName];
  if (!mapping) return null;
  const storeValue = mapping.transform ? mapping.transform(value, fixedParams) : value;
  return { storeKey: mapping.key, storeValue };
}
