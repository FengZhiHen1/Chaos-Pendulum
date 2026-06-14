/**
 * 模块: analyze.ui.BifurcationPlotUtils
 * 职责: BifurcationPlot 的纯工具函数——坐标变换、域计算、格式化，无 React 依赖。
 * 边界:
 *   - 仅包含纯函数与常量，不引入 React
 *   - 所有函数无副作用
 */

import { scaleLinear, type ScaleLinear } from "d3-scale";
import type { ZoomTransform } from "d3-zoom";

/** Chart margin (CSS px) */
export const MARGIN = { top: 20, right: 20, bottom: 50, left: 60 };

/** 游标命中半径 */
export const CURSOR_HIT_RADIUS_PX = 8;

/** 散点点击判定距离 */
export const CLICK_PROXIMITY_PX = 12;

/** 悬停节流间隔 */
export const HOVER_THROTTLE_MS = 16;

/** 每步最大渲染点数（降采样） */
export const MAX_RENDER_POINTS_PER_STEP = 50;

/** 可见域 */
export interface VisibleDomain {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 从 zoom transform 计算可见数据域 */
export function computeVisibleDomain(
  transform: ZoomTransform,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>,
  cw: number,
  ch: number,
): VisibleDomain {
  return {
    x0: xScale.invert(-transform.x / transform.k),
    x1: xScale.invert((cw - transform.x) / transform.k),
    y0: yScale.invert((ch - transform.y) / transform.k),
    y1: yScale.invert(-transform.y / transform.k),
  };
}

/** 从可见域构建当前比例尺（含 margin） */
export function buildCurrentScales(
  domain: VisibleDomain,
  cw: number,
  ch: number,
): {
  currentXScale: ScaleLinear<number, number>;
  currentYScale: ScaleLinear<number, number>;
} {
  return {
    currentXScale: scaleLinear()
      .domain([domain.x0, domain.x1])
      .range([MARGIN.left, cw - MARGIN.right]),
    currentYScale: scaleLinear()
      .domain([domain.y0, domain.y1])
      .range([ch - MARGIN.bottom, MARGIN.top]),
  };
}

/** clamp 数值到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 鼠标 X → 参数步索引 */
export function mouseToParamIndex(
  mx: number,
  currentXScale: ScaleLinear<number, number>,
  scannedParamMin: number,
  scannedParamMax: number,
  steps: number,
): number {
  const paramVal = currentXScale.invert(mx);
  const idx = Math.round(
    ((paramVal - scannedParamMin) / (scannedParamMax - scannedParamMin)) * (steps - 1),
  );
  return clamp(idx, 0, steps - 1);
}

/** 步索引 → 参数值（取步中心） */
export function paramValueAtIndex(
  scannedParamMin: number,
  scannedParamMax: number,
  idx: number,
  steps: number,
): number {
  return scannedParamMin + ((idx + 0.5) / steps) * (scannedParamMax - scannedParamMin);
}

/** 格式化游标标签 */
export function formatCursorLabel(value: number, unit: string): string {
  return `当前: ${value.toFixed(3)} ${unit}`;
}
