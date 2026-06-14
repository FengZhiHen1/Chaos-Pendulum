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

// ─── Butterfly Store（合并自 butterfly-store.ts）──────────────
import type {
  ButterflySlice,
  DeltaEditMode,
  SeparationMetrics,
  SimSideState,
  EnergySnapshot,
} from "./viewModel/stores/butterflySlice";

function useButterflyStore(): ButterflySlice;
function useButterflyStore<T>(selector: (state: ButterflySlice) => T): T;
function useButterflyStore<T>(selector?: (state: ButterflySlice) => T): ButterflySlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as ButterflySlice;
}

useButterflyStore.getState = () => useRootStore.getState() as ButterflySlice;
useButterflyStore.setState = (partial: Partial<ButterflySlice> | ((state: ButterflySlice) => Partial<ButterflySlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useButterflyStore.subscribe = (listener: (state: ButterflySlice, prevState: ButterflySlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useButterflyStore };
export type { DeltaEditMode, SeparationMetrics, SimSideState, EnergySnapshot };
