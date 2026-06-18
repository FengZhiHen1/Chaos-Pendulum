/**
 * 模块: analyze.view.components.LyapunovHeatmapUtils
 * 职责: LyapunovHeatmap 的纯工具函数与常量——网格统计、坐标变换、Tooltip 构建、Canvas 绘制。
 *       不含 React 依赖，所有函数无副作用。
 * 边界:
 *   - 仅包含纯函数与常量
 *   - 所有 Canvas 绘制函数接收外部 context，不持有状态
 */

import type { LyapunovGrid, HoverTooltipData } from "../../types";
import { classifyLambda } from "../../types";
import {
  SURFACE_CONTAINER,
  WHITE,
} from "./colorTokens";

/** 游标位置同步防抖间隔（毫秒） */
export const CURSOR_DEBOUNCE_MS = 50;

/** 网格线颜色 */
export const GRID_COLOR = "rgba(155, 160, 170, 0.08)";

/** 图表字体栈 */
export const LABEL_FONT = "'JetBrains Mono', monospace";

/** Lyapunov 指数分类 → Tailwind 文字色 class 映射 */
export const LAMBDA_TONE_CLASS: Record<string, string> = {
  混沌: "text-lyapunov-chaotic",
  稳定: "text-lyapunov-stable",
  准周期: "text-lyapunov-neutral",
  数据缺失: "text-on-surface-variant",
};

/** 遍历网格返回最小/最大值及是否含有有效数据 */
export function calcGridStats(grid: (number | null)[][]): {
  minVal: number;
  maxVal: number;
  hasValid: boolean;
} {
  let minVal = Infinity;
  let maxVal = -Infinity;
  let hasValid = false;
  for (const row of grid) {
    for (const v of row) {
      if (v !== null && !isNaN(v)) {
        hasValid = true;
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
  }
  return { minVal, maxVal, hasValid };
}

/**
 * 将网格值域归一化，供 colorScale 使用。
 *
 * - 值域跨越零时（min < 0 < max）：保留原始范围，零自然在中间
 * - 单侧值域时（全负或全正）：不强制扩展至零，让色阶充分利用实际数据范围
 * - 退化为单点时：±0.5 防止除零
 */
export function normalizeRange(minVal: number, maxVal: number): {
  normMin: number;
  normMax: number;
} {
  let normMin = minVal;
  let normMax = maxVal;
  if (normMin === normMax) { normMin -= 0.5; normMax += 0.5; }
  return { normMin, normMax };
}

/** 鼠标画布坐标 → 网格行列索引 */
export function mouseToCell(
  mx: number, my: number,
  stepsX: number, stepsY: number,
  cellW: number, cellH: number,
): { col: number; row: number; inBounds: boolean } {
  const col = Math.floor(mx / cellW);
  const row = Math.floor(my / cellH);
  const inBounds = col >= 0 && col < stepsX && row >= 0 && row < stepsY;
  return { col, row, inBounds };
}

/** 网格行列索引 → 参数值（取格点中心） */
export function cellToParamValue(
  col: number, row: number,
  px: { min: number; max: number; steps: number },
  py: { min: number; max: number; steps: number },
): { paramXValue: number; paramYValue: number } {
  const paramXValue = px.min + (col + 0.5) / px.steps * (px.max - px.min);
  const paramYValue = py.min + (row + 0.5) / py.steps * (py.max - py.min);
  return { paramXValue, paramYValue };
}

/** 构建 HoverTooltip 数据 */
export function buildTooltipData(
  gridData: LyapunovGrid,
  value: number | null,
  col: number,
  row: number,
  mouseX: number,
  mouseY: number,
  activeDamping: number,
): HoverTooltipData {
  const { label } = classifyLambda(value, gridData.metadata.type);
  const px = gridData.metadata.paramX;
  const py = gridData.metadata.paramY;
  const { paramXValue, paramYValue } = cellToParamValue(col, row, px, py);
  return {
    visible: true,
    position: { x: mouseX, y: mouseY },
    lambdaValue: value,
    lambdaLabel: label,
    paramXValue,
    paramYValue,
    paramXName: px.name,
    paramYName: py.name,
    dampingValue: gridData.metadata.dampingValue ?? activeDamping,
  };
}

/** 构建空 Tooltip（隐藏） */
export function emptyTooltipData(): HoverTooltipData {
  return {
    visible: false,
    position: { x: 0, y: 0 },
    lambdaValue: null,
    lambdaLabel: "",
    paramXValue: 0,
    paramYValue: 0,
    paramXName: "",
    paramYName: "",
    dampingValue: undefined,
  };
}

/** 提取轴标签文本 */
export function getAxisLabels(gridData: LyapunovGrid | null): {
  axisXLabel: string;
  axisYLabel: string;
} {
  if (!gridData) return { axisXLabel: "", axisYLabel: "" };
  const px = gridData.metadata.paramX;
  const py = gridData.metadata.paramY;
  return {
    axisXLabel: `${px.name} (${px.unit || "-"})`,
    axisYLabel: `${py.name} (${py.unit || "-"})`,
  };
}

/** 在离屏 Canvas 上逐格点填充颜色 */
export function renderHeatmapCells(
  offCtx: OffscreenCanvasRenderingContext2D,
  grid: (number | null)[][],
  stepsX: number, stepsY: number,
  cellW: number, cellH: number,
  colorScale: (value: number) => string,
): void {
  for (let y = 0; y < stepsY; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < stepsX; x++) {
      const v = row[x];
      const px = Math.floor(x * cellW);
      const py = Math.floor(y * cellH);
      const pw = Math.ceil((x + 1) * cellW) - px;
      const ph = Math.ceil((y + 1) * cellH) - py;
      if (v === null || v === undefined || isNaN(v)) {
        offCtx.fillStyle = SURFACE_CONTAINER;
      } else {
        offCtx.fillStyle = colorScale(v);
      }
      offCtx.fillRect(px, py, pw, ph);
    }
  }
}

/** 在离屏 Canvas 上绘制网格线 */
export function renderGridLines(
  offCtx: OffscreenCanvasRenderingContext2D,
  stepsX: number, stepsY: number,
  cellW: number, cellH: number,
  width: number, height: number,
): void {
  offCtx.strokeStyle = GRID_COLOR;
  offCtx.lineWidth = 1;
  offCtx.beginPath();
  for (let i = 0; i <= stepsX; i++) {
    const x = Math.floor(i * cellW) + 0.5;
    offCtx.moveTo(x, 0);
    offCtx.lineTo(x, height);
  }
  for (let i = 0; i <= stepsY; i++) {
    const y = Math.floor(i * cellH) + 0.5;
    offCtx.moveTo(0, y);
    offCtx.lineTo(width, y);
  }
  offCtx.stroke();
}

/** 在 Canvas 上绘制十字准星游标 */
export function drawCursorCrosshair(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number, cy: number, dpr: number,
): void {
  ctx.save();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2 * dpr;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 2 * dpr;

  ctx.beginPath();
  ctx.arc(cx, cy, 6 * dpr, 0, Math.PI * 2);
  ctx.stroke();

  const crossLen = 4 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx - crossLen - 6 * dpr, cy);
  ctx.lineTo(cx + crossLen + 6 * dpr, cy);
  ctx.moveTo(cx, cy - crossLen - 6 * dpr);
  ctx.lineTo(cx, cy + crossLen + 6 * dpr);
  ctx.stroke();

  ctx.restore();
}
