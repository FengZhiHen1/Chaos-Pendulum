import { useRef, useEffect, useLayoutEffect } from "react";
import * as d3Scale from "d3-scale";
import { useSimulationStore } from "../../store";
import {
  type PhaseSpaceCanvasProps,
  type TrailPoint,
  type PhaseVariable,
  PHASE_SPACE_MARGIN as MARGIN,
  PHASE_SPACE_COLORS as COLORS,
  Y_AUTO_INTERVAL,
  EMA_SMOOTH,
  MIN_Y_RANGE,
  SHRINK_THRESHOLD,
  normalizeAngle,
  drawSmoothTrail,
  renderOffscreen,
} from "../../view/components/PhaseSpaceCanvasUtils";

export function usePhaseSpaceCanvasRendering({
  width,
  height,
  maxTrailPoints,
  cursorRadius,
  trailWidth,
  activeVariable,
}: PhaseSpaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const trailCacheRef = useRef<Record<PhaseVariable, TrailPoint[]>>({
    theta1: [],
    theta2: [],
  });
  const yDomainCacheRef = useRef<Record<PhaseVariable, [number, number]>>({
    theta1: [-5, 5],
    theta2: [-5, 5],
  });
  const yCheckFrameCacheRef = useRef<Record<PhaseVariable, number>>({
    theta1: 0,
    theta2: 0,
  });
  const decimateFrameCacheRef = useRef<Record<PhaseVariable, number>>({
    theta1: 0,
    theta2: 0,
  });
  const rafRef = useRef(0);
  const activeVarRef = useRef<PhaseVariable>(activeVariable);
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);

  // ── 暴露 export 函数到 canvas 元素 ─────────

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
    renderOffscreen(offscreen, width, height, yDomainCacheRef.current[activeVariable]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── resize ─────────────────────────────────

  useEffect(() => {
    const offscreen = offscreenRef.current;
    if (offscreen) {
      renderOffscreen(offscreen, width, height, yDomainCacheRef.current[activeVariable]);
    }
  }, [width, height]);

  // ── 变量切换 → 切换活跃缓存，保留轨迹 ──

  useEffect(() => {
    activeVarRef.current = activeVariable;
    const yDom = yDomainCacheRef.current[activeVariable];
    const offscreen = offscreenRef.current;
    if (offscreen) {
      renderOffscreen(offscreen, width, height, yDom);
    }
  }, [activeVariable, width, height]);

  // ── 仿真 reset → 清空全部缓存 ──

  useLayoutEffect(() => {
    trailCacheRef.current = { theta1: [], theta2: [] };
    yDomainCacheRef.current = { theta1: [-5, 5], theta2: [-5, 5] };
    yCheckFrameCacheRef.current = { theta1: 0, theta2: 0 };
    decimateFrameCacheRef.current = { theta1: 0, theta2: 0 };
    const offscreen = offscreenRef.current;
    if (offscreen) {
      renderOffscreen(offscreen, width, height, [-5, 5]);
    }
  }, [resetTrigger, width, height]);

  // ── rAF 渲染循环 (30fps) ──────────────────

  useEffect(() => {
    let running = true;
    let lastFrameTime = 0;
    const frameInterval = 1000 / 30;

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

      const store = useSimulationStore.getState();
      const isRunning = store.isRunning;
      const av = activeVarRef.current;
      const trail = trailCacheRef.current[av];
      const yDomain = yDomainCacheRef.current[av];

      if (isRunning) {
        const thetaRaw =
          av === "theta1" ? store.theta1 : store.theta2;
        const thetaDot =
          av === "theta1" ? store.theta1Dot : store.theta2Dot;

        if (!isNaN(thetaRaw) && !isNaN(thetaDot)) {
          const theta = normalizeAngle(thetaRaw);

          trail.push({ theta, thetaDot });
          while (trail.length > maxTrailPoints) {
            trail.shift();
          }

          yCheckFrameCacheRef.current[av]++;
          if (yCheckFrameCacheRef.current[av] >= Y_AUTO_INTERVAL) {
            yCheckFrameCacheRef.current[av] = 0;
            if (trail.length > 0) {
              let absMax = 0;
              for (const p of trail) {
                const aval = Math.abs(p.thetaDot);
                if (aval > absMax) absMax = aval;
              }
              absMax = Math.max(absMax * 1.1, 1.0);

              const [oldLo, oldHi] = yDomain;
              const currentAbsMax = Math.max(Math.abs(oldLo), Math.abs(oldHi));
              const newLo = -absMax;
              const newHi = absMax;

              let nextLo: number, nextHi: number;
              if (absMax < currentAbsMax * SHRINK_THRESHOLD) {
                nextLo = newLo;
                nextHi = newHi;
              } else {
                nextLo = oldLo * (1 - EMA_SMOOTH) + newLo * EMA_SMOOTH;
                nextHi = oldHi * (1 - EMA_SMOOTH) + newHi * EMA_SMOOTH;
              }

              if (nextHi - nextLo < MIN_Y_RANGE) {
                const center = (nextLo + nextHi) / 2;
                nextLo = center - MIN_Y_RANGE / 2;
                nextHi = center + MIN_Y_RANGE / 2;
              }

              yDomain[0] = nextLo;
              yDomain[1] = nextHi;
              renderOffscreen(offscreen, width, height, [nextLo, nextHi]);
            }
          }
        }
      }

      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.top - MARGIN.bottom;

      const xScale = d3Scale
        .scaleLinear()
        .domain([-Math.PI, Math.PI])
        .range([MARGIN.left, MARGIN.left + plotW]);

      const yScale = d3Scale
        .scaleLinear()
        .domain(yDomain)
        .range([MARGIN.top + plotH, MARGIN.top]);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(offscreen, 0, 0);

      const len = trail.length;

      if (len > 0) {
        let renderTrail = trail;
        if (len > maxTrailPoints * 0.9) {
          decimateFrameCacheRef.current[av]++;
          if (decimateFrameCacheRef.current[av] >= 10) {
            decimateFrameCacheRef.current[av] = 0;
            trailCacheRef.current[av] = trail.filter((_, i) => i % 2 === 0);
            renderTrail = trailCacheRef.current[av];
          }
        }

        const rLen = renderTrail.length;

        let segmentStart = 0;
        for (let i = 1; i < rLen; i++) {
          const prevTheta = renderTrail[i - 1]!.theta;
          const currTheta = renderTrail[i]!.theta;
          if (Math.abs(currTheta - prevTheta) > Math.PI) {
            drawSmoothTrail(ctx, renderTrail, segmentStart, i, xScale, yScale, rLen);
            segmentStart = i;
          }
        }
        drawSmoothTrail(ctx, renderTrail, segmentStart, rLen, xScale, yScale, rLen);

        const last = renderTrail[rLen - 1]!;
        const cx = xScale(last.theta);
        const cy = yScale(last.thetaDot);

        ctx.save();
        ctx.shadowColor = COLORS.cursor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = COLORS.cursor;
        ctx.beginPath();
        ctx.arc(cx, cy, cursorRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = COLORS.cursorHighlight;
        ctx.beginPath();
        ctx.arc(cx - cursorRadius * 0.25, cy - cursorRadius * 0.25, cursorRadius * 0.35, 0, Math.PI * 2);
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

  return canvasRef;
}
