import type { ErrorCode } from "@/shared/infrastructure/error-handling/types";

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

/** 阻尼切片条目（ANL-01 damping 扫描） */
export interface DampingSlice {
  value: number;
  file: string;
  gridHash?: string;
}

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
    dampingValue?: number;  // 阻尼切片值（多阻尼扫描时存在）
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
  dampingValue?: number;
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
  /** 缓存键。格式："{type}-{gridHash}"，示例："lyapunov_max-a1b3f2e8" */
  cacheKey: string;
  /** 完整的预计算数据 */
  data: T;
  /** 写入缓存的时间戳（ISO 8601） */
  cachedAt: string;
  /** JSON 序列化后的字节数（用于 LRU 容量计算） */
  size: number;
  /** 缓存命中次数，LRU 辅助指标 */
  hitCount: number;
}

/** 数据加载生命周期状态 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** 预计算数据加载错误码（SYS-03 定义，委托给 SYS-02 ErrorCode） */
export type PrecomputeErrorCode = Extract<
  ErrorCode,
  "PRECOMPUTE_FETCH_FAILED" | "PRECOMPUTE_FORMAT_ERROR" | "PRECOMPUTE_VERSION_MISMATCH"
>;

/** ─── SYS-03 usePrecomputeData ────────────────────── */

/** 预计算数据加载的输入参数 */
export interface UsePrecomputeDataInput {
  /** 数据类型："lyapunov_max" | "lyapunov_min" | "energy_curvature" | "bifurcation" */
  dataType: "lyapunov_max" | "lyapunov_min" | "energy_curvature" | "bifurcation";
  /** 数据文件的 Vite 构建产物 URL（通过 new URL('...', import.meta.url) 获取） */
  dataUrl: string;
  /** 预期的参数网格哈希（16 字符 hex） */
  expectedGridHash: string;
  /** 预期的数据类型（与 dataType 冗余校验） */
  expectedType: string;
  /** 期望的 solverVersion，默认 "1.0.0" */
  expectedSolverVersion?: string;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** fetch 超时时间（毫秒），默认 10000 */
  fetchTimeoutMs?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试退避基础时间（毫秒），默认 1000 */
  retryBaseMs?: number;
}

/** usePrecomputeData() hook 的返回值 */
export interface PrecomputeDataState<T = PrecomputeDataType> {
  /** 加载状态 */
  status: LoadStatus;
  /** 加载成功后的预计算数据（status === "ready" 时非 null） */
  data: T | null;
  /** 加载失败时的错误信息（status === "error" 时非 null） */
  errorMessage: string | null;
  /** 错误码（status === "error" 时非 null） */
  errorCode: PrecomputeErrorCode | null;
  /** 数据来源："cache" | "network" | null（未加载） */
  source: "cache" | "network" | null;
  /** 手动重新加载 */
  retry: () => void;
}

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

// ─── ANL-03 庞加莱截面 ── UI 专用类型 ───────────────

export interface PoincareHoverData {
  visible: boolean;
  position: { x: number; y: number };
  theta2: number;
  omega2: number;
  time: number;
  source: "current" | "baseline";
}

export interface PoincareStatus {
  isActive: boolean;
  pointCount: number;
  baselinePointCount: number;
  lastPointTime: number | null;
}

export const PRESET_CONDITIONS: Record<string, { variable: "theta1" | "theta2" | "omega1" | "omega2"; targetValue: number; direction: "positive" | "negative" | "both" }> = {
  "θ₁ = 0, θ̇₁ > 0": { variable: "theta1", targetValue: 0, direction: "positive" },
  "θ₁ = 0, θ̇₁ < 0": { variable: "theta1", targetValue: 0, direction: "negative" },
  "θ₂ = π/2": { variable: "theta2", targetValue: Math.PI / 2, direction: "both" },
  "θ₂ = -π/2": { variable: "theta2", targetValue: -Math.PI / 2, direction: "both" },
};
