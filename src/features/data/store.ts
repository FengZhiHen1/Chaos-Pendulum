import { useRootStore } from "@/stores/rootStore";
import type { DataSlice } from "@/stores/slices/dataSlice";

function useDataStore(): DataSlice;
function useDataStore<T>(selector: (state: DataSlice) => T): T;
function useDataStore<T>(selector?: (state: DataSlice) => T): DataSlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as DataSlice;
}

useDataStore.getState = () => useRootStore.getState() as DataSlice;
useDataStore.setState = (partial: Partial<DataSlice> | ((state: DataSlice) => Partial<DataSlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useDataStore.subscribe = (listener: (state: DataSlice, prevState: DataSlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useDataStore };
