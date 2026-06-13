import { useRootStore } from "@/stores/rootStore";
import type { AnalyzeSlice, AnalysisView } from "./viewModel/stores/analyzeSlice";

function useAnalyzeStore(): AnalyzeSlice;
function useAnalyzeStore<T>(selector: (state: AnalyzeSlice) => T): T;
function useAnalyzeStore<T>(selector?: (state: AnalyzeSlice) => T): AnalyzeSlice | T {
  if (selector) {
    return useRootStore(selector as (state: unknown) => T);
  }
  return useRootStore() as AnalyzeSlice;
}

useAnalyzeStore.getState = () => useRootStore.getState() as AnalyzeSlice;
useAnalyzeStore.setState = (partial: Partial<AnalyzeSlice> | ((state: AnalyzeSlice) => Partial<AnalyzeSlice>), replace?: boolean) =>
  useRootStore.setState(partial as any, replace);
useAnalyzeStore.subscribe = (listener: (state: AnalyzeSlice, prevState: AnalyzeSlice) => void) =>
  useRootStore.subscribe(listener as any);

export { useAnalyzeStore };
export type { AnalysisView };
