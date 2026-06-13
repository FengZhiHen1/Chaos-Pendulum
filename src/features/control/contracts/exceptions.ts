/**
 * 模块: control.contracts.exceptions
 * 职责: 定义 control 功能域的异常层次——参数校验错误、导航锁定错误。
 * 边界:
 *   - 依赖: 无
 *   - 被依赖: parameter-panel.contract, navigation.contract
 * 禁止行为:
 *   - 禁止在异常类中包含业务逻辑
 *   - 禁止 catch 块中解析 error.message 字符串——使用 instanceof + 诊断字段
 */

// ───────────────────────────────────────────────
// @contract InvalidParameterError — 参数非法错误
// ───────────────────────────────────────────────

/**
 * 参数非法错误——用户输入或注入的参数值违反硬约束。
 *
 * 触发条件:
 *   - m ≤ 0 或 m 为 NaN
 *   - L ≤ 0 或 L 为 NaN
 *   - g < 0
 *   - damping < 0
 * 诊断字段:
 *   - key: 非法参数的字段名
 *   - value: 非法值
 *   - constraint: 约束描述（如 "> 0"）
 */
export class InvalidParameterError extends Error {
  readonly key: string;
  readonly value: number;
  readonly constraint: string;

  constructor(key: string, value: number, constraint: string) {
    super(`参数 ${key}=${value} 非法：必须 ${constraint}`);
    this.name = "InvalidParameterError";
    this.key = key;
    this.value = value;
    this.constraint = constraint;
  }
}

// ───────────────────────────────────────────────
// @contract NavigationLockedError — 导航锁定错误
// ───────────────────────────────────────────────

/**
 * 导航锁定错误——故事模式期间尝试手动切换模式。
 *
 * 触发条件: 故事自动播放中，用户点击导航 Tab 或按键盘 1-4
 * 诊断字段:
 *   - targetMode: 用户尝试切换到的目标模式
 *   - lockReason: 锁定原因描述
 */
export class NavigationLockedError extends Error {
  readonly targetMode: string;
  readonly lockReason: string;

  constructor(targetMode: string, lockReason: string) {
    super(`导航已锁定（${lockReason}），无法切换到 ${targetMode}`);
    this.name = "NavigationLockedError";
    this.targetMode = targetMode;
    this.lockReason = lockReason;
  }
}
