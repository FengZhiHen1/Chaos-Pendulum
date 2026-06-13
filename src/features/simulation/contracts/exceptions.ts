/**
 * 模块: simulation.contracts.exceptions
 * 职责: 定义 simulation 功能域的异常层次——所有仿真相关错误从 SimulationError 继承，
 *       提供诊断字段供上游做程序化错误处理（而非解析错误字符串）。
 * 数据来源:
 *   - ErrorCode (shared/domain/valueObjects): SHOULD — Worker 错误码可映射到异常类型
 * 边界:
 *   - 依赖: 无
 *   - 被依赖: 所有其他契约文件（异常类型被各层的 try-catch 消费）
 * 禁止行为:
 *   - 禁止在异常类中包含业务逻辑
 *   - 禁止 catch 块中解析 error.message 字符串——使用 instanceof + 诊断字段
 *   - 禁止异常有隐式诊断字段——所有有效信息必须通过构造函数参数显式传入
 */

// ───────────────────────────────────────────────
// @contract SimulationError — 仿真基类异常
// ───────────────────────────────────────────────

/**
 * 仿真模块所有异常的基类。
 *
 * 触发条件: 仿真运行过程中发生任何可恢复/不可恢复的错误
 * 诊断字段:
 *   - code: 错误码（DIVERGED | TIMEOUT | INVALID_STATE | WORKER_CRASH）
 *   - simTime: 错误发生时的仿真时间 (s)，-1 表示未初始化
 *   - message: 人类可读的错误描述
 */
export class SimulationError extends Error {
  /** 错误码 */
  readonly code: "DIVERGED" | "TIMEOUT" | "INVALID_STATE" | "WORKER_CRASH";

  /** 错误发生时的仿真时间 (s)，-1 表示未初始化 */
  readonly simTime: number;

  constructor(
    code: SimulationError["code"],
    message: string,
    simTime: number,
  ) {
    super(message);
    this.name = "SimulationError";
    this.code = code;
    this.simTime = simTime;
  }
}

// ───────────────────────────────────────────────
// @contract DivergenceError — 数值发散错误
// ───────────────────────────────────────────────

/**
 * 数值发散错误——积分过程中状态包含 NaN 或 Infinity。
 *
 * 触发条件: hasInvalidValue(state) === true
 * 诊断字段:
 *   - code: "DIVERGED"
 *   - simTime: 发散时的仿真时间 (s)
 *   - method: 当前使用的积分方法
 *   - state: 发散时的状态向量快照 [θ₁, ω₁, θ₂, ω₂]（可能含 NaN）
 */
export class DivergenceError extends SimulationError {
  /** 当前积分方法 */
  readonly method: string;

  /** 发散时的状态向量（可能含 NaN/Infinity） */
  readonly state: Float64Array;

  constructor(message: string, simTime: number, method: string, state: Float64Array) {
    super("DIVERGED", message, simTime);
    this.name = "DivergenceError";
    this.method = method;
    this.state = new Float64Array(state); // 防御性拷贝
  }
}

// ───────────────────────────────────────────────
// @contract TimeoutError — Worker 积分超时
// ───────────────────────────────────────────────

/**
 * Worker 积分超时——Worker 在指定时间内未返回批次数据。
 *
 * 触发条件: setTimeout 超时 + Worker 无响应
 * 诊断字段:
 *   - code: "TIMEOUT"
 *   - simTime: 超时时的仿真时间 (s)
 *   - timeoutMs: 超时阈值 (ms)
 */
export class TimeoutError extends SimulationError {
  /** 超时阈值 (ms) */
  readonly timeoutMs: number;

  constructor(message: string, simTime: number, timeoutMs: number) {
    super("TIMEOUT", message, simTime);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

// ───────────────────────────────────────────────
// @contract InvalidStateError — 状态非法错误
// ───────────────────────────────────────────────

/**
 * 状态非法错误——参数校验失败或 Worker 在错误状态下收到命令。
 *
 * 触发条件:
 *   - validateParams() 返回非 null
 *   - Worker 未初始化时收到 step 命令
 *   - Worker 处于 error 状态时收到非 reset 命令
 * 诊断字段:
 *   - code: "INVALID_STATE"
 *   - simTime: 错误时的仿真时间 (s)
 *   - context: 错误发生的上下文描述
 */
export class InvalidStateError extends SimulationError {
  /** 错误上下文描述 */
  readonly context: string;

  constructor(message: string, simTime: number, context: string) {
    super("INVALID_STATE", message, simTime);
    this.name = "InvalidStateError";
    this.context = context;
  }
}

// ───────────────────────────────────────────────
// @contract WorkerCrashError — Worker 崩溃错误
// ───────────────────────────────────────────────

/**
 * Worker 崩溃错误——Worker 崩溃且恢复失败。
 *
 * 触发条件: Worker.onerror 触发 + crashCount >= maxRetries
 * 诊断字段:
 *   - code: "WORKER_CRASH"
 *   - simTime: 崩溃时的仿真时间 (s)
 *   - crashCount: 连续崩溃次数
 *   - maxRetries: 最大重试次数
 */
export class WorkerCrashError extends SimulationError {
  /** 连续崩溃次数 */
  readonly crashCount: number;

  /** 最大重试次数 */
  readonly maxRetries: number;

  constructor(message: string, simTime: number, crashCount: number, maxRetries: number) {
    super("WORKER_CRASH", message, simTime);
    this.name = "WorkerCrashError";
    this.crashCount = crashCount;
    this.maxRetries = maxRetries;
  }
}

// ───────────────────────────────────────────────
// @contract WorkerNotReadyError — Worker 未就绪
// ───────────────────────────────────────────────

/**
 * Worker 未就绪错误——在 Worker ready 前尝试发送命令。
 *
 * 触发条件: !workerReady && 发送非 init 命令
 * 诊断字段:
 *   - code: "INVALID_STATE"
 *   - simTime: -1
 *   - pendingCommand: 被阻塞的命令类型
 */
export class WorkerNotReadyError extends SimulationError {
  /** 被阻塞的命令类型 */
  readonly pendingCommand: string;

  constructor(message: string, pendingCommand: string) {
    super("INVALID_STATE", message, -1);
    this.name = "WorkerNotReadyError";
    this.pendingCommand = pendingCommand;
  }
}

// ───────────────────────────────────────────────
// @contract InvalidStateTransitionError — 非法状态转换
// ───────────────────────────────────────────────

/**
 * 非法状态转换错误——尝试进行不合法的生命周期状态转换。
 *
 * 触发条件: 如从 idle 直接到 paused（应该是 idle → running → paused）
 * 诊断字段:
 *   - code: "INVALID_STATE"
 *   - simTime: 当前仿真时间
 *   - fromPhase: 当前阶段
 *   - toPhase: 尝试转换到的阶段
 */
export class InvalidStateTransitionError extends SimulationError {
  /** 当前阶段 */
  readonly fromPhase: string;

  /** 目标阶段 */
  readonly toPhase: string;

  constructor(message: string, simTime: number, fromPhase: string, toPhase: string) {
    super("INVALID_STATE", message, simTime);
    this.name = "InvalidStateTransitionError";
    this.fromPhase = fromPhase;
    this.toPhase = toPhase;
  }
}
