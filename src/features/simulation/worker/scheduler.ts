import type {
  WorkerResponse,
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  PoincareSectionCondition,
  PoincarePoint,
} from "@/shared/types";
import { FRAMES_PER_BATCH } from "@/shared/types";
import { Float64Pool } from "./float64-pool";
import { useSimulationStore, BATCH_PREFETCH_THRESHOLD } from "../store";
import { pushSimulationHistory, clearSimulationHistory } from "../history";
import { useLabStore } from "@/features/lab/store";
import { observabilityCoordinator } from "@/shared/lib/observability";

const TIMEOUT_MS = 2000;
const MAX_CRASH_RECOVERY = 1;

/** 供渲染层插值使用的坐标快照 */
export interface InterpSnapshot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export class SimulationScheduler {
  private worker: Worker | null = null;
  private pool: Float64Pool;
  /** 当前正在消费的缓冲区 */
  private activeBuffer: Float64Array | null = null;
  /** activeBuffer 的消费位置 */
  private activeIndex = 0;
  /** activeBuffer 的实际帧数（通常 = FRAMES_PER_BATCH，末批可能更少） */
  private activeFrameCount = FRAMES_PER_BATCH;
  /** activeBuffer 对应的池槽位索引，用于归还 */
  private activePoolIndex = -1;
  /** 提前到达的下一批次缓冲区（等待 activeBuffer 消费完毕后提升） */
  private nextBuffer: Float64Array | null = null;
  /** nextBuffer 的帧数 */
  private nextFrameCount = 0;
  /** nextBuffer 对应的池槽位索引 */
  private nextPoolIndex = -1;
  /** nextBuffer 关联的力数据（延迟转发到 labStore） */
  private nextForceData: Float64Array | null = null;
  /** nextBuffer 关联的庞加莱截面点（延迟转发） */
  private nextPoincarePoints: PoincarePoint[] | null = null;
  private pendingBatch = false;
  /** 当前 pending 请求使用的池槽位索引 */
  private pendingPoolIndex = -1;
  private rafId = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private crashCount = 0;
  private running = false;
  private readyCallbacks: Array<() => void> = [];
  private poincareCondition: PoincareSectionCondition | null = null;
  private poincareCallbacks: Array<(pts: PoincarePoint[]) => void> = [];
  private externalTick = false;

  // 渲染插值用的前后帧快照（由 consumeOneFrame 维护）
  private prevSnapshot: InterpSnapshot | null = null;
  private currSnapshot: InterpSnapshot | null = null;

  constructor() {
    this.pool = new Float64Pool();
  }

  /** 注册 Worker ready 回调 */
  onReady(cb: () => void): void {
    this.readyCallbacks.push(cb);
  }

  /** 注册庞加莱截面点到达回调，返回取消注册函数 */
  onPoincarePoints(cb: (pts: PoincarePoint[]) => void): () => void {
    this.poincareCallbacks.push(cb);
    return () => {
      const idx = this.poincareCallbacks.indexOf(cb);
      if (idx !== -1) this.poincareCallbacks.splice(idx, 1);
    };
  }

  /** 设置当前庞加莱截面条件 */
  setPoincareCondition(cond: PoincareSectionCondition | null): void {
    this.poincareCondition = cond;
  }

  /** 启用外部 tick 模式：start/resume 不再启动内部 rAF，由渲染层驱动 */
  enableExternalTick(): void {
    this.externalTick = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** 禁用外部 tick 模式，恢复内部 rAF 循环 */
  disableExternalTick(): void {
    this.externalTick = false;
  }

  // ─── 公开 API ────────────────────────────────

  /** 注入外部已创建的 Worker 实例（供 SYS-04 启动流程使用） */
  injectWorker(worker: Worker): void {
    if (this.worker) {
      this.worker.terminate();
    }
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(e.data);
    };
    this.worker.onerror = (event) => {
      this.handleWorkerCrash(event);
    };
  }

  /** 启动仿真 */
  start(
    params: PendulumParams,
    initialConditions: InitialConditions,
    method: IntegratorMethod,
  ): void {
    if (this.running) return;
    this.running = true;

    if (!this.worker) {
      this.createWorker();
    }

    // 丢弃 reset 阶段预取的旧批次，避免与 init 后的新批次产生位置跳跃
    if (this.activeBuffer) {
      this.pool.release(this.activePoolIndex, this.activeBuffer);
      this.activeBuffer = null;
      this.activePoolIndex = -1;
    }
    if (this.nextBuffer) {
      this.pool.release(this.nextPoolIndex, this.nextBuffer);
      this.nextBuffer = null;
      this.nextPoolIndex = -1;
    }
    this.activeIndex = 0;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pendingBatch = false;
    if (this.pendingPoolIndex >= 0) {
      this.pool.release(this.pendingPoolIndex);
      this.pendingPoolIndex = -1;
    }

    clearSimulationHistory();
    this.prevSnapshot = null;
    this.currSnapshot = null;
    this.send({
      type: "init",
      params,
      initialConditions,
      method,
    });
    if (!this.externalTick) {
      this.rafId = requestAnimationFrame(() => this.loop());
    }
  }

  /** 暂停仿真 */
  pause(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /** 恢复仿真 */
  resume(): void {
    if (this.running || !this.worker) return;
    this.running = true;
    if (!this.externalTick) {
      this.rafId = requestAnimationFrame(() => this.loop());
    }
  }

  /** 停止并销毁 */
  destroy(): void {
    this.pause();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.activeBuffer) {
      this.pool.release(this.activePoolIndex);
      this.activeBuffer = null;
      this.activePoolIndex = -1;
    }
    if (this.nextBuffer) {
      this.pool.release(this.nextPoolIndex);
      this.nextBuffer = null;
      this.nextPoolIndex = -1;
    }
    if (this.pendingPoolIndex >= 0) {
      this.pool.release(this.pendingPoolIndex);
      this.pendingPoolIndex = -1;
    }
    this.activeIndex = 0;
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.pendingBatch = false;
    this.crashCount = 0;
    this.poincareCondition = null;
    this.prevSnapshot = null;
    this.currSnapshot = null;
  }

  /** 更新物理参数 */
  updateParams(params: Partial<PendulumParams>): void {
    this.send({ type: "updateParams", params });
  }

  /** 更改积分方法 */
  setMethod(method: IntegratorMethod): void {
    this.send({ type: "setMethod", method });
  }

  /** 切换积分方向 */
  setDirection(direction: 1 | -1): void {
    this.send({ type: "setDirection", direction });
  }

  /** 开关力计算（LAB-01 受力分析） */
  setComputeForces(active: boolean): void {
    this.send({ type: "config", computeForces: active });
  }

  /** 重置仿真 */
  reset(initialConditions: InitialConditions): void {
    if (this.activeBuffer) {
      this.pool.release(this.activePoolIndex);
      this.activeBuffer = null;
      this.activePoolIndex = -1;
    }
    if (this.nextBuffer) {
      this.pool.release(this.nextPoolIndex);
      this.nextBuffer = null;
      this.nextPoolIndex = -1;
    }
    if (this.pendingPoolIndex >= 0) {
      this.pool.release(this.pendingPoolIndex);
      this.pendingPoolIndex = -1;
    }
    this.activeIndex = 0;
    this.nextForceData = null;
    this.nextPoincarePoints = null;
    this.pendingBatch = false;
    this.prevSnapshot = null;
    this.currSnapshot = null;
    this.send({ type: "reset", initialConditions });
  }

  /** 外部驱动：消费一帧数据（external tick 模式下由 useFrame 调用）。
   * @returns 是否实际消费了一帧（activeBuffer 非空时消费成功） */
  tick(): boolean {
    if (!this.running) return false;
    return this.consumeOneFrame();
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─── 内部实现 ────────────────────────────────

  private createWorker(): void {
    if (this.worker) {
      this.worker.terminate();
    }
    this.worker = new Worker(
      new URL("./ode-worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(e.data);
    };

    this.worker.onerror = (event) => {
      this.handleWorkerCrash(event);
    };
  }

  private send(cmd: {
    type: string;
    buffer?: Float64Array;
    poincare?: PoincareSectionCondition | null;
    [key: string]: unknown;
  }): void {
    if (!this.worker) return;
    if (cmd.type === "step" && cmd.buffer) {
      this.worker.postMessage(cmd, [cmd.buffer.buffer]);
    } else {
      this.worker.postMessage(cmd);
    }
  }

  private handleWorkerMessage(resp: WorkerResponse): void {
    const store = useSimulationStore.getState();

    switch (resp.type) {
      case "ready": {
        for (const cb of this.readyCallbacks) cb();
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        // 仅在仿真运行中才预取批次，避免暂停态产生无用批次
        if (this.running) {
          this.requestNextBatch();
        }
        break;
      }

      case "batchReady": {
        // 丢弃过期批次：reset() 清空了 pendingBatch / timeoutId / activeBuffer，
        // 旧 Worker 残余批次在 activeBuffer===null 时到达说明调度器已重置，不应激活
        if (!this.pendingBatch && !this.timeoutId && this.activeBuffer === null) {
          return;
        }

        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }

        if (typeof performance?.mark === "function") {
          try {
            performance.mark("worker-step-end");
            const m = performance.measure("worker-step", "worker-step-start", "worker-step-end");
            observabilityCoordinator.recordWorkerLatency(m.duration);
            performance.clearMarks("worker-step-start");
            performance.clearMarks("worker-step-end");
          } catch { /* 静默忽略 */ }
        }

        this.pendingBatch = false;
        const completedPoolIndex = this.pendingPoolIndex;
        this.pendingPoolIndex = -1;

        if (resp.energyCorrection !== undefined) {
          useSimulationStore.setState({ energyCorrection: resp.energyCorrection });
        }
        if (resp.lyapunovExponent !== undefined) {
          useSimulationStore.setState({ lyapunovExponent: resp.lyapunovExponent });
        }

        // 双缓冲：若 activeBuffer 仍在消费中，新批次暂存到 nextBuffer
        if (this.activeBuffer !== null && this.activeIndex < FRAMES_PER_BATCH) {
          // 旧批次仍有未消费帧 → 暂存新批次，不覆盖
          if (this.nextBuffer) {
            this.pool.release(this.nextPoolIndex, this.nextBuffer);
          }
          this.nextBuffer = resp.buffer;
          this.nextFrameCount = resp.frameCount;
          this.nextPoolIndex = completedPoolIndex;
          this.nextForceData = resp.forceData ?? null;
          this.nextPoincarePoints = resp.poincarePoints ?? null;
        } else {
          // 旧批次已消费完毕（或无活跃批次）→ 直接激活新批次
          if (this.activeBuffer) {
            this.pool.release(this.activePoolIndex, this.activeBuffer);
          }
          this.activeBuffer = resp.buffer;
          this.activeIndex = 0;
          this.activeFrameCount = resp.frameCount;
          this.activePoolIndex = completedPoolIndex;

          // 转发力数据到 labStore
          if (resp.forceData) {
            const labStore = useLabStore.getState();
            labStore.setLastForceData(resp.forceData);
            if (resp.forceExtrema) {
              labStore.setForceExtrema(resp.forceExtrema);
            }
          }

          // 转发庞加莱截面点
          if (resp.poincarePoints && resp.poincarePoints.length > 0) {
            for (const cb of this.poincareCallbacks) cb(resp.poincarePoints);
          }
        }

        // 力极值是全局累积值，无论哪个批次都立即更新
        if (resp.forceExtrema && !resp.forceData) {
          useLabStore.getState().setForceExtrema(resp.forceExtrema);
        }

        if (resp.frameCount < FRAMES_PER_BATCH) {
          console.warn(
            `[scheduler] 收到部分批次: ${resp.frameCount}/${FRAMES_PER_BATCH} 帧, simTime=${resp.simTime.toFixed(2)}`,
          );
        }
        break;
      }

      case "error": {
        this.pendingBatch = false;
        this.pendingPoolIndex = -1;
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        if (typeof performance?.clearMarks === "function") {
          try {
            performance.clearMarks("worker-step-start");
            performance.clearMarks("worker-step-end");
          } catch { /* 静默 */ }
        }
        useSimulationStore.setState({ engineError: resp.message });

        if (resp.code === "DIVERGED") {
          store.setRunning(false);
          this.running = false;
        }
        break;
      }
    }
  }

  private handleWorkerCrash(event: ErrorEvent): void {
    console.error("[scheduler] Worker 崩溃", event);

    if (this.crashCount >= MAX_CRASH_RECOVERY) {
      console.error("[scheduler] 连续崩溃，停止重建");
      useSimulationStore.setState({
        engineError: "仿真引擎崩溃，请刷新页面",
        isRunning: false,
      });
      this.running = false;
      return;
    }

    this.crashCount++;
    const store = useSimulationStore.getState();

    if (this.activeBuffer) {
      this.pool.release(this.activePoolIndex);
      this.activeBuffer = null;
      this.activePoolIndex = -1;
    }
    if (this.nextBuffer) {
      this.pool.release(this.nextPoolIndex);
      this.nextBuffer = null;
      this.nextPoolIndex = -1;
    }
    if (this.pendingPoolIndex >= 0) {
      this.pool.release(this.pendingPoolIndex);
      this.pendingPoolIndex = -1;
    }
    this.nextForceData = null;
    this.nextPoincarePoints = null;

    this.worker?.terminate();
    this.createWorker();
    this.pendingBatch = false;
    this.activeIndex = 0;

    this.send({
      type: "init",
      params: store.params,
      initialConditions: {
        theta1: store.theta1,
        theta1Dot: store.theta1Dot,
        theta2: store.theta2,
        theta2Dot: store.theta2Dot,
      },
      method: store.method,
    });

    useSimulationStore.setState({
      engineError: null,
      engineEvent: { type: "recovered", message: "仿真引擎已自动恢复" },
    });
  }

  // ─── 帧调度循环 ─────────────────────────────

  private loop(): void {
    this.consumeOneFrame();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  /** 消费一帧数据（内部 rAF 和外部 tick 共用）。
   * @returns 是否实际消费了一帧 */
  private consumeOneFrame(): boolean {
    const store = useSimulationStore.getState();

    if (this.activeBuffer) {
      // 将当前快照降级为前一帧快照
      if (this.currSnapshot) {
        this.prevSnapshot = { ...this.currSnapshot };
      }

      store.consumeFrameFromBuffer(this.activeBuffer, this.activeIndex);
      pushSimulationHistory(useSimulationStore.getState().state);
      this.activeIndex++;

      // 从更新后的 store 读取新的当前快照
      const s = useSimulationStore.getState();
      this.currSnapshot = {
        x1: s.x1,
        y1: s.y1,
        x2: s.x2,
        y2: s.y2,
      };

      if (this.activeIndex >= BATCH_PREFETCH_THRESHOLD && !this.pendingBatch && !this.nextBuffer) {
        this.requestNextBatch();
      }

      if (this.activeIndex >= this.activeFrameCount) {
        // 归还旧缓冲区到池，同时传入新的 buffer 引用以更新池槽位
        this.pool.release(this.activePoolIndex, this.activeBuffer);

        // 提升 nextBuffer 为 activeBuffer（若存在）
        if (this.nextBuffer) {
          this.activeBuffer = this.nextBuffer;
          this.activeIndex = 0;
          this.activeFrameCount = this.nextFrameCount;
          this.activePoolIndex = this.nextPoolIndex;
          this.nextBuffer = null;
          this.nextPoolIndex = -1;

          // 转发延迟的力数据
          if (this.nextForceData) {
            const labStore = useLabStore.getState();
            labStore.setLastForceData(this.nextForceData);
            this.nextForceData = null;
          }

          // 转发延迟的庞加莱截面点
          if (this.nextPoincarePoints && this.nextPoincarePoints.length > 0) {
            for (const cb of this.poincareCallbacks) cb(this.nextPoincarePoints);
            this.nextPoincarePoints = null;
          }

          // 若新批次消费到阈值且有空间预取下一批
          if (this.activeIndex < BATCH_PREFETCH_THRESHOLD && !this.pendingBatch) {
            this.requestNextBatch();
          }
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

  /** 获取供渲染插值用的前后帧快照 */
  getInterpolationFrames(): { prev: InterpSnapshot | null; curr: InterpSnapshot | null } {
    return { prev: this.prevSnapshot, curr: this.currSnapshot };
  }

  private requestNextBatch(): void {
    if (this.pendingBatch || !this.worker) return;

    const slot = this.pool.acquire();
    if (!slot) {
      return;
    }

    this.pendingBatch = true;
    this.pendingPoolIndex = slot.index;

    if (typeof performance?.mark === "function") {
      try {
        performance.mark("worker-step-start");
      } catch { /* 静默 */ }
    }

    this.worker.postMessage(
      {
        type: "step",
        buffer: slot.buffer,
        poincare: this.poincareCondition,
      },
      [slot.buffer.buffer],
    );

    this.timeoutId = setTimeout(() => {
      console.error("[scheduler] Worker 积分超时 2s");
      this.pendingBatch = false;
      // 超时的 buffer 已被 transfer 到 Worker，Worker 已无响应，槽位作废
      this.pool.release(slot.index);
      this.pendingPoolIndex = -1;
      this.handleWorkerCrash(new ErrorEvent("timeout"));
    }, TIMEOUT_MS);
  }
}

/** 全局单例 */
let globalScheduler: SimulationScheduler | null = null;

export function getScheduler(): SimulationScheduler {
  if (!globalScheduler) {
    globalScheduler = new SimulationScheduler();
  }
  return globalScheduler;
}
