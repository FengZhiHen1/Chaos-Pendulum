import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../../store";
import { useButterflySimulation } from "../../viewModel/hooks/useButterflySimulation";
import { SeparationAlert } from "./ButterflyUI";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Play, Pause, RotateCcw, X } from "lucide-react";

interface ButterflySplitProps {
  onExit: () => void;
}

/**
 * 蝴蝶效应 DOM overlay — 顶栏 + 底栏分离警报。
 * 3D 双摆渲染由 ButterflySceneContent 在同一个 Canvas 内完成。
 */
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

  return (
    <>
      {/* 顶栏 — 播放控制 + Delta + 退出 */}
      <div className="pointer-events-auto flex items-center justify-between px-3 py-1.5
        bg-surface-container-lowest/90 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Button variant="primary" size="sm" onClick={isRunning ? handlePause : handlePlay}
            className="h-7 text-xs">
            {isRunning ? <><Pause className="h-3 w-3 mr-1" />暂停</>
              : <><Play className="h-3 w-3 mr-1" />播放</>}
          </Button>
          <Button variant="tertiary" size="sm" onClick={handleReset} className="h-7 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />重置
          </Button>

          <span className="text-outline-variant/30 mx-1">|</span>

          {/* 状态读数 */}
          <span className="text-[11px] font-mono text-on-surface-variant/60">
            θ₁: <span className="text-amber-300">{(sideA.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
            {" / "}
            <span className="text-purple-300">{(sideB.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
          </span>
          <span className="text-[11px] font-mono text-on-surface-variant/60">
            |Δθ|: <span className={isFullyDecoupled ? "text-separation-alert" : "text-emerald-400"}>
              {(separationRad * 180 / Math.PI).toFixed(2)}°
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Delta 小面板 */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-low border border-white/5 text-[11px] font-mono">
            <span className="text-on-surface-variant/50">δ:</span>
            <input
              type="number"
              min={1e-6}
              max={10}
              step={0.000001}
              value={butterflyDelta}
              onChange={(e) => handleDeltaChange(parseFloat(e.target.value) || 1e-6)}
              className="w-16 h-5 px-1 rounded bg-surface-container-high border border-outline-variant/30 text-on-surface text-[11px] focus-visible:outline-none focus-visible:border-primary/70"
            />
            <span className="text-on-surface-variant/50">°</span>
          </div>

          <span className="text-outline-variant/20">|</span>

          {/* 编辑模式 */}
          <div className="flex gap-0.5">
            {(["synced", "a-only", "b-only"] as const).map((m) => (
              <button key={m} type="button" onClick={() => bfSetEditMode(m)}
                className={cn("h-5 px-1.5 rounded text-[10px] transition-colors",
                  editMode === m ? "bg-primary/20 text-primary" : "text-on-surface-variant/40 hover:text-on-surface-variant")}>
                {m === "synced" ? "同步" : m === "a-only" ? "仅A" : "仅B"}
              </button>
            ))}
          </div>

          <Button variant="tertiary" size="sm" onClick={onExit}
            className="h-7 text-xs text-separation-alert hover:bg-separation-alert/10">
            <X className="h-3 w-3 mr-1" />退出
          </Button>
        </div>
      </div>

      {/* 底栏 — 图例 */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2
        flex items-center gap-4 text-[10px] text-on-surface-variant/40">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5 rounded bg-amber-400" /> 摆 A (δ=0)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5 rounded bg-purple-400" /> 摆 B (δ={butterflyDelta}°)
        </span>
        <span className="text-on-surface-variant/20">|</span>
        <span>初始条件仅 θ₁ 差 {butterflyDelta}°</span>
      </div>

      {/* 分离警报 */}
      <SeparationAlert triggered={isFullyDecoupled} separationRad={separationRad} />
    </>
  );
}
