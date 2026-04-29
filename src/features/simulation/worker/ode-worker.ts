import type {
  WorkerCommand,
  WorkerResponse,
  PendulumParams,
  IntegratorMethod,
  PoincarePoint,
  PoincareSectionCondition,
  ForceExtrema,
} from "@/shared/types";
import { FRAME_STRIDE, FRAMES_PER_BATCH, FORCE_STRIDE, FORCE_BUFFER_LENGTH } from "@/shared/types";
import { integratorStep } from "../engine/integrators";
import { computeDerived, normalizeAngle, hasInvalidValue, projectEnergy } from "../engine/state-vector";

// ─── Worker 内部状态 ──────────────────────────────

type WorkerPhase = "uninit" | "idle" | "computing" | "error";

let _phase: WorkerPhase = "uninit";
let _state: Float64Array | null = null; // [θ₁, ω₁, θ₂, ω₂]
let _params: PendulumParams | null = null;
let _method: IntegratorMethod = "RK4";
let _direction: 1 | -1 = 1;
let _simTime = 0;
let _batchIndex = 0;
let _computeForces = false;
let _forceExtrema: ForceExtrema | null = null;
/** 仿真启动时的初始总能量（J），供保守系统能量投影使用。 */
let _initialEnergy = 0;
/** 能量投影是否启用（仅 damping=0 时启用，与初始能量是否为 0 解耦） */
let _projectionEnabled = false;
/** 本批次累积的能量投影校正量 (J) */
let _batchEnergyCorrection = 0;

// ─── 消息循环入口 ────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data;
  if (!cmd || typeof cmd.type !== "string") return;

  switch (cmd.type) {
    case "init":
      handleInit(cmd);
      break;
    case "step":
      handleStep(cmd);
      break;
    case "updateParams":
      handleUpdateParams(cmd);
      break;
    case "reset":
      handleReset(cmd);
      break;
    case "setDirection":
      handleSetDirection(cmd);
      break;
    case "setMethod":
      handleSetMethod(cmd);
      break;
    case "config":
      handleConfig(cmd);
      break;
    default:
      console.warn(`[ode-worker] 未识别的消息类型: ${(cmd as { type: string }).type}`);
  }
};

// ─── 步骤 2：初始化 ─────────────────────────────

function handleInit(cmd: { params: PendulumParams; initialConditions: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number }; method: IntegratorMethod }): void {
  const { params, initialConditions: ic, method } = cmd;

  const err = validateParams(params);
  if (err) {
    postResponse({ type: "error", code: "INVALID_STATE", message: err, simTime: -1 });
    return;
  }

  _state = new Float64Array([ic.theta1, ic.theta1Dot, ic.theta2, ic.theta2Dot]);
  _state[0] = normalizeAngle(_state[0]!);
  _state[2] = normalizeAngle(_state[2]!);
  _params = { ...params };
  _method = method;
  _direction = 1;
  _simTime = 0;
  _batchIndex = 0;
  _computeForces = false;
  _forceExtrema = null;
  _projectionEnabled = params.damping === 0;
  _initialEnergy = _projectionEnabled ? computeDerived(_state, params).totalEnergy : 0;
  _batchEnergyCorrection = 0;
  _phase = "idle";

  postResponse({ type: "ready" });
}

// ─── 步骤 3：批量积分 ───────────────────────────

function handleStep(cmd: { buffer: Float64Array; poincare?: PoincareSectionCondition | null }): void {
  if (_phase === "uninit" || !_state || !_params) {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 未初始化", simTime: -1 });
    return;
  }

  if (_phase === "error") {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 处于 error 状态，请先 reset", simTime: _simTime });
    return;
  }

  if (hasInvalidValue(_state)) {
    _phase = "error";
    postResponse({ type: "error", code: "DIVERGED", message: `数值发散于 t=${_simTime}`, simTime: _simTime });
    return;
  }

  const buffer = cmd.buffer;
  const poincareConfig = cmd.poincare;
  const poincarePoints: PoincarePoint[] = [];
  const currentBatchIndex = _batchIndex++;

  // 力数据缓冲区（仅在 computeForces 激活时分配）
  const forceBuffer = _computeForces ? new Float64Array(FORCE_BUFFER_LENGTH) : null;

  _phase = "computing";

  const dt = 1 / 60;
  const startTime = performance.now();
  let frame = 0;
  _batchEnergyCorrection = 0;

  // 保存积分前状态，用于穿越检测插值
  const stateBefore = new Float64Array(_state);

  for (; frame < FRAMES_PER_BATCH; frame++) {
    // ── 穿越检测：记录积分前变量值 ──
    const varPrev = poincareConfig ? extractVariable(_state, poincareConfig.variable) : null;

    // 单步积分
    integratorStep(_state, _params, dt * _direction, _method);

    // NaN 检查
    if (hasInvalidValue(_state)) {
      _phase = "error";
      transferBuffer(buffer, frame, _simTime, poincarePoints, forceBuffer);
      postResponse({
        type: "error",
        code: "DIVERGED",
        message: `数值发散于 t≈${_simTime.toFixed(2)}, 方法=${_method}`,
        simTime: _simTime,
      });
      return;
    }

    _simTime += dt * _direction;

    // 能量投影：保守系统 (damping=0) 每帧校正能量回初始值
    if (_projectionEnabled) {
      _batchEnergyCorrection += projectEnergy(_state, _params, _initialEnergy);
    }

    // ── 穿越检测 ──
    if (poincareConfig && varPrev !== null) {
      const varCurr = extractVariable(_state, poincareConfig.variable);
      const signPrev = Math.sign(varPrev - poincareConfig.targetValue);
      const signCurr = Math.sign(varCurr - poincareConfig.targetValue);

      if (signPrev !== 0 && signCurr !== 0 && signPrev !== signCurr) {
        const directionMatch =
          poincareConfig.direction === "both" ||
          (poincareConfig.direction === "positive" && signCurr > 0) ||
          (poincareConfig.direction === "negative" && signCurr < 0);

        if (directionMatch) {
          // 线性插值估计穿越比例
          const ratio = (poincareConfig.targetValue - varPrev) / (varCurr - varPrev);
          const tCross = _simTime - dt * _direction + ratio * dt * _direction;

          // 线性插值估计穿越状态
          const theta2 = normalizeAngle(stateBefore[2]! + ratio * (_state[2]! - stateBefore[2]!));
          const omega2 = stateBefore[3]! + ratio * (_state[3]! - stateBefore[3]!);

          poincarePoints.push({
            theta2,
            omega2,
            time: tCross,
            batchIndex: currentBatchIndex,
          });
        }
      }
    }

    // 更新 stateBefore 为当前状态（供下一帧穿越检测使用）
    stateBefore.set(_state);

    // 反向积分回到 t=0 边界：clamp 到 0，只填充 simTime > 0 的帧
    if (_direction === -1 && _simTime <= 0) {
      _simTime = 0;
      const derived = computeDerived(_state, _params);
      writeFrame(buffer, frame, _simTime, _state, derived);
      if (forceBuffer) {
        const forces = computeForceFrame(_state, derived, _params);
        writeForceFrame(forceBuffer, frame, forces);
        updateForceExtrema(forces, _simTime);
      }
      frame++;
      break;
    }

    // 计算派生量并写入 buffer
    const derived = computeDerived(_state, _params);
    writeFrame(buffer, frame, _simTime, _state, derived);

    // 力计算
    if (forceBuffer) {
      const forces = computeForceFrame(_state, derived, _params);
      writeForceFrame(forceBuffer, frame, forces);
      updateForceExtrema(forces, _simTime);
    }

    // 角度归一化
    _state[0] = normalizeAngle(_state[0]!);
    _state[2] = normalizeAngle(_state[2]!);
  }

  const elapsed = performance.now() - startTime;
  if (elapsed > 50) {
    console.warn(`[ode-worker] handleStep 耗时 ${elapsed.toFixed(1)}ms，接近帧预算`);
  }

  _phase = "idle";
  transferBuffer(buffer, frame, _simTime, poincarePoints, forceBuffer);
}

// ─── 步骤 7：参数热更新 ─────────────────────────

function handleUpdateParams(cmd: { params: Partial<PendulumParams> }): void {
  if (!_params) {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 未初始化", simTime: -1 });
    return;
  }

  const merged = { ..._params, ...cmd.params };
  const err = validateParams(merged);
  if (err) {
    postResponse({ type: "error", code: "INVALID_STATE", message: err, simTime: _simTime });
    return;
  }

  _params = merged;
  // 阻尼状态变化 → 重算能量投影基线
  _projectionEnabled = _params.damping === 0;
  if (_projectionEnabled && _state) {
    _initialEnergy = computeDerived(_state, _params).totalEnergy;
  } else {
    _initialEnergy = 0;
  }
}

// ─── 步骤 8：方向切换 ───────────────────────────

function handleSetDirection(cmd: { direction: 1 | -1 }): void {
  if (cmd.direction === 1 || cmd.direction === -1) {
    _direction = cmd.direction;
  }
}

// ─── 积分方法切换 ───────────────────────────────

function handleSetMethod(cmd: { method: IntegratorMethod }): void {
  if (cmd.method === "RK4" || cmd.method === "VelocityVerlet" || cmd.method === "Euler") {
    _method = cmd.method;
  }
}

// ─── 配置（力计算开关等） ──────────────────────

function handleConfig(cmd: { computeForces?: boolean }): void {
  if (typeof cmd.computeForces === "boolean") {
    _computeForces = cmd.computeForces;
    if (!_computeForces) {
      _forceExtrema = null;
    }
  }
}

// ─── 重置 ─────────────────────────────────────

function handleReset(cmd: { initialConditions: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number } }): void {
  const ic = cmd.initialConditions;
  _state = new Float64Array([ic.theta1, ic.theta1Dot, ic.theta2, ic.theta2Dot]);
  _state[0] = normalizeAngle(_state[0]!);
  _state[2] = normalizeAngle(_state[2]!);
  _simTime = 0;
  _direction = 1;
  _batchIndex = 0;
  _forceExtrema = null;
  _projectionEnabled = _params!.damping === 0;
  _initialEnergy = _projectionEnabled ? computeDerived(_state, _params!).totalEnergy : 0;
  _batchEnergyCorrection = 0;
  _phase = "idle";
  postResponse({ type: "ready" });
}

// ─── 辅助函数 ──────────────────────────────────

function validateParams(p: PendulumParams): string | null {
  if (p.m1 <= 0 || !isFinite(p.m1)) return `参数 m1 非法: ${p.m1}`;
  if (p.m2 <= 0 || !isFinite(p.m2)) return `参数 m2 非法: ${p.m2}`;
  if (p.L1 <= 0 || !isFinite(p.L1)) return `参数 L1 非法: ${p.L1}`;
  if (p.L2 <= 0 || !isFinite(p.L2)) return `参数 L2 非法: ${p.L2}`;
  if (p.g < 0 || !isFinite(p.g)) return `参数 g 非法: ${p.g}`;
  if (p.damping < 0 || !isFinite(p.damping)) return `参数 damping 非法: ${p.damping}`;
  return null;
}

function extractVariable(state: Float64Array, variable: string): number {
  switch (variable) {
    case "theta1": return state[0]!;
    case "omega1": return state[1]!;
    case "theta2": return state[2]!;
    case "omega2": return state[3]!;
    default: return NaN;
  }
}

function writeFrame(
  buffer: Float64Array,
  frame: number,
  t: number,
  state: Float64Array,
  d: ReturnType<typeof computeDerived>,
): void {
  const off = frame * FRAME_STRIDE;
  buffer[off + 0] = t;
  buffer[off + 1] = state[0]!;
  buffer[off + 2] = state[1]!;
  buffer[off + 3] = state[2]!;
  buffer[off + 4] = state[3]!;
  buffer[off + 5] = d.x1;
  buffer[off + 6] = d.y1;
  buffer[off + 7] = d.x2;
  buffer[off + 8] = d.y2;
  buffer[off + 9] = d.kineticEnergy;
  buffer[off + 10] = d.potentialEnergy;
  buffer[off + 11] = d.totalEnergy;
  buffer[off + 12] = d.alpha1;
  buffer[off + 13] = d.alpha2;
}

// ─── 力计算 ──────────────────────────────────

interface ForceFrame {
  Fg1_mag: number; Fg1_angle: number;
  T1_mag: number;   T1_angle: number;
  Fi1_t_mag: number; Fi1_t_angle: number;
  Fi1_n_mag: number; Fi1_n_angle: number;
  Fg2_mag: number; Fg2_angle: number;
  T2_mag: number;   T2_angle: number;
  Fi2_t_mag: number; Fi2_t_angle: number;
  Fi2_n_mag: number; Fi2_n_angle: number;
}

function computeForceFrame(
  state: Float64Array,
  derived: ReturnType<typeof computeDerived>,
  p: PendulumParams,
): ForceFrame {
  const theta1 = state[0]!, omega1 = state[1]!;
  const theta2 = state[2]!, omega2 = state[3]!;
  const alpha1 = derived.alpha1, alpha2 = derived.alpha2;
  const { m1, m2, L1, L2, g } = p;

  // 杆 2 张力
  const dTheta = theta1 - theta2;
  const T2 = m2 * L2 * omega2 * omega2
           + m2 * g * Math.cos(theta2)
           + m2 * L1 * (alpha1 * Math.cos(dTheta) + omega1 * omega1 * Math.sin(dTheta));

  // 杆 1 张力
  const T1 = m1 * L1 * omega1 * omega1
           + (m1 + m2) * g * Math.cos(theta1)
           + m2 * L2 * (alpha2 * Math.cos(dTheta) - omega2 * omega2 * Math.sin(dTheta))
           + T2 * Math.cos(dTheta);

  // 重力
  const Fg1 = m1 * g;
  const Fg2 = m2 * g;

  // 惯性力
  const Fi1_t = m1 * L1 * Math.abs(alpha1);
  const Fi1_n = m1 * L1 * omega1 * omega1;
  const Fi2_t = m2 * L2 * Math.abs(alpha2);
  const Fi2_n = m2 * L2 * omega2 * omega2;

  return {
    Fg1_mag: Fg1, Fg1_angle: -Math.PI / 2,
    T1_mag: T1,   T1_angle: theta1 + Math.PI,
    Fi1_t_mag: Fi1_t, Fi1_t_angle: theta1 + Math.sign(alpha1) * Math.PI / 2,
    Fi1_n_mag: Fi1_n, Fi1_n_angle: theta1 + Math.PI,
    Fg2_mag: Fg2, Fg2_angle: -Math.PI / 2,
    T2_mag: T2,   T2_angle: theta2 + Math.PI,
    Fi2_t_mag: Fi2_t, Fi2_t_angle: theta2 + Math.sign(alpha2) * Math.PI / 2,
    Fi2_n_mag: Fi2_n, Fi2_n_angle: theta2 + Math.PI,
  };
}

function writeForceFrame(buf: Float64Array, frame: number, f: ForceFrame): void {
  const off = frame * FORCE_STRIDE;
  buf[off + 0]  = f.Fg1_mag;
  buf[off + 1]  = f.Fg1_angle;
  buf[off + 2]  = f.T1_mag;
  buf[off + 3]  = f.T1_angle;
  buf[off + 4]  = f.Fi1_t_mag;
  buf[off + 5]  = f.Fi1_t_angle;
  buf[off + 6]  = f.Fi1_n_mag;
  buf[off + 7]  = f.Fi1_n_angle;
  buf[off + 8]  = f.Fg2_mag;
  buf[off + 9]  = f.Fg2_angle;
  buf[off + 10] = f.T2_mag;
  buf[off + 11] = f.T2_angle;
  buf[off + 12] = f.Fi2_t_mag;
  buf[off + 13] = f.Fi2_t_angle;
  buf[off + 14] = f.Fi2_n_mag;
  buf[off + 15] = f.Fi2_n_angle;
}

function updateForceExtrema(f: ForceFrame, simTime: number): void {
  if (!_forceExtrema) {
    _forceExtrema = {
      T1_max: { value: f.T1_mag, time: simTime },
      T1_min: { value: f.T1_mag, time: simTime },
      T2_max: { value: f.T2_mag, time: simTime },
      T2_min: { value: f.T2_mag, time: simTime },
    };
    return;
  }
  if (f.T1_mag > _forceExtrema.T1_max.value) {
    _forceExtrema.T1_max = { value: f.T1_mag, time: simTime };
  }
  if (f.T1_mag < _forceExtrema.T1_min.value) {
    _forceExtrema.T1_min = { value: f.T1_mag, time: simTime };
  }
  if (f.T2_mag > _forceExtrema.T2_max.value) {
    _forceExtrema.T2_max = { value: f.T2_mag, time: simTime };
  }
  if (f.T2_mag < _forceExtrema.T2_min.value) {
    _forceExtrema.T2_min = { value: f.T2_mag, time: simTime };
  }
}

function transferBuffer(
  buffer: Float64Array,
  frameCount: number,
  simTime: number,
  poincarePoints?: PoincarePoint[],
  forceBuffer?: Float64Array | null,
): void {
  const resp: WorkerResponse = {
    type: "batchReady",
    buffer,
    frameCount,
    simTime,
    poincarePoints,
    forceData: forceBuffer ?? undefined,
    forceExtrema: _computeForces ? (_forceExtrema ?? undefined) : undefined,
    energyCorrection: _batchEnergyCorrection,
  };
  const transfers: Transferable[] = [buffer.buffer as ArrayBuffer];
  if (forceBuffer) {
    transfers.push(forceBuffer.buffer as ArrayBuffer);
  }
  (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
    resp,
    transfers,
  );
}

function postResponse(resp: WorkerResponse): void {
  self.postMessage(resp);
}
