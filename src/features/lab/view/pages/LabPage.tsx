import { useState, useCallback } from "react";
import {
  FlaskConical, CheckCircle, XCircle, Circle, Play,
  Activity, PanelLeftClose, PanelLeftOpen, ShieldCheck, Code,
} from "lucide-react";
import { useLabStore } from "../../store";
import { useLabValidation } from "../../hooks/useLabValidation";
import { useSimulationStore } from "@/features/simulation/store";
import { SandboxPanel } from "../components/SandboxPanel";
import { SANDBOX_TEMPLATES } from "../../contracts";
import type { SandboxTemplateId } from "../../contracts";
import type { ValidationTestKey, ValidationResult } from "../../validation-runner";
import { cn } from "@/shared/lib/cn";

// ── 验证项目定义 ──────────────────────────────────

interface CheckDef {
  key: ValidationTestKey;
  label: string;
  icon: string;
  desc: string;
}

const CHECKS: CheckDef[] = [
  {
    key: "smallAngle", label: "小角度简正模", icon: "θ",
    desc: "θ₀ ≤ 5° 时，双摆退化为线性耦合振子。验证同相模（两个摆同方向摆动）的周期与理论值吻合度 < 2%。若验证失败，说明 ODE 积分器或运动方程存在系统性误差。",
  },
  {
    key: "singlePendulum", label: "单摆退化", icon: "→",
    desc: "令下摆质量 m₂ → 0，系统应退化为单摆。验证退化后的周期与解析解 T = 2π√(L/g) 的吻合度 < 2%。这是检验方程推导正确性的关键边界测试。",
  },
  {
    key: "energy", label: "能量漂移", icon: "E",
    desc: "关闭阻尼（damping = 0），仿真 1000 秒。对保守系统，总机械能应守恒。若能量漂移 > 0.5%，说明积分器精度不足或运动方程推导存在能量泄漏。",
  },
];

// ── 子组件 ──────────────────────────────────────

function StatusIcon({ status }: { status?: "idle" | "running" | "passed" | "failed" }) {
  switch (status) {
    case "passed": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    case "failed": return <XCircle className="w-3.5 h-3.5 text-separation-alert" />;
    case "running": return <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
    default: return <Circle className="w-3.5 h-3.5 text-on-surface-variant/30" />;
  }
}

function ThresholdBar({ value, threshold, unit }: { value: number; threshold: number; unit: string }) {
  if (isNaN(value)) return null;
  const pct = Math.min(value / (threshold * 2), 1);
  const passed = value < threshold;
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[9px] text-on-surface-variant/60 mb-0.5">
        <span>0{unit}</span>
        <span className={cn("font-medium", passed ? "text-emerald-400" : "text-separation-alert")}>
          {(value * 100).toFixed(3)}{unit}
        </span>
        <span>{threshold * 100}{unit}</span>
      </div>
      <div className="h-1 bg-surface-container rounded-full overflow-hidden relative">
        <div className="absolute top-0 h-full w-0.5 bg-on-surface-variant/30 z-10" style={{ left: "50%" }} />
        <div className={cn("h-full rounded-full transition-all duration-500", passed ? "bg-emerald-400" : "bg-separation-alert")}
          style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function CompactValidationCard({
  check, status, detail, isActive, result,
}: {
  check: CheckDef;
  status?: "idle" | "running" | "passed" | "failed";
  detail?: string;
  isActive: boolean;
  result: ValidationResult | null;
}) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 p-3 rounded-lg transition-all duration-300",
      isActive && "ring-1 ring-amber-400/40 bg-amber-500/[0.08]",
      !isActive && status === "passed" && "bg-emerald-500/[0.06]",
      !isActive && status === "failed" && "bg-separation-alert/[0.06]",
      !isActive && status === "running" && "bg-amber-500/[0.06]",
      !isActive && (status === "idle" || !status) && "bg-surface-container hover:bg-surface-container-high/50",
    )}>
      <div className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px] font-mono font-bold",
        status === "passed" ? "bg-emerald-500/10 text-emerald-400" :
        status === "failed" ? "bg-separation-alert/10 text-separation-alert" :
        status === "running" ? "bg-amber-500/10 text-amber-400" :
        "bg-surface-container-high text-on-surface-variant/40",
      )}>
        {check.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-on-surface font-medium">{check.label}</span>
          {isActive && <span className="text-[9px] text-amber-400 animate-pulse font-medium">运行中</span>}
          {status === "passed" && !isActive && <StatusIcon status={status} />}
          {status === "failed" && !isActive && <StatusIcon status={status} />}
          {result && !isActive && (
            <span className="text-[9px] text-on-surface-variant/40 ml-auto font-mono">
              {result.durationMs < 1000 ? `${Math.round(result.durationMs)}ms` : `${(result.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        {!isActive && !detail && (
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5 leading-relaxed line-clamp-2">{check.desc}</p>
        )}
        {isActive && (
          <div className="mt-1.5 space-y-1">
            <p className="text-[10px] text-amber-300/60">Worker 线程积分计算中…</p>
            <div className="h-1 bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-amber-400/50 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        )}
        {detail && !isActive && (
          <>
            <p className="text-[10px] text-on-surface-variant/70 mt-1 leading-relaxed">{detail}</p>
            {result?.metrics && (
              <div className="mt-1 text-[10px] text-on-surface-variant/50 font-mono">
                实测 {result.metrics.measured.toFixed(4)}{result.metrics.unit}
                {" "}vs{" "}
                理论 {result.metrics.expected.toFixed(4)}{result.metrics.unit}
              </div>
            )}
            {result && !isNaN(result.value) && <ThresholdBar value={result.value} threshold={result.threshold} unit={result.unit} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 页面组件 ────────────────────────────────────

export function LabPage() {
  const {
    validationResults, validationDetails,
    isRunning: validationRunning, anyHasRun,
    activeTest, lastResults, handleRunValidation,
  } = useLabValidation();

  const activeTemplate = useLabStore((s) => s.activeTemplate);
  const setUserCode = useLabStore((s) => s.setUserCode);
  const isWorkerReady = useSimulationStore((s) => s.isWorkerReady);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLoadTemplate = useCallback((id: SandboxTemplateId) => {
    const tpl = SANDBOX_TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      setUserCode(tpl.code);
      useLabStore.setState({ activeTemplate: id, codeStatus: "idle", codeError: null });
    }
  }, [setUserCode]);

  const passedCount = Object.values(validationResults).filter((v) => v === "passed").length;
  const failedCount = Object.values(validationResults).filter((v) => v === "failed").length;

  return (
    <div className="w-full h-full flex flex-col">
      {/* ═══ 页头 ═══ */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 bg-surface-container-lowest border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center ring-1 ring-primary/10">
            <FlaskConical className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-on-surface tracking-wide">实验模式</h2>
            <span className="text-[10px] text-on-surface-variant/70">物理正确性验证 · 用户可编程沙箱</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 验证进度指示器 */}
          {anyHasRun && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                passedCount === 3 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400",
              )}>
                {passedCount}/3 通过
              </span>
              {failedCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-separation-alert/10 text-separation-alert font-medium">
                  {failedCount} 失败
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-surface-container transition-colors"
            title={sidebarOpen ? "收起验证面板" : "展开验证面板"}
          >
            {sidebarOpen
              ? <PanelLeftClose className="w-4 h-4 text-on-surface-variant" />
              : <PanelLeftOpen className="w-4 h-4 text-on-surface-variant" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ═══ 左侧：物理验证 ═══ */}
        {sidebarOpen && (
          <aside className="w-[250px] shrink-0 overflow-y-auto bg-surface-container-lowest border-r border-white/5 p-4 flex flex-col gap-4">
            {/* 标题 + 说明 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                </div>
                <h3 className="text-xs font-semibold text-on-surface">物理正确性验证</h3>
              </div>

              <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                通过三项自动化测试确保仿真引擎在极端边界下的物理可靠性。验证在独立
                Worker 线程中运行真实仿真路径——而非隔离测试纯函数——以保证测试条件
                与用户实际体验完全一致。
              </p>
            </div>

            {/* Worker 未就绪 */}
            {!isWorkerReady && (
              <div className="px-3 py-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 space-y-1">
                <p className="text-[10px] text-amber-300/90 font-medium">仿真引擎未就绪</p>
                <p className="text-[9px] text-amber-300/60 leading-relaxed">
                  请先切换到「探索模式」并点击播放按钮启动 Worker。
                </p>
              </div>
            )}

            {/* 验证卡片 */}
            <div className="space-y-2">
              {CHECKS.map((check) => (
                <CompactValidationCard
                  key={check.key}
                  check={check}
                  status={validationResults[check.key]}
                  detail={validationDetails[check.key] || undefined}
                  isActive={activeTest === check.key}
                  result={lastResults[check.key] ?? null}
                />
              ))}
            </div>

            {/* 运行按钮 */}
            <button
              type="button"
              onClick={handleRunValidation}
              disabled={validationRunning}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 w-full",
                validationRunning
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-wait"
                  : "bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.98] shadow-sm shadow-primary/10",
              )}
            >
              {validationRunning ? (
                <><Activity className="w-3.5 h-3.5 animate-pulse" />验证中…</>
              ) : (
                <><Play className="w-3.5 h-3.5" />{anyHasRun ? "重新运行全部验证" : "运行全部验证"}</>
              )}
            </button>

            {!anyHasRun && (
              <p className="text-[9px] text-on-surface-variant/40 text-center -mt-2">
                三项验证在 Worker 中依次执行，预计耗时 1–3 秒
              </p>
            )}
          </aside>
        )}

        {/* ═══ 右侧：Python 沙箱 ═══ */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-surface">
          {/* 使用说明 */}
          <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-surface-container-lowest/20">
            <div className="flex items-start gap-2.5">
              <Code className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-on-surface">Python 可编程沙箱</h3>
                <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                  编写自定义 ODE 方程 <code className="text-[10px] text-primary/80 font-mono">equations(t, state, params)</code>，
                  点击「运行」后 Pyodide + SciPy 计算轨迹并在右侧 3D 视图中回放。
                  预设模板提供弹簧摆、受迫摆、磁力摆三种变体，也可从零开始编写自己的物理模型。
                </p>
              </div>
            </div>
          </div>
          {/* 模板栏 */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-surface-container-lowest/30">
            <div className="flex items-center gap-1.5 mr-3">
              <Code className="w-3.5 h-3.5 text-primary/70" />
              <span className="text-[11px] font-medium text-on-surface-variant">代码模板</span>
            </div>
            <div className="h-4 w-px bg-white/5" />
            {SANDBOX_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleLoadTemplate(tpl.id)}
                className={cn(
                  "px-3 py-1.5 text-[11px] rounded-lg border transition-all duration-200",
                  activeTemplate === tpl.id
                    ? "bg-primary/10 text-primary border-primary/25 shadow-sm"
                    : "text-on-surface-variant/70 border-transparent hover:border-white/10 hover:bg-surface-container hover:text-on-surface",
                )}
                title={tpl.description}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          {/* 沙箱主区域 */}
          <div className="flex-1 overflow-hidden relative">
            {/* 编辑器背景微光 */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(75,159,255,0.03),transparent_50%)]" />
            <div className="relative z-10 h-full">
              <SandboxPanel />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
