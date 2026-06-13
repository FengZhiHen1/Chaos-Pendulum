import type {
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
} from "@/shared/domain/valueObjects";
import type { IWorkerRecoveryPolicy, IWorkerGateway } from "../../contracts";
import { WorkerCrashError } from "../../contracts";

/**
 * 默认 Worker 崩溃恢复策略——实现 IWorkerRecoveryPolicy 契约接口。
 *
 * 管理崩溃计数器和重建逻辑。
 * 需要 WorkerGateway 引用以在恢复时重新注入 Worker 并发送 init 命令。
 * 需要同步 workerFactory 以创建新的 Worker 实例（崩溃恢复必须是同步的）。
 */
export class DefaultWorkerRecoveryPolicy implements IWorkerRecoveryPolicy {
  readonly maxRetries: number;
  private _crashCount = 0;
  private readonly gateway: IWorkerGateway;
  private readonly workerFactory: () => Worker;

  constructor(
    maxRetries: number,
    gateway: IWorkerGateway,
    workerFactory: () => Worker,
  ) {
    this.maxRetries = maxRetries;
    this.gateway = gateway;
    this.workerFactory = workerFactory;
  }

  /** 当前连续崩溃计数 */
  get crashCount(): number {
    return this._crashCount;
  }

  /**
   * 尝试恢复——重建 Worker 并恢复最后已知状态。
   *
   * 前置: Worker 已崩溃
   * 后置: 若成功，Worker 已重建并 re-init
   * 异常: WorkerCrashError — 持续崩溃达到 maxRetries 上限
   */
  recover(
    lastKnownParams: PendulumParams,
    lastKnownIC: InitialConditions,
    lastKnownMethod: IntegratorMethod,
  ): void {
    if (this._crashCount >= this.maxRetries) {
      throw new WorkerCrashError(
        `Worker 连续崩溃 ${this._crashCount} 次，已达最大重试上限 ${this.maxRetries}`,
        -1,
        this._crashCount,
        this.maxRetries,
      );
    }

    this._crashCount++;

    // 同步创建新 Worker（不等待 ready 消息）
    const worker = this.workerFactory();
    this.gateway.injectWorker(worker);
    this.gateway.sendInit(lastKnownParams, lastKnownIC, lastKnownMethod);
  }

  /** 重置崩溃计数器（仿真正常重启时调用） */
  resetCounter(): void {
    this._crashCount = 0;
  }
}
