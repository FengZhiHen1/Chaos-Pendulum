/**
 * 模块: explore.butterfly-scheduler
 * 职责: 蝴蝶效应双 Worker 调度器——实现 IButterflyScheduler 契约。
 *       管理 A/B 两侧独立的 ODE Worker 实例，负责帧数据接收与分发。
 * 边界:
 *   - 依赖: simulation (Float64Pool, ode-worker), shared (valueObjects, commandBus, notify)
 *   - 被依赖: hooks/useButterflySimulation (Hook 层控制生命周期)
 * 禁止行为:
 *   - 禁止直接修改 Store——通过 commandBus 异步推送帧数据
 *   - 禁止在 delta 未校验时创建 Worker
 */

import type { PendulumParams, StateVector, InitialConditions } from "@/shared/domain/valueObjects";
import type { WorkerResponse } from "@/shared/domain/valueObjects";
import { FRAME_STRIDE } from "@/shared/domain/valueObjects";
import { Float64Pool } from "@/features/simulation/infrastructure/worker/float64-pool";
import { notificationPort } from "@/shared/infrastructure/adapters";
import { commandBus } from "@/shared/infrastructure/commandBus";
import type {
  IButterflyScheduler,
  DeltaEditMode,
  EnergySnapshot,
} from "./contracts";
import {
  BUTTERFLY_DEFAULTS,
  ButterflyWorkerError,
  InvalidDeltaError,
} from "./contracts";

// ═══════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════

const TIMEOUT_MS = 2000;
const INIT_TIMEOUT_MS = 5000;
const POOL_COUNT = 10;
const POOL_SIZE = 4000;
const MAX_CRASH_RECOVERY = 1;
const MAX_POOL_EXHAUST = 10;

// ═══════════════════════════════════════════════════
// 内部类型
// ═══════════════════════════════════════════════════

interface SideWorker {
  worker: Worker;
  pool: Float64Pool;
  currentBuffer: Float64Array | null;
  consumeIndex: number;
  pendingBatch: boolean;
  crashCount: number;
  initRetries: number;
  currentSimTime: number;
  /** 初始化超时定时器 ID（收到 ready 后清除） */
  initTimeoutId: ReturnType<typeof setTimeout> | null;
}

// ═══════════════════════════════════════════════════
// ButterflyScheduler — 实现 IButterflyScheduler
// ═══════════════════════════════════════════════════

export class ButterflyScheduler implements IButterflyScheduler {
  private sideA: SideWorker | null = null;
  private sideB: SideWorker | null = null;
  private rafId = 0;
  private running = false;
  private poolExhaustCount = 0;

  /** 存储最近一次 start() 传入的基础参数（用于 setDelta 重算 B 侧初值） */
  private baseParams: PendulumParams | null = null;
  /** 存储最近一次 start() 传入的基础状态 */
  private baseState: StateVector | null = null;
  // ── 公开 API ──────────────────────────────────

  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void {
    // 校验 Delta 合法性
    if (
      !Number.isFinite(deltaDeg) ||
      deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg ||
      deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg
    ) {
      throw new InvalidDeltaError(deltaDeg);
    }

    if (this.running) return;

    // 清理可能残留的旧 Worker
    this.sideA?.worker.terminate();
    this.sideB?.worker.terminate();

    this.baseParams = { ...baseParams };
    this.baseState = { ...baseState };

    const deltaRad = deltaDeg * (Math.PI / 180);
    const icA: InitialConditions = {
      theta1: baseState.theta1,
      theta1Dot: baseState.omega1,
      theta2: baseState.theta2,
      theta2Dot: baseState.omega2,
    };
    const icB: InitialConditions = {
      theta1: baseState.theta1 + deltaRad,
      theta1Dot: baseState.omega1,
      theta2: baseState.theta2,
      theta2Dot: baseState.omega2,
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

  /** 重置——销毁两侧 Worker 并清空状态（契约签名无参数） */
  reset(): void {
    this.pause();
    this.sideA?.worker.terminate();
    this.sideB?.worker.terminate();
    this.sideA = null;
    this.sideB = null;
    this.baseParams = null;
    this.baseState = null;
    this.poolExhaustCount = 0;
  }

  /** 销毁——释放所有资源 */
  destroy(): void {
    this.reset();
  }

  updateParams(patch: Partial<PendulumParams>, mode: DeltaEditMode): void {
    // 更新本地缓存的参数
    if (this.baseParams) {
      Object.assign(this.baseParams, patch);
    }

    const cmd = { type: "updateParams" as const, params: patch };
    if (mode === "synced" || mode === "a-only") {
      this.sideA?.worker.postMessage(cmd);
    }
    if (mode === "synced" || mode === "b-only") {
      this.sideB?.worker.postMessage(cmd);
    }
  }

  /** 更新 Delta 值——校验后如 B 侧 Worker 存在则重算初值并发送 reset */
  setDelta(deltaDeg: number): void {
    if (
      !Number.isFinite(deltaDeg) ||
      deltaDeg < BUTTERFLY_DEFAULTS.minDeltaDeg ||
      deltaDeg > BUTTERFLY_DEFAULTS.maxDeltaDeg
    ) {
      throw new InvalidDeltaError(deltaDeg);
    }

    if (this.sideB && this.baseParams && this.baseState) {
      const deltaRad = deltaDeg * (Math.PI / 180);
      const icB: InitialConditions = {
        theta1: this.baseState.theta1 + deltaRad,
        theta1Dot: this.baseState.omega1,
        theta2: this.baseState.theta2,
        theta2Dot: this.baseState.omega2,
      };
      this.sideB.worker.postMessage({
        type: "reset",
        initialConditions: icB,
      });
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Worker 创建 ───────────────────────────────

  private createSideWorker(
    ic: InitialConditions,
    params: PendulumParams,
    side: "A" | "B",
  ): SideWorker {
    const worker = new Worker(
      new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url),
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
      initTimeoutId: null,
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
    sw.initTimeoutId = setTimeout(() => {
      if (sw.initRetries >= 1) {
        commandBus.emit({ type: "butterfly:workerReady", side, ready: false });
        notificationPort.notify({
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
        new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url),
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

    return sw;
  }

  // ── Worker 消息处理 ───────────────────────────

  private handleMessage(resp: WorkerResponse, sw: SideWorker, side: "A" | "B"): void {
    switch (resp.type) {
      case "ready": {
        // 清除初始化超时
        if (sw.initTimeoutId !== null) {
          clearTimeout(sw.initTimeoutId);
          sw.initTimeoutId = null;
        }
        commandBus.emit({ type: "butterfly:workerReady", side, ready: true });
        this.tryRequestBatch(sw, side);
        break;
      }

      case "batchReady": {
        sw.pendingBatch = false;

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
        sw.currentSimTime = buf[offset]!;

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
        notificationPort.notify({
          title: `摆 ${side} 仿真计算发散`,
          description: `于 t≈${sw.currentSimTime.toFixed(2)}s，请调整参数后重试`,
          variant: "error",
          durationMs: 5000,
        });
        break;
      }
    }
  }

  // ── Worker 崩溃恢复 ───────────────────────────

  private handleCrash(
    _event: ErrorEvent,
    sw: SideWorker,
    side: "A" | "B",
    ic: InitialConditions,
    params: PendulumParams,
  ): void {
    console.error(`EXP-04: Worker ${side} crash`, _event);

    if (sw.crashCount >= MAX_CRASH_RECOVERY) {
      // 超出恢复上限——构造 ButterflyWorkerError 用于诊断
      const workerError = new ButterflyWorkerError(
        `摆 ${side} 仿真引擎崩溃`,
        side,
        sw.crashCount,
      );
      console.error(workerError);

      commandBus.emit({ type: "butterfly:workerReady", side, ready: false });
      this.running = false;
      commandBus.emit({ type: "butterfly:pause" });
      notificationPort.notify({
        title: `摆 ${side} 仿真引擎崩溃`,
        description: `于 t≈${sw.currentSimTime.toFixed(2)}s，请调整参数后重试`,
        variant: "error",
        durationMs: 5000,
      });
      return;
    }

    sw.crashCount++;

    // 清除旧的 initTimeout
    if (sw.initTimeoutId !== null) {
      clearTimeout(sw.initTimeoutId);
      sw.initTimeoutId = null;
    }
    sw.worker.terminate();

    // 重建 Worker
    sw.worker = new Worker(
      new URL("@/features/simulation/infrastructure/worker/ode-worker.ts", import.meta.url),
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

  // ── 批次调度 ──────────────────────────────────

  private tryRequestBatch(sw: SideWorker, side: "A" | "B"): void {
    if (sw.pendingBatch || !this.running) return;

    const slot = sw.pool.acquire();
    if (!slot) {
      this.poolExhaustCount++;
      console.warn(
        `EXP-04: Worker ${side} pool exhausted (${this.poolExhaustCount}/${MAX_POOL_EXHAUST})`,
      );
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

  // ── rAF 循环 ──────────────────────────────────

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
