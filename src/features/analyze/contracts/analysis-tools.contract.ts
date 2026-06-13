/**
 * 模块: analyze.contracts.analysis-tools
 * 职责: 定义动力学分析工具套件的契约边界——Lyapunov热力图、分岔图、庞加莱截面、能量景观、
 *       预计算数据管线、分析与3D场景双向联动。
 *       ANL-01~04 + SYS-03 的核心职责：浏览器内的"非线性动力学诊断终端"。
 * 数据来源:
 *   - SimulationFrame / StateVector (simulation/contracts): MUST — 实时仿真状态
 *   - PrecomputeData (IndexedDB cache): MUST — 离线预计算的 Lyapunov 网格 + 分岔采样
 *   - PoincarePoint (shared/domain/valueObjects): MUST — Worker 实时截面穿越检测
 * 边界:
 *   - 依赖: simulation/contracts, shared/domain/valueObjects, shared/infrastructure/storage
 *   - 被依赖: ui/AnalyzeModePage
 * 禁止行为:
 *   - 禁止在分析工具中直接操作仿真 Worker——通过 scheduler 接口
 *   - 禁止预计算数据不可用时阻断实时仿真
 *   - 禁止庞加莱截面点数无上限增长（>10000 自动截断至 5000）
 *   - 禁止使用二元判定——所有混沌指标使用连续置信度分数
 */

import type { PendulumParams } from "@/shared/domain/valueObjects";
import type { PoincareSectionCondition, PoincarePoint } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// ANL-01: Lyapunov 指数热力图
// ───────────────────────────────────────────────

/** 预计算网格参数轴元数据 */
export interface IGridParamAxis {
  readonly name: string;
  readonly symbol: string;
  readonly min: number;
  readonly max: number;
  readonly steps: number;
  readonly unit: string;
}

/** 阻尼切片（多阻尼扫描时存在） */
export interface IDampingSlice {
  readonly value: number;
  readonly file: string;
  readonly gridHash?: string;
}

/** 扫描图层类型 */
export type LyapunovLayerType = "lyapunov_max" | "lyapunov_min" | "energy_curvature";

/** Lyapunov 预计算网格数据 */
export interface ILyapunovGrid {
  readonly metadata: {
    readonly type: LyapunovLayerType;
    readonly paramX: IGridParamAxis;
    readonly paramY: IGridParamAxis;
    readonly fixedParams: Record<string, number>;
    readonly gridHash: string;
    readonly generatedAt: string;
    readonly solverVersion: string;
    readonly dampingValue?: number;
  };
  readonly grid: ReadonlyArray<ReadonlyArray<number>>;
}

/** 热力图悬停提示数据 */
export interface IHoverTooltipData {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly paramX: number;
  readonly paramY: number;
  readonly value: number;
}

/** 热力图游标（与3D场景双向联动） */
export interface IHeatmapCursor {
  readonly active: boolean;
  readonly paramX: number;
  readonly paramY: number;
}

// ───────────────────────────────────────────────
// ANL-02: 参数空间分岔图
// ───────────────────────────────────────────────

/** 分岔图扫描的控制参数 */
export interface IScannedParam {
  readonly name: string;
  readonly symbol: string;
  readonly min: number;
  readonly max: number;
  readonly steps: number;
}

/** 采样变量 */
export interface ISampledVariable {
  readonly name: string;
  readonly symbol: string;
  readonly label: string;
}

/** 分岔图预计算数据 */
export interface IBifurcationData {
  readonly metadata: {
    readonly scannedParam: IScannedParam;
    readonly sampledVariable: ISampledVariable;
    readonly fixedParams: Record<string, number>;
    readonly integrationTime: number;
    readonly transientTime: number;
    readonly hash: string;
  };
  readonly data: ReadonlyArray<{ readonly paramValue: number; readonly sampleValues: ReadonlyArray<number> }>;
}

/** 分岔图游标（联动当前仿真参数） */
export interface IBifurcationCursor {
  readonly active: boolean;
  readonly paramValue: number;
}

// ───────────────────────────────────────────────
// ANL-03: 庞加莱截面
// ───────────────────────────────────────────────

/** 庞加莱截面控制器 */
export interface IPoincareController {
  /** 当前截面条件 */
  readonly condition: PoincareSectionCondition;

  /** 采集点列表 */
  readonly points: readonly PoincarePoint[];

  /** 基线点列表（用于叠加对比） */
  readonly baseline: readonly PoincarePoint[] | null;

  /** 是否正在采集 */
  readonly isActive: boolean;

  /** 当前点数 */
  readonly pointCount: number;

  /** 设置截面条件 */
  setCondition(cond: PoincareSectionCondition): void;

  /** 追加穿越点（由 Worker 异步推送） */
  addPoints(pts: PoincarePoint[]): void;

  /** 清空所有点 */
  clearPoints(): void;

  /** 保存当前点为基线 */
  saveBaseline(): void;

  /** 清除基线 */
  clearBaseline(): void;

  /** 完全重置 */
  reset(): void;
}

// ───────────────────────────────────────────────
// ANL-04: 能量景观地形图
// ───────────────────────────────────────────────

/**
 * 能量景观配置——3D 势能曲面参数。
 *
 * 前置: params 已通过校验
 * 后置: 用于 R3F 渲染半透明势能曲面
 * 输入约束:
 *   - resolution: 曲面网格分辨率（默认 64）
 *   - thetaRange: 角度范围 [min, max] (rad)
 *   - opacity: 曲面不透明度 [0, 1]（默认 0.6）
 *   - showContours: 是否显示底部等高线投影
 *   - showCurrentPoint: 是否显示实时光点
 * 输出约束: 所有字段为有效值
 */
export interface IEnergyLandscapeConfig {
  readonly resolution: number;
  readonly thetaRange: readonly [number, number];
  readonly opacity: number;
  readonly showContours: boolean;
  readonly showCurrentPoint: boolean;
}

/** 能量景观默认配置 */
export const DEFAULT_ENERGY_LANDSCAPE_CONFIG: IEnergyLandscapeConfig = {
  resolution: 64,
  thetaRange: [-Math.PI, Math.PI] as const,
  opacity: 0.6,
  showContours: true,
  showCurrentPoint: true,
} as const;

/**
 * 能量景观数据——势能曲面采样点。
 *
 * 前置: params 已通过校验
 * 后置: 用于构建 3D 曲面网格
 * 输入约束:
 *   - V(θ₁,θ₂): 势能值 (J)，可为负
 *   - gradient: 势能梯度幅值
 * 输出约束: 所有数值为有限值
 */
export interface IEnergyLandscapePoint {
  readonly theta1: number;
  readonly theta2: number;
  readonly potentialEnergy: number;
  readonly gradient: number;
}

// ───────────────────────────────────────────────
// SYS-03: 预计算数据管线
// ───────────────────────────────────────────────

/** 预计算数据类型 */
export type PrecomputeDataType = "lyapunov" | "bifurcation";

/** IndexedDB 缓存条目 */
export interface IPrecomputeCacheEntry {
  readonly key: string;
  readonly type: PrecomputeDataType;
  readonly gridHash: string;
  readonly data: ArrayBuffer;
  readonly cachedAt: string;
  readonly size: number;
}

/** 预计算数据加载状态 */
export interface IPrecomputeDataState {
  readonly type: PrecomputeDataType;
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly error: string | null;
  readonly progress: number;
  readonly cachedAt: string | null;
}

/** 预计算数据管线端口 */
export interface IPrecomputePipeline {
  /** 按需加载指定类型的预计算数据 */
  load(type: PrecomputeDataType, params: Record<string, number | string>): Promise<ArrayBuffer>;

  /** 检查 IndexedDB 缓存是否命中 */
  checkCache(type: PrecomputeDataType, gridHash: string): Promise<boolean>;

  /** LRU 清理过期缓存（最多保留 10 条） */
  evictLRU(maxEntries: number): Promise<void>;

  /** 当前加载状态 */
  getState(type: PrecomputeDataType): IPrecomputeDataState;

  /** 取消加载 */
  cancel(): void;
}

// ───────────────────────────────────────────────
// 双向联动
// ───────────────────────────────────────────────

/**
 * 分析工具 ↔ 3D 场景双向联动接口。
 *
 * 热力图/分岔图点击 → injectParams + setMode("explore") → 3D 场景以新参数运行
 * 3D 场景参数变化 → 分析图游标实时跟踪当前参数位置
 */
export interface IAnalysisSceneBridge {
  /** 从分析图点击格点，注入参数并切换到探索模式 */
  navigateToExplore(params: Partial<PendulumParams>): void;

  /** 更新分析图游标以反映当前仿真参数 */
  updateCursor(paramX: number, paramY: number): void;
}
