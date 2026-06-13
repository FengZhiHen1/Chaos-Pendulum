import type { StateCreator } from "zustand";
import type { StateVector } from "@/shared/types";

const HISTORY_CAPACITY = 6000; // 100s @ 60fps

/** 简单 RingBuffer 实现，避免依赖 features/data */
class SimpleRingBuffer<T> {
  private buffer: T[] = [];
  private start = 0;
  private count = 0;

  constructor(private capacity: number) {}

  push(item: T): void {
    const idx = (this.start + this.count) % this.capacity;
    this.buffer[idx] = item;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(this.start + i) % this.capacity]!;
    }
    return result;
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = [];
    this.start = 0;
    this.count = 0;
  }
}

export interface HistorySlice {
  /** 正向轨迹历史（供时间反演等使用） */
  _historyBuffer: SimpleRingBuffer<StateVector>;
  _recordingPaused: boolean;

  pushHistory: (state: StateVector) => void;
  pauseHistory: () => void;
  resumeHistory: () => void;
  clearHistory: () => void;
  getHistoryArray: () => StateVector[];
  getHistoryLength: () => number;
}

export const createHistorySlice: StateCreator<HistorySlice, [], [], HistorySlice> = (set, get) => ({
  _historyBuffer: new SimpleRingBuffer<StateVector>(HISTORY_CAPACITY),
  _recordingPaused: false,

  pushHistory: (state) => {
    const s = get();
    if (!s._recordingPaused) {
      s._historyBuffer.push({ ...state });
    }
  },

  pauseHistory: () => set({ _recordingPaused: true }),

  resumeHistory: () => set({ _recordingPaused: false }),

  clearHistory: () => {
    const s = get();
    s._historyBuffer.clear();
    set({ _recordingPaused: false });
  },

  getHistoryArray: () => get()._historyBuffer.toArray(),

  getHistoryLength: () => get()._historyBuffer.length,
});
