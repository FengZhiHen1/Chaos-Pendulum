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
import { observabilityCoordinator } from "@/shared/lib/observability";

const TIMEOUT_MS = 2000;
const MAX_CRASH_RECOVERY = 1;

export class SimulationScheduler {
  private worker: Worker | null = null;
  private pool: Float64Pool;
  private currentBuffer: Float64Array | null = null;
  private consumeIndex = 0;
  private pendingBatch = false;
  private rafId = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private crashCount = 0;
  private running = false;
  private readyCallbacks: Array<() => void> = [];
  private poincareCondition: PoincareSectionCondition | null = null;
  private poincareCallbacks: Array<(pts: PoincarePoint[]) => void> = [];

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
    clearSimulationHistory();
    this.send({
      type: "init",
      params,
      initialConditions,
      method,
    });
    this.rafId = requestAnimationFrame(() => this.loop());
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
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  /** 停止并销毁 */
  destroy(): void {
    this.pause();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.currentBuffer = null;
    this.consumeIndex = 0;
    this.pendingBatch = false;
    this.crashCount = 0;
    this.poincareCondition = null;
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

  /** 重置仿真 */
  reset(initialConditions: InitialConditions): void {
    this.consumeIndex = 0;
    this.currentBuffer = null;
    this.pendingBatch = false;
    this.send({ type: "reset", initialConditions });
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
        this.requestNextBatch();
        break;
      }

      case "batchReady": {
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

        this.currentBuffer = resp.buffer;
        this.consumeIndex = 0;
        this.pendingBatch = false;

        // 转发庞加莱截面点
        if (resp.poincarePoints && resp.poincarePoints.length > 0) {
          for (const cb of this.poincareCallbacks) cb(resp.poincarePoints);
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

    if (this.currentBuffer) {
      this.pool.releaseBuffer(this.currentBuffer);
      this.currentBuffer = null;
    }

    this.worker?.terminate();
    this.createWorker();
    this.pendingBatch = false;
    this.consumeIndex = 0;

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
    if (!this.running) return;

    const store = useSimulationStore.getState();

    if (this.currentBuffer) {
      store.consumeFrameFromBuffer(this.currentBuffer, this.consumeIndex);
      pushSimulationHistory(useSimulationStore.getState().state);
      this.consumeIndex++;

      if (this.consumeIndex >= BATCH_PREFETCH_THRESHOLD && !this.pendingBatch) {
        this.requestNextBatch();
      }

      if (this.consumeIndex >= FRAMES_PER_BATCH) {
        this.pool.releaseBuffer(this.currentBuffer);
        this.currentBuffer = null;
        this.consumeIndex = 0;
      }
    } else if (!this.pendingBatch) {
      this.requestNextBatch();
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private requestNextBatch(): void {
    if (this.pendingBatch || !this.worker) return;

    const slot = this.pool.acquire();
    if (!slot) {
      return;
    }

    this.pendingBatch = true;

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
      if (this.currentBuffer === slot.buffer) {
        this.currentBuffer = null;
      }
      this.pool.release(slot.index);
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
