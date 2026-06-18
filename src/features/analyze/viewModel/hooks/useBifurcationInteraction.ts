/**
 * 模块: analyze.viewModel.hooks.useBifurcationInteraction
 * 职责: 分岔图鼠标交互逻辑——悬停 HUD、游标拖拽、散点点击与参数填充。
 * 边界:
 *   - 接收 transformRef 与比例尺，不直接管理 Canvas
 *   - 通过 Zusand store 注入参数，不直接操作仿真引擎
 */

import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import type { ScaleLinear } from "d3-scale";
import type { ZoomTransform } from "d3-zoom";
import { useSimulationStore } from "@/features/simulation";
import { useAppStore } from "@/stores/useAppStore";
import type { BifurcationData, BifurcationCursor, BifurcationHoverData } from "../../types";
import { classifyRegime, resolveStoreParam } from "../../types";
import {
  CURSOR_HIT_RADIUS_PX,
  CLICK_PROXIMITY_PX,
  HOVER_THROTTLE_MS,
  computeVisibleDomain,
  buildCurrentScales,
  mouseToParamIndex,
  paramValueAtIndex,
  clamp,
  formatCursorLabel,
} from "../../view/components/BifurcationPlotUtils";

interface UseBifurcationInteractionInput {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  data: BifurcationData | null;
  cw: number;
  ch: number;
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  transformRef: React.MutableRefObject<ZoomTransform>;
  cursor: BifurcationCursor;
  setCursor: React.Dispatch<React.SetStateAction<BifurcationCursor>>;
  setHover: React.Dispatch<React.SetStateAction<BifurcationHoverData>>;
  loadStatus: string;
  isDraggingCursorRef: React.MutableRefObject<boolean>;
  cursorXRef: React.MutableRefObject<number>;
  lastSyncedValueRef: React.MutableRefObject<number | null>;
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDialogParamValue: React.Dispatch<React.SetStateAction<number | null>>;
}

export function useBifurcationInteraction({
  canvasRef,
  data,
  cw,
  ch,
  xScale,
  yScale,
  transformRef,
  cursor,
  setCursor,
  setHover,
  loadStatus,
  isDraggingCursorRef,
  cursorXRef,
  lastSyncedValueRef,
  setDialogOpen,
  setDialogParamValue,
}: UseBifurcationInteractionInput) {
  const hoverThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorDragValueRef = useRef(0);

  const simInjectParams = useSimulationStore((s) => s.injectParams);
  const simSetRunning = useSimulationStore((s) => s.setRunning);

  // ── 鼠标悬停（节流）───────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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

      const t = transformRef.current;
      const domain = computeVisibleDomain(t, xScale, yScale, cw, ch);
      const { currentXScale } = buildCurrentScales(domain, cw, ch);

      const idx = mouseToParamIndex(
        mx,
        currentXScale,
        scannedParam.min,
        scannedParam.max,
        steps,
      );

      const pts = data.samples[idx];
      const count = pts ? pts.length : 0;

      setHover({
        visible: true,
        position: { x: mx, y: my },
        scannedParamValue: paramValueAtIndex(scannedParam.min, scannedParam.max, idx, steps),
        scannedParamName: scannedParam.name,
        sampledValues: pts || null,
        sampledVariableName: sampledVariable.name,
        pointCount: count,
        regime: classifyRegime(count),
      });
    },
    [data, loadStatus, cw, ch, xScale, yScale, transformRef, canvasRef, setHover],
  );

  const handleMouseLeave = useCallback(() => {
    setHover((prev) => ({ ...prev, visible: false }));
  }, [setHover]);

  // ── 游标拖拽 ──────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!data || !cursor.visible) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      if (Math.abs(mx - cursor.x) < CURSOR_HIT_RADIUS_PX + 4) {
        isDraggingCursorRef.current = true;
        e.stopPropagation();
      }
    },
    [data, cursor.visible, cursor.x, canvasRef, isDraggingCursorRef],
  );

  const handleMouseMoveGlobal = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingCursorRef.current || !data) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      const t = transformRef.current;
      const domain = computeVisibleDomain(t, xScale, yScale, cw, ch);
      const { currentXScale } = buildCurrentScales(domain, cw, ch);

      const val = clamp(
        currentXScale.invert(mx),
        data.metadata.scannedParam.min,
        data.metadata.scannedParam.max,
      );

      cursorDragValueRef.current = val;
      const newX = currentXScale(val);
      cursorXRef.current = newX;
      setCursor({
        visible: true,
        paramValue: val,
        x: newX,
        label: formatCursorLabel(val, data.metadata.scannedParam.unit),
      });
    },
    [data, cw, xScale, yScale, transformRef, canvasRef, isDraggingCursorRef, cursorXRef, setCursor],
  );

  const handleMouseUpGlobal = useCallback(() => {
    if (!isDraggingCursorRef.current || !data) {
      isDraggingCursorRef.current = false;
      return;
    }
    isDraggingCursorRef.current = false;

    const { scannedParam, fixedParams } = data.metadata;
    const val = cursorDragValueRef.current;
    const resolved = resolveStoreParam(scannedParam.name, val, fixedParams);
    if (!resolved) {
      console.warn(`[BifurcationPlot] 参数名无法映射: ${scannedParam.name}`);
      return;
    }

    const isIC = ["theta1", "theta2", "theta1Dot", "theta2Dot"].includes(resolved.storeKey);
    if (isIC) {
      simInjectParams({}, { [resolved.storeKey]: resolved.storeValue } as Record<string, number>);
    } else {
      simInjectParams({ [resolved.storeKey]: resolved.storeValue } as Record<string, number>, {});
    }
    lastSyncedValueRef.current = val;
    simSetRunning(true);
    useAppStore.getState().setMode("explore");
  }, [data, isDraggingCursorRef, lastSyncedValueRef, simInjectParams, simSetRunning]);

  // ── 全局鼠标事件 ─────────────────────────────────
  useEffect(() => {
    if (!data) return;
    window.addEventListener("mousemove", handleMouseMoveGlobal);
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("mouseup", handleMouseUpGlobal);
    };
  }, [data, handleMouseMoveGlobal, handleMouseUpGlobal]);

  // ── 点击散点区域 → 弹出参数填充对话框 ─────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!data || isDraggingCursorRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const { scannedParam } = data.metadata;
      const steps = scannedParam.steps;

      const t = transformRef.current;
      const domain = computeVisibleDomain(t, xScale, yScale, cw, ch);
      const { currentXScale, currentYScale } = buildCurrentScales(domain, cw, ch);

      const idx = mouseToParamIndex(
        mx,
        currentXScale,
        scannedParam.min,
        scannedParam.max,
        steps,
      );

      const pts = data.samples[idx];
      if (!pts || pts.length === 0) return;

      // 检查 Y 是否靠近任意散点
      const nearPoint = pts.some((v) => {
        if (v < domain.y0 || v > domain.y1) return false;
        const py = currentYScale(v);
        return Math.abs(py - my) < CLICK_PROXIMITY_PX;
      });

      if (!nearPoint) return;

      const actualVal = paramValueAtIndex(scannedParam.min, scannedParam.max, idx, steps);
      setDialogParamValue(actualVal);
      setDialogOpen(true);
    },
    [data, cw, ch, xScale, yScale, transformRef, canvasRef, isDraggingCursorRef, setDialogOpen, setDialogParamValue],
  );

  return {
    handleMouseMove,
    handleMouseLeave,
    handleMouseDown,
    handleClick,
  };
}
