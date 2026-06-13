import { create } from "zustand";
import type { SimulationSlice } from "@/features/simulation/viewModel/stores/simulationSlice";
import type { ExploreSlice } from "@/features/explore/viewModel/stores/exploreSlice";
import type { AnalyzeSlice } from "@/features/analyze/viewModel/stores/analyzeSlice";
import type { LabSlice } from "@/features/lab/viewModel/stores/labSlice";
import type { DataSlice } from "@/features/data/viewModel/stores/dataSlice";
import type { StorySlice } from "@/features/story/viewModel/stores/storySlice";
import type { ButterflySlice } from "@/features/explore/viewModel/stores/butterflySlice";
import type { HistorySlice } from "@/features/simulation/viewModel/stores/historySlice";

import { createSimulationSlice } from "@/features/simulation/viewModel/stores/simulationSlice";
import { createExploreSlice } from "@/features/explore/viewModel/stores/exploreSlice";
import { createAnalyzeSlice } from "@/features/analyze/viewModel/stores/analyzeSlice";
import { createLabSlice } from "@/features/lab/viewModel/stores/labSlice";
import { createDataSlice } from "@/features/data/viewModel/stores/dataSlice";
import { createStorySlice } from "@/features/story/viewModel/stores/storySlice";
import { createButterflySlice } from "@/features/explore/viewModel/stores/butterflySlice";
import { createHistorySlice } from "@/features/simulation/viewModel/stores/historySlice";

export interface RootState
  extends SimulationSlice,
    ExploreSlice,
    AnalyzeSlice,
    LabSlice,
    DataSlice,
    StorySlice,
    ButterflySlice,
    HistorySlice {}

export const useRootStore = create<RootState>((set, get, store) => ({
  ...createSimulationSlice(set, get, store),
  ...createExploreSlice(set, get, store),
  ...createAnalyzeSlice(set, get, store),
  ...createLabSlice(set, get, store),
  ...createDataSlice(set, get, store),
  ...createStorySlice(set, get, store),
  ...createButterflySlice(set, get, store),
  ...createHistorySlice(set, get, store),
}));
