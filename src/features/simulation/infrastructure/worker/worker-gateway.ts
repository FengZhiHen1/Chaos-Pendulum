import type {
  WorkerResponse,
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  PoincareSectionCondition,
} from "@/shared/domain/valueObjects";
import type { IWorkerGateway } from "../../contracts";

/**
 * Web Worker 通信端口——实现 IWorkerGateway 契约接口。
 *
 * 封装主线程与仿真 Worker 之间的消息通道，
 * 提供类型安全的 send* 方法和 onMessage 回调注册。
 */
export class WorkerGateway implements IWorkerGateway {
  private worker: Worker | null = null;
  private handlers: Array<(response: WorkerResponse) => void> = [];

  /** 注入 Worker 实例（由启动流程创建） */
  injectWorker(worker: Worker): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker.onmessage = null;
    }
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      for (const handler of this.handlers) {
        handler(e.data);
      }
    };
  }

  /** 注册 Worker 响应处理器 */
  onMessage(handler: (response: WorkerResponse) => void): void {
    this.handlers.push(handler);
  }

  /** 发送 init 命令——建立 Worker 初始状态 */
  sendInit(params: PendulumParams, ic: InitialConditions, method: IntegratorMethod): void {
    this.post({ type: "init", params, initialConditions: ic, method });
  }

  /** 发送 step 命令——请求一批帧积分（Transferable buffer） */
  sendStep(buffer: Float64Array, poincare?: PoincareSectionCondition | null): void {
    this.post({ type: "step", buffer, poincare: poincare ?? null }, [buffer.buffer]);
  }

  /** 发送 updateParams 命令——热更新物理参数 */
  sendUpdateParams(params: Partial<PendulumParams>): void {
    this.post({ type: "updateParams", params });
  }

  /** 发送 reset 命令——重置仿真到初始条件 */
  sendReset(ic: InitialConditions, simTime?: number): void {
    this.post({ type: "reset", initialConditions: ic, simTime });
  }

  /** 发送 setDirection 命令——切换积分方向 */
  sendDirection(direction: 1 | -1): void {
    this.post({ type: "setDirection", direction });
  }

  /** 发送 setMethod 命令——切换积分方法 */
  sendMethod(method: IntegratorMethod): void {
    this.post({ type: "setMethod", method });
  }

  /** 发送 config 命令——配置可选功能（力计算等） */
  sendConfig(computeForces?: boolean): void {
    this.post({ type: "config", computeForces });
  }

  /** 发送 runValidation 命令——在 Worker 中独立运行验证场景 */
  sendRunValidation(
    scenarioId: "smallAngle" | "singlePendulum" | "energy",
    params: PendulumParams,
    ic: InitialConditions,
    simDuration: number,
  ): void {
    this.post({ type: "runValidation", scenarioId, params, initialConditions: ic, simDuration });
  }

  /** 销毁 Worker 实例 */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.handlers = [];
  }

  /** 底层 postMessage 包装，transferable 用于零拷贝传输缓冲区所有权 */
  private post(
    msg: Record<string, unknown>,
    transferable?: ArrayBuffer[],
  ): void {
    if (!this.worker) {
      console.warn(`[WorkerGateway] Worker 未注入，丢弃消息 type=${msg.type as string}`);
      return;
    }
    console.log(`[WorkerGateway] 发送消息 type=${msg.type as string}, worker=${!!this.worker}`);
    if (transferable?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postMessage transfer 参数类型
      (this.worker.postMessage as (msg: unknown, transfer: ArrayBuffer[]) => void)(msg, transferable);
    } else {
      this.worker.postMessage(msg);
    }
  }
}
