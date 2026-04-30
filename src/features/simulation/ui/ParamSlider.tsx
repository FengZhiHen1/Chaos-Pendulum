import { cn } from "@/shared/lib/cn";
import { Slider } from "@/shared/components/ui/slider";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { AlertCircle } from "lucide-react";
import type { ParamFieldMeta, PendulumParams, InitialConditions } from "@/shared/types";
import { useSimulationStore } from "../store";

interface ParamSliderProps {
  meta: ParamFieldMeta;
}

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

  const isEditing = activeField === meta.key;
  const handleChange =
    meta.group === "initial"
      ? (k: string, v: number) => setInitialCondition(k as keyof InitialConditions, v)
      : (k: string, v: number) => setParam(k as keyof PendulumParams, v);

  const displayValue = value;

  return (
    <div
      className={cn(
        "space-y-1",
        error?.level === "error" && "animate-shake",
      )}
    >
      <div className="flex items-center gap-2">
        <Label className="w-24 text-xs shrink-0">{meta.label}</Label>
        <Input
          type="number"
          value={isEditing ? undefined : Number(displayValue.toFixed(meta.decimalPlaces))}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) handleChange(meta.key, v);
          }}
          onFocus={() => setActiveField(meta.key)}
          onBlur={() => setActiveField(null)}
          disabled={paramDisabled}
          className={cn(
            "w-20 h-7 text-xs font-mono",
            error?.level === "error" && "border-red-500 ring-red-200",
            error?.level === "warning" && "border-yellow-500 ring-yellow-200",
          )}
          step={meta.sliderStep}
        />
        <span className="text-[10px] text-on-surface-variant w-10 shrink-0">{meta.unit}</span>
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
      <Slider
        value={[displayValue]}
        min={meta.sliderMin}
        max={meta.sliderMax}
        step={meta.sliderStep}
        onValueChange={([v]) => {
          if (v !== undefined) handleChange(meta.key, v);
        }}
        onValueCommit={() => setActiveField(null)}
        disabled={paramDisabled}
        className="w-full"
      />
    </div>
  );
}
