/**
 * 模块: data.contracts.types
 * 职责: 定义演示与数据管理功能域的共享类型契约——快照实体、故事阶段、演示模式配置、
 *       导出格式、回放状态、分叉参数。这是域内统一的"类型宪法"，所有子模块
 *       （STY-01/02, DAT-01~03）共享同一套定义。
 * 数据来源:
 *   - PendulumParams (shared/domain/valueObjects/physics.ts): MUST — 快照保存的完整参数
 *   - InitialConditions (shared/domain/valueObjects/physics.ts): MUST — 分叉的初始条件
 *   - StateVector (shared/domain/valueObjects/physics.ts): MUST — 回放的状态向量
 *   - SimulationFrame (simulation/contracts/types.contract.ts): SHOULD — CSV 导出的数据源
 *   - AppMode (shared/domain/valueObjects/app.ts): MUST — 故事阶段的模式切换
 * 边界:
 *   - 依赖: shared/domain/valueObjects (PendulumParams, InitialConditions, StateVector, AppMode)
 *   - 被依赖: 本模块所有其他 contract 文件
 * 禁止行为:
 *   - 禁止在 types.contract 中包含可执行逻辑（纯类型定义 + Zod schema）
 *   - 禁止类型定义中出现 `any` 类型（零 Any 容忍）
 *   - 禁止与 shared/domain/valueObjects 中的类型重复定义——本文件聚合和扩展共享类型
 */

import type { PendulumParams, InitialConditions, StateVector } from "@/shared/domain/valueObjects";
import type { AppMode } from "@/shared/domain/valueObjects";

// ─── 品牌类型（编译期类型安全） ──────────────────

declare const Brand: unique symbol;
type Branded<T, B> = T & { [Brand]: B };

/** 快照唯一标识符 */
export type SnapshotID = Branded<string, "SnapshotID">;

/** 故事脚本版本号 */
export type ScriptVersion = Branded<string, "ScriptVersion">;

// ─── STY-01: 故事脚本引擎 ────────────────────────

/**
 * @contract StoryStage — 故事脚本中的单个阶段定义。
 *
 * 前置: 由 StoryScriptEngine 在编译时/加载时解析
 * 后置: 用于按时间轴调度阶段切换和字幕显示
 * 输入约束:
 *   - startTime: 阶段开始时间 (s)，≥ 0，阶段间单调递增
 *   - duration: 阶段持续时长 (s)，> 0
 *   - targetMode: 目标 AppMode，必须存在于 MODE_REGISTRY 中
 *   - subtitle: 底部电影式字幕文本，≤ 120 字符
 *   - highlightedControls: 当前阶段脉冲高亮的控件 ID 列表（空 = 不高亮）
 *   - cameraConfig: 可选相机配置（方位角/仰角/距离）
 *   - params: 可选参数注入（切换到此阶段时自动 setParams）
 * 输出约束: 7 个阶段组成完整脚本，总时长 210s (3 分 30 秒)
 * 异常: 无——纯数据容器
 * Side Effects: 无
 */
export interface StoryStage {
  /** 阶段开始时间 (s) */
  startTime: number;
  /** 阶段持续时长 (s) */
  duration: number;
  /** 目标模式 */
  targetMode: AppMode;
  /** 底部字幕文本 */
  subtitle: string;
  /** 脉冲高亮控件 ID 列表 */
  highlightedControls: string[];
  /** 可选相机配置 */
  cameraConfig?: CameraConfig;
  /** 可选参数注入（包含物理参数与初始条件——运行时按 key 分流） */
  params?: Partial<PendulumParams & InitialConditions>;
}

/**
 * @contract CameraConfig — 相机姿态配置。
 *
 * 用于故事阶段切换和快照恢复时的视角设定。
 * 前置: 相机组件已挂载
 * 后置: OrbitControls 更新至目标姿态
 * 输入约束:
 *   - azimuth: 方位角 (rad)，[0, 2π)
 *   - elevation: 仰角 (rad)，[-π/2, π/2]
 *   - distance: 相机距离 (m)，> 0
 * 输出约束: 三个字段均为有限值
 * 异常: 无
 * Side Effects: 无——纯配置数据
 */
export interface CameraConfig {
  azimuth: number;
  elevation: number;
  distance: number;
}

/**
 * @contract StoryPlaybackState — 故事播放的完整状态。
 *
 * 前置: StoryScriptEngine 已初始化
 * 后置: UI 消费此状态做进度条、字幕、控件高亮
 * 输入约束: 各字段独立有效
 * 输出约束: progress ∈ [0, 1]
 * 异常: 无
 * Side Effects: 无
 */
export interface StoryPlaybackState {
  isPlaying: boolean;
  isInterrupted: boolean;
  currentStage: number;
  totalStages: number;
  elapsedTime: number;
  totalDuration: number;
  progress: number;
  currentSubtitle: string;
  highlightedControls: string[];
  /** 当前激活的模式 */
  currentMode: AppMode;
}

// ─── STY-02: 演示模式 ────────────────────────────

/**
 * @contract DemoModeConfig — 演示模式的配置。
 *
 * 前置: 在进入演示模式前由 DemoModeManager 读取
 * 后置: 应用此配置后隐藏所有 UI 控件、启动自动巡游
 * 输入约束:
 *   - autoRotateSpeed: 自动环绕角速度 (°/s)，默认 0.5，范围 [0.1, 5.0]
 *   - watermarkText: 水印文本，≤ 80 字符
 *   - hideUI: 是否隐藏所有控制面板/图表/导航栏
 *   - idleTimeout: 无人操作超时进入演示模式 (s)，0 = 禁用
 * 输出约束: 所有字段为有效值
 * 异常: 无
 * Side Effects: 无
 */
export interface DemoModeConfig {
  autoRotateSpeed: number;
  watermarkText: string;
  hideUI: boolean;
  idleTimeout: number;
}

/** 演示模式默认配置 */
export const DEFAULT_DEMO_CONFIG: DemoModeConfig = {
  autoRotateSpeed: 0.5,
  watermarkText: "Chaos Pendulum · 双摆混沌实验室",
  hideUI: true,
  idleTimeout: 30,
} as const;

// ─── DAT-01: 状态快照 ────────────────────────────

/**
 * @contract Snapshot — 完整仿真状态快照实体。
 *
 * 包含恢复仿真所需的全部数据：参数、状态向量、尾迹历史、缩略图和相机姿态。
 *
 * 前置: 仿真运行中或暂停中
 * 后置: 持久化到 IndexedDB，通过缩略卡片列表浏览
 * 输入约束:
 *   - id: 唯一标识符 (uuid v4)
 *   - timestamp: ISO 8601 格式时间戳
 *   - params: 完整的 PendulumParams
 *   - stateVector: [θ₁, ω₁, θ₂, ω₂] 四元素数组
 *   - trail: 尾迹历史坐标数组（扁平化 [x1,y1,x2,y2,...]）
 *   - thumbnail: base64 编码的 64px PNG 缩略图
 *   - mode: 快照时的 AppMode
 *   - cameraConfig: 快照时的相机姿态
 *   - simTime: 快照时的仿真时间 (s)
 *   - label: 可选手动标签
 * 输出约束: 所有字段完整，trail 长度 ≤ 1200 个坐标点
 * 异常: 无——纯数据容器
 * Side Effects: 无
 */
export interface Snapshot {
  id: SnapshotID;
  timestamp: string;
  params: PendulumParams;
  stateVector: StateVector;
  trail: number[];
  thumbnail: string;
  mode: AppMode;
  cameraConfig: CameraConfig;
  simTime: number;
  label?: string;
}

/**
 * @contract SnapshotMeta — 快照列表项元数据（轻量视图）。
 *
 * 用于快照卡片列表展示，不包含完整状态数据。
 * 与 shared/domain/valueObjects/app.ts 中的 SnapshotMeta 保持兼容。
 *
 * 前置: 从 Snapshot 实体中提取
 * 后置: UI 渲染缩略卡片列表
 * 输入约束:
 *   - id: SnapshotID 的字符串形式
 *   - timestamp: ISO 8601 格式
 *   - label: 可选手动标签
 *   - thumbnail: base64 编码的 64px PNG
 *   - simTime: 快照时的仿真时间 (s)
 *   - mode: 快照时的 AppMode
 * 输出约束: 所有字段完整
 * 异常: 无
 * Side Effects: 无
 */
export interface SnapshotMeta {
  id: string;
  timestamp: string;
  label?: string;
  thumbnail: string;
  simTime: number;
  mode: AppMode;
}

/**
 * @contract SnapshotComparison — 双快照参数差异表。
 *
 * 前置: 两个快照均已加载
 * 后置: UI 渲染差异表和轨迹叠加视图
 * 输入约束:
 *   - snapshotA / snapshotB: 有效的 Snapshot 实体
 * 输出约束:
 *   - paramDiffs: 每个参数维度的差异记录
 *   - hasDifference: 是否存在任何参数差异
 * 异常: 无
 * Side Effects: 无
 */
export interface SnapshotComparison {
  snapshotA: SnapshotMeta;
  snapshotB: SnapshotMeta;
  paramDiffs: ParamDiff[];
  hasDifference: boolean;
}

/**
 * @contract ParamDiff — 单个参数维度的差异记录。
 *
 * 输入约束:
 *   - key: 参数键名（如 "m1", "theta1"）
 *   - label: 参数中文标签
 *   - valueA / valueB: 两个快照中的值
 *   - delta: valueB - valueA
 * 输出约束: unit 非空字符串
 * 异常: 无
 * Side Effects: 无
 */
export interface ParamDiff {
  key: string;
  label: string;
  unit: string;
  valueA: number;
  valueB: number;
  delta: number;
}

// ─── DAT-02: 数据导出 ────────────────────────────

/**
 * @contract ExportFormat — 支持的导出格式枚举。
 */
export type ExportFormat = "csv" | "json" | "png";

/**
 * @contract CSVExportConfig — CSV 导出配置。
 *
 * 输入约束:
 *   - headers: 14 字段时序数据（角度/角速度/坐标/能量/时间戳）
 *   - rows: 非空二维数组
 *   - filename: 不含扩展名的文件名
 * 输出约束: 触发浏览器下载 .csv 文件
 * 异常: 无
 * Side Effects: 触发浏览器 Blob 下载
 */
export interface CSVExportConfig {
  headers: string[];
  rows: number[][];
  filename: string;
}

/**
 * @contract JSONExportConfig — JSON 场景文件导出配置。
 *
 * 输入约束:
 *   - params: 完整的 PendulumParams
 *   - trajectory: 轨迹数据数组（不含尾迹历史——数据量过大）
 *   - filename: 不含扩展名的文件名
 * 输出约束: 触发浏览器下载 .json 文件
 * 异常: 无
 * Side Effects: 触发浏览器 Blob 下载
 */
export interface JSONExportConfig {
  params: PendulumParams;
  trajectory: StateVector[];
  metadata: {
    exportedAt: string;
    version: string;
    simTime: number;
  };
  filename: string;
}

/**
 * @contract PNGExportConfig — PNG 截图导出配置。
 *
 * 输入约束:
 *   - canvas: HTMLCanvasElement（3D 视图/相空间图/分岔图/庞加莱截面）
 *   - filename: 不含扩展名的文件名
 *   - resolution: 输出分辨率倍数（1 = 原始, 2 = 2x, 4 = 4K 最大）
 * 输出约束: resolution ∈ [1, 4]，触发浏览器下载 .png 文件
 * 异常: DataExportError — canvas 为 null 或 resolution 超限
 * Side Effects: 触发浏览器 Blob 下载
 */
export interface PNGExportConfig {
  canvas: HTMLCanvasElement;
  filename: string;
  resolution: number;
}

// ─── DAT-03: 历史回放与分叉 ──────────────────────

/**
 * @contract PlaybackState — 历史回放的完整状态。
 *
 * 前置: 仿真已暂停
 * 后置: UI 渲染时间轴滑块和回放指示器
 * 输入约束:
 *   - currentTime: 当前回放时间 (s)，在 RingBuffer 范围内
 *   - totalTime: 已录制总时长 (s)
 *   - ringBufferSize: RingBuffer 当前帧数
 *   - ringBufferCapacity: RingBuffer 容量（6000 帧 = 100s @60fps）
 *   - isSeeking: 是否正在拖拽时间轴
 * 输出约束: currentTime ≤ totalTime ≤ ringBufferCapacity / 60
 * 异常: 无
 * Side Effects: 无
 */
export interface PlaybackState {
  currentTime: number;
  totalTime: number;
  ringBufferSize: number;
  ringBufferCapacity: number;
  isSeeking: boolean;
}

/**
 * @contract ForkConfig — 分叉演化的配置。
 *
 * 前置: 用户已通过回放选择历史时刻
 * 后置: 创建新 Worker 实例从该时刻开始演化
 * 输入约束:
 *   - forkTime: 分叉起始时间 (s)，在 RingBuffer 范围内
 *   - initialState: 从 ringBuffer.at(forkTime) 提取的 StateVector
 *   - modifiedParams: 用户修改后的参数（仅含修改的字段）
 * 输出约束: forkTime ≥ 0, initialState 四个字段均为有限值
 * 异常: ForkError — forkTime 超出范围或 initialState 无效
 * Side Effects: 创建新 Worker 实例
 */
export interface ForkConfig {
  forkTime: number;
  initialState: StateVector;
  modifiedParams: Partial<PendulumParams>;
}

/**
 * @contract GhostTrailConfig — 幽灵尾迹配置。
 *
 * 原始轨迹以半透明形式保留作为分叉对照。
 *
 * 前置: 分叉已启动
 * 后置: 3D 场景渲染原始轨迹（半透明）+ 新轨迹（正常）
 * 输入约束:
 *   - opacity: 透明度 [0, 1]，默认 0.3
 *   - color: 颜色十六进制字符串
 *   - trailData: 分叉前的原始轨迹数据
 * 输出约束: opacity ∈ [0, 1]
 * 异常: 无
 * Side Effects: 无——配置数据，由 TrailRenderer 消费
 */
export interface GhostTrailConfig {
  opacity: number;
  color: string;
  trailData: StateVector[];
}

// ─── 常量 ─────────────────────────────────────────

/** IndexedDB 数据库名称 */
export const SNAPSHOT_DB_NAME = "chaos-pendulum-snapshots";

/** IndexedDB 数据库版本 */
export const SNAPSHOT_DB_VERSION = 1;

/** 快照存储对象名 */
export const SNAPSHOT_STORE_NAME = "snapshots";

/** 快照存储上限（LRU 策略） */
export const SNAPSHOT_MAX_COUNT = 50;

/** RingBuffer 容量：6000 帧 = 100s @60fps */
export const RING_BUFFER_CAPACITY = 6000;

/** 故事脚本总时长：210s = 3 分 30 秒 */
export const STORY_TOTAL_DURATION = 210;

/** 故事阶段数 */
export const STORY_STAGE_COUNT = 7;

/** PNG 导出最大分辨率倍数 */
export const PNG_MAX_RESOLUTION = 4;

/** 缩略图尺寸 (px) */
export const THUMBNAIL_SIZE = 64;

/** CSV 导出字段数（14 字段：t, θ1, ω1, θ2, ω2, x1, y1, x2, y2, K, V, E, α1, α2） */
export const CSV_FIELD_COUNT = 14;

/** CSV 字段头 */
export const CSV_HEADERS: string[] = [
  "t", "theta1", "omega1", "theta2", "omega2",
  "x1", "y1", "x2", "y2",
  "kineticEnergy", "potentialEnergy", "totalEnergy",
  "alpha1", "alpha2",
];
