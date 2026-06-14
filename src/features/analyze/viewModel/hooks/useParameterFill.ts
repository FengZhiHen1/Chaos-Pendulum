/**
 * 模块: analyze.viewModel.hooks.useParameterFill
 * 职责: Lyapunov 热力图格点点击 → 仿真参数注入的回调逻辑。
 *       将格点参数值通过 resolveStoreParam 映射为 store 字段并注入仿真。
 * 边界:
 *   - 依赖 SimulationStore.injectParams / setRunning
 *   - 依赖 AppStore.setMode 切换模式
 */

import { useCallback } from "react";
import { useSimulationStore } from "@/features/simulation";
import { useAppStore } from "@/stores/useAppStore";
import type { LyapunovGrid } from "../../types";
import { resolveStoreParam } from "../../types";

interface UseParameterFillInput {
  dialogCell: { col: number; row: number } | null;
  gridData: LyapunovGrid | null;
  onComplete: () => void;
}

const INITIAL_CONDITION_KEYS = ["theta1", "theta2", "theta1Dot", "theta2Dot"] as const;

export function useParameterFill({ dialogCell, gridData, onComplete }: UseParameterFillInput) {
  const simInjectParams = useSimulationStore((s) => s.injectParams);
  const simSetRunning = useSimulationStore((s) => s.setRunning);

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
    newParams.m1 = fp.m1; newParams.m2 = fp.m2;
    newParams.L1 = fp.L1; newParams.L2 = fp.L2;
    newParams.g = fp.g; newParams.damping = fp.damping;
    newIC.theta1Dot = fp.omega1_0; newIC.theta2Dot = fp.omega2_0;

    for (const { paramName, value } of [
      { paramName: px.name, value: paramXValue },
      { paramName: py.name, value: paramYValue },
    ]) {
      const resolved = resolveStoreParam(paramName, value, fp);
      if (!resolved) continue;
      if ((INITIAL_CONDITION_KEYS as readonly string[]).includes(resolved.storeKey)) {
        newIC[resolved.storeKey] = resolved.storeValue;
      } else {
        newParams[resolved.storeKey] = resolved.storeValue;
      }
    }

    simInjectParams(
      newParams as Parameters<typeof simInjectParams>[0],
      newIC as Parameters<typeof simInjectParams>[1],
    );
    simSetRunning(true);
    useAppStore.getState().setMode("explore");
    onComplete();
  }, [dialogCell, gridData, simInjectParams, simSetRunning, onComplete]);

  return { handleConfirmFill };
}
