import * as d3Scale from "d3-scale";

// ─── 类型 ──────────────────────────────────────

export type PhaseVariable = "theta1" | "theta2";

export interface TrailPoint {
  theta: number;
  thetaDot: number;
}

export interface PhaseSpaceCanvasProps {
  width: number;
  height: number;
  maxTrailPoints: number;
  cursorRadius: number;
  trailWidth: number;
  activeVariable: PhaseVariable;
}

// ─── 常量 ──────────────────────────────────────

export const PHASE_SPACE_MARGIN = { top: 20, right: 20, bottom: 35, left: 45 };
export const PHASE_SPACE_COLORS = {
  bg: "#1E2127",
  grid: "rgba(255, 255, 255, 0.04)",
  gridMajor: "rgba(255, 255, 255, 0.10)",
  axis: "#9BA0AA",
  cursorGlow: "rgba(75, 159, 255, 0.30)",
  cursor: "#4B9FFF",
  cursorHighlight: "#ffffff",
  trailStart: "#3B82F6",
  trailEnd: "#EF4444",
};
export const X_TICK_VALUES = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
export const X_TICK_LABELS = ["-π", "-π/2", "0", "π/2", "π"];
export const Y_AUTO_INTERVAL = 60;
export const EMA_SMOOTH = 0.2;
export const MIN_Y_RANGE = 2.0;
export const SHRINK_THRESHOLD = 0.7;
export const PHASE_SPACE_FONT = '11px "JetBrains Mono", "Manrope", sans-serif';

// ─── 角度归一化 ────────────────────────────────

export function normalizeAngle(a: number): number {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// ─── 零依赖的 axisX 绘制 ────────────────────────

export function drawXAxis(
  ctx: CanvasRenderingContext2D,
  xScale: d3Scale.ScaleLinear<number, number>,
  plotY: number,
) {
  ctx.save();
  ctx.strokeStyle = PHASE_SPACE_COLORS.axis;
  ctx.fillStyle = PHASE_SPACE_COLORS.axis;
  ctx.lineWidth = 1;
  ctx.font = PHASE_SPACE_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const xMin = xScale.range()[0]!;
  const xMax = xScale.range()[1]!;
  ctx.beginPath();
  ctx.moveTo(xMin, plotY);
  ctx.lineTo(xMax, plotY);
  ctx.stroke();

  for (let i = 0; i < X_TICK_VALUES.length; i++) {
    const val = X_TICK_VALUES[i]!;
    const label = X_TICK_LABELS[i]!;
    const x = xScale(val);
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + 5);
    ctx.stroke();
    if (i === 0) ctx.textAlign = "left";
    else if (i === X_TICK_VALUES.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    ctx.fillText(label, x, plotY + 7);
  }

  ctx.fillStyle = "#E8EAED";
  ctx.font = '10px "Manrope", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("θ (rad)", (xMin + xMax) / 2, plotY + 28);
  ctx.restore();
}

// ─── 零依赖的 axisY 绘制 ────────────────────────

export function drawYAxis(
  ctx: CanvasRenderingContext2D,
  yScale: d3Scale.ScaleLinear<number, number>,
  plotX: number,
) {
  ctx.save();
  ctx.strokeStyle = PHASE_SPACE_COLORS.axis;
  ctx.fillStyle = PHASE_SPACE_COLORS.axis;
  ctx.lineWidth = 1;
  ctx.font = PHASE_SPACE_FONT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const yMin = yScale.range()[1]!;
  const yMax = yScale.range()[0]!;

  ctx.beginPath();
  ctx.moveTo(plotX, yMin);
  ctx.lineTo(plotX, yMax);
  ctx.stroke();

  const ticks = yScale.ticks(5);
  for (const t of ticks) {
    const y = yScale(t);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX - 5, y);
    ctx.stroke();
    ctx.fillText(t.toFixed(1), plotX - 8, y);
  }

  ctx.save();
  ctx.translate(plotX - 32, (yMin + yMax) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#E8EAED";
  ctx.font = '10px "Manrope", sans-serif';
  ctx.fillText("θ̇ (rad/s)", 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── 颜色插值 ─────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b2_ = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b2_})`;
}

// ─── 连续渐变轨迹绘制 ─────────────────────────

export function drawSmoothTrail(
  ctx: CanvasRenderingContext2D,
  points: TrailPoint[],
  startIdx: number,
  endIdx: number,
  xScale: d3Scale.ScaleLinear<number, number>,
  yScale: d3Scale.ScaleLinear<number, number>,
  totalLen: number,
) {
  const segmentLen = endIdx - startIdx;
  if (segmentLen < 2) return;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const t = i / totalLen;
    const alpha = 0.12 + t * 0.78;
    const color = lerpColor(PHASE_SPACE_COLORS.trailStart, PHASE_SPACE_COLORS.trailEnd, t);

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5 + t * 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(xScale(prev.theta), yScale(prev.thetaDot));
    ctx.lineTo(xScale(curr.theta), yScale(curr.thetaDot));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ─── 离线坐标轴渲染 ────────────────────────────

export function renderOffscreen(
  offscreen: HTMLCanvasElement,
  width: number,
  height: number,
  yDomain: [number, number],
) {
  const dpr = window.devicePixelRatio || 1;
  offscreen.width = width * dpr;
  offscreen.height = height * dpr;
  const ctx = offscreen.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = PHASE_SPACE_COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const plotW = width - PHASE_SPACE_MARGIN.left - PHASE_SPACE_MARGIN.right;
  const plotH = height - PHASE_SPACE_MARGIN.top - PHASE_SPACE_MARGIN.bottom;

  const yScale = d3Scale
    .scaleLinear()
    .domain(yDomain)
    .range([PHASE_SPACE_MARGIN.top + plotH, PHASE_SPACE_MARGIN.top]);

  ctx.save();
  ctx.strokeStyle = PHASE_SPACE_COLORS.grid;
  ctx.lineWidth = 0.5;

  const yTicks = yScale.ticks(5);
  for (const yt of yTicks) {
    const yy = yScale(yt);
    ctx.beginPath();
    ctx.moveTo(PHASE_SPACE_MARGIN.left, yy);
    ctx.lineTo(width - PHASE_SPACE_MARGIN.right, yy);
    ctx.stroke();
  }

  ctx.setLineDash([2, 4]);
  for (const xt of X_TICK_VALUES) {
    const xScale = d3Scale
      .scaleLinear()
      .domain([-Math.PI, Math.PI])
      .range([PHASE_SPACE_MARGIN.left, PHASE_SPACE_MARGIN.left + plotW]);
    const xx = xScale(xt);
    ctx.beginPath();
    ctx.moveTo(xx, PHASE_SPACE_MARGIN.top);
    ctx.lineTo(xx, height - PHASE_SPACE_MARGIN.bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const ox = d3Scale
    .scaleLinear()
    .domain([-Math.PI, Math.PI])
    .range([PHASE_SPACE_MARGIN.left, PHASE_SPACE_MARGIN.left + plotW])(0);
  const oy = yScale(0);
  ctx.strokeStyle = PHASE_SPACE_COLORS.gridMajor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(ox, PHASE_SPACE_MARGIN.top);
  ctx.lineTo(ox, height - PHASE_SPACE_MARGIN.bottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(PHASE_SPACE_MARGIN.left, oy);
  ctx.lineTo(width - PHASE_SPACE_MARGIN.right, oy);
  ctx.stroke();

  ctx.restore();

  const xScale = d3Scale
    .scaleLinear()
    .domain([-Math.PI, Math.PI])
    .range([PHASE_SPACE_MARGIN.left, PHASE_SPACE_MARGIN.left + plotW]);

  drawXAxis(ctx, xScale, height - PHASE_SPACE_MARGIN.bottom);
  drawYAxis(ctx, yScale, PHASE_SPACE_MARGIN.left);
}

// ─── 公共导出函数 ──────────────────────────────

export function exportPhaseSpaceImage(
  canvas: HTMLCanvasElement | null,
  scale: number = 1,
): string {
  if (!canvas) return "";
  const w = parseInt(canvas.style.width, 10) || canvas.width;
  const h = parseInt(canvas.style.height, 10) || canvas.height;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = w * scale;
  exportCanvas.height = h * scale;
  const exportCtx = exportCanvas.getContext("2d")!;
  exportCtx.scale(scale, scale);
  exportCtx.drawImage(canvas, 0, 0);
  return exportCanvas.toDataURL("image/png");
}
