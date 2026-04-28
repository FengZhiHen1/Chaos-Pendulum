import { create } from "zustand";
import type { PendulumParams, IntegratorMethod } from "@/shared/types";
import { DEFAULT_PARAMS } from "@/shared/types";
import { FRAME_STRIDE, FRAMES_PER_BATCH, FrameField } from "@/shared/types";

/** 单帧完整仿真数据，对齐 Float64Array 帧布局的 14 个字段 */
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

const defaultFrame: SimulationFrame = {
  t: 0,
  theta1: Math.PI / 2,
  theta1Dot: 0,
  theta2: Math.PI / 2,
  theta2Dot: 0,
  x1: 1,
  y1: 0,
  x2: 2,
  y2: 0,
  kineticEnergy: 0,
  potentialEnergy: -19.62,
  totalEnergy: -19.62,
  alpha1: 0,
  alpha2: 0,
};

interface SimulationState extends SimulationFrame {
  params: PendulumParams;
  method: IntegratorMethod;
  isRunning: boolean;
  engineError: string | null;

  setParams: (patch: Partial<PendulumParams>) => void;
  setMethod: (method: IntegratorMethod) => void;
  setRunning: (running: boolean) => void;
  setEngineError: (error: string | null) => void;

  /** 从 Float64Array buffer 中消费一帧写入 store */
  consumeFrameFromBuffer: (buffer: Float64Array, frameIndex: number) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  ...defaultFrame,
  params: { ...DEFAULT_PARAMS },
  method: "RK4",
  isRunning: false,
  engineError: null,

  setParams: (patch) =>
    set((s) => ({ params: { ...s.params, ...patch } })),

  setMethod: (method) => set({ method }),

  setRunning: (isRunning) => set({ isRunning }),

  setEngineError: (engineError) => set({ engineError }),

  consumeFrameFromBuffer: (buffer, frameIndex) => {
    const offset = frameIndex * FRAME_STRIDE;
    if (offset + FRAME_STRIDE > buffer.length) return;
    set({
      t:              buffer[offset + FrameField.T]!,
      theta1:         buffer[offset + FrameField.THETA1]!,
      theta1Dot:      buffer[offset + FrameField.THETA1_DOT]!,
      theta2:         buffer[offset + FrameField.THETA2]!,
      theta2Dot:      buffer[offset + FrameField.THETA2_DOT]!,
      x1:             buffer[offset + FrameField.X1]!,
      y1:             buffer[offset + FrameField.Y1]!,
      x2:             buffer[offset + FrameField.X2]!,
      y2:             buffer[offset + FrameField.Y2]!,
      kineticEnergy:  buffer[offset + FrameField.KINETIC_ENERGY]!,
      potentialEnergy:buffer[offset + FrameField.POTENTIAL_ENERGY]!,
      totalEnergy:    buffer[offset + FrameField.TOTAL_ENERGY]!,
      alpha1:         buffer[offset + FrameField.ALPHA1]!,
      alpha2:         buffer[offset + FrameField.ALPHA2]!,
    });
  },
}));

// ─── 帧缓冲区工具函数 ──────────────────────────

/** 从缓冲区中读取第 i 帧的指定字段 */
export function readFrameField(
  buffer: Float64Array,
  frameIndex: number,
  fieldOffset: number,
): number {
  return buffer[frameIndex * FRAME_STRIDE + fieldOffset]!;
}

/** 获取第 i 帧的完整状态（零拷贝子视图） */
export function getFrameSlice(
  buffer: Float64Array,
  frameIndex: number,
): Float64Array {
  const start = frameIndex * FRAME_STRIDE;
  return buffer.subarray(start, start + FRAME_STRIDE);
}

/** 批量帧缓冲区预取阈值 */
export const BATCH_PREFETCH_THRESHOLD = 0.8 * FRAMES_PER_BATCH;
