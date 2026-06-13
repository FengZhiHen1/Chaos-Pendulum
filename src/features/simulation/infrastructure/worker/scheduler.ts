import type {
  WorkerResponse,
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  PoincareSectionCondition,
  PoincarePoint,
} from "@/shared/domain/valueObjects";
import { FRAMES_PER_BATCH, BATCH_PREFETCH_THRESHOLD, FRAME_STRIDE, FrameField } from "@/shared/domain/valueObjects";
import { commandBus } from "@/shared/infrastructure/commandBus";
import { useRootStore } from "@/stores/rootStore";
import { observabilityCoordinator } from "@/shared/infrastructure/observability";
import type { IWorkerGateway, IFloat64Pool, IWorkerRecoveryPolicy } from "../../contracts";
import { ISimulationScheduler } from "../../contracts";

const TIMEOUT_MS = 2000;
const TICK_DT = 1 / 60;
const MAX_TICKS_PER_FRAME = 3;

/** 供渲染层插值使用的坐标快照 */
export interface InterpSnapshot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 仿真调度器——管理仿真生命周期、双缓冲帧消费、Worker 通信协调。
 * 继承 ISimulationScheduler 抽象基类，实现所有抽象方法和钩子。
 */
export class SimulationScheduler extends ISimulationScheduler {
  // 帧缓冲
  private activeBuffer: Float64Array | null = null;
  private activeIndex = 0;
  private activeFrameCount = FRAMES_PER_BATCH;
  private activePoolIndex = -1;
  private nextBuffer: Float64Array | null = null;
  private nextFrameCount = 0;
  private nextPoolIndex = -1;
  private nextForceData: Float64Array | null = null;
  private nextPoincarePoints: PoincarePoint[] | null = null;
  private pendingBatch = false;
  private pendingPoolIndex = -1;
  /** 批次序列号——每次 requestNextBatch 递增，handleMessage 中校验以防御 Worker 超时后旧批次竞态 */
  private batchSequence = 0;
  /** 当前等待中的批次序列号（-1 表示无挂起批次） */
  private pendingSequence = -1;

  // 生命周期
  private _running = false;
  private rafId = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  // 回调
  private readyCallbacks: Array<() => void> = [];
  private poincareCondition: PoincareSectionCondition | null = null;
  private poincareCallbacks: Array<(pts: PoincarePoint[]) => void> = [];
  private externalTick = false;
  private prefetchCallback: (() => void) | null = null;
  private discardNextBatch = false;

  // 插值快照
  private prevSnapshot: InterpSnapshot | null = null;
  private currSnapshot: InterpSnapshot | null = null;

  // delta 累积
  private tickAcc = 0;

  constructor(
    workerGateway: IWorkerGateway,
    pool: IFloat64Pool,
    recoveryPolicy: IWorkerRecoveryPolicy,
  ) {
    super(workerGateway, pool, recoveryPolicy);
    this.workerGateway.onMessage((resp) => this.handleMessage(resp));
  }

  // ═══ 抽象方法 (ISimulationScheduler) ═══

  override pause(): void {
    this._running = false;
    this.cancelLoop();
    this.cancelTimer();
  }

  override resume(): void {
    if (this._running) return;
    this._running = true;
    if (!this.externalTick) this.rafId = requestAnimationFrame(() => this.loop());
  }

  override destroy(): void {
    this.pause();
    this.releaseBuffers();
    this.activeIndex = 0;
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.pendingBatch = false;
    this.recoveryPolicy.resetCounter();
    this.poincareCondition = null;
    this.prevSnapshot = null;
    this.currSnapshot = null;
    this.workerGateway.destroy();
  }

  override reset(ic: InitialConditions, simTime?: number): void {
    this.releaseBuffers();
    this.activeIndex = 0;
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.pendingBatch = false;
    this.prevSnapshot = null;
    this.currSnapshot = null;
    this.workerGateway.sendReset(ic, simTime);
  }

  override updateParams(params: Partial<PendulumParams>): void {
    this.workerGateway.sendUpdateParams(params);
  }

  override setMethod(method: IntegratorMethod): void {
    this.workerGateway.sendMethod(method);
  }

  override setDirection(direction: 1 | -1): void {
    this.workerGateway.sendDirection(direction);
  }

  override setPoincareCondition(cond: PoincareSectionCondition | null): void {
    this.poincareCondition = cond;
  }

  override enableExternalTick(): void {
    this.externalTick = true;
    this.cancelLoop();
  }

  override disableExternalTick(): void {
    this.externalTick = false;
  }

  override tick(): boolean {
    if (!this._running) return false;
    return this.consumeOneFrame();
  }

  override tickDelta(delta: number): number {
    if (!this._running) return 0;
    this.tickAcc += delta;
    let consumed = 0;
    while (this.tickAcc >= TICK_DT && consumed < MAX_TICKS_PER_FRAME) {
      if (this.consumeOneFrame()) { this.tickAcc -= TICK_DT; consumed++; }
      else break;
    }
    return consumed;
  }

  override getInterpolationFrames(): { prev: InterpSnapshot | null; curr: InterpSnapshot | null } {
    return { prev: this.prevSnapshot, curr: this.currSnapshot };
  }

  override get isRunning(): boolean { return this._running; }

  override onReady(cb: () => void): void { this.readyCallbacks.push(cb); }

  override onPoincarePoints(cb: (pts: PoincarePoint[]) => void): () => void {
    this.poincareCallbacks.push(cb);
    return () => {
      const idx = this.poincareCallbacks.indexOf(cb);
      if (idx !== -1) this.poincareCallbacks.splice(idx, 1);
    };
  }

  // ═══ 钩子 (ISimulationScheduler protected abstract) ═══

  protected override onStart(): void {
    this._running = true;
    this.recoveryPolicy.resetCounter();
    commandBus.emit({ type: "history:clear" });
    this.prevSnapshot = null;
    this.currSnapshot = null;
    if (!this.externalTick) this.rafId = requestAnimationFrame(() => this.loop());
  }

  protected override _do_requestBatch(): void { this.requestNextBatch(); }

  protected override _do_handleBatch(buffer: Float64Array, frameCount: number): void {
    if (this.activeBuffer !== null && this.activeIndex < FRAMES_PER_BATCH) {
      if (this.nextBuffer) this.pool.release(this.nextPoolIndex, this.nextBuffer);
      this.nextBuffer = buffer;
      this.nextFrameCount = frameCount;
      this.nextPoolIndex = this.pendingPoolIndex;
      this.pendingPoolIndex = -1;
    }
  }

  protected override discardBuffers(): void {
    this.releaseBuffers();
    this.activeIndex = 0;
    this.cancelTimer();
    this.pendingBatch = false;
    if (this.pendingPoolIndex >= 0) {
      this.pool.release(this.pendingPoolIndex);
      this.pendingPoolIndex = -1;
    }
  }

  // ═══ 扩展方法 ═══

  /** 注入外部已创建的 Worker 实例（向后兼容 useBootSequence） */
  injectWorker(worker: Worker): void {
    this.workerGateway.injectWorker(worker);
    worker.onerror = (event) => this.handleCrash(event);
  }

  /** 开关力计算 */
  setComputeForces(active: boolean): void {
    this.workerGateway.sendConfig(active);
  }

  /** 暂停态下预取一批数据，完成后回调 onDone */
  prefetchBatch(onDone: () => void): void {
    this.releaseBuffers();
    this.activeIndex = 0;
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.cancelTimer();
    this.prefetchCallback = onDone;

    if (this.pendingBatch) { this.discardNextBatch = true; return; }
    this.requestNextBatch();
  }

  // ═══ Worker 消息处理 ═══

  private handleMessage(resp: WorkerResponse): void {
    switch (resp.type) {
      case "ready": {
        for (const cb of this.readyCallbacks) cb();
        this.cancelTimer();
        if (this._running) this.requestNextBatch();
        break;
      }
      case "batchReady": {
        // 序列号校验：防御超时后旧 Worker 的 batchReady 在新批次到达后污染缓冲
        if (this.pendingSequence >= 0 && this.pendingSequence !== this.batchSequence) {
          // 过期批次——归还 buffer 并静默丢弃
          this.pool.release(this.pendingPoolIndex, resp.buffer);
          this.pendingPoolIndex = -1;
          return;
        }
        if (!this.pendingBatch && !this.timeoutId && this.activeBuffer === null) return;
        this.cancelTimer();

        // 性能测量
        if (typeof performance?.mark === "function") {
          try {
            performance.mark("worker-step-end");
            const m = performance.measure("worker-step", "worker-step-start", "worker-step-end");
            observabilityCoordinator.recordWorkerLatency(m.duration);
            performance.clearMarks("worker-step-start");
            performance.clearMarks("worker-step-end");
          } catch { /* 静默 */ }
        }

        this.pendingBatch = false;
        this.pendingSequence = -1;
        const idx = this.pendingPoolIndex;
        this.pendingPoolIndex = -1;

        // 丢弃正向后续发反向
        if (this.discardNextBatch) {
          this.discardNextBatch = false;
          this.pool.release(idx, resp.buffer);
          this.requestNextBatch();
          return;
        }

        // 元数据
        if (resp.energyCorrection !== undefined) {
          commandBus.emit({ type: "worker:batchReady", energyCorrection: resp.energyCorrection });
        }
        if (resp.lyapunovExponent !== undefined) {
          commandBus.emit({ type: "worker:batchReady", lyapunovExponent: resp.lyapunovExponent });
        }

        // 双缓冲
        if (this.activeBuffer !== null && this.activeIndex < FRAMES_PER_BATCH) {
          if (this.nextBuffer) this.pool.release(this.nextPoolIndex, this.nextBuffer);
          this.nextBuffer = resp.buffer;
          this.nextFrameCount = resp.frameCount;
          this.nextPoolIndex = idx;
          this.nextForceData = resp.forceData ?? null;
          this.nextPoincarePoints = resp.poincarePoints ?? null;
        } else {
          if (this.activeBuffer) this.pool.release(this.activePoolIndex, this.activeBuffer);
          this.activeBuffer = resp.buffer;
          this.activeIndex = 0;
          this.activeFrameCount = resp.frameCount;
          this.activePoolIndex = idx;

          if (resp.forceData) {
            commandBus.emit({ type: "lab:forceData", data: resp.forceData, extrema: resp.forceExtrema });
          }
          if (resp.poincarePoints && resp.poincarePoints.length > 0) {
            for (const cb of this.poincareCallbacks) cb(resp.poincarePoints);
          }
          this.flushDelayed();
        }

        if (resp.frameCount < FRAMES_PER_BATCH) {
          console.warn(`[scheduler] 部分批次: ${resp.frameCount}/${FRAMES_PER_BATCH} 帧, t=${resp.simTime.toFixed(2)}`);
        }

        if (this.prefetchCallback) {
          const cb = this.prefetchCallback;
          this.prefetchCallback = null;
          cb();
        }
        break;
      }
      case "error": {
        this.pendingBatch = false;
        this.pendingPoolIndex = -1;
        this.cancelTimer();
        if (typeof performance?.clearMarks === "function") {
          try { performance.clearMarks("worker-step-start"); performance.clearMarks("worker-step-end"); }
          catch { /* 静默 */ }
        }
        commandBus.emit({ type: "worker:error", code: resp.code, message: resp.message, simTime: resp.simTime });
        if (resp.code === "DIVERGED") this._running = false;
        break;
      }
    }
  }

  // ═══ 崩溃恢复 ═══

  private handleCrash(cause: ErrorEvent | Error): void {
    const causeMsg = cause instanceof ErrorEvent
      ? `Worker 错误: ${cause.message}`
      : cause.message;
    console.error("[scheduler] Worker 崩溃:", causeMsg);

    const s = useRootStore.getState();
    const params: PendulumParams = { ...s.params };
    const ic: InitialConditions = {
      theta1: s.state.theta1, theta1Dot: s.state.omega1,
      theta2: s.state.theta2, theta2Dot: s.state.omega2,
    };

    this.releaseBuffers();
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.pendingSequence = -1;

    try {
      this.recoveryPolicy.recover(params, ic, s.method);
      this.pendingBatch = false;
      this.activeIndex = 0;
      commandBus.emit({ type: "engine:recovered", message: "仿真引擎已自动恢复" });
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "WorkerCrashError") {
          commandBus.emit({ type: "worker:crash", event: new ErrorEvent("error", { message: causeMsg }) });
        } else {
          commandBus.emit({ type: "worker:crash", event: new ErrorEvent("error", { message: `恢复失败: ${e.message}` }) });
        }
        this._running = false;
      }
    }
  }

  // ═══ 帧调度 ═══

  private loop(): void {
    this.consumeOneFrame();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private consumeOneFrame(): boolean {
    if (this.activeBuffer) {
      if (this.currSnapshot) this.prevSnapshot = { ...this.currSnapshot };

      const off = this.activeIndex * FRAME_STRIDE;
      commandBus.emit({ type: "frame:consume", buffer: this.activeBuffer, frameIndex: this.activeIndex });
      commandBus.emit({
        type: "history:push",
        state: {
          theta1: this.activeBuffer[off + FrameField.THETA1]!,
          omega1: this.activeBuffer[off + FrameField.THETA1_DOT]!,
          theta2: this.activeBuffer[off + FrameField.THETA2]!,
          omega2: this.activeBuffer[off + FrameField.THETA2_DOT]!,
        },
      });

      this.currSnapshot = {
        x1: this.activeBuffer[off + FrameField.X1]!,
        y1: this.activeBuffer[off + FrameField.Y1]!,
        x2: this.activeBuffer[off + FrameField.X2]!,
        y2: this.activeBuffer[off + FrameField.Y2]!,
      };

      this.activeIndex++;

      if (this.activeIndex >= BATCH_PREFETCH_THRESHOLD && !this.pendingBatch && !this.nextBuffer) {
        this.requestNextBatch();
      }

      if (this.activeIndex >= this.activeFrameCount) {
        this.pool.release(this.activePoolIndex, this.activeBuffer);
        if (this.nextBuffer) {
          this.activeBuffer = this.nextBuffer;
          this.activeIndex = 0;
          this.activeFrameCount = this.nextFrameCount;
          this.activePoolIndex = this.nextPoolIndex;
          this.nextBuffer = null;
          this.nextPoolIndex = -1;
          this.flushDelayed();
          if (this.activeIndex < BATCH_PREFETCH_THRESHOLD && !this.pendingBatch) this.requestNextBatch();
        } else {
          this.activeBuffer = null;
          this.activeIndex = 0;
          this.activeFrameCount = FRAMES_PER_BATCH;
          this.activePoolIndex = -1;
        }
      }
      return true;
    } else if (!this.pendingBatch) {
      this.requestNextBatch();
    }
    return false;
  }

  private requestNextBatch(): void {
    if (this.pendingBatch) return;
    const slot = this.pool.acquire();
    if (!slot) return;

    const seq = ++this.batchSequence;
    this.pendingBatch = true;
    this.pendingPoolIndex = slot.index;
    this.pendingSequence = seq;

    if (typeof performance?.mark === "function") {
      try { performance.mark("worker-step-start"); } catch { /* 静默 */ }
    }

    this.workerGateway.sendStep(slot.buffer, this.poincareCondition);

    this.timeoutId = setTimeout(() => {
      console.error("[scheduler] Worker 积分超时 2s");
      // 仅当序列号匹配时才处理超时（防御旧超时在新批次已到达后触发）
      if (this.pendingSequence !== seq) return;
      this.pendingBatch = false;
      this.pendingSequence = -1;
      this.pendingPoolIndex = -1;
      this.pool.release(slot.index);
      // 使用 WorkerCrashError 而非 ErrorEvent，确保 catch 块中 instanceof Error 正确匹配
      this.handleCrash(new Error("Worker 积分超时 2s"));
    }, TIMEOUT_MS);
  }

  // ═══ 工具 ═══

  private flushDelayed(): void {
    if (this.nextForceData) {
      commandBus.emit({ type: "lab:forceData", data: this.nextForceData });
      this.nextForceData = null;
    }
    if (this.nextPoincarePoints && this.nextPoincarePoints.length > 0) {
      for (const cb of this.poincareCallbacks) cb(this.nextPoincarePoints);
      this.nextPoincarePoints = null;
    }
  }

  private releaseBuffers(): void {
    if (this.activeBuffer) { this.pool.release(this.activePoolIndex, this.activeBuffer); this.activeBuffer = null; this.activePoolIndex = -1; }
    if (this.nextBuffer) { this.pool.release(this.nextPoolIndex, this.nextBuffer); this.nextBuffer = null; this.nextPoolIndex = -1; }
    this.pendingSequence = -1;
  }

  private cancelLoop(): void { if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; } }

  private cancelTimer(): void { if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; } }
}

// 工厂函数见 scheduler-factory.ts（分离以避免循环依赖：factory 依赖 scheduler 类）
