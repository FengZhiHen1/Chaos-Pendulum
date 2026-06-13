import type { WorkerResponse } from "@/shared/types";
import { DEFAULT_PARAMS, DEFAULT_INITIAL_CONDITIONS, DEFAULT_METHOD } from "@/shared/types";

let globalWorker: Worker | null = null;

/**
 * 创建 ODE Worker 实例、发送 init 命令并等待其 ready 消息。
 *
 * Worker 启动后需要收到 init 命令才会响应 ready。
 * 此处用默认参数立即初始化，后续 AppShell 挂载时
 * setupSimulationBridge 会通过 scheduler.start() 重新 init。
 *
 * @param timeoutMs 超时时间（毫秒）
 * @returns Promise<Worker>
 * @throws Error 当 Worker 创建失败或超时时
 */
export function createOdeWorker(timeoutMs = 3000): Promise<Worker> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const worker = new Worker(
        new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
        { type: "module" },
      );

      const cleanup = () => {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        worker.onmessage = null;
        worker.onerror = null;
      };

      timeoutId = setTimeout(() => {
        if (resolved) return;
        cleanup();
        worker.terminate();
        reject(new Error("仿真引擎初始化超时"));
      }, timeoutMs);

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === "ready") {
          if (resolved) return;
          cleanup();
          globalWorker = worker;
          resolve(worker);
        }
      };

      worker.onerror = (event) => {
        if (resolved) return;
        cleanup();
        worker.terminate();
        reject(new Error(`Worker 加载失败: ${event.message}`));
      };

      // 关键修复：立即发送 init 命令，Worker 收到后才会响应 ready
      worker.postMessage({
        type: "init",
        params: DEFAULT_PARAMS,
        initialConditions: DEFAULT_INITIAL_CONDITIONS,
        method: DEFAULT_METHOD,
      });
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`Worker 创建失败: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

/** 获取全局 Worker 实例（由 createOdeWorker 成功时存储） */
export function getGlobalWorker(): Worker | null {
  return globalWorker;
}

/** 释放全局 Worker 实例 */
export function releaseGlobalWorker(): void {
  if (globalWorker) {
    globalWorker.terminate();
    globalWorker = null;
  }
}
