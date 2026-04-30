import type { StateCreator } from "zustand";

export interface StorySlice {
  isPlaying: boolean;
  currentStage: number;
  isInterrupted: boolean;
  demoMode: boolean;

  play: () => void;
  pause: () => void;
  reset: () => void;
  setStage: (stage: number) => void;
  setDemoMode: (on: boolean) => void;
}

export const createStorySlice: StateCreator<StorySlice, [], [], StorySlice> = (set) => ({
  isPlaying: false,
  currentStage: 0,
  isInterrupted: false,
  demoMode: false,

  play: () => set({ isPlaying: true, isInterrupted: false }),
  pause: () => set({ isPlaying: false, isInterrupted: true }),
  reset: () => set({ isPlaying: false, currentStage: 0, isInterrupted: false }),
  setStage: (currentStage) => set({ currentStage }),
  setDemoMode: (demoMode) => set({ demoMode }),
});
