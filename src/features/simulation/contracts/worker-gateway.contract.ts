/**
 * 模块: simulation.contracts.worker-gateway
 * 职责: 定义主线程 ↔ Web Worker 通信的端口接口——消息协议、Worker 生命周期、崩溃恢复策略。
 *       Infrastructure 层的 workers/ 实现此端口，Application 层通过此端口编排用例。
 * 数据来源:
 *   - WorkerCommand / WorkerResponse (shared/domain/valueObjects): MUST — Worker 消息协议定义
 *   - Float64Pool (infrastructure/worker/float64-pool): MUST — Transferable 缓冲区池
 * 边界:
 *   - 依赖: shared/domain/valueObjects (WorkerCommand, WorkerResponse, PendulumParams)
 *   - 被依赖: simulation-scheduler.contract (Scheduler 通过此端口与 Worker 通信)
 * 禁止行为:
 *   - 禁止在端口接口中引用 Zustand Store——端口是纯类型，无关状态管理
 *   - 禁止端口接口包含 DOM 操作或 React 依赖
 *   - 禁止单个命令携带超过 1 个 Transferable buffer（Worker 消息大小约束）
 */

import type {
  WorkerResponse,
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  PoincareSectionCondition,
} from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract IWorkerGateway — Worker 通信端口
// ───────────────────────────────────────────────

/**
 * Web Worker 通信端口——主线程与仿真 Worker 之间的消息通道。
 *
 * 实现者（infrastructure/worker/）填写 _do_send / _do_create 钩子。
 * 不需要关心消息序列化和 Transferable 管理——send() 已处理。
 *
 * 前置: Worker 实例已创建且未终止
 * 后置: 命令被序列化并 postMessage 到 Worker
 * 输入约束: 见各 send* 方法
 * 输出约束: Worker 的响应通过 onMessage 回调异步返回
 * 异常:
 *   - WorkerNotReadyError: 发送命令时 Worker 未就绪
 *   - WorkerCrashError: Worker 崩溃且恢复失败
 * Side Effects: 发送消息到 Worker（跨线程通信）；可能触发 Transferable 缓冲区转移
 */
export interface IWorkerGateway {
  /** 注入 Worker 实例（由启动流程创建） */
  injectWorker(worker: Worker): void;

  /** 发送 init 命令——建立 Worker 初始状态 */
  sendInit(params: PendulumParams, ic: InitialConditions, method: IntegratorMethod): void;

  /** 发送 step 命令——请求一批帧积分（Transferable buffer） */
  sendStep(buffer: Float64Array, poincare?: PoincareSectionCondition | null): void;

  /** 发送 updateParams 命令——热更新物理参数 */
  sendUpdateParams(params: Partial<PendulumParams>): void;

  /** 发送 reset 命令——重置仿真到初始条件 */
  sendReset(ic: InitialConditions, simTime?: number): void;

  /** 发送 setDirection 命令——切换积分方向 */
  sendDirection(direction: 1 | -1): void;

  /** 发送 setMethod 命令——切换积分方法 */
  sendMethod(method: IntegratorMethod): void;

  /** 发送 config 命令——配置可选功能（力计算等） */
  sendConfig(computeForces?: boolean): void;

  /** 注册 Worker 响应处理器 */
  onMessage(handler: (response: WorkerResponse) => void): void;

  /** 销毁 Worker 实例 */
  destroy(): void;
}

// ───────────────────────────────────────────────
// @contract IWorkerRecoveryPolicy — 崩溃恢复策略
// ───────────────────────────────────────────────

/**
 * Worker 崩溃恢复策略——定义崩溃检测和自动重建规则。
 *
 * 前置: Worker 已崩溃（onerror 触发或超时）
 * 后置: 若 crashCount < maxRetries，则已重建 Worker 并发送 init 命令；否则标记不可恢复
 * 输入约束:
 *   - maxRetries: 最大重试次数（默认 1）
 *   - crashCount: 当前已崩溃次数（由策略内部追踪）
 *   - lastKnownState: 崩溃前的最后状态快照（用于恢复）
 * 输出约束: 恢复成功时 Worker 处于 idle 状态；失败时抛出 WorkerCrashError
 * 异常: WorkerCrashError — 连续崩溃超过 maxRetries
 * Side Effects: 创建新 Worker 实例；发送 init 命令；重置内部计数器
 */
export interface IWorkerRecoveryPolicy {
  /** 最大重试次数 */
  readonly maxRetries: number;

  /** 当前连续崩溃计数 */
  readonly crashCount: number;

  /**
   * 尝试恢复——重建 Worker 并恢复最后已知状态。
   *
   * 前置: Worker 已崩溃
   * 后置: 若成功，Worker 已重建并重新初始化
   * 输入约束: lastKnownParams / lastKnownIC 来自崩溃前的 store 快照
   * 输出约束: 成功时返回 void；失败时抛异常（crashCount >= maxRetries 或重建超时）
   * 异常: WorkerCrashError — 重建失败或连续崩溃超限
   * Side Effects: 创建新 Worker → 发送 init → 重置计数器
   */
  recover(
    lastKnownParams: PendulumParams,
    lastKnownIC: InitialConditions,
    lastKnownMethod: IntegratorMethod,
  ): void;

  /** 重置崩溃计数器（仿真正常重启时调用） */
  resetCounter(): void;
}

// ───────────────────────────────────────────────
// @contract IFloat64Pool — Transferable 缓冲区池
// ───────────────────────────────────────────────

/**
 * Float64Array 对象池——管理主线程与 Worker 之间的 Transferable 缓冲区。
 *
 * 前置: 池已初始化（count × size 个缓冲区）
 * 后置: acquire() 获取空闲缓冲区 → transfer 到 Worker → Worker transfer 回 → release() 归还
 * 输入约束:
 *   - count: 池中缓冲区数量（默认 10）
 *   - size: 每个缓冲区的 Float64 元素数（默认 4000，> FRAMES_PER_BATCH * FRAME_STRIDE）
 * 输出约束:
 *   - acquire() 返回 { buffer, index } 或 null（池耗尽）
 *   - release(index) 将缓冲区标记为空闲
 * 异常: 无——池耗尽时返回 null 而非抛异常
 * Side Effects: 管理内部空闲列表；检测 detached buffer 并重新分配
 */
export interface IFloat64Pool {
  /** 获取一个空闲缓冲区；返回 null 表示池耗尽 */
  acquire(): { buffer: Float64Array; index: number } | null;

  /** 归还缓冲区到池中 */
  release(index: number, newBuffer?: Float64Array): void;

  /** 通过 buffer 引用归还 */
  releaseBuffer(buffer: Float64Array): void;

  /** 池总容量 */
  readonly size: number;

  /** 当前可用缓冲区数 */
  readonly available: number;
}
