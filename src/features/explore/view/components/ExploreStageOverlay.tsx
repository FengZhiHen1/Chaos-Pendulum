import { GitCompare } from "lucide-react";
import { cn } from "@/shared/infrastructure/cn";
import { SonificationToggle } from "../../components/SonificationToggle";
import { ChaosIndicator } from "../../components/ChaosIndicator";

interface ExploreStageOverlayProps {
  isSonificationActive: boolean;
  onSonificationToggle: () => void;
  isDesktop: boolean;
  lyapunovExponent: number;
  isRunning: boolean;
  isSimulationActive: boolean;
  onEnterButterfly: () => void;
  className?: string;
}

/**
 * 3D 舞台 DOM 覆盖层。
 *
 * - 左上角：声效开关、混沌指示器
 * - 右上角：蝴蝶效应入口
 */
export function ExploreStageOverlay({
  isSonificationActive,
  onSonificationToggle,
  isDesktop,
  lyapunovExponent,
  isRunning,
  isSimulationActive,
  onEnterButterfly,
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

      {/* 右上角：蝴蝶效应入口 */}
      <button
        type="button"
        onClick={onEnterButterfly}
        className="absolute top-3 right-3 pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-surface/90 backdrop-blur border border-outline-variant/30 text-on-surface-variant
                   hover:text-primary hover:border-primary/30 hover:bg-surface transition-all duration-quick"
        title="进入蝴蝶效应分屏对比"
      >
        <GitCompare className="h-3.5 w-3.5" />
        蝴蝶效应
      </button>
    </div>
  );
}
