import { usePhaseSpace } from "../hooks/usePhaseSpace";
import { PhaseSpaceCanvas } from "./PhaseSpaceCanvas";
import type { PhaseVariable } from "./PhaseSpaceCanvas";

interface PhaseSpacePanelProps {
  size?: number;
  maxTrailPoints?: number;
  cursorRadius?: number;
  trailWidth?: number;
}

const VAR_OPTIONS: { value: PhaseVariable; label: string }[] = [
  { value: "theta1", label: "θ₁-θ̇₁" },
  { value: "theta2", label: "θ₂-θ̇₂" },
];

export function PhaseSpacePanel({
  size = 296,
  maxTrailPoints = 3000,
  cursorRadius = 4,
  trailWidth = 1.5,
}: PhaseSpacePanelProps) {
  const {
    thetaStr,
    thetaDotStr,
    activeVariable,
    setActiveVariable,
    isRunning,
  } = usePhaseSpace();

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
              onClick={() => setActiveVariable(opt.value)}
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
