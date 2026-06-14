/**
 * 模块: analyze.viewModel.hooks.useBifurcationRendering
 * 职责: 分岔图 Canvas 渲染与 d3-zoom 交互逻辑抽离。
 *       管理比例尺、绘制回调、缩放变换和双向游标同步。
 * 边界:
 *   - 依赖 d3-scale / d3-zoom / d3-selection
 *   - 使用共享 perf-mark 测量渲染性能
 *   - 返回 transformRef 与比例尺供外部（鼠标交互）消费
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select as d3Select } from "d3-selection";
import { useSimulationStore } from "@/features/simulation";
import { measure } from "@/shared/infrastructure/observability/perf-mark";
import type { BifurcationData, BifurcationCursor, BifurcationHoverData } from "../../types";
import { resolveStoreParam } from "../../types";
import {
  SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  ON_PRIMARY,
  LYAPUNOV_STABLE,
  LYAPUNOV_CHAOTIC,
  SEPARATION_ALERT,
  WHITE,
} from "../../view/components/colorTokens";
import {
  MARGIN,
  CURSOR_HIT_RADIUS_PX,
  MAX_RENDER_POINTS_PER_STEP,
  computeVisibleDomain,
  buildCurrentScales,
} from "../../view/components/BifurcationPlotUtils";

interface UseBifurcationRenderingInput {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerSize: { cw: number; ch: number; ready: boolean };
  dpr: number;
  data: BifurcationData | null;
  cursor: BifurcationCursor;
  hover: BifurcationHoverData;
  pointRadius: number;
  isDraggingCursorRef: React.MutableRefObject<boolean>;
  cursorXRef: React.MutableRefObject<number>;
  lastSyncedValueRef: React.MutableRefObject<number | null>;
}

export function useBifurcationRendering({
  canvasRef,
  containerSize: { cw, ch, ready: sizeReady },
  dpr,
  data,
  cursor,
  hover,
  pointRadius,
  isDraggingCursorRef,
  cursorXRef,
  lastSyncedValueRef,
}: UseBifurcationRenderingInput) {
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  // ── D3 比例尺 ───────────────────────────────────
  const xScale = useMemo(() => {
    if (!data) return scaleLinear().domain([0, 1]).range([0, 1]);
    const { scannedParam } = data.metadata;
    return scaleLinear()
      .domain([scannedParam.min, scannedParam.max])
      .range([MARGIN.left, (cw || 0) - MARGIN.right]);
  }, [data, cw]);

  const yScale = useMemo(() => {
    if (!data) return scaleLinear().domain([0, 1]).range([0, 1]);
    const { sampledVariable } = data.metadata;
    const min = sampledVariable.min;
    const max = sampledVariable.max;
    const ext = max === min ? 1 : 0;
    return scaleLinear()
      .domain([min - ext, max + ext])
      .range([(ch || 0) - MARGIN.bottom, MARGIN.top]);
  }, [data, ch]);

  // ── Canvas 渲染 ───────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !sizeReady || cw === 0 || ch === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = Math.floor(cw * dpr);
    const h = Math.floor(ch * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }

    const { samples, metadata } = data;
    const { scannedParam, sampledVariable } = metadata;
    const steps = scannedParam.steps;
    const stepSize = (scannedParam.max - scannedParam.min) / steps;

    // 应用 zoom transform 到 domain
    const t = transformRef.current;
    const domain = computeVisibleDomain(t, xScale, yScale, cw, ch);
    const { currentXScale, currentYScale } = buildCurrentScales(domain, cw, ch);

    const renderFn = () => {
      ctx.clearRect(0, 0, w, h);

      // 背景
      ctx.fillStyle = SURFACE;
      ctx.fillRect(0, 0, w, h);

      // 绘制区域裁剪（margin 内）
      const plotLeft = MARGIN.left;
      const plotRight = cw - MARGIN.right;
      const plotTop = MARGIN.top;
      const plotBottom = ch - MARGIN.bottom;

      // 网格线
      ctx.save();
      ctx.strokeStyle = "rgba(155, 160, 170, 0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      for (let i = 0; i <= 10; i++) {
        const x = plotLeft + (plotRight - plotLeft) * (i / 10);
        ctx.beginPath();
        ctx.moveTo(x * dpr, plotTop * dpr);
        ctx.lineTo(x * dpr, plotBottom * dpr);
        ctx.stroke();
      }
      for (let i = 0; i <= 8; i++) {
        const y = plotTop + (plotBottom - plotTop) * (i / 8);
        ctx.beginPath();
        ctx.moveTo(plotLeft * dpr, y * dpr);
        ctx.lineTo(plotRight * dpr, y * dpr);
        ctx.stroke();
      }
      ctx.restore();

      // 按 regime 分组绘制（先周期，后混沌）
      const drawGroup = (predicate: (len: number) => boolean, color: string) => {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < steps; i++) {
          const paramVal = scannedParam.min + ((i + 0.5) / steps) * (scannedParam.max - scannedParam.min);
          if (paramVal < domain.x0 - stepSize || paramVal > domain.x1 + stepSize) continue;

          const pts = samples[i];
          if (!pts || pts.length === 0) continue;
          if (!predicate(pts.length)) continue;

          const px = currentXScale(paramVal) * dpr;
          let drawPts = pts;
          if (drawPts.length > MAX_RENDER_POINTS_PER_STEP) {
            drawPts = drawPts.sort(() => Math.random() - 0.5).slice(0, MAX_RENDER_POINTS_PER_STEP);
          }
          for (const v of drawPts) {
            if (v < domain.y0 || v > domain.y1) continue;
            const py = currentYScale(v) * dpr;
            ctx.beginPath();
            ctx.arc(px, py, pointRadius * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
      };

      drawGroup((len) => len <= 2, LYAPUNOV_STABLE);
      drawGroup((len) => len >= 3 && len <= 4, PRIMARY);
      drawGroup((len) => len >= 5 && len <= 8, LYAPUNOV_CHAOTIC);
      drawGroup((len) => len > 8, SEPARATION_ALERT);

      // 坐标轴
      ctx.fillStyle = ON_SURFACE_VARIANT;
      ctx.strokeStyle = ON_SURFACE_VARIANT;
      ctx.lineWidth = 1 * dpr;
      ctx.font = `${12 * dpr}px 'JetBrains Mono', monospace`;

      // X 轴
      const xAxisY = plotBottom * dpr;
      ctx.beginPath();
      ctx.moveTo(plotLeft * dpr, xAxisY);
      ctx.lineTo(plotRight * dpr, xAxisY);
      ctx.stroke();

      const xTicks = 6;
      for (let i = 0; i <= xTicks; i++) {
        const t = i / xTicks;
        const val = domain.x0 + (domain.x1 - domain.x0) * t;
        const x = (plotLeft + (plotRight - plotLeft) * t) * dpr;
        ctx.beginPath();
        ctx.moveTo(x, xAxisY);
        ctx.lineTo(x, xAxisY + 5 * dpr);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillText(val.toFixed(2), x, xAxisY + 18 * dpr);
      }

      // Y 轴
      const yAxisX = plotLeft * dpr;
      ctx.beginPath();
      ctx.moveTo(yAxisX, plotTop * dpr);
      ctx.lineTo(yAxisX, plotBottom * dpr);
      ctx.stroke();

      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const t = i / yTicks;
        const val = domain.y0 + (domain.y1 - domain.y0) * t;
        const y = (plotBottom - (plotBottom - plotTop) * t) * dpr;
        ctx.beginPath();
        ctx.moveTo(yAxisX - 5 * dpr, y);
        ctx.lineTo(yAxisX, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(val.toFixed(2), yAxisX - 8 * dpr, y + 4 * dpr);
      }

      // 轴标题
      ctx.font = `${12 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = ON_SURFACE_VARIANT;
      ctx.fillText(
        `${scannedParam.name} (${scannedParam.unit || "-"})`,
        ((plotLeft + plotRight) * 0.5) * dpr,
        (ch - 12) * dpr,
      );
      ctx.save();
      ctx.translate(24 * dpr, ((plotTop + plotBottom) * 0.5) * dpr);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${sampledVariable.name} (${sampledVariable.unit || "-"})`, 0, 0);
      ctx.restore();

      // 游标（竖直虚线）
      if (cursor.visible && cursor.x >= plotLeft && cursor.x <= plotRight) {
        const cx = cursor.x * dpr;
        ctx.save();
        ctx.strokeStyle = PRIMARY;
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(cx, plotTop * dpr);
        ctx.lineTo(cx, plotBottom * dpr);
        ctx.stroke();
        ctx.restore();

        // 顶部标签
        const label = cursor.label;
        ctx.font = `${11 * dpr}px 'JetBrains Mono', monospace`;
        const textW = ctx.measureText(label).width;
        const labelH = 18 * dpr;
        const labelY = (plotTop + 2) * dpr;
        const labelX = Math.min(
          Math.max(cx - textW * 0.5, plotLeft * dpr),
          plotRight * dpr - textW,
        );

        ctx.fillStyle = PRIMARY;
        ctx.beginPath();
        ctx.roundRect(labelX - 4 * dpr, labelY - 2 * dpr, textW + 8 * dpr, labelH, 4 * dpr);
        ctx.fill();
        ctx.fillStyle = ON_PRIMARY;
        ctx.textAlign = "left";
        ctx.fillText(label, labelX, labelY + 11 * dpr);
      }

      // 悬停高亮
      if (hover.visible && hover.sampledValues) {
        const hx = currentXScale(hover.scannedParamValue) * dpr;
        for (const v of hover.sampledValues) {
          if (v < domain.y0 || v > domain.y1) continue;
          const hy = currentYScale(v) * dpr;
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = 2 * dpr;
          ctx.fillStyle = PRIMARY;
          ctx.beginPath();
          ctx.arc(hx, hy, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    };

    measure("bifurcation-render", renderFn);
  }, [data, sizeReady, cw, ch, dpr, pointRadius, cursor, hover, xScale, yScale, canvasRef]);

  // ── 触发渲染 ─────────────────────────────────────
  useEffect(() => {
    draw();
  }, [draw, transform]);

  // ── d3-zoom ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const steps = data.metadata.scannedParam.steps;
    const maxK = Math.max(1, steps / 5);

    const z = d3Zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, maxK])
      .extent([[0, 0], [cw, ch]])
      .translateExtent([[0, 0], [cw, ch]])
      .filter((event) => {
        if (isDraggingCursorRef.current) return false;
        if (event.type === "mousedown") {
          const e = event as MouseEvent;
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          if (Math.abs(mx - cursorXRef.current) < CURSOR_HIT_RADIUS_PX + 4) return false;
        }
        return !(event as MouseEvent).ctrlKey && !(event as MouseEvent).button;
      })
      .on("zoom", (event) => {
        const t = event.transform as ZoomTransform;
        const x0 = xScale.invert(-t.x / t.k);
        const x1 = xScale.invert((cw - t.x) / t.k);
        const domainW = x1 - x0;
        const stepSize = (data.metadata.scannedParam.max - data.metadata.scannedParam.min) / steps;
        const minW = 5 * stepSize;
        if (domainW < minW && t.k > maxK) {
          return;
        }
        transformRef.current = t;
        setTransform(t);
      });

    const sel = d3Select(canvas).call(z);

    // 双击重置
    const handleDblClick = () => {
      sel.call(z.transform, zoomIdentity);
      transformRef.current = zoomIdentity;
      setTransform(zoomIdentity);
    };
    canvas.addEventListener("dblclick", handleDblClick);

    return () => {
      sel.on(".zoom", null);
      canvas.removeEventListener("dblclick", handleDblClick);
    };
  }, [data, cw, ch, xScale, canvasRef, isDraggingCursorRef, cursorXRef]);

  // ── 双向联动游标（Zustand subscribe）──────────────
  useEffect(() => {
    if (!data || !sizeReady) return;

    const { scannedParam, fixedParams } = data.metadata;
    const resolved = resolveStoreParam(scannedParam.name, 0, fixedParams);

    const updateCursor = (): boolean => {
      if (!resolved) return false;

      const state = useSimulationStore.getState();

      const storeMap: Record<string, number | undefined> = {
        m1: state.params.m1,
        m2: state.params.m2,
        L1: state.params.L1,
        L2: state.params.L2,
        g: state.params.g,
        damping: state.params.damping,
        theta1: state.initialConditions.theta1,
        theta2: state.initialConditions.theta2,
        theta1Dot: state.initialConditions.theta1Dot,
        theta2Dot: state.initialConditions.theta2Dot,
      };

      const val = storeMap[resolved.storeKey];
      if (val === undefined || val < scannedParam.min || val > scannedParam.max) {
        return false;
      }

      // 跳过冗余更新
      if (lastSyncedValueRef.current === val) return true;
      lastSyncedValueRef.current = val;

      // 拖动中不覆盖游标位置
      if (isDraggingCursorRef.current) return true;

      const t = transformRef.current;
      const domain = computeVisibleDomain(t, xScale, yScale, cw, ch);
      const { currentXScale } = buildCurrentScales(domain, cw, ch);

      const cx = currentXScale(val);
      cursorXRef.current = cx;
      return true;
    };

    // 订阅仿真 store 变更
    const unsub = useSimulationStore.subscribe(() => {
      if (isDraggingCursorRef.current) return;
      updateCursor();
    });

    updateCursor();
    return () => unsub();
  }, [data, sizeReady, cw, xScale, yScale, isDraggingCursorRef, cursorXRef, lastSyncedValueRef]);

  return { transformRef, xScale, yScale };
}
