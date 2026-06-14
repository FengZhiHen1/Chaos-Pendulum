/**
 * 模块: data.contracts.exceptions
 * 职责: 定义演示与数据管理功能域的异常层次——所有操作异常从 DataError 继承，
 *       提供诊断字段供上游做程序化错误处理（而非解析错误字符串）。
 * 数据来源:
 *   - 无外部数据依赖
 * 边界:
 *   - 依赖: 无
 *   - 被依赖: 所有其他契约文件（异常类型被各层的 try-catch 消费）
 * 禁止行为:
 *   - 禁止在异常类中包含业务逻辑
 *   - 禁止 catch 块中解析 error.message 字符串——使用 instanceof + 诊断字段
 *   - 禁止异常有隐式诊断字段——所有有效信息必须通过构造函数参数显式传入
 */

// ─── 基类异常 ─────────────────────────────────────

/**
 * @contract DataError — 数据功能域所有异常的基类。
 *
 * 触发条件: 快照/导出/回放/故事脚本/演示模式操作中发生任何错误
 * 诊断字段:
 *   - code: 错误码
 *   - message: 人类可读的错误描述
 *   - context: 错误发生的上下文描述
 */
export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly context: string;

  constructor(code: DataErrorCode, message: string, context: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.context = context;
  }
}

/** 错误码枚举 */
export type DataErrorCode =
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_FULL"
  | "SNAPSHOT_INVALID"
  | "EXPORT_FAILED"
  | "EXPORT_INVALID_CONFIG"
  | "PLAYBACK_OUT_OF_RANGE"
  | "PLAYBACK_NOT_PAUSED"
  | "FORK_INIT_FAILED"
  | "FORK_OUT_OF_RANGE"
  | "STORY_SCRIPT_INVALID"
  | "STORY_STAGE_TRANSITION"
  | "DEMO_MODE_ACTIVATION"
  | "STORAGE_ERROR";

// ─── DAT-01: 快照异常 ────────────────────────────

/**
 * @contract SnapshotNotFoundError — 快照未找到。
 *
 * 触发条件: 通过 id 加载快照但 IndexedDB 中不存在
 * 诊断字段:
 *   - code: "SNAPSHOT_NOT_FOUND"
 *   - snapshotId: 请求的快照 ID
 */
export class SnapshotNotFoundError extends DataError {
  readonly snapshotId: string;

  constructor(message: string, context: string, snapshotId: string) {
    super("SNAPSHOT_NOT_FOUND", message, context);
    this.name = "SnapshotNotFoundError";
    this.snapshotId = snapshotId;
  }
}

/**
 * @contract SnapshotFullError — 快照数量已达上限。
 *
 * 触发条件: 尝试保存快照但已达 SNAPSHOT_MAX_COUNT (50)
 * 诊断字段:
 *   - code: "SNAPSHOT_FULL"
 *   - maxCount: 存储上限
 *   - currentCount: 当前存储数量
 */
export class SnapshotFullError extends DataError {
  readonly maxCount: number;
  readonly currentCount: number;

  constructor(message: string, context: string, maxCount: number, currentCount: number) {
    super("SNAPSHOT_FULL", message, context);
    this.name = "SnapshotFullError";
    this.maxCount = maxCount;
    this.currentCount = currentCount;
  }
}

/**
 * @contract SnapshotInvalidError — 快照数据无效。
 *
 * 触发条件: 快照缺少必填字段或字段类型不匹配
 * 诊断字段:
 *   - code: "SNAPSHOT_INVALID"
 *   - invalidField: 无效的字段名
 */
export class SnapshotInvalidError extends DataError {
  readonly invalidField: string;

  constructor(message: string, context: string, invalidField: string) {
    super("SNAPSHOT_INVALID", message, context);
    this.name = "SnapshotInvalidError";
    this.invalidField = invalidField;
  }
}

// ─── DAT-02: 导出异常 ────────────────────────────

/**
 * @contract DataExportError — 数据导出失败。
 *
 * 触发条件: 导出过程中任何失败（canvas 为 null、格式无效、数据为空）
 * 诊断字段:
 *   - code: "EXPORT_FAILED" | "EXPORT_INVALID_CONFIG"
 *   - format: 尝试导出的格式
 *   - detail: 失败详情
 */
export class DataExportError extends DataError {
  readonly format: string;
  readonly detail: string;

  constructor(
    code: "EXPORT_FAILED" | "EXPORT_INVALID_CONFIG",
    message: string,
    context: string,
    format: string,
    detail: string,
  ) {
    super(code, message, context);
    this.name = "DataExportError";
    this.format = format;
    this.detail = detail;
  }
}

// ─── DAT-03: 回放/分叉异常 ──────────────────────

/**
 * @contract PlaybackOutOfRangeError — 回放时间超出范围。
 *
 * 触发条件: 用户拖拽时间轴超出 RingBuffer 覆盖范围
 * 诊断字段:
 *   - code: "PLAYBACK_OUT_OF_RANGE"
 *   - requestedTime: 请求的回放时间 (s)
 *   - availableRange: [minTime, maxTime] (s)
 */
export class PlaybackOutOfRangeError extends DataError {
  readonly requestedTime: number;
  readonly availableRange: [number, number];

  constructor(
    message: string,
    context: string,
    requestedTime: number,
    availableRange: [number, number],
  ) {
    super("PLAYBACK_OUT_OF_RANGE", message, context);
    this.name = "PlaybackOutOfRangeError";
    this.requestedTime = requestedTime;
    this.availableRange = availableRange;
  }
}

/**
 * @contract PlaybackNotPausedError — 回放时仿真未暂停。
 *
 * 触发条件: 在仿真运行中尝试进入回放模式
 * 诊断字段:
 *   - code: "PLAYBACK_NOT_PAUSED"
 */
export class PlaybackNotPausedError extends DataError {
  constructor(message: string, context: string) {
    super("PLAYBACK_NOT_PAUSED", message, context);
    this.name = "PlaybackNotPausedError";
  }
}

/**
 * @contract ForkError — 分叉演化失败。
 *
 * 触发条件: 分叉初始化失败（Worker 创建失败、初始状态无效、超出范围）
 * 诊断字段:
 *   - code: "FORK_INIT_FAILED" | "FORK_OUT_OF_RANGE"
 *   - forkTime: 尝试分叉的时间点 (s)
 */
export class ForkError extends DataError {
  readonly forkTime: number;

  constructor(
    code: "FORK_INIT_FAILED" | "FORK_OUT_OF_RANGE",
    message: string,
    context: string,
    forkTime: number,
  ) {
    super(code, message, context);
    this.name = "ForkError";
    this.forkTime = forkTime;
  }
}

// ─── STY-01/02: 演示异常 ─────────────────────────

/**
 * @contract StoryScriptError — 故事脚本异常。
 *
 * 触发条件: 脚本解析失败、阶段定义缺失或格式无效
 * 诊断字段:
 *   - code: "STORY_SCRIPT_INVALID" | "STORY_STAGE_TRANSITION"
 *   - stageIndex: 出错的阶段索引（-1 = 整体脚本错误）
 */
export class StoryScriptError extends DataError {
  readonly stageIndex: number;

  constructor(
    code: "STORY_SCRIPT_INVALID" | "STORY_STAGE_TRANSITION",
    message: string,
    context: string,
    stageIndex: number,
  ) {
    super(code, message, context);
    this.name = "StoryScriptError";
    this.stageIndex = stageIndex;
  }
}

/**
 * @contract DemoModeError — 演示模式异常。
 *
 * 触发条件: 演示模式激活失败（如 Worker 未就绪时尝试自动巡游）
 * 诊断字段:
 *   - code: "DEMO_MODE_ACTIVATION"
 *   - reason: 失败原因
 */
export class DemoModeError extends DataError {
  readonly reason: string;

  constructor(message: string, context: string, reason: string) {
    super("DEMO_MODE_ACTIVATION", message, context);
    this.name = "DemoModeError";
    this.reason = reason;
  }
}

// ─── 存储异常 ─────────────────────────────────────

/**
 * @contract StorageError — 持久化存储异常。
 *
 * 触发条件: IndexedDB 操作失败（打开/读写/事务/配额）
 * 诊断字段:
 *   - code: "STORAGE_ERROR"
 *   - operation: 失败的操作类型
 *   - dbName: 数据库名称
 */
export class StorageError extends DataError {
  readonly operation: string;
  readonly dbName: string;

  constructor(message: string, context: string, operation: string, dbName: string) {
    super("STORAGE_ERROR", message, context);
    this.name = "StorageError";
    this.operation = operation;
    this.dbName = dbName;
  }
}
