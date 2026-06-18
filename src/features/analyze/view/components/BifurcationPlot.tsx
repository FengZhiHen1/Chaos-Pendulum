/**
 * 模块: analyze.ui.BifurcationPlot
 * 职责: 分岔图组件——Canvas 散点渲染 + 参数联动游标 + 缩放/拖拽。
 *       内部逻辑抽离至 ViewModel Hooks。
 * 边界:
 *   - 本文件仅保留状态声明、数据加载编排与 JSX 渲染
 *   - 所有 Canvas 绘制、zoom 交互、鼠标事件委托给 ViewModel Hooks
 */

import { useCallback, useRef, useState } from "react";
import { useContainerSize } from "@/shared/viewModel/hooks/useContainerSize";
import { useSimulationStore } from "@/features/simulation";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/shared/view/components/ui/button";
import type { BifurcationHoverData, BifurcationCursor } from "../../types";
import { resolveStoreParam } from "../../types";
import { BifurcationDialog } from "./BifurcationDialog";
import { useBifurcationData } from "../../viewModel/hooks/useBifurcationData";
import { useBifurcationRendering } from "../../viewModel/hooks/useBifurcationRendering";
import { useBifurcationInteraction } from "../../viewModel/hooks/useBifurcationInteraction";

interface Props {
  dataPath: string;
  pointRadius?: number;
}

export function BifurcationPlot({ dataPath, pointRadius = 1.8 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingCursorRef = useRef(false);
  const cursorXRef = useRef(0);
  const lastSyncedValueRef = useRef<number | null>(null);

  const { width: cw, height: ch, ready: sizeReady } = useContainerSize({
    ref: containerRef, debounceMs: 100,
  });
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const simInjectParams = useSimulationStore((s) => s.injectParams);
  const simSetRunning = useSimulationStore((s) => s.setRunning);

  // ── 数据加载 ─────────────────────────────────────
  const { data, loadStatus, loadError, precomputeErrorCode, retry } = useBifurcationData(dataPath);

  // ── UI 状态 ─────────────────────────────────────
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

  // ── Canvas 渲染 Hook ─────────────────────────────
  const { transformRef, xScale, yScale } = useBifurcationRendering({
    canvasRef,
    containerSize: { cw, ch, ready: sizeReady },
    dpr, data, cursor, hover, pointRadius,
    isDraggingCursorRef, cursorXRef, lastSyncedValueRef,
  });

  // ── 鼠标交互 Hook ────────────────────────────────
  const { handleMouseMove, handleMouseLeave, handleMouseDown, handleClick } =
    useBifurcationInteraction({
      canvasRef, data, cw, ch, xScale, yScale, transformRef,
      cursor, setCursor, setHover, loadStatus,
      isDraggingCursorRef, cursorXRef, lastSyncedValueRef,
      setDialogOpen, setDialogParamValue,
    });

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
    useAppStore.getState().setMode("explore");
    setDialogOpen(false);
    setDialogParamValue(null);
  }, [dialogParamValue, data, simInjectParams, simSetRunning]);

  // ── JSX ──────────────────────────────────────────
  const isLoading = loadStatus === "loading" || loadStatus === "idle";
  const isError = loadStatus === "error";
  const isReady = loadStatus === "ready" && data;

  return (
    <div className="flex flex-col h-full w-full">
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-on-surface-variant">正在加载预计算数据…</span>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface">
            <p className="text-sm text-on-surface">{loadError}</p>
            {precomputeErrorCode === "PRECOMPUTE_FORMAT_ERROR" ? (
              <p className="text-xs text-on-surface-variant">数据格式错误，请重新生成预计算数据</p>
            ) : (
              <Button variant="secondary" size="sm" onClick={retry}>重试</Button>
            )}
          </div>
        )}

        {isReady && (
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
                className="absolute z-50 pointer-events-none rounded border border-white/[0.06] bg-surface-container px-3 py-2 text-xs text-on-surface shadow-md backdrop-blur-sm"
                style={{
                  left: Math.min(hover.position.x + 12, (cw || 0) - 180),
                  top: Math.max(hover.position.y - 12, 0),
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-on-surface/90">
                    {hover.scannedParamName} = {hover.scannedParamValue.toFixed(4)}
                    {hover.scannedParamName.includes("θ") ? " rad" : ""}
                  </span>
                  <span className="text-on-surface-variant">
                    采样点：{hover.pointCount}（{hover.regime}）
                  </span>
                  {hover.sampledValues && hover.sampledValues.length > 0 && (
                    <span className="text-on-surface-variant max-w-[200px] truncate">
                      {hover.sampledVariableName} = {"{"}
                      {hover.sampledValues.slice(0, 6).map((v) => v.toFixed(2)).join(", ")}
                      {hover.sampledValues.length > 6 ? ", ..." : ""}
                      {"}"}
                    </span>
                  )}
                  {hover.sampledValues && hover.sampledValues.length === 0 && (
                    <span className="text-on-surface-variant">无有效数据</span>
                  )}
                </div>
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
          onCancel={() => { setDialogOpen(false); setDialogParamValue(null); }}
        />
      )}
    </div>
  );
}
