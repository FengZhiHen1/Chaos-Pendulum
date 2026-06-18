import { useCallback, useEffect, useRef, useState } from "react";
import { useAnalyzeStore } from "../../store";
import { useContainerSize } from "@/shared/viewModel/hooks/useContainerSize";
import { usePrecomputeData } from "@/features/analyze/viewModel/hooks/usePrecomputeData";
import { useLyapunovRendering } from "../../viewModel/hooks/useLyapunovRendering";
import { useParameterFill } from "../../viewModel/hooks/useParameterFill";
import { Button } from "@/shared/view/components/ui/button";
import type { LyapunovGrid, LyapunovLayerType, DampingSlice } from "../../types";
import { ParameterFillDialog } from "./ParameterFillDialog";
import { LAMBDA_TONE_CLASS, getAxisLabels } from "./LyapunovHeatmapUtils";

interface Props {
  dataPaths: {
    lyapunov_max: string;
    lyapunov_min: string;
    energy_curvature: string;
  };
  activeLayer: LyapunovLayerType;
  activeDamping: number;
  dampingSlices?: DampingSlice[];
}

export function LyapunovHeatmap({ dataPaths, activeLayer, activeDamping, dampingSlices = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { width: cw, height: ch, ready: sizeReady } = useContainerSize({ ref: containerRef, debounceMs: 100 });
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const setLoadStatus = useAnalyzeStore((s) => s.setLoadStatus);
  const setLoadError = useAnalyzeStore((s) => s.setLoadError);
  const setLayerCacheStatus = useAnalyzeStore((s) => s.setLayerCacheStatus);
  const setHoverTooltip = useAnalyzeStore((s) => s.setHoverTooltip);
  const loadStatus = useAnalyzeStore((s) => s.loadStatus);
  const loadError = useAnalyzeStore((s) => s.loadError);
  const [gridData, setGridData] = useState<LyapunovGrid | null>(null);
  const [layerCache, setLayerCache] = useState<Map<LyapunovLayerType, LyapunovGrid>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCell, setDialogCell] = useState<{ col: number; row: number } | null>(null);

  // ── 数据加载（SYS-03 usePrecomputeData）
  const resolvedPath = (() => {
    if (dampingSlices.length > 0) {
      const slice = dampingSlices.find((s) => s.value === activeDamping) ?? dampingSlices[0];
      if (slice) return `./assets/${slice.file}`;
    }
    return dataPaths[activeLayer] ?? "";
  })();
  const activePath = resolvedPath;
  const activeHash = (activePath.match(/-([a-f0-9]+)\.json$/) ?? [])[1] ?? "";

  const precomputeState = usePrecomputeData<LyapunovGrid>({
    dataType: activeLayer,
    dataUrl: activePath,
    expectedGridHash: activeHash,
    expectedType: activeLayer,
  });

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

  useEffect(() => {
    if (layerCache.has(activeLayer)) {
      setGridData(layerCache.get(activeLayer)!);
      setLoadStatus("ready");
      setLayerCacheStatus(activeLayer, "ready");
    }
  }, [activeLayer, layerCache, setLoadStatus, setLayerCacheStatus]);
  // ── 渲染与交互
  const { canvasRef, cursor, handleMouseMove, handleMouseLeave, handleClick } = useLyapunovRendering({
    gridData, cw, ch, sizeReady, dpr, activeDamping,
    onHover: setHoverTooltip,
    onCellClick: (col: number, row: number) => { setDialogCell({ col, row }); setDialogOpen(true); },
  });
  const { handleConfirmFill } = useParameterFill({
    dialogCell, gridData,
    onComplete: () => { setDialogOpen(false); setDialogCell(null); },
  });

  const handleRetry = useCallback(() => { precomputeState.retry(); }, [precomputeState.retry]);
  // ── 衍生数据
  const hoverTooltip = useAnalyzeStore((s) => s.hoverTooltip);
  const { axisXLabel, axisYLabel } = getAxisLabels(gridData);

  return (
    <div className="flex flex-col h-full w-full">
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        {(loadStatus === "loading" || loadStatus === "idle") && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-on-surface-variant">正在加载预计算数据…</span>
          </div>
        )}

        {loadStatus === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface">
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

        {loadStatus === "ready" && gridData && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            />

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-on-surface-variant tracking-widest pointer-events-none">
              {axisXLabel}
            </div>
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-on-surface-variant tracking-widest pointer-events-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateY(50%)" }}
            >
              {axisYLabel}
            </div>

            {cursor.visible && (
              <div className="absolute pointer-events-none"
                style={{ left: `${cursor.x}px`, top: `${cursor.y}px`, width: `${12 * dpr}px`, height: `${12 * dpr}px`, transform: "translate(-50%, -50%)" }}>
                <svg width={12 * dpr} height={12 * dpr} viewBox={`0 0 ${12 * dpr} ${12 * dpr}`}>
                  <circle cx={6 * dpr} cy={6 * dpr} r={5 * dpr} fill="none" stroke="#FFFFFF" strokeWidth={2 * dpr}
                    style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))" }} />
                  <line x1={0} y1={6 * dpr} x2={2 * dpr} y2={6 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={10 * dpr} y1={6 * dpr} x2={12 * dpr} y2={6 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={6 * dpr} y1={0} x2={6 * dpr} y2={2 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                  <line x1={6 * dpr} y1={10 * dpr} x2={6 * dpr} y2={12 * dpr} stroke="#FFFFFF" strokeWidth={2 * dpr} />
                </svg>
              </div>
            )}

            {hoverTooltip.visible && (
              <div
                className="absolute z-50 pointer-events-none rounded border border-white/[0.06] bg-surface-container px-3 py-2 text-xs text-on-surface shadow-md backdrop-blur-sm"
                style={{
                  left: Math.min(hoverTooltip.position.x + 12, (cw || 0) - 160),
                  top: Math.max(hoverTooltip.position.y - 12, 0),
                }}
              >
                {hoverTooltip.lambdaValue === null ? (
                  <div className="text-on-surface-variant">数据缺失</div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span className={LAMBDA_TONE_CLASS[hoverTooltip.lambdaLabel] ?? "text-on-surface-variant"}>
                      λ = {hoverTooltip.lambdaValue.toFixed(4)}（{hoverTooltip.lambdaLabel}）
                    </span>
                    <span className="text-on-surface/80">
                      {hoverTooltip.paramXName} = {hoverTooltip.paramXValue.toFixed(3)}
                    </span>
                    <span className="text-on-surface/80">
                      {hoverTooltip.paramYName} = {hoverTooltip.paramYValue.toFixed(3)}
                    </span>
                    {hoverTooltip.dampingValue !== undefined && (
                      <span className="text-on-surface-variant">
                        damping = {hoverTooltip.dampingValue.toFixed(3)}
                      </span>
                    )}
                  </div>
                )}
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
          onCancel={() => { setDialogOpen(false); setDialogCell(null); }}
        />
      )}
    </div>
  );
}
