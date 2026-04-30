import { create } from "zustand";
import type { SimulationSlice } from "./slices/simulationSlice";
import type { ExploreSlice } from "./slices/exploreSlice";
import type { AnalyzeSlice } from "./slices/analyzeSlice";
import type { LabSlice } from "./slices/labSlice";
import type { DataSlice } from "./slices/dataSlice";
import type { StorySlice } from "./slices/storySlice";
import type { ButterflySlice } from "./slices/butterflySlice";
import type { HistorySlice } from "./slices/historySlice";

import { createSimulationSlice } from "./slices/simulationSlice";
import { createExploreSlice } from "./slices/exploreSlice";
import { createAnalyzeSlice } from "./slices/analyzeSlice";
import { createLabSlice } from "./slices/labSlice";
import { createDataSlice } from "./slices/dataSlice";
import { createStorySlice } from "./slices/storySlice";
import { createButterflySlice } from "./slices/butterflySlice";
import { createHistorySlice } from "./slices/historySlice";

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
