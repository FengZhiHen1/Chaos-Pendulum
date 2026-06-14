/**
 * TimeReversal — 时间反演实验 UI 组件（编排层，~180行）。
 *
 * 所有状态管理委托给 useReversalRunner Hook。组件仅负责 JSX 渲染。
 */
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/view/components/ui/dialog";
import { Button } from "@/shared/view/components/ui/button";
import { useReversalRunner } from "../../viewModel/hooks/useReversalRunner";
import { DriftCurvePanel } from "./DriftCurvePanel";
import { TeachingAnnotationPopup } from "./TeachingAnnotationPopup";

interface TimeReversalProps {
  className?: string;
}

export function TimeReversal({ className = "" }: TimeReversalProps) {
  const r = useReversalRunner();

  return (
    <div className={cn("pointer-events-none", className)}>
      {/* 控制栏 */}
      <div className="absolute top-3 right-3 z-30 pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg
        bg-surface-container-high/95 backdrop-blur border border-outline-variant/20 shadow-card-hover">
        <div className="flex rounded-lg overflow-hidden border border-outline-variant/30">
          <button type="button" onClick={() => !r.active && r.setMode("exact")} disabled={r.active}
            className={cn("px-2.5 py-1 text-[11px] font-medium transition-colors",
              r.mode === "exact" ? "bg-amber-500/20 text-amber-300" : "bg-transparent text-on-surface-variant hover:text-on-surface",
              r.active && "opacity-50 cursor-not-allowed")} title="精确反演（对照）— 仅视觉回放，无误差">
            精确反演
          </button>
          <button type="button" onClick={() => !r.active && r.setMode("numerical")} disabled={r.active}
            className={cn("px-2.5 py-1 text-[11px] font-medium transition-colors",
              r.mode === "numerical" ? "bg-primary-container text-primary" : "bg-transparent text-on-surface-variant hover:text-on-surface",
              r.active && "opacity-50 cursor-not-allowed")} title="数值反演（实验）— 真实反向积分，展示浮点误差指数放大">
            数值反演
          </button>
        </div>
        <Button variant={r.active ? "secondary" : "primary"} size="sm" disabled={r.buttonDisabled}
          onClick={r.active ? r.stopReversal : r.startReversal} title={r.tooltipText}
          className={cn("text-[11px] h-7", r.active && "bg-separation-alert/15 text-separation-alert hover:bg-separation-alert/25 border border-separation-alert/20")}>
          {r.phase === "awaitingConfirm" ? "准备中…" : r.active ? "停止反演" : "时间倒流"}
        </Button>
        <span className={cn("text-[10px] font-mono", r.historyInsufficient ? "text-on-surface-variant/30" : "text-on-surface-variant")}>
          {r.history.length}<span className="text-on-surface-variant/30">/6000</span>
        </span>
      </div>

      <TeachingAnnotationPopup visible={r.showAnnotation} onClose={r.dismissAnnotation} />

      <DriftCurvePanel driftHistory={r.driftHistory} maxReversalTime={r.startTime > 0 ? r.startTime : 10}
        mode={r.mode} visible={r.phase === "reversing" || (r.phase === "completed" && r.driftHistory.length > 0)}
        engineError={r.engineError !== null} />

      <Dialog open={r.confirmOpen} onClose={r.dialogPhase === "ready" ? r.handleCancelReversal : () => {}}
        title={r.dialogPhase === "loading" ? "准备反演数据…" : "开始反演？"}
        description={r.dialogPhase === "loading" ? "正在请求反向积分批次，请稍候…" : "反向积分数据已就绪。确认后将开始数值反演，展示误差指数放大过程。"}>
        {r.dialogPhase === "loading" ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-xs text-on-surface-variant">等待 Worker 反向积分…</span>
          </div>
        ) : (
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="tertiary" size="sm" onClick={r.handleCancelReversal}>取消</Button>
            <Button variant="primary" size="sm" onClick={r.handleConfirmReversal}>开始反演</Button>
          </div>
        )}
      </Dialog>

      <Dialog open={r.completedOpen} onClose={r.handleRestoreState} title="反演结束"
        description="数值反演已完成，仿真已停止。请选择后续操作。">
        <div className="space-y-2 mt-2">
          <Button variant="primary" size="sm" onClick={r.handleRestoreState} className="w-full justify-start">① 恢复时间倒流前的状态</Button>
          <Button variant="tertiary" size="sm" onClick={r.handleResetAfterComplete} className="w-full justify-start">② 重置 — 以当前面板参数重新开始</Button>
        </div>
      </Dialog>

      {r.phase === "completed" && r.driftHistory.length > 0 && !r.completedOpen && (
        <div className="absolute bottom-3 left-3 z-20 pointer-events-auto px-3 py-1.5 rounded-lg text-[11px] text-on-surface-variant bg-surface-container-high/95 border border-outline-variant/20">
          最近一次反演（{r.mode === "exact" ? "精确反演" : "数值反演"}）— 漂移曲线已保留
        </div>
      )}
    </div>
  );
}
