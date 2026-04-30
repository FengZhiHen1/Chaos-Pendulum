import { useSimulationStore } from "@/features/simulation";

interface ChaosIndicatorProps {
  className?: string;
}

function classifyLambda(lambda: number) {
  if (lambda > 0.01) return { label: "混沌", tone: "chaos" as const };
  if (lambda < -0.01) return { label: "稳定", tone: "stable" as const };
  return { label: "准周期", tone: "quasi" as const };
}

export function ChaosIndicator({ className = "" }: ChaosIndicatorProps) {
  const lyapunovExponent = useSimulationStore((s) => s.lyapunovExponent);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isSimulationActive = useSimulationStore((s) => s.isSimulationActive);

  const hasData = isSimulationActive && lyapunovExponent !== 0;

  if (!isRunning && !hasData) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
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

  const badgeClass =
    tone === "chaos"
      ? "bg-separation-alert/15 text-separation-alert animate-pulse"
      : tone === "stable"
        ? "bg-emerald-500/15 text-emerald-400"
        : "bg-amber-500/15 text-amber-400";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
        {label}
      </span>
      <span className="text-[10px] font-mono text-on-surface-variant">
        λ = {lyapunovExponent.toFixed(4)}
      </span>
    </div>
  );
}
