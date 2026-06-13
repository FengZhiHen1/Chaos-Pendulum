import { useMemo } from "react";
import { Button } from "@/shared/view/components/ui/button";
import { useSimulationStore } from "@/features/simulation";
import type { LyapunovGrid } from "../types";
import { classifyLambda, resolveStoreParam } from "../types";

interface Props {
  gridData: LyapunovGrid;
  cell: { col: number; row: number };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ParameterFillDialog({ gridData, cell, onConfirm, onCancel }: Props) {
  const { metadata } = gridData;
  const { col, row } = cell;

  const simParams = useSimulationStore((s) => s.params);
  const simIC = useSimulationStore((s) => s.initialConditions);

  const px = metadata.paramX;
  const py = metadata.paramY;
  const paramXValue = px.min + (col + 0.5) / px.steps * (px.max - px.min);
  const paramYValue = py.min + (row + 0.5) / py.steps * (py.max - py.min);
  const lambdaValue = gridData.grid[row]?.[col];
  const { label: lambdaLabel } = classifyLambda(isNaN(lambdaValue ?? NaN) ? null : lambdaValue!);

  const xResolved = resolveStoreParam(px.name, paramXValue, metadata.fixedParams);
  const yResolved = resolveStoreParam(py.name, paramYValue, metadata.fixedParams);

  function currentStoreValue(storeKey: string): string {
    const valMap: Record<string, number> = {
      m1: simParams.m1,
      m2: simParams.m2,
      L1: simParams.L1,
      L2: simParams.L2,
      g: simParams.g,
      damping: simParams.damping,
      theta1: simIC.theta1,
      theta2: simIC.theta2,
      theta1Dot: simIC.theta1Dot,
      theta2Dot: simIC.theta2Dot,
    };
    const v = valMap[storeKey];
    return v !== undefined ? v.toFixed(4) : "—";
  }

  const changes = useMemo(() => {
    const list: { name: string; current: string; next: string }[] = [];
    if (xResolved) {
      list.push({
        name: px.name,
        current: currentStoreValue(xResolved.storeKey),
        next: xResolved.storeValue.toFixed(4),
      });
    }
    if (yResolved) {
      list.push({
        name: py.name,
        current: currentStoreValue(yResolved.storeKey),
        next: yResolved.storeValue.toFixed(4),
      });
    }
    return list;
  }, [xResolved, yResolved, px.name, py.name]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface-container-low p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-on-surface mb-3">确认切换参数</h3>

        <div className="space-y-2 mb-4">
          {changes.map((c) => (
            <div key={c.name} className="flex justify-between text-xs">
              <span className="text-on-surface-variant">{c.name}</span>
              <span className="text-on-surface">
                <span className="text-on-surface-variant line-through mr-1">{c.current}</span>
                <span className="text-primary">{c.next}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="mb-4 text-xs">
          <span className="text-on-surface-variant">λ 值：</span>
          <span className={
            lambdaLabel === "混沌" ? "text-red-400" :
            lambdaLabel === "稳定" ? "text-blue-400" :
            lambdaLabel === "准周期" ? "text-yellow-400" :
            "text-gray-400"
          }>
            {lambdaValue !== undefined && !isNaN(lambdaValue) ? `${lambdaValue.toFixed(4)}（${lambdaLabel}）` : "数据缺失"}
          </span>
        </div>

        <p className="text-xs text-on-surface-variant mb-4">将覆盖当前参数并重新启动仿真</p>

        <div className="flex justify-end gap-2">
          <Button variant="tertiary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            确认
          </Button>
        </div>
      </div>
    </div>
  );
}
