import { create } from "zustand";
import type { PhysicsParams, StateVector, EnergySnapshot } from "@/shared/types";
import { createInitialState, computeEnergy } from "./engine/state-vector";

interface SimulationState {
  params: PhysicsParams;
  state: StateVector;
  energy: EnergySnapshot;
  isRunning: boolean;

  setParams: (patch: Partial<PhysicsParams>) => void;
  setState: (state: StateVector) => void;
  setRunning: (running: boolean) => void;
}

const defaultParams: PhysicsParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

const defaultState = createInitialState(Math.PI / 2, Math.PI / 2);

export const useSimulationStore = create<SimulationState>((set) => ({
  params: defaultParams,
  state: defaultState,
  energy: computeEnergy(defaultState, defaultParams),
  isRunning: false,

  setParams: (patch) =>
    set((s) => {
      const params = { ...s.params, ...patch };
      return { params, energy: computeEnergy(s.state, params) };
    }),

  setState: (state) =>
    set((s) => ({
      state,
      energy: computeEnergy(state, s.params),
    })),

  setRunning: (isRunning) => set({ isRunning }),
}));
