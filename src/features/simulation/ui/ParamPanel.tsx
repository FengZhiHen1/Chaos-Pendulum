import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { RotateCcw, Play, Pause } from "lucide-react";
import { PARAM_META } from "@/shared/types";
import type { ParamGroup } from "@/shared/types";
import { useSimulationStore } from "../store";
import { ParamSlider } from "./ParamSlider";
import { MethodSelector } from "./MethodSelector";
import { PresetButtons } from "./PresetButtons";

const GROUPS: { id: ParamGroup; label: string }[] = [
  { id: "system", label: "系统参数" },
  { id: "initial", label: "初始条件" },
  { id: "environment", label: "环境" },
];

const GROUPED_META: Record<ParamGroup, string[]> = {
  system: [],
  initial: [],
  environment: [],
};

for (const m of PARAM_META) {
  GROUPED_META[m.group].push(m.key);
}

export function ParamPanel() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const engineError = useSimulationStore((s) => s.engineError);
  const isSceneFrozen = useSimulationStore((s) => s.isSceneFrozen);
  const setRunning = useSimulationStore((s) => s.setRunning);
  const resetToDefaults = useSimulationStore((s) => s.resetToDefaults);

  const disabled = engineError !== null && !isRunning;

  return (
    <div className="flex flex-col h-full bg-lab-panel border-l border-lab-border">
      {/* 头部 */}
      <div className="shrink-0 p-3 border-b border-lab-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white tracking-wider">
            参数控制
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={resetToDefaults}
              title="恢复默认"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={isRunning ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => setRunning(!isRunning)}
            >
              {isRunning ? (
                <Pause className="h-3.5 w-3.5 mr-1" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              {isRunning ? "暂停" : "启动"}
            </Button>
          </div>
        </div>

        {isSceneFrozen && (
          <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px]">
            场景已冻结 — 参数非法
          </Badge>
        )}
        {engineError && (
          <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px]">
            {engineError}
          </Badge>
        )}
      </div>

      {/* 参数标签页 */}
      <Tabs defaultValue="system" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 shrink-0">
          {GROUPS.map((g) => (
            <TabsTrigger key={g.id} value={g.id}>
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {GROUPS.map((g) => (
            <TabsContent key={g.id} value={g.id} className="space-y-3 mt-0">
              {GROUPED_META[g.id]
                .map((key) => PARAM_META.find((m) => m.key === key)!)
                .sort((a, b) => a.order - b.order)
                .map((meta) => (
                  <ParamSlider key={meta.key} meta={meta} />
                ))}
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* 底部 */}
      <div className="shrink-0 p-3 border-t border-lab-border space-y-2">
        <span className="text-[10px] text-lab-border">积分方法</span>
        <MethodSelector />
        <span className="text-[10px] text-lab-border">预设</span>
        <PresetButtons />
      </div>
    </div>
  );
}
