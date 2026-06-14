import { useRef, useEffect, useLayoutEffect, useCallback } from "react";
import * as d3Scale from "d3-scale";
import { useSimulationStore } from "../../store";

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
  E: "#4ADE80",
  K: "#4B9FFF",
  V: "#F97316",
  grid: "rgba(255, 255, 255, 0.04)",
  gridMajor: "rgba(255, 255, 255, 0.10)",
  axis: "#9BA0AA",
  axisLabel: "#9BA0AA",
  legend: "#E8EAED",
  bg: "#1E2127",
  zeroLine: "rgba(255, 255, 255, 0.12)",
};
const FONT = '11px "JetBrains Mono", "Manrope", sans-serif';

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
  // 初始用有限值，确保首次 resize 时坐标轴正确绘制
  const yRangeRef = useRef<[number, number]>([-1, 1]);
  const lastXDomainRef = useRef<[number, number]>([0, timeWindow]);
  const rafRef = useRef(0);
  const isVisibleRef = useRef(true);
  const lastIdleDrawRef = useRef(0);
  const wasRunningRef = useRef(false);
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
      octx.fillStyle = COLORS.bg;
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

      const yTicks = yScale.ticks(5);
      const xTicks = xScale.ticks(4);

      // 网格线
      octx.save();
      octx.lineWidth = 0.5;
      octx.setLineDash([2, 4]);
      octx.strokeStyle = COLORS.grid;

      for (const yt of yTicks) {
        const yy = yScale(yt);
        octx.beginPath();
        octx.moveTo(MARGIN.left, yy);
        octx.lineTo(width - MARGIN.right, yy);
        octx.stroke();
      }

      for (const xt of xTicks) {
        const xx = xScale(xt);
        octx.beginPath();
        octx.moveTo(xx, MARGIN.top);
        octx.lineTo(xx, height - MARGIN.bottom);
        octx.stroke();
      }
      octx.restore();

      // 零线
      const yZero = yScale(0);
      if (yZero >= MARGIN.top && yZero <= height - MARGIN.bottom) {
        octx.save();
        octx.strokeStyle = COLORS.zeroLine;
        octx.lineWidth = 1;
        octx.setLineDash([]);
        octx.beginPath();
        octx.moveTo(MARGIN.left, yZero);
        octx.lineTo(width - MARGIN.right, yZero);
        octx.stroke();
        octx.restore();
      }

      // 坐标轴
      octx.save();
      octx.strokeStyle = COLORS.axis;
      octx.fillStyle = COLORS.axisLabel;
      octx.lineWidth = 1;
      octx.setLineDash([]);
      octx.font = FONT;
      octx.textAlign = "center";
      octx.textBaseline = "top";

      // X 轴
      octx.beginPath();
      octx.moveTo(MARGIN.left, height - MARGIN.bottom);
      octx.lineTo(width - MARGIN.right, height - MARGIN.bottom);
      octx.stroke();
      for (const xt of xTicks) {
        const xx = xScale(xt);
        octx.fillText(xt.toFixed(0), xx, height - MARGIN.bottom + 6);
      }
      // X 轴标签
      octx.textBaseline = "bottom";
      octx.fillStyle = COLORS.legend;
      octx.font = '10px "Manrope", sans-serif';
      octx.fillText("时间 (s)", MARGIN.left + plotW / 2, height - 2);

      // Y 轴
      octx.fillStyle = COLORS.axisLabel;
      octx.font = FONT;
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
      octx.font = '11px "JetBrains Mono", "Manrope", sans-serif';
      octx.textAlign = "left";
      octx.textBaseline = "middle";
      const lx = width - MARGIN.right + 10;
      let ly = MARGIN.top + 8;

      const legendItems: Array<{ key: "E" | "K" | "V"; label: string; dash?: number[] }> = [
        { key: "E", label: "E" },
        ...(showComponents ? [
          { key: "K" as const, label: "K", dash: [4, 3] as number[] },
          { key: "V" as const, label: "V", dash: [2, 2] as number[] },
        ] : []),
      ];

      for (const item of legendItems) {
        octx.strokeStyle = COLORS[item.key];
        octx.fillStyle = COLORS[item.key];
        octx.lineWidth = item.key === "E" ? 2 : 1.5;
        octx.setLineDash(item.dash ?? []);
        octx.beginPath();
        octx.moveTo(lx, ly);
        octx.lineTo(lx + 18, ly);
        octx.stroke();
        octx.fillText(item.label, lx + 24, ly);
        ly += 16;
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
    const y0 = yRangeRef.current[0];
    const y1 = yRangeRef.current[1];
    // 用有限值防御首次渲染时 yRange 尚未被真实数据初始化的窗口期
    const yMin = isFinite(y0) ? y0 : -1;
    const yMax = isFinite(y1) ? y1 : 1;
    redrawOffscreen(yMin, yMax, lastXDomainRef.current[0], lastXDomainRef.current[1]);
  }, [width, height, redrawOffscreen]);

  // ── 重置时清空缓冲区（useLayoutEffect 确保在浏览器绘制前执行）──

  useLayoutEffect(() => {
    bufferRef.current.length = 0;
    yRangeRef.current = [-1, 1];
    lastXDomainRef.current = [0, timeWindow];
    wasRunningRef.current = false;
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

      // 仿真启动瞬间：注入 t=0 的初始能量参照点，确保曲线始终从 0 开始
      if (!wasRunningRef.current && store.isRunning && !isNaN(store.totalEnergy)) {
        buffer.push({
          t: 0,
          K: store.kineticEnergy,
          V: store.potentialEnergy,
          E: store.totalEnergy,
        });
      }
      wasRunningRef.current = store.isRunning;

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
        // Y 轴始终包含 0 作为参照线——确保能量曲线始终有零位参照
        let newYMin = dataMin - padding;
        let newYMax = dataMax + padding;
        newYMin = Math.min(0, newYMin);
        newYMax = Math.max(0, newYMax);

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

      // 辅助：绘制单条能量曲线
      const drawEnergyLine = (
        key: "E" | "K" | "V",
        lineWidth: number,
        dash: number[] = [],
        glow = false,
      ) => {
        if (renderData.length < 2) return;
        ctx.save();
        ctx.strokeStyle = COLORS[key];
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        if (glow) {
          ctx.shadowColor = COLORS[key];
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        const first = renderData[0]!;
        ctx.moveTo(xScale(first.t), yScale(first[key]));
        for (let i = 1; i < renderData.length; i++) {
          const pt = renderData[i]!;
          ctx.lineTo(xScale(pt.t), yScale(pt[key]));
        }
        ctx.stroke();
        ctx.restore();
      };

      // E 线填充渐变（总能量下方）
      if (renderData.length >= 2) {
        ctx.save();
        const gradient = ctx.createLinearGradient(0, MARGIN.top, 0, height - MARGIN.bottom);
        gradient.addColorStop(0, `${COLORS.E}33`);
        gradient.addColorStop(1, `${COLORS.E}05`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const first = renderData[0]!;
        ctx.moveTo(xScale(first.t), yScale(first.E));
        for (let i = 1; i < renderData.length; i++) {
          const pt = renderData[i]!;
          ctx.lineTo(xScale(pt.t), yScale(pt.E));
        }
        ctx.lineTo(xScale(renderData[renderData.length - 1]!.t), height - MARGIN.bottom);
        ctx.lineTo(xScale(first.t), height - MARGIN.bottom);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 绘制能量曲线
      drawEnergyLine("E", 2, [], true);
      if (showComponents) {
        drawEnergyLine("K", 1.5, [4, 3]);
        drawEnergyLine("V", 1.5, [2, 2]);
      }

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
