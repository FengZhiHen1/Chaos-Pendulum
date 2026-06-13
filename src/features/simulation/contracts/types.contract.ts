/**
 * 模块: simulation.contracts.types
 * 职责: 定义 simulation 功能域的共享类型契约——帧数据、插值快照、能量数据点、
 *       Worker 消息协议扩展、仿真帧缓冲区布局。
 *       这些类型是域内统一的"类型宪法"，所有子模块（物理引擎、能量监控、相空间、调度器）共享同一套定义。
 * 数据来源:
 *   - FrameField (shared/domain/valueObjects): MUST — 帧缓冲区字段偏移常量
 *   - StateVector (shared/domain/valueObjects): MUST — 仿真状态向量
 * 边界:
 *   - 依赖: shared/domain/valueObjects (FrameField, StateVector, PendulumParams)
 *   - 被依赖: 本模块所有其他 contract 文件
 * 禁止行为:
 *   - 禁止在 types.contract 中包含可执行逻辑（纯类型定义文件）
 *   - 禁止类型定义中出现 `any` 类型（零 Any 容忍）
 *   - 禁止在共享 valueObjects 和本文件之间出现重复定义——本文件聚合和扩展共享类型
 */

// ───────────────────────────────────────────────
// @contract SimulationFrame — 单帧完整仿真数据
// ───────────────────────────────────────────────

/**
 * 单帧仿真数据——包含物理状态 + 笛卡尔坐标 + 能量 + 角加速度。
 *
 * 这是仿真模块的"通用货币"——Worker 产出它、Scheduler 消费它、Store 存储它、
 * EnergyCanvas 绘制它、PhaseSpaceCanvas 提取它。
 *
 * 前置: 由 computeDerived() + writeFrame() 联合产出
 * 后置: 所有数值字段为有限值（NaN 帧在 consumeFrameFromBuffer 中过滤）
 * 输入约束:
 *   - t: 非负有限值（反向积分除外）
 *   - theta1/2: 角度 (rad)，可能未归一化（归一化由消费方处理）
 *   - theta1Dot/2Dot: 角速度 (rad/s)
 *   - x1/y1/x2/y2: 笛卡尔坐标 (m)，物理坐标系 y↑
 *   - kineticEnergy ≥ 0
 *   - potentialEnergy 可为负（参考零点在 y=0）
 *   - totalEnergy = K + V
 *   - alpha1/2: 角加速度 (rad/s²)
 * 输出约束: 13 个字段均为 number，与 FrameField 枚举一一对应
 * 异常: 无——无效帧在创建前被 hasInvalidValue 拦截
 * Side Effects: 无——纯数据容器
 */
export interface SimulationFrame {
  t: number;
  theta1: number;
  theta1Dot: number;
  theta2: number;
  theta2Dot: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  alpha1: number;
  alpha2: number;
}

// ───────────────────────────────────────────────
// @contract InterpSnapshot — 渲染插值快照
// ───────────────────────────────────────────────

/**
 * 供 3D 渲染层使用的坐标插值快照。
 *
 * 前置: 从 SimulationFrame 中提取笛卡尔坐标
 * 后置: Scene3D 的 useFrame 使用 prev/curr 做帧间插值
 * 输入约束:
 *   - x1, y1: 上摆球坐标 (m)
 *   - x2, y2: 下摆球坐标 (m)
 * 输出约束: 四个字段均为有限值
 * 异常: 无
 * Side Effects: 无
 */
export interface InterpSnapshot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ───────────────────────────────────────────────
// @contract EnergyDataPoint — 能量曲线数据点
// ───────────────────────────────────────────────

/**
 * 能量曲线的单个数据点。
 *
 * 前置: 从 SimulationFrame 中提取能量分量
 * 后置: EnergyCanvas 使用此数据绘制 K/V/E 三线折线图
 * 输入约束:
 *   - t: 仿真时间 (s)
 *   - K: 动能 (J)，≥ 0
 *   - V: 势能 (J)，可为负
 *   - E: 总能量 (J)，E = K + V
 * 输出约束: 所有字段为有限值；K ≥ 0
 * 异常: 无
 * Side Effects: 无
 */
export interface EnergyDataPoint {
  t: number;
  K: number;
  V: number;
  E: number;
}

// ───────────────────────────────────────────────
// @contract DerivedValues — 派生计算值
// ───────────────────────────────────────────────

/**
 * 从积分后的状态计算出的派生值。
 *
 * 前置: state 已被 integrator.step() 更新
 * 后置: 用于写入帧缓冲区和力计算
 * 输入约束:
 *   - 笛卡尔坐标由角度和杆长计算
 *   - 能量由质量和速度计算
 *   - 角加速度由 computeAlphas() 计算
 * 输出约束: 所有字段为有限值
 * 异常: 无
 * Side Effects: 无——纯计算结果
 */
export interface DerivedValues {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  alpha1: number;
  alpha2: number;
}

// ───────────────────────────────────────────────
// @contract FrameBufferLayout — 帧缓冲区布局常量
// ───────────────────────────────────────────────

/**
 * 帧缓冲区布局——定义 Float64Array 中每帧 14 个字段的偏移。
 *
 * 前置: 与 shared/domain/valueObjects/simulation.ts 中的 FrameField 枚举一致
 * 后置: Worker 写入、Scheduler/Store 读取均使用此布局
 * 输入约束: FRAME_STRIDE = 14
 * 输出约束: reader/writer 函数基于此布局读写
 * 异常: 无
 * Side Effects: 无
 */
export const FRAME_BUFFER_LAYOUT = {
  stride: 14,          // 每帧 14 个 float64
  t: 0,                // 仿真时间 (s)
  theta1: 1,           // 上摆角度 (rad)
  theta1Dot: 2,        // 上摆角速度 (rad/s)
  theta2: 3,           // 下摆角度 (rad)
  theta2Dot: 4,        // 下摆角速度 (rad/s)
  x1: 5,               // 上摆球 x (m)
  y1: 6,               // 上摆球 y (m)
  x2: 7,               // 下摆球 x (m)
  y2: 8,               // 下摆球 y (m)
  kineticEnergy: 9,    // 动能 (J)
  potentialEnergy: 10, // 势能 (J)
  totalEnergy: 11,     // 总能量 (J)
  alpha1: 12,          // 上摆角加速度 (rad/s²)
  alpha2: 13,          // 下摆角加速度 (rad/s²)
} as const;

/** 每批次帧数（2 秒 @60fps） */
export const FRAMES_PER_BATCH = 120;

/** 预取阈值：activeBuffer 消费到此比例时开始请求下一批 */
export const BATCH_PREFETCH_THRESHOLD = 0.5 * FRAMES_PER_BATCH;

/** 单批次缓冲区长度 */
export const BATCH_BUFFER_LENGTH = FRAMES_PER_BATCH * FRAME_BUFFER_LAYOUT.stride; // = 1680

/** Float64Array 池配置 */
export const POOL_CONFIG = {
  count: 10,           // 池中缓冲区数量
  size: 4000,          // 每个缓冲区的 Float64 元素数 (> BATCH_BUFFER_LENGTH)
} as const;

// ───────────────────────────────────────────────
// @contract SimulationDefaults — 仿真默认值
// ───────────────────────────────────────────────

/**
 * 仿真默认值——为新仿真或重置操作提供回退值。
 *
 * 前置: 参数值在 PendulumParams / InitialConditions 的合法范围内
 * 后置: 用于 createSimulationSlice 初始化
 * 输入约束: 见各字段注解
 * 输出约束: 所有字段有合理的默认值
 * 异常: 无
 * Side Effects: 无
 */
export const SIMULATION_DEFAULTS = {
  /** 默认积分步长 = 1/60 秒 */
  dt: 1 / 60,
  /** 每帧最大消费帧数（防止累积滞后） */
  maxTicksPerFrame: 3,
  /** Worker 积分超时 (ms) */
  workerTimeoutMs: 2000,
  /** 积分精度 (RKF45 默认容差) */
  rkf45Tolerance: 1e-7,
} as const;
