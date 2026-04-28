import { useRef, useEffect, useCallback } from "react";
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
  const yRangeRef = useRef<[number, number]>([-1, 1]);
  const rafRef = useRef(0);

  // ── 离屏坐标轴渲染 ─────────────────────────

  const redrawOffscreen = useCallback(
    (yMin: number, yMax: number) => {
      const offscreen = offscreenRef.current;
      if (!offscreen) return;

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

      const xScale = d3Scale
        .scaleLinear()
        .domain([0, timeWindow])
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
      octx.fillText(
        "时间 (s)",
        MARGIN.left + plotW / 2,
        height - 4,
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
    redrawOffscreen(yRangeRef.current[0], yRangeRef.current[1]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    redrawOffscreen(yRangeRef.current[0], yRangeRef.current[1]);
  }, [width, height, redrawOffscreen]);

  // ── 每帧绘制 ───────────────────────────────

  useEffect(() => {
    let running = true;

    function drawFrame() {
      if (!running) return;
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

      // 检测 reset
      if (currentTime < 0.5 && buffer.length > 0 && buffer[buffer.length - 1]!.t > 1) {
        buffer.length = 0;
      }

      // Y 轴范围自适应
      const currentE = store.totalEnergy;
      let [yMin, yMax] = yRangeRef.current;
      if (
        !isNaN(currentE) &&
        (currentE < yMin || currentE > yMax)
      ) {
        yMin = Math.min(yMin, currentE);
        yMax = Math.max(yMax, currentE);
        yRangeRef.current = [yMin, yMax];
        redrawOffscreen(yMin, yMax);
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

      // 滑动窗口过滤
      const windowStart = currentTime - timeWindow;
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.bottom - MARGIN.top;

      const windowedData = buffer.filter((d) => d.t >= windowStart);

      const xScale = d3Scale
        .scaleLinear()
        .domain([windowStart, currentTime])
        .range([MARGIN.left, MARGIN.left + plotW]);

      const yScale = d3Scale
        .scaleLinear()
        .domain(yRangeRef.current)
        .range([MARGIN.top + plotH, MARGIN.top]);

      // 降采样
      const renderData =
        windowedData.length > 600
          ? windowedData.filter((_, i) => i % 2 === 0)
          : windowedData;

      if (renderData.length < 2) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

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
