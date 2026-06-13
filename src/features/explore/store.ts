import { useRootStore } from "@/stores/rootStore";
import type { ExploreSlice, ReversalMode, ReversalPhase, DriftSample } from "./viewModel/stores/exploreSlice";

function useExploreStore(): ExploreSlice;
function useExploreStore<T>(selector: (state: ExploreSlice) => T): T;
function useExploreStore<T>(selector?: (state: ExploreSlice) => T): ExploreSlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as ExploreSlice;
}

useExploreStore.getState = () => useRootStore.getState() as ExploreSlice;
useExploreStore.setState = (partial: Partial<ExploreSlice> | ((state: ExploreSlice) => Partial<ExploreSlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useExploreStore.subscribe = (listener: (state: ExploreSlice, prevState: ExploreSlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useExploreStore };
export type { ReversalMode, ReversalPhase, DriftSample };
