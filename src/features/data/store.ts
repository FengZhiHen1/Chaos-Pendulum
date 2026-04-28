import { create } from "zustand";

interface DataState {
  snapshots: { id: string; label: string; timestamp: string }[];
  replayTime: number;
  isReplaying: boolean;
  forkActive: boolean;

  setSnapshots: (snapshots: DataState["snapshots"]) => void;
  setReplayTime: (t: number) => void;
  setReplaying: (replaying: boolean) => void;
  setForkActive: (active: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  snapshots: [],
  replayTime: 0,
  isReplaying: false,
  forkActive: false,

  setSnapshots: (snapshots) => set({ snapshots }),
  setReplayTime: (replayTime) => set({ replayTime }),
  setReplaying: (isReplaying) => set({ isReplaying }),
  setForkActive: (forkActive) => set({ forkActive }),
}));
