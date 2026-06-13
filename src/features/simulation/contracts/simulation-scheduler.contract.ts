/**
 * 模块: simulation.contracts.simulation-scheduler
 * 职责: 定义仿真调度器的契约边界——生命周期管理、双缓冲帧消费、外部 tick 驱动。
 *       仿真调度器是连接 Worker、Store、渲染循环的中枢控制器。
 * 数据来源:
 *   - IWorkerGateway (worker-gateway.contract): MUST — Worker 通信依赖
 *   - IFloat64Pool (worker-gateway.contract): MUST — 缓冲区池依赖
 *   - IOdeSolver (physics-engine.contract): MUST — 积分器依赖
 * 边界:
 *   - 依赖: worker-gateway.contract, physics-engine.contract, types.contract
 *   - 被依赖: infrastructure/worker/bridge.ts (Store↔Scheduler 桥接)
 * 禁止行为:
 *   - 禁止在调度器中直接操作 Zustand Store——通过 port 接口注入
 *   - 禁止调度器管理 UI 状态（isSceneFrozen 等）——那是 ViewModel 职责
 *   - 禁止在 schedule 方法中执行同步阻塞操作——所有 Worker 通信是异步的
 *   - 禁止在 activeBuffer 消费完毕前丢弃 nextBuffer（双缓冲语义保证帧连续性）
 */

import type { PendulumParams, InitialConditions, IntegratorMethod, PoincareSectionCondition, PoincarePoint } from "@/shared/domain/valueObjects";
import type { SimulationFrame, InterpSnapshot } from "./types.contract";
import type { IWorkerGateway, IFloat64Pool, IWorkerRecoveryPolicy } from "./worker-gateway.contract";

// ───────────────────────────────────────────────
// @contract ISimulationScheduler — 仿真调度器
// ───────────────────────────────────────────────

/**
 * 仿真调度器抽象基类——管理仿真生命周期、帧缓冲双缓冲、Worker 通信协调。
 *
 * 模板方法 start() 的执行流程:
 *   1. 前置校验（Worker 存在、状态合法）
 *   2. 丢弃旧批次缓冲区
 *   3. 发送 init 命令
 *   4. 若非外部 tick 模式，启动内部 rAF 循环
 *
 * 实现者只需填写 _do_createWorker / _do_requestBatch 钩子。
 *
 * 前置: Worker 已创建并注入
 * 后置: 仿真正在运行（或暂停）
 * 输入约束: 见各 public 方法
 * 输出约束: 帧数据通过 onFrameConsumed 回调通知
 * 异常:
 *   - WorkerNotReadyError: Worker 未就绪时调用 start
 *   - TimeoutError: Worker 积分超时
 * Side Effects: 启动/停止 rAF 循环；发送消息到 Worker；修改内部双缓冲状态
 */
export abstract class ISimulationScheduler {
  protected readonly workerGateway: IWorkerGateway;
  protected readonly pool: IFloat64Pool;
  protected readonly recoveryPolicy: IWorkerRecoveryPolicy;

  constructor(
    workerGateway: IWorkerGateway,
    pool: IFloat64Pool,
    recoveryPolicy: IWorkerRecoveryPolicy,
  ) {
    this.workerGateway = workerGateway;
    this.pool = pool;
    this.recoveryPolicy = recoveryPolicy;
  }

  /**
   * 启动仿真（模板方法，不可覆写）。
   *
   * 前置: Worker 实例已注入；params/ic/method 已校验
   * 后置: Worker 已收到 init 命令；若 externalTick = false，rAF 循环已启动
   * 输入约束:
   *   - params: 六字段均通过硬约束校验
   *   - initialConditions: 四字段均为有限值
   *   - method: 已注册的积分方法
   * 输出约束: running = true；旧批次缓冲区已清空
   * 异常: WorkerNotReadyError — Worker 未注入
   * Side Effects: 清空 activeBuffer/nextBuffer；发送 init 命令；可能启动 rAF 循环
   */
  start(params: PendulumParams, ic: InitialConditions, method: IntegratorMethod): void {
    this.discardBuffers();
    this.workerGateway.sendInit(params, ic, method);
    this.onStart();
  }

  /** 暂停仿真 */
  abstract pause(): void;

  /** 恢复仿真 */
  abstract resume(): void;

  /** 停止并销毁所有资源 */
  abstract destroy(): void;

  /** 重置仿真到初始条件 */
  abstract reset(ic: InitialConditions, simTime?: number): void;

  /** 热更新物理参数（不重启仿真） */
  abstract updateParams(params: Partial<PendulumParams>): void;

  /** 切换积分方法 */
  abstract setMethod(method: IntegratorMethod): void;

  /** 切换积分方向 */
  abstract setDirection(direction: 1 | -1): void;

  /** 设置庞加莱截面条件 */
  abstract setPoincareCondition(cond: PoincareSectionCondition | null): void;

  /**
   * 启用外部 tick 模式——数据消费由渲染层（useFrame）驱动，与渲染严格同步。
   * 启用后内部 rAF 循环停止。
   */
  abstract enableExternalTick(): void;

  /** 禁用外部 tick 模式，恢复内部 rAF 循环 */
  abstract disableExternalTick(): void;

  /**
   * 外部驱动：消费一帧数据（external tick 模式下由 useFrame 调用）。
   * @returns 是否实际消费了一帧
   */
  abstract tick(): boolean;

  /**
   * 外部驱动（delta 累积模式）：由渲染层传入 delta time。
   * @returns 本帧消费的帧数
   */
  abstract tickDelta(delta: number): number;

  /** 获取供渲染插值用的前后帧坐标快照 */
  abstract getInterpolationFrames(): { prev: InterpSnapshot | null; curr: InterpSnapshot | null };

  /** 仿真是否正在运行 */
  abstract get isRunning(): boolean;

  /** 注册 Worker ready 回调 */
  abstract onReady(cb: () => void): void;

  /** 注册庞加莱截面点到达回调，返回取消注册函数 */
  abstract onPoincarePoints(cb: (pts: PoincarePoint[]) => void): () => void;

  // ── 钩子 ──

  /**
   * start() 的后置处理钩子。
   * 实现者在此决定是否启动 rAF 循环。
   */
  protected abstract onStart(): void;

  /**
   * 请求下一批帧数据（从 Worker 获取新批次）。
   * 实现者需要管理 pendingBatch 标志和超时检测。
   */
  protected abstract _do_requestBatch(): void;

  /**
   * 处理从 Worker 返回的批次数据。
   * 实现者需要管理 activeBuffer/nextBuffer 双缓冲切换。
   */
  protected abstract _do_handleBatch(buffer: Float64Array, frameCount: number): void;

  /**
   * 丢弃所有未消费的批次缓冲区。
   */
  protected abstract discardBuffers(): void;
}

// ───────────────────────────────────────────────
// @contract ISimulationLifecycle — 仿真生命周期状态机
// ───────────────────────────────────────────────

/**
 * 仿真生命周期状态机——定义仿真的运行阶段及合法转换。
 *
 * 状态转换图:
 *   idle → running (start)
 *   running → paused (pause)
 *   paused → running (resume)
 *   running → reversed (setDirection(-1))
 *   reversed → running (setDirection(1))
 *   any → idle (reset / destroy)
 *
 * 前置: 当前状态合法
 * 后置: 状态转换成功
 * 输入约束: 见各转换方法
 * 输出约束: 状态转换后 phase 正确更新
 * 异常: InvalidStateTransitionError — 非法的状态转换
 * Side Effects: 修改内部 phase 状态
 */
export interface ISimulationLifecycle {
  /** 当前运行阶段 */
  readonly phase: "idle" | "running" | "paused" | "reversed";

  /** 启动——idle → running */
  start(params: PendulumParams, ic: InitialConditions, method: IntegratorMethod): void;

  /** 暂停——running/reversed → paused */
  pause(): void;

  /** 恢复——paused → running */
  resume(): void;

  /** 重置——any → idle */
  reset(ic: InitialConditions): void;

  /** 销毁——any → 资源释放 */
  destroy(): void;
}

// ───────────────────────────────────────────────
// @contract IFrameBufferManager — 双缓冲帧管理
// ───────────────────────────────────────────────

/**
 * 双缓冲帧管理器——管理 activeBuffer（当前消费中）和 nextBuffer（预取的下一批）。
 *
 * 前置: 缓冲区已通过 IFloat64Pool.acquire() 获取
 * 后置: 消费完毕后缓冲区归还到池中
 * 输入约束:
 *   - activeBuffer: 当前正在消费的 Float64Array
 *   - nextBuffer: 提前到达的下一批次缓冲区
 *   - activeIndex: 当前消费位置（0..FRAMES_PER_BATCH-1）
 * 输出约束: 消费速度 >= 生产速度（否则缓冲区堆积）
 * 异常: 无——池耗尽时静默等待
 * Side Effects: 消费完毕时归还缓冲区到池
 */
export interface IFrameBufferManager {
  /** 设置当前活跃缓冲区 */
  setActive(buffer: Float64Array, bufferIndex: number, frameCount: number): void;

  /** 设置下一批次缓冲区（当前批次仍在消费中） */
  setNext(buffer: Float64Array, bufferIndex: number, frameCount: number): void;

  /**
   * 消费一帧并返回帧数据。
   * 消费到末尾时：
   *   1. 归还 activeBuffer 到池
   *   2. 若 nextBuffer 存在，提升为 activeBuffer
   *   3. 否则 activeBuffer = null
   */
  consumeOne(): SimulationFrame | null;

  /** 丢弃所有未消费的缓冲区 */
  clear(): void;

  /** 当前活跃缓冲区是否还有未消费帧 */
  get hasFrames(): boolean;

  /** 是否需要预取下一批（消费进度超过预取阈值） */
  get needsPrefetch(): boolean;
}
