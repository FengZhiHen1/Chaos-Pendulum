import { useState, useCallback } from "react";
import { useSimulationStore } from "../store";
import { PhaseSpaceCanvas } from "./PhaseSpaceCanvas";
import type { PhaseVariable } from "./PhaseSpaceCanvas";

// ─── 类型 ──────────────────────────────────────

interface PhaseSpacePanelProps {
  /** Canvas 尺寸 (px)，默认 296（侧栏适配） */
  size?: number;
  /** 轨迹点上限，默认 3000 */
  maxTrailPoints?: number;
  /** 当前点高亮半径，默认 4 */
  cursorRadius?: number;
  /** 轨迹点大小，默认 1.5 */
  trailWidth?: number;
}

const VAR_OPTIONS: { value: PhaseVariable; label: string }[] = [
  { value: "theta1", label: "θ₁-θ̇₁" },
  { value: "theta2", label: "θ₂-θ̇₂" },
];

// ─── 组件 ──────────────────────────────────────

export function PhaseSpacePanel({
  size = 296,
  maxTrailPoints = 3000,
  cursorRadius = 4,
  trailWidth = 1.5,
}: PhaseSpacePanelProps) {
  const [activeVariable, setActiveVariable] = useState<PhaseVariable>("theta1");

  // 读取当前数值
  const theta1 = useSimulationStore((s) => s.theta1);
  const theta1Dot = useSimulationStore((s) => s.theta1Dot);
  const theta2 = useSimulationStore((s) => s.theta2);
  const theta2Dot = useSimulationStore((s) => s.theta2Dot);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const theta = activeVariable === "theta1" ? theta1 : theta2;
  const thetaDot = activeVariable === "theta1" ? theta1Dot : theta2Dot;

  const thetaStr = isNaN(theta) ? "--" : theta.toFixed(3);
  const thetaDotStr = isNaN(thetaDot) ? "--" : thetaDot.toFixed(3);

  const handleToggle = useCallback((v: PhaseVariable) => {
    setActiveVariable(v);
  }, []);

  const show = size >= 100;

  return (
    <div className="flex flex-col border-t border-white/5 bg-surface-container-low">
      {/* 标题行 + Toggle */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold text-on-surface tracking-wider">
          相空间图
        </span>
        <div className="flex gap-0.5">
          {VAR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleToggle(opt.value)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                activeVariable === opt.value
                  ? "bg-primary-container text-primary border-primary/40"
                  : "text-on-surface-variant border-transparent hover:border-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      {show && (
        <div className="px-1 pb-1">
          <PhaseSpaceCanvas
            width={size}
            height={size}
            maxTrailPoints={maxTrailPoints}
            cursorRadius={cursorRadius}
            trailWidth={trailWidth}
            activeVariable={activeVariable}
          />
        </div>
      )}

      {/* 数值标签 */}
      <div className="flex gap-4 px-3 pb-2 text-[10px] font-mono text-on-surface-variant">
        <span>θ = {thetaStr} rad</span>
        <span>θ̇ = {thetaDotStr} rad/s</span>
        {!isRunning && (
          <span className="text-on-surface-variant/50 ml-auto">已暂停</span>
        )}
      </div>
    </div>
  );
}

// 重新导出，方便外部使用
export { exportPhaseSpaceImage } from "./PhaseSpaceCanvas";
export type { PhaseVariable } from "./PhaseSpaceCanvas";
