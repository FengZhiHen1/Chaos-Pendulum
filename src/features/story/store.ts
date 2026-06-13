import { useRootStore } from "@/stores/rootStore";
import type { StorySlice } from "./viewModel/stores/storySlice";

function useStoryStore(): StorySlice;
function useStoryStore<T>(selector: (state: StorySlice) => T): T;
function useStoryStore<T>(selector?: (state: StorySlice) => T): StorySlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as StorySlice;
}

useStoryStore.getState = () => useRootStore.getState() as StorySlice;
useStoryStore.setState = (partial: Partial<StorySlice> | ((state: StorySlice) => Partial<StorySlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useStoryStore.subscribe = (listener: (state: StorySlice, prevState: StorySlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useStoryStore };
