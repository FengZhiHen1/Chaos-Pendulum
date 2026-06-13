import { Float64Pool } from "./float64-pool";
import { WorkerGateway } from "./worker-gateway";
import { DefaultWorkerRecoveryPolicy } from "./worker-recovery";
import { SimulationScheduler } from "./scheduler";
import { getGlobalWorker, releaseGlobalWorker } from "./createOdeWorker";

/**
 * 崩溃恢复使用的同步 Worker 工厂。
 * 崩溃恢复需同步创建 Worker 并立即发送 init，不等待 ready 消息。
 */
function createSyncWorker(): Worker {
  return new Worker(
    new URL("./ode-worker.ts", import.meta.url),
    { type: "module" },
  );
}

let globalScheduler: SimulationScheduler | null = null;

/** 获取全局 SimulationScheduler 单例 */
export function getScheduler(): SimulationScheduler {
  if (!globalScheduler) {
    const gateway = new WorkerGateway();
    const pool = new Float64Pool();
    const recovery = new DefaultWorkerRecoveryPolicy(1, gateway, createSyncWorker);
    globalScheduler = new SimulationScheduler(gateway, pool, recovery);

    // 复用 createOdeWorker 已创建的 Worker
    const existing = getGlobalWorker();
    if (existing) {
      globalScheduler.injectWorker(existing);
    }
  }
  return globalScheduler;
}

/** 释放全局调度器单例及关联资源 */
export function releaseScheduler(): void {
  if (globalScheduler) {
    globalScheduler.destroy();
    globalScheduler = null;
    releaseGlobalWorker();
  }
}
