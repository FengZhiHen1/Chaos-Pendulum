import { useState, useEffect, useRef } from "react";
import { useButterflyStore } from "../../store";
import { useExploreStore } from "@/features/explore";
import { createNoiseGenerator, type NoiseGenerator } from "@/shared/infrastructure/audio/noise-generator";
import { getAudioContext } from "@/shared/infrastructure/audio/audio-context";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import type { DeltaEditMode } from "../../store";

// ─── 全局噪声实例（跨组件生命周期共享） ──────────

let alertNoise: NoiseGenerator | null = null;

function startAlertNoise(): void {
  if (alertNoise) return;
  try {
    alertNoise = createNoiseGenerator(2);
    alertNoise.source.connect(getAudioContext().destination);
    alertNoise.start();
    alertNoise.setLevel(0.02);
  } catch {
    alertNoise = null;
  }
}

function stopAlertNoise(): void {
  if (!alertNoise) return;
  try {
    alertNoise.source.disconnect();
    alertNoise.dispose();
  } catch { /* 忽略 */ }
  alertNoise = null;
}

// ─── 分离警报 ────────────────────────────────────

interface SeparationAlertProps {
  triggered: boolean;
  separationRad: number;
  message?: string;
}

export function SeparationAlert({
  triggered,
  separationRad,
  message = "完全失相关",
}: SeparationAlertProps) {
  const [dismissLevel, setDismissLevel] = useState(0);
  const sonificationEnabled = useExploreStore((s) => s.sonificationEnabled);

  const prevTriggered = useRef(triggered);
  useEffect(() => {
    if (triggered && !prevTriggered.current) {
      setDismissLevel(0);
      if (sonificationEnabled) startAlertNoise();
    }
    if (!triggered) {
      stopAlertNoise();
    }
    prevTriggered.current = triggered;
  }, [triggered, sonificationEnabled]);

  useEffect(() => () => stopAlertNoise(), []);

  if (!triggered || dismissLevel >= 2) return null;

  const separationDeg = (separationRad * 180) / Math.PI;
  const opacity = dismissLevel === 0 ? 1 : 0.3;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <button
        type="button"
        onClick={() => setDismissLevel((l) => l + 1)}
        title="点击半透明，再次点击关闭"
        className={cn(
          "pointer-events-auto flex flex-col items-center gap-1 px-6 py-4 rounded-lg border transition-opacity duration-quick",
          "bg-separation-alert/15 border-separation-alert/30 text-separation-alert",
          dismissLevel === 0 && "animate-pulse",
        )}
        style={{ opacity }}
      >
        <span className="text-lg font-bold">⚠ {message}</span>
        <span className="text-sm font-mono">|Δθ| = {separationDeg.toFixed(1)}°</span>
      </button>
    </div>
  );
}

// ─── Delta 控制面板 ──────────────────────────────

interface DeltaPanelProps {
  editMode: DeltaEditMode;
  onEditModeChange: (mode: DeltaEditMode) => void;
  onDeltaChange: (deltaDeg: number) => void;
  deltaDeg: number;
}

const EDIT_MODE_OPTIONS: { value: DeltaEditMode; label: string }[] = [
  { value: "synced", label: "同步" },
  { value: "a-only", label: "仅 A" },
  { value: "b-only", label: "仅 B" },
];

export function DeltaPanel({
  editMode,
  onEditModeChange,
  onDeltaChange,
  deltaDeg,
}: DeltaPanelProps) {
  const sideA = useButterflyStore((s) => s.sideA);
  const sideB = useButterflyStore((s) => s.sideB);
  const separation = useButterflyStore((s) => s.separation);

  const sepDeg = (separation.currentSeparation * 180) / Math.PI;
  const maxSepDeg = (separation.maxSeparation * 180) / Math.PI;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-surface-container-low border border-white/5 text-xs font-mono">
      {/* Delta 调节 */}
      <div className="flex items-center gap-1.5">
        <span className="text-on-surface-variant">δ:</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={deltaDeg}
          onChange={(e) => onDeltaChange(parseFloat(e.target.value) || 0)}
          className="w-16 h-6 px-1 rounded bg-surface-container-high border border-outline-variant/30 text-on-surface text-[11px] focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary-focus-glow"
        />
        <span className="text-on-surface-variant">°</span>
      </div>

      <span className="text-outline-variant">|</span>

      {/* 分离度 */}
      <span className="text-on-surface-variant">
        |Δθ|:{" "}
        <span className={separation.isFullyDecoupled ? "text-separation-alert" : "text-emerald-400"}>
          {sepDeg.toFixed(2)}°
        </span>
      </span>
      <span className="text-on-surface-variant">
        max: <span className="text-amber-400">{maxSepDeg.toFixed(2)}°</span>
      </span>

      <span className="text-outline-variant">|</span>

      {/* 角度对比 */}
      <span className="text-on-surface-variant">
        θ₁:{" "}
        <span className="text-amber-300">{(sideA.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
        {" / "}
        <span className="text-purple-300">{(sideB.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
      </span>
      <span className="text-on-surface-variant">
        θ₂:{" "}
        <span className="text-amber-300">{(sideA.state.theta2 * 180 / Math.PI).toFixed(1)}°</span>
        {" / "}
        <span className="text-purple-300">{(sideB.state.theta2 * 180 / Math.PI).toFixed(1)}°</span>
      </span>

      <span className="text-outline-variant">|</span>

      {/* 编辑模式 */}
      <div className="flex gap-1">
        {EDIT_MODE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={editMode === opt.value ? "primary" : "tertiary"}
            size="sm"
            onClick={() => onEditModeChange(opt.value)}
            className="h-6 text-[10px] px-2"
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
