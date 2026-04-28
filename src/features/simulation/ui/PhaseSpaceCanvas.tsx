import { useRef, useEffect } from "react";
import * as d3Scale from "d3-scale";
import { useSimulationStore } from "../store";

// ─── 类型 ──────────────────────────────────────

export type PhaseVariable = "theta1" | "theta2";

interface TrailPoint {
  theta: number;
  thetaDot: number;
}

interface PhaseSpaceCanvasProps {
  width: number;
  height: number;
  maxTrailPoints: number;
  cursorRadius: number;
  trailWidth: number;
  activeVariable: PhaseVariable;
}

// ─── 常量 ──────────────────────────────────────

const MARGIN = { top: 20, right: 20, bottom: 35, left: 45 };
const COLORS = {
  bg: "#0a0a1a",
  grid: "rgba(255,255,255,0.06)",
  gridMajor: "rgba(255,255,255,0.12)",
  axis: "#94a3b8",
  cursorGlow: "rgba(0, 255, 255, 0.25)",
  cursor: "#00ffff",
  cursorHighlight: "#ffffff",
};
const X_TICK_VALUES = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
const X_TICK_LABELS = ["-π", "-π/2", "0", "π/2", "π"];
const Y_AUTO_INTERVAL = 60; // 每 60 帧检查一次 Y 轴
const EMA_SMOOTH = 0.2;

// ─── 角度归一化 ────────────────────────────────

function normalizeAngle(a: number): number {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// ─── 零依赖的 axisX 绘制 ────────────────────────

function drawXAxis(
  ctx: CanvasRenderingContext2D,
  xScale: d3Scale.ScaleLinear<number, number>,
  plotY: number,
) {
  ctx.save();
  ctx.strokeStyle = COLORS.axis;
  ctx.fillStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.font = '10px "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // 轴线
  const xMin = xScale.range()[0]!;
  const xMax = xScale.range()[1]!;
  ctx.beginPath();
  ctx.moveTo(xMin, plotY);
  ctx.lineTo(xMax, plotY);
  ctx.stroke();

  // 刻度与标签
  for (let i = 0; i < X_TICK_VALUES.length; i++) {
    const val = X_TICK_VALUES[i]!;
    const label = X_TICK_LABELS[i]!;
    const x = xScale(val);
    // 刻度线
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + 5);
    ctx.stroke();
    // 标签
    ctx.fillText(label, x, plotY + 7);
  }

  // 轴标题
  ctx.fillText("θ (rad)", (xMin + xMax) / 2, plotY + 22);
  ctx.restore();
}

// ─── 零依赖的 axisY 绘制 ────────────────────────

function drawYAxis(
  ctx: CanvasRenderingContext2D,
  yScale: d3Scale.ScaleLinear<number, number>,
  plotX: number,
) {
  ctx.save();
  ctx.strokeStyle = COLORS.axis;
  ctx.fillStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.font = '10px "Courier New", monospace';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const yMin = yScale.range()[1]!;
  const yMax = yScale.range()[0]!;

  // 轴线
  ctx.beginPath();
  ctx.moveTo(plotX, yMin);
  ctx.lineTo(plotX, yMax);
  ctx.stroke();

  // 刻度
  const ticks = yScale.ticks(5);
  for (const t of ticks) {
    const y = yScale(t);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX - 5, y);
    ctx.stroke();
    ctx.fillText(t.toFixed(1), plotX - 8, y);
  }

  // 轴标题
  ctx.save();
  ctx.translate(plotX - 32, (yMin + yMax) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("θ̇ (rad/s)", 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── 离线坐标轴渲染 ────────────────────────────

function renderOffscreen(
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

  // 背景
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const yScale = d3Scale
    .scaleLinear()
    .domain(yDomain)
    .range([MARGIN.top + plotH, MARGIN.top]);

  // 网格线
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;

  // 水平网格（Y 轴刻度）
  const yTicks = yScale.ticks(5);
  for (const yt of yTicks) {
    const yy = yScale(yt);
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, yy);
    ctx.lineTo(width - MARGIN.right, yy);
    ctx.stroke();
  }

  // 垂直网格（固定 X 轴刻度）
  ctx.setLineDash([2, 4]);
  for (const xt of X_TICK_VALUES) {
    const xScale = d3Scale
      .scaleLinear()
      .domain([-Math.PI, Math.PI])
      .range([MARGIN.left, MARGIN.left + plotW]);
    const xx = xScale(xt);
    ctx.beginPath();
    ctx.moveTo(xx, MARGIN.top);
    ctx.lineTo(xx, height - MARGIN.bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 原点十字线
  const ox = d3Scale
    .scaleLinear()
    .domain([-Math.PI, Math.PI])
    .range([MARGIN.left, MARGIN.left + plotW])(0);
  const oy = yScale(0);
  ctx.strokeStyle = COLORS.gridMajor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(ox, MARGIN.top);
  ctx.lineTo(ox, height - MARGIN.bottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, oy);
  ctx.lineTo(width - MARGIN.right, oy);
  ctx.stroke();

  ctx.restore();

  // 坐标轴
  const xScale = d3Scale
    .scaleLinear()
    .domain([-Math.PI, Math.PI])
    .range([MARGIN.left, MARGIN.left + plotW]);

  drawXAxis(ctx, xScale, height - MARGIN.bottom);
  drawYAxis(ctx, yScale, MARGIN.left);
}

// ─── 组件 ──────────────────────────────────────

export function PhaseSpaceCanvas({
  width,
  height,
  maxTrailPoints,
  cursorRadius,
  trailWidth,
  activeVariable,
}: PhaseSpaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const yDomainRef = useRef<[number, number]>([-5, 5]);
  const frameCountRef = useRef(0);
  const rafRef = useRef(0);
  const activeVarRef = useRef<PhaseVariable>(activeVariable);

  // 暴露 export 函数到 canvas 元素
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      (canvas as HTMLCanvasElement & { exportImage: (s?: number) => string }).exportImage =
        (scale = 1) => {
          const exportCanvas = document.createElement("canvas");
          exportCanvas.width = width * scale;
          exportCanvas.height = height * scale;
          const exportCtx = exportCanvas.getContext("2d")!;
          exportCtx.scale(scale, scale);
          exportCtx.drawImage(canvas, 0, 0);
          return exportCanvas.toDataURL("image/png");
        };
    }
  }, [width, height]);

  // ── 离线坐标轴初始化 ──────────────────────

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    offscreenRef.current = offscreen;
    renderOffscreen(offscreen, width, height, yDomainRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── resize ─────────────────────────────────

  useEffect(() => {
    const offscreen = offscreenRef.current;
    if (offscreen) {
      renderOffscreen(offscreen, width, height, yDomainRef.current);
    }
  }, [width, height]);

  // ── 变量切换 → 清空轨迹 ──────────────────

  useEffect(() => {
    activeVarRef.current = activeVariable;
    trailRef.current.length = 0;
    yDomainRef.current = [-5, 5];
    const offscreen = offscreenRef.current;
    if (offscreen) {
      renderOffscreen(offscreen, width, height, [-5, 5]);
    }
  }, [activeVariable, width, height]);

  // ── rAF 渲染循环 (30fps) ──────────────────

  useEffect(() => {
    let running = true;
    let lastFrameTime = 0;
    const frameInterval = 1000 / 30; // 30fps

    function drawFrame(timestamp: number) {
      if (!running) return;

      if (timestamp - lastFrameTime < frameInterval) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }
      lastFrameTime = timestamp;

      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;
      if (!canvas || !offscreen) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      // ── 数据采集 ──
      const store = useSimulationStore.getState();
      const isRunning = store.isRunning;

      if (isRunning) {
        const thetaRaw =
          activeVarRef.current === "theta1" ? store.theta1 : store.theta2;
        const thetaDot =
          activeVarRef.current === "theta1" ? store.theta1Dot : store.theta2Dot;

        if (!isNaN(thetaRaw) && !isNaN(thetaDot)) {
          const theta = normalizeAngle(thetaRaw);

          // 追加轨迹点
          trailRef.current.push({ theta, thetaDot });
          while (trailRef.current.length > maxTrailPoints) {
            trailRef.current.shift();
          }

          // Y 轴自适应
          frameCountRef.current++;
          if (frameCountRef.current >= Y_AUTO_INTERVAL) {
            frameCountRef.current = 0;
            const buffer = trailRef.current;
            if (buffer.length > 0) {
              let absMax = 0;
              for (const p of buffer) {
                const av = Math.abs(p.thetaDot);
                if (av > absMax) absMax = av;
              }
              absMax = Math.max(absMax * 1.1, 1.0); // 10% 余量，最少 ±1
              const [oldLo, oldHi] = yDomainRef.current;
              const newLo = -absMax;
              const newHi = absMax;
              // EMA 平滑
              const smLo = oldLo * (1 - EMA_SMOOTH) + newLo * EMA_SMOOTH;
              const smHi = oldHi * (1 - EMA_SMOOTH) + newHi * EMA_SMOOTH;
              yDomainRef.current = [smLo, smHi];
              renderOffscreen(offscreen, width, height, [smLo, smHi]);
            }
          }
        }
      }

      // ── 绘制 ──
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.top - MARGIN.bottom;

      const xScale = d3Scale
        .scaleLinear()
        .domain([-Math.PI, Math.PI])
        .range([MARGIN.left, MARGIN.left + plotW]);

      const yScale = d3Scale
        .scaleLinear()
        .domain(yDomainRef.current)
        .range([MARGIN.top + plotH, MARGIN.top]);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(offscreen, 0, 0);

      const trail = trailRef.current;
      const len = trail.length;

      if (len > 0) {
        // 每 10 帧稀疏化：保留奇数索引点
        let renderTrail = trail;
        if (len > maxTrailPoints * 0.9 && frameCountRef.current % 10 === 0) {
          trailRef.current = trail.filter((_, i) => i % 2 === 0);
          renderTrail = trailRef.current;
        }

        const rLen = renderTrail.length;

        // 绘制轨迹点（旧→新）
        for (let i = 0; i < rLen; i++) {
          const { theta, thetaDot } = renderTrail[i]!;
          const alpha = 0.05 + (i / rLen) * 0.75; // 旧点 5%，新点 80%
          const x = xScale(theta);
          const y = yScale(thetaDot);

          const r = 30 + (i / rLen) * 25;
          const g = 80 + (i / rLen) * 175;
          const b = 150 + (i / rLen) * 105;

          ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
          const halfW = trailWidth / 2;
          ctx.fillRect(x - halfW, y - halfW, trailWidth, trailWidth);
        }

        // 当前位置高亮（最上层）
        const last = renderTrail[rLen - 1]!;
        const cx = xScale(last.theta);
        const cy = yScale(last.thetaDot);

        // 外发光
        ctx.fillStyle = COLORS.cursorGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, cursorRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // 核心点
        ctx.fillStyle = COLORS.cursor;
        ctx.beginPath();
        ctx.arc(cx, cy, cursorRadius, 0, Math.PI * 2);
        ctx.fill();

        // 白色高光
        ctx.fillStyle = COLORS.cursorHighlight;
        ctx.beginPath();
        ctx.arc(cx, cy, cursorRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    }

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, maxTrailPoints, cursorRadius, trailWidth, activeVariable]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
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
