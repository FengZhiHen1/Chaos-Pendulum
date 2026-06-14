/**
 * ButterflyScheduler — 蝴蝶效应双 Worker 调度器。
 *
 * 管理 A/B 两侧 ButterflySideRunner，负责启动/暂停/参数同步/Delta 更新。
 * 实现 IButterflyScheduler 契约。
 */
import type { PendulumParams, StateVector, InitialConditions } from "@/shared/domain/valueObjects";
import {
  BUTTERFLY_DEFAULTS,
  InvalidDeltaError,
} from "./contracts";
import { commandBus } from "@/shared/infrastructure/commandBus";
import { ButterflySideRunner } from "./infrastructure/scheduler/ButterflySideRunner";

export class ButterflyScheduler {
  private sideA = new ButterflySideRunner("A");
  private sideB = new ButterflySideRunner("B");
  private rafId = 0;
  private running = false;
  private baseParams: PendulumParams | null = null;
  private baseState: StateVector | null = null;

  constructor() {
    this.sideA.setFrameHandler((side, state, energy, derived, simTime) => {
      commandBus.emit({ type: "butterfly:frame", side, state, energy, derived, simTime });
    });
    this.sideB.setFrameHandler((side, state, energy, derived, simTime) => {
      commandBus.emit({ type: "butterfly:frame", side, state, energy, derived, simTime });
    });
    const readyHandler = (side: "A" | "B", ready: boolean) => {
      commandBus.emit({ type: "butterfly:workerReady", side, ready });
      if (!ready) { commandBus.emit({ type: "butterfly:pause" }); this.running = false; }
    };
    this.sideA.setReadyHandler(readyHandler);
    this.sideB.setReadyHandler(readyHandler);
  }

  get isRunning(): boolean { return this.running; }

  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    if (!Number.isFinite(deltaDeg) || deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg || deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg) {
      throw new InvalidDeltaError(deltaDeg);
    }
    if (this.running) return;
    this.baseParams = { ...baseParams };
    this.baseState = { ...baseState };
    const deltaRad = deltaDeg * (Math.PI / 180);
    const icA: InitialConditions = { theta1: baseState.theta1, theta1Dot: baseState.omega1, theta2: baseState.theta2, theta2Dot: baseState.omega2 };
    const icB: InitialConditions = { theta1: baseState.theta1 + deltaRad, theta1Dot: baseState.omega1, theta2: baseState.theta2, theta2Dot: baseState.omega2 };
    this.sideA.create(icA, baseParams);
    this.sideB.create(icB, baseParams);
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.sideA.setRunning(true); this.sideB.setRunning(true);
    commandBus.emit({ type: "butterfly:play" });
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  pause(): void {
    this.running = false;
    this.sideA.setRunning(false); this.sideB.setRunning(false);
    commandBus.emit({ type: "butterfly:pause" });
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
  }

  reset(): void {
    this.pause();
    this.sideA.destroy(); this.sideB.destroy();
    this.baseParams = null; this.baseState = null;
  }

  destroy(): void { this.reset(); }

  updateParams(patch: Partial<PendulumParams>, mode: "synced" | "a-only" | "b-only"): void {
    if (this.baseParams) Object.assign(this.baseParams, patch);
    const cmd = { type: "updateParams" as const, params: patch };
    if (mode === "synced" || mode === "a-only") this.sideA.postCommand(cmd);
    if (mode === "synced" || mode === "b-only") this.sideB.postCommand(cmd);
  }

  setDelta(deltaDeg: number): void {
    if (!Number.isFinite(deltaDeg) || deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg || deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg) {
      throw new InvalidDeltaError(deltaDeg);
    }
    if (this.baseParams && this.baseState) {
      const deltaRad = deltaDeg * (Math.PI / 180);
      this.sideB.postCommand({ type: "reset", initialConditions: { theta1: this.baseState.theta1 + deltaRad, theta1Dot: this.baseState.omega1, theta2: this.baseState.theta2, theta2Dot: this.baseState.omega2 } });
    }
  }

  private loop(): void {
    if (!this.running) return;
    if (!this.sideA.isPending && !this.sideB.isPending) {
      this.sideA.tryRequestBatch();
      this.sideB.tryRequestBatch();
    }
    this.rafId = requestAnimationFrame(() => this.loop());
  }
}
