import { useCallback, useEffect, useRef, useState } from "react";
import { scaleSequential } from "d3-scale";
import { interpolateRdBu, interpolateViridis } from "d3-scale-chromatic";
import { useAnalyzeStore } from "../store";
import { useSimulationStore } from "@/features/simulation";
import { useAppStore } from "@/stores/useAppStore";
import { useContainerSize } from "@/shared/hooks/useContainerSize";
import { usePrecomputeData } from "@/shared/lib/cache/precomputeCache";
import { measure } from "@/shared/lib/observability/perf-mark";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import type { LyapunovGrid, LyapunovLayerType, HeatmapCursor, HoverTooltipData } from "../types";
import { classifyLambda, resolveStoreParam } from "../types";
import { ParameterFillDialog } from "./ParameterFillDialog";

const CURSOR_DEBOUNCE_MS = 50;

interface Props {
  dataPaths: {
    lyapunov_max: string;
    lyapunov_min: string;
    energy_curvature: string;
  };
}

export function LyapunovHeatmap({ dataPaths }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const cursorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width: cw, height: ch, ready: sizeReady } = useContainerSize({ ref: containerRef, debounceMs: 100 });
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const activeLayer = useAnalyzeStore((s) => s.activeLayer);
  const setActiveLayer = useAnalyzeStore((s) => s.setActiveLayer);
  const setLoadStatus = useAnalyzeStore((s) => s.setLoadStatus);
  const setLoadError = useAnalyzeStore((s) => s.setLoadError);
  const setLayerCacheStatus = useAnalyzeStore((s) => s.setLayerCacheStatus);
  const setHoverTooltip = useAnalyzeStore((s) => s.setHoverTooltip);
  const loadStatus = useAnalyzeStore((s) => s.loadStatus);
  const loadError = useAnalyzeStore((s) => s.loadError);

  const simInjectParams = useSimulationStore((s) => s.injectParams);
  const simSetRunning = useSimulationStore((s) => s.setRunning);

  const [gridData, setGridData] = useState<LyapunovGrid | null>(null);
  const [layerCache, setLayerCache] = useState<Map<LyapunovLayerType, LyapunovGrid>>(new Map());
  const [cursor, setCursor] = useState<HeatmapCursor>({ visible: false, x: 0, y: 0, paramXValue: 0, paramYValue: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCell, setDialogCell] = useState<{ col: number; row: number } | null>(null);

  // ── 数据加载（SYS-03 usePrecomputeData）─────────────
  const activePath = dataPaths[activeLayer] ?? "";
  const activeHash = (activePath.match(/-([a-f0-9]+)\.json$/) ?? [])[1] ?? "";

  const precomputeState = usePrecomputeData<LyapunovGrid>({
    dataType: activeLayer,
    dataUrl: activePath,
    expectedGridHash: activeHash,
    expectedType: activeLayer,
  });

  // 同步到 component state 和 store
  useEffect(() => {
    if (precomputeState.status === "loading") {
      setLoadStatus("loading");
      setLoadError(null);
    } else if (precomputeState.status === "ready" && precomputeState.data) {
      setGridData(precomputeState.data);
      setLayerCache((prev) => new Map(prev).set(activeLayer, precomputeState.data!));
      setLoadStatus("ready");
      setLayerCacheStatus(activeLayer, "ready");
    } else if (precomputeState.status === "error") {
      setLoadError(precomputeState.errorMessage ?? "未知错误");
      setLoadStatus("error");
      setLayerCacheStatus(activeLayer, "error");
    }
  }, [precomputeState, activeLayer, setLoadStatus, setLoadError, setLayerCacheStatus]);

  // 图层切换时，如缓存命中则立即展示
  useEffect(() => {
    if (layerCache.has(activeLayer)) {
      setGridData(layerCache.get(activeLayer)!);
      setLoadStatus("ready");
      setLayerCacheStatus(activeLayer, "ready");
    }
  }, [activeLayer, layerCache, setLoadStatus, setLayerCacheStatus]);

  // ── Canvas 渲染 ───────────────────────────────────
  useEffect(() => {
    if (!sizeReady || cw === 0 || ch === 0 || !gridData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("[LyapunovHeatmap] Canvas 2D context 不可用");
      return;
    }

    const width = Math.floor(cw * dpr);
    const height = Math.floor(ch * dpr);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    let offscreen = offscreenRef.current;
    if (!offscreen || offscreen.width !== width || offscreen.height !== height) {
      offscreen = new OffscreenCanvas(width, height);
      offscreenRef.current = offscreen;
    }
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const { grid, metadata } = gridData;
    const stepsX = metadata.paramX.steps;
    const stepsY = metadata.paramY.steps;
    const cellW = width / stepsX;
    const cellH = height / stepsY;

    let minVal = Infinity;
    let maxVal = -Infinity;
    let hasValid = false;
    for (const row of grid) {
      for (const v of row) {
        if (!isNaN(v)) {
          hasValid = true;
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
    }

    if (!hasValid || minVal === Infinity || maxVal === -Infinity) {
      offCtx.fillStyle = "#1a1a2e";
      offCtx.fillRect(0, 0, width, height);
      offCtx.fillStyle = "#ffffff";
      offCtx.font = `${14 * dpr}px sans-serif`;
      offCtx.textAlign = "center";
      offCtx.fillText("该参数范围无有效数据，请更换扫描范围", width / 2, height / 2);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(offscreen, 0, 0);
      return;
    }

    if (maxVal < 0) maxVal = 0;
    if (minVal > 0) minVal = 0;
    if (minVal === maxVal) { minVal -= 0.5; maxVal += 0.5; }

    const colorScale = scaleSequential(
      metadata.type === "energy_curvature"
        ? interpolateViridis
        : (t: number) => interpolateRdBu(1 - t),
    ).domain([minVal, maxVal]);

    const renderFn = () => {
      offCtx.clearRect(0, 0, width, height);

      for (let y = 0; y < stepsY; y++) {
        const row = grid[y];
        if (!row) continue;
        for (let x = 0; x < stepsX; x++) {
          const v = row[x];
          const px = Math.floor(x * cellW);
          const py = Math.floor(y * cellH);
          const pw = Math.ceil((x + 1) * cellW) - px;
          const ph = Math.ceil((y + 1) * cellH) - py;

          if (v === undefined || isNaN(v)) {
            offCtx.fillStyle = "#333333";
          } else {
            offCtx.fillStyle = colorScale(v);
          }
          offCtx.fillRect(px, py, pw, ph);
        }
      }

      offCtx.fillStyle = "#a0a0b0";
      offCtx.font = `${12 * dpr}px sans-serif`;
      offCtx.textAlign = "center";
      offCtx.fillText(metadata.paramX.name, width / 2, height - 4 * dpr);
      offCtx.save();
      offCtx.translate(14 * dpr, height / 2);
      offCtx.rotate(-Math.PI / 2);
      offCtx.fillText(metadata.paramY.name, 0, 0);
      offCtx.restore();
    };

    measure("lyapunov-render", renderFn);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0);
  }, [gridData, cw, ch, sizeReady, dpr]);

  // ── 鼠标交互 ──────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridData || !sizeReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const width = canvas.width;
    const height = canvas.height;

    const stepsX = gridData.metadata.paramX.steps;
    const stepsY = gridData.metadata.paramY.steps;
    const cellW = width / stepsX;
    const cellH = height / stepsY;

    const col = Math.floor(mx / cellW);
    const row = Math.floor(my / cellH);

    if (col < 0 || col >= stepsX || row < 0 || row >= stepsY) {
      setHoverTooltip({
        visible: false,
        position: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        lambdaValue: null,
        lambdaLabel: "",
        paramXValue: 0,
        paramYValue: 0,
        paramXName: "",
        paramYName: "",
      });
      return;
    }

    const value = gridData.grid[row]?.[col] ?? NaN;
    const { label } = classifyLambda(isNaN(value) ? null : value);
    const px = gridData.metadata.paramX;
    const py = gridData.metadata.paramY;
    const paramXValue = px.min + (col + 0.5) / px.steps * (px.max - px.min);
    const paramYValue = py.min + (row + 0.5) / py.steps * (py.max - py.min);

    const tooltipData: HoverTooltipData = {
      visible: true,
      position: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      lambdaValue: isNaN(value) ? null : value,
      lambdaLabel: label,
      paramXValue,
      paramYValue,
      paramXName: px.name,
      paramYName: py.name,
    };
    setHoverTooltip(tooltipData);
  }, [gridData, sizeReady, dpr, setHoverTooltip]);

  const handleMouseLeave = useCallback(() => {
    setHoverTooltip({
      visible: false,
      position: { x: 0, y: 0 },
      lambdaValue: null,
      lambdaLabel: "",
      paramXValue: 0,
      paramYValue: 0,
      paramXName: "",
      paramYName: "",
    });
  }, [setHoverTooltip]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridData || !sizeReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const width = canvas.width;
    const height = canvas.height;

    const stepsX = gridData.metadata.paramX.steps;
    const stepsY = gridData.metadata.paramY.steps;
    const cellW = width / stepsX;
    const cellH = height / stepsY;

    const col = Math.floor(mx / cellW);
    const row = Math.floor(my / cellH);

    if (col < 0 || col >= stepsX || row < 0 || row >= stepsY) return;

    const value = gridData.grid[row]?.[col];
    if (value === undefined || isNaN(value)) {
      console.info(`跳过 NaN 格点 (${col}, ${row})`);
      return;
    }

    setDialogCell({ col, row });
    setDialogOpen(true);
  }, [gridData, sizeReady, dpr]);

  // ── 参数填充确认 ──────────────────────────────────
  const handleConfirmFill = useCallback(() => {
    if (!dialogCell || !gridData) return;

    const { col, row } = dialogCell;
    const { metadata } = gridData;
    const px = metadata.paramX;
    const py = metadata.paramY;
    const paramXValue = px.min + (col + 0.5) / px.steps * (px.max - px.min);
    const paramYValue = py.min + (row + 0.5) / py.steps * (py.max - py.min);

    const newParams: Partial<Record<string, number>> = {};
    const newIC: Partial<Record<string, number>> = {};

    const fp = metadata.fixedParams;
    newParams.m1 = fp.m1;
    newParams.m2 = fp.m2;
    newParams.L1 = fp.L1;
    newParams.L2 = fp.L2;
    newParams.g = fp.g;
    newParams.damping = fp.damping;
    newIC.theta1Dot = fp.omega1_0;
    newIC.theta2Dot = fp.omega2_0;

    const xResolved = resolveStoreParam(px.name, paramXValue, fp);
    if (xResolved) {
      if (["theta1", "theta2", "theta1Dot", "theta2Dot"].includes(xResolved.storeKey)) {
        newIC[xResolved.storeKey] = xResolved.storeValue;
      } else {
        newParams[xResolved.storeKey] = xResolved.storeValue;
      }
    }

    const yResolved = resolveStoreParam(py.name, paramYValue, fp);
    if (yResolved) {
      if (["theta1", "theta2", "theta1Dot", "theta2Dot"].includes(yResolved.storeKey)) {
        newIC[yResolved.storeKey] = yResolved.storeValue;
      } else {
        newParams[yResolved.storeKey] = yResolved.storeValue;
      }
    }

    simInjectParams(
      newParams as Parameters<typeof simInjectParams>[0],
      newIC as Parameters<typeof simInjectParams>[1],
    );
    simSetRunning(true);
    useAppStore.getState().setMode("explore");

    setDialogOpen(false);
    setDialogCell(null);
  }, [dialogCell, gridData, simInjectParams, simSetRunning]);

  // ── 双向联动游标 ──────────────────────────────────
  useEffect(() => {
    if (!gridData || !sizeReady) return;

    const updateCursor = () => {
      const { metadata } = gridData;
      const px = metadata.paramX;
      const py = metadata.paramY;
      const state = useSimulationStore.getState();

      function getCurrentValue(paramName: string): number | null {
        const fp = metadata.fixedParams;
        const storeMap: Record<string, number | undefined> = {
          m1: state.params.m1,
          m2: state.params.m2,
          L1: state.params.L1,
          L2: state.params.L2,
          g: state.params.g,
          damping: state.params.damping,
          theta1: state.initialConditions.theta1,
          theta2: state.initialConditions.theta2,
          omega1_0: state.initialConditions.theta1Dot,
          omega2_0: state.initialConditions.theta2Dot,
        };

        const resolved = resolveStoreParam(paramName, 0, fp);
        if (!resolved) return null;
        return storeMap[resolved.storeKey] ?? null;
      }

      const valX = getCurrentValue(px.name);
      const valY = getCurrentValue(py.name);

      if (valX === null || valY === null) {
        setCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      if (valX < px.min || valX > px.max || valY < py.min || valY > py.max) {
        setCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      const col = ((valX - px.min) / (px.max - px.min)) * px.steps;
      const row = ((valY - py.min) / (py.max - py.min)) * py.steps;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;
      const cellW = width / px.steps;
      const cellH = height / py.steps;

      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;

      setCursor({
        visible: true,
        x: cx / dpr,
        y: cy / dpr,
        paramXValue: valX,
        paramYValue: valY,
      });
    };

    const unsub = useSimulationStore.subscribe(() => {
      if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
      cursorDebounceRef.current = setTimeout(updateCursor, CURSOR_DEBOUNCE_MS);
    });

    // 初始触发一次
    updateCursor();

    return () => {
      unsub();
      if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
    };
  }, [gridData, sizeReady, dpr]);

  // ── 重绘游标 ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const offscreen = offscreenRef.current;
    if (offscreen) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0);
    }

    if (!cursor.visible) return;

    const cx = cursor.x * dpr;
    const cy = cursor.y * dpr;

    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
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
  }, [cursor, gridData, dpr]);

  // ── 图层切换 ──────────────────────────────────────
  const handleLayerChange = useCallback((value: string) => {
    setActiveLayer(value as LyapunovLayerType);
  }, [setActiveLayer]);

  // ── 重试 ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    precomputeState.retry();
  }, [precomputeState.retry]);

  // ── Tooltip 消费 ─────────────────────────────────
  const hoverTooltip = useAnalyzeStore((s) => s.hoverTooltip);

  const layerLabels: Record<LyapunovLayerType, string> = {
    lyapunov_max: "最大 Lyapunov",
    lyapunov_min: "最小 Lyapunov",
    energy_curvature: "能量曲率",
  };

  return (
    <div className="flex flex-col h-full w-full gap-2">
      <Tabs value={activeLayer} onValueChange={handleLayerChange}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="lyapunov_max">{layerLabels.lyapunov_max}</TabsTrigger>
          <TabsTrigger value="lyapunov_min">{layerLabels.lyapunov_min}</TabsTrigger>
          <TabsTrigger value="energy_curvature">{layerLabels.energy_curvature}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div ref={containerRef} className="relative flex-1 min-h-0 rounded-md overflow-hidden bg-lab-dark border border-lab-border">
        {(loadStatus === "loading" || loadStatus === "idle") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-full h-full animate-pulse bg-lab-border/20" />
          </div>
        )}

        {loadStatus === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-lab-dark">
            <p className="text-sm text-white">{loadError}</p>
            {precomputeState.errorCode === "PRECOMPUTE_FORMAT_ERROR" ? (
              <p className="text-xs text-lab-border">数据格式错误，请重新生成预计算数据</p>
            ) : (
              <Button variant="outline" size="sm" onClick={handleRetry}>
                重试
              </Button>
            )}
          </div>
        )}

        {loadStatus === "ready" && gridData && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            />

            {cursor.visible && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${cursor.x}px`,
                  top: `${cursor.y}px`,
                  width: `${12 * dpr}px`,
                  height: `${12 * dpr}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <svg width={12 * dpr} height={12 * dpr} viewBox={`0 0 ${12 * dpr} ${12 * dpr}`}>
                  <circle
                    cx={6 * dpr}
                    cy={6 * dpr}
                    r={5 * dpr}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2 * dpr}
                    style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))" }}
                  />
                  <line x1={0} y1={6 * dpr} x2={2 * dpr} y2={6 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={10 * dpr} y1={6 * dpr} x2={12 * dpr} y2={6 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={6 * dpr} y1={0} x2={6 * dpr} y2={2 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={6 * dpr} y1={10 * dpr} x2={6 * dpr} y2={12 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                </svg>
              </div>
            )}

            {hoverTooltip.visible && (
              <div
                className="absolute z-50 pointer-events-none rounded-md border border-lab-border bg-lab-panel px-2 py-1 text-xs text-white shadow-md"
                style={{
                  left: Math.min(hoverTooltip.position.x + 12, (cw || 0) - 140),
                  top: Math.max(hoverTooltip.position.y - 12, 0),
                }}
              >
                {hoverTooltip.lambdaValue === null ? (
                  <div className="text-gray-400">数据缺失</div>
                ) : (
                  <div>
                    <div className={
                      hoverTooltip.lambdaLabel === "混沌" ? "text-red-400" :
                      hoverTooltip.lambdaLabel === "稳定" ? "text-blue-400" :
                      hoverTooltip.lambdaLabel === "准周期" ? "text-yellow-400" :
                      "text-gray-400"
                    }>
                      λ = {hoverTooltip.lambdaValue.toFixed(4)}（{hoverTooltip.lambdaLabel}）
                    </div>
                  </div>
                )}
                <div className="mt-0.5">
                  {hoverTooltip.paramXName} = {hoverTooltip.paramXValue.toFixed(3)}
                  {hoverTooltip.paramXName.includes("θ") ? " rad" : ""}
                </div>
                <div>
                  {hoverTooltip.paramYName} = {hoverTooltip.paramYValue.toFixed(3)}
                  {hoverTooltip.paramYName.includes("θ") ? " rad" : ""}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {dialogOpen && dialogCell && gridData && (
        <ParameterFillDialog
          gridData={gridData}
          cell={dialogCell}
          onConfirm={handleConfirmFill}
          onCancel={() => {
            setDialogOpen(false);
            setDialogCell(null);
          }}
        />
      )}

    </div>
  );
}
