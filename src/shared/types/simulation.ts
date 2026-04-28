import type { PendulumParams, InitialConditions, IntegratorMethod } from "./physics";

// ─── 帧布局常量 ──────────────────────────────────

/** 每帧占用的 float64 数 */
export const FRAME_STRIDE = 14;
/** 每批次帧数（2 秒 @60fps） */
export const FRAMES_PER_BATCH = 120;
/** 单批次 buffer 长度 */
export const BUFFER_LENGTH = FRAMES_PER_BATCH * FRAME_STRIDE; // = 1680

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

// ─── 消息协议：主线程 → Worker ────────────────────

export interface WorkerInitCommand {
  type: "init";
  params: PendulumParams;
  initialConditions: InitialConditions;
  method: IntegratorMethod;
}

export interface WorkerStepCommand {
  type: "step";
  /** 从池中 acquire 的空闲 Float64Array，所有权已 transfer */
  buffer: Float64Array;
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

export type WorkerCommand =
  | WorkerInitCommand
  | WorkerStepCommand
  | WorkerUpdateParamsCommand
  | WorkerResetCommand
  | WorkerSetDirectionCommand
  | WorkerSetMethodCommand;

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
