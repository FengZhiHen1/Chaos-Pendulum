/**
 * 模块: analyze.contracts.exceptions
 * 职责: 定义 analyze 功能域的异常层次——数据加载失败、缓存异常。
 * 边界:
 *   - 依赖: 无
 *   - 被依赖: analysis-tools.contract
 */

/** 预计算数据加载失败——不阻断实时仿真 */
export class PrecomputeLoadError extends Error {
  readonly type: string;
  readonly reason: string;

  constructor(type: string, reason: string) {
    super(`预计算数据加载失败 (${type}): ${reason}`);
    this.name = "PrecomputeLoadError";
    this.type = type;
    this.reason = reason;
  }
}

/** IndexedDB 缓存异常 */
export class CacheError extends Error {
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`IndexedDB 缓存操作失败 (${operation}): ${message}`);
    this.name = "CacheError";
    this.operation = operation;
  }
}
