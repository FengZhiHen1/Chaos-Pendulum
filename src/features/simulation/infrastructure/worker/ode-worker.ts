import type {
  WorkerCommand,
  WorkerResponse,
  PendulumParams,
  IntegratorMethod,
  PoincarePoint,
  PoincareSectionCondition,
  ForceExtrema,
} from "@/shared/domain/valueObjects";
import { FRAME_STRIDE, FRAMES_PER_BATCH, FORCE_STRIDE, FORCE_BUFFER_LENGTH } from "@/shared/domain/valueObjects";
import { integratorStep, getIntegrator } from "@/features/simulation/domain/services/integrators";
import { computeDerived, normalizeAngle, hasInvalidValue, projectEnergy } from "@/features/simulation/domain/services/stateVector";

// ─── Worker 上下文 ──────────────────────────────

type WorkerPhase = "uninit" | "idle" | "computing" | "error";

interface WorkerContext {
  phase: WorkerPhase;
  state: Float64Array | null;
  params: PendulumParams | null;
  method: IntegratorMethod;
  direction: 1 | -1;
  simTime: number;
  batchIndex: number;
  computeForces: boolean;
  forceExtrema: ForceExtrema | null;
  initialEnergy: number;
  projectionEnabled: boolean;
  batchEnergyCorrection: number;
  // Lyapunov 影子轨迹
  shadowState: Float64Array | null;
  lyapAccum: number;   // Σ ln(d/d₀)
  lyapTime: number;    // 累计重标定时间
  lyapFrameCount: number;
  lyapExponent: number;
}

const ctx: WorkerContext = {
  phase: "uninit",
  state: null,
  params: null,
  method: "RKF45",
  direction: 1,
  simTime: 0,
  batchIndex: 0,
  computeForces: false,
  forceExtrema: null,
  initialEnergy: 0,
  projectionEnabled: false,
  batchEnergyCorrection: 0,
  shadowState: null,
  lyapAccum: 0,
  lyapTime: 0,
  lyapFrameCount: 0,
  lyapExponent: 0,
};

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

// ─── 状态重置（init / reset 共享）─────────────────

function resetWorkerState(
  ic: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number },
  params: PendulumParams,
  method: IntegratorMethod,
  simTime = 0,
): void {
  ctx.state = new Float64Array([ic.theta1, ic.theta1Dot, ic.theta2, ic.theta2Dot]);
  ctx.state[0] = normalizeAngle(ctx.state[0]!);
  ctx.state[2] = normalizeAngle(ctx.state[2]!);
  ctx.params = { ...params };
  ctx.method = method;
  ctx.direction = 1;
  ctx.simTime = simTime;
  ctx.batchIndex = 0;
  ctx.computeForces = false;
  ctx.forceExtrema = null;
  ctx.projectionEnabled = params.damping === 0;
  ctx.initialEnergy = ctx.projectionEnabled ? computeDerived(ctx.state, params).totalEnergy : 0;
  ctx.batchEnergyCorrection = 0;
  ctx.shadowState = null;
  ctx.lyapAccum = 0;
  ctx.lyapTime = 0;
  ctx.lyapFrameCount = 0;
  ctx.lyapExponent = 0;
  ctx.phase = "idle";
}

// ─── 初始化 ─────────────────────────────────────

function handleInit(cmd: { params: PendulumParams; initialConditions: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number }; method: IntegratorMethod }): void {
  const err = validateParams(cmd.params);
  if (err) {
    postResponse({ type: "error", code: "INVALID_STATE", message: err, simTime: -1 });
    return;
  }
  resetWorkerState(cmd.initialConditions, cmd.params, cmd.method);
  postResponse({ type: "ready" });
}

// ─── 批量积分 ───────────────────────────────────

function handleStep(cmd: { buffer: Float64Array; poincare?: PoincareSectionCondition | null }): void {
  if (ctx.phase === "uninit" || !ctx.state || !ctx.params) {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 未初始化", simTime: -1 });
    return;
  }

  if (ctx.phase === "error") {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 处于 error 状态，请先 reset", simTime: ctx.simTime });
    return;
  }

  if (hasInvalidValue(ctx.state)) {
    ctx.phase = "error";
    postResponse({ type: "error", code: "DIVERGED", message: `数值发散于 t=${ctx.simTime}`, simTime: ctx.simTime });
    return;
  }

  const buffer = cmd.buffer;
  const poincareConfig = cmd.poincare;
  const poincarePoints: PoincarePoint[] = [];
  const currentBatchIndex = ctx.batchIndex++;
  const forceBuffer = ctx.computeForces ? new Float64Array(FORCE_BUFFER_LENGTH) : null;

  ctx.phase = "computing";

  const dt = 1 / 60;
  const startTime = performance.now();
  let frame = 0;
  ctx.batchEnergyCorrection = 0;

  // 保存初始状态用于影子轨迹回放
  const mainInitialState = new Float64Array(ctx.state);
  const mainInitialTime = ctx.simTime;

  const stateBefore = new Float64Array(ctx.state);

  // ═══ Phase 1: 主轨迹积分（无影子轨迹，快速回传） ═══
  for (; frame < FRAMES_PER_BATCH; frame++) {
    const varPrev = poincareConfig ? extractVariable(ctx.state, poincareConfig.variable) : null;

    integratorStep(ctx.state, ctx.params, dt * ctx.direction, ctx.method);
    ctx.simTime += dt * ctx.direction;

    if (ctx.projectionEnabled) {
      ctx.batchEnergyCorrection += projectEnergy(ctx.state, ctx.params, ctx.initialEnergy);
    }

    if (hasInvalidValue(ctx.state)) {
      ctx.phase = "error";
      transferBuffer(buffer, frame, ctx.simTime, poincarePoints, forceBuffer);
      postResponse({
        type: "error",
        code: "DIVERGED",
        message: `数值发散于 t≈${ctx.simTime.toFixed(2)}, 方法=${ctx.method}`,
        simTime: ctx.simTime,
      });
      return;
    }

    if (poincareConfig && varPrev !== null) {
      detectPoincareCrossing(
        stateBefore, ctx.state,
        ctx.simTime, dt, ctx.direction,
        poincareConfig, currentBatchIndex, poincarePoints,
      );
    }

    stateBefore.set(ctx.state);

    if (ctx.direction === -1 && ctx.simTime <= 0) {
      ctx.simTime = 0;
      const derived = computeDerived(ctx.state, ctx.params);
      writeFrame(buffer, frame, ctx.simTime, ctx.state, derived);
      if (forceBuffer) {
        const forces = computeForceFrame(ctx.state, derived, ctx.params);
        writeForceFrame(forceBuffer, frame, forces);
        updateForceExtrema(forces, ctx.simTime);
      }
      frame++;
      break;
    }

    const derived = computeDerived(ctx.state, ctx.params);
    writeFrame(buffer, frame, ctx.simTime, ctx.state, derived);

    if (forceBuffer) {
      const forces = computeForceFrame(ctx.state, derived, ctx.params);
      writeForceFrame(forceBuffer, frame, forces);
      updateForceExtrema(forces, ctx.simTime);
    }

    ctx.state[0] = normalizeAngle(ctx.state[0]!);
    ctx.state[2] = normalizeAngle(ctx.state[2]!);
  }

  const mainEndState = new Float64Array(ctx.state);
  const mainEndTime = ctx.simTime;
  const mainFrameCount = frame;

  const mainElapsed = performance.now() - startTime;
  if (mainElapsed > 50) {
    console.warn(`[ode-worker] 主轨迹耗时 ${mainElapsed.toFixed(1)}ms`);
  }

  ctx.phase = "idle";

  // ═══ 回传 Phase 1 结果（主线程立即消费） ═══
  transferBuffer(buffer, mainFrameCount, ctx.simTime, poincarePoints, forceBuffer);

  // ═══ Phase 2: 影子轨迹回放（Lyapunov 指数，后台计算） ═══
  if (ctx.projectionEnabled) {
    const D0 = 1e-8;
    const RENORM_INTERVAL = 60;

    // 恢复主轨迹初始状态用于确定性回放
    ctx.state = new Float64Array(mainInitialState);
    ctx.simTime = mainInitialTime;

    if (!ctx.shadowState) {
      ctx.shadowState = new Float64Array(ctx.state);
      ctx.shadowState[0] = ctx.shadowState[0]! + D0;
      ctx.lyapFrameCount = 0;
      ctx.lyapAccum = 0;
      ctx.lyapTime = 0;
    }

    for (let f = 0; f < mainFrameCount; f++) {
      // 回放主轨迹
      integratorStep(ctx.state, ctx.params, dt * ctx.direction, ctx.method);
      ctx.simTime += dt * ctx.direction;
      projectEnergy(ctx.state, ctx.params, ctx.initialEnergy);

      // 积分影子轨迹
      integratorStep(ctx.shadowState, ctx.params, dt * ctx.direction, ctx.method);
      projectEnergy(ctx.shadowState, ctx.params, ctx.initialEnergy);
      ctx.shadowState[0] = normalizeAngle(ctx.shadowState[0]!);
      ctx.shadowState[2] = normalizeAngle(ctx.shadowState[2]!);
      ctx.lyapFrameCount++;

      ctx.state[0] = normalizeAngle(ctx.state[0]!);
      ctx.state[2] = normalizeAngle(ctx.state[2]!);

      if (ctx.lyapFrameCount >= RENORM_INTERVAL) {
        ctx.lyapFrameCount = 0;
        const s = ctx.state;
        const sh = ctx.shadowState;
        const d0 = s[0]! - sh[0]!;
        const d1 = s[1]! - sh[1]!;
        const d2 = s[2]! - sh[2]!;
        const d3 = s[3]! - sh[3]!;
        const dist = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3);

        if (dist > 0 && dist < 1e6) {
          ctx.lyapAccum += Math.log(dist / D0);
          ctx.lyapTime += RENORM_INTERVAL * Math.abs(dt);
          ctx.lyapExponent = ctx.lyapAccum / Math.max(ctx.lyapTime, 1e-6);
        }

        const scale = D0 / Math.max(dist, 1e-15);
        sh[0] = s[0]! + scale * (sh[0]! - s[0]!);
        sh[1] = s[1]! + scale * (sh[1]! - s[1]!);
        sh[2] = s[2]! + scale * (sh[2]! - s[2]!);
        sh[3] = s[3]! + scale * (sh[3]! - s[3]!);
      }
    }

    // 恢复主轨迹终态
    ctx.state = mainEndState;
    ctx.simTime = mainEndTime;

    postLyapunovUpdate();
  }
}

// ─── 庞加莱截面穿越检测 ──────────────────────────

function detectPoincareCrossing(
  stateBefore: Float64Array,
  stateCurrent: Float64Array,
  simTime: number,
  dt: number,
  direction: 1 | -1,
  config: PoincareSectionCondition,
  batchIndex: number,
  results: PoincarePoint[],
): void {
  const varPrev = extractVariable(stateBefore, config.variable);
  const varCurr = extractVariable(stateCurrent, config.variable);
  const signPrev = Math.sign(varPrev - config.targetValue);
  const signCurr = Math.sign(varCurr - config.targetValue);

  if (signPrev === 0 || signCurr === 0 || signPrev === signCurr) return;

  const directionMatch =
    config.direction === "both" ||
    (config.direction === "positive" && signCurr > 0) ||
    (config.direction === "negative" && signCurr < 0);

  if (!directionMatch) return;

  const ratio = (config.targetValue - varPrev) / (varCurr - varPrev);
  const tCross = simTime - dt * direction + ratio * dt * direction;
  const theta2 = normalizeAngle(stateBefore[2]! + ratio * (stateCurrent[2]! - stateBefore[2]!));
  const omega2 = stateBefore[3]! + ratio * (stateCurrent[3]! - stateBefore[3]!);

  results.push({ theta2, omega2, time: tCross, batchIndex });
}

// ─── 参数热更新 ─────────────────────────────────

function handleUpdateParams(cmd: { params: Partial<PendulumParams> }): void {
  if (!ctx.params) {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 未初始化", simTime: -1 });
    return;
  }

  const merged = { ...ctx.params, ...cmd.params };
  const err = validateParams(merged);
  if (err) {
    postResponse({ type: "error", code: "INVALID_STATE", message: err, simTime: ctx.simTime });
    return;
  }

  ctx.params = merged;
  ctx.projectionEnabled = ctx.params.damping === 0;
  if (ctx.projectionEnabled && ctx.state) {
    ctx.initialEnergy = computeDerived(ctx.state, ctx.params).totalEnergy;
  } else {
    ctx.initialEnergy = 0;
  }
}

// ─── 方向切换 ───────────────────────────────────

function handleSetDirection(cmd: { direction: 1 | -1 }): void {
  if (cmd.direction === 1 || cmd.direction === -1) {
    ctx.direction = cmd.direction;
  }
}

// ─── 积分方法切换 ───────────────────────────────

function handleSetMethod(cmd: { method: IntegratorMethod }): void {
  if (getIntegrator(cmd.method)) {
    ctx.method = cmd.method;
  }
}

// ─── 配置 ──────────────────────────────────────

function handleConfig(cmd: { computeForces?: boolean }): void {
  if (typeof cmd.computeForces === "boolean") {
    ctx.computeForces = cmd.computeForces;
    if (!ctx.computeForces) {
      ctx.forceExtrema = null;
    }
  }
}

// ─── 重置 ──────────────────────────────────────

function handleReset(cmd: { initialConditions: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number }; simTime?: number }): void {
  if (!ctx.params) {
    postResponse({ type: "error", code: "INVALID_STATE", message: "Worker 未初始化", simTime: -1 });
    return;
  }
  resetWorkerState(cmd.initialConditions, ctx.params, ctx.method, cmd.simTime);
  postResponse({ type: "ready" });
}

// ─── 参数校验 ───────────────────────────────────

function validateParams(p: PendulumParams): string | null {
  if (p.m1 < 0 || !isFinite(p.m1)) return `参数 m1 非法: ${p.m1}`;
  if (p.m2 < 0 || !isFinite(p.m2)) return `参数 m2 非法: ${p.m2}`;
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

// ─── 帧写入 ────────────────────────────────────

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

// ─── 力计算 ────────────────────────────────────

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

  const dTheta = theta1 - theta2;
  const T2 = m2 * L2 * omega2 * omega2
           + m2 * g * Math.cos(theta2)
           + m2 * L1 * (alpha1 * Math.cos(dTheta) + omega1 * omega1 * Math.sin(dTheta));
  const T1 = m1 * L1 * omega1 * omega1
           + (m1 + m2) * g * Math.cos(theta1)
           + m2 * L2 * (alpha2 * Math.cos(dTheta) - omega2 * omega2 * Math.sin(dTheta))
           + T2 * Math.cos(dTheta);

  const Fg1 = m1 * g;
  const Fg2 = m2 * g;
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
  if (!ctx.forceExtrema) {
    ctx.forceExtrema = {
      T1_max: { value: f.T1_mag, time: simTime },
      T1_min: { value: f.T1_mag, time: simTime },
      T2_max: { value: f.T2_mag, time: simTime },
      T2_min: { value: f.T2_mag, time: simTime },
    };
    return;
  }
  if (f.T1_mag > ctx.forceExtrema.T1_max.value) ctx.forceExtrema.T1_max = { value: f.T1_mag, time: simTime };
  if (f.T1_mag < ctx.forceExtrema.T1_min.value) ctx.forceExtrema.T1_min = { value: f.T1_mag, time: simTime };
  if (f.T2_mag > ctx.forceExtrema.T2_max.value) ctx.forceExtrema.T2_max = { value: f.T2_mag, time: simTime };
  if (f.T2_mag < ctx.forceExtrema.T2_min.value) ctx.forceExtrema.T2_min = { value: f.T2_mag, time: simTime };
}

// ─── Buffer 传输 ────────────────────────────────

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
    forceExtrema: ctx.computeForces ? (ctx.forceExtrema ?? undefined) : undefined,
    energyCorrection: ctx.batchEnergyCorrection,
    // Lyapunov 指数由 Phase 2 异步计算后单独回传
  };
  const transfers: Transferable[] = [buffer.buffer as ArrayBuffer];
  if (forceBuffer) {
    transfers.push(forceBuffer.buffer as ArrayBuffer);
  }
  (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(resp, transfers);
}

/** 回传 Lyapunov 指数（影子轨迹异步计算完成后调用） */
function postLyapunovUpdate(): void {
  postResponse({ type: "lyapunovUpdate", lyapunovExponent: ctx.lyapExponent });
}

function postResponse(resp: WorkerResponse): void {
  self.postMessage(resp);
}
