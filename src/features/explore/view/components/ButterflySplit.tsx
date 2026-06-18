import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../../store";
import { useButterflySimulation } from "../../viewModel/hooks/useButterflySimulation";
import { SeparationAlert } from "./ButterflyUI";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Play, Pause, RotateCcw, X, GitCompare } from "lucide-react";

interface ButterflySplitProps {
  onExit: () => void;
}

export function ButterflySplit({ onExit }: ButterflySplitProps) {
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  const isRunning = useButterflyStore((s) => s.isRunning);
  const isFullyDecoupled = useButterflyStore((s) => s.separation.isFullyDecoupled);
  const separationRad = useButterflyStore((s) => s.separation.currentSeparation);
  const editMode = useButterflyStore((s) => s.editMode);
  const bfSetEditMode = useButterflyStore((s) => s.setEditMode);
  const sideA = useButterflyStore((s) => s.sideA);
  const sideB = useButterflyStore((s) => s.sideB);
  const { handlePlay, handlePause, handleReset, handleDeltaChange } = useButterflySimulation();

  const sepDeg = separationRad * 180 / Math.PI;
  const theta1A = sideA.state.theta1 * 180 / Math.PI;
  const theta1B = sideB.state.theta1 * 180 / Math.PI;

  return (
    <>
      {/* 顶部悬浮控制栏 */}
      <div className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2
        flex items-center gap-3 px-4 py-2 rounded-xl
        bg-surface-container-high/90 backdrop-blur-xl border border-white/10
        shadow-[0_8px_24px_rgba(0,0,0,0.3)]">

        {/* 播放控制 */}
        <div className="flex items-center gap-1.5">
          <Button variant={isRunning ? "secondary" : "primary"} size="sm"
            onClick={isRunning ? handlePause : handlePlay} className="h-8 text-xs">
            {isRunning ? <><Pause className="h-3.5 w-3.5 mr-1" />暂停</>
              : <><Play className="h-3.5 w-3.5 mr-1" />播放</>}
          </Button>
          <Button variant="tertiary" size="sm" onClick={handleReset} className="h-8 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <span className="w-px h-6 bg-white/10" />

        {/* Delta 调节 */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-on-surface-variant/50 font-mono text-[10px]">δ</span>
          <input type="number" min={1e-6} max={10} step={0.000001}
            value={butterflyDelta}
            onChange={(e) => handleDeltaChange(parseFloat(e.target.value) || 1e-6)}
            className="w-20 h-7 px-2 rounded-lg bg-surface-container-low border border-white/10
              text-on-surface text-xs font-mono
              focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20" />
          <span className="text-on-surface-variant/40 text-[10px]">°</span>

          {/* 编辑模式 */}
          <div className="flex ml-2 bg-surface-container-low rounded-lg border border-white/5 overflow-hidden">
            {(["synced", "a-only", "b-only"] as const).map((m) => (
              <button key={m} type="button" onClick={() => bfSetEditMode(m)}
                className={cn("h-7 px-2 text-[10px] font-medium transition-colors",
                  editMode === m
                    ? "bg-primary/20 text-primary"
                    : "text-on-surface-variant/40 hover:text-on-surface-variant/70")}>
                {m === "synced" ? "同步" : m === "a-only" ? "A" : "B"}
              </button>
            ))}
          </div>
        </div>

        <span className="w-px h-6 bg-white/10" />

        {/* 退出 */}
        <Button variant="tertiary" size="sm" onClick={onExit}
          className="h-8 text-xs text-separation-alert hover:bg-separation-alert/10">
          <X className="h-3.5 w-3.5 mr-1" />退出
        </Button>
      </div>

      {/* 底部信息条 */}
      <div className={cn(
        "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-4 px-4 py-2 rounded-xl text-xs",
        "bg-surface-container-high/70 backdrop-blur border border-white/5",
        isFullyDecoupled && "border-separation-alert/20 bg-separation-alert/5",
      )}>
        {/* 图例 */}
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]" />
          <span className="text-amber-300/80 font-mono text-[11px]">{theta1A.toFixed(1)}°</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.4)]" />
          <span className="text-purple-300/80 font-mono text-[11px]">{theta1B.toFixed(1)}°</span>
        </span>

        <span className="w-px h-4 bg-white/10" />

        {/* 分离度 */}
        <span className="flex items-center gap-1.5">
          <GitCompare className={cn("h-3 w-3", isFullyDecoupled ? "text-separation-alert" : "text-emerald-400")} />
          <span className={cn("font-mono text-[11px] tabular-nums",
            isFullyDecoupled ? "text-separation-alert font-semibold" : "text-emerald-400/70")}>
            |Δθ| {sepDeg.toFixed(2)}°
          </span>
        </span>

        {isFullyDecoupled && (
          <span className="text-separation-alert/80 text-[10px] font-medium animate-pulse">
            完全失相关
          </span>
        )}
      </div>

      {/* 分离警报 */}
      <SeparationAlert triggered={isFullyDecoupled} separationRad={separationRad} />
    </>
  );
}
