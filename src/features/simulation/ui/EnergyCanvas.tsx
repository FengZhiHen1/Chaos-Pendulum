import { useRef, useEffect, useLayoutEffect, useCallback } from "react";
import * as d3Scale from "d3-scale";
import { useSimulationStore } from "../store";

// ─── 类型 ──────────────────────────────────────

export interface EnergyDataPoint {
  t: number;
  K: number;
  V: number;
  E: number;
}

interface EnergyCanvasProps {
  width: number;
  height: number;
  timeWindow: number;
  showComponents: boolean;
}

// ─── 常量 ──────────────────────────────────────

const MARGIN = { top: 20, right: 80, bottom: 30, left: 60 };
const IDLE_FPS = 2;
const IDLE_INTERVAL = 1000 / IDLE_FPS;
const COLORS = {
  E: "#22c55e",
  K: "#3b82f6",
  V: "#f97316",
  grid: "#1e293b",
  axisLabel: "#94a3b8",
  legend: "#cbd5e1",
};

// ─── 组件 ──────────────────────────────────────

export function EnergyCanvas({
  width,
  height,
  timeWindow,
  showComponents,
}: EnergyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<EnergyDataPoint[]>([]);
  const yRangeRef = useRef<[number, number]>([Infinity, -Infinity]);
  const lastXDomainRef = useRef<[number, number]>([0, timeWindow]);
  const rafRef = useRef(0);
  const isVisibleRef = useRef(true);
  const lastIdleDrawRef = useRef(0);
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);

  // ── 离屏坐标轴渲染 ─────────────────────────

  const redrawOffscreen = useCallback(
    (yMin: number, yMax: number, xMin?: number, xMax?: number) => {
      const offscreen = offscreenRef.current;
      if (!offscreen) return;
      if (!isFinite(yMin) || !isFinite(yMax)) return;

      const dpr = window.devicePixelRatio || 1;
      offscreen.width = width * dpr;
      offscreen.height = height * dpr;
      const octx = offscreen.getContext("2d")!;
      octx.scale(dpr, dpr);

      // 背景
      octx.fillStyle = "#0a0a1a";
      octx.fillRect(0, 0, width, height);

      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.bottom - MARGIN.top;

      const xDomainMin = xMin ?? 0;
      const xDomainMax = xMax ?? timeWindow;

      const xScale = d3Scale
        .scaleLinear()
        .domain([xDomainMin, xDomainMax])
        .range([MARGIN.left, MARGIN.left + plotW]);

      const yScale = d3Scale
        .scaleLinear()
        .domain([yMin, yMax])
        .range([MARGIN.top + plotH, MARGIN.top])
        .nice();

      // 网格线
      octx.save();
      octx.strokeStyle = COLORS.grid;
      octx.lineWidth = 0.5;
      octx.setLineDash([2, 4]);

      const yTicks = yScale.ticks(5);
      for (const yt of yTicks) {
        const yy = yScale(yt);
        octx.beginPath();
        octx.moveTo(MARGIN.left, yy);
        octx.lineTo(width - MARGIN.right, yy);
        octx.stroke();
      }

      const xTicks = xScale.ticks(4);
      for (const xt of xTicks) {
        const xx = xScale(xt);
        octx.beginPath();
        octx.moveTo(xx, MARGIN.top);
        octx.lineTo(xx, height - MARGIN.bottom);
        octx.stroke();
      }
      octx.restore();

      // 坐标轴
      octx.save();
      octx.strokeStyle = COLORS.axisLabel;
      octx.fillStyle = COLORS.axisLabel;
      octx.lineWidth = 1;
      octx.setLineDash([]);
      octx.font = '10px "Courier New", monospace';
      octx.textAlign = "center";
      octx.textBaseline = "top";

      // X 轴
      octx.beginPath();
      octx.moveTo(MARGIN.left, height - MARGIN.bottom);
      octx.lineTo(width - MARGIN.right, height - MARGIN.bottom);
      octx.stroke();
      for (const xt of xTicks) {
        const xx = xScale(xt);
        octx.fillText(
          xt.toFixed(0),
          xx,
          height - MARGIN.bottom + 6,
        );
      }
      // X 轴标签
      octx.textBaseline = "bottom";
      octx.fillText(
        "时间 (s)",
        MARGIN.left + plotW / 2,
        height - 2,
      );

      // Y 轴
      octx.textAlign = "right";
      octx.textBaseline = "middle";
      octx.beginPath();
      octx.moveTo(MARGIN.left, MARGIN.top);
      octx.lineTo(MARGIN.left, height - MARGIN.bottom);
      octx.stroke();
      for (const yt of yTicks) {
        const yy = yScale(yt);
        octx.fillText(yt.toFixed(1), MARGIN.left - 6, yy);
      }
      octx.restore();

      // 图例
      octx.save();
      octx.font = '10px "Courier New", monospace';
      octx.textAlign = "left";
      octx.textBaseline = "middle";
      const lx = width - MARGIN.right + 10;
      let ly = MARGIN.top + 5;

      octx.strokeStyle = COLORS.E;
      octx.lineWidth = 2;
      octx.setLineDash([]);
      octx.beginPath();
      octx.moveTo(lx, ly);
      octx.lineTo(lx + 20, ly);
      octx.stroke();
      octx.fillStyle = COLORS.E;
      octx.fillText("E", lx + 25, ly);

      if (showComponents) {
        ly += 16;
        octx.strokeStyle = COLORS.K;
        octx.lineWidth = 1;
        octx.setLineDash([4, 4]);
        octx.beginPath();
        octx.moveTo(lx, ly);
        octx.lineTo(lx + 20, ly);
        octx.stroke();
        octx.fillStyle = COLORS.K;
        octx.fillText("K", lx + 25, ly);

        ly += 16;
        octx.strokeStyle = COLORS.V;
        octx.lineWidth = 1;
        octx.setLineDash([1, 3]);
        octx.beginPath();
        octx.moveTo(lx, ly);
        octx.lineTo(lx + 20, ly);
        octx.stroke();
        octx.fillStyle = COLORS.V;
        octx.fillText("V", lx + 25, ly);
      }
      octx.restore();
    },
    [width, height, timeWindow, showComponents],
  );

  // ── 初始化与 resize ─────────────────────────

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    offscreenRef.current = offscreen;
    redrawOffscreen(-1, 1, 0, timeWindow);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 可见性降频 ─────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry!.isIntersecting;
      },
      { threshold: 0 },
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    redrawOffscreen(
      yRangeRef.current[0],
      yRangeRef.current[1],
      lastXDomainRef.current[0],
      lastXDomainRef.current[1],
    );
  }, [width, height, redrawOffscreen]);

  // ── 重置时清空缓冲区（useLayoutEffect 确保在浏览器绘制前执行）──

  useLayoutEffect(() => {
    bufferRef.current.length = 0;
    yRangeRef.current = [Infinity, -Infinity];
    lastXDomainRef.current = [0, timeWindow];
    const offscreen = offscreenRef.current;
    if (offscreen) {
      redrawOffscreen(-1, 1, 0, timeWindow);
    }
  }, [resetTrigger, timeWindow, redrawOffscreen]);

  // ── 每帧绘制 ───────────────────────────────

  useEffect(() => {
    let running = true;

    function drawFrame(timestamp: number) {
      if (!running) return;

      if (!isVisibleRef.current) {
        if (timestamp - lastIdleDrawRef.current < IDLE_INTERVAL) {
          rafRef.current = requestAnimationFrame(drawFrame);
          return;
        }
        lastIdleDrawRef.current = timestamp;
      }

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

      const store = useSimulationStore.getState();
      const currentTime = store.t;
      const buffer = bufferRef.current;

      // 追加新数据点（仅在正向积分且有效帧时追加）
      if (
        store.isRunning &&
        store.isSimulationActive &&
        !isNaN(store.totalEnergy)
      ) {
        // 避免重复追加同一帧
        const lastPt = buffer.length > 0 ? buffer[buffer.length - 1] : null;
        if (!lastPt || Math.abs(lastPt.t - currentTime) > 0.001) {
          buffer.push({
            t: currentTime,
            K: store.kineticEnergy,
            V: store.potentialEnergy,
            E: store.totalEnergy,
          });

          // FIFO：容量 = timeWindow * 60
          const cap = timeWindow * 60;
          while (buffer.length > cap) buffer.shift();
        }
      }

      // 清空主 Canvas
      ctx.clearRect(0, 0, width, height);

      // 复制离屏坐标轴
      ctx.drawImage(offscreen, 0, 0);

      // 无数据 → 仅显示坐标轴
      if (buffer.length < 2) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // 滑动窗口：仿真初期固定从 0 开始，后期正常滑动
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.bottom - MARGIN.top;

      let xDomainMin: number, xDomainMax: number;
      if (currentTime < timeWindow) {
        xDomainMin = 0;
        xDomainMax = timeWindow;
      } else {
        xDomainMin = currentTime - timeWindow;
        xDomainMax = currentTime;
      }

      // 检测 X 轴 domain 是否变化（按整数秒判断，减少离屏重绘频率）
      const [lastXMin, lastXMax] = lastXDomainRef.current;
      const xDomainChanged =
        Math.floor(lastXMin) !== Math.floor(xDomainMin) ||
        Math.floor(lastXMax) !== Math.floor(xDomainMax);
      if (xDomainChanged) {
        lastXDomainRef.current = [xDomainMin, xDomainMax];
      }

      const windowedData = buffer.filter((d) => d.t >= xDomainMin);

      if (windowedData.length < 2) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // X 轴比例尺（与离屏坐标轴 domain 保持一致）
      const xScale = d3Scale
        .scaleLinear()
        .domain([xDomainMin, xDomainMax])
        .range([MARGIN.left, MARGIN.left + plotW]);

      // Y 轴范围自适应（基于可见窗口数据的 E/K/V）
      let [yMin, yMax] = yRangeRef.current;
      let yChanged = false;
      {
        let dataMin = Infinity;
        let dataMax = -Infinity;
        for (const d of windowedData) {
          if (!isNaN(d.E)) {
            dataMin = Math.min(dataMin, d.E);
            dataMax = Math.max(dataMax, d.E);
          }
          if (showComponents) {
            if (!isNaN(d.K)) {
              dataMin = Math.min(dataMin, d.K);
              dataMax = Math.max(dataMax, d.K);
            }
            if (!isNaN(d.V)) {
              dataMin = Math.min(dataMin, d.V);
              dataMax = Math.max(dataMax, d.V);
            }
          }
        }

        const range = dataMax - dataMin;
        const padding = range > 0 ? range * 0.12 : 1.0;
        const newYMin = dataMin - padding;
        const newYMax = dataMax + padding;

        const isUninit = !isFinite(yMin) || !isFinite(yMax);
        const needsExpand = newYMin < yMin || newYMax > yMax;
        const prevRange = yMax - yMin;
        const newRange = newYMax - newYMin;
        // 当范围显著收缩时（>15%）也更新，避免残留大量空白
        const significantShrink =
          !isUninit && prevRange > 0 && (prevRange - newRange) / prevRange > 0.15;

        if (isUninit || needsExpand || significantShrink) {
          yMin = newYMin;
          yMax = newYMax;
          yRangeRef.current = [yMin, yMax];
          yChanged = true;
        }
      }

      // 离屏坐标轴重绘（X 或 Y 变化时）
      if (yChanged || xDomainChanged) {
        redrawOffscreen(yMin, yMax, xDomainMin, xDomainMax);
      }

      // Y 轴比例尺
      const yScale = d3Scale
        .scaleLinear()
        .domain(yRangeRef.current)
        .range([MARGIN.top + plotH, MARGIN.top]);

      // 降采样
      const renderData =
        windowedData.length > 600
          ? windowedData.filter((_, i) => i % 2 === 0)
          : windowedData;

      // 绘制曲线
      ctx.save();

      // E 线（总能量）：绿色实线
      ctx.strokeStyle = COLORS.E;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      const firstE = renderData[0]!;
      ctx.moveTo(xScale(firstE.t), yScale(firstE.E));
      for (let i = 1; i < renderData.length; i++) {
        const pt = renderData[i]!;
        ctx.lineTo(xScale(pt.t), yScale(pt.E));
      }
      ctx.stroke();

      if (showComponents) {
        // K 线（动能）：蓝色虚线
        ctx.strokeStyle = COLORS.K;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xScale(renderData[0]!.t), yScale(renderData[0]!.K));
        for (let i = 1; i < renderData.length; i++) {
          const pt = renderData[i]!;
          ctx.lineTo(xScale(pt.t), yScale(pt.K));
        }
        ctx.stroke();

        // V 线（势能）：橙色点线
        ctx.strokeStyle = COLORS.V;
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 3]);
        ctx.beginPath();
        ctx.moveTo(xScale(renderData[0]!.t), yScale(renderData[0]!.V));
        for (let i = 1; i < renderData.length; i++) {
          const pt = renderData[i]!;
          ctx.lineTo(xScale(pt.t), yScale(pt.V));
        }
        ctx.stroke();
      }

      ctx.restore();

      rafRef.current = requestAnimationFrame(drawFrame);
    }

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, timeWindow, showComponents, redrawOffscreen]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
