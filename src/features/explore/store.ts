import { create } from "zustand";

type ViewPreset = "side" | "top" | "chaos";
type TrailLength = 50 | 200 | 1000 | 0 | -1; // 0 = infinite, -1 = cycle-only

interface ExploreState {
  viewPreset: ViewPreset;
  trailLength: TrailLength;
  maxTrailLength: number;
  sonificationEnabled: boolean;
  butterflyDelta: number;
  timeReversalMode: "exact" | "numerical";

  setViewPreset: (preset: ViewPreset) => void;
  setTrailLength: (length: TrailLength) => void;
  setMaxTrailLength: (length: number) => void;
  setSonificationEnabled: (on: boolean) => void;
  setButterflyDelta: (delta: number) => void;
  setTimeReversalMode: (mode: "exact" | "numerical") => void;
}

export const useExploreStore = create<ExploreState>((set) => ({
  viewPreset: "side",
  trailLength: 200,
  maxTrailLength: 1000,
  sonificationEnabled: false,
  butterflyDelta: 0.001,
  timeReversalMode: "numerical",

  setViewPreset: (viewPreset) => set({ viewPreset }),
  setTrailLength: (trailLength) => set({ trailLength }),
  setMaxTrailLength: (maxTrailLength) => set({ maxTrailLength }),
  setSonificationEnabled: (sonificationEnabled) => set({ sonificationEnabled }),
  setButterflyDelta: (butterflyDelta) => set({ butterflyDelta }),
  setTimeReversalMode: (timeReversalMode) => set({ timeReversalMode }),
}));
