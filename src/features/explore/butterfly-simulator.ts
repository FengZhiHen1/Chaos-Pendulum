/**
 * ButterflySimulator — 主线程双摆轨迹模拟器（替代 Worker 方案）。
 *
 * 在单个 requestAnimationFrame 循环中同时积分摆 A 和摆 B 的 ODE，
 * 直接更新 butterflySlice 状态，无需 Web Worker。
 */
import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";
import { integratorStep } from "@/features/simulation/domain/services/integrators";
import { computeDerived, normalizeAngle } from "@/features/simulation/domain/services/stateVector";
import { useRootStore } from "@/stores/rootStore";
import { BUTTERFLY_DEFAULTS } from "./contracts";

const DT = 1 / 60;
const LYAP_RENORM = 60; // Lyapunov 重标定间隔（帧）

export class ButterflySimulator {
  private rafId = 0;
  private running = false;
  private stateA: Float64Array | null = null;
  private stateB: Float64Array | null = null;
  private params: PendulumParams | null = null;
  private simTime = 0;

  // Lyapunov 影子轨迹
  private shadowState: Float64Array | null = null;
  private lyapAccum = 0;
  private lyapTime = 0;
  private lyapFrameCount = 0;

  get isRunning(): boolean { return this.running; }

  // ═══════════════════════════════════════════
  // 生命周期
  // ═══════════════════════════════════════════

  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    if (this.running) return;
    const deltaRad = deltaDeg * (Math.PI / 180);

    this.stateA = new Float64Array([baseState.theta1, baseState.omega1, baseState.theta2, baseState.omega2]);
    this.stateB = new Float64Array([baseState.theta1 + deltaRad, baseState.omega1, baseState.theta2, baseState.omega2]);
    this.params = { ...baseParams };
    this.simTime = 0;

    this.shadowState = null;
    this.lyapAccum = 0;
    this.lyapTime = 0;
    this.lyapFrameCount = 0;

    // 写入初始帧
    this.emitSide("A");
    this.emitSide("B");
  }

  play(): void {
    if (this.running || !this.stateA || !this.stateB || !this.params) return;
    this.running = true;
    this.rafId = requestAnimationFrame(() => this.loop());
    useRootStore.getState().play();
  }

  pause(): void {
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    useRootStore.getState().pause();
  }

  reset(): void {
    this.pause();
    this.stateA = null;
    this.stateB = null;
    this.params = null;
    this.shadowState = null;
  }

  destroy(): void { this.reset(); }

  // ═══════════════════════════════════════════
  // Delta 更新
  // ═══════════════════════════════════════════

  setDelta(deltaDeg: number): void {
    if (!this.stateB || !this.stateA || !this.params) return;
    const safe = Number.isFinite(deltaDeg)
      ? Math.max(BUTTERFLY_DEFAULTS.minDeltaDeg, Math.min(BUTTERFLY_DEFAULTS.maxDeltaDeg, deltaDeg))
      : BUTTERFLY_DEFAULTS.minDeltaDeg;
    const deltaRad = safe * (Math.PI / 180);
    this.stateB[0] = this.stateA[0]! + deltaRad;
    this.stateB[1] = this.stateA[1]!;
    this.stateB[2] = this.stateA[2]!;
    this.stateB[3] = this.stateA[3]!;
    this.shadowState = null;
    this.emitSide("B");
  }

  // ═══════════════════════════════════════════
  // 主循环
  // ═══════════════════════════════════════════

  private loop(): void {
    if (!this.running || !this.stateA || !this.stateB || !this.params) return;

    // 积分摆 A
    integratorStep(this.stateA, this.params, DT, "RKF45");
    this.stateA[0] = normalizeAngle(this.stateA[0]!);
    this.stateA[2] = normalizeAngle(this.stateA[2]!);

    // 积分摆 B
    integratorStep(this.stateB, this.params, DT, "RKF45");
    this.stateB[0] = normalizeAngle(this.stateB[0]!);
    this.stateB[2] = normalizeAngle(this.stateB[2]!);

    this.simTime += DT;

    // 发射帧
    this.emitSide("A");
    this.emitSide("B");

    // Lyapunov 影子轨迹
    this.stepLyapunov();

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  // ═══════════════════════════════════════════
  // 帧发射
  // ═══════════════════════════════════════════

  private emitSide(side: "A" | "B"): void {
    const state = side === "A" ? this.stateA! : this.stateB!;
    const derived = computeDerived(state, this.params!);
    const store = useRootStore.getState();
    store._updateSide(side,
      { theta1: state[0]!, omega1: state[1]!, theta2: state[2]!, omega2: state[3]! },
      { kinetic: derived.kineticEnergy, potential: derived.potentialEnergy, total: derived.totalEnergy },
      { x1: derived.x1, y1: derived.y1, x2: derived.x2, y2: derived.y2 },
    );
  }

  // ═══════════════════════════════════════════
  // Lyapunov 指数
  // ═══════════════════════════════════════════

  private stepLyapunov(): void {
    if (!this.stateA || !this.stateB || !this.params) return;
    const D0 = 1e-8;

    if (!this.shadowState) {
      this.shadowState = new Float64Array(this.stateA);
      this.shadowState[0] = this.shadowState[0]! + D0;
    }

    // 影子轨迹跟随主轨迹
    integratorStep(this.shadowState, this.params, DT, "RKF45");
    this.shadowState[0] = normalizeAngle(this.shadowState[0]!);
    this.shadowState[2] = normalizeAngle(this.shadowState[2]!);

    this.lyapFrameCount++;
    if (this.lyapFrameCount >= LYAP_RENORM) {
      this.lyapFrameCount = 0;
      const s = this.stateA;
      const sh = this.shadowState;
      const dist = Math.sqrt(
        (s[0]! - sh[0]!) ** 2 + (s[1]! - sh[1]!) ** 2 +
        (s[2]! - sh[2]!) ** 2 + (s[3]! - sh[3]!) ** 2,
      );
      if (dist > 0 && dist < 1e6) {
        this.lyapAccum += Math.log(dist / D0);
        this.lyapTime += LYAP_RENORM * DT;
        const exp = this.lyapAccum / Math.max(this.lyapTime, 1e-6);
        useRootStore.setState({ lyapunovExponent: exp });
      }
      const scale = D0 / Math.max(dist, 1e-15);
      sh[0] = s[0]! + scale * (sh[0]! - s[0]!);
      sh[1] = s[1]! + scale * (sh[1]! - s[1]!);
      sh[2] = s[2]! + scale * (sh[2]! - s[2]!);
      sh[3] = s[3]! + scale * (sh[3]! - s[3]!);
    }
  }
}
