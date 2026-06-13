/**
 * 模块: explore.contracts.types
 * 职责: 定义 explore 功能域的共享类型契约——3D场景配置、尾迹参数、混沌指示器、视图预设。
 *       这些类型是域内统一的"类型宪法"，所有子模块共享同一套定义。
 * 边界:
 *   - 依赖: simulation/contracts (SimulationFrame), shared/domain/valueObjects
 *   - 被依赖: 本模块所有其他 contract 文件
 * 禁止行为:
 *   - 禁止在 types.contract 中包含可执行逻辑（纯类型定义文件）
 *   - 禁止类型定义中出现 `any` 类型
 */

// ───────────────────────────────────────────────
// @contract ViewPreset — 3D 视图预设
// ───────────────────────────────────────────────

/**
 * 3D 场景的预设视角。
 *
 * 前置: 无
 * 后置: Scene3D 的 camera 切换到对应位置
 * 输入约束: "side" | "top" | "chaos"
 *   - side: 实验员侧视——经典物理实验视角
 *   - top: 上帝俯视——从正上方观察摆的运动平面
 *   - chaos: 混沌跟随——相机动态跟随下摆球运动
 * 输出约束: 精确的字符串字面量类型
 * 异常: 无
 * Side Effects: 无
 */
export type ViewPreset = "side" | "top" | "chaos";

// ───────────────────────────────────────────────
// @contract TrailLength — 尾迹持久度
// ───────────────────────────────────────────────

/**
 * 运动尾迹的持久度。
 *
 * 前置: 无
 * 后置: TrailRenderer 根据此值决定尾迹缓存容量
 * 输入约束:
 *   - 50 | 200 | 1000: 固定帧数
 *   - 0: 无限持久（不自动清除）
 *   - -1: 仅当前周期（检测到周期运动时重置）
 * 输出约束: 数字字面量联合类型
 * 异常: 无
 * Side Effects: 无
 */
export type TrailLength = 50 | 200 | 1000 | 0 | -1;

// ───────────────────────────────────────────────
// @contract TrailPoint — 尾迹坐标点
// ───────────────────────────────────────────────

/**
 * 尾迹中的单个坐标点——用于速度-颜色映射。
 *
 * 前置: 从 SimulationFrame 的笛卡尔坐标提取
 * 后置: TrailRenderer 的 BufferGeometry 消费此数据
 * 输入约束:
 *   - x, y: 3D 空间坐标 (m)
 *   - speed: 该点的瞬时速度 (m/s)，用于颜色映射（蓝→红）
 *   - width: 该点的尾迹宽度 (m)，与速度正相关
 * 输出约束: 所有字段为有限值
 * 异常: 无
 * Side Effects: 无——纯数据容器
 */
export interface TrailPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speed: number;
  readonly width: number;
}

// ───────────────────────────────────────────────
// @contract TrailConfig — 尾迹渲染配置
// ───────────────────────────────────────────────

/**
 * 尾迹渲染器全局配置。
 *
 * 前置: 无
 * 后置: 用于 TrailRenderer 的材质和几何参数
 * 输入约束:
 *   - maxPoints: 尾迹缓存最大点数（受 TrailLength 控制）
 *   - baseWidth: 尾迹基础线宽 (m)
 *   - speedColorMin: 速度-颜色映射的最小速度 (m/s) → 蓝色
 *   - speedColorMax: 速度-颜色映射的最大速度 (m/s) → 红色
 *   - opacityBase: 尾迹基础不透明度 [0, 1]
 *   - opacityFade: 尾迹尾部衰减不透明度 [0, 1]
 * 输出约束: 所有字段为有限值；opacityBase >= opacityFade
 * 异常: 无
 * Side Effects: 无
 */
export interface TrailConfig {
  readonly maxPoints: number;
  readonly baseWidth: number;
  readonly speedColorMin: number;
  readonly speedColorMax: number;
  readonly opacityBase: number;
  readonly opacityFade: number;
}

/** 默认尾迹配置 */
export const DEFAULT_TRAIL_CONFIG: TrailConfig = {
  maxPoints: 1000,
  baseWidth: 0.008,
  speedColorMin: 0,
  speedColorMax: 5,
  opacityBase: 0.8,
  opacityFade: 0.1,
} as const;

// ───────────────────────────────────────────────
// @contract Scene3DConfig — 3D 场景配置
// ───────────────────────────────────────────────

/**
 * 3D 场景的全局渲染配置。
 *
 * 前置: 无
 * 后置: Scene3D 组件根据此配置初始化 R3F Canvas
 * 输入约束:
 *   - cameraPresets: 三种预设视角的 camera 位置和目标
 *   - materialPresets: 三种摆体材质的颜色/金属度/粗糙度
 *   - backgrounds: 两种环境背景的预设
 * 输出约束: 所有子字段为有限值
 * 异常: 无
 * Side Effects: 无
 */
export interface Scene3DConfig {
  /** 预设视角配置 */
  readonly cameraPresets: Record<ViewPreset, {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  }>;
  /** 摆体预设大小缩放 */
  readonly ballBaseRadius: number;
  /** 摆杆预设粗细 */
  readonly rodBaseRadius: number;
}

/** 默认 3D 场景配置 */
export const DEFAULT_SCENE3D_CONFIG: Scene3DConfig = {
  cameraPresets: {
    side: { position: [0, 0, 5], target: [0, -1, 0] },
    top: { position: [0, 3, 0.1], target: [0, 0, 0] },
    chaos: { position: [0, 0, 3], target: [0, -1, 0] },
  },
  ballBaseRadius: 0.12,
  rodBaseRadius: 0.03,
} as const;

// ───────────────────────────────────────────────
// @contract ChaosIndicatorState — 混沌指示器状态
// ───────────────────────────────────────────────

/**
 * 混沌指示器的实时状态。
 *
 * 前置: 至少有 1 帧仿真数据
 * 后置: UI 根据 level 显示对应的颜色和标签
 * 输入约束:
 *   - lyapunovExponent: 实时 Lyapunov 指数
 *   - variance: 角速度方差（替代混沌检测指标）
 *   - level: "stable" | "quasiperiodic" | "chaotic"
 *   - confidence: 混沌判定置信度 [0, 1]
 * 输出约束: level 与 lyapunovExponent/variance 一致
 * 异常: 无
 * Side Effects: 无——纯数据
 */
export interface ChaosIndicatorState {
  readonly lyapunovExponent: number;
  readonly variance: number;
  readonly level: "stable" | "quasiperiodic" | "chaotic";
  readonly confidence: number;
}

// ───────────────────────────────────────────────
// @contract ResponsiveConfig — 响应式渲染降级
// ───────────────────────────────────────────────

/**
 * 响应式渲染降级配置——根据设备类型调整渲染质量。
 *
 * 前置: 设备类型已检测（desktop/tablet/mobile）
 * 后置: 决定 3D 场景的渲染参数
 * 输入约束:
 *   - deviceType: "desktop" | "tablet" | "mobile"
 * 输出约束:
 *   - shadows: 是否启用阴影
 *   - trailEnabled: 是否启用尾迹
 *   - pixelRatio: DPR 缩放
 *   - ballSegments: 球体分段数
 *   - sonificationEnabled: 是否允许声音化
 * 异常: 无
 * Side Effects: 无
 */
export interface ResponsiveConfig {
  readonly shadows: boolean;
  readonly trailEnabled: boolean;
  readonly pixelRatio: number;
  readonly ballSegments: number;
  readonly sonificationEnabled: boolean;
}

/** 响应式降级预设 */
export const RESPONSIVE_PRESETS: Record<"desktop" | "tablet" | "mobile", ResponsiveConfig> = {
  desktop: {
    shadows: true, trailEnabled: true, pixelRatio: 2, ballSegments: 64, sonificationEnabled: true,
  },
  tablet: {
    shadows: false, trailEnabled: true, pixelRatio: 1.5, ballSegments: 32, sonificationEnabled: false,
  },
  mobile: {
    shadows: false, trailEnabled: false, pixelRatio: 1, ballSegments: 16, sonificationEnabled: false,
  },
} as const;
