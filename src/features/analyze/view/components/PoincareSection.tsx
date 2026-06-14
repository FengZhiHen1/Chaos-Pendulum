/**
 * 模块: analyze.ui.PoincareSection
 * 职责: 庞加莱截面组件——实时采集 + 基线对比。Canvas 渲染逻辑委托给 usePoincareRendering。
 * 边界: 本文件仅保留状态声明、用户交互处理与 JSX 渲染。
 */

import { useCallback, useRef, useState } from "react";
import { useAnalyzeStore } from "../../store";
import { useContainerSize } from "@/shared/viewModel/hooks/useContainerSize";
import { Button } from "@/shared/view/components/ui/button";
import { Input } from "@/shared/view/components/ui/input";
import { Label } from "@/shared/view/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/view/components/ui/select";
import { usePoincareRendering } from "../../viewModel/hooks/usePoincareRendering";
import { PoincareConfirmDialog } from "./PoincareConfirmDialog";

type SectionCondition = {
  variable: "theta1" | "theta2" | "omega1" | "omega2";
  targetValue: number;
  direction: "positive" | "negative" | "both";
};

export function PoincareSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCondition, setPendingCondition] = useState<SectionCondition | null>(null);
  const [clampWarning, setClampWarning] = useState<string | null>(null);
  const size = useContainerSize({ ref: containerRef, debounceMs: 150 });

  const poincare = useAnalyzeStore((s) => s.poincareSection);
  const setCondition = useAnalyzeStore((s) => s.poincareSection.setCondition);
  const clearPoints = useAnalyzeStore((s) => s.poincareSection.clearPoints);
  const saveBaseline = useAnalyzeStore((s) => s.poincareSection.saveBaseline);
  const clearBaseline = useAnalyzeStore((s) => s.poincareSection.clearBaseline);
  const setIsActive = useCallback(
    (active: boolean) => useAnalyzeStore.setState((s) => ({
      poincareSection: { ...s.poincareSection, isActive: active },
    })),
    [],
  );

  usePoincareRendering({ canvasRef, size, clampWarning, setClampWarning });

  const handleToggleActive = () => setIsActive(!poincare.isActive);

  const handleConditionChange = (
    key: keyof SectionCondition,
    value: string | number,
  ) => {
    const next = { ...poincare.condition, [key]: value } as SectionCondition;
    if (poincare.points.length > 0) {
      setPendingCondition(next);
      setShowConfirmDialog(true);
    } else {
      setCondition(next);
    }
  };

  const confirmConditionChange = () => {
    if (pendingCondition) {
      setCondition(pendingCondition);
      clearPoints();
      setPendingCondition(null);
    }
    setShowConfirmDialog(false);
  };

  const cancelConditionChange = () => {
    setPendingCondition(null);
    setShowConfirmDialog(false);
  };

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  return (
    <div className="h-full w-full flex flex-col">
      {/* 控制栏 */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-2.5 bg-surface-container-low border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleActive}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow ${
              poincare.isActive ? "bg-primary" : "bg-surface-container-high"
            }`}
            role="switch"
            aria-checked={poincare.isActive}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-on-surface shadow-lg transition-transform ${
                poincare.isActive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <Label className="text-sm cursor-pointer text-on-surface" onClick={handleToggleActive}>
            采集
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-on-surface-variant">变量</Label>
          <Select
            value={poincare.condition.variable}
            onValueChange={(v) => handleConditionChange("variable", v)}
            disabled={poincare.isActive}
          >
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="theta1">θ₁</SelectItem>
              <SelectItem value="omega1">ω₁</SelectItem>
              <SelectItem value="theta2">θ₂</SelectItem>
              <SelectItem value="omega2">ω₂</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-on-surface-variant">目标值</Label>
          <Input
            type="number"
            value={poincare.condition.targetValue}
            onChange={(e) => handleConditionChange("targetValue", parseFloat(e.target.value))}
            className="w-20 h-8 text-xs" disabled={poincare.isActive} step={0.1}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-on-surface-variant">方向</Label>
          <Select
            value={poincare.condition.direction}
            onValueChange={(v) => handleConditionChange("direction", v)}
            disabled={poincare.isActive}
          >
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="positive">正向</SelectItem>
              <SelectItem value="negative">反向</SelectItem>
              <SelectItem value="both">双向</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-on-surface-variant">
            点数: {poincare.pointCount}
            {poincare.baseline ? ` + 基线: ${poincare.baseline.length}` : ""}
          </span>
          <Button variant="secondary" size="sm" className="h-7 text-xs"
            onClick={clearPoints} disabled={poincare.points.length === 0}>清空</Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs"
            onClick={saveBaseline} disabled={poincare.points.length === 0}>保存基线</Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs"
            onClick={clearBaseline} disabled={!poincare.baseline}>清除基线</Button>
        </div>
      </div>

      {/* 警告提示 */}
      {clampWarning && (
        <div className="px-3 py-1.5 bg-surface-container-high text-tertiary text-xs font-medium">
          {clampWarning}
        </div>
      )}

      {/* Canvas 容器 */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {size.ready && (
          <>
            <canvas
              ref={canvasRef}
              width={Math.round(size.width * dpr)}
              height={Math.round(size.height * dpr)}
              style={{ width: size.width, height: size.height, display: "block" }}
              className="absolute inset-0"
            />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-on-surface-variant tracking-widest pointer-events-none">
              θ₂ (rad)
            </div>
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-on-surface-variant tracking-widest pointer-events-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateY(50%)" }}
            >
              ω₂ (rad/s)
            </div>
          </>
        )}
      </div>

      {showConfirmDialog && (
        <PoincareConfirmDialog
          pointCount={poincare.points.length}
          onConfirm={confirmConditionChange}
          onCancel={cancelConditionChange}
        />
      )}
    </div>
  );
}
