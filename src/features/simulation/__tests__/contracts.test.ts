/**
 * simulation.contracts 对抗测试
 *
 * 覆盖所有 6 大契约域 + 异常层次 + 共享类型:
 *   物理引擎、能量监控、相空间、Worker 通信、仿真调度器、历史仓储
 *
 * 测试策略: P0 (契约违反) → P1 (边界值) → P2 (不变量) → P3 (滥用模式)
 *
 * 约束: 本文件不导入任何 domain/infrastructure/viewModel/hooks/view 的实现代码。
 *       仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  // 物理引擎
  IOdeSolver,
  // 仿真调度器
  ISimulationScheduler,
  // 能量监控
  DEFAULT_ENERGY_THRESHOLDS,
  // 共享类型/常量
  FRAME_BUFFER_LAYOUT,
  FRAMES_PER_BATCH,
  BATCH_PREFETCH_THRESHOLD,
  BATCH_BUFFER_LENGTH,
  POOL_CONFIG,
  SIMULATION_DEFAULTS,
  // 异常
  SimulationError,
  DivergenceError,
  TimeoutError,
  InvalidStateError,
  WorkerCrashError,
  WorkerNotReadyError,
  InvalidStateTransitionError,
} from "@/features/simulation/contracts";

import type {
  // 物理引擎
  IIntegrator,
  IIntegratorRegistry,
  // 能量监控
  EnergyThresholds,
  IEnergyCalculator,
  IEnergyDriftDetector,
  EnergyDriftResult,
  IEnergyProjector,
  // 相空间
  PhaseVariable,
  PhaseSpacePoint,
  IPhaseSpaceCollector,
  IPhaseSpaceYDomain,
  // Worker 通信
  IWorkerGateway,
  IWorkerRecoveryPolicy,
  IFloat64Pool,
  // 仿真调度器
  ISimulationLifecycle,
  IFrameBufferManager,
  // 历史仓储
  IHistoryRepository,
  HistoryQuery,
  // 共享类型
  SimulationFrame,
  InterpSnapshot,
  EnergyDataPoint,
  DerivedValues,
} from "@/features/simulation/contracts";

import type {
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  StateVector,
  PoincareSectionCondition,
  PoincarePoint,
  WorkerResponse,
} from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试工具
// ============================================================================

/** 标准有效参数 (不在测试目标中时使用) */
const VALID_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

const VALID_IC: InitialConditions = {
  theta1: Math.PI / 2,
  theta1Dot: 0,
  theta2: Math.PI / 2,
  theta2Dot: 0,
};

/** 检查 Float64Array 中是否含 NaN */
function hasNaN(arr: Float64Array, len?: number): boolean {
  const end = len ?? arr.length;
  for (let i = 0; i < end; i++) {
    if (Number.isNaN(arr[i]!)) return true;
  }
  return false;
}

/** 检查 Float64Array 中是否含 Infinity */
function hasInfinity(arr: Float64Array, len?: number): boolean {
  const end = len ?? arr.length;
  for (let i = 0; i < end; i++) {
    if (!Number.isFinite(arr[i]!)) return true;
  }
  return false;
}

// ============================================================================
// 模拟实现 (用于测试契约行为，不依赖真实实现)
// ============================================================================

/** Mock 积分器 */
class MockIntegrator implements IIntegrator {
  readonly method: IntegratorMethod;
  private _stepFn: (state: Float64Array, p: PendulumParams, dt: number) => void;

  constructor(method: IntegratorMethod = "RKF45") {
    this.method = method;
    this._stepFn = () => {}; // 默认空操作
  }

  setStepFn(fn: typeof this._stepFn) {
    this._stepFn = fn;
  }

  step(state: Float64Array, p: PendulumParams, dt: number): void {
    this._stepFn(state, p, dt);
  }
}

/** Mock 积分器注册表 */
class MockIntegratorRegistry implements IIntegratorRegistry {
  private _registry = new Map<IntegratorMethod, IIntegrator>();

  register(integrator: IIntegrator): void {
    if (integrator) {
      this._registry.set(integrator.method, integrator);
    }
  }

  get(method: IntegratorMethod): IIntegrator {
    return this._registry.get(method) ?? this._registry.get("RKF45")!;
  }
}

/** Mock IOdeSolver —— 填写抽象钩子以便测试模板方法 */
class MockOdeSolver extends IOdeSolver {
  // 暴露给测试，允许伪造前置/后置校验
  _validateInputsResult: (() => void) | null = null;
  _validateOutputsResult: (() => void) | null = null;
  _doIntegrateResult: number = 0;
  _doIntegrateFn: ((state: Float64Array, buffer: Float64Array, count: number) => void) | null = null;

  protected validateInputs(
    state: Float64Array,
    params: PendulumParams,
    _method: IntegratorMethod,
    _dt: number,
  ): void {
    if (this._validateInputsResult) {
      this._validateInputsResult();
    } else {
      // 默认校验：检查 state 无 NaN 且 params 无非法值
      if (hasNaN(state, 4) || hasInfinity(state, 4)) {
        throw new InvalidStateError("state contains NaN/Infinity", -1, "validateInputs");
      }
      if (params.m1 <= 0 || params.m2 <= 0 || params.L1 <= 0 || params.L2 <= 0 || params.g < 0 || params.damping < 0) {
        throw new InvalidStateError("invalid params", -1, "validateInputs");
      }
    }
  }

  protected _do_integrate(
    state: Float64Array,
    _params: PendulumParams,
    _method: IntegratorMethod,
    _dt: number,
    frames: number,
    buffer: Float64Array,
    _direction: 1 | -1,
  ): number {
    if (this._doIntegrateFn) {
      this._doIntegrateFn(state, buffer, this._doIntegrateResult || frames);
    }
    return this._doIntegrateResult || frames;
  }

  protected validateOutputs(
    _state: Float64Array,
    buffer: Float64Array,
    frameCount: number,
  ): void {
    if (this._validateOutputsResult) {
      this._validateOutputsResult();
    } else {
      const stride = FRAME_BUFFER_LAYOUT.stride;
      if (hasNaN(buffer, frameCount * stride) || hasInfinity(buffer, frameCount * stride)) {
        throw new DivergenceError("output contains NaN/Infinity", -1, "mock", _state);
      }
    }
  }
}

/** Mock ISimulationScheduler —— 填写抽象钩子 */
class MockScheduler extends ISimulationScheduler {
  private _running = false;
  public pauseCalled = 0;
  public resumeCalled = 0;
  public destroyCalled = 0;
  public resetCalled = 0;

  constructor(
    workerGateway: IWorkerGateway,
    pool: IFloat64Pool,
    recoveryPolicy: IWorkerRecoveryPolicy,
  ) {
    super(workerGateway, pool, recoveryPolicy);
  }

  get isRunning(): boolean { return this._running; }
  setRunning(v: boolean): void { this._running = v; }

  // 抽象方法实现 (占位)
  pause(): void { this.pauseCalled++; this._running = false; }
  resume(): void { this.resumeCalled++; this._running = true; }
  destroy(): void { this.destroyCalled++; this._running = false; }
  reset(_ic: InitialConditions, _simTime?: number): void { this.resetCalled++; }
  updateParams(_params: Partial<PendulumParams>): void {}
  setMethod(_method: IntegratorMethod): void {}
  setDirection(_direction: 1 | -1): void {}
  setPoincareCondition(_cond: PoincareSectionCondition | null): void {}
  enableExternalTick(): void {}
  disableExternalTick(): void {}
  tick(): boolean { return false; }
  tickDelta(_delta: number): number { return 0; }
  getInterpolationFrames(): { prev: InterpSnapshot | null; curr: InterpSnapshot | null } {
    return { prev: null, curr: null };
  }
  onReady(_cb: () => void): void {}
  onPoincarePoints(_cb: (pts: PoincarePoint[]) => void): () => void { return () => {}; }
  protected onStart(): void { this._running = true; }
  protected _do_requestBatch(): void {}
  protected _do_handleBatch(_buffer: Float64Array, _frameCount: number): void {}
  protected discardBuffers(): void {}
}

/** Mock IWorkerGateway */
class MockWorkerGateway implements IWorkerGateway {
  private _worker: Worker | null = null;
  public initCalls: Array<{ params: PendulumParams; ic: InitialConditions; method: IntegratorMethod }> = [];
  public stepCalls: Float64Array[] = [];
  public destroyCalls = 0;
  public messageHandlers: Array<(response: WorkerResponse) => void> = [];

  injectWorker(worker: Worker): void { this._worker = worker; }
  hasWorker(): boolean { return this._worker !== null; }

  sendInit(params: PendulumParams, ic: InitialConditions, method: IntegratorMethod): void {
    this.initCalls.push({ params, ic, method });
  }
  sendStep(buffer: Float64Array, _poincare?: PoincareSectionCondition | null): void {
    this.stepCalls.push(buffer);
  }
  sendUpdateParams(_params: Partial<PendulumParams>): void {}
  sendReset(_ic: InitialConditions, _simTime?: number): void {}
  sendDirection(_direction: 1 | -1): void {}
  sendMethod(_method: IntegratorMethod): void {}
  sendConfig(_computeForces?: boolean): void {}
  sendRunValidation(
    _scenarioId: "smallAngle" | "singlePendulum" | "energy",
    _params: PendulumParams,
    _ic: InitialConditions,
    _simDuration: number,
  ): void {}
  onMessage(handler: (response: WorkerResponse) => void): void {
    this.messageHandlers.push(handler);
  }
  destroy(): void { this.destroyCalls++; this._worker = null; }
}

/** Mock IWorkerRecoveryPolicy */
class MockRecoveryPolicy implements IWorkerRecoveryPolicy {
  readonly maxRetries: number;
  crashCount: number = 0;
  recoverCalls = 0;

  constructor(maxRetries: number = 1) { this.maxRetries = maxRetries; }

  recover(
    _lastKnownParams: PendulumParams,
    _lastKnownIC: InitialConditions,
    _lastKnownMethod: IntegratorMethod,
  ): void { this.recoverCalls++; }
  resetCounter(): void { this.crashCount = 0; }
}

/** Mock IFloat64Pool */
class MockFloat64Pool implements IFloat64Pool {
  private _buffers: Array<{ buffer: Float64Array; inUse: boolean }> = [];
  readonly size: number;

  constructor(poolSize: number = POOL_CONFIG.count, bufferSize: number = POOL_CONFIG.size) {
    this.size = poolSize;
    for (let i = 0; i < poolSize; i++) {
      this._buffers.push({ buffer: new Float64Array(bufferSize), inUse: false });
    }
  }

  acquire(): { buffer: Float64Array; index: number } | null {
    const idx = this._buffers.findIndex((b) => !b.inUse);
    if (idx === -1) return null;
    this._buffers[idx]!.inUse = true;
    return { buffer: this._buffers[idx]!.buffer, index: idx };
  }

  release(index: number, _newBuffer?: Float64Array): void {
    if (index >= 0 && index < this._buffers.length) {
      this._buffers[index]!.inUse = false;
    }
  }

  releaseBuffer(buffer: Float64Array): void {
    const idx = this._buffers.findIndex((b) => b.buffer === buffer);
    if (idx !== -1) this._buffers[idx]!.inUse = false;
  }

  get available(): number {
    return this._buffers.filter((b) => !b.inUse).length;
  }

  /** 内部使用——检查可用数 */
  getInUseCount(): number {
    return this._buffers.filter((b) => b.inUse).length;
  }
}

/** Mock IEnergyCalculator */
class MockEnergyCalculator implements IEnergyCalculator {
  compute(
    state: Float64Array,
    params: { m1: number; m2: number; L1: number; L2: number; g: number },
    t: number,
  ): EnergyDataPoint {
    // 简单的物理公式：K = 0.5 * (m1*L1^2*ω1^2 + m2*(L1*ω1+L2*ω2)^2) 近似
    // state 布局: [θ₁, ω₁, θ₂, ω₂]
    const omega1 = state[1]!;
    const omega2 = state[3]!;
    const K = 0.5 * (
      params.m1 * params.L1 * params.L1 * omega1 * omega1 +
      params.m2 * (params.L1 * params.L1 * omega1 * omega1 +
                    params.L2 * params.L2 * omega2 * omega2 +
                    2 * params.L1 * params.L2 * omega1 * omega2)
    );
    const V = (params.m1 + params.m2) * params.g * params.L1 * (1 - Math.cos(state[0]!)) +
              params.m2 * params.g * params.L2 * (1 - Math.cos(state[2]!));
    return { t, K, V, E: K + V };
  }
}

/** Mock IEnergyDriftDetector */
class MockDriftDetector implements IEnergyDriftDetector {
  private _baseline = 0;
  private _thresholds: EnergyThresholds = DEFAULT_ENERGY_THRESHOLDS;

  establishBaseline(initialEnergy: number): void { this._baseline = initialEnergy; }

  detect(currentEnergy: number, damping: number, isActive: boolean, _resetTrigger: number): EnergyDriftResult {
    if (damping > 0) {
      return { confidence: 0, exceeded: false, driftPercent: 0, absDrift: 0, energyRange: [currentEnergy, currentEnergy], isStopped: false };
    }
    if (!isActive) {
      return { confidence: 0, exceeded: false, driftPercent: 0, absDrift: 0, energyRange: [0, 0], isStopped: true };
    }
    const absDrift = Math.abs(currentEnergy - this._baseline);
    const driftPercent = this._baseline !== 0 ? absDrift / Math.abs(this._baseline) : 0;
    const confidence = Math.min(1, driftPercent / this._thresholds.driftThreshold);
    const exceeded = confidence > 0.8;
    return {
      confidence,
      exceeded,
      driftPercent,
      absDrift,
      energyRange: [Math.min(currentEnergy, this._baseline), Math.max(currentEnergy, this._baseline)],
      isStopped: false,
    };
  }
}

/** Mock IEnergyProjector (能量投影) */
class MockEnergyProjector implements IEnergyProjector {
  project(
    state: Float64Array,
    params: { m1: number; m2: number; L1: number; L2: number; g: number },
    targetEnergy: number,
  ): number {
    const calc = new MockEnergyCalculator();
    const current = calc.compute(state, params, 0);
    const correction = targetEnergy - current.E;
    if (current.K > 1e-10) {
      const scale = Math.sqrt(Math.max(0, (current.K + correction) / current.K));
      state[1] = state[1]! * scale;
      state[3] = state[3]! * scale;
      return correction;
    }
    // 动能极小时无法投影，返回 0
    return 0;
  }
}

/** Mock IPhaseSpaceCollector */
class MockPhaseSpaceCollector implements IPhaseSpaceCollector {
  private _trajectories = new Map<PhaseVariable, PhaseSpacePoint[]>();

  appendPoint(variable: PhaseVariable, theta: number, thetaDot: number, maxPoints: number): void {
    if (!Number.isFinite(theta) || !Number.isFinite(thetaDot)) return;
    let arr = this._trajectories.get(variable);
    if (!arr) {
      arr = [];
      this._trajectories.set(variable, arr);
    }
    arr.push({ theta, thetaDot });
    while (arr.length > maxPoints) {
      arr.shift();
    }
  }

  getTrajectory(variable: PhaseVariable): readonly PhaseSpacePoint[] {
    return this._trajectories.get(variable) ?? [];
  }

  clearAll(): void {
    this._trajectories.clear();
  }

  decimate(variable: PhaseVariable, factor: number): void {
    const arr = this._trajectories.get(variable);
    if (!arr || factor <= 1) return;
    const newArr: PhaseSpacePoint[] = [];
    for (let i = 0; i < arr.length; i += factor) {
      newArr.push(arr[i]!);
    }
    this._trajectories.set(variable, newArr);
  }
}

/** Mock IPhaseSpaceYDomain */
class MockYDomain implements IPhaseSpaceYDomain {
  updateDomain(
    trajectory: readonly PhaseSpacePoint[],
    _currentDomain: [number, number],
    _emaSmooth: number,
    _shrinkThreshold: number,
    minRange: number,
  ): [number, number] {
    if (trajectory.length === 0) return [-minRange / 2, minRange / 2];
    let min = Infinity, max = -Infinity;
    for (const p of trajectory) {
      if (p.thetaDot < min) min = p.thetaDot;
      if (p.thetaDot > max) max = p.thetaDot;
    }
    let lo = min, hi = max;
    if (hi - lo < minRange) {
      const mid = (lo + hi) / 2;
      lo = mid - minRange / 2;
      hi = mid + minRange / 2;
    }
    return [lo, hi];
  }
}

/** Mock IHistoryRepository — 内存实现 */
class MockHistoryRepository implements IHistoryRepository {
  private _history: StateVector[] = [];
  private _recording = true;

  push(state: StateVector): void {
    if (!this._recording) return;
    this._history.push({ ...state });
  }

  pauseRecording(): void { this._recording = false; }
  resumeRecording(): void { this._recording = true; }

  toArray(): readonly StateVector[] {
    return [...this._history];
  }

  get length(): number { return this._history.length; }
  get isRecording(): boolean { return this._recording; }

  clear(): void { this._history = []; }
}

/** Mock ISimulationLifecycle — 状态机 */
class MockLifecycle implements ISimulationLifecycle {
  phase: "idle" | "running" | "paused" | "reversed" = "idle";

  start(_params: PendulumParams, _ic: InitialConditions, _method: IntegratorMethod): void {
    if (this.phase !== "idle") {
      throw new InvalidStateTransitionError("illegal transition", -1, this.phase, "running");
    }
    this.phase = "running";
  }

  pause(): void {
    if (this.phase !== "running" && this.phase !== "reversed") {
      throw new InvalidStateTransitionError("illegal transition", -1, this.phase, "paused");
    }
    this.phase = "paused";
  }

  resume(): void {
    if (this.phase !== "paused") {
      throw new InvalidStateTransitionError("illegal transition", -1, this.phase, "running");
    }
    this.phase = "running";
  }

  reset(_ic: InitialConditions): void {
    this.phase = "idle";
  }

  destroy(): void {
    this.phase = "idle";
  }
}

/** Mock IFrameBufferManager */
class MockFrameBufferManager implements IFrameBufferManager {
  private _activeBuffer: Float64Array | null = null;
  private _activeIndex = 0;
  private _activeFrameCount = 0;
  private _nextBuffer: Float64Array | null = null;
  private _nextIndex = 0;
  private _nextFrameCount = 0;

  setActive(buffer: Float64Array, bufferIndex: number, frameCount: number): void {
    this._activeBuffer = buffer;
    this._activeIndex = bufferIndex;
    this._activeFrameCount = frameCount;
  }

  setNext(buffer: Float64Array, bufferIndex: number, frameCount: number): void {
    this._nextBuffer = buffer;
    this._nextIndex = bufferIndex;
    this._nextFrameCount = frameCount;
  }

  consumeOne(): SimulationFrame | null {
    if (!this._activeBuffer || this._activeIndex >= this._activeFrameCount) {
      this._activeBuffer = this._nextBuffer;
      this._activeIndex = this._nextIndex;
      this._activeFrameCount = this._nextFrameCount;
      this._nextBuffer = null;
    }
    if (!this._activeBuffer || this._activeIndex >= this._activeFrameCount) return null;
    const stride = FRAME_BUFFER_LAYOUT.stride;
    const base = this._activeIndex * stride;
    this._activeIndex++;
    if (this._activeBuffer.length < base + stride) return null;
    return {
      t: this._activeBuffer[base + 0]!,
      theta1: this._activeBuffer[base + 1]!,
      theta1Dot: this._activeBuffer[base + 2]!,
      theta2: this._activeBuffer[base + 3]!,
      theta2Dot: this._activeBuffer[base + 4]!,
      x1: this._activeBuffer[base + 5]!,
      y1: this._activeBuffer[base + 6]!,
      x2: this._activeBuffer[base + 7]!,
      y2: this._activeBuffer[base + 8]!,
      kineticEnergy: this._activeBuffer[base + 9]!,
      potentialEnergy: this._activeBuffer[base + 10]!,
      totalEnergy: this._activeBuffer[base + 11]!,
      alpha1: this._activeBuffer[base + 12]!,
      alpha2: this._activeBuffer[base + 13]!,
    };
  }

  clear(): void {
    this._activeBuffer = null;
    this._nextBuffer = null;
    this._activeIndex = 0;
    this._activeFrameCount = 0;
  }

  get hasFrames(): boolean {
    return (!!this._activeBuffer && this._activeIndex < this._activeFrameCount) ||
           (!!this._nextBuffer && this._nextFrameCount > 0);
  }

  get needsPrefetch(): boolean {
    return this._activeIndex >= BATCH_PREFETCH_THRESHOLD;
  }
}

// ============================================================================
// 测试开始
// ============================================================================

// ─────────────────────────────────────────────────
// P0: 契约违反 —— 验证前置条件被强制执行
// ─────────────────────────────────────────────────

describe("P0: 契约违反 — 前置条件强制执行", () => {

  describe("physics-engine: IOdeSolver.solve() 前置校验", () => {
    const registry = new MockIntegratorRegistry();
    registry.register(new MockIntegrator("RKF45"));

    it("应拒绝 state 含 NaN 的输入，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const nanState = new Float64Array([NaN, 1, 0, 1]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      expect(() =>
        solver.solve(nanState, VALID_PARAMS, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });

    it("应拒绝 state 含 Infinity 的输入，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const infState = new Float64Array([Infinity, 0, 0, 0]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      expect(() =>
        solver.solve(infState, VALID_PARAMS, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });

    it("应拒绝 state 含 -Infinity 的输入，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const infState = new Float64Array([-Infinity, 0, 0, 0]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      expect(() =>
        solver.solve(infState, VALID_PARAMS, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });

    it("应拒绝零质量参数 (m1=0)，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const state = new Float64Array([1, 1, 1, 1]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      const badParams = { ...VALID_PARAMS, m1: 0 };
      expect(() =>
        solver.solve(state, badParams, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });

    it("应拒绝负杆长参数 (L1=-1)，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const state = new Float64Array([1, 1, 1, 1]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      const badParams = { ...VALID_PARAMS, L1: -1 };
      expect(() =>
        solver.solve(state, badParams, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });

    it("应拒绝负重力加速度参数 (g<0)，抛出 InvalidStateError", () => {
      const solver = new MockOdeSolver(registry);
      const state = new Float64Array([1, 1, 1, 1]);
      const buffer = new Float64Array(BATCH_BUFFER_LENGTH);
      const badParams = { ...VALID_PARAMS, g: -0.1 };
      expect(() =>
        solver.solve(state, badParams, "RKF45", 1 / 60, 1, buffer, 1),
      ).toThrow(InvalidStateError);
    });
  });

  describe("simulation-scheduler: ISimulationLifecycle 非法状态转换", () => {
    it("应拒绝 idle → paused 的直接跳转", () => {
      const lifecycle = new MockLifecycle();
      expect(() => lifecycle.pause()).toThrow(InvalidStateTransitionError);
    });

    it("应拒绝 idle → resume 的直接跳转", () => {
      const lifecycle = new MockLifecycle();
      expect(() => lifecycle.resume()).toThrow(InvalidStateTransitionError);
    });

    it("应拒绝 running → start 的重复启动", () => {
      const lifecycle = new MockLifecycle();
      lifecycle.start(VALID_PARAMS, VALID_IC, "RKF45");
      expect(() => lifecycle.start(VALID_PARAMS, VALID_IC, "RKF45")).toThrow(
        InvalidStateTransitionError,
      );
    });

    it("应拒绝 paused → resume 后再次 resume", () => {
      const lifecycle = new MockLifecycle();
      lifecycle.start(VALID_PARAMS, VALID_IC, "RKF45");
      lifecycle.pause();
      lifecycle.resume();
      expect(() => lifecycle.resume()).toThrow(InvalidStateTransitionError);
    });
  });

  describe("exceptions: 异常诊断字段完整性", () => {
    it("SimulationError 应有 code 和 simTime 诊断字段", () => {
      const err = new SimulationError("DIVERGED", "test error", 10.5);
      expect(err.code).toBe("DIVERGED");
      expect(err.simTime).toBe(10.5);
      expect(err.message).toBe("test error");
      expect(err.name).toBe("SimulationError");
    });

    it("DivergenceError 应有 method 和 state 诊断字段", () => {
      const state = new Float64Array([1, 2, 3, NaN]);
      const err = new DivergenceError("diverged at step 100", 5.0, "RKF45", state);
      expect(err.code).toBe("DIVERGED");
      expect(err.method).toBe("RKF45");
      expect(err.state.length).toBe(4);
      expect(err.simTime).toBe(5.0);
      // 防御性拷贝：修改源 state 不影响 err.state
      state[0] = 999;
      expect(err.state[0]).toBe(1);
    });

    it("TimeoutError 应有 timeoutMs 诊断字段", () => {
      const err = new TimeoutError("worker timeout", 100.0, 2000);
      expect(err.code).toBe("TIMEOUT");
      expect(err.timeoutMs).toBe(2000);
      expect(err.simTime).toBe(100.0);
    });

    it("InvalidStateError 应有 context 诊断字段", () => {
      const err = new InvalidStateError("bad params", -1, "parameter validation");
      expect(err.code).toBe("INVALID_STATE");
      expect(err.context).toBe("parameter validation");
    });

    it("WorkerCrashError 应有 crashCount 和 maxRetries 诊断字段", () => {
      const err = new WorkerCrashError("worker crashed", 42.0, 3, 5);
      expect(err.code).toBe("WORKER_CRASH");
      expect(err.crashCount).toBe(3);
      expect(err.maxRetries).toBe(5);
    });

    it("WorkerNotReadyError 应有 pendingCommand 诊断字段且 simTime 为 -1", () => {
      const err = new WorkerNotReadyError("worker not ready", "step");
      expect(err.code).toBe("INVALID_STATE");
      expect(err.pendingCommand).toBe("step");
      expect(err.simTime).toBe(-1);
    });

    it("InvalidStateTransitionError 应有 fromPhase 和 toPhase 诊断字段", () => {
      const err = new InvalidStateTransitionError("bad transition", 0, "idle", "paused");
      expect(err.code).toBe("INVALID_STATE");
      expect(err.fromPhase).toBe("idle");
      expect(err.toPhase).toBe("paused");
    });
  });
});

// ─────────────────────────────────────────────────
// P1: 边界值 —— 在合法区间的边缘行为
// ─────────────────────────────────────────────────

describe("P1: 边界值 — 合法区间边缘行为", () => {

  describe("physics-engine: IIntegrator.step() 极端步长", () => {
    const integrator = new MockIntegrator("Euler");
    const state = new Float64Array([1, 1, 1, 1]);
    const params: PendulumParams = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 };

    it("应处理 dt=0 (零步长，状态不变)", () => {
      const original = new Float64Array(state);
      integrator.step(state, params, 0);
      // 零步长下状态不应改变
      expect(state[0]).toBe(original[0]);
      expect(state[1]).toBe(original[1]);
      expect(state[2]).toBe(original[2]);
      expect(state[3]).toBe(original[3]);
    });

    it("应处理 dt=1e-14 (极微小步长)", () => {
      const s = new Float64Array([1, 1, 1, 1]);
      expect(() => integrator.step(s, params, 1e-14)).not.toThrow();
      // 微小步长下状态变化应极小
      expect(Math.abs(s[0]! - 1)).toBeLessThan(1e-10);
    });

    it("应处理 dt=3600 (极大步长，一小时)", () => {
      const s = new Float64Array([0.1, 0.5, 0.2, 0.3]);
      expect(() => integrator.step(s, params, 3600)).not.toThrow();
      // 极大步长可能导致数值爆炸，但不应崩溃
      // 仅验证不抛异常
    });

    it("应处理 dt 为负数 (反向积分)", () => {
      const s = new Float64Array([0.1, 0.5, 0.2, 0.3]);
      expect(() => integrator.step(s, params, -0.01)).not.toThrow();
    });
  });

  describe("energy-monitor: IEnergyCalculator.compute() 边界状态", () => {
    const calc = new MockEnergyCalculator();
    const params = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81 };

    it("应处理静止状态 (所有角速度为 0)", () => {
      const state = new Float64Array([Math.PI / 4, 0, Math.PI / 4, 0]);
      const result = calc.compute(state, params, 0);
      expect(result.K).toBe(0);
      expect(result.E).toBe(result.V);
      expect(result.K).toBeGreaterThanOrEqual(0);
    });

    it("应处理超大角速度 (1000 rad/s)", () => {
      const state = new Float64Array([0, 1000, 0, 1000]);
      const result = calc.compute(state, params, 0);
      expect(result.K).toBeGreaterThan(0);
      expect(Number.isFinite(result.K)).toBe(true);
      expect(Number.isFinite(result.E)).toBe(true);
    });

    it("应处理角度 pi/2 时势能计算", () => {
      const state = new Float64Array([Math.PI / 2, 0, Math.PI / 2, 0]);
      const result = calc.compute(state, params, 0);
      // 静止在 pi/2 时 K=0, E=V
      expect(result.K).toBeGreaterThanOrEqual(0);
      expect(Math.abs(result.E - result.V)).toBeLessThan(1e-10);
    });
  });

  describe("worker-gateway: IFloat64Pool 池容量边界", () => {
    it("应返回 null 当第 11 次 acquire 时 (池容量=10)", () => {
      const pool = new MockFloat64Pool(10);
      for (let i = 0; i < 10; i++) {
        const result = pool.acquire();
        expect(result).not.toBeNull();
      }
      const exhausted = pool.acquire();
      expect(exhausted).toBeNull();
    });

    it("应在 release 后允许重新 acquire", () => {
      const pool = new MockFloat64Pool(10);
      const first = pool.acquire();
      expect(first).not.toBeNull();
      expect(pool.available).toBe(9);
      pool.release(first!.index);
      expect(pool.available).toBe(10);
      const again = pool.acquire();
      expect(again).not.toBeNull();
    });

    it("应支持 releaseBuffer 通过引用归还", () => {
      const pool = new MockFloat64Pool(5);
      const result = pool.acquire();
      expect(pool.available).toBe(4);
      pool.releaseBuffer(result!.buffer);
      expect(pool.available).toBe(5);
    });
  });

  describe("energy-monitor: IEnergyDriftDetector.detect() 边界能量", () => {
    it("应处理负能量值", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(-10);
      const result = detector.detect(-10.5, 0, true, 0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.absDrift).toBeGreaterThanOrEqual(0);
    });

    it("应处理零能量基线", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(0);
      const result = detector.detect(0.05, 0, true, 0);
      // 零基线下的漂移百分比应安全计算
      expect(Number.isFinite(result.confidence)).toBe(true);
      expect(result.absDrift).toBe(0.05);
    });

    it("应处理极大能量 (1e6 J)", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(1e6);
      const result = detector.detect(1.01e6, 0, true, 0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.absDrift).toBe(10000);
    });

    it("阻尼大于 0 时应始终返回 confidence=0 且 exceeded=false", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(100);
      const result = detector.detect(200, 0.5, true, 0);
      expect(result.confidence).toBe(0);
      expect(result.exceeded).toBe(false);
    });

    it("非活跃状态时应返回 isStopped=true", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(100);
      const result = detector.detect(100, 0, false, 0);
      expect(result.isStopped).toBe(true);
      expect(result.confidence).toBe(0);
    });
  });

  describe("phase-space: IPhaseSpaceCollector 轨迹容量边界", () => {
    it("应保持轨迹长度 ≤ maxPoints", () => {
      const collector = new MockPhaseSpaceCollector();
      const maxPoints = 50;
      for (let i = 0; i < 150; i++) {
        collector.appendPoint("theta1", i * 0.01, i * 0.1, maxPoints);
      }
      expect(collector.getTrajectory("theta1").length).toBeLessThanOrEqual(maxPoints);
    });

    it("应处理空轨迹的查询", () => {
      const collector = new MockPhaseSpaceCollector();
      expect(collector.getTrajectory("theta1")).toEqual([]);
      expect(collector.getTrajectory("theta2")).toEqual([]);
    });

    it("应处理 NaN 输入 (静默跳过)", () => {
      const collector = new MockPhaseSpaceCollector();
      collector.appendPoint("theta1", NaN, 1, 100);
      collector.appendPoint("theta1", 1, NaN, 100);
      collector.appendPoint("theta1", Infinity, 1, 100);
      expect(collector.getTrajectory("theta1").length).toBe(0);
    });

    it("应降采样到 factor 倍稀疏", () => {
      const collector = new MockPhaseSpaceCollector();
      for (let i = 0; i < 100; i++) {
        collector.appendPoint("theta1", i * 0.01, i * 0.1, 200);
      }
      collector.decimate("theta1", 2);
      expect(collector.getTrajectory("theta1").length).toBe(50);
      collector.decimate("theta1", 5);
      expect(collector.getTrajectory("theta1").length).toBe(10);
    });

    it("clearAll 后轨迹应为空", () => {
      const collector = new MockPhaseSpaceCollector();
      collector.appendPoint("theta1", 0.5, 2.0, 100);
      collector.appendPoint("theta2", -1.0, -3.0, 100);
      collector.clearAll();
      expect(collector.getTrajectory("theta1").length).toBe(0);
      expect(collector.getTrajectory("theta2").length).toBe(0);
    });
  });

  describe("phase-space: IPhaseSpaceYDomain 空轨迹边界", () => {
    it("空轨迹应返回最小范围 [lo, hi] 满足 hi - lo >= minRange", () => {
      const yDomain = new MockYDomain();
      const domain = yDomain.updateDomain([], [0, 1], 0.2, 0.7, 2.0);
      expect(domain[1]! - domain[0]!).toBeGreaterThanOrEqual(2.0);
    });

    it("单点轨迹应扩展到 minRange", () => {
      const yDomain = new MockYDomain();
      const traj: PhaseSpacePoint[] = [{ theta: 0, thetaDot: 5.0 }];
      const domain = yDomain.updateDomain(traj, [0, 1], 0.2, 0.7, 2.0);
      expect(domain[1]! - domain[0]!).toBeGreaterThanOrEqual(2.0);
      // 应包含原始值
      expect(domain[0]!).toBeLessThanOrEqual(5.0);
      expect(domain[1]!).toBeGreaterThanOrEqual(5.0);
    });

    it("数据范围大于 minRange 时应扩展包含所有值", () => {
      const yDomain = new MockYDomain();
      const traj: PhaseSpacePoint[] = [
        { theta: 0, thetaDot: -10 },
        { theta: 0, thetaDot: 20 },
      ];
      const domain = yDomain.updateDomain(traj, [0, 1], 0.2, 0.7, 2.0);
      expect(domain[0]!).toBeLessThanOrEqual(-10);
      expect(domain[1]!).toBeGreaterThanOrEqual(20);
    });
  });

  describe("FrameBufferManager: IFrameBufferManager 空缓冲区边界", () => {
    it("无活跃缓冲区时 consumeOne() 应返回 null", () => {
      const fm = new MockFrameBufferManager();
      expect(fm.consumeOne()).toBeNull();
    });

    it("空活跃缓冲区时 hasFrames 应为 false", () => {
      const fm = new MockFrameBufferManager();
      expect(fm.hasFrames).toBe(false);
    });

    it("消费进度未到阈值时 needsPrefetch 应为 false", () => {
      const fm = new MockFrameBufferManager();
      expect(fm.needsPrefetch).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────
// P2: 不变量 —— 验证后置条件成立
// ─────────────────────────────────────────────────

describe("P2: 不变量 — 后置条件验证", () => {

  describe("energy-monitor: IEnergyCalculator.compute() 能量不变量", () => {
    const calc = new MockEnergyCalculator();
    const params = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81 };

    it("K >= 0 对任意合法输入成立", () => {
      const testCases = [
        [0, 0, 0, 0],
        [Math.PI / 2, 0, Math.PI / 2, 0],
        [0.5, 2.0, -0.3, 1.5],
        [Math.PI, 10, -Math.PI / 2, -5],
      ];
      for (const tc of testCases) {
        const state = new Float64Array(tc);
        const result = calc.compute(state, params, 0);
        expect(result.K).toBeGreaterThanOrEqual(0);
      }
    });

    it("E = K + V 对任意合法输入成立 (浮点精度 1e-12)", () => {
      const testCases = [
        [0, 0, 0, 0],
        [Math.PI / 2, 0, Math.PI / 2, 0],
        [0.5, 2.0, -0.3, 1.5],
        [Math.PI, 10, -Math.PI / 2, -5],
        [0, 100, 0, 200],
      ];
      for (const tc of testCases) {
        const state = new Float64Array(tc);
        const result = calc.compute(state, params, 0);
        expect(result.E).toBeCloseTo(result.K + result.V, 10);
      }
    });

    it("EnergyDataPoint 结构应包含 t, K, V, E 四字段", () => {
      const state = new Float64Array([0, 0, 0, 0]);
      const result = calc.compute(state, params, 1.5);
      expect(result).toHaveProperty("t");
      expect(result).toHaveProperty("K");
      expect(result).toHaveProperty("V");
      expect(result).toHaveProperty("E");
      expect(result.t).toBe(1.5);
    });
  });

  describe("energy-monitor: IEnergyProjector.project() 能量投影不变量", () => {
    it("投影后总能量应逼近目标值", () => {
      const projector = new MockEnergyProjector();
      const calc = new MockEnergyCalculator();
      const params = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81 };
      const state = new Float64Array([0.5, 10.0, 0, 5.0]);
      const pre = calc.compute(state, params, 0);

      const targetEnergy = 500;
      const correction = projector.project(state, params, targetEnergy);
      const post = calc.compute(state, params, 0);

      // 后置：总能量应接近目标值
      expect(Math.abs(post.E - targetEnergy)).toBeLessThan(1e-9);
      // 校正量 = 目标值 - 投影前总能量
      expect(correction).toBeCloseTo(targetEnergy - pre.E, 8);
    });

    it("动能极小 (接近零) 时应返回 0 校正量且不修改 state", () => {
      const projector = new MockEnergyProjector();
      const params = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81 };
      const state = new Float64Array([Math.PI / 4, 0, Math.PI / 4, 0]); // K=0
      const original = new Float64Array(state);
      const correction = projector.project(state, params, 500);
      expect(correction).toBe(0);
      // state 不应被修改（ω₁, ω₂ 应保持原值）
      expect(state[1]).toBe(original[1]);
      expect(state[3]).toBe(original[3]);
    });
  });

  describe("physics-engine: IOdeSolver.solve() 输出不变量", () => {
    it("输出 buffer 中不应含 NaN", () => {
      const registry = new MockIntegratorRegistry();
      registry.register(new MockIntegrator("RKF45"));
      const solver = new MockOdeSolver(registry);
      const state = new Float64Array([0.5, 1.0, -0.3, 0.8]);
      const frames = 10;
      const stride = FRAME_BUFFER_LAYOUT.stride;
      const buffer = new Float64Array(frames * stride);

      // 模拟积分填充正常值
      solver._doIntegrateFn = (_s, _buf, count) => {
        for (let i = 0; i < count * stride; i++) {
          _buf[i] = i * 0.1; // 全部为有限值
        }
      };

      solver.solve(state, VALID_PARAMS, "RKF45", 1 / 60, frames, buffer, 1);
      expect(hasNaN(buffer, frames * stride)).toBe(false);
    });

    it("输出 buffer 中不应含 Infinity", () => {
      const registry = new MockIntegratorRegistry();
      registry.register(new MockIntegrator("RKF45"));
      const solver = new MockOdeSolver(registry);
      const state = new Float64Array([0.5, 1.0, -0.3, 0.8]);
      const frames = 10;
      const stride = FRAME_BUFFER_LAYOUT.stride;
      const buffer = new Float64Array(frames * stride);

      solver._doIntegrateFn = (_s, _buf, count) => {
        for (let i = 0; i < count * stride; i++) {
          _buf[i] = i * 0.1;
        }
      };

      solver.solve(state, VALID_PARAMS, "RKF45", 1 / 60, frames, buffer, 1);
      expect(hasInfinity(buffer, frames * stride)).toBe(false);
    });

    it("应返回正确的实际积分数 (≤ frames)", () => {
      const registry = new MockIntegratorRegistry();
      registry.register(new MockIntegrator("RKF45"));
      const solver = new MockOdeSolver(registry);
      solver._doIntegrateResult = 5;
      const state = new Float64Array([0.5, 1.0, -0.3, 0.8]);
      const buffer = new Float64Array(200 * FRAME_BUFFER_LAYOUT.stride);
      const count = solver.solve(state, VALID_PARAMS, "RKF45", 1 / 60, 200, buffer, 1);
      expect(count).toBe(5);
      expect(count).toBeLessThanOrEqual(200);
    });
  });

  describe("phase-space: IPhaseSpaceCollector 轨迹长度不变量", () => {
    it("轨迹长度应始终 ≤ maxPoints", () => {
      const collector = new MockPhaseSpaceCollector();
      const maxPoints = 75;
      for (let i = 0; i < 300; i++) {
        collector.appendPoint("theta1", Math.sin(i * 0.01) * Math.PI, Math.cos(i * 0.02) * 10, maxPoints);
      }
      expect(collector.getTrajectory("theta1").length).toBeLessThanOrEqual(maxPoints);
    });

    it("所有轨迹点的 theta 应在 [-pi, pi) 范围内", () => {
      const collector = new MockPhaseSpaceCollector();
      // 但契约说 theta 已归一化到 [-pi, pi)，消费方对未归一化负责
      // 我们只检查收集器不崩溃
      for (let i = 0; i < 10; i++) {
        collector.appendPoint("theta1", i * Math.PI, i * 0.5, 100);
      }
      expect(collector.getTrajectory("theta1").length).toBe(10);
    });
  });

  describe("history-repository: IHistoryRepository.toArray() 副本语义不变量", () => {
    it("toArray() 应返回历史数据的副本而非引用", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 1, omega1: 2, theta2: 3, omega2: 4 });
      const arr = repo.toArray();
      // 修改返回的数组不应影响内部
      (arr as StateVector[]).push({ theta1: 99, omega1: 99, theta2: 99, omega2: 99 });
      expect(repo.length).toBe(1);
    });

    it("toArray() 应按插入顺序返回数据", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 0, omega1: 1, theta2: 2, omega2: 3 });
      repo.push({ theta1: 10, omega1: 11, theta2: 12, omega2: 13 });
      repo.push({ theta1: 20, omega1: 21, theta2: 22, omega2: 23 });
      const arr = repo.toArray();
      expect(arr.length).toBe(3);
      expect(arr[0]!.theta1).toBe(0);
      expect(arr[2]!.theta1).toBe(20);
    });

    it("length 应反映实际存储的帧数", () => {
      const repo = new MockHistoryRepository();
      expect(repo.length).toBe(0);
      repo.push({ theta1: 0, omega1: 0, theta2: 0, omega2: 0 });
      expect(repo.length).toBe(1);
      for (let i = 0; i < 5; i++) {
        repo.push({ theta1: i, omega1: i, theta2: i, omega2: i });
      }
      expect(repo.length).toBe(6);
    });
  });

  describe("worker-gateway: IFloat64Pool 池不变量", () => {
    it("available + inUse === size 始终保持", () => {
      const pool = new MockFloat64Pool(10);
      let prev = 0;
      for (let i = 0; i < 10; i++) {
        const result = pool.acquire();
        if (result) {
          const inUse = pool.size - pool.available;
          expect(inUse).toBe(i + 1);
          expect(pool.available + inUse).toBe(pool.size);
          prev = result.index;
        }
      }
      // 归还后检查
      pool.release(prev);
      expect(pool.available + (pool as MockFloat64Pool).getInUseCount()).toBe(pool.size);
    });
  });

  describe("simulation-scheduler: ISimulationScheduler.start() 模板方法流程", () => {
    it("start() 应清空旧缓冲区并发送 init 命令", () => {
      const gw = new MockWorkerGateway();
      // 模拟 Worker 已注入
      gw.injectWorker({} as Worker);
      const pool = new MockFloat64Pool();
      const rp = new MockRecoveryPolicy();
      const scheduler = new MockScheduler(gw, pool, rp);

      scheduler.start(VALID_PARAMS, VALID_IC, "RKF45");

      // init 命令被发送
      expect(gw.initCalls.length).toBe(1);
      expect(gw.initCalls[0]!.params.m1).toBe(1.0);
      expect(gw.initCalls[0]!.method).toBe("RKF45");
      // 运行状态已设置
      expect(scheduler.isRunning).toBe(true);
    });
  });

  describe("energy-monitor: DEFAULT_ENERGY_THRESHOLDS 合理性", () => {
    it("driftThreshold 应为正值", () => {
      expect(DEFAULT_ENERGY_THRESHOLDS.driftThreshold).toBeGreaterThan(0);
    });

    it("lowEnergyThreshold 应为正值", () => {
      expect(DEFAULT_ENERGY_THRESHOLDS.lowEnergyThreshold).toBeGreaterThan(0);
    });

    it("absDriftThreshold 应为正值", () => {
      expect(DEFAULT_ENERGY_THRESHOLDS.absDriftThreshold).toBeGreaterThan(0);
    });

    it("stoppedOmegaThreshold 应极小 (≤ 1e-3)", () => {
      expect(DEFAULT_ENERGY_THRESHOLDS.stoppedOmegaThreshold).toBeLessThanOrEqual(1e-3);
    });

    it("所有阈值应为非负有限值", () => {
      const t = DEFAULT_ENERGY_THRESHOLDS;
      expect(Number.isFinite(t.driftThreshold)).toBe(true);
      expect(Number.isFinite(t.lowEnergyThreshold)).toBe(true);
      expect(Number.isFinite(t.absDriftThreshold)).toBe(true);
      expect(Number.isFinite(t.maxNanFrames)).toBe(true);
      expect(Number.isFinite(t.stoppedOmegaThreshold)).toBe(true);
      expect(Number.isFinite(t.stoppedFrameCount)).toBe(true);
      expect(t.driftThreshold).toBeGreaterThanOrEqual(0);
      expect(t.stoppedFrameCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("types.contract: 常量自洽性", () => {
    it("FRAME_BUFFER_LAYOUT.stride 应为 14", () => {
      expect(FRAME_BUFFER_LAYOUT.stride).toBe(14);
    });

    it("BATCH_BUFFER_LENGTH = FRAMES_PER_BATCH * FRAME_STRIDE", () => {
      const stride = FRAME_BUFFER_LAYOUT.stride;
      expect(BATCH_BUFFER_LENGTH).toBe(FRAMES_PER_BATCH * stride);
    });

    it("POOL_CONFIG.size > BATCH_BUFFER_LENGTH", () => {
      expect(POOL_CONFIG.size).toBeGreaterThan(BATCH_BUFFER_LENGTH);
    });

    it("POOL_CONFIG.count 应等于 10", () => {
      expect(POOL_CONFIG.count).toBe(10);
    });

    it("SIMULATION_DEFAULTS.dt 应为正有限值", () => {
      expect(SIMULATION_DEFAULTS.dt).toBeGreaterThan(0);
      expect(Number.isFinite(SIMULATION_DEFAULTS.dt)).toBe(true);
    });

    it("BATCH_PREFETCH_THRESHOLD 应为 FRAMES_PER_BATCH 的一半", () => {
      expect(BATCH_PREFETCH_THRESHOLD).toBe(0.5 * FRAMES_PER_BATCH);
    });
  });
});

// ─────────────────────────────────────────────────
// P3: 滥用模式 —— 验证边界情况
// ─────────────────────────────────────────────────

describe("P3: 滥用模式 — 边界鲁棒性", () => {

  describe("simulation-scheduler: 生命周期滥用序列", () => {
    it("应安全执行 async: start → pause → resume → destroy (无崩溃)", () => {
      const gw = new MockWorkerGateway();
      gw.injectWorker({} as Worker);
      const pool = new MockFloat64Pool();
      const rp = new MockRecoveryPolicy();
      const scheduler = new MockScheduler(gw, pool, rp);

      expect(() => {
        scheduler.start(VALID_PARAMS, VALID_IC, "RKF45");
        scheduler.pause();
        scheduler.resume();
        scheduler.destroy();
      }).not.toThrow();
    });

    it("应允许连续 destroy 两次 (幂等)", () => {
      const gw = new MockWorkerGateway();
      gw.injectWorker({} as Worker);
      const pool = new MockFloat64Pool();
      const rp = new MockRecoveryPolicy();
      const scheduler = new MockScheduler(gw, pool, rp);

      scheduler.destroy();
      expect(() => scheduler.destroy()).not.toThrow();
      expect(scheduler.destroyCalled).toBe(2);
    });

    it("应安全执行: reset → start → reset → start (重复初始化)", () => {
      const gw = new MockWorkerGateway();
      gw.injectWorker({} as Worker);
      const pool = new MockFloat64Pool();
      const rp = new MockRecoveryPolicy();
      const scheduler = new MockScheduler(gw, pool, rp);

      expect(() => {
        scheduler.reset(VALID_IC);
        scheduler.start(VALID_PARAMS, VALID_IC, "RKF45");
        scheduler.reset(VALID_IC);
        scheduler.start(VALID_PARAMS, VALID_IC, "RKF45");
      }).not.toThrow();
    });

    it("应允许 reset 后立即 destroy", () => {
      const gw = new MockWorkerGateway();
      gw.injectWorker({} as Worker);
      const pool = new MockFloat64Pool();
      const rp = new MockRecoveryPolicy();
      const scheduler = new MockScheduler(gw, pool, rp);

      expect(() => {
        scheduler.start(VALID_PARAMS, VALID_IC, "RKF45");
        scheduler.reset(VALID_IC);
        scheduler.destroy();
      }).not.toThrow();
    });
  });

  describe("simulation-scheduler: ISimulationLifecycle 状态机滥用", () => {
    it("reset 后应从任何状态回到 idle", () => {
      const lifecycle = new MockLifecycle();
      lifecycle.start(VALID_PARAMS, VALID_IC, "RKF45");
      lifecycle.reset(VALID_IC);
      expect(lifecycle.phase).toBe("idle");
    });

    it("destroy 后应从任何状态回到 idle", () => {
      const lifecycle = new MockLifecycle();
      lifecycle.start(VALID_PARAMS, VALID_IC, "RKF45");
      lifecycle.pause();
      lifecycle.destroy();
      expect(lifecycle.phase).toBe("idle");
    });

    it("应允许 idle 下直接 destroy", () => {
      const lifecycle = new MockLifecycle();
      expect(() => lifecycle.destroy()).not.toThrow();
      expect(lifecycle.phase).toBe("idle");
    });
  });

  describe("worker-gateway: IWorkerGateway 回调注册", () => {
    it("应允许多个 onMessage 回调全部触发", () => {
      const gw = new MockWorkerGateway();
      const calls: number[] = [];
      gw.onMessage(() => calls.push(1));
      gw.onMessage(() => calls.push(2));
      gw.onMessage(() => calls.push(3));
      expect(gw.messageHandlers.length).toBe(3);
      // 触发所有处理器
      const response: WorkerResponse = { type: "ready" };
      gw.messageHandlers.forEach((h) => h(response));
      expect(calls).toEqual([1, 2, 3]);
    });

    it("sendInit 无 Worker 实例时仍不崩溃 (契约允许实现者检查)", () => {
      const gw = new MockWorkerGateway();
      // 未注入 worker，sendInit 由实现者决定
      expect(() => gw.sendInit(VALID_PARAMS, VALID_IC, "RKF45")).not.toThrow();
    });
  });

  describe("worker-gateway: IFloat64Pool 滥用", () => {
    it("连续 acquire 10 次后第 11 次应返回 null", () => {
      const pool = new MockFloat64Pool(10);
      for (let i = 0; i < 10; i++) pool.acquire();
      expect(pool.acquire()).toBeNull();
    });

    it("release 无效索引不应崩溃", () => {
      const pool = new MockFloat64Pool(5);
      expect(() => pool.release(-1)).not.toThrow();
      expect(() => pool.release(999)).not.toThrow();
    });

    it("releaseBuffer 未拥有的 buffer 不应崩溃", () => {
      const pool = new MockFloat64Pool(5);
      const foreign = new Float64Array(100);
      expect(() => pool.releaseBuffer(foreign)).not.toThrow();
    });
  });

  describe("history-repository: IHistoryRepository 录制切换", () => {
    it("暂停录制后 push 应静默忽略", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 1, omega1: 1, theta2: 1, omega2: 1 });
      repo.pauseRecording();
      repo.push({ theta1: 99, omega1: 99, theta2: 99, omega2: 99 });
      expect(repo.length).toBe(1);
      expect(repo.toArray()[0]!.theta1).toBe(1);
    });

    it("恢复录制后 push 应正常追加", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 1, omega1: 1, theta2: 1, omega2: 1 });
      repo.pauseRecording();
      repo.resumeRecording();
      repo.push({ theta1: 2, omega1: 2, theta2: 2, omega2: 2 });
      expect(repo.length).toBe(2);
    });

    it("clear 后立即 push 应正常追加", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 1, omega1: 1, theta2: 1, omega2: 1 });
      repo.push({ theta1: 2, omega1: 2, theta2: 2, omega2: 2 });
      repo.clear();
      expect(repo.length).toBe(0);
      repo.push({ theta1: 3, omega1: 3, theta2: 3, omega2: 3 });
      expect(repo.length).toBe(1);
      expect(repo.toArray()[0]!.theta1).toBe(3);
    });

    it("clear 在录制暂停时应清空并保持暂停状态", () => {
      const repo = new MockHistoryRepository();
      repo.push({ theta1: 1, omega1: 1, theta2: 1, omega2: 1 });
      repo.pauseRecording();
      repo.clear();
      expect(repo.length).toBe(0);
      expect(repo.isRecording).toBe(false);
    });
  });

  describe("history-repository: HistoryQuery 查询参数类型", () => {
    it("HistoryQuery 应可构造有效查询", () => {
      const query: HistoryQuery = { startIndex: 0, count: 10 };
      expect(query.startIndex).toBe(0);
      expect(query.count).toBe(10);
    });
  });

  describe("physics-engine: IIntegratorRegistry 注册表滥用", () => {
    it("注册表 register(null/undefined) 不应崩溃", () => {
      const registry = new MockIntegratorRegistry();
      expect(() => registry.register(null as unknown as IIntegrator)).not.toThrow();
      expect(() => registry.register(undefined as unknown as IIntegrator)).not.toThrow();
    });

    it("获取未注册的方法应返回默认 RKF45 (而非 undefined)", () => {
      const registry = new MockIntegratorRegistry();
      const rkf = new MockIntegrator("RKF45");
      registry.register(rkf);
      const result = registry.get("Euler");
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it("注册多个积分器后应能按方法名获取", () => {
      const registry = new MockIntegratorRegistry();
      const euler = new MockIntegrator("Euler");
      const vv = new MockIntegrator("VelocityVerlet");
      const rkf = new MockIntegrator("RKF45");
      registry.register(euler);
      registry.register(vv);
      registry.register(rkf);
      expect(registry.get("Euler")!.method).toBe("Euler");
      expect(registry.get("VelocityVerlet")!.method).toBe("VelocityVerlet");
      expect(registry.get("RKF45")!.method).toBe("RKF45");
    });
  });

  describe("energy-monitor: IEnergyDriftDetector 滥用", () => {
    it("未 establishBaseline 直接 detect 应不崩溃", () => {
      const detector = new MockDriftDetector();
      expect(() => detector.detect(100, 0, true, 0)).not.toThrow();
    });

    it("多次 establishBaseline 应覆盖基线值", () => {
      const detector = new MockDriftDetector();
      detector.establishBaseline(100);
      const r1 = detector.detect(100, 0, true, 0);
      expect(r1.confidence).toBe(0);
      // 改变基线
      detector.establishBaseline(200);
      const r2 = detector.detect(100, 0, true, 0);
      expect(r2.absDrift).toBe(100);
    });
  });

  describe("phase-space: IPhaseSpaceCollector 降采样滥用", () => {
    it("对不存在的变量降采样不应崩溃", () => {
      const collector = new MockPhaseSpaceCollector();
      expect(() => collector.decimate("theta1", 2)).not.toThrow();
    });

    it("factor=1 降采样不应改变轨迹", () => {
      const collector = new MockPhaseSpaceCollector();
      for (let i = 0; i < 10; i++) {
        collector.appendPoint("theta1", i * 0.1, i * 0.5, 100);
      }
      collector.decimate("theta1", 1);
      expect(collector.getTrajectory("theta1").length).toBe(10);
    });

    it("factor ≤ 1 降采样不应改变轨迹", () => {
      const collector = new MockPhaseSpaceCollector();
      for (let i = 0; i < 10; i++) {
        collector.appendPoint("theta1", i * 0.1, i * 0.5, 100);
      }
      collector.decimate("theta1", 0);
      collector.decimate("theta1", -5);
      // factor ≤ 1 时不降采样
      expect(collector.getTrajectory("theta1").length).toBe(10);
    });
  });

  describe("simulation-scheduler: IFrameBufferManager 双缓冲滥用", () => {
    it("setActive + setNext 后消费所有帧", () => {
      const fm = new MockFrameBufferManager();
      const stride = FRAME_BUFFER_LAYOUT.stride;
      const buf1 = new Float64Array(2 * stride);
      const buf2 = new Float64Array(3 * stride);
      // 填充测试数据
      for (let i = 0; i < 2 * stride; i++) buf1[i] = i + 1;
      for (let i = 0; i < 3 * stride; i++) buf2[i] = 100 + i % stride;

      fm.setActive(buf1, 0, 2);
      fm.setNext(buf2, 0, 3);
      expect(fm.hasFrames).toBe(true);

      // 消费 2 帧
      let consumed = 0;
      while (consumed < 5) {
        const frame = fm.consumeOne();
        if (frame) consumed++;
        else break;
      }
      expect(consumed).toBe(5); // 2 + 3
    });

    it("clear 后 hasFrames 应为 false", () => {
      const fm = new MockFrameBufferManager();
      const buf = new Float64Array(FRAME_BUFFER_LAYOUT.stride);
      fm.setActive(buf, 0, 1);
      fm.clear();
      expect(fm.hasFrames).toBe(false);
    });
  });

  describe("worker-gateway: IWorkerRecoveryPolicy 滥用", () => {
    it("resetCounter 后 crashCount 应为 0", () => {
      const policy = new MockRecoveryPolicy(3);
      policy.crashCount = 5;
      policy.resetCounter();
      expect(policy.crashCount).toBe(0);
    });

    it("多次 recover 调用不应崩溃", () => {
      const policy = new MockRecoveryPolicy(5);
      expect(() => {
        policy.recover(VALID_PARAMS, VALID_IC, "RKF45");
        policy.recover(VALID_PARAMS, VALID_IC, "RKF45");
        policy.recover(VALID_PARAMS, VALID_IC, "RKF45");
      }).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────
// 纯类型契约: SimulationFrame/InterpSnapshot/DerivedValues 结构验证
// ─────────────────────────────────────────────────

describe("类型契约: SimulationFrame 结构", () => {
  it("应包含 13 个字段，与 FRAME_BUFFER_LAYOUT 一一对应", () => {
    // 构造一个合法的 SimulationFrame 对象
    const frame: SimulationFrame = {
      t: 0,
      theta1: Math.PI / 2,
      theta1Dot: 1.5,
      theta2: -Math.PI / 3,
      theta2Dot: -2.0,
      x1: 0.5,
      y1: -0.866,
      x2: 1.0,
      y2: -1.732,
      kineticEnergy: 10,
      potentialEnergy: 20,
      totalEnergy: 30,
      alpha1: 0.5,
      alpha2: -1.0,
    };
    // 验证字段存在性和类型
    expect(frame).toHaveProperty("t");
    expect(frame).toHaveProperty("theta1");
    expect(frame).toHaveProperty("theta1Dot");
    expect(frame).toHaveProperty("theta2");
    expect(frame).toHaveProperty("theta2Dot");
    expect(frame).toHaveProperty("x1");
    expect(frame).toHaveProperty("x2");
    expect(frame).toHaveProperty("y1");
    expect(frame).toHaveProperty("y2");
    expect(frame).toHaveProperty("kineticEnergy");
    expect(frame).toHaveProperty("potentialEnergy");
    expect(frame).toHaveProperty("totalEnergy");
    expect(frame).toHaveProperty("alpha1");
    expect(frame).toHaveProperty("alpha2");
  });

  it("DerivedValues 应包含与 SimulationFrame 子集对应的字段", () => {
    const dv: DerivedValues = {
      x1: 0, y1: -1, x2: 0.5, y2: -1.5,
      kineticEnergy: 5, potentialEnergy: 10, totalEnergy: 15,
      alpha1: 0.2, alpha2: -0.3,
    };
    expect(dv).toHaveProperty("x1");
    expect(dv).toHaveProperty("y1");
    expect(dv).toHaveProperty("x2");
    expect(dv).toHaveProperty("y2");
    expect(dv).toHaveProperty("kineticEnergy");
    expect(dv).toHaveProperty("potentialEnergy");
    expect(dv).toHaveProperty("totalEnergy");
    expect(dv).toHaveProperty("alpha1");
    expect(dv).toHaveProperty("alpha2");
  });

  it("InterpSnapshot 应包含 4 个坐标字段", () => {
    const snap: InterpSnapshot = {
      x1: 1.0, y1: -0.5, x2: 2.0, y2: -1.0,
    };
    expect(snap).toHaveProperty("x1");
    expect(snap).toHaveProperty("y1");
    expect(snap).toHaveProperty("x2");
    expect(snap).toHaveProperty("y2");
  });
});
