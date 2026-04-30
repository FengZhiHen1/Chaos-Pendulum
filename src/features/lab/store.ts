import { useRootStore } from "@/stores/rootStore";
import type { LabSlice } from "@/stores/slices/labSlice";

function useLabStore(): LabSlice;
function useLabStore<T>(selector: (state: LabSlice) => T): T;
function useLabStore<T>(selector?: (state: LabSlice) => T): LabSlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as LabSlice;
}

useLabStore.getState = () => useRootStore.getState() as LabSlice;
useLabStore.setState = (partial: Partial<LabSlice> | ((state: LabSlice) => Partial<LabSlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useLabStore.subscribe = (listener: (state: LabSlice, prevState: LabSlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useLabStore };
