import type { PendulumParams, InitialConditions, IntegratorMethod } from "./physics";

// ─── 帧布局常量 ──────────────────────────────────

/** 每帧占用的 float64 数 */
export const FRAME_STRIDE = 14;
/** 每批次帧数（2 秒 @60fps） */
export const FRAMES_PER_BATCH = 120;
/** 单批次 buffer 长度 */
export const BUFFER_LENGTH = FRAMES_PER_BATCH * FRAME_STRIDE; // = 1680

/** 每帧力数据占用的 float64 数（20 个力字段，含 ball 2 完整方向角 + 4 保留） */
export const FORCE_STRIDE = 20;
/** 单批次力数据 buffer 长度 */
export const FORCE_BUFFER_LENGTH = FRAMES_PER_BATCH * FORCE_STRIDE; // = 2400

/**
 * 单帧字段偏移:
 *   [0]  t               仿真时间 (s)
 *   [1]  theta1          上摆角度 (rad)
 *   [2]  theta1Dot       上摆角速度 (rad/s)
 *   [3]  theta2          下摆角度 (rad)
 *   [4]  theta2Dot       下摆角速度 (rad/s)
 *   [5]  x1              上摆球 x 坐标 (m)
 *   [6]  y1              上摆球 y 坐标 (m, 物理坐标系 y↑)
 *   [7]  x2              下摆球 x 坐标 (m)
 *   [8]  y2              下摆球 y 坐标 (m, 物理坐标系 y↑)
 *   [9]  kineticEnergy   动能 (J)
 *   [10] potentialEnergy 势能 (J)
 *   [11] totalEnergy     总能量 (J)
 *   [12] alpha1          上摆角加速度 (rad/s²)
 *   [13] alpha2          下摆角加速度 (rad/s²)
 */
export const enum FrameField {
  T = 0,
  THETA1 = 1,
  THETA1_DOT = 2,
  THETA2 = 3,
  THETA2_DOT = 4,
  X1 = 5,
  Y1 = 6,
  X2 = 7,
  Y2 = 8,
  KINETIC_ENERGY = 9,
  POTENTIAL_ENERGY = 10,
  TOTAL_ENERGY = 11,
  ALPHA1 = 12,
  ALPHA2 = 13,
}

/**
 * 力数据字段偏移（每帧 20 个 float64）:
 *   [0]  Fg1_mag      上摆重力大小 (N)
 *   [1]  Fg1_angle    上摆重力方向角 (rad)，固定 -π/2
 *   [2]  T1_mag       杆 1 张力大小 (N)
 *   [3]  T1_angle     杆 1 张力方向角 (rad)，沿杆向上
 *   [4]  Fi1_t_mag    上摆切向惯性力大小 (N)
 *   [5]  Fi1_t_angle  上摆切向惯性力方向角 (rad)
 *   [6]  Fi1_n_mag    上摆法向惯性力大小 (N)
 *   [7]  Fi1_n_angle  上摆法向惯性力方向角 (rad)
 *   [8]  Fg2_mag      下摆重力大小 (N)
 *   [9]  Fg2_angle    下摆重力方向角 (rad)，固定 -π/2
 *   [10] T2_mag       杆 2 张力大小 (N)
 *   [11] T2_angle     杆 2 张力方向角 (rad)，沿杆向上
 *   [12] Fi2_t_mag    下摆切向惯性力大小 (N)
 *   [13] Fi2_t_angle  下摆切向惯性力方向角 (rad)
 *   [14] Fi2_n_mag    下摆法向惯性力大小 (N)
 *   [15] Fi2_n_angle  下摆法向惯性力方向角 (rad)
 *   [16..19] 保留
 */
export const enum ForceField {
  FG1_MAG = 0,
  FG1_ANGLE = 1,
  T1_MAG = 2,
  T1_ANGLE = 3,
  FI1_T_MAG = 4,
  FI1_T_ANGLE = 5,
  FI1_N_MAG = 6,
  FI1_N_ANGLE = 7,
  FG2_MAG = 8,
  FG2_ANGLE = 9,
  T2_MAG = 10,
  T2_ANGLE = 11,
  FI2_T_MAG = 12,
  FI2_T_ANGLE = 13,
  FI2_N_MAG = 14,
  FI2_N_ANGLE = 15,
}

/** 力极值记录 */
export interface ForceExtremaItem {
  value: number;
  time: number;
}

/** 仿真全程力极值 */
export interface ForceExtrema {
  T1_max: ForceExtremaItem;
  T1_min: ForceExtremaItem;
  T2_max: ForceExtremaItem;
  T2_min: ForceExtremaItem;
}

// ─── 消息协议：主线程 → Worker ────────────────────

export interface WorkerInitCommand {
  type: "init";
  params: PendulumParams;
  initialConditions: InitialConditions;
  method: IntegratorMethod;
}

export interface PoincareSectionCondition {
  variable: "theta1" | "theta2" | "omega1" | "omega2";
  targetValue: number;
  direction: "positive" | "negative" | "both";
}

export interface PoincarePoint {
  theta2: number;
  omega2: number;
  time: number;
  batchIndex: number;
}

export interface WorkerStepCommand {
  type: "step";
  /** 从池中 acquire 的空闲 Float64Array，所有权已 transfer */
  buffer: Float64Array;
  /** 庞加莱截面条件；非空时 Worker 执行穿越检测 */
  poincare?: PoincareSectionCondition | null;
}

export interface WorkerUpdateParamsCommand {
  type: "updateParams";
  params: Partial<PendulumParams>;
}

export interface WorkerResetCommand {
  type: "reset";
  initialConditions: InitialConditions;
}

export interface WorkerSetDirectionCommand {
  type: "setDirection";
  direction: 1 | -1;
}

export interface WorkerSetMethodCommand {
  type: "setMethod";
  method: IntegratorMethod;
}

export interface WorkerConfigCommand {
  type: "config";
  computeForces?: boolean;
}

export type WorkerCommand =
  | WorkerInitCommand
  | WorkerStepCommand
  | WorkerUpdateParamsCommand
  | WorkerResetCommand
  | WorkerSetDirectionCommand
  | WorkerSetMethodCommand
  | WorkerConfigCommand;

// ─── 消息协议：Worker → 主线程 ────────────────────

export interface WorkerReadyResponse {
  type: "ready";
}

export interface WorkerBatchReadyResponse {
  type: "batchReady";
  /** 填充了帧数据的 Float64Array，所有权已 transfer 回主线程 */
  buffer: Float64Array;
  /** 本批次实际填充的帧数 */
  frameCount: number;
  /** 本批次最后一帧的仿真时间 (s) */
  simTime: number;
  /** 本批次检测到的庞加莱截面点 */
  poincarePoints?: PoincarePoint[];
  /** 力分量数据 Float64Array（computeForces 激活时非空） */
  forceData?: Float64Array;
  /** 仿真全程力极值（computeForces 激活时非空） */
  forceExtrema?: ForceExtrema;
  /** 本批次能量投影累积校正量 (J)，仅 damping=0 时非零 */
  energyCorrection?: number;
}

export type ErrorCode = "DIVERGED" | "TIMEOUT" | "INVALID_STATE";

export interface WorkerErrorResponse {
  type: "error";
  code: ErrorCode;
  message: string;
  simTime: number;
}

export type WorkerResponse =
  | WorkerReadyResponse
  | WorkerBatchReadyResponse
  | WorkerErrorResponse;
