import { cn } from "@/shared/lib/cn";
import { SonificationToggle } from "./SonificationToggle";
import { ChaosIndicator } from "./ChaosIndicator";

interface ExploreStageOverlayProps {
  isSonificationActive: boolean;
  onSonificationToggle: () => void;
  isDesktop: boolean;
  lyapunovExponent: number;
  isRunning: boolean;
  isSimulationActive: boolean;
  className?: string;
}

/**
 * 3D 舞台 DOM 覆盖层。
 *
 * - 左上角：声效开关、混沌指示器
 * - 蝴蝶效应入口已统一至底部工具栏，避免重复。
 */
export function ExploreStageOverlay({
  isSonificationActive,
  onSonificationToggle,
  isDesktop,
  lyapunovExponent,
  isRunning,
  isSimulationActive,
  className = "",
}: ExploreStageOverlayProps) {
  return (
    <div className={cn("absolute inset-0 pointer-events-none z-overlay", className)}>
      {/* 左上角 */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-auto">
        <SonificationToggle
          isActive={isSonificationActive}
          onToggle={onSonificationToggle}
          isDesktop={isDesktop}
        />
        <ChaosIndicator
          lyapunovExponent={lyapunovExponent}
          isRunning={isRunning}
          isSimulationActive={isSimulationActive}
        />
      </div>
    </div>
  );
}
