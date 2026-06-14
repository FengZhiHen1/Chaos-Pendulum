import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";
import { Badge } from "@/shared/view/components/ui/badge";
import { Button } from "@/shared/view/components/ui/button";
import { Dialog } from "@/shared/view/components/ui/dialog";
import { RotateCcw, Play, Pause, AlertTriangle } from "lucide-react";
import { PARAM_META } from "../../viewModel/selectors/paramMeta";
import type { ParamGroup } from "../../viewModel/selectors/paramMeta";
import { useSimulationControls } from "../../viewModel/hooks/useSimulationControls";
import { useSimulationStore } from "../../store";
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

interface ParamPanelProps {
  /** 探索模式下播放/重置已移至底部工具栏，隐藏面板头部全局控制 */
  hideGlobalControls?: boolean;
}

/**
 * 参数控制面板 — 探索模式左侧面板。
 *
 * 风格：Dark Room，surface-container-low 背景，无实线边框
 * 参数分组：系统参数 / 初始条件 / 环境
 */
export function ParamPanel({ hideGlobalControls = false }: ParamPanelProps) {
  const {
    isRunning,
    isWorkerReady,
    engineError,
    isSceneFrozen,
    paramsDirty,
    disabled,
    setRunning,
    applyCurrentSettings,
  } = useSimulationControls();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const params = useSimulationStore((s) => s.params);
  const initialConditions = useSimulationStore((s) => s.initialConditions);
  const method = useSimulationStore((s) => s.method);

  const handleResetClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    setConfirmOpen(false);
    applyCurrentSettings();
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-low">
      {/* Worker 未就绪引导提示 */}
      {!isWorkerReady && (
        <div className="shrink-0 px-3 py-2.5 bg-primary/[0.04] border-b border-primary/10">
          <p className="text-xs text-on-surface-variant/70 leading-relaxed">
            点击 <span className="text-primary font-semibold">▶ 启动</span> 以初始化仿真引擎
          </p>
        </div>
      )}

      {/* 参数更改待生效提示 */}
      {paramsDirty && isWorkerReady && (
        <div className="shrink-0 px-3 py-2 bg-amber-500/[0.04] border-b border-amber-500/15 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300/80 leading-relaxed flex-1">
            参数已更改，点击 <span className="font-semibold text-amber-200/90">重置</span> 以应用新设置
          </p>
        </div>
      )}

      {/* 头部 */}
      <div className="shrink-0 p-3 border-b border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface tracking-wider">
            参数控制
          </span>
          {!hideGlobalControls && (
            <div className="flex items-center gap-1">
              <Button
                variant="icon"
                size="icon"
                onClick={handleResetClick}
                disabled={!isWorkerReady}
                title="以面板当前参数重置仿真"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={isRunning ? "secondary" : "primary"}
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
          )}
        </div>

        {isSceneFrozen && (
          <Badge variant="outline" className="text-separation-alert border-separation-alert/20 text-[10px]">
            场景已冻结 — 参数非法
          </Badge>
        )}
        {engineError && (
          <Badge variant="outline" className="text-separation-alert border-separation-alert/20 text-[10px]">
            {engineError}
          </Badge>
        )}
      </div>

      {/* 参数标签页 */}
      <Tabs defaultValue="system" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 shrink-0 bg-transparent gap-1">
          {GROUPS.map((g) => (
            <TabsTrigger
              key={g.id}
              value={g.id}
              className="text-xs px-3 py-1.5 rounded-md"
            >
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {GROUPS.map((g) => (
            <TabsContent key={g.id} value={g.id} className="space-y-4 mt-0">
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
      <div className="shrink-0 p-3 border-t border-white/5 space-y-2">
        <span className="text-[10px] text-on-surface-variant/50">积分方法</span>
        <MethodSelector />
        <span className="text-[10px] text-on-surface-variant/50">预设</span>
        <PresetButtons />
      </div>

      {/* 重置确认对话框 */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认重置仿真"
        description="将使用面板当前参数重置仿真，已积累的正向历史和反演数据将被清空。"
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface-variant/70 space-y-1">
            <p>θ₁={initialConditions.theta1.toFixed(3)}  ω₁={initialConditions.theta1Dot.toFixed(3)}</p>
            <p>θ₂={initialConditions.theta2.toFixed(3)}  ω₂={initialConditions.theta2Dot.toFixed(3)}</p>
            <p className="border-t border-white/5 pt-1 mt-1">
              m₁={params.m1}  m₂={params.m2}  L₁={params.L1}  L₂={params.L2}
            </p>
            <p>g={params.g}  damping={params.damping}  方法={method}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="tertiary" size="sm" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirmReset}>
              确认重置
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
