/**
 * SIM-01 Worker 工厂函数。
 * 创建新的 ODE Worker 实例，供 SYS-02 崩溃恢复等场景使用。
 */
export function createOdeWorker(): Worker {
  return new Worker(
    new URL("./ode-worker.ts", import.meta.url),
    { type: "module" },
  );
}
