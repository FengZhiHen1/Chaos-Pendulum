import { useCallback } from "react";
import { cn } from "@/shared/lib/cn";
import { Slider } from "@/shared/view/components/ui/slider";
import { Input } from "@/shared/view/components/ui/input";
import { Label } from "@/shared/view/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/view/components/ui/tooltip";
import { AlertCircle } from "lucide-react";
import type { ParamFieldMeta, PendulumParams, InitialConditions } from "@/shared/domain/valueObjects";
import { useSimulationStore } from "../../store";

interface ParamSliderProps {
  meta: ParamFieldMeta;
}

/**
 * 单个参数滑块组件。
 *
 * 双模式行为：
 *   - 连续参数（system/environment group）：拖拽即时更新 Worker 参数值
 *   - 初始条件参数（initial group）：拖拽时叠加半透明预览摆，
 *     松手后触发 Worker Reset + 尾迹清空，从新初值重启积分
 */
export function ParamSlider({ meta }: ParamSliderProps) {
  const value = useSimulationStore((s) => {
    if (meta.group === "initial")
      return s.initialConditions[meta.key as keyof InitialConditions] as number;
    return s.params[meta.key as keyof PendulumParams] as number;
  });
  const error = useSimulationStore((s) => s.fieldErrors[meta.key]);
  const isWorkerReady = useSimulationStore((s) => s.isWorkerReady);
  const paramDisabled = !isWorkerReady;
  const setParam = useSimulationStore((s) => s.setParam);
  const setInitialCondition = useSimulationStore((s) => s.setInitialCondition);
  const activeField = useSimulationStore((s) => s.activeField);
  const setActiveField = useSimulationStore((s) => s.setActiveField);

  // 初始条件预览
  const isInitialGroup = meta.group === "initial";
  const beginPreview = useSimulationStore((s) => s.beginInitialConditionPreview);
  const commitPreview = useSimulationStore((s) => s.commitInitialConditionPreview);
  const cancelPreview = useSimulationStore((s) => s.cancelInitialConditionPreview);

  const isEditing = activeField === meta.key;

  const handleChange = useCallback(
    (k: string, v: number) => {
      if (isInitialGroup) {
        setInitialCondition(k as keyof InitialConditions, v);
        // 拖拽初始条件时显示半透明预览摆
        const ic = useSimulationStore.getState().initialConditions;
        beginPreview(ic.theta1, ic.theta2);
      } else {
        setParam(k as keyof PendulumParams, v);
      }
    },
    [isInitialGroup, setParam, setInitialCondition, beginPreview],
  );

  /** 滑块松手——初始条件参数触发 Worker Reset，连续参数仅失焦 */
  const handleCommit = useCallback(() => {
    if (isInitialGroup) {
      commitPreview();
    }
    setActiveField(null);
  }, [isInitialGroup, commitPreview, setActiveField]);

  /** 键盘输入聚焦——取消预览（避免与滑块拖拽冲突） */
  const handleFocus = useCallback(() => {
    if (isInitialGroup) cancelPreview();
    setActiveField(meta.key);
  }, [isInitialGroup, cancelPreview, setActiveField, meta.key]);

  const displayValue = value;

  return (
    <div
      className={cn(
        "space-y-2",
        error?.level === "error" && "animate-shake",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0 text-on-surface-variant">{meta.label}</Label>
          {error?.message && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle
                  className={cn(
                    "h-3 w-3 shrink-0 cursor-help",
                    error.level === "error" ? "text-red-500" : "text-yellow-500",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>{error.message}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={isEditing ? undefined : Number(displayValue.toFixed(meta.decimalPlaces))}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) handleChange(meta.key, v);
            }}
            onFocus={handleFocus}
            onBlur={() => setActiveField(null)}
            disabled={paramDisabled}
            className={cn(
              "w-20 h-7 text-xs font-mono text-right",
              error?.level === "error" && "border-red-500 ring-red-200",
              error?.level === "warning" && "border-yellow-500 ring-yellow-200",
            )}
            step={meta.sliderStep}
          />
          <span className="text-[10px] text-on-surface-variant/60 w-8 text-right shrink-0">{meta.unit}</span>
        </div>
      </div>
      <Slider
        value={[displayValue]}
        min={meta.sliderMin}
        max={meta.sliderMax}
        step={meta.sliderStep}
        onValueChange={([v]) => {
          if (v !== undefined) handleChange(meta.key, v);
        }}
        onValueCommit={handleCommit}
        disabled={paramDisabled}
        className="w-full"
      />
    </div>
  );
}
