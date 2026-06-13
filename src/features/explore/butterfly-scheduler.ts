import type { PendulumParams, StateVector, InitialConditions } from "@/shared/types";
import type { WorkerResponse } from "@/shared/types";
import { FRAME_STRIDE } from "@/shared/types";
import { Float64Pool } from "@/features/simulation/worker/float64-pool";
import { notify } from "@/shared/infrastructure/error-handling/notify";
import { commandBus } from "@/shared/infrastructure/commandBus";
import { useRootStore } from "@/stores/rootStore";
import type { EnergySnapshot } from "@/features/explore/viewModel/stores/butterflySlice";

const TIMEOUT_MS = 2000;
const INIT_TIMEOUT_MS = 5000;
const POOL_COUNT = 10;
const POOL_SIZE = 4000;
const MAX_CRASH_RECOVERY = 1;
const MAX_POOL_EXHAUST = 10;

interface SideWorker {
  worker: Worker;
  pool: Float64Pool;
  currentBuffer: Float64Array | null;
  consumeIndex: number;
  pendingBatch: boolean;
  crashCount: number;
  initRetries: number;
  currentSimTime: number;
}

export class ButterflyScheduler {
  private sideA: SideWorker | null = null;
  private sideB: SideWorker | null = null;
  private rafId = 0;
  private running = false;
  private poolExhaustCount = 0;

  // ── 公开 API ──

  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    if (this.running) return;

    const deltaRad = deltaDeg * (Math.PI / 180);
    const icA: InitialConditions = {
      theta1: baseState.theta1, theta1Dot: baseState.omega1,
      theta2: baseState.theta2, theta2Dot: baseState.omega2,
    };
    const icB: InitialConditions = {
      theta1: baseState.theta1 + deltaRad, theta1Dot: baseState.omega1,
      theta2: baseState.theta2, theta2Dot: baseState.omega2,
    };

    this.sideA = this.createSideWorker(icA, baseParams, "A");
    this.sideB = this.createSideWorker(icB, baseParams, "B");

    this.running = false; // 等待 ready
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    commandBus.emit({ type: "butterfly:play" });
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  pause(): void {
    this.running = false;
    commandBus.emit({ type: "butterfly:pause" });
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  destroy(): void {
    this.pause();
    this.sideA?.worker.terminate();
    this.sideB?.worker.terminate();
    this.sideA = null;
    this.sideB = null;
  }

  reset(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    this.pause();
    this.sideA?.worker.terminate();
    this.sideB?.worker.terminate();

    const deltaRad = deltaDeg * (Math.PI / 180);
    const icA: InitialConditions = {
      theta1: baseState.theta1, theta1Dot: baseState.omega1,
      theta2: baseState.theta2, theta2Dot: baseState.omega2,
    };
    const icB: InitialConditions = {
      theta1: baseState.theta1 + deltaRad, theta1Dot: baseState.omega1,
      theta2: baseState.theta2, theta2Dot: baseState.omega2,
    };

    this.sideA = this.createSideWorker(icA, baseParams, "A");
    this.sideB = this.createSideWorker(icB, baseParams, "B");
  }

  updateParams(patch: Partial<PendulumParams>): void {
    const editMode = useRootStore.getState().editMode;
    const cmd = { type: "updateParams" as const, params: patch };
    if (editMode === "synced" || editMode === "a-only") {
      this.sideA?.worker.postMessage(cmd);
    }
    if (editMode === "synced" || editMode === "b-only") {
      this.sideB?.worker.postMessage(cmd);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Worker 创建 ──

  private createSideWorker(
    ic: InitialConditions,
    params: PendulumParams,
    side: "A" | "B",
  ): SideWorker {
    const worker = new Worker(
      new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
      { type: "module" },
    );

    const sw: SideWorker = {
      worker,
      pool: new Float64Pool(POOL_COUNT, POOL_SIZE),
      currentBuffer: null,
      consumeIndex: 0,
      pendingBatch: false,
      crashCount: 0,
      initRetries: 0,
      currentSimTime: 0,
    };

    worker.onmessage = (e: MessageEvent<WorkerResponse>) =>
      this.handleMessage(e.data, sw, side);
    worker.onerror = (event) => this.handleCrash(event, sw, side, ic, params);

    worker.postMessage({
      type: "init",
      params,
      initialConditions: ic,
      method: "RKF45",
    });

    // 初始化超时检测
    const initTimeout = setTimeout(() => {
      if (sw.initRetries >= 1) {
        commandBus.emit({ type: "butterfly:workerReady", side, ready: false });
        notify({
          title: `摆 ${side} 仿真引擎启动失败`,
          description: "请刷新页面后重试",
          variant: "error",
          durationMs: 8000,
        });
        return;
      }
      sw.initRetries++;
      sw.worker.terminate();
      const retryWorker = new Worker(
        new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
        { type: "module" },
      );
      sw.worker = retryWorker;
      retryWorker.onmessage = (e: MessageEvent<WorkerResponse>) =>
        this.handleMessage(e.data, sw, side);
      retryWorker.onerror = (event) => this.handleCrash(event, sw, side, ic, params);
      retryWorker.postMessage({
        type: "init",
        params,
        initialConditions: ic,
        method: "RKF45",
      });
    }, INIT_TIMEOUT_MS);

    // 收到 ready 时清除超时（在 handleMessage 的 ready 分支处理）
    (sw as any).__initTimeout = initTimeout;

    return sw;
  }

  // ── Worker 消息处理 ──

  private handleMessage(resp: WorkerResponse, sw: SideWorker, side: "A" | "B"): void {
    switch (resp.type) {
      case "ready": {
        // 清除初始化超时
        const timeout = (sw as any).__initTimeout;
        if (timeout) { clearTimeout(timeout); (sw as any).__initTimeout = null; }
        commandBus.emit({ type: "butterfly:workerReady", side, ready: true });
        this.tryRequestBatch(sw, side);
        break;
      }

      case "batchReady": {
        sw.pendingBatch = false;

        // 解析最后一帧用于 Store 更新
        const lastFrameIdx = resp.frameCount - 1;
        const offset = lastFrameIdx * FRAME_STRIDE;
        const buf = resp.buffer;

        const stateVec: StateVector = {
          theta1: buf[offset + 1]!,
          omega1: buf[offset + 2]!,
          theta2: buf[offset + 3]!,
          omega2: buf[offset + 4]!,
        };

        const energy: EnergySnapshot = {
          kinetic: buf[offset + 9]!,
          potential: buf[offset + 10]!,
          total: buf[offset + 11]!,
        };

        const derived = {
          x1: buf[offset + 5]!,
          y1: buf[offset + 6]!,
          x2: buf[offset + 7]!,
          y2: buf[offset + 8]!,
        };

        commandBus.emit({
          type: "butterfly:frame",
          side,
          state: stateVec,
          energy,
          derived,
          simTime: buf[offset]!,
        });
        sw.currentSimTime = buf[offset]!; // t 在第一列

        // 归还 buffer
        sw.pool.releaseBuffer(resp.buffer);
        sw.currentBuffer = null;
        sw.consumeIndex = 0;

        this.tryRequestBatch(sw, side);
        break;
      }

      case "error": {
        sw.pendingBatch = false;
        commandBus.emit({ type: "butterfly:workerReady", side, ready: false });
        commandBus.emit({ type: "butterfly:pause" });
        this.running = false;
        console.error(`EXP-04: Worker ${side} error`, resp);
        notify({
          title: `摆 ${side} 仿真计算发散`,
          description: `于 t≈${sw.currentSimTime.toFixed(2)}s，请调整参数后重试`,
          variant: "error",
          durationMs: 5000,
        });
        break;
      }
    }
  }

  private handleCrash(
    _event: ErrorEvent,
    sw: SideWorker,
    side: "A" | "B",
    ic: InitialConditions,
    params: PendulumParams,
  ): void {
    console.error(`EXP-04: Worker ${side} crash`, _event);

    if (sw.crashCount >= MAX_CRASH_RECOVERY) {
      commandBus.emit({ type: "butterfly:workerReady", side, ready: false });
      this.running = false;
      commandBus.emit({ type: "butterfly:pause" });
      notify({
        title: `摆 ${side} 仿真引擎崩溃`,
        description: `于 t≈${sw.currentSimTime.toFixed(2)}s，请调整参数后重试`,
        variant: "error",
        durationMs: 5000,
      });
      return;
    }

    sw.crashCount++;
    sw.worker.terminate();

    // 重建
    sw.worker = new Worker(
      new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
      { type: "module" },
    );
    sw.worker.onmessage = (e: MessageEvent<WorkerResponse>) =>
      this.handleMessage(e.data, sw, side);
    sw.worker.onerror = (event) => this.handleCrash(event, sw, side, ic, params);
    sw.pendingBatch = false;
    sw.currentBuffer = null;
    sw.consumeIndex = 0;

    sw.worker.postMessage({
      type: "init",
      params,
      initialConditions: ic,
      method: "RKF45",
    });
  }

  // ── 批次调度 ──

  private tryRequestBatch(sw: SideWorker, side: "A" | "B"): void {
    if (sw.pendingBatch || !this.running) return;

    const slot = sw.pool.acquire();
    if (!slot) {
      this.poolExhaustCount++;
      console.warn(`EXP-04: Worker ${side} pool exhausted (${this.poolExhaustCount}/${MAX_POOL_EXHAUST})`);
      if (this.poolExhaustCount >= MAX_POOL_EXHAUST) {
        console.error("EXP-04: Pool exhausted 10 consecutive frames, auto-pausing");
        this.pause();
      }
      return;
    }
    this.poolExhaustCount = 0;

    sw.pendingBatch = true;

    sw.worker.postMessage(
      { type: "step", buffer: slot.buffer },
      [slot.buffer.buffer],
    );

    setTimeout(() => {
      if (sw.pendingBatch) {
        console.error(`EXP-04: Worker ${side} timeout`);
        sw.pendingBatch = false;
        sw.pool.release(slot.index);
      }
    }, TIMEOUT_MS);
  }

  // ── rAF 循环 ──

  private loop(): void {
    if (!this.running) return;

    // 仅当两侧均空闲时才发送新批次，确保步调同步
    const aBusy = this.sideA?.pendingBatch;
    const bBusy = this.sideB?.pendingBatch;
    if (!aBusy && !bBusy) {
      if (this.sideA) this.tryRequestBatch(this.sideA, "A");
      if (this.sideB) this.tryRequestBatch(this.sideB, "B");
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }
}
