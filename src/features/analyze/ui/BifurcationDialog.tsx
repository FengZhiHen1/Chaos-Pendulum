import { Button } from "@/shared/view/components/ui/button";
import { useSimulationStore } from "@/features/simulation";
import type { BifurcationData } from "../types";
import { classifyRegime, resolveStoreParam } from "../types";

interface Props {
  data: BifurcationData;
  paramValue: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BifurcationDialog({ data, paramValue, onConfirm, onCancel }: Props) {
  const { scannedParam, fixedParams } = data.metadata;
  const simParams = useSimulationStore((s) => s.params);
  const simIC = useSimulationStore((s) => s.initialConditions);

  const resolved = resolveStoreParam(scannedParam.name, paramValue, fixedParams);

  // 找到最近的步索引
  const steps = scannedParam.steps;
  const idx = Math.max(0, Math.min(steps - 1, Math.round(
    (paramValue - scannedParam.min) / (scannedParam.max - scannedParam.min) * (steps - 1)
  )));
  const pts = data.samples[idx];
  const count = pts ? pts.length : 0;
  const regime = classifyRegime(count);

  function currentStoreValue(storeKey: string): string {
    const valMap: Record<string, number> = {
      m1: simParams.m1, m2: simParams.m2, L1: simParams.L1, L2: simParams.L2,
      g: simParams.g, damping: simParams.damping,
      theta1: simIC.theta1, theta2: simIC.theta2,
      theta1Dot: simIC.theta1Dot, theta2Dot: simIC.theta2Dot,
    };
    const v = valMap[storeKey];
    return v !== undefined ? v.toFixed(4) : "—";
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface-container-low p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-on-surface mb-3">以此参数启动仿真</h3>

        <div className="mb-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{scannedParam.name}</span>
            <span className="text-primary font-mono">{paramValue.toFixed(4)} {scannedParam.unit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">当前值</span>
            <span className="text-on-surface line-through">
              {resolved ? currentStoreValue(resolved.storeKey) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">混沌判定</span>
            <span className={
              regime === "混沌" ? "text-red-400" :
              regime === "周期-1" || regime === "周期-2" ? "text-blue-400" :
              "text-yellow-400"
            }>
              {regime}（{count} 点）
            </span>
          </div>
        </div>

        {/* 固定参数表格 */}
        <div className="mb-4 max-h-32 overflow-y-auto rounded border border-white/5">
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(fixedParams).map(([k, v]) => (
                <tr key={k} className="border-b border-white/5 last:border-0">
                  <td className="px-2 py-1 text-on-surface-variant">{k}</td>
                  <td className="px-2 py-1 text-on-surface text-right font-mono">{typeof v === "number" ? v.toFixed(3) : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-on-surface-variant mb-4">将覆盖当前参数并重新启动仿真</p>

        {!resolved && (
          <p className="text-xs text-red-400 mb-4">无法确定参数映射，请手动设置</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="tertiary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={!resolved}>
            确认
          </Button>
        </div>
      </div>
    </div>
  );
}
