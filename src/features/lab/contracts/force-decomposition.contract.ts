/**
 * 模块: lab.contracts.force-decomposition
 * 职责: 定义受力拆解视图的契约边界——力矢量叠加渲染、分量分解面板、极值追踪。
 *       LAB-01 的核心职责：在 3D 场景中可视化叠加作用于双摆的力矢量及其分量分解。
 * 数据来源:
 *   - ForceField + ForceExtrema (shared/domain/valueObjects): MUST — 力分量数据格式
 *   - Worker computeForces (simulation): MUST — Worker 计算力数据并 transfer 到主线程
 *   - SimulationFrame (simulation/contracts): MUST — 当前 θ₁/θ₂ 用于坐标变换
 * 边界:
 *   - 依赖: shared/domain/valueObjects (ForceField, ForceExtrema), simulation/contracts
 *   - 被依赖: view/components/ForceArrows3D, view/components/DecompositionPanel
 * 禁止行为:
 *   - 禁止力可视化改变物理引擎的任何计算（纯可视化叠加）
 *   - 禁止力的动画/过渡效果——每帧直接更新位置和大小
 *   - 禁止在非桌面端使用 Hover 交互（移动端降级为始终显示数值标签）
 */

// ───────────────────────────────────────────────
// @contract ForceKind — 力类型
// ───────────────────────────────────────────────

/** 力的三种类型 */
export type ForceKind = "gravity" | "tension" | "inertial";

// ───────────────────────────────────────────────
// @contract CoordinateSystem — 坐标系
// ───────────────────────────────────────────────

/** 分量分解的三种坐标系 */
export type CoordinateSystem = "cartesian" | "polar" | "natural";

// ───────────────────────────────────────────────
// @contract ForceArrowMeta — 力矢量元数据
// ───────────────────────────────────────────────

/**
 * 单个力矢量箭头的元数据——描述箭头的物理含义和渲染颜色。
 *
 * 前置: 无
 * 后置: 用于 ForceArrows3D 渲染对应箭头
 * 输入约束:
 *   - key: 唯一标识（如 "Fg1", "T2", "Fi1_t"）
 *   - massIndex: 1=上摆, 2=下摆
 *   - kind: 力的类型（决定颜色和线型）
 *   - label: 人类可读的标签
 * 异常: 无
 * Side Effects: 无
 */
export interface IForceArrowMeta {
  readonly key: string;
  readonly massIndex: 1 | 2;
  readonly kind: ForceKind;
  readonly label: string;
}

/** 8 个力矢量箭头定义 */
export const FORCE_ARROW_REGISTRY: readonly IForceArrowMeta[] = [
  { key: "Fg1", massIndex: 1, kind: "gravity", label: "上摆重力 (Fg₁)" },
  { key: "T1", massIndex: 1, kind: "tension", label: "杆 1 张力 (T₁)" },
  { key: "Fi1_t", massIndex: 1, kind: "inertial", label: "上摆切向惯性力 (Fi₁_t)" },
  { key: "Fi1_n", massIndex: 1, kind: "inertial", label: "上摆法向惯性力 (Fi₁_n)" },
  { key: "Fg2", massIndex: 2, kind: "gravity", label: "下摆重力 (Fg₂)" },
  { key: "T2", massIndex: 2, kind: "tension", label: "杆 2 张力 (T₂)" },
  { key: "Fi2_t", massIndex: 2, kind: "inertial", label: "下摆切向惯性力 (Fi₂_t)" },
  { key: "Fi2_n", massIndex: 2, kind: "inertial", label: "下摆法向惯性力 (Fi₂_n)" },
] as const;

// ───────────────────────────────────────────────
// @contract ForceDisplayColors — 力矢量颜色方案
// ───────────────────────────────────────────────

/** 力矢量颜色方案 — 高饱和版本，确保暗色背景下清晰可辨 */
export const FORCE_DISPLAY_COLORS = {
  /** 重力：绿色实线箭头，固定竖直向下 */
  gravity: "#3EFF8C",
  /** 张力：红色实线箭头，沿杆方向（负张力为粉色） */
  tension: "#FF4D4D",
  /** 负张力（杆受压）: 品红色 */
  tensionNegative: "#FF5CAC",
  /** 惯性力：蓝色虚线箭头，分解为切向与法向 */
  inertial: "#5CADFF",
} as const;

// ───────────────────────────────────────────────
// @contract IForceTooltipData — 悬停数值标签
// ───────────────────────────────────────────────

/**
 * 力矢量悬停时显示的数值标签数据。
 *
 * 前置: 鼠标悬停在力矢量箭头上
 * 后置: 显示力的大小、方向角、分量分解
 * 输入约束: magnitude ≥ 0
 * 输出约束: directionDeg ∈ [0, 360)
 * 异常: 无
 * Side Effects: 无——纯数据
 */
export interface IForceTooltipData {
  readonly label: string;
  /** 力的大小 (N) */
  readonly magnitude: number;
  /** 方向角 (°) */
  readonly directionDeg: number;
  /** 第一分量值 */
  readonly c1: number;
  /** 第二分量值 */
  readonly c2: number;
  /** 第一分量标签 */
  readonly c1Label: string;
  /** 第二分量标签 */
  readonly c2Label: string;
}

// ───────────────────────────────────────────────
// @contract IForceDecompositionController — 受力拆解控制器
// ───────────────────────────────────────────────

/**
 * 受力拆解控制器——管理力矢量叠加的开关、坐标系、数据源。
 *
 * 前置: Worker computeForces 已激活
 * 后置: 3D 场景中显示力矢量箭头 + 右侧面板显示分解表格
 * 输入约束:
 *   - 激活时需发送 config({ computeForces: true }) 到 Worker
 *   - 关闭时发送 config({ computeForces: false })
 * 输出约束: lastForceData 包含当前帧的 8 个力矢量的完整数据
 * 异常: 无——数据不可用时静默显示 skeleton/empty state
 * Side Effects: 向 Worker 发送 computeForces 配置命令；
 *   在 Store 中更新 forceDecomposition 状态
 */
export interface IForceDecompositionController {
  /** 受力分析是否激活 */
  readonly active: boolean;

  /** 当前坐标系 */
  readonly coordinateSystem: CoordinateSystem;

  /** 最近一次力分量数据缓存（Float64Array，零拷贝） */
  readonly lastForceData: Float64Array | null;

  /** 力极值追踪数据 */
  readonly extrema: {
    readonly T1_max: { readonly value: number; readonly time: number };
    readonly T1_min: { readonly value: number; readonly time: number };
    readonly T2_max: { readonly value: number; readonly time: number };
    readonly T2_min: { readonly value: number; readonly time: number };
  } | null;

  /** 激活受力分析 */
  activate(): void;

  /** 关闭受力分析 */
  deactivate(): void;

  /** 切换坐标系 */
  setCoordinateSystem(sys: CoordinateSystem): void;

  /** 设置力数据（由 Worker 异步推送） */
  setForceData(data: Float64Array, extrema?: IForceDecompositionController["extrema"]): void;

  /** 设置当前悬停的力（供 DecompositionPanel 高亮） */
  setForceHovered(info: { forceType: string; massIndex: number } | null): void;
}

// ───────────────────────────────────────────────
// @contract ForceDecompositionDefaults — 默认配置
// ───────────────────────────────────────────────

/** 受力拆解视图默认配置 */
export const FORCE_DECOMPOSITION_DEFAULTS = {
  /** 默认坐标系 */
  defaultCoordinateSystem: "natural" as CoordinateSystem,
  /** 箭头杆半径 */
  shaftRadius: 0.018,
  /** 箭头头部半径 */
  headRadius: 0.045,
  /** 箭头头部长度 */
  headLength: 0.08,
  /** 最小箭头长度（防止零长度力看不见） */
  minArrowLength: 0.15,
  /** 惯性力虚线 dash 长度 */
  dashLength: 0.04,
  /** 惯性力虚线 gap 长度 */
  gapLength: 0.035,
  /** 移动端：始终显示数值标签（无 hover） */
  mobileAlwaysShowLabels: true,
} as const;
