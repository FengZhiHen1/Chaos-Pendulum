import { RingBuffer } from "@/features/data";
import type { StateVector } from "@/shared/types";
import { useSimulationStore } from "./store";

const HISTORY_CAPACITY = 6000; // 100s @ 60fps

const historyBuffer = new RingBuffer<StateVector>(HISTORY_CAPACITY);
let recordingPaused = false;

/** 追加正向轨迹历史帧（由调度器每帧调用） */
export function pushSimulationHistory(state: StateVector): void {
  if (recordingPaused) return;
  historyBuffer.push({ ...state });
}

/** 暂停历史记录（反演期间调用，防止反向帧污染正向历史） */
export function pauseHistoryRecording(): void {
  recordingPaused = true;
}

/** 恢复历史记录 */
export function resumeHistoryRecording(): void {
  recordingPaused = false;
}

/** 获取完整正向轨迹历史（按时间顺序） */
export function getSimulationHistory(): StateVector[] {
  return historyBuffer.toArray();
}

/** 获取历史长度 */
export function getHistoryLength(): number {
  return historyBuffer.length;
}

/** 清空历史（仿真重置时调用） */
export function clearSimulationHistory(): void {
  historyBuffer.clear();
}

/**
 * 正向轨迹历史 Hook。
 * 订阅仿真帧更新，返回只读历史数据。
 * EXP-05 时间反演实验的精确反演模式数据源。
 */
export function useSimulationHistory() {
  // 每帧仿真更新时触发重渲染
  useSimulationStore((s) => s.t);

  return {
    /** 返回时间顺序的完整历史副本 */
    toArray: () => historyBuffer.toArray(),
    /** 当前历史帧数 */
    length: historyBuffer.length,
  } as const;
}
