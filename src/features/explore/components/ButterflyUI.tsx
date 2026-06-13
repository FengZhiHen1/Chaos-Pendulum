import { useState, useEffect, useRef } from "react";
import { useButterflyStore } from "../butterfly-store";
import { useExploreStore } from "@/features/explore";
import { createNoiseGenerator, type NoiseGenerator } from "@/shared/infrastructure/audio/noise-generator";
import { getAudioContext } from "@/shared/infrastructure/audio/audio-context";
import type { DeltaEditMode } from "../butterfly-store";

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

// ─── 类型 ────────────────────────────────────────

interface SeparationAlertProps {
  triggered: boolean;
  separationRad: number;
  message?: string;
}

// ─── 组件 ────────────────────────────────────────

export function SeparationAlert({
  triggered,
  separationRad,
  message = "完全失相关",
}: SeparationAlertProps) {
  const [dismissLevel, setDismissLevel] = useState(0);
  const sonificationEnabled = useExploreStore((s) => s.sonificationEnabled);

  // triggered 从 false→true 时重置 dismiss + 触发噪声
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

  // 卸载时清理噪声
  useEffect(() => {
    return () => stopAlertNoise();
  }, []);

  if (!triggered || dismissLevel >= 2) return null;

  const separationDeg = (separationRad * 180) / Math.PI;
  const opacity = dismissLevel === 0 ? 1 : 0.3;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <div
        className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg pointer-events-auto cursor-pointer transition-opacity duration-300"
        style={{
          background: "rgba(255, 0, 0, 0.15)",
          border: "1px solid rgba(255, 0, 0, 0.3)",
          animation: dismissLevel === 0 ? "pulse-alert 1.5s ease-in-out infinite" : undefined,
          opacity,
        }}
        onClick={() => setDismissLevel((l) => l + 1)}
        title="点击半透明，再次点击关闭"
      >
        <span className="text-lg font-bold" style={{ color: "#ff4444" }}>
          ⚠ {message} — |Δθ| 已超过 90°
        </span>
        <span className="text-sm" style={{ color: "#ff8888" }}>
          |Δθ| = {separationDeg.toFixed(1)}°
        </span>
      </div>
    </div>
  );
}

// ─── DeltaPanel ──────────────────────────────────

interface DeltaPanelProps {
  editMode: DeltaEditMode;
  onEditModeChange: (mode: DeltaEditMode) => void;
  onDeltaChange: (deltaDeg: number) => void;
  deltaDeg: number;
}

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
    <div
      className="flex flex-wrap items-center gap-4 px-4 py-2 text-xs font-mono rounded"
      style={{ background: "#0d0d1a", color: "#aaaacc" }}
    >
      {/* Delta 调节 */}
      <div className="flex items-center gap-2">
        <span>δ:</span>
        <input
          type="number"
          className="w-20 px-1 py-0.5 rounded text-xs bg-transparent border border-gray-600 text-on-surface"
          value={deltaDeg}
          min={0}
          max={10}
          step={0.1}
          onChange={(e) => onDeltaChange(parseFloat(e.target.value) || 0)}
        />
        <span>°</span>
      </div>

      {/* 分离度 */}
      <span className="text-gray-600">|</span>
      <span>
        |Δθ|:{" "}
        <span className={separation.isFullyDecoupled ? "text-red-400" : "text-green-400"}>
          {sepDeg.toFixed(2)}°
        </span>
      </span>
      <span>
        max:{" "}
        <span className="text-yellow-400">{maxSepDeg.toFixed(2)}°</span>
      </span>

      {/* 角度对比 */}
      <span className="text-gray-600">|</span>
      <span>
        θ₁:{" "}
        <span className="text-amber-300">{(sideA.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
        {" / "}
        <span className="text-purple-300">{(sideB.state.theta1 * 180 / Math.PI).toFixed(1)}°</span>
      </span>
      <span>
        θ₂:{" "}
        <span className="text-amber-300">{(sideA.state.theta2 * 180 / Math.PI).toFixed(1)}°</span>
        {" / "}
        <span className="text-purple-300">{(sideB.state.theta2 * 180 / Math.PI).toFixed(1)}°</span>
      </span>

      {/* 编辑模式 */}
      <span className="text-gray-600">|</span>
      <div className="flex gap-1">
        {(["synced", "a-only", "b-only"] as DeltaEditMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onEditModeChange(mode)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              editMode === mode
                ? "bg-primary text-[#0D1117]"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {mode === "synced" ? "同步" : mode === "a-only" ? "仅A" : "仅B"}
          </button>
        ))}
      </div>
    </div>
  );
}
