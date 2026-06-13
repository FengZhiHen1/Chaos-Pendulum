import { useRootStore } from "@/stores/rootStore";
import type { SimulationSlice, SimulationFrame } from "@/stores/slices/simulationSlice";

function useSimulationStore(): SimulationSlice;
function useSimulationStore<T>(selector: (state: SimulationSlice) => T): T;
function useSimulationStore<T>(selector?: (state: SimulationSlice) => T): SimulationSlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as SimulationSlice;
}

useSimulationStore.getState = () => useRootStore.getState() as SimulationSlice;
useSimulationStore.setState = (partial: Partial<SimulationSlice> | ((state: SimulationSlice) => Partial<SimulationSlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useSimulationStore.subscribe = (listener: (state: SimulationSlice, prevState: SimulationSlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useSimulationStore };
export type { SimulationFrame };
export { readFrameField, getFrameSlice } from "@/stores/slices/simulationSlice";
