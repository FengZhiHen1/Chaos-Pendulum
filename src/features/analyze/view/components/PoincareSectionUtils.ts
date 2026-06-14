/**
 * 模块: analyze.ui.PoincareSectionUtils
 * 职责: PoincareSection 的纯工具函数与常量——坐标映射、Y 域扩展，无 React 依赖。
 * 边界:
 *   - 仅包含纯函数与常量，不引入 React
 *   - 所有函数无副作用
 */

import type { PoincarePoint } from "@/shared/domain/valueObjects";

export const X_MIN = -Math.PI;
export const X_MAX = Math.PI;
export const Y_MIN_INITIAL = -10;
export const Y_MAX_INITIAL = 10;
export const Y_CLAMP = 50;
export const Y_EXPAND_MARGIN = 0.2;

/** Y 轴域 */
export interface YDomain {
  min: number;
  max: number;
}

/** 将庞加莱点映射到 Canvas 像素坐标 */
export function mapPoint(
  pt: PoincarePoint,
  xDomain: [number, number],
  yDomain: YDomain,
  width: number,
  height: number,
): [number, number] {
  const x = ((pt.theta2 - xDomain[0]) / (xDomain[1] - xDomain[0])) * width;
  const y = height - ((pt.omega2 - yDomain.min) / (yDomain.max - yDomain.min)) * height;
  return [x, y];
}

/** 检查值是否超出当前 Y 域，若超出则返回扩展后的域（受 Y_CLAMP 硬限制） */
export function expandDomain(value: number, domain: YDomain): YDomain | null {
  if (value >= domain.min && value <= domain.max) return null;

  let newMin = domain.min;
  let newMax = domain.max;
  const range = domain.max - domain.min;

  if (value < domain.min) {
    newMin = value - range * Y_EXPAND_MARGIN;
  }
  if (value > domain.max) {
    newMax = value + range * Y_EXPAND_MARGIN;
  }

  // 硬限制
  if (newMin < -Y_CLAMP) newMin = -Y_CLAMP;
  if (newMax > Y_CLAMP) newMax = Y_CLAMP;

  return { min: newMin, max: newMax };
}
