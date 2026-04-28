// ─── ANL-01 李雅普诺夫指数谱 ──类型定义 ──────────────────

/** 预计算网格参数轴元数据 */
export interface GridParamAxis {
  name: string;      // 参数名，如 "L₂/L₁"、"θ₁"
  symbol: string;    // LaTeX 符号，如 "L_2/L_1"
  min: number;       // 扫描最小值
  max: number;       // 扫描最大值
  steps: number;     // 网格点数，典型值 100
  unit: string;      // 单位，如 ""、"rad"
}

/** 预计算时固定的其他参数 */
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

/** 扫描图层类型 */
export type LyapunovLayerType = "lyapunov_max" | "lyapunov_min" | "energy_curvature";

/** 预计算数据文件结构 */
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

/** 悬停 Tooltip 数据 */
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

/** 双向联动游标 */
export interface HeatmapCursor {
  visible: boolean;
  x: number;
  y: number;
  paramXValue: number;
  paramYValue: number;
}

/** 参数填充动作（点击格点后） */
export interface ParameterFillAction {
  source: "lyapunov-heatmap";
  gridCell: { col: number; row: number };
  paramXValue: number;
  paramYValue: number;
  fixedParams: FixedParams;
  timestamp: number;
}

/** 缓存条目结构 */
export interface PrecomputeCacheEntry {
  key: string;
  data: LyapunovGrid;
  cachedAt: number;
  size: number;
}

/** 数据加载生命周期状态 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** 参数名 → Zustand 字段映射 */
export const PARAM_NAME_TO_STORE_KEY: Record<string, { key: string; transform?: (v: number, fixed: FixedParams) => number }> = {
  "L₂/L₁": { key: "L2", transform: (v, fixed) => v * fixed.L1 },
  "θ₁": { key: "theta1" },
  "θ₂": { key: "theta2" },
  "m₂/m₁": { key: "m2", transform: (v, fixed) => v * fixed.m1 },
  "ω̇₁": { key: "omega1_0" }, // 注：文档写 ω̇₁，实际应为 ω₁（初始角速度）
  "ω₁": { key: "omega1_0" },
  "ω₂": { key: "omega2_0" },
  "g": { key: "g" },
};

/** 混沌判定标签 */
export function classifyLambda(value: number | null): { label: string; tone: "chaos" | "quasi" | "stable" | "missing" } {
  if (value === null || value === undefined || isNaN(value)) {
    return { label: "数据缺失", tone: "missing" };
  }
  if (value > 0.01) return { label: "混沌", tone: "chaos" };
  if (value < -0.01) return { label: "稳定", tone: "stable" };
  return { label: "准周期", tone: "quasi" };
}

/** 从预计算参数名提取 store 字段名与转换函数 */
export function resolveStoreParam(
  paramName: string,
  value: number,
  fixedParams: FixedParams,
): { storeKey: string; storeValue: number } | null {
  const mapping = PARAM_NAME_TO_STORE_KEY[paramName];
  if (!mapping) return null;
  const storeValue = mapping.transform ? mapping.transform(value, fixedParams) : value;
  return { storeKey: mapping.key, storeValue };
}
