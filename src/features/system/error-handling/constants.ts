/**
 * SYS-02 运行时异常处理 — 配置常量
 */

export const LONG_RUNNING_CONFIG = {
  /** 长运行阈值（毫秒）。默认 600000（10 分钟） */
  THRESHOLD_MS: 600_000,

  /** 降级后的积分步长（秒） */
  DEGRADED_DT: 1 / 30,

  /** 降级后的尾迹最大长度（步数） */
  DEGRADED_TRAIL_LENGTH: 500,

  /** 降级触发前的预警时间（毫秒） */
  WARNING_BEFORE_MS: 60_000,

  /** 检测间隔（毫秒） */
  CHECK_INTERVAL_MS: 30_000,
} as const;
