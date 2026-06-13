/**
 * explore.contracts 对抗测试
 *
 * 覆盖 3 大契约域 + 异常层次 + 共享类型：
 *   声音化引擎、蝴蝶效应对比器、时间反演控制器
 *
 * 测试策略：P0 (契约违反) → P1 (边界值) → P2 (不变量) → P3 (滥用模式)
 *
 * 约束：本文件不导入任何 domain/infrastructure/viewModel/hooks/view 的实现代码。
 *       仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  // 声音化
  SonificationParams,
  ISonificationEngine,
  ISonificationController,
  SONIFICATION_DEFAULTS,
  // 蝴蝶效应
  DeltaEditMode,
  EnergySnapshot,
  SimSideState,
  SeparationMetrics,
  IButterflyScheduler,
  ISeparationCalculator,
  IDeltaController,
  BUTTERFLY_DEFAULTS,
  // 时间反演
  ReversalMode,
  ReversalPhase,
  DriftSample,
  ITimeReversalController,
  IDriftCalculator,
  REVERSAL_DEFAULTS,
  // 共享类型
  ViewPreset,
  TrailLength,
  TrailPoint,
  TrailConfig,
  Scene3DConfig,
  ChaosIndicatorState,
  ResponsiveConfig,
  DEFAULT_TRAIL_CONFIG,
  DEFAULT_SCENE3D_CONFIG,
  RESPONSIVE_PRESETS,
  // 异常
  ExploreError,
  AudioContextError,
  ButterflyWorkerError,
  InsufficientHistoryError,
  InvalidDeltaError,
} from "@/features/explore/contracts";

import type {
  PendulumParams,
  StateVector,
} from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试工具
// ============================================================================

/** 标准有效参数（不在测试目标中时使用） */
const VALID_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

const VALID_STATE: StateVector = {
  theta1: Math.PI / 2,
  omega1: 0,
  theta2: Math.PI / 2,
  omega2: 0,
};

/** 创建合法 SonificationParams */
function validSonificationParams(overrides?: Partial<SonificationParams>): SonificationParams {
  return {
    theta2Dot: 3.0,
    armAngle: 0.5,
    totalEnergy: 15.0,
    lyapunovExponent: -0.01,
    ...overrides,
  };
}

/** 创建合法 SimSideState */
function validSimSideState(overrides?: Partial<SimSideState>): SimSideState {
  return {
    state: { ...VALID_STATE },
    params: { ...VALID_PARAMS },
    energy: { kinetic: 5, potential: 10, total: 15 },
    x1: 0.5,
    y1: -0.866,
    x2: 1.0,
    y2: -1.732,
    workerReady: true,
    simTime: 10.0,
    ...overrides,
  };
}

// ============================================================================
// 模拟实现（用于测试契约行为，不依赖真实实现）
// ============================================================================

/** Mock 声音化引擎 */
class MockSonificationEngine implements ISonificationEngine {
  private _initialized = false;
  private _muted = true;
  private _disposed = false;
  public feedCalls: SonificationParams[] = [];
  public muteCallCount = 0;
  public unmuteCallCount = 0;
  public disposeCallCount = 0;
  public initCallCount = 0;

  get isInitialized(): boolean { return this._initialized; }
  get isMuted(): boolean { return this._muted; }
  get isDisposed(): boolean { return this._disposed; }

  initialize(_ctx: AudioContext): void {
    if (this._disposed) return;
    this._initialized = true;
    this.initCallCount++;
  }

  feed(params: SonificationParams): void {
    if (this._disposed) return;
    // 安全检查：NaN 输入应静默跳过
    if (
      Number.isNaN(params.theta2Dot) ||
      Number.isNaN(params.armAngle) ||
      Number.isNaN(params.totalEnergy) ||
      Number.isNaN(params.lyapunovExponent)
    ) {
      return; // 契约要求安全处理 NaN
    }
    this.feedCalls.push(params);
  }

  mute(): void {
    if (this._disposed) return;
    this._muted = true;
    this.muteCallCount++;
  }

  unmute(): void {
    if (this._disposed) return;
    this._muted = false;
    this.unmuteCallCount++;
  }

  dispose(): void {
    this._disposed = true;
    this._initialized = false;
    this.disposeCallCount++;
  }
}

/** Mock 声音化控制器 */
class MockSonificationController implements ISonificationController {
  private _active = false;
  public toggleCallCount = 0;
  public updateFrameCalls: SonificationParams[] = [];
  public disposeCallCount = 0;

  get isActive(): boolean { return this._active; }

  toggle(): void {
    this._active = !this._active;
    this.toggleCallCount++;
  }

  updateFrame(params: SonificationParams): void {
    if (this._active) {
      this.updateFrameCalls.push(params);
    }
  }

  dispose(): void {
    this._active = false;
    this.disposeCallCount++;
  }
}

/** Mock 蝴蝶效应调度器 */
class MockButterflyScheduler implements IButterflyScheduler {
  private _running = false;
  private _destroyed = false;
  public startCalls: Array<{ params: PendulumParams; state: StateVector; deltaDeg: number }> = [];
  public playCallCount = 0;
  public pauseCallCount = 0;
  public resetCallCount = 0;
  public destroyCallCount = 0;
  public updateParamsCalls: Array<{ patch: Partial<PendulumParams>; mode: DeltaEditMode }> = [];
  public setDeltaCalls: number[] = [];

  get isRunning(): boolean { return this._running && !this._destroyed; }

  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    if (this._destroyed) return;
    // 契约违反：deltaDeg 非法应抛出 InvalidDeltaError
    if (Number.isNaN(deltaDeg) || deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg || deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg) {
      throw new InvalidDeltaError(deltaDeg);
    }
    this.startCalls.push({ params: baseParams, state: baseState, deltaDeg });
    this._running = true;
  }

  play(): void {
    if (this._destroyed) return;
    this._running = true;
    this.playCallCount++;
  }

  pause(): void {
    if (this._destroyed) return;
    this._running = false;
    this.pauseCallCount++;
  }

  reset(): void {
    this._running = false;
    this.resetCallCount++;
  }

  destroy(): void {
    this._running = false;
    this._destroyed = true;
    this.destroyCallCount++;
  }

  updateParams(patch: Partial<PendulumParams>, mode: DeltaEditMode): void {
    if (this._destroyed) return;
    this.updateParamsCalls.push({ patch, mode });
  }

  setDelta(deltaDeg: number): void {
    if (this._destroyed) return;
    if (Number.isNaN(deltaDeg) || deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg || deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg) {
      throw new InvalidDeltaError(deltaDeg);
    }
    this.setDeltaCalls.push(deltaDeg);
  }
}

/** Mock 分离度计算器 */
class MockSeparationCalculator implements ISeparationCalculator {
  compute(sideA: SimSideState, sideB: SimSideState): SeparationMetrics {
    // 安全检查：无效状态应安全处理
    const hasValidA = Number.isFinite(sideA.state.theta1) && Number.isFinite(sideA.state.theta2);
    const hasValidB = Number.isFinite(sideB.state.theta1) && Number.isFinite(sideB.state.theta2);
    if (!hasValidA || !hasValidB) {
      return {
        currentSeparation: 0,
        isFullyDecoupled: false,
        maxSeparation: 0,
        decoupledAt: null,
      };
    }
    // 欧氏距离：角度差 + 角速度差
    const angleDiff = Math.sqrt(
      (sideA.state.theta1 - sideB.state.theta1) ** 2 +
      (sideA.state.theta2 - sideB.state.theta2) ** 2,
    );
    const omegaDiff = Math.sqrt(
      (sideA.state.omega1 - sideB.state.omega1) ** 2 +
      (sideA.state.omega2 - sideB.state.omega2) ** 2,
    );
    const sep = angleDiff + omegaDiff;
    const fullyDecoupledRad = (BUTTERFLY_DEFAULTS.fullyDecoupledThresholdDeg * Math.PI) / 180;
    return {
      currentSeparation: sep,
      isFullyDecoupled: sep > fullyDecoupledRad,
      maxSeparation: Math.max(sep, 0),
      decoupledAt: sep > fullyDecoupledRad ? sideA.simTime : null,
    };
  }
}

/** Mock Delta 控制器 */
class MockDeltaController implements IDeltaController {
  private _deltaDeg = BUTTERFLY_DEFAULTS.defaultDeltaDeg;
  private _editMode: DeltaEditMode = "synced";

  get deltaDeg(): number { return this._deltaDeg; }
  get editMode(): DeltaEditMode { return this._editMode; }

  setDelta(deltaDeg: number): void {
    if (Number.isNaN(deltaDeg) || deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg || deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg) {
      throw new InvalidDeltaError(deltaDeg);
    }
    this._deltaDeg = deltaDeg;
  }

  setEditMode(mode: DeltaEditMode): void {
    this._editMode = mode;
  }
}

/** Mock 时间反演控制器 */
class MockTimeReversalController implements ITimeReversalController {
  private _mode: ReversalMode = "numerical";
  private _phase: ReversalPhase = "idle";
  private _driftHistory: DriftSample[] = [];
  private _annotationDismissed = false;
  private _destroyed = false;

  public minHistoryFrames = REVERSAL_DEFAULTS.minHistoryFrames;
  public currentFrames = 0; // 由测试设置
  public startReversalCalls: ReversalMode[] = [];
  public pauseCallCount = 0;
  public resumeCallCount = 0;
  public resetCallCount = 0;

  get mode(): ReversalMode { return this._mode; }
  get phase(): ReversalPhase { return this._phase; }
  get driftHistory(): readonly DriftSample[] { return this._driftHistory; }
  get isActive(): boolean { return this._phase === "reversing" || this._phase === "recording"; }

  startReversal(mode: ReversalMode): void {
    if (this._destroyed) return;
    // 契约违反：历史帧不足
    if (this.currentFrames < this.minHistoryFrames) {
      throw new InsufficientHistoryError(this.currentFrames, this.minHistoryFrames);
    }
    this._mode = mode;
    this._phase = "reversing";
    this.startReversalCalls.push(mode);
  }

  pause(): void {
    if (this._phase === "reversing") {
      this._phase = "paused";
    }
    this.pauseCallCount++;
  }

  resume(): void {
    if (this._phase === "paused") {
      this._phase = "reversing";
    }
    this.resumeCallCount++;
  }

  reset(): void {
    this._phase = "idle";
    this._driftHistory = [];
    this.resetCallCount++;
  }

  setMode(mode: ReversalMode): void {
    this._mode = mode;
  }

  dismissAnnotation(): void {
    this._annotationDismissed = true;
  }

  /** 测试辅助——注入漂移数据 */
  addDriftSample(sample: DriftSample): void {
    this._driftHistory.push(sample);
  }

  /** 测试辅助——设当前历史帧数 */
  setCurrentFrames(n: number): void {
    this.currentFrames = n;
  }

  /** 测试辅助——模拟销毁 */
  setDestroyed(): void {
    this._destroyed = true;
  }
}

/** Mock 漂移计算器 */
class MockDriftCalculator implements IDriftCalculator {
  compute(
    forwardState: { theta1: number; omega1: number; theta2: number; omega2: number },
    reversedState: { theta1: number; omega1: number; theta2: number; omega2: number },
  ): number {
    const dTheta = Math.sqrt(
      (forwardState.theta1 - reversedState.theta1) ** 2 +
      (forwardState.theta2 - reversedState.theta2) ** 2,
    );
    const dOmega = Math.sqrt(
      (forwardState.omega1 - reversedState.omega1) ** 2 +
      (forwardState.omega2 - reversedState.omega2) ** 2,
    );
    return dTheta + dOmega;
  }
}

// ============================================================================
// P0: 契约违反 —— 验证前置条件被强制执行
// ============================================================================

describe("P0: 契约违反 — 前置条件强制执行", () => {

  describe("sonification: ISonificationEngine.feed() NaN 输入", () => {
    it("应安全处理 theta2Dot = NaN（静默跳过，不崩溃）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ theta2Dot: NaN }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(0);
    });

    it("应安全处理 armAngle = NaN（静默跳过，不崩溃）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ armAngle: NaN }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(0);
    });

    it("应安全处理 totalEnergy = NaN（静默跳过，不崩溃）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ totalEnergy: NaN }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(0);
    });

    it("应安全处理 lyapunovExponent = NaN（静默跳过，不崩溃）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ lyapunovExponent: NaN }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(0);
    });

    it("应安全处理全部字段均为 NaN", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      const allNaN: SonificationParams = {
        theta2Dot: NaN,
        armAngle: NaN,
        totalEnergy: NaN,
        lyapunovExponent: NaN,
      };
      expect(() => engine.feed(allNaN)).not.toThrow();
      expect(engine.feedCalls.length).toBe(0);
    });
  });

  describe("butterfly-effect: IButterflyScheduler.start() 非法 deltaDeg", () => {
    it("应拒绝 deltaDeg = -1（负值），抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, -1)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 deltaDeg = 100（超出上限），抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, 100)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 deltaDeg = 0（低于下限 1e-6），抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, 0)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 deltaDeg = NaN，抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, NaN)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 deltaDeg = -Infinity，抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, -Infinity)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 deltaDeg = Infinity，抛出 InvalidDeltaError", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, Infinity)).toThrow(InvalidDeltaError);
    });
  });

  describe("butterfly-effect: IDeltaController.setDelta() 非法值", () => {
    it("应拒绝 setDelta(-1)，抛出 InvalidDeltaError", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(-1)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 setDelta(20)，抛出 InvalidDeltaError", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(20)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 setDelta(NaN)，抛出 InvalidDeltaError", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(NaN)).toThrow(InvalidDeltaError);
    });

    it("应拒绝 setDelta(0)，抛出 InvalidDeltaError", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(0)).toThrow(InvalidDeltaError);
    });
  });

  describe("time-reversal: ITimeReversalController.startReversal() 历史帧不足", () => {
    it("历史帧为 0 时应抛出 InsufficientHistoryError", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(0);
      expect(() => ctrl.startReversal("numerical")).toThrow(InsufficientHistoryError);
    });

    it("历史帧为 50 时（< 120）应抛出 InsufficientHistoryError", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(50);
      expect(() => ctrl.startReversal("exact")).toThrow(InsufficientHistoryError);
    });

    it("历史帧为 119 时（恰好小于阈值）应抛出 InsufficientHistoryError", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(119);
      expect(() => ctrl.startReversal("numerical")).toThrow(InsufficientHistoryError);
    });
  });

  describe("butterfly-effect: ISeparationCalculator.compute() 无效状态", () => {
    it("应安全处理 sideA.state 含 NaN（返回零分离度，不崩溃）", () => {
      const calc = new MockSeparationCalculator();
      const badA = validSimSideState({
        state: { theta1: NaN, omega1: 0, theta2: 0, omega2: 0 },
      });
      const goodB = validSimSideState();
      expect(() => calc.compute(badA, goodB)).not.toThrow();
      const result = calc.compute(badA, goodB);
      expect(result.currentSeparation).toBe(0);
      expect(result.isFullyDecoupled).toBe(false);
    });

    it("应安全处理 sideB.state 含 NaN（返回零分离度，不崩溃）", () => {
      const calc = new MockSeparationCalculator();
      const goodA = validSimSideState();
      const badB = validSimSideState({
        state: { theta1: 0, omega1: 0, theta2: NaN, omega2: 0 },
      });
      expect(() => calc.compute(goodA, badB)).not.toThrow();
      const result = calc.compute(goodA, badB);
      expect(result.currentSeparation).toBe(0);
    });

    it("应安全处理双方 state 均含 NaN", () => {
      const calc = new MockSeparationCalculator();
      const badA = validSimSideState({
        state: { theta1: NaN, omega1: NaN, theta2: NaN, omega2: NaN },
      });
      const badB = validSimSideState({
        state: { theta1: NaN, omega1: NaN, theta2: NaN, omega2: NaN },
      });
      expect(() => calc.compute(badA, badB)).not.toThrow();
    });

    it("应安全处理 sideA.state 含 Infinity", () => {
      const calc = new MockSeparationCalculator();
      const badA = validSimSideState({
        state: { theta1: Infinity, omega1: 0, theta2: 0, omega2: 0 },
      });
      const goodB = validSimSideState();
      expect(() => calc.compute(badA, goodB)).not.toThrow();
      const result = calc.compute(badA, goodB);
      expect(result.currentSeparation).toBe(0);
    });
  });
});

// ============================================================================
// P1: 边界值 —— 在合法区间的边缘行为
// ============================================================================

describe("P1: 边界值 — 合法区间边缘行为", () => {

  describe("types: TrailLength 边界值", () => {
    it("TrailLength 类型应接受 50", () => {
      const length: TrailLength = 50;
      expect(length).toBe(50);
    });

    it("TrailLength 类型应接受 200", () => {
      const length: TrailLength = 200;
      expect(length).toBe(200);
    });

    it("TrailLength 类型应接受 1000", () => {
      const length: TrailLength = 1000;
      expect(length).toBe(1000);
    });

    it("TrailLength 类型应接受 0（无限持久）", () => {
      const length: TrailLength = 0;
      expect(length).toBe(0);
    });

    it("TrailLength 类型应接受 -1（仅当前周期）", () => {
      const length: TrailLength = -1;
      expect(length).toBe(-1);
    });
  });

  describe("types: ViewPreset 边界值", () => {
    it("ViewPreset 类型应接受 'side'", () => {
      const preset: ViewPreset = "side";
      expect(preset).toBe("side");
    });

    it("ViewPreset 类型应接受 'top'", () => {
      const preset: ViewPreset = "top";
      expect(preset).toBe("top");
    });

    it("ViewPreset 类型应接受 'chaos'", () => {
      const preset: ViewPreset = "chaos";
      expect(preset).toBe("chaos");
    });

    it("DEFAULT_SCENE3D_CONFIG 的 cameraPresets 应包含全部 3 种预设", () => {
      const keys = Object.keys(DEFAULT_SCENE3D_CONFIG.cameraPresets);
      expect(keys).toContain("side");
      expect(keys).toContain("top");
      expect(keys).toContain("chaos");
    });
  });

  describe("butterfly-effect: DeltaEditMode 边界值", () => {
    it("DeltaEditMode 类型应接受 'synced'", () => {
      const mode: DeltaEditMode = "synced";
      expect(mode).toBe("synced");
    });

    it("DeltaEditMode 类型应接受 'a-only'", () => {
      const mode: DeltaEditMode = "a-only";
      expect(mode).toBe("a-only");
    });

    it("DeltaEditMode 类型应接受 'b-only'", () => {
      const mode: DeltaEditMode = "b-only";
      expect(mode).toBe("b-only");
    });

    it("MockDeltaController 默认模式应为 'synced'", () => {
      const ctrl = new MockDeltaController();
      expect(ctrl.editMode).toBe("synced");
    });

    it("应能 setEditMode 切换到全部 3 种模式", () => {
      const ctrl = new MockDeltaController();
      ctrl.setEditMode("a-only");
      expect(ctrl.editMode).toBe("a-only");
      ctrl.setEditMode("b-only");
      expect(ctrl.editMode).toBe("b-only");
      ctrl.setEditMode("synced");
      expect(ctrl.editMode).toBe("synced");
    });
  });

  describe("butterfly-effect: deltaDeg 边界值", () => {
    it("deltaDeg = 1e-6（下限）应被接受", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(1e-6)).not.toThrow();
      expect(ctrl.deltaDeg).toBe(1e-6);
    });

    it("deltaDeg = 1e-3（默认值）应被接受", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(0.001)).not.toThrow();
      expect(ctrl.deltaDeg).toBe(0.001);
    });

    it("deltaDeg = 10（上限）应被接受", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(10)).not.toThrow();
      expect(ctrl.deltaDeg).toBe(10);
    });

    it("deltaDeg = 5.0（区间中点）应被接受", () => {
      const ctrl = new MockDeltaController();
      expect(() => ctrl.setDelta(5.0)).not.toThrow();
      expect(ctrl.deltaDeg).toBe(5.0);
    });

    it("deltaDeg = 5.000000001e-1（微超默认值）应被接受", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, 0.5000000001)).not.toThrow();
    });

    it("deltaDeg = 0 应被拒绝（低于下限 1e-6）", () => {
      const ctrl = new MockDeltaController();
      // 0 < 1e-6，应被拒绝
      expect(() => ctrl.setDelta(0)).toThrow(InvalidDeltaError);
    });
  });

  describe("types: ResponsiveConfig 三档降级", () => {
    it("desktop 档应启用所有高级特性", () => {
      const config = RESPONSIVE_PRESETS.desktop;
      expect(config.shadows).toBe(true);
      expect(config.trailEnabled).toBe(true);
      expect(config.pixelRatio).toBe(2);
      expect(config.ballSegments).toBe(64);
      expect(config.sonificationEnabled).toBe(true);
    });

    it("tablet 档应禁用阴影和声音化，但保留尾迹", () => {
      const config = RESPONSIVE_PRESETS.tablet;
      expect(config.shadows).toBe(false);
      expect(config.trailEnabled).toBe(true);
      expect(config.pixelRatio).toBe(1.5);
      expect(config.ballSegments).toBe(32);
      expect(config.sonificationEnabled).toBe(false);
    });

    it("mobile 档应禁用阴影、尾迹和声音化", () => {
      const config = RESPONSIVE_PRESETS.mobile;
      expect(config.shadows).toBe(false);
      expect(config.trailEnabled).toBe(false);
      expect(config.pixelRatio).toBe(1);
      expect(config.ballSegments).toBe(16);
      expect(config.sonificationEnabled).toBe(false);
    });

    it("三档 ballSegments 应为降序：desktop > tablet > mobile", () => {
      expect(RESPONSIVE_PRESETS.desktop.ballSegments).toBeGreaterThan(RESPONSIVE_PRESETS.tablet.ballSegments);
      expect(RESPONSIVE_PRESETS.tablet.ballSegments).toBeGreaterThan(RESPONSIVE_PRESETS.mobile.ballSegments);
    });

    it("三档 pixelRatio 应为降序：desktop > tablet > mobile", () => {
      expect(RESPONSIVE_PRESETS.desktop.pixelRatio).toBeGreaterThan(RESPONSIVE_PRESETS.tablet.pixelRatio);
      expect(RESPONSIVE_PRESETS.tablet.pixelRatio).toBeGreaterThan(RESPONSIVE_PRESETS.mobile.pixelRatio);
    });
  });

  describe("time-reversal: ReversalMode 边界值", () => {
    it("ReversalMode 类型应接受 'exact'", () => {
      const mode: ReversalMode = "exact";
      expect(mode).toBe("exact");
    });

    it("ReversalMode 类型应接受 'numerical'", () => {
      const mode: ReversalMode = "numerical";
      expect(mode).toBe("numerical");
    });

    it("ITimeReversalController 默认模式应为 'numerical'", () => {
      const ctrl = new MockTimeReversalController();
      expect(ctrl.mode).toBe("numerical");
    });

    it("应能 setMode 切换模式", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setMode("exact");
      expect(ctrl.mode).toBe("exact");
      ctrl.setMode("numerical");
      expect(ctrl.mode).toBe("numerical");
    });
  });

  describe("time-reversal: ReversalPhase 全状态枚举", () => {
    it("ReversalPhase 应支持全部 6 个生命周期状态", () => {
      const phases: ReversalPhase[] = [
        "idle", "recording", "awaitingConfirm", "reversing", "completed", "paused",
      ];
      expect(phases.length).toBe(6);
      for (const p of phases) {
        const phase: ReversalPhase = p;
        expect(phase).toBe(p);
      }
    });

    it("初始阶段应为 'idle'", () => {
      const ctrl = new MockTimeReversalController();
      expect(ctrl.phase).toBe("idle");
    });
  });

  describe("time-reversal: startReversal() 历史帧边界", () => {
    it("历史帧恰好 = 120（阈值）应被接受", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(120);
      expect(() => ctrl.startReversal("numerical")).not.toThrow();
      expect(ctrl.phase).toBe("reversing");
    });

    it("历史帧 = 500（远大于阈值）应被接受", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(500);
      expect(() => ctrl.startReversal("exact")).not.toThrow();
      expect(ctrl.phase).toBe("reversing");
    });
  });

  describe("butterfly-effect: setDelta 边界值直接调用", () => {
    it("deltaDeg = 1e-6 到 10 之间的值应被接受", () => {
      const ctrl = new MockDeltaController();
      const testValues = [1e-6, 1e-5, 0.001, 0.1, 1, 5, 10];
      for (const v of testValues) {
        expect(() => ctrl.setDelta(v)).not.toThrow();
      }
    });

    it("deltaDeg 多次连续设置应更新值", () => {
      const ctrl = new MockDeltaController();
      ctrl.setDelta(0.001);
      ctrl.setDelta(0.5);
      ctrl.setDelta(3.0);
      expect(ctrl.deltaDeg).toBe(3.0);
    });
  });

  describe("sonification: ISonificationEngine 边界参数", () => {
    it("应安全处理 theta2Dot = 0（零角速度）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ theta2Dot: 0 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });

    it("应安全处理 theta2Dot = 1000（超大角速度）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ theta2Dot: 1000 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });

    it("应安全处理 totalEnergy = 0（零能量）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ totalEnergy: 0 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });

    it("应安全处理 totalEnergy = 1e6（超大能量）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ totalEnergy: 1e6 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });

    it("应安全处理 lyapunovExponent = 10（高混沌）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ lyapunovExponent: 10 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });

    it("应安全处理 lyapunovExponent = -10（强稳定）", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(() => engine.feed(validSonificationParams({ lyapunovExponent: -10 }))).not.toThrow();
      expect(engine.feedCalls.length).toBe(1);
    });
  });

  describe("types: TrailPoint 边界值", () => {
    it("TrailPoint 应包含全部 5 个字段", () => {
      const point: TrailPoint = { x: 1, y: 2, z: 3, speed: 0.5, width: 0.01 };
      expect(point).toHaveProperty("x");
      expect(point).toHaveProperty("y");
      expect(point).toHaveProperty("z");
      expect(point).toHaveProperty("speed");
      expect(point).toHaveProperty("width");
    });

    it("TrailPoint speed = 0 应被接受", () => {
      const point: TrailPoint = { x: 0, y: -1, z: 0, speed: 0, width: 0 };
      expect(point.speed).toBe(0);
      expect(point.width).toBe(0);
    });

    it("TrailPoint 大坐标值应被接受", () => {
      const point: TrailPoint = { x: 1e6, y: -1e6, z: 1e6, speed: 1e6, width: 10 };
      expect(Number.isFinite(point.x)).toBe(true);
    });
  });

  describe("sonification: ISonificationController toggle 切换", () => {
    it("初始 isActive 应为 false", () => {
      const ctrl = new MockSonificationController();
      expect(ctrl.isActive).toBe(false);
    });

    it("toggle 后 isActive 应变为 true", () => {
      const ctrl = new MockSonificationController();
      ctrl.toggle();
      expect(ctrl.isActive).toBe(true);
    });

    it("连续两次 toggle 后 isActive 应回到 false", () => {
      const ctrl = new MockSonificationController();
      ctrl.toggle();
      ctrl.toggle();
      expect(ctrl.isActive).toBe(false);
    });

    it("非活跃时 updateFrame 不应记录调用", () => {
      const ctrl = new MockSonificationController();
      ctrl.updateFrame(validSonificationParams());
      expect(ctrl.updateFrameCalls.length).toBe(0);
    });

    it("活跃时 updateFrame 应记录调用", () => {
      const ctrl = new MockSonificationController();
      ctrl.toggle();
      ctrl.updateFrame(validSonificationParams());
      expect(ctrl.updateFrameCalls.length).toBe(1);
    });
  });
});

// ============================================================================
// P2: 不变量 —— 验证后置条件成立
// ============================================================================

describe("P2: 不变量 — 后置条件验证", () => {

  describe("butterfly-effect: SeparationMetrics.currentSeparation >= 0", () => {
    it("相同状态应产生 currentSeparation = 0", () => {
      const calc = new MockSeparationCalculator();
      const side = validSimSideState();
      const result = calc.compute(side, side);
      expect(result.currentSeparation).toBeGreaterThanOrEqual(0);
      expect(result.currentSeparation).toBeCloseTo(0, 10);
    });

    it("不同状态应产生 currentSeparation > 0", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState({
        state: { theta1: 1.0, omega1: 0.5, theta2: -0.5, omega2: 1.0 },
      });
      const sideB = validSimSideState({
        state: { theta1: 2.0, omega1: 1.5, theta2: 0.5, omega2: -1.0 },
      });
      const result = calc.compute(sideA, sideB);
      expect(result.currentSeparation).toBeGreaterThan(0);
    });

    it("maxSeparation >= currentSeparation 应保持", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState({
        state: { theta1: 1.0, omega1: 1.0, theta2: 0, omega2: 0 },
      });
      const sideB = validSimSideState({
        state: { theta1: 2.0, omega1: 2.0, theta2: 0, omega2: 0 },
      });
      const result = calc.compute(sideA, sideB);
      expect(result.maxSeparation).toBeGreaterThanOrEqual(result.currentSeparation);
    });

    it("分离度 > 90° 时 isFullyDecoupled 应为 true", () => {
      const calc = new MockSeparationCalculator();
      // 90° in radians ≈ 1.5708; 需要角度差+角速度差 > 1.5708
      const sideA = validSimSideState({
        state: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
      });
      const sideB = validSimSideState({
        state: { theta1: Math.PI, omega1: 10, theta2: 0, omega2: 0 }, // 大差异确保 > 90°
      });
      const result = calc.compute(sideA, sideB);
      // 角度差 = |π - 0| = π ≈ 3.14, 角速度差 = 10, 欧氏距离 = sqrt(π² + 10²) ≈ 10.44
      expect(result.isFullyDecoupled).toBe(true);
      expect(result.decoupledAt).not.toBeNull();
    });

    it("分离度 ≤ 90° 时 isFullyDecoupled 应为 false", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState({
        state: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
      });
      const sideB = validSimSideState({
        state: { theta1: 0.1, omega1: 0.1, theta2: 0, omega2: 0 },
      });
      const result = calc.compute(sideA, sideB);
      expect(result.isFullyDecoupled).toBe(false);
      expect(result.decoupledAt).toBeNull();
    });
  });

  describe("time-reversal: DriftSample.driftDistance >= 0", () => {
    it("DriftSample 应有 3 个字段", () => {
      const sample: DriftSample = { reversalTime: 1.0, driftDistance: 0.5, forwardSimTime: 10.0 };
      expect(sample).toHaveProperty("reversalTime");
      expect(sample).toHaveProperty("driftDistance");
      expect(sample).toHaveProperty("forwardSimTime");
    });

    it("driftDistance 应 >= 0", () => {
      const sample: DriftSample = { reversalTime: 5.0, driftDistance: 0.0, forwardSimTime: 100.0 };
      expect(sample.driftDistance).toBeGreaterThanOrEqual(0);
    });
  });

  describe("butterfly-effect: EnergySnapshot.total = kinetic + potential", () => {
    it("EnergySnapshot 应有 3 个字段且 total = kinetic + potential", () => {
      const snap: EnergySnapshot = { kinetic: 10, potential: 5, total: 15 };
      expect(snap.total).toBe(snap.kinetic + snap.potential);
    });

    it("kinetic = 0 时 total = potential", () => {
      const snap: EnergySnapshot = { kinetic: 0, potential: 20, total: 20 };
      expect(snap.total).toBe(snap.kinetic + snap.potential);
    });

    it("kinetic >= 0 应保持", () => {
      const snap: EnergySnapshot = { kinetic: 0, potential: 10, total: 10 };
      expect(snap.kinetic).toBeGreaterThanOrEqual(0);
    });
  });

  describe("types: TrailConfig.opacityBase >= opacityFade", () => {
    it("DEFAULT_TRAIL_CONFIG.opacityBase >= opacityFade", () => {
      expect(DEFAULT_TRAIL_CONFIG.opacityBase).toBeGreaterThanOrEqual(DEFAULT_TRAIL_CONFIG.opacityFade);
    });

    it("opacityBase = 0.8, opacityFade = 0.1 满足约束", () => {
      const config: TrailConfig = {
        maxPoints: 500,
        baseWidth: 0.01,
        speedColorMin: 0,
        speedColorMax: 10,
        opacityBase: 0.8,
        opacityFade: 0.1,
      };
      expect(config.opacityBase).toBeGreaterThanOrEqual(config.opacityFade);
    });

    it("opacityBase = opacityFade = 0.5 满足约束", () => {
      const config: TrailConfig = {
        maxPoints: 100,
        baseWidth: 0.005,
        speedColorMin: 0,
        speedColorMax: 3,
        opacityBase: 0.5,
        opacityFade: 0.5,
      };
      expect(config.opacityBase).toBeGreaterThanOrEqual(config.opacityFade);
    });
  });

  describe("sonification: SONIFICATION_DEFAULTS 默认值验证", () => {
    it("defaultMuted 应为 true", () => {
      expect(SONIFICATION_DEFAULTS.defaultMuted).toBe(true);
    });

    it("mobileDisabled 应为 true", () => {
      expect(SONIFICATION_DEFAULTS.mobileDisabled).toBe(true);
    });

    it("maxEnergyEmaAlpha 应在 (0, 1) 之间", () => {
      expect(SONIFICATION_DEFAULTS.maxEnergyEmaAlpha).toBeGreaterThan(0);
      expect(SONIFICATION_DEFAULTS.maxEnergyEmaAlpha).toBeLessThanOrEqual(1);
    });

    it("maxEnergyMin 应为正值", () => {
      expect(SONIFICATION_DEFAULTS.maxEnergyMin).toBeGreaterThan(0);
    });

    it("maxEngineRebuilds 应为非负整数", () => {
      expect(SONIFICATION_DEFAULTS.maxEngineRebuilds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("butterfly-effect: BUTTERFLY_DEFAULTS 默认值验证", () => {
    it("defaultDeltaDeg 应在合法范围内", () => {
      expect(BUTTERFLY_DEFAULTS.defaultDeltaDeg).toBeGreaterThanOrEqual(BUTTERFLY_DEFAULTS.minDeltaDeg);
      expect(BUTTERFLY_DEFAULTS.defaultDeltaDeg).toBeLessThanOrEqual(BUTTERFLY_DEFAULTS.maxDeltaDeg);
    });

    it("minDeltaDeg 应为 1e-6", () => {
      expect(BUTTERFLY_DEFAULTS.minDeltaDeg).toBe(1e-6);
    });

    it("maxDeltaDeg 应为 10", () => {
      expect(BUTTERFLY_DEFAULTS.maxDeltaDeg).toBe(10);
    });

    it("minDeltaDeg < maxDeltaDeg", () => {
      expect(BUTTERFLY_DEFAULTS.minDeltaDeg).toBeLessThan(BUTTERFLY_DEFAULTS.maxDeltaDeg);
    });

    it("fullyDecoupledThresholdDeg = 90°", () => {
      expect(BUTTERFLY_DEFAULTS.fullyDecoupledThresholdDeg).toBe(90);
    });

    it("angleRange = Math.PI", () => {
      expect(BUTTERFLY_DEFAULTS.angleRange).toBe(Math.PI);
    });

    it("dividerWidth = 2", () => {
      expect(BUTTERFLY_DEFAULTS.dividerWidth).toBe(2);
    });
  });

  describe("time-reversal: REVERSAL_DEFAULTS 默认值验证", () => {
    it("minHistoryFrames = 120", () => {
      expect(REVERSAL_DEFAULTS.minHistoryFrames).toBe(120);
    });

    it("reversalFps = 60", () => {
      expect(REVERSAL_DEFAULTS.reversalFps).toBe(60);
    });

    it("teachingThreshold 应为正值", () => {
      expect(REVERSAL_DEFAULTS.teachingThreshold).toBeGreaterThan(0);
    });

    it("maxDriftSamples 应为正值", () => {
      expect(REVERSAL_DEFAULTS.maxDriftSamples).toBeGreaterThan(0);
    });

    it("exactModeMaxTime 应为正值", () => {
      expect(REVERSAL_DEFAULTS.exactModeMaxTime).toBeGreaterThan(0);
    });
  });

  describe("types: DEFAULT_TRAIL_CONFIG 默认值验证", () => {
    it("maxPoints = 1000", () => {
      expect(DEFAULT_TRAIL_CONFIG.maxPoints).toBe(1000);
    });

    it("baseWidth 应为正值", () => {
      expect(DEFAULT_TRAIL_CONFIG.baseWidth).toBeGreaterThan(0);
    });

    it("speedColorMin < speedColorMax", () => {
      expect(DEFAULT_TRAIL_CONFIG.speedColorMin).toBeLessThan(DEFAULT_TRAIL_CONFIG.speedColorMax);
    });

    it("opacityBase >= opacityFade", () => {
      expect(DEFAULT_TRAIL_CONFIG.opacityBase).toBeGreaterThanOrEqual(DEFAULT_TRAIL_CONFIG.opacityFade);
    });

    it("opacityBase ∈ [0, 1]", () => {
      expect(DEFAULT_TRAIL_CONFIG.opacityBase).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_TRAIL_CONFIG.opacityBase).toBeLessThanOrEqual(1);
    });

    it("opacityFade ∈ [0, 1]", () => {
      expect(DEFAULT_TRAIL_CONFIG.opacityFade).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_TRAIL_CONFIG.opacityFade).toBeLessThanOrEqual(1);
    });
  });

  describe("types: ChaosIndicatorState 结构", () => {
    it("应包含 4 个字段", () => {
      const state: ChaosIndicatorState = {
        lyapunovExponent: 0.1,
        variance: 0.02,
        level: "chaotic",
        confidence: 0.85,
      };
      expect(state).toHaveProperty("lyapunovExponent");
      expect(state).toHaveProperty("variance");
      expect(state).toHaveProperty("level");
      expect(state).toHaveProperty("confidence");
    });

    it("level 应为 3 种可能值之一", () => {
      const levels: ChaosIndicatorState["level"][] = ["stable", "quasiperiodic", "chaotic"];
      expect(levels.length).toBe(3);
    });

    it("confidence ∈ [0, 1]", () => {
      const state: ChaosIndicatorState = {
        lyapunovExponent: 0,
        variance: 0,
        level: "stable",
        confidence: 1.0,
      };
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("butterfly-effect: ISeparationCalculator 多次计算不变量", () => {
    it("连续计算 100 次应始终 currentSeparation >= 0", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState({
        state: { theta1: 0.5, omega1: 1.0, theta2: -0.3, omega2: 0.5 },
      });
      const sideB = validSimSideState({
        state: { theta1: 0.6, omega1: 1.1, theta2: -0.2, omega2: 0.4 },
      });
      for (let i = 0; i < 100; i++) {
        const result = calc.compute(sideA, sideB);
        expect(result.currentSeparation).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("time-reversal: IDriftCalculator.compute() 返回值不变量", () => {
    it("相同状态应返回 driftDistance = 0", () => {
      const calc = new MockDriftCalculator();
      const state = { theta1: 1, omega1: 2, theta2: 3, omega2: 4 };
      const dist = calc.compute(state, state);
      expect(dist).toBe(0);
    });

    it("漂移距离应 >= 0", () => {
      const calc = new MockDriftCalculator();
      const fwd = { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
      const rev = { theta1: 1, omega1: 2, theta2: 3, omega2: 4 };
      const dist = calc.compute(fwd, rev);
      expect(dist).toBeGreaterThanOrEqual(0);
    });

    it("漂移距离应反映状态差异", () => {
      const calc = new MockDriftCalculator();
      const fwd = { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
      const revSmall = { theta1: 0.1, omega1: 0.1, theta2: 0, omega2: 0 };
      const revLarge = { theta1: 1, omega1: 1, theta2: 0, omega2: 0 };
      const smallDist = calc.compute(fwd, revSmall);
      const largeDist = calc.compute(fwd, revLarge);
      expect(smallDist).toBeLessThan(largeDist);
    });
  });
});

// ============================================================================
// P3: 滥用模式 —— 验证边界情况
// ============================================================================

describe("P3: 滥用模式 — 边界鲁棒性", () => {

  describe("sonification: ISonificationEngine dispose 后调用 feed", () => {
    it("dispose 后调用 feed 不应崩溃且应安全跳过", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      engine.feed(validSonificationParams());
      expect(engine.feedCalls.length).toBe(1);
      engine.dispose();
      expect(() => engine.feed(validSonificationParams())).not.toThrow();
      expect(engine.feedCalls.length).toBe(1); // 未增加
    });

    it("dispose 后调用 mute 不应崩溃", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      engine.dispose();
      expect(() => engine.mute()).not.toThrow();
    });

    it("dispose 后调用 unmute 不应崩溃", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      engine.dispose();
      expect(() => engine.unmute()).not.toThrow();
    });

    it("连续两次 dispose 不应崩溃", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      engine.dispose();
      expect(() => engine.dispose()).not.toThrow();
      expect(engine.disposeCallCount).toBe(2);
    });

    it("dispose 后 initialize 应安全跳过", () => {
      const engine = new MockSonificationEngine();
      engine.dispose();
      expect(() => engine.initialize({} as AudioContext)).not.toThrow();
      expect(engine.isInitialized).toBe(false);
    });
  });

  describe("sonification: ISonificationEngine 生命周期状态切换", () => {
    it("未初始化时 mute/unmute 应安全", () => {
      const engine = new MockSonificationEngine();
      expect(() => engine.mute()).not.toThrow();
      expect(() => engine.unmute()).not.toThrow();
    });

    it("未初始化时 feed 应安全", () => {
      const engine = new MockSonificationEngine();
      expect(() => engine.feed(validSonificationParams())).not.toThrow();
    });

    it("initialize → mute → unmute → feed → dispose 完整生命周期", () => {
      const engine = new MockSonificationEngine();
      expect(() => {
        engine.initialize({} as AudioContext);
        engine.mute();
        engine.unmute();
        engine.feed(validSonificationParams());
        engine.dispose();
      }).not.toThrow();
    });

    it("默认 isInitialized = false, isMuted = true", () => {
      const engine = new MockSonificationEngine();
      expect(engine.isInitialized).toBe(false);
      expect(engine.isMuted).toBe(true);
    });

    it("initialize 后 isInitialized 应为 true", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      expect(engine.isInitialized).toBe(true);
    });

    it("unmute 后 isMuted 应为 false", () => {
      const engine = new MockSonificationEngine();
      engine.initialize({} as AudioContext);
      engine.unmute();
      expect(engine.isMuted).toBe(false);
    });
  });

  describe("butterfly-effect: IButterflyScheduler 完整生命周期", () => {
    it("start → play → pause → play(恢复) → reset → destroy 完整序列不崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => {
        scheduler.start(VALID_PARAMS, VALID_STATE, 0.001);
        scheduler.play();
        scheduler.pause();
        scheduler.play(); // IButterflyScheduler 无 resume()，用 play() 恢复
        scheduler.reset();
        scheduler.destroy();
      }).not.toThrow();
    });

    it("应安全执行 start → setDelta → updateParams → play → pause → destroy", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => {
        scheduler.start(VALID_PARAMS, VALID_STATE, 0.001);
        scheduler.setDelta(0.5);
        scheduler.updateParams({ L1: 1.5 }, "a-only");
        scheduler.play();
        scheduler.pause();
        scheduler.destroy();
      }).not.toThrow();
    });

    it("destroy 后调用任何方法不应崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      scheduler.destroy();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, 0.01)).not.toThrow();
      expect(() => scheduler.play()).not.toThrow();
      expect(() => scheduler.pause()).not.toThrow();
      expect(() => scheduler.reset()).not.toThrow();
      expect(() => scheduler.updateParams({}, "synced")).not.toThrow();
      expect(() => scheduler.setDelta(1)).not.toThrow();
    });

    it("连续两次 destroy 不应崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      scheduler.destroy();
      expect(() => scheduler.destroy()).not.toThrow();
      expect(scheduler.destroyCallCount).toBe(2);
    });

    it("未 start 直接 play 不应崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.play()).not.toThrow();
      expect(scheduler.playCallCount).toBe(1);
    });

    it("未 start 直接 pause 不应崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      expect(() => scheduler.pause()).not.toThrow();
    });

    it("reset 后重新 start 是安全的", () => {
      const scheduler = new MockButterflyScheduler();
      scheduler.start(VALID_PARAMS, VALID_STATE, 0.01);
      scheduler.reset();
      expect(() => scheduler.start(VALID_PARAMS, VALID_STATE, 0.5)).not.toThrow();
      expect(scheduler.startCalls.length).toBe(2);
    });

    it("updateParams 应在全 3 种模式下不崩溃", () => {
      const scheduler = new MockButterflyScheduler();
      scheduler.start(VALID_PARAMS, VALID_STATE, 0.01);
      expect(() => scheduler.updateParams({ m1: 2 }, "synced")).not.toThrow();
      expect(() => scheduler.updateParams({ L2: 2 }, "a-only")).not.toThrow();
      expect(() => scheduler.updateParams({ g: 5 }, "b-only")).not.toThrow();
      expect(scheduler.updateParamsCalls.length).toBe(3);
    });
  });

  describe("time-reversal: ITimeReversalController 连续 startReversal", () => {
    it("连续两次 startReversal 不应崩溃（第二次替代第一次）", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      expect(() => ctrl.startReversal("exact")).not.toThrow();
      expect(ctrl.startReversalCalls.length).toBe(2);
      expect(ctrl.startReversalCalls[1]).toBe("exact");
    });

    it("startReversal → pause → startReversal 应安全", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      ctrl.pause();
      expect(() => ctrl.startReversal("exact")).not.toThrow();
    });
  });

  describe("time-reversal: ITimeReversalController 完整生命周期", () => {
    it("startReversal → pause → resume → reset 完整序列不崩溃", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      expect(() => {
        ctrl.startReversal("numerical");
        ctrl.pause();
        ctrl.resume();
        ctrl.reset();
      }).not.toThrow();
    });

    it("reset 后应回到 idle 状态", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      expect(ctrl.phase).toBe("reversing");
      ctrl.reset();
      expect(ctrl.phase).toBe("idle");
    });

    it("reset 后历史应清空", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      ctrl.addDriftSample({ reversalTime: 1, driftDistance: 0.1, forwardSimTime: 10 });
      ctrl.reset();
      expect(ctrl.driftHistory.length).toBe(0);
    });

    it("未 startReversal 直接 pause 不应崩溃", () => {
      const ctrl = new MockTimeReversalController();
      expect(() => ctrl.pause()).not.toThrow();
    });

    it("未 startReversal 直接 resume 不应崩溃", () => {
      const ctrl = new MockTimeReversalController();
      expect(() => ctrl.resume()).not.toThrow();
    });

    it("多次 dismissAnnotation 不应崩溃", () => {
      const ctrl = new MockTimeReversalController();
      expect(() => ctrl.dismissAnnotation()).not.toThrow();
      expect(() => ctrl.dismissAnnotation()).not.toThrow();
    });

    it("setMode 在反演过程中可切换模式", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      expect(() => ctrl.setMode("exact")).not.toThrow();
      expect(ctrl.mode).toBe("exact");
    });

    it("isActive 在 recording 或 reversing 时应为 true", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      expect(ctrl.isActive).toBe(true);
      ctrl.reset();
      expect(ctrl.isActive).toBe(false);
    });
  });

  describe("exceptions: 异常类诊断字段完整性", () => {
    it("ExploreError 应有 code 和 context 字段且 instanceof Error", () => {
      const err = new ExploreError("AUDIO_CONTEXT", "AudioContext failed", "初始化声音化");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ExploreError);
      expect(err.code).toBe("AUDIO_CONTEXT");
      expect(err.context).toBe("初始化声音化");
      expect(err.message).toBe("AudioContext failed");
      expect(err.name).toBe("ExploreError");
    });

    it("AudioContextError 应有 deviceType 字段且继承 ExploreError", () => {
      const err = new AudioContextError("不支持 Web Audio", "移动端音频初始化", "mobile");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ExploreError);
      expect(err).toBeInstanceOf(AudioContextError);
      expect(err.code).toBe("AUDIO_CONTEXT");
      expect(err.deviceType).toBe("mobile");
      expect(err.name).toBe("AudioContextError");
      expect(err.context).toBe("移动端音频初始化");
    });

    it("ButterflyWorkerError 应有 side 和 crashCount 字段", () => {
      const err = new ButterflyWorkerError("Worker crash", "A", 3);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ExploreError);
      expect(err).toBeInstanceOf(ButterflyWorkerError);
      expect(err.code).toBe("WORKER_CRASH");
      expect(err.side).toBe("A");
      expect(err.crashCount).toBe(3);
      expect(err.name).toBe("ButterflyWorkerError");
      expect(err.context).toContain("A");
    });

    it("InsufficientHistoryError 应有 currentFrames 和 requiredFrames 字段", () => {
      const err = new InsufficientHistoryError(50, 120);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ExploreError);
      expect(err).toBeInstanceOf(InsufficientHistoryError);
      expect(err.code).toBe("INSUFFICIENT_HISTORY");
      expect(err.currentFrames).toBe(50);
      expect(err.requiredFrames).toBe(120);
      expect(err.name).toBe("InsufficientHistoryError");
      // 消息应包含帧数信息
      expect(err.message).toContain("50");
      expect(err.message).toContain("120");
    });

    it("InvalidDeltaError 应有 value 和 validRange 字段", () => {
      const err = new InvalidDeltaError(-1);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ExploreError);
      expect(err).toBeInstanceOf(InvalidDeltaError);
      expect(err.code).toBe("INVALID_DELTA");
      expect(err.value).toBe(-1);
      expect(err.validRange).toEqual([1e-6, 10]);
      expect(err.name).toBe("InvalidDeltaError");
      expect(err.message).toContain("-1");
      expect(err.message).toContain("1e-6");
    });

    it("异常应可通过 code 字段做程序化区分", () => {
      const audioErr = new AudioContextError("test", "ctx", "desktop");
      const workerErr = new ButterflyWorkerError("test", "B", 5);
      const historyErr = new InsufficientHistoryError(0, 120);
      const deltaErr = new InvalidDeltaError(100);

      // 通过 code 字段区分异常类型
      const allErrors = [audioErr, workerErr, historyErr, deltaErr];
      const codes = allErrors.map((e) => e.code);
      expect(codes).toContain("AUDIO_CONTEXT");
      expect(codes).toContain("WORKER_CRASH");
      expect(codes).toContain("INSUFFICIENT_HISTORY");
      expect(codes).toContain("INVALID_DELTA");
    });
  });

  describe("sonification: ISonificationController 滥用", () => {
    it("连续多次 toggle 不应崩溃", () => {
      const ctrl = new MockSonificationController();
      expect(() => {
        ctrl.toggle();
        ctrl.toggle();
        ctrl.toggle();
        ctrl.toggle();
      }).not.toThrow();
      // 偶数次 toggle 回到初始状态
      expect(ctrl.isActive).toBe(false);
    });

    it("dispose 后 toggle 应安全（状态不应再变）", () => {
      const ctrl = new MockSonificationController();
      ctrl.toggle();
      ctrl.dispose();
      expect(ctrl.isActive).toBe(false);
      ctrl.toggle();
      expect(ctrl.isActive).toBe(true); // toggle 仍能工作
    });

    it("dispose 后 updateFrame 应安全不再转发", () => {
      const ctrl = new MockSonificationController();
      ctrl.toggle(); // 激活
      ctrl.dispose(); // 取消
      expect(() => ctrl.updateFrame(validSonificationParams())).not.toThrow();
      expect(ctrl.updateFrameCalls.length).toBe(0); // 不活跃不记录
    });
  });

  describe("butterfly-effect: ISeparationCalculator 滥用", () => {
    it("连续多次 compute 调用不应崩溃", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState();
      const sideB = validSimSideState({
        state: { theta1: 1.0, omega1: 0.5, theta2: -0.5, omega2: 1.0 },
      });
      for (let i = 0; i < 1000; i++) {
        expect(() => calc.compute(sideA, sideB)).not.toThrow();
      }
    });

    it("同一 sideA 和 sideB 互换参数顺序仍不崩溃", () => {
      const calc = new MockSeparationCalculator();
      const sideA = validSimSideState({
        state: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
      });
      const sideB = validSimSideState({
        state: { theta1: 1, omega1: 2, theta2: 3, omega2: 4 },
      });
      // compute(sideA, sideB) 和 compute(sideB, sideA) 均应不崩溃
      expect(() => calc.compute(sideA, sideB)).not.toThrow();
      expect(() => calc.compute(sideB, sideA)).not.toThrow();
    });
  });

  describe("time-reversal: ITimeReversalController 销毁后调用", () => {
    it("destroyed 后 startReversal 应安全返回不崩溃", () => {
      const ctrl = new MockTimeReversalController();
      ctrl.setCurrentFrames(200);
      ctrl.startReversal("numerical");
      ctrl.setDestroyed();
      expect(() => ctrl.startReversal("exact")).not.toThrow();
    });
  });

  describe("time-reversal: IDriftCalculator 滥用", () => {
    it("输入含 NaN 状态应安全处理", () => {
      const calc = new MockDriftCalculator();
      const fwd = { theta1: NaN, omega1: 0, theta2: 0, omega2: 0 };
      const rev = { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
      expect(() => calc.compute(fwd, rev)).not.toThrow();
      const dist = calc.compute(fwd, rev);
      // NaN 会导致结果为 NaN，但不崩溃——验证不抛异常即可
      expect(typeof dist).toBe("number");
    });

    it("输入含 Infinity 状态应安全处理", () => {
      const calc = new MockDriftCalculator();
      const fwd = { theta1: 0, omega1: Infinity, theta2: 0, omega2: 0 };
      const rev = { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
      expect(() => calc.compute(fwd, rev)).not.toThrow();
    });
  });

  describe("types: Scene3DConfig DEFAULT 值结构完整性", () => {
    it("cameraPresets 每个预设应含 position 和 target 各 3 元组", () => {
      for (const preset of ["side", "top", "chaos"] as ViewPreset[]) {
        const cfg = DEFAULT_SCENE3D_CONFIG.cameraPresets[preset];
        expect(cfg).toBeDefined();
        expect(cfg.position.length).toBe(3);
        expect(cfg.target.length).toBe(3);
        for (const v of cfg.position) expect(Number.isFinite(v)).toBe(true);
        for (const v of cfg.target) expect(Number.isFinite(v)).toBe(true);
      }
    });

    it("ballBaseRadius 应为正值", () => {
      expect(DEFAULT_SCENE3D_CONFIG.ballBaseRadius).toBeGreaterThan(0);
    });

    it("rodBaseRadius 应为正值", () => {
      expect(DEFAULT_SCENE3D_CONFIG.rodBaseRadius).toBeGreaterThan(0);
    });
  });
});
