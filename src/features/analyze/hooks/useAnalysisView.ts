import { useCallback } from "react";
import { useAnalyzeStore } from "../store";
import { useAppStore } from "@/stores/useAppStore";

export type AnalysisViewType =
  | "lyapunov"
  | "bifurcation"
  | "poincare"
  | "energy-landscape";

export interface UseAnalysisViewAPI {
  activeView: AnalysisViewType;
  setActiveView: (v: string) => void;
  loadStatus: string;
  isDesktop: boolean;
}

export function useAnalysisView(): UseAnalysisViewAPI {
  const activeView = useAnalyzeStore((s) => s.activeView);
  const setActiveViewStore = useAnalyzeStore((s) => s.setActiveView);
  const loadStatus = useAnalyzeStore((s) => s.loadStatus);
  const isDesktop = useAppStore((s) => s.deviceType === "desktop");

  const setActiveView = useCallback(
    (v: string) => setActiveViewStore(v as AnalysisViewType),
    [setActiveViewStore],
  );

  return {
    activeView: activeView as AnalysisViewType,
    setActiveView,
    loadStatus,
    isDesktop,
  };
}
