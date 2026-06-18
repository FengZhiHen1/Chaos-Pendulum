/**
 * TimeReversal — 时间反演实验 UI (v3)。
 *
 * 四个阶段:
 *   idle   → 不可见
 *   intro  → 舞台中央实验准备面板
 *   active → 底栏控制条 + 叙事文字 + 漂移曲线
 *   done   → 结果面板
 */
import { useState, useCallback } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { useReversalRunner } from "../../viewModel/hooks/useReversalRunner";
import { DriftCurvePanel } from "./DriftCurvePanel";
import { Play, Pause, Square, ArrowLeft, RotateCcw, FlaskConical, Beaker } from "lucide-react";

// ═══════════════════════════════════════════════════
// 阶段 1: 实验准备面板
// ═══════════════════════════════════════════════════

function IntroPanel({
  onStart, onCancel, mode, onModeChange,
}: {
  onStart: () => void;
  onCancel: () => void;
  mode: "exact" | "numerical";
  onModeChange: (m: "exact" | "numerical") => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
      <div className="w-[400px] max-w-[92vw] rounded-2xl bg-surface-container-high/95 backdrop-blur-xl
        border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* 头部 */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <FlaskConical className="h-4.5 w-4.5 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-on-surface">时间反演实验</h2>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            从当前状态反向运行物理引擎。混沌系统中微小的计算误差会被
            <span className="text-separation-alert font-medium"> 指数放大 </span>，
            导致反向轨迹逐渐偏离——验证混沌的数值不可逆性。
          </p>
        </div>

        {/* 模式选择 */}
        <div className="px-6 pb-1">
          <p className="text-[10px] text-on-surface-variant/40 mb-2 uppercase tracking-wider">实验模式</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onModeChange("numerical")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all border",
                mode === "numerical"
                  ? "bg-primary/10 border-primary/30 text-on-surface"
                  : "bg-surface-container-low border-white/5 text-on-surface-variant/50 hover:text-on-surface-variant",
              )}>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                mode === "numerical" ? "bg-primary/20 text-primary" : "bg-surface-container text-on-surface-variant/30")}>
                <Beaker className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-medium">数值反演</div>
                <div className="text-[10px] opacity-60">真实反向积分 · 展示误差累积</div>
              </div>
            </button>
            <button type="button" onClick={() => onModeChange("exact")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all border",
                mode === "exact"
                  ? "bg-amber-500/10 border-amber-500/30 text-on-surface"
                  : "bg-surface-container-low border-white/5 text-on-surface-variant/50 hover:text-on-surface-variant",
              )}>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                mode === "exact" ? "bg-amber-500/20 text-amber-300" : "bg-surface-container text-on-surface-variant/30")}>
                <ArrowLeft className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-medium">精确对照</div>
                <div className="text-[10px] opacity-60">历史回放 · 理论完全重合</div>
              </div>
            </button>
          </div>
        </div>

        {/* 操作 */}
        <div className="px-6 py-4 flex gap-2">
          <Button variant="tertiary" size="sm" onClick={onCancel} className="flex-1">取消</Button>
          <Button variant="primary" size="sm" onClick={onStart} className="flex-[2]">
            <Play className="h-3.5 w-3.5 mr-1.5" />开始实验
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 阶段 2-3: 底栏控制条
// ═══════════════════════════════════════════════════

function BottomBar({
  isPaused, onPause, onResume, onStop, elapsed, mode, narrativePhase, separationStartTime,
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  elapsed: number;
  mode: "exact" | "numerical";
  narrativePhase: "coinciding" | "separating" | "diverging";
  separationStartTime: number | null;
}) {
  const phaseLabel = {
    coinciding: { text: "轨迹重合中", color: "text-emerald-400" },
    separating: { text: "轨迹开始分离", color: "text-amber-400" },
    diverging: { text: "误差指数放大", color: "text-separation-alert" },
  }[narrativePhase];

  const modeBadge = mode === "exact"
    ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
    : "bg-primary/10 text-primary border-primary/20";

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto
      bg-surface-container-high/90 backdrop-blur border-t border-white/10">
      {/* 叙事行 */}
      <div className={cn("text-center text-[11px] py-1 border-b border-white/5 transition-colors duration-500",
        narrativePhase === "coinciding" && "text-emerald-400/70",
        narrativePhase === "separating" && "text-amber-400/80",
        narrativePhase === "diverging" && "text-separation-alert/80 bg-separation-alert/5",
      )}>
        {mode === "exact"
          ? "精确对照 — 纯历史回放，理论轨迹完全重合"
          : narrativePhase === "coinciding" ? "正向轨迹与反向轨迹完美重合——时间似乎可以倒流？"
          : narrativePhase === "separating" && separationStartTime ? `第 ${separationStartTime.toFixed(1)}s 开始分离——浮点误差正在被指数放大`
          : "混沌的不可逆性：浮点误差在混沌中被指数放大——这就是初值敏感性的计算物理体现"}
      </div>

      {/* 控制行 */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          {isPaused ? (
            <button type="button" onClick={onResume}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-primary/15 text-primary hover:bg-primary/20 transition-colors">
              <Play className="h-3 w-3" />继续
            </button>
          ) : (
            <button type="button" onClick={onPause}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-colors">
              <Pause className="h-3 w-3" />暂停
            </button>
          )}
          <button type="button" onClick={onStop}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-separation-alert/10 text-separation-alert hover:bg-separation-alert/20 border border-separation-alert/15 transition-colors">
            <Square className="h-3 w-3" />结束实验
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border", modeBadge)}>
            {mode === "exact" ? "精确对照" : "数值实验"}
          </span>
          <span className={cn("text-[10px] font-medium", phaseLabel.color)}>
            {phaseLabel.text}
          </span>
          <span className="text-xs font-mono tabular-nums text-on-surface-variant/50">
            {elapsed.toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 阶段 4: 结果面板
// ═══════════════════════════════════════════════════

function ResultPanel({
  maxDrift, separationStartTime, mode, onRestore, onReset,
}: {
  maxDrift: number;
  separationStartTime: number | null;
  mode: "exact" | "numerical";
  onRestore: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
      <div className="w-[380px] max-w-[92vw] rounded-2xl bg-surface-container-high/95 backdrop-blur-xl
        border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.4)] px-6 py-5">
        <h2 className="text-base font-semibold text-on-surface mb-4 text-center">实验完成</h2>

        {mode === "numerical" ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-surface-container-low px-4 py-3 text-center">
                <div className="text-2xl font-mono font-bold text-primary">{maxDrift.toFixed(3)}</div>
                <div className="text-[10px] text-on-surface-variant/40 mt-1">最大漂移距离</div>
              </div>
              <div className="rounded-xl bg-surface-container-low px-4 py-3 text-center">
                <div className="text-2xl font-mono font-bold text-separation-alert">
                  {separationStartTime ? `${separationStartTime.toFixed(1)}s` : "—"}
                </div>
                <div className="text-[10px] text-on-surface-variant/40 mt-1">分离开始时间</div>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant/50 leading-relaxed mb-4 text-center">
              {separationStartTime
                ? `轨迹在第 ${separationStartTime.toFixed(1)} 秒开始分离，最终漂移达 ${maxDrift.toFixed(3)}。`
                : "实验数据已记录。"}
              混沌系统对初值极端敏感——计算中的浮点舍入误差被指数放大，使理论上可逆的哈密顿系统在数值上变得不可逆。
            </p>
          </>
        ) : (
          <p className="text-xs text-on-surface-variant/50 leading-relaxed mb-4 text-center">
            精确反演轨迹完全重合。这证明历史回放本身零误差，数值反演中的漂移确由浮点误差的指数放大引起，而非代码缺陷。
          </p>
        )}

        <div className="space-y-2">
          <Button variant="primary" size="sm" onClick={onRestore} className="w-full justify-center">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />返回正常仿真
          </Button>
          <Button variant="tertiary" size="sm" onClick={onReset} className="w-full justify-center text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />以当前参数重新开始
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 主编排
// ═══════════════════════════════════════════════════

export function TimeReversal() {
  const r = useReversalRunner();
  const [showAdvanced, setShowAdvanced] = useState(false);
  void showAdvanced; void setShowAdvanced; // 保留以备后续使用

  const handleIntroStart = useCallback(() => { r.startReversal(); }, [r]);
  const handleIntroCancel = useCallback(() => { r.closeIntro(); }, [r]);

  const isRunning = r.phase === "reversing" || r.phase === "paused";
  const isPaused = r.phase === "paused";
  const hasCompleted = r.phase === "completed";

  if (!r.introOpen && !isRunning && !hasCompleted && r.phase === "idle") {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* ① 准备面板 */}
      {r.introOpen && r.phase === "idle" && (
        <IntroPanel
          onStart={handleIntroStart}
          onCancel={handleIntroCancel}
          mode={r.mode}
          onModeChange={r.setMode}
        />
      )}

      {/* ② 数值反演 Worker 预取等待 */}
      {r.phase === "awaitingConfirm" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl
            bg-surface-container-high/90 backdrop-blur border border-white/10 text-xs text-on-surface-variant">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            准备反向积分数据…
          </div>
        </div>
      )}

      {/* ③ 运行中 / 暂停中 / 完成(漂移曲线保留) */}
      {(isRunning || (hasCompleted && r.driftHistory.length > 0 && !r.completedOpen && !r.exactCompletedOpen)) && (
        <>
          <BottomBar
            isPaused={isPaused}
            onPause={r.pauseReversal}
            onResume={r.resumeReversal}
            onStop={r.stopReversal}
            elapsed={r.elapsedReversalTime}
            mode={r.mode}
            narrativePhase={r.narrativePhase}
            separationStartTime={r.separationStartTime}
          />
          <DriftCurvePanel
            driftHistory={r.driftHistory}
            maxReversalTime={r.startTime > 0 ? r.startTime : 10}
            mode={r.mode}
            visible={true}
            engineError={r.engineError !== null}
          />
        </>
      )}

      {/* ④ 完成弹窗 */}
      {(r.completedOpen || r.exactCompletedOpen) && (
        <ResultPanel
          maxDrift={r.completedOpen ? r.maxDrift : 0}
          separationStartTime={r.completedOpen ? r.separationStartTime : null}
          mode={r.completedOpen ? r.mode : "exact"}
          onRestore={r.completedOpen ? r.handleRestoreState : r.handleExactRestoreState}
          onReset={r.completedOpen ? r.handleResetAfterComplete : r.handleExactResetAfterComplete}
        />
      )}
    </div>
  );
}
