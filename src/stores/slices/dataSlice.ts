import type { StateCreator } from "zustand";

export interface DataSlice {
  snapshots: { id: string; label: string; timestamp: string }[];
  replayTime: number;
  isReplaying: boolean;
  forkActive: boolean;

  setSnapshots: (snapshots: DataSlice["snapshots"]) => void;
  setReplayTime: (t: number) => void;
  setReplaying: (replaying: boolean) => void;
  setForkActive: (active: boolean) => void;
}

export const createDataSlice: StateCreator<DataSlice, [], [], DataSlice> = (set) => ({
  snapshots: [],
  replayTime: 0,
  isReplaying: false,
  forkActive: false,

  setSnapshots: (snapshots) => set({ snapshots }),
  setReplayTime: (replayTime) => set({ replayTime }),
  setReplaying: (isReplaying) => set({ isReplaying }),
  setForkActive: (forkActive) => set({ forkActive }),
});
