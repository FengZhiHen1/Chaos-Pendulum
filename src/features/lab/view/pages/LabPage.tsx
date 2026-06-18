import { useCallback } from "react";
import { FlaskConical, CheckCircle, XCircle, Circle, Code, Play, AlertTriangle, Info, Timer, Activity } from "lucide-react";
import { useLabStore } from "../../store";
import { useLabValidation } from "../../hooks/useLabValidation";
import { useSimulationStore } from "@/features/simulation/store";
import { SandboxPanel } from "../components/SandboxPanel";
import { SANDBOX_TEMPLATES } from "../../contracts";
import type { SandboxTemplateId } from "../../contracts";
import type { ValidationTestKey, ValidationResult, ValidationMetrics } from "../../validation-runner";
import { cn } from "@/shared/lib/cn";

interface CheckDef {
  key: ValidationTestKey;
  label: string;
  desc: string;
}

const CHECKS: CheckDef[] = [
  { key: "smallAngle", label: "小角度简正模", desc: "双摆等质量等长度同相模周期吻合 < 2%" },
  { key: "singlePendulum", label: "单摆退化", desc: "m₂ → 0 时退化为单摆，周期吻合 < 2%" },
  { key: "energy", label: "能量漂移", desc: "无阻尼 1000s 仿真，能量漂移 < 0.5%" },
];

// ─── 子组件 ──────────────────────────────────────

function StatusIcon({ status }: { status?: "idle" | "running" | "passed" | "failed" }) {
  switch (status) {
    case "passed":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-separation-alert" />;
    case "running":
      return <Activity className="w-4 h-4 text-amber-400 animate-pulse" />;
    default:
      return <Circle className="w-4 h-4 text-on-surface-variant/30" />;
  }
}

/** 阈值对比条——在阈值标尺上标出实际值位置 */
function ThresholdBar({ value, threshold, unit }: { value: number; threshold: number; unit: string }) {
  if (isNaN(value)) return null;
  const pct = Math.min(value / (threshold * 2), 1);
  const passed = value < threshold;
  const barColor = passed ? "bg-emerald-400" : "bg-separation-alert";

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-on-surface-variant/60 mb-1">
        <span>0{unit}</span>
        <span className={cn("font-medium", passed ? "text-emerald-400" : "text-separation-alert")}>
          {(value * 100).toFixed(3)}{unit}
        </span>
        <span>{threshold * 100}{unit} (阈值)</span>
      </div>
      <div className="h-1.5 bg-surface-container rounded-full overflow-hidden relative">
        {/* 阈值线 */}
        <div
          className="absolute top-0 h-full w-0.5 bg-on-surface-variant/30 z-10"
          style={{ left: `${50}%` }}
        />
        {/* 实际值 */}
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

/** 结构化指标展示 */
function MetricsDisplay({ metrics }: { metrics: ValidationMetrics }) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] text-on-surface-variant/70">实测</span>
        <span className="text-sm font-mono font-medium text-on-surface tabular-nums">
          {metrics.measured.toFixed(4)}
        </span>
        <span className="text-[10px] text-on-surface-variant/50">{metrics.unit}</span>
        <span className="text-[10px] text-on-surface-variant/40 mx-1">vs</span>
        <span className="text-[11px] text-on-surface-variant/70">理论</span>
        <span className="text-sm font-mono text-on-surface-variant tabular-nums">
          {metrics.expected.toFixed(4)}
        </span>
        <span className="text-[10px] text-on-surface-variant/50">{metrics.unit}</span>
      </div>
      {metrics.extra && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {Object.entries(metrics.extra).map(([k, v]) => (
            <span key={k} className="text-[10px] text-on-surface-variant/50">
              {k}: <span className="text-on-surface-variant/70 font-mono">{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 单张验证卡片 */
function ValidationCard({
  check,
  status,
  detail,
  isActive,
  result,
}: {
  check: CheckDef;
  status?: "idle" | "running" | "passed" | "failed";
  detail?: string;
  isActive: boolean;
  result: ValidationResult | null;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg transition-all duration-300",
        isActive && "ring-1 ring-amber-400/30 bg-amber-500/[0.06]",
        !isActive && status === "passed" && "bg-emerald-500/[0.04]",
        !isActive && status === "failed" && "bg-separation-alert/[0.04]",
        !isActive && status === "running" && "bg-amber-500/[0.04]",
        !isActive && (status === "idle" || !status) && "bg-surface-container-low",
      )}
    >
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={status} />
      </div>
      <div className="flex-1 min-w-0">
        {/* 标题行 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-on-surface font-medium">{check.label}</span>
          {isActive && (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded animate-pulse">
              运行中
            </span>
          )}
          {status === "passed" && !isActive && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              通过
            </span>
          )}
          {status === "failed" && !isActive && (
            <span className="text-[10px] text-separation-alert bg-separation-alert/10 px-1.5 py-0.5 rounded">
              未通过
            </span>
          )}
          {/* 耗时 */}
          {result && !isActive && (
            <span className="text-[10px] text-on-surface-variant/40 flex items-center gap-0.5 ml-auto">
              <Timer className="w-3 h-3" />
              {result.durationMs < 1000
                ? `${Math.round(result.durationMs)}ms`
                : `${(result.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>

        {/* 描述 */}
        {!isActive && !detail && (
          <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{check.desc}</p>
        )}

        {/* 运行中 */}
        {isActive && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-amber-300/70">Worker 积分计算中…</p>
            <div className="h-1 bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-amber-400/50 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {/* 结果详情 */}
        {detail && !isActive && (
          <>
            <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-relaxed">{detail}</p>
            {result?.metrics && <MetricsDisplay metrics={result.metrics} />}
            {result && !isNaN(result.value) && (
              <ThresholdBar value={result.value} threshold={result.threshold} unit={result.unit} />
            )}
          </>
        )}

        {/* 空闲时显示 worker 未就绪提示 */}
        {detail && isActive === false && status === "idle" && (
          <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-relaxed">{detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── 页面组件 ────────────────────────────────────

export function LabPage() {
  const {
    validationResults,
    validationDetails,
    isRunning: validationRunning,
    allPassed,
    anyHasRun,
    activeTest,
    lastResults,
    handleRunValidation,
  } = useLabValidation();

  const activeTemplate = useLabStore((s) => s.activeTemplate);
  const setUserCode = useLabStore((s) => s.setUserCode);
  const isWorkerReady = useSimulationStore((s) => s.isWorkerReady);

  const handleLoadTemplate = useCallback((id: SandboxTemplateId) => {
    const tpl = SANDBOX_TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      setUserCode(tpl.code);
      useLabStore.setState({ activeTemplate: id, codeStatus: "idle", codeError: null });
    }
  }, [setUserCode]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* 页头 */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-on-surface tracking-wide">实验模式</h2>
            <span className="text-[10px] text-on-surface-variant">物理验证 · 代码实验</span>
          </div>
        </div>
        {allPassed && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            物理模型验证通过
          </span>
        )}
        {anyHasRun && !allPassed && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-separation-alert/10 text-separation-alert border border-separation-alert/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            部分验证未通过
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：物理验证套件 */}
        <div className="flex-1 p-5 overflow-y-auto">
          <div className="max-w-2xl">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              物理模型验证
            </h3>

            {/* Worker 未就绪横幅 */}
            {!isWorkerReady && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 flex items-start gap-3">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-300/90 font-medium mb-1">仿真引擎未就绪</p>
                  <p className="text-[11px] text-amber-300/60 leading-relaxed">
                    请先切换到「探索模式」点击播放按钮启动仿真，再返回此页面运行验证。
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-on-surface-variant/70 mb-5 leading-relaxed">
              三项自动化验证确保仿真引擎的物理正确性。
              验证通过 Worker 执行实际仿真路径，而非隔离测试纯函数。
            </p>

            <div className="space-y-3">
              {CHECKS.map((check) => (
                <ValidationCard
                  key={check.key}
                  check={check}
                  status={validationResults[check.key]}
                  detail={validationDetails[check.key] || undefined}
                  isActive={activeTest === check.key}
                  result={lastResults[check.key] ?? null}
                />
              ))}
            </div>

            {/* 验证按钮 */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleRunValidation}
                disabled={validationRunning}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  validationRunning
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-wait"
                    : "bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.98]",
                )}
              >
                {validationRunning ? (
                  <>
                    <Activity className="w-4 h-4 animate-pulse" />
                    验证中…
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {anyHasRun ? "重新运行验证" : "运行全部验证"}
                  </>
                )}
              </button>
              {!anyHasRun && (
                <p className="text-[10px] text-on-surface-variant/50 mt-2">
                  在 Worker 线程中依次运行三项验证，预计耗时 1–3 秒
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：代码实验区 */}
        <div className="w-80 shrink-0 flex flex-col bg-surface-container-low border-l border-white/5">
          <div className="px-4 py-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-surface-container flex items-center justify-center">
                <Code className="w-3 h-3 text-on-surface-variant" />
              </div>
              <h4 className="text-xs font-semibold text-on-surface">代码模板</h4>
            </div>
            <div className="space-y-1.5">
              {SANDBOX_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleLoadTemplate(tpl.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-xs border transition-all duration-200",
                    activeTemplate === tpl.id
                      ? "border-primary/30 bg-primary-container/30 text-primary"
                      : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
                  )}
                >
                  <span className="font-medium">{tpl.label}</span>
                  <span className="text-[10px] text-on-surface-variant/50 ml-2">{tpl.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <SandboxPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
