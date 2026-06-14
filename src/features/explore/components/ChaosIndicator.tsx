import { cn } from "@/shared/infrastructure/cn";

interface ChaosIndicatorProps {
  /** 实时 Lyapunov 指数 */
  lyapunovExponent: number;
  /** 仿真是否正在运行 */
  isRunning: boolean;
  /** 仿真是否已产生过有效数据 */
  isSimulationActive: boolean;
  className?: string;
}

type ChaosTone = "stable" | "quasi" | "chaos";

function classifyLambda(lambda: number): { label: string; tone: ChaosTone } {
  if (lambda > 0.01) return { label: "混沌", tone: "chaos" };
  if (lambda < -0.01) return { label: "稳定", tone: "stable" };
  return { label: "准周期", tone: "quasi" };
}

/**
 * 混沌指示器 —— 纯展示组件。
 *
 * 根据 Lyapunov 指数显示稳定 / 准周期 / 混沌状态徽章与数值读数。
 */
export function ChaosIndicator({
  lyapunovExponent,
  isRunning,
  isSimulationActive,
  className = "",
}: ChaosIndicatorProps) {
  const hasData = isSimulationActive && lyapunovExponent !== 0;

  if (!isRunning && !hasData) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-surface-container text-on-surface-variant">
          待机
        </span>
        <span className="text-[10px] font-mono text-on-surface-variant/50">
          λ = --
        </span>
      </div>
    );
  }

  const { label, tone } = classifyLambda(lyapunovExponent);

  const badgeClass = cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
    tone === "chaos" && "bg-separation-alert/15 text-separation-alert animate-pulse",
    tone === "stable" && "bg-emerald-500/15 text-emerald-400",
    tone === "quasi" && "bg-amber-500/15 text-amber-400",
  );

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className={badgeClass}>{label}</span>
      <span className="text-[10px] font-mono text-on-surface-variant">
        λ = {lyapunovExponent.toFixed(4)}
      </span>
    </div>
  );
}
