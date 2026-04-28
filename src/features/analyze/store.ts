import { create } from "zustand";

type AnalysisView = "lyapunov" | "bifurcation" | "poincare" | "energy-landscape";

interface AnalyzeState {
  activeView: AnalysisView;
  poincareSection: { variable: "theta1" | "theta2"; value: number; direction: "positive" | "negative" };
  cacheStatus: "idle" | "loading" | "ready" | "error";

  setActiveView: (view: AnalysisView) => void;
  setPoincareSection: (section: AnalyzeState["poincareSection"]) => void;
  setCacheStatus: (status: AnalyzeState["cacheStatus"]) => void;
}

export const useAnalyzeStore = create<AnalyzeState>((set) => ({
  activeView: "lyapunov",
  poincareSection: { variable: "theta1", value: 0, direction: "positive" },
  cacheStatus: "idle",

  setActiveView: (activeView) => set({ activeView }),
  setPoincareSection: (poincareSection) => set({ poincareSection }),
  setCacheStatus: (cacheStatus) => set({ cacheStatus }),
}));
