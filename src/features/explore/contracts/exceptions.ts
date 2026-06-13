/**
 * 模块: explore.contracts.exceptions
 * 职责: 定义 explore 功能域的异常层次——所有探索实验相关错误从 ExploreError 继承，
 *       提供诊断字段供上游做程序化错误处理。
 * 边界:
 *   - 依赖: 无
 *   - 被依赖: 所有其他 explore 契约文件
 * 禁止行为:
 *   - 禁止在异常类中包含业务逻辑
 *   - 禁止 catch 块中解析 error.message 字符串——使用 instanceof + 诊断字段
 */

// ───────────────────────────────────────────────
// @contract ExploreError — 探索模块基类异常
// ───────────────────────────────────────────────

/**
 * 探索模块所有异常的基类。
 *
 * 触发条件: 探索实验过程中发生任何可恢复/不可恢复的错误
 * 诊断字段:
 *   - code: 错误码
 *   - context: 错误发生的上下文描述
 */
export class ExploreError extends Error {
  readonly code: "AUDIO_CONTEXT" | "WORKER_CRASH" | "INSUFFICIENT_HISTORY" | "INVALID_DELTA";
  readonly context: string;

  constructor(code: ExploreError["code"], message: string, context: string) {
    super(message);
    this.name = "ExploreError";
    this.code = code;
    this.context = context;
  }
}

// ───────────────────────────────────────────────
// @contract AudioContextError — 音频上下文错误
// ───────────────────────────────────────────────

/**
 * 音频上下文错误——AudioContext 创建或恢复失败。
 *
 * 触发条件:
 *   - 浏览器不支持 Web Audio API
 *   - AudioContext 被自动播放策略阻止
 *   - 移动端尝试创建 AudioContext
 * 诊断字段:
 *   - code: "AUDIO_CONTEXT"
 *   - context: 错误上下文
 *   - deviceType: 设备类型
 */
export class AudioContextError extends ExploreError {
  readonly deviceType: string;

  constructor(message: string, context: string, deviceType: string) {
    super("AUDIO_CONTEXT", message, context);
    this.name = "AudioContextError";
    this.deviceType = deviceType;
  }
}

// ───────────────────────────────────────────────
// @contract ButterflyWorkerError — 蝴蝶效应 Worker 错误
// ───────────────────────────────────────────────

/**
 * 蝴蝶效应 Worker 错误——任一侧 Worker 崩溃且恢复失败。
 *
 * 触发条件: Worker.onerror 触发 + crashCount >= maxRetries
 * 诊断字段:
 *   - code: "WORKER_CRASH"
 *   - context: 错误上下文
 *   - side: 崩溃的 Worker 侧 ("A" | "B")
 *   - crashCount: 连续崩溃次数
 */
export class ButterflyWorkerError extends ExploreError {
  readonly side: "A" | "B";
  readonly crashCount: number;

  constructor(message: string, side: "A" | "B", crashCount: number) {
    super("WORKER_CRASH", message, `蝴蝶效应 ${side} 侧 Worker 崩溃`);
    this.name = "ButterflyWorkerError";
    this.side = side;
    this.crashCount = crashCount;
  }
}

// ───────────────────────────────────────────────
// @contract InsufficientHistoryError — 历史帧不足
// ───────────────────────────────────────────────

/**
 * 历史帧不足错误——时间反演需要最小历史帧数。
 *
 * 触发条件: 仿真运行时间 < MIN_HISTORY_FRAMES / 60 秒
 * 诊断字段:
 *   - code: "INSUFFICIENT_HISTORY"
 *   - context: 错误上下文
 *   - currentFrames: 当前历史帧数
 *   - requiredFrames: 最小需��帧数
 */
export class InsufficientHistoryError extends ExploreError {
  readonly currentFrames: number;
  readonly requiredFrames: number;

  constructor(currentFrames: number, requiredFrames: number) {
    super(
      "INSUFFICIENT_HISTORY",
      `历史帧数不足：当前 ${currentFrames} 帧，需要≥${requiredFrames} 帧`,
      "时间反演启动检查",
    );
    this.name = "InsufficientHistoryError";
    this.currentFrames = currentFrames;
    this.requiredFrames = requiredFrames;
  }
}

// ───────────────────────────────────────────────
// @contract InvalidDeltaError — Delta 值非法
// ───────────────────────────────────────────────

/**
 * Delta 值非法错误——蝴蝶效应的初始差异超出合法范围。
 *
 * 触发条件: deltaDeg ∉ [1e-6, 10] 或 deltaDeg 为 NaN
 * 诊断字段:
 *   - code: "INVALID_DELTA"
 *   - context: 错误上下文
 *   - value: 非法的 deltaDeg 值
 *   - validRange: 合法范围 [min, max]
 */
export class InvalidDeltaError extends ExploreError {
  readonly value: number;
  readonly validRange: readonly [number, number];

  constructor(value: number) {
    super(
      "INVALID_DELTA",
      `Delta 值 ${value} 超出合法范围 [1e-6, 10]`,
      "蝴蝶效应 Delta 设置",
    );
    this.name = "InvalidDeltaError";
    this.value = value;
    this.validRange = [1e-6, 10];
  }
}
