import type {
  WorkerCommand,
  WorkerResponse,
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
} from "@/shared/types";
import { FRAMES_PER_BATCH } from "@/shared/types";
import { Float64Pool } from "./float64-pool";
import { useSimulationStore, BATCH_PREFETCH_THRESHOLD } from "../store";

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

  constructor() {
    this.pool = new Float64Pool();
  }

  // ─── 公开 API ────────────────────────────────

  /** 启动仿真：创建 Worker、初始化、开始帧循环 */
  start(
    params: PendulumParams,
    initialConditions: InitialConditions,
    method: IntegratorMethod,
  ): void {
    if (this.running) return;
    this.running = true;

    this.createWorker();
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

  private send(cmd: WorkerCommand): void {
    if (!this.worker) return;
    if (cmd.type === "step") {
      // 带 Transferable 发送
      this.worker.postMessage(cmd, [cmd.buffer.buffer]);
    } else {
      this.worker.postMessage(cmd);
    }
  }

  private handleWorkerMessage(resp: WorkerResponse): void {
    const store = useSimulationStore.getState();

    switch (resp.type) {
      case "ready": {
        // Worker 就绪，请求第一批
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        this.requestNextBatch();
        break;
      }

      case "batchReady": {
        // 清除超时
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }

        this.currentBuffer = resp.buffer;
        this.consumeIndex = 0;
        this.pendingBatch = false;

        // 如果帧数不满（发散前批），处理错误
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

    // 归还当前 buffer
    if (this.currentBuffer) {
      this.pool.releaseBuffer(this.currentBuffer);
      this.currentBuffer = null;
    }

    // 重建 Worker 并恢复
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

    useSimulationStore.setState({ engineError: null });
    console.info("[scheduler] 仿真引擎已自动恢复");
  }

  // ─── 帧调度循环 ─────────────────────────────

  private loop(): void {
    if (!this.running) return;

    const store = useSimulationStore.getState();

    if (this.currentBuffer) {
      // 消费一帧
      store.consumeFrameFromBuffer(this.currentBuffer, this.consumeIndex);
      this.consumeIndex++;

      // 80% 耗尽时触发下一批
      if (this.consumeIndex >= BATCH_PREFETCH_THRESHOLD && !this.pendingBatch) {
        this.requestNextBatch();
      }

      // 消费完毕，归还 buffer
      if (this.consumeIndex >= FRAMES_PER_BATCH) {
        this.pool.releaseBuffer(this.currentBuffer);
        this.currentBuffer = null;
        this.consumeIndex = 0;
      }
    } else if (!this.pendingBatch) {
      // 初始状态：还没有 buffer，请求第一批
      this.requestNextBatch();
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private requestNextBatch(): void {
    if (this.pendingBatch || !this.worker) return;

    const slot = this.pool.acquire();
    if (!slot) {
      // 池耗尽，下一帧重试（已在 loop 中处理）
      return;
    }

    this.pendingBatch = true;

    this.worker.postMessage(
      { type: "step", buffer: slot.buffer },
      [slot.buffer.buffer],
    );

    // 设置超时
    this.timeoutId = setTimeout(() => {
      console.error("[scheduler] Worker 积分超时 2s");
      this.pendingBatch = false;
      // 归还脏 buffer
      this.pool.release(slot.index);
      // 触发崩溃恢复
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
