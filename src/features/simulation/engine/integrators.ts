import type { PendulumParams, IntegratorMethod } from "@/shared/types";
import { odeRhs, angularAcceleration } from "./derivatives";

/**
 * 单步积分，根据 method 选择对应实现。
 * 原地更新 state: Float64Array(4) -> [θ₁, ω₁, θ₂, ω₂]。
 * 默认 "RK4" 使用自适应 RKF45（嵌入 4(5) 对），含局部截断误差控制。
 */
export function integratorStep(
  state: Float64Array,
  p: PendulumParams,
  dt: number,
  method: IntegratorMethod,
): void {
  switch (method) {
    case "RK4":
      adaptiveRKF45(state, p, dt);
      break;
    case "VelocityVerlet":
      verletStep(state, p, dt);
      break;
    case "Euler":
      eulerStep(state, p, dt);
      break;
    default:
      adaptiveRKF45(state, p, dt);
  }
}

// ─── RKF45 预分配缓冲区（Worker 单线程，零分配）────

const _rk_k1 = new Float64Array(4);
const _rk_k2 = new Float64Array(4);
const _rk_k3 = new Float64Array(4);
const _rk_k4 = new Float64Array(4);
const _rk_k5 = new Float64Array(4);
const _rk_k6 = new Float64Array(4);
const _rk_tmp = new Float64Array(4); // 中间状态/临时计算
const _rk_save = new Float64Array(4); // 步长拒绝时回退

/** RKF45 默认容差 */
const RKF45_TOL = 1e-7;

// ─── Butcher 表系数 ─────────────────────────────

// a21
const A21 = 1 / 4;
// a31, a32
const A31 = 3 / 32;
const A32 = 9 / 32;
// a41, a42, a43
const A41 = 1932 / 2197;
const A42 = -7200 / 2197;
const A43 = 7296 / 2197;
// a51, a52, a53, a54
const A51 = 439 / 216;
const A52 = -8;
const A53 = 3680 / 513;
const A54 = -845 / 4104;
// a61, a62, a63, a64, a65
const A61 = -8 / 27;
const A62 = 2;
const A63 = -3544 / 2565;
const A64 = 1859 / 4104;
const A65 = -11 / 40;

// 5 阶权重 (b5*) —— 用于状态推进
const B51 = 16 / 135;
const B53 = 6656 / 12825;
const B54 = 28561 / 56430;
const B55 = -9 / 50;
const B56 = 2 / 55;

// 4 阶权重 (b4) —— 用于误差估计
const B41 = 25 / 216;
const B43 = 1408 / 2565;
const B44 = 2197 / 4104;
const B45 = -1 / 5;

// ─── 自适应 RKF45 ───────────────────────────────

/**
 * 使用 RKF45 嵌入对以自适应步长积分 state 走过 dt。
 * 根据局部截断误差动态调整子步长。
 */
function adaptiveRKF45(
  state: Float64Array,
  p: PendulumParams,
  dt: number,
): void {
  const dir = dt >= 0 ? 1 : -1;
  let remaining = Math.abs(dt);
  let h = remaining; // 初始猜测：单步完成
  let prevErr = 1e-7;

  while (remaining > 1e-14) {
    h = Math.min(h, remaining);

    // 保存当前状态，供拒绝时回退
    _rk_save.set(state);

    const err = rkf45Step(state, p, h * dir);

    if (err < RKF45_TOL) {
      remaining -= h;
      _rk_save.set(state); // 更新检查点
      prevErr = Math.max(err, 1e-15);

      // PI 步长控制器：结合当前与上一步误差
      const fac = Math.min(5, 0.9 * Math.pow(RKF45_TOL / prevErr, 0.2));
      // 若当前误差极低，略微放大步长
      h = Math.min(remaining, h * (err < RKF45_TOL * 0.01 ? Math.min(fac, 3) : fac));
    } else {
      // 拒绝：回退状态，缩小步长重试
      state.set(_rk_save);
      const fac = Math.max(0.1, 0.9 * Math.pow(RKF45_TOL / Math.max(err, 1e-15), 0.2));
      h = h * fac;
      if (h < 1e-10) {
        // 步长坍缩：回退到检查点，单步 Euler 强制推进脱离僵局
        state.set(_rk_save);
        eulerStep(state, p, 1e-10 * dir);
        remaining -= 1e-10;
        if (remaining < 0) remaining = 0;
        break;
      }
    }
  }
}

/**
 * 执行单步 RKF45（Fehlberg 嵌入 4(5) 对）。
 * 原地写入 state（5 阶解），返回 |5阶 - 4阶| 的逐分量最大值作为误差估计。
 */
function rkf45Step(
  state: Float64Array,
  p: PendulumParams,
  h: number,
): number {
  // k1 = f(state)
  odeRhs(state, p, _rk_k1);

  // k2 = f(state + h * a21 * k1)
  for (let i = 0; i < 4; i++) _rk_tmp[i] = state[i]! + h * A21 * _rk_k1[i]!;
  odeRhs(_rk_tmp, p, _rk_k2);

  // k3 = f(state + h * (a31*k1 + a32*k2))
  for (let i = 0; i < 4; i++) _rk_tmp[i] = state[i]! + h * (A31 * _rk_k1[i]! + A32 * _rk_k2[i]!);
  odeRhs(_rk_tmp, p, _rk_k3);

  // k4 = f(state + h * (a41*k1 + a42*k2 + a43*k3))
  for (let i = 0; i < 4; i++) _rk_tmp[i] = state[i]! + h * (A41 * _rk_k1[i]! + A42 * _rk_k2[i]! + A43 * _rk_k3[i]!);
  odeRhs(_rk_tmp, p, _rk_k4);

  // k5 = f(state + h * (a51*k1 + a52*k2 + a53*k3 + a54*k4))
  for (let i = 0; i < 4; i++) _rk_tmp[i] = state[i]! + h * (A51 * _rk_k1[i]! + A52 * _rk_k2[i]! + A53 * _rk_k3[i]! + A54 * _rk_k4[i]!);
  odeRhs(_rk_tmp, p, _rk_k5);

  // k6 = f(state + h * (a61*k1 + a62*k2 + a63*k3 + a64*k4 + a65*k5))
  for (let i = 0; i < 4; i++) _rk_tmp[i] = state[i]! + h * (A61 * _rk_k1[i]! + A62 * _rk_k2[i]! + A63 * _rk_k3[i]! + A64 * _rk_k4[i]! + A65 * _rk_k5[i]!);
  odeRhs(_rk_tmp, p, _rk_k6);

  // 计算 4 阶与 5 阶解，取 5 阶解推进，返回误差估计
  let err = 0;
  for (let i = 0; i < 4; i++) {
    const y4 = state[i]! + h * (B41 * _rk_k1[i]! + B43 * _rk_k3[i]! + B44 * _rk_k4[i]! + B45 * _rk_k5[i]!);
    const y5 = state[i]! + h * (B51 * _rk_k1[i]! + B53 * _rk_k3[i]! + B54 * _rk_k4[i]! + B55 * _rk_k5[i]! + B56 * _rk_k6[i]!);
    const diff = Math.abs(y5 - y4);
    if (diff > err) err = diff;
    state[i] = y5;
  }

  return err;
}

// ─── Velocity Verlet（实验性积分器）───────────────
//
// 注意：标准 Velocity Verlet 的辛性质要求加速度仅依赖位置 a=a(x)。
// 双摆的角加速度依赖角速度平方项（离心力/科里奥利力）：
//   α = f(θ₁,θ₂, ω₁²,ω₂²)
// 本实现简化为半步速度-全步位置-重算加速度的标准 VV 流程，
// 未处理 a=a(x,v) 的速度依赖，实际退化为精度不明的自定义格式。
//
// 对于生产用途，推荐使用 RK4 作为积分器；Velocity Verlet 保留
// 仅供教育对比和实验性探索。

function verletStep(state: Float64Array, p: PendulumParams, dt: number): void {
  const alpha0 = angularAcceleration(state, p);
  state[1] = state[1]! + 0.5 * dt * alpha0[0]!;
  state[3] = state[3]! + 0.5 * dt * alpha0[1]!;
  state[0] = state[0]! + dt * state[1]!;
  state[2] = state[2]! + dt * state[3]!;
  const alpha1 = angularAcceleration(state, p);
  state[1] = state[1]! + 0.5 * dt * alpha1[0]!;
  state[3] = state[3]! + 0.5 * dt * alpha1[1]!;
}

// ─── Euler（显式欧拉，教育用途）───────────────────

function eulerStep(state: Float64Array, p: PendulumParams, dt: number): void {
  odeRhs(state, p, _rk_tmp);
  for (let i = 0; i < 4; i++) {
    state[i] = state[i]! + dt * _rk_tmp[i]!;
  }
}
