import { useRootStore } from "@/stores/rootStore";
import type {
  ButterflySlice,
  DeltaEditMode,
  SeparationMetrics,
  SimSideState,
  EnergySnapshot,
} from "@/stores/slices/butterflySlice";

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
