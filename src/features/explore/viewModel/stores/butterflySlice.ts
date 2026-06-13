import type { StateCreator } from "zustand";
import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";

// ─── 类型定义 ────────────────────────────────────

export type DeltaEditMode = "synced" | "a-only" | "b-only";

export interface EnergySnapshot {
  kinetic: number;
  potential: number;
  total: number;
}

export interface SimSideState {
  state: StateVector;
  params: PendulumParams;
  energy: EnergySnapshot;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  workerReady: boolean;
  simTime: number;
}

export interface SeparationMetrics {
  currentSeparation: number;
  isFullyDecoupled: boolean;
  maxSeparation: number;
  decoupledAt: number | null;
}

export interface ButterflySlice {
  deltaDeg: number;
  editMode: DeltaEditMode;
  sideA: SimSideState;
  sideB: SimSideState;
  separation: SeparationMetrics;
  isRunning: boolean;
  /** 递增信号：通知 Scene3D 清空尾迹 */
  trailClearSignal: number;

  init: (baseParams: PendulumParams, baseState: StateVector, deltaDeg: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  updateParams: (patch: Partial<PendulumParams>) => void;
  _updateSide: (
    side: "A" | "B",
    state: StateVector,
    energy: EnergySnapshot,
    derived: { x1: number; y1: number; x2: number; y2: number },
  ) => void;
  _setWorkerReady: (side: "A" | "B", ready: boolean) => void;
  setEditMode: (mode: DeltaEditMode) => void;
  setDelta: (deltaDeg: number) => void;
  signalTrailClear: () => void;
}

// ─── 默认值 ──────────────────────────────────────

function defaultSideState(): SimSideState {
  return {
    state: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
    params: { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    energy: { kinetic: 0, potential: 0, total: 0 },
    x1: 0, y1: 0, x2: 0, y2: 0,
    workerReady: false,
    simTime: 0,
  };
}

function defaultSeparation(): SeparationMetrics {
  return {
    currentSeparation: 0,
    isFullyDecoupled: false,
    maxSeparation: 0,
    decoupledAt: null,
  };
}

// ─── Slice ──────────────────────────────────────

export const createButterflySlice: StateCreator<ButterflySlice, [], [], ButterflySlice> = (
  set,
  get,
) => ({
  deltaDeg: 0.001,
  editMode: "synced",
  sideA: defaultSideState(),
  sideB: defaultSideState(),
  separation: defaultSeparation(),
  isRunning: false,
  trailClearSignal: 0,

  init: (baseParams, baseState, deltaDeg) => {
    const deltaRad = deltaDeg * (Math.PI / 180);
    const stateB: StateVector = {
      theta1: baseState.theta1 + deltaRad,
      omega1: baseState.omega1,
      theta2: baseState.theta2,
      omega2: baseState.omega2,
    };

    set({
      deltaDeg,
      sideA: {
        ...defaultSideState(),
        state: { ...baseState },
        params: { ...baseParams },
      },
      sideB: {
        ...defaultSideState(),
        state: stateB,
        params: { ...baseParams },
      },
      separation: defaultSeparation(),
      isRunning: false,
    });
  },

  play: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),

  reset: () => {
    const { deltaDeg, sideA } = get();
    const deltaRad = deltaDeg * (Math.PI / 180);
    const stateB: StateVector = {
      theta1: sideA.state.theta1 + deltaRad,
      omega1: sideA.state.omega1,
      theta2: sideA.state.theta2,
      omega2: sideA.state.omega2,
    };

    set({
      sideA: { ...defaultSideState(), state: { ...sideA.state }, params: { ...sideA.params } },
      sideB: { ...defaultSideState(), state: stateB, params: { ...sideA.params } },
      separation: defaultSeparation(),
      isRunning: false,
      trailClearSignal: get().trailClearSignal + 1,
    });
  },

  updateParams: (patch) => {
    const { editMode, sideA, sideB } = get();
    if (editMode === "synced") {
      set({
        sideA: { ...sideA, params: { ...sideA.params, ...patch } },
        sideB: { ...sideB, params: { ...sideB.params, ...patch } },
      });
    } else if (editMode === "a-only") {
      set({ sideA: { ...sideA, params: { ...sideA.params, ...patch } } });
    } else {
      set({ sideB: { ...sideB, params: { ...sideB.params, ...patch } } });
    }
  },

  _updateSide: (side, state, energy, derived) => {
    const current = get();
    const sideKey = side === "A" ? "sideA" : "sideB";
    const otherKey = side === "A" ? "sideB" : "sideA";
    const updatedSide: SimSideState = {
      ...current[sideKey],
      state: { ...state },
      energy: { ...energy },
      x1: derived.x1,
      y1: derived.y1,
      x2: derived.x2,
      y2: derived.y2,
    };

    // 计算分离度
    const otherState = current[otherKey].state;
    const dTheta1 = updatedSide.state.theta1 - otherState.theta1;
    const dTheta2 = updatedSide.state.theta2 - otherState.theta2;
    const currentSeparation = Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2);
    const isFullyDecoupled = currentSeparation > Math.PI / 2;

    const prevSep = current.separation;
    const maxSeparation = Math.max(prevSep.maxSeparation, currentSeparation);
    const decoupledAt =
      !prevSep.isFullyDecoupled && isFullyDecoupled
        ? performance.now()
        : prevSep.decoupledAt;

    set({
      [sideKey]: updatedSide,
      separation: {
        currentSeparation,
        isFullyDecoupled,
        maxSeparation,
        decoupledAt,
      },
    } as Partial<ButterflySlice>);
  },

  _setWorkerReady: (side, ready) => {
    const sideKey = side === "A" ? "sideA" : "sideB";
    const current = get()[sideKey];
    set({ [sideKey]: { ...current, workerReady: ready } } as Partial<ButterflySlice>);
  },

  setEditMode: (editMode) => set({ editMode }),

  setDelta: (deltaDeg) => {
    const clamped = Math.max(0, Math.min(10.0, deltaDeg));
    set({ deltaDeg: clamped });
  },
  signalTrailClear: () => set((s) => ({ trailClearSignal: s.trailClearSignal + 1 })),
});
