/**
 * 模块: analyze.viewModel.hooks.useLyapunovRendering
 * 职责: Lyapunov 热力图 Canvas 渲染、鼠标交互与双向游标同步逻辑。
 *       管理离屏 Canvas、颜色映射、鼠标事件处理和仿真 store 联动。
 * 边界:
 *   - 持有 canvasRef 与 offscreenRef，上层无需直接操作 Canvas
 *   - 通过 onHover / onCellClick 回调桥接交互事件到上层组件
 *   - 内部订阅 SimulationStore 实现双向联动游标
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useSimulationStore } from "@/features/simulation";
import { measure } from "@/shared/infrastructure/observability/perf-mark";
import { createHeatmapColorScale } from "../../view/components/heatmapColorScale";
import {
  SURFACE,
  ON_SURFACE_VARIANT,
} from "../../view/components/colorTokens";
import type { LyapunovGrid, HeatmapCursor, HoverTooltipData } from "../../types";
import { resolveStoreParam } from "../../types";
import {
  CURSOR_DEBOUNCE_MS,
  LABEL_FONT,
  calcGridStats,
  normalizeRange,
  mouseToCell,
  buildTooltipData,
  emptyTooltipData,
  renderHeatmapCells,
  renderGridLines,
  drawCursorCrosshair,
} from "../../view/components/LyapunovHeatmapUtils";

interface UseLyapunovRenderingInput {
  gridData: LyapunovGrid | null;
  cw: number;
  ch: number;
  sizeReady: boolean;
  dpr: number;
  activeDamping: number;
  onHover: (data: HoverTooltipData) => void;
  onCellClick: (col: number, row: number) => void;
}

export function useLyapunovRendering({
  gridData, cw, ch, sizeReady, dpr, activeDamping, onHover, onCellClick,
}: UseLyapunovRenderingInput) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const cursorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursor, setCursor] = useState<HeatmapCursor>({
    visible: false, x: 0, y: 0, paramXValue: 0, paramYValue: 0,
  });

  // ── Canvas 渲染 ───────────────────────────────────
  useEffect(() => {
    if (!sizeReady || cw === 0 || ch === 0 || !gridData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    const { minVal, maxVal, hasValid } = calcGridStats(grid);

    if (!hasValid || minVal === Infinity || maxVal === -Infinity) {
      offCtx.fillStyle = SURFACE;
      offCtx.fillRect(0, 0, width, height);
      offCtx.fillStyle = ON_SURFACE_VARIANT;
      offCtx.font = `${14 * dpr}px ${LABEL_FONT}`;
      offCtx.textAlign = "center";
      offCtx.fillText("该参数范围无有效数据，请更换扫描范围", width / 2, height / 2);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(offscreen, 0, 0);
      return;
    }

    const { normMin, normMax } = normalizeRange(minVal, maxVal);
    const colorScale = createHeatmapColorScale(metadata.type, normMin, normMax);

    const renderFn = () => {
      offCtx.clearRect(0, 0, width, height);
      offCtx.fillStyle = SURFACE;
      offCtx.fillRect(0, 0, width, height);
      renderHeatmapCells(offCtx, grid, stepsX, stepsY, cellW, cellH, colorScale);
      renderGridLines(offCtx, stepsX, stepsY, cellW, cellH, width, height);
    };

    measure("lyapunov-render", renderFn);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0);
  }, [gridData, cw, ch, sizeReady, dpr]);

  // ── 鼠标交互 ──────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gridData || !sizeReady) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const stepsX = gridData.metadata.paramX.steps;
      const stepsY = gridData.metadata.paramY.steps;
      const cellW = canvas.width / stepsX;
      const cellH = canvas.height / stepsY;

      const { col, row, inBounds } = mouseToCell(mx, my, stepsX, stepsY, cellW, cellH);
      if (!inBounds) {
        onHover({ ...emptyTooltipData(), position: { x: e.clientX - rect.left, y: e.clientY - rect.top } });
        return;
      }

      const value = gridData.grid[row]?.[col] ?? NaN;
      onHover(buildTooltipData(
        gridData,
        isNaN(value) ? null : value,
        col, row,
        e.clientX - rect.left, e.clientY - rect.top,
        activeDamping,
      ));
    },
    [gridData, sizeReady, dpr, activeDamping, onHover],
  );

  const handleMouseLeave = useCallback(() => {
    onHover(emptyTooltipData());
  }, [onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gridData || !sizeReady) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const stepsX = gridData.metadata.paramX.steps;
      const stepsY = gridData.metadata.paramY.steps;
      const cellW = canvas.width / stepsX;
      const cellH = canvas.height / stepsY;

      const { col, row, inBounds } = mouseToCell(mx, my, stepsX, stepsY, cellW, cellH);
      if (!inBounds) return;

      const value = gridData.grid[row]?.[col];
      if (value === null || value === undefined || isNaN(value)) return;

      onCellClick(col, row);
    },
    [gridData, sizeReady, dpr, onCellClick],
  );

  // ── 双向联动游标（仿真 store → 热力图位置）──────────
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

      if (valX === null || valY === null || valX < px.min || valX > px.max || valY < py.min || valY > py.max) {
        setCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      const col = ((valX - px.min) / (px.max - px.min)) * px.steps;
      const row = ((valY - py.min) / (py.max - py.min)) * py.steps;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const cellW = canvas.width / px.steps;
      const cellH = canvas.height / py.steps;
      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;

      setCursor({ visible: true, x: cx / dpr, y: cy / dpr, paramXValue: valX, paramYValue: valY });
    };

    const unsub = useSimulationStore.subscribe(() => {
      if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
      cursorDebounceRef.current = setTimeout(updateCursor, CURSOR_DEBOUNCE_MS);
    });

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

    drawCursorCrosshair(ctx, cursor.x * dpr, cursor.y * dpr, dpr);
  }, [cursor, gridData, dpr]);

  return { canvasRef, offscreenRef, cursor, handleMouseMove, handleMouseLeave, handleClick };
}
