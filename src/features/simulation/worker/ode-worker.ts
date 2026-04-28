import type {
  WorkerCommand,
  WorkerResponse,
  PendulumParams,
  IntegratorMethod,
} from "@/shared/types";
import { FRAME_STRIDE, FRAMES_PER_BATCH } from "@/shared/types";
import { integratorStep } from "../engine/integrators";
import { computeDerived, normalizeAngle, hasInvalidValue } from "../engine/state-vector";

// ─── Worker 内部状态 ──────────────────────────────

type WorkerPhase = "uninit" | "idle" | "computing" | "error";

let _phase: WorkerPhase = "uninit";
let _state: Float64Array | null = null; // [θ₁, ω₁, θ₂, ω₂]
let _params: PendulumParams | null = null;
let _method: IntegratorMethod = "RK4";
let _direction: 1 | -1 = 1;
let _simTime = 0;

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
  _phase = "idle";

  postResponse({ type: "ready" });
}

// ─── 步骤 3：批量积分 ───────────────────────────

function handleStep(cmd: { buffer: Float64Array }): void {
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
  _phase = "computing";

  const dt = 1 / 60;
  const startTime = performance.now();
  let frame = 0;

  for (; frame < FRAMES_PER_BATCH; frame++) {
    // 单步积分
    integratorStep(_state, _params, dt * _direction, _method);

    // NaN 检查
    if (hasInvalidValue(_state)) {
      _phase = "error";
      // transfer 包含已填充帧的 buffer 回主线程
      transferBuffer(buffer, frame, _simTime);
      postResponse({
        type: "error",
        code: "DIVERGED",
        message: `数值发散于 t≈${_simTime.toFixed(2)}, 方法=${_method}`,
        simTime: _simTime,
      });
      return;
    }

    _simTime += dt * _direction;

    // 反向积分回到 t=0 边界：clamp 到 0，只填充 simTime > 0 的帧
    if (_direction === -1 && _simTime <= 0) {
      _simTime = 0;
      const derived = computeDerived(_state, _params);
      writeFrame(buffer, frame, _simTime, _state, derived);
      frame++;
      break;
    }

    // 计算派生量并写入 buffer
    const derived = computeDerived(_state, _params);
    writeFrame(buffer, frame, _simTime, _state, derived);

    // 角度归一化
    _state[0] = normalizeAngle(_state[0]!);
    _state[2] = normalizeAngle(_state[2]!);
  }

  const elapsed = performance.now() - startTime;
  if (elapsed > 50) {
    console.warn(`[ode-worker] handleStep 耗时 ${elapsed.toFixed(1)}ms，接近帧预算`);
  }

  _phase = "idle";
  transferBuffer(buffer, frame, _simTime);
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

// ─── 重置 ─────────────────────────────────────

function handleReset(cmd: { initialConditions: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number } }): void {
  const ic = cmd.initialConditions;
  _state = new Float64Array([ic.theta1, ic.theta1Dot, ic.theta2, ic.theta2Dot]);
  _state[0] = normalizeAngle(_state[0]!);
  _state[2] = normalizeAngle(_state[2]!);
  _simTime = 0;
  _direction = 1;
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

function transferBuffer(buffer: Float64Array, frameCount: number, simTime: number): void {
  const resp: WorkerResponse = {
    type: "batchReady",
    buffer,
    frameCount,
    simTime,
  };
  (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
    resp,
    [buffer.buffer as ArrayBuffer],
  );
}

function postResponse(resp: WorkerResponse): void {
  self.postMessage(resp);
}
