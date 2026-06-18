/**
 * ButterflySideRunner — 单侧蝴蝶效应 Worker 管理器。
 *
 * 管理一个 ODE Worker 实例的生命周期：创建、消息处理、崩溃恢复、批次调度。
 * 由 ButterflyScheduler 创建两实例（A/B）并协调。
 */
import type { PendulumParams, InitialConditions, StateVector } from "@/shared/domain/valueObjects";
import type { WorkerResponse } from "@/shared/domain/valueObjects";
import { FRAME_STRIDE } from "@/shared/domain/valueObjects";
import { Float64Pool } from "@/features/simulation/infrastructure/worker/float64-pool";
import { notificationPort } from "@/shared/infrastructure/adapters";
import type { EnergySnapshot } from "../../contracts";

const TIMEOUT_MS = 2000;
const INIT_TIMEOUT_MS = 5000;
const POOL_COUNT = 10;
const POOL_SIZE = 4000;

export interface SideWorkerState {
  worker: Worker;
  pool: Float64Pool;
  pendingBatch: boolean;
  crashCount: number;
  initRetries: number;
  currentSimTime: number;
  initTimeoutId: ReturnType<typeof setTimeout> | null;
}

export class ButterflySideRunner {
  readonly side: "A" | "B";
  private sw: SideWorkerState | null = null;
  private onFrame: ((side: "A" | "B", state: StateVector, energy: EnergySnapshot, derived: { x1: number; y1: number; x2: number; y2: number }, simTime: number) => void) | null = null;
  private onReady: ((side: "A" | "B", ready: boolean) => void) | null = null;
  private running = false;

  constructor(side: "A" | "B") { this.side = side; }

  get isReady(): boolean { return this.sw !== null; }
  get isPending(): boolean { return this.sw?.pendingBatch ?? false; }
  get simTime(): number { return this.sw?.currentSimTime ?? 0; }

  setFrameHandler(fn: (side: "A" | "B", state: StateVector, energy: EnergySnapshot, derived: { x1: number; y1: number; x2: number; y2: number }, simTime: number) => void): void { this.onFrame = fn; }
  setReadyHandler(fn: (side: "A" | "B", ready: boolean) => void): void { this.onReady = fn; }
  setRunning(r: boolean): void { this.running = r; }

  create(ic: InitialConditions, params: PendulumParams): void {
    this.destroy();
    const worker = new Worker(new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url), { type: "module" });
    this.sw = { worker, pool: new Float64Pool(POOL_COUNT, POOL_SIZE), pendingBatch: false, crashCount: 0, initRetries: 0, currentSimTime: 0, initTimeoutId: null };
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(e.data);
    worker.onerror = (event) => this.handleCrash(event, ic, params);
    worker.postMessage({ type: "init", params, initialConditions: ic, method: "RKF45" });
    this.sw.initTimeoutId = setTimeout(() => this.onInitTimeout(ic, params), INIT_TIMEOUT_MS);
  }

  postCommand(cmd: Record<string, unknown>): void { this.sw?.worker.postMessage(cmd); }

  tryRequestBatch(): void {
    if (!this.sw || this.sw.pendingBatch || !this.running) return;
    const slot = this.sw.pool.acquire();
    if (!slot) { console.warn(`ButterflySideRunner ${this.side}: pool exhausted`); return; }
    this.sw.pendingBatch = true;
    this.sw.worker.postMessage({ type: "step", buffer: slot.buffer }, [slot.buffer.buffer]);
    setTimeout(() => { if (this.sw?.pendingBatch) { this.sw.pendingBatch = false; this.sw.pool.release(slot.index); } }, TIMEOUT_MS);
  }

  destroy(): void {
    if (this.sw) { if (this.sw.initTimeoutId) clearTimeout(this.sw.initTimeoutId); this.sw.worker.terminate(); this.sw = null; }
  }

  private handleMessage(resp: WorkerResponse): void {
    if (!this.sw) return;
    switch (resp.type) {
      case "ready": {
        if (this.sw.initTimeoutId) { clearTimeout(this.sw.initTimeoutId); this.sw.initTimeoutId = null; }
        this.onReady?.(this.side, true);
        // 不在此处 tryRequestBatch——由 ButterflyScheduler 的 rAF 循环统一驱动，
        // 避免 Worker 快速响应时形成 batchReady→tryRequestBatch→batchReady 的紧循环
        break;
      }
      case "batchReady": {
        this.sw.pendingBatch = false;
        const lastFrameIdx = resp.frameCount - 1;
        const offset = lastFrameIdx * FRAME_STRIDE;
        const buf = resp.buffer;
        const state: StateVector = { theta1: buf[offset + 1]!, omega1: buf[offset + 2]!, theta2: buf[offset + 3]!, omega2: buf[offset + 4]! };
        const energy: EnergySnapshot = { kinetic: buf[offset + 9]!, potential: buf[offset + 10]!, total: buf[offset + 11]! };
        const derived = { x1: buf[offset + 5]!, y1: buf[offset + 6]!, x2: buf[offset + 7]!, y2: buf[offset + 8]! };
        this.onFrame?.(this.side, state, energy, derived, buf[offset]!);
        this.sw.currentSimTime = buf[offset]!;
        this.sw.pool.releaseBuffer(resp.buffer);
        // 不在此处 tryRequestBatch——下一批次由 ButterflyScheduler.loop() 在下一帧请求
        break;
      }
      case "error": {
        this.sw.pendingBatch = false;
        this.onReady?.(this.side, false);
        notificationPort.notify({ title: `摆 ${this.side} 仿真计算发散`, description: `于 t≈${this.sw.currentSimTime.toFixed(2)}s，请调整参数后重试`, variant: "error", durationMs: 5000 });
        break;
      }
    }
  }

  private onInitTimeout(ic: InitialConditions, params: PendulumParams): void {
    if (!this.sw) return;
    if (this.sw.initRetries >= 1) { this.onReady?.(this.side, false); notificationPort.notify({ title: `摆 ${this.side} 仿真引擎启动失败`, description: "请刷新页面后重试", variant: "error", durationMs: 8000 }); return; }
    this.sw.initRetries++;
    this.sw.worker.terminate();
    const worker = new Worker(new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url), { type: "module" });
    this.sw.worker = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(e.data);
    worker.onerror = (event) => this.handleCrash(event, ic, params);
    worker.postMessage({ type: "init", params, initialConditions: ic, method: "RKF45" });
  }

  private handleCrash(_event: ErrorEvent, ic: InitialConditions, params: PendulumParams): void {
    if (!this.sw) return;
    console.error(`ButterflySideRunner ${this.side}: Worker crash`, _event);
    if (this.sw.crashCount >= 1) { this.onReady?.(this.side, false); notificationPort.notify({ title: `摆 ${this.side} 仿真引擎崩溃`, description: `于 t≈${this.sw.currentSimTime.toFixed(2)}s，请调整参数后重试`, variant: "error", durationMs: 5000 }); return; }
    this.sw.crashCount++;
    if (this.sw.initTimeoutId) { clearTimeout(this.sw.initTimeoutId); this.sw.initTimeoutId = null; }
    this.sw.worker.terminate();
    this.sw.worker = new Worker(new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url), { type: "module" });
    this.sw.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(e.data);
    this.sw.worker.onerror = (event) => this.handleCrash(event, ic, params);
    this.sw.pendingBatch = false;
    this.sw.worker.postMessage({ type: "init", params, initialConditions: ic, method: "RKF45" });
  }
}
