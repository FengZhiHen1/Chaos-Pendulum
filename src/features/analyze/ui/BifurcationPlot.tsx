import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select as d3Select } from "d3-selection";
import { useContainerSize } from "@/shared/viewModel/hooks/useContainerSize";
import { useSimulationStore } from "@/features/simulation";
import { usePrecomputeData } from "@/features/analyze/hooks/usePrecomputeData";
import { measure } from "@/shared/infrastructure/observability/perf-mark";
import { Button } from "@/shared/view/components/ui/button";
import type { BifurcationData, BifurcationHoverData, BifurcationCursor } from "../types";
import { classifyRegime, resolveStoreParam } from "../types";
import { BifurcationDialog } from "./BifurcationDialog";

const CURSOR_HIT_RADIUS_PX = 8;
const CLICK_PROXIMITY_PX = 12;
const HOVER_THROTTLE_MS = 16;
const MAX_RENDER_POINTS_PER_STEP = 50;

interface Props {
  dataPath: string;
  pointRadius?: number;
}

const MARGIN = { top: 20, right: 20, bottom: 50, left: 60 };

export function BifurcationPlot({ dataPath, pointRadius = 1.8 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingCursorRef = useRef(false);
  const cursorXRef = useRef(0);
  const cursorDragValueRef = useRef(0); // 拖动中的实时参数值（绕过 React state 闭包过期）
  const lastSyncedValueRef = useRef<number | null>(null); // 跳过冗余 setCursor
  const transformRef = useRef<ZoomTransform>(zoomIdentity);

  const { width: cw, height: ch, ready: sizeReady } = useContainerSize({ ref: containerRef, debounceMs: 100 });
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const simInjectParams = useSimulationStore((s) => s.injectParams);
  const simSetRunning = useSimulationStore((s) => s.setRunning);

  const [data, setData] = useState<BifurcationData | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hover, setHover] = useState<BifurcationHoverData>({
    visible: false, position: { x: 0, y: 0 }, scannedParamValue: 0,
    scannedParamName: "", sampledValues: null, sampledVariableName: "",
    pointCount: 0, regime: "无数据",
  });
  const [cursor, setCursor] = useState<BifurcationCursor>({
    visible: false, paramValue: 0, x: 0, label: "",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParamValue, setDialogParamValue] = useState<number | null>(null);
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

  // ── 数据加载（SYS-03 usePrecomputeData）─────────────
  const type = "bifurcation";
  const gridHash = (dataPath.match(/-([a-f0-9]+)\.json$/) ?? [])[1] ?? "";

  const precomputeState = usePrecomputeData<BifurcationData>({
    dataType: type,
    dataUrl: dataPath,
    expectedGridHash: gridHash,
    expectedType: type,
  });

  // 额外领域校验：scan range 有效性
  const domainValid = useMemo(() => {
    if (!precomputeState.data) return null;
    const { scannedParam } = precomputeState.data.metadata;
    return scannedParam.max > scannedParam.min ? precomputeState.data : null;
  }, [precomputeState.data]);

  useEffect(() => {
    if (precomputeState.status === "loading") {
      setLoadStatus("loading");
      setLoadError(null);
    } else if (precomputeState.status === "ready" && domainValid) {
      setData(domainValid);
      setLoadStatus("ready");
    } else if (precomputeState.status === "ready" && !domainValid) {
      setLoadError("扫描范围无效");
      setLoadStatus("error");
    } else if (precomputeState.status === "error") {
      setLoadError(precomputeState.errorMessage ?? "未知错误");
      setLoadStatus("error");
    }
  }, [precomputeState, domainValid]);

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
    const x0 = xScale.invert((-t.x / t.k));
    const x1 = xScale.invert((cw - t.x) / t.k);
    const y0 = yScale.invert((ch - t.y) / t.k);
    const y1 = yScale.invert((-t.y) / t.k);

    const currentXScale = scaleLinear().domain([x0, x1]).range([MARGIN.left, cw - MARGIN.right]);
    const currentYScale = scaleLinear().domain([y0, y1]).range([ch - MARGIN.bottom, MARGIN.top]);

    const renderFn = () => {
      ctx.clearRect(0, 0, w, h);

      // 背景
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, w, h);

      // 绘制区域裁剪（margin 内）
      const plotLeft = MARGIN.left;
      const plotRight = cw - MARGIN.right;
      const plotTop = MARGIN.top;
      const plotBottom = ch - MARGIN.bottom;

      // 网格线
      ctx.save();
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
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
          const paramVal = scannedParam.min + (i + 0.5) / steps * (scannedParam.max - scannedParam.min);
          if (paramVal < x0 - stepSize || paramVal > x1 + stepSize) continue;

          const pts = samples[i];
          if (!pts || pts.length === 0) continue;
          if (!predicate(pts.length)) continue;

          const px = currentXScale(paramVal) * dpr;
          let drawPts = pts;
          if (drawPts.length > MAX_RENDER_POINTS_PER_STEP) {
            // 随机采样
            drawPts = drawPts.sort(() => Math.random() - 0.5).slice(0, MAX_RENDER_POINTS_PER_STEP);
          }
          for (const v of drawPts) {
            if (v < y0 || v > y1) continue;
            const py = currentYScale(v) * dpr;
            ctx.beginPath();
            ctx.arc(px, py, pointRadius * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
      };

      drawGroup((len) => len <= 2, "#1a5fb4");
      drawGroup((len) => len >= 3 && len <= 4, "#865ea8");
      drawGroup((len) => len >= 5 && len <= 8, "#c06140");
      drawGroup((len) => len > 8, "#e01b24");

      // 坐标轴
      ctx.fillStyle = "#333333";
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1 * dpr;
      ctx.font = `${12 * dpr}px sans-serif`;

      // X 轴
      const xAxisY = plotBottom * dpr;
      ctx.beginPath();
      ctx.moveTo(plotLeft * dpr, xAxisY);
      ctx.lineTo(plotRight * dpr, xAxisY);
      ctx.stroke();

      const xTicks = 6;
      for (let i = 0; i <= xTicks; i++) {
        const t = i / xTicks;
        const val = x0 + (x1 - x0) * t;
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
        const val = y0 + (y1 - y0) * t;
        const y = (plotBottom - (plotBottom - plotTop) * t) * dpr;
        ctx.beginPath();
        ctx.moveTo(yAxisX - 5 * dpr, y);
        ctx.lineTo(yAxisX, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(val.toFixed(2), yAxisX - 8 * dpr, y + 4 * dpr);
      }

      // 轴标题
      ctx.font = `${14 * dpr}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${scannedParam.name} / ${scannedParam.unit || "-"}`, (plotLeft + plotRight) * 0.5 * dpr, (ch - 8) * dpr);
      ctx.save();
      ctx.translate(14 * dpr, (plotTop + plotBottom) * 0.5 * dpr);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${sampledVariable.name} / ${sampledVariable.unit || "-"}`, 0, 0);
      ctx.restore();

      // 游标（竖直虚线）
      if (cursor.visible && cursor.x >= plotLeft && cursor.x <= plotRight) {
        const cx = cursor.x * dpr;
        ctx.save();
        ctx.strokeStyle = "#ff6600";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(cx, plotTop * dpr);
        ctx.lineTo(cx, plotBottom * dpr);
        ctx.stroke();
        ctx.restore();

        // 顶部标签
        const label = cursor.label;
        ctx.font = `${11 * dpr}px sans-serif`;
        const textW = ctx.measureText(label).width;
        const labelH = 18 * dpr;
        const labelY = (plotTop + 2) * dpr;
        const labelX = Math.min(Math.max(cx - textW * 0.5, plotLeft * dpr), plotRight * dpr - textW);

        ctx.fillStyle = "#ff6600";
        ctx.beginPath();
        ctx.roundRect(labelX - 4 * dpr, labelY - 2 * dpr, textW + 8 * dpr, labelH, 4 * dpr);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(label, labelX, labelY + 11 * dpr);
      }

      // 悬停高亮
      if (hover.visible && hover.sampledValues) {
        const hx = currentXScale(hover.scannedParamValue) * dpr;
        for (const v of hover.sampledValues) {
          if (v < y0 || v > y1) continue;
          const hy = currentYScale(v) * dpr;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 * dpr;
          ctx.fillStyle = "#333333";
          ctx.beginPath();
          ctx.arc(hx, hy, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    };

    measure("bifurcation-render", renderFn);
  }, [data, sizeReady, cw, ch, dpr, pointRadius, cursor, hover, xScale, yScale]);

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
        // 防止过度放大
        const x0 = xScale.invert((-t.x / t.k));
        const x1 = xScale.invert((cw - t.x) / t.k);
        const domainW = x1 - x0;
        const stepSize = (data.metadata.scannedParam.max - data.metadata.scannedParam.min) / steps;
        const minW = 5 * stepSize;
        if (domainW < minW && t.k > maxK) {
          // 阻止进一步放大
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
  }, [data, cw, ch, xScale]);

  // ── 鼠标悬停（节流）───────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data || loadStatus !== "ready") return;

    if (hoverThrottleRef.current) return;
    hoverThrottleRef.current = setTimeout(() => {
      hoverThrottleRef.current = null;
    }, HOVER_THROTTLE_MS);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { scannedParam, sampledVariable } = data.metadata;
    const steps = scannedParam.steps;

    // 应用当前 transform 的 scale
    const t = transformRef.current;
    const x0 = xScale.invert((-t.x / t.k));
    const x1 = xScale.invert((cw - t.x) / t.k);
    const currentXScale = scaleLinear().domain([x0, x1]).range([MARGIN.left, cw - MARGIN.right]);

    const paramVal = currentXScale.invert(mx);
    let idx = Math.round((paramVal - scannedParam.min) / (scannedParam.max - scannedParam.min) * (steps - 1));
    idx = Math.max(0, Math.min(steps - 1, idx));

    const pts = data.samples[idx];
    const count = pts ? pts.length : 0;

    setHover({
      visible: true,
      position: { x: mx, y: my },
      scannedParamValue: scannedParam.min + (idx + 0.5) / steps * (scannedParam.max - scannedParam.min),
      scannedParamName: scannedParam.name,
      sampledValues: pts || null,
      sampledVariableName: sampledVariable.name,
      pointCount: count,
      regime: classifyRegime(count),
    });
  }, [data, loadStatus, cw, ch, xScale]);

  const handleMouseLeave = useCallback(() => {
    setHover((prev) => ({ ...prev, visible: false }));
  }, []);

  // ── 游标拖拽 ──────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data || !cursor.visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    if (Math.abs(mx - cursor.x) < CURSOR_HIT_RADIUS_PX + 4) {
      isDraggingCursorRef.current = true;
      e.stopPropagation();
    }
  }, [data, cursor.visible, cursor.x]);

  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (!isDraggingCursorRef.current || !data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const t = transformRef.current;
    const x0 = xScale.invert((-t.x / t.k));
    const x1 = xScale.invert((cw - t.x) / t.k);
    const currentXScale = scaleLinear().domain([x0, x1]).range([MARGIN.left, cw - MARGIN.right]);

    let val = currentXScale.invert(mx);
    val = Math.max(data.metadata.scannedParam.min, Math.min(data.metadata.scannedParam.max, val));

    cursorDragValueRef.current = val;
    cursorXRef.current = currentXScale(val);
    setCursor({
      visible: true,
      paramValue: val,
      x: cursorXRef.current,
      label: `当前: ${val.toFixed(3)} ${data.metadata.scannedParam.unit}`,
    });
  }, [data, cw, xScale]);

  const handleMouseUpGlobal = useCallback(() => {
    if (!isDraggingCursorRef.current || !data) {
      isDraggingCursorRef.current = false;
      return;
    }
    isDraggingCursorRef.current = false;

    const { scannedParam, fixedParams } = data.metadata;
    // 从 ref 读取拖动终点的实时值（避免 React state 闭包过期）
    const val = cursorDragValueRef.current;
    const resolved = resolveStoreParam(scannedParam.name, val, fixedParams);
    if (!resolved) {
      console.warn(`[BifurcationPlot] 参数名无法映射: ${scannedParam.name}`);
      return;
    }

    // 分类注入 params / initialConditions
    const isIC = ["theta1", "theta2", "theta1Dot", "theta2Dot"].includes(resolved.storeKey);
    if (isIC) {
      simInjectParams({}, { [resolved.storeKey]: resolved.storeValue } as Record<string, number>);
    } else {
      simInjectParams({ [resolved.storeKey]: resolved.storeValue } as Record<string, number>, {});
    }
    lastSyncedValueRef.current = val;
    simSetRunning(true);
  }, [data, simInjectParams, simSetRunning]);

  useEffect(() => {
    if (!data) return;
    window.addEventListener("mousemove", handleMouseMoveGlobal);
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("mouseup", handleMouseUpGlobal);
    };
  }, [data, handleMouseMoveGlobal, handleMouseUpGlobal]);

  // ── 点击散点区域 ──────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data || isDraggingCursorRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { scannedParam } = data.metadata;
    const steps = scannedParam.steps;

    const t = transformRef.current;
    const x0 = xScale.invert((-t.x / t.k));
    const x1 = xScale.invert((cw - t.x) / t.k);
    const y0 = yScale.invert((ch - t.y) / t.k);
    const y1 = yScale.invert((-t.y) / t.k);
    const currentXScale = scaleLinear().domain([x0, x1]).range([MARGIN.left, cw - MARGIN.right]);
    const currentYScale = scaleLinear().domain([y0, y1]).range([ch - MARGIN.bottom, MARGIN.top]);

    const paramVal = currentXScale.invert(mx);
    let idx = Math.round((paramVal - scannedParam.min) / (scannedParam.max - scannedParam.min) * (steps - 1));
    idx = Math.max(0, Math.min(steps - 1, idx));

    const pts = data.samples[idx];
    if (!pts || pts.length === 0) return;

    // 检查 Y 是否靠近任意散点 ±12px
    const nearPoint = pts.some((v) => {
      if (v < y0 || v > y1) return false;
      const py = currentYScale(v);
      return Math.abs(py - my) < CLICK_PROXIMITY_PX;
    });

    if (!nearPoint) return;

    const actualVal = scannedParam.min + (idx + 0.5) / steps * (scannedParam.max - scannedParam.min);
    setDialogParamValue(actualVal);
    setDialogOpen(true);
  }, [data, cw, ch, xScale, yScale]);

  // ── 参数填充确认 ──────────────────────────────────
  const handleConfirmFill = useCallback(() => {
    if (dialogParamValue === null || !data) return;
    const { scannedParam, fixedParams } = data.metadata;
    const resolved = resolveStoreParam(scannedParam.name, dialogParamValue, fixedParams);
    if (!resolved) return;

    const isIC = ["theta1", "theta2", "theta1Dot", "theta2Dot"].includes(resolved.storeKey);
    if (isIC) {
      simInjectParams({}, { [resolved.storeKey]: resolved.storeValue } as Record<string, number>);
    } else {
      simInjectParams({ [resolved.storeKey]: resolved.storeValue } as Record<string, number>, {});
    }
    simSetRunning(true);
    setDialogOpen(false);
    setDialogParamValue(null);
  }, [dialogParamValue, data, simInjectParams, simSetRunning]);

  // ── 双向联动游标（Zustand subscribe）──────────────
  useEffect(() => {
    if (!data || !sizeReady) return;

    // 反向查找：从 scannedParam.name 解析对应的 storeKey
    const { scannedParam, fixedParams } = data.metadata;
    const resolved = resolveStoreParam(scannedParam.name, 0, fixedParams);

    const updateCursor = () => {
      if (!resolved) {
        setCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      const state = useSimulationStore.getState();

      // 多路径读取：params + initialConditions
      const storeMap: Record<string, number | undefined> = {
        m1: state.params.m1, m2: state.params.m2,
        L1: state.params.L1, L2: state.params.L2,
        g: state.params.g, damping: state.params.damping,
        theta1: state.initialConditions.theta1,
        theta2: state.initialConditions.theta2,
        theta1Dot: state.initialConditions.theta1Dot,
        theta2Dot: state.initialConditions.theta2Dot,
      };

      const val = storeMap[resolved.storeKey];
      if (val === undefined || val < scannedParam.min || val > scannedParam.max) {
        setCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      // 跳过冗余更新：值未变化时不重新 render
      if (lastSyncedValueRef.current === val) return;
      lastSyncedValueRef.current = val;

      // 拖动中不覆盖游标位置（由 handleMouseMoveGlobal 控制）
      if (isDraggingCursorRef.current) return;

      const t = transformRef.current;
      const x0 = xScale.invert((-t.x / t.k));
      const x1 = xScale.invert((cw - t.x) / t.k);
      const currentXScale = scaleLinear().domain([x0, x1]).range([MARGIN.left, cw - MARGIN.right]);

      const cx = currentXScale(val);
      setCursor({
        visible: true,
        paramValue: val,
        x: cx,
        label: `当前: ${val.toFixed(3)} ${scannedParam.unit}`,
      });
      cursorXRef.current = cx;
    };

    // 订阅仿真 store 变更。updateCursor 内部有值相等 + 拖动守卫，避免冗余 setCursor。
    const unsub = useSimulationStore.subscribe(() => {
      if (isDraggingCursorRef.current) return; // 拖动中由鼠标事件控制
      updateCursor();
    });

    updateCursor();
    return () => unsub();
  }, [data, sizeReady, cw, xScale]);

  // ── 重试 ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    precomputeState.retry();
  }, [precomputeState.retry]);

  return (
    <div className="flex flex-col h-full w-full gap-2">
      <div ref={containerRef} className="relative flex-1 min-h-0 rounded-md overflow-hidden border border-white/5">
        {(loadStatus === "loading" || loadStatus === "idle") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-full h-full animate-pulse bg-surface-container/20" />
          </div>
        )}

        {loadStatus === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface">
            <p className="text-sm text-on-surface">{loadError}</p>
            {precomputeState.errorCode === "PRECOMPUTE_FORMAT_ERROR" ? (
              <p className="text-xs text-on-surface-variant">数据格式错误，请重新生成预计算数据</p>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleRetry}>
                重试
              </Button>
            )}
          </div>
        )}

        {loadStatus === "ready" && data && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onClick={handleClick}
            />

            {/* HUD */}
            {hover.visible && (
              <div
                className="absolute z-50 pointer-events-none rounded-md border border-white/5 bg-surface-container-low px-2 py-1 text-xs text-on-surface shadow-md"
                style={{
                  left: Math.min(hover.position.x + 12, (cw || 0) - 180),
                  top: Math.max(hover.position.y - 12, 0),
                }}
              >
                <div>
                  {hover.scannedParamName} = {hover.scannedParamValue.toFixed(4)}
                  {hover.scannedParamName.includes("θ") ? " rad" : ""}
                </div>
                <div className="mt-0.5">
                  采样点：{hover.pointCount}（{hover.regime}）
                </div>
                {hover.sampledValues && hover.sampledValues.length > 0 && (
                  <div className="mt-0.5 text-on-surface-variant max-w-[200px] truncate">
                    {hover.sampledVariableName} = {"{"}
                    {hover.sampledValues.slice(0, 6).map((v) => v.toFixed(2)).join(", ")}
                    {hover.sampledValues.length > 6 ? ", ..." : ""}
                    {"}"}
                  </div>
                )}
                {hover.sampledValues && hover.sampledValues.length === 0 && (
                  <div className="mt-0.5 text-gray-400">无有效数据</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {dialogOpen && dialogParamValue !== null && data && (
        <BifurcationDialog
          data={data}
          paramValue={dialogParamValue}
          onConfirm={handleConfirmFill}
          onCancel={() => {
            setDialogOpen(false);
            setDialogParamValue(null);
          }}
        />
      )}

    </div>
  );
}
