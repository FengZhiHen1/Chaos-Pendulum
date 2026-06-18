/**
 * TimeReversal — 时间反演实验 UI（UX 重构版，~200行）。
 *
 * 用户体验流程：
 *   1. 底部工具栏 [⏳ 时间反演] → 弹出实验介绍卡片
 *   2. [开始实验] → 顶部控制条 + 三阶段叙事 + 漂移曲线
 *   3. 反演结束 → 总结卡片（漂移统计 + 教学洞察）
 *
 * 组件自行管理显隐，不依赖外部 toggle 状态。
 */
import { useState, useCallback } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Dialog } from "@/shared/view/components/ui/dialog";
import { useReversalRunner } from "../../viewModel/hooks/useReversalRunner";
import { DriftCurvePanel } from "./DriftCurvePanel";

// ══════════════════════════════════════════════════════════════
// 实验介绍卡片（舞台中央）
// ══════════════════════════════════════════════════════════════

function IntroCard({
  onStart,
  onCancel,
  onToggleAdvanced,
  showAdvanced,
  mode,
  onModeChange,
}: {
  onStart: () => void;
  onCancel: () => void;
  onToggleAdvanced: () => void;
  showAdvanced: boolean;
  mode: "exact" | "numerical";
  onModeChange: (m: "exact" | "numerical") => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
      <div className="w-[380px] max-w-[90vw] rounded-2xl bg-surface-container-high/95 backdrop-blur-xl
        border border-white/10 shadow-floating-modal px-6 py-5">
        <h2 className="text-base font-semibold text-on-surface mb-3 text-center">
          ⏳ 时间反演实验
        </h2>
        <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
          我们将从当前状态出发，<strong className="text-on-surface">反向运行</strong>物理引擎。
          理论上摆应该完美倒流回起点——但在混沌系统中，微小的计算误差会被
          <strong className="text-separation-alert">指数放大</strong>，
          导致反向轨迹逐渐偏离。这验证了混沌的<strong className="text-on-surface">数值不可逆性</strong>。
        </p>
        <Button variant="primary" size="default" onClick={onStart}
          className="w-full mb-3 justify-center text-sm h-9">
          ▶ 开始实验
        </Button>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onCancel}
            className="text-[11px] text-on-surface-variant/60 hover:text-on-surface transition-colors">
            取消
          </button>
          <button type="button" onClick={onToggleAdvanced}
            className="text-[11px] text-on-surface-variant/40 hover:text-on-surface-variant transition-colors">
            ⚙ 高级选项 {showAdvanced ? "▾" : "▸"}
          </button>
        </div>
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
            <span className="text-[10px] text-on-surface-variant/50">反演模式：</span>
            <button type="button" onClick={() => onModeChange("numerical")}
              className={cn("px-2 py-0.5 text-[10px] rounded transition-colors",
                mode === "numerical" ? "bg-primary-container text-primary" : "text-on-surface-variant/50 hover:text-on-surface-variant")}>
              数值反演（实验）
            </button>
            <button type="button" onClick={() => onModeChange("exact")}
              className={cn("px-2 py-0.5 text-[10px] rounded transition-colors",
                mode === "exact" ? "bg-amber-500/20 text-amber-300" : "text-on-surface-variant/50 hover:text-on-surface-variant")}>
              精确反演（对照）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 顶部半透明控制条
// ══════════════════════════════════════════════════════════════

function ControlBar({
  isPaused,
  onPause,
  onResume,
  onStop,
  elapsed,
  mode,
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  elapsed: number;
  mode: "exact" | "numerical";
}) {
  return (
    <div className="absolute top-0 left-0 right-0 z-30 pointer-events-auto
      flex items-center justify-between px-4 py-1.5
      bg-surface-container-high/80 backdrop-blur border-b border-white/5">
      <div className="flex items-center gap-2">
        {isPaused ? (
          <button type="button" onClick={onResume}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-primary-container text-primary hover:brightness-110 transition-all">
            ▶ 继续
          </button>
        ) : (
          <button type="button" onClick={onPause}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-all">
            ⏸ 暂停
          </button>
        )}
        <button type="button" onClick={onStop}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md
            bg-separation-alert/10 text-separation-alert hover:bg-separation-alert/20 border border-separation-alert/15 transition-all">
          ⏹ 结束
        </button>
      </div>
      <span className="text-[11px] font-mono tabular-nums text-on-surface-variant/60">
        ⏳ 反演中 · {elapsed.toFixed(1)}s
        <span className="ml-2 text-on-surface-variant/30">
          {mode === "exact" ? "精确对照" : "数值实验"}
        </span>
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 三阶段叙事提示（非阻断式，舞台底部文字）
// ══════════════════════════════════════════════════════════════

function Narrative({
  narrativePhase,
  separationStartTime,
  mode,
}: {
  narrativePhase: "coinciding" | "separating" | "diverging";
  separationStartTime: number | null;
  mode: "exact" | "numerical";
}) {
  if (mode === "exact") {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none
        px-4 py-1.5 rounded-full bg-surface-container-high/70 backdrop-blur border border-white/5
        text-[11px] text-on-surface-variant/60">
        精确反演：纯历史回放，理论完全重合（对照组）
      </div>
    );
  }

  const phaseText = {
    coinciding: "正向轨迹（虚线）与反向轨迹（实线）——起初完美重合，似乎时间真的可以倒流？",
    separating: separationStartTime
      ? `第 ${separationStartTime.toFixed(1)} 秒开始分离——微小的浮点误差正在被指数放大！`
      : "轨迹开始分离——微小的浮点误差正在被指数放大！",
    diverging: "混沌的不可逆性：哈密顿系统理论上可逆，但计算机的浮点误差在混沌中被指数放大——这就是初值敏感性的计算物理体现。",
  };

  return (
    <div className={cn(
      "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-lg text-center",
      "px-4 py-2 rounded-lg transition-all duration-500",
      narrativePhase === "coinciding" && "bg-transparent text-on-surface-variant/50 text-[11px]",
      narrativePhase === "separating" && "bg-separation-alert/8 backdrop-blur border border-separation-alert/10 text-separation-alert/90 text-[11px]",
      narrativePhase === "diverging" && "bg-surface-container-high/85 backdrop-blur border border-white/10 text-on-surface-variant text-[11px] leading-relaxed",
    )}>
      {phaseText[narrativePhase]}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 实验总结卡片
// ══════════════════════════════════════════════════════════════

function SummaryCard({
  maxDrift,
  separationStartTime,
  mode,
  onRestore,
  onReset,
}: {
  maxDrift: number;
  separationStartTime: number | null;
  mode: "exact" | "numerical";
  onRestore: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
      <div className="w-[360px] max-w-[90vw] rounded-2xl bg-surface-container-high/95 backdrop-blur-xl
        border border-white/10 shadow-floating-modal px-6 py-5">
        <h2 className="text-base font-semibold text-on-surface mb-3 text-center">
          实验完成
        </h2>
        {mode === "numerical" ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <div className="text-lg font-mono font-semibold text-primary">
                  {maxDrift.toFixed(3)}
                </div>
                <div className="text-[10px] text-on-surface-variant/50 mt-0.5">最大漂移距离</div>
              </div>
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <div className="text-lg font-mono font-semibold text-separation-alert">
                  {separationStartTime ? `${separationStartTime.toFixed(1)}s` : "—"}
                </div>
                <div className="text-[10px] text-on-surface-variant/50 mt-0.5">分离开始时间</div>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant/60 leading-relaxed mb-4 text-center">
              {separationStartTime
                ? `轨迹在第 ${separationStartTime.toFixed(1)} 秒开始分离，最终漂移达 ${maxDrift.toFixed(3)}——这验证了混沌系统的数值不可逆性。`
                : "实验数据已记录，这验证了混沌系统的数值不可逆性。"}
            </p>
          </>
        ) : (
          <p className="text-xs text-on-surface-variant/60 leading-relaxed mb-4 text-center">
            精确反演作为对照组，轨迹完全重合——这证明历史回放本身没有引入误差，验证了数值反演中漂移的来源确为浮点误差的指数放大。
          </p>
        )}
        <div className="space-y-2">
          <Button variant="primary" size="sm" onClick={onRestore} className="w-full justify-start text-xs">
            ↩ 返回正常仿真
          </Button>
          <Button variant="tertiary" size="sm" onClick={onReset} className="w-full justify-start text-xs">
            🔁 再次实验（以当前参数重置）
          </Button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主编排组件
// ══════════════════════════════════════════════════════════════

export function TimeReversal() {
  const r = useReversalRunner();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleIntroStart = useCallback(() => {
    setShowAdvanced(false);
    r.startReversal();
  }, [r]);

  const handleIntroCancel = useCallback(() => {
    setShowAdvanced(false);
    r.closeIntro();
  }, [r]);

  const isRunning = r.phase === "reversing" || r.phase === "paused";
  const isPaused = r.phase === "paused";
  const hasCompleted = r.phase === "completed";

  // ── 无实验活动且无 intro 时，完全不可见 ──
  if (!r.introOpen && !isRunning && !hasCompleted && r.phase === "idle") {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* ── ① 实验介绍卡片 ── */}
      {r.introOpen && r.phase === "idle" && (
        <IntroCard
          onStart={handleIntroStart}
          onCancel={handleIntroCancel}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          showAdvanced={showAdvanced}
          mode={r.mode}
          onModeChange={r.setMode}
        />
      )}

      {/* ── ② 数值反演确认弹窗（Worker 预取） ── */}
      <Dialog open={r.confirmOpen} onClose={r.handleCancelReversal}
        title={r.dialogPhase === "loading" ? "准备反演数据…" : "开始反演？"}
        description={r.dialogPhase === "loading"
          ? "正在请求反向积分批次，请稍候…（10 秒超时）"
          : "反向积分数据已就绪。确认后将开始数值反演。"}>
        {r.dialogPhase === "loading" ? (
          <div className="flex flex-col items-center justify-center py-4 gap-3">
            <div className="flex items-center">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-xs text-on-surface-variant">等待 Worker 反向积分…</span>
            </div>
            <Button variant="tertiary" size="sm" onClick={r.handleCancelReversal}>取消</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="tertiary" size="sm" onClick={r.handleCancelReversal}>取消</Button>
            <Button variant="primary" size="sm" onClick={r.handleConfirmReversal}>开始反演</Button>
          </div>
        )}
      </Dialog>

      {/* ── ③ 运行中：顶部控制条（仅 running/paused）+ 叙事提示 + 漂移曲线 ── */}
      {isRunning && (
        <ControlBar
          isPaused={isPaused}
          onPause={r.pauseReversal}
          onResume={r.resumeReversal}
          onStop={r.stopReversal}
          elapsed={r.elapsedReversalTime}
          mode={r.mode}
        />
      )}
      {(isRunning || (hasCompleted && r.driftHistory.length > 0 && !r.completedOpen && !r.exactCompletedOpen)) && (
        <>
          <Narrative
            narrativePhase={r.narrativePhase}
            separationStartTime={r.separationStartTime}
            mode={r.mode}
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

      {/* ── ④ 数值反演完成总结 ── */}
      {r.completedOpen && (
        <SummaryCard
          maxDrift={r.maxDrift}
          separationStartTime={r.separationStartTime}
          mode={r.mode}
          onRestore={r.handleRestoreState}
          onReset={r.handleResetAfterComplete}
        />
      )}

      {/* ── ⑤ 精确反演完成总结 ── */}
      {r.exactCompletedOpen && (
        <SummaryCard
          maxDrift={0}
          separationStartTime={null}
          mode="exact"
          onRestore={r.handleExactRestoreState}
          onReset={r.handleExactResetAfterComplete}
        />
      )}
    </div>
  );
}
