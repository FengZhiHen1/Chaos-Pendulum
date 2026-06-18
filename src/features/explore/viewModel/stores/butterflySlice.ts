/**
 * 模块: explore.viewModel.stores.butterflySlice
 * 职责: 蝴蝶效应 Zustand Slice——管理 A/B 两侧仿真状态、分离度、Delta/编辑模式。
 *       分离度计算委托给 domain/separation-calculator（纯函数），
 *       类型定义统一从 contracts 导入。
 * 边界:
 *   - 依赖: contracts (SimSideState, SeparationMetrics, EnergySnapshot, DeltaEditMode)
 *           domain/separation-calculator (分离度纯计算)
 *   - 被依赖: butterfly-store (Zustand hook wrapper)
 * 禁止行为:
 *   - 禁止在 slice 中重复定义 contract 类型
 *   - 禁止分离度计算使用二元判定——使用连续置信度分数
 */

import type { StateCreator } from "zustand";
import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";
import type {
  DeltaEditMode,
  EnergySnapshot,
  SimSideState,
  SeparationMetrics,
} from "../../contracts";
import { BUTTERFLY_DEFAULTS } from "../../contracts";
import { separationCalculator } from "../../domain/separation-calculator";

// ─── Slice 接口 ──────────────────────────────────

export interface ButterflySlice {
  deltaDeg: number;
  editMode: DeltaEditMode;
  sideA: SimSideState;
  sideB: SimSideState;
  separation: SeparationMetrics;
  isRunning: boolean;
  /** 递增信号：通知 Scene3D 清空尾迹 */
  trailClearSignal: number;
  /** true=已通过 init() 写入真实仿真数据（区别于 defaultSideState 零值） */
  bfInitialized: boolean;

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

// ─── 工厂函数 ────────────────────────────────────

function defaultSideState(): SimSideState {
  return {
    state: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
    params: { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    energy: { kinetic: 0, potential: 0, total: 0 },
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
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

// ─── Slice 实现 ──────────────────────────────────

export const createButterflySlice: StateCreator<ButterflySlice, [], [], ButterflySlice> = (
  set,
  get,
) => ({
  deltaDeg: BUTTERFLY_DEFAULTS.defaultDeltaDeg,
  editMode: "synced",
  sideA: defaultSideState(),
  sideB: defaultSideState(),
  separation: defaultSeparation(),
  isRunning: false,
  trailClearSignal: 0,
  /** true=butterfly store 已通过 init() 写入真实仿真数据（区别于 defaultSideState 的零值） */
  bfInitialized: false,

  init: (baseParams, baseState, deltaDeg) => {
    const deltaRad = deltaDeg * (Math.PI / 180);
    const stateB: StateVector = {
      theta1: baseState.theta1 + deltaRad,
      omega1: baseState.omega1,
      theta2: baseState.theta2,
      omega2: baseState.omega2,
    };

    separationCalculator.reset();

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
      bfInitialized: true,
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

    separationCalculator.reset();

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

  /** 委托分离度计算给 domain/separation-calculator 纯函数 */
  _updateSide: (side, state, energy, derived) => {
    const current = get();
    const sideKey = side === "A" ? "sideA" : "sideB";

    const updatedSide: SimSideState = {
      ...current[sideKey],
      state: { ...state },
      energy: { ...energy },
      x1: derived.x1,
      y1: derived.y1,
      x2: derived.x2,
      y2: derived.y2,
      simTime: performance.now(), // TODO: 由调度器传入真实 simTime
    };

    // 委托给纯函数分离度计算器
    const newSeparation = separationCalculator.compute(
      side === "A" ? updatedSide : current.sideA,
      side === "B" ? updatedSide : current.sideB,
    );

    // 补全 decoupledAt（纯函数不追踪时间）
    const prevSep = current.separation;
    const decoupledAt =
      !prevSep.isFullyDecoupled && newSeparation.isFullyDecoupled
        ? performance.now()
        : prevSep.decoupledAt;

    set({
      [sideKey]: updatedSide,
      separation: {
        ...newSeparation,
        maxSeparation: Math.max(prevSep.maxSeparation, newSeparation.maxSeparation),
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
    const safe = Number.isFinite(deltaDeg) ? deltaDeg : BUTTERFLY_DEFAULTS.minDeltaDeg;
    const clamped = Math.max(
      BUTTERFLY_DEFAULTS.minDeltaDeg,
      Math.min(BUTTERFLY_DEFAULTS.maxDeltaDeg, safe),
    );
    set({ deltaDeg: clamped });
  },

  signalTrailClear: () => set((s) => ({ trailClearSignal: s.trailClearSignal + 1 })),
});

// 重新导出契约类型——兼容旧导入路径
export type { DeltaEditMode, EnergySnapshot, SimSideState, SeparationMetrics };
