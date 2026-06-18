import type { StateCreator } from "zustand";

type ViewPreset = "side" | "top" | "chaos";
type TrailLength = 50 | 200 | 1000 | 0 | -1; // 0 = infinite, -1 = cycle-only

export type ReversalMode = "exact" | "numerical";
export type ReversalPhase = "idle" | "recording" | "reversing" | "completed" | "paused" | "awaitingConfirm";

/** 漂移距离采样点 */
export interface DriftSample {
  reversalTime: number;
  driftDistance: number;
  forwardSimTime: number;
}

export interface ExploreSlice {
  viewPreset: ViewPreset;
  trailLength: TrailLength;
  maxTrailLength: number;
  sonificationEnabled: boolean;
  butterflyDelta: number;
  timeReversalMode: ReversalMode;

  // ── EXP-05 时间反演 ──
  timeReversalIntroOpen: boolean;
  timeReversalActive: boolean;
  timeReversalStartTime: number;
  reversalPhase: ReversalPhase;
  driftHistory: DriftSample[];
  annotationDismissed: boolean;

  // ── 混沌检测 ──
  chaosVariance: number;

  setViewPreset: (preset: ViewPreset) => void;
  setTrailLength: (length: TrailLength) => void;
  setMaxTrailLength: (length: number) => void;
  setSonificationEnabled: (on: boolean) => void;
  setButterflyDelta: (delta: number) => void;
  setTimeReversalMode: (mode: ReversalMode) => void;

  setTimeReversalActive: (active: boolean) => void;
  setTimeReversalStartTime: (time: number) => void;
  setReversalPhase: (phase: ReversalPhase) => void;
  setTimeReversalIntroOpen: (open: boolean) => void;
  appendDriftSample: (sample: DriftSample) => void;
  clearDriftHistory: () => void;
  dismissAnnotation: () => void;
  resetAnnotation: () => void;
  resetReversalState: () => void;

  setChaosState: (variance: number) => void;
}

export const createExploreSlice: StateCreator<ExploreSlice, [], [], ExploreSlice> = (set) => ({
  viewPreset: "side",
  trailLength: 200,
  maxTrailLength: 1000,
  sonificationEnabled: false,
  butterflyDelta: 0.001,
  timeReversalMode: "numerical",

  timeReversalIntroOpen: false,
  timeReversalActive: false,
  timeReversalStartTime: 0,
  reversalPhase: "idle",
  driftHistory: [],
  annotationDismissed: false,

  chaosVariance: 0,

  setViewPreset: (viewPreset) => set({ viewPreset }),
  setTrailLength: (trailLength) => set({ trailLength }),
  setMaxTrailLength: (maxTrailLength) => set({ maxTrailLength }),
  setSonificationEnabled: (sonificationEnabled) => set({ sonificationEnabled }),
  setButterflyDelta: (butterflyDelta) =>
    set({ butterflyDelta: Math.max(1e-6, Math.min(10, butterflyDelta)) }),
  setTimeReversalMode: (timeReversalMode) => set({ timeReversalMode }),

  setTimeReversalActive: (timeReversalActive) => set({ timeReversalActive }),
  setTimeReversalStartTime: (timeReversalStartTime) => set({ timeReversalStartTime }),
  setReversalPhase: (reversalPhase) => set({ reversalPhase }),
  setTimeReversalIntroOpen: (timeReversalIntroOpen) => set({ timeReversalIntroOpen }),
  appendDriftSample: (sample) =>
    set((s) => ({ driftHistory: [...s.driftHistory, sample] })),
  clearDriftHistory: () => set({ driftHistory: [] }),
  dismissAnnotation: () => set({ annotationDismissed: true }),
  resetAnnotation: () => set({ annotationDismissed: false }),

  setChaosState: (chaosVariance) => set({ chaosVariance }),

  resetReversalState: () =>
    set({
      timeReversalIntroOpen: false,
      timeReversalActive: false,
      reversalPhase: "idle",
      timeReversalStartTime: 0,
      driftHistory: [],
      annotationDismissed: false,
    }),
});
