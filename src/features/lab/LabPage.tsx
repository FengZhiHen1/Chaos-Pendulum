import { FlaskConical, CheckCircle, XCircle, Circle, FileText, Code, Play, AlertTriangle } from "lucide-react";
import { useLabStore } from "./store";
import { useLabValidation } from "./hooks/useLabValidation";
import { SandboxPanel } from "./components/SandboxPanel";
import { cn } from "@/shared/infrastructure/cn";

const TEMPLATES = [
  { id: "spring", name: "弹簧摆", file: "spring-pendulum.py" },
  { id: "forced", name: "受迫双摆", file: "forced-pendulum.py" },
  { id: "magnetic", name: "磁力摆", file: "magnetic-pendulum.py" },
];

const CHECKS = [
  { key: "smallAngle" as const, label: "小角度近似 (<2%)", desc: "θ₀ ≤ 5° 时线性近似误差" },
  { key: "singlePendulum" as const, label: "单摆退化", desc: "m₂=0 时退化为单摆周期吻合" },
  { key: "energy" as const, label: "能量漂移 (<0.5%)", desc: "无阻尼状态下能量相对漂移" },
];

function StatusIcon({ status }: { status?: "idle" | "running" | "passed" | "failed" }) {
  switch (status) {
    case "passed":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-separation-alert" />;
    case "running":
      return <Circle className="w-4 h-4 text-amber-400 animate-pulse" />;
    default:
      return <Circle className="w-4 h-4 text-on-surface-variant/40" />;
  }
}

/**
 * 实验模式 — 教学与创造台。
 *
 * 布局：左侧物理验证套件 + 右侧实验工具面板（代码模板 + 报告生成）
 * 风格：Dark Room，卡片用 tonal shift 区分，无实线边框
 */
export function LabPage() {
  const {
    validationResults,
    validationDetails,
    isRunning: validationRunning,
    allPassed,
    anyHasRun,
    handleRunValidation,
  } = useLabValidation();

  const activeTemplate = useLabStore((s) => s.activeTemplate);

  return (
    <div className="w-full h-full flex flex-col">
      {/* 页头 — 无实线边框，用 tonal shift 区分 */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-on-surface tracking-wide">实验模式</h2>
            <span className="text-[10px] text-on-surface-variant">
              物理验证 · 代码实验 · 报告生成
            </span>
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
            <p className="text-xs text-on-surface-variant/70 mb-5 leading-relaxed">
              三项自动化验证确保仿真引擎的物理正确性。
              验证使用 RK4 积分器直接调用物理引擎核心函数，无需 Worker 通信开销。
            </p>

            <div className="space-y-3">
              {CHECKS.map((check) => {
                const status = validationResults[check.key];
                return (
                  <div
                    key={check.key}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-lg transition-all duration-200 card-lift",
                      status === "passed"
                        ? "bg-emerald-500/[0.04]"
                        : status === "failed"
                          ? "bg-separation-alert/[0.04]"
                          : status === "running"
                            ? "bg-amber-500/[0.04]"
                            : "bg-surface-container-low",
                    )}
                  >
                    <div className="mt-0.5">
                      <StatusIcon status={status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-on-surface font-medium">{check.label}</span>
                        {status === "passed" && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            通过
                          </span>
                        )}
                        {status === "failed" && (
                          <span className="text-[10px] text-separation-alert bg-separation-alert/10 px-1.5 py-0.5 rounded">
                            未通过
                          </span>
                        )}
                        {status === "running" && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            验证中
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant/70 mt-0.5">{check.desc}</p>
                      {validationDetails[check.key] && (
                        <p className="text-[10px] text-on-surface-variant/50 mt-1.5 leading-relaxed">
                          {validationDetails[check.key]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

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
                    <Circle className="w-4 h-4 animate-pulse" />
                    验证中...
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
                  调用物理引擎核心函数，在浏览器主线程中运行三项验证（约 1-2 秒）
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：代码实验区 */}
        <div className="w-80 shrink-0 flex flex-col bg-surface-container-low border-l border-white/5">
          {/* 代码模板区 */}
          <div className="px-4 py-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-surface-container flex items-center justify-center">
                <Code className="w-3 h-3 text-on-surface-variant" />
              </div>
              <h4 className="text-xs font-semibold text-on-surface">代码模板</h4>
            </div>
            <div className="space-y-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-xs border transition-all duration-200",
                    activeTemplate === t.id
                      ? "border-primary/30 bg-primary-container/30 text-primary"
                      : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
                    "opacity-50 cursor-not-allowed",
                  )}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[10px] text-on-surface-variant/50 ml-2">{t.file}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <SandboxPanel />
            </div>
          </div>

          {/* 报告生成器 */}
          <div className="mt-auto p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-surface-container flex items-center justify-center">
                <FileText className="w-3 h-3 text-on-surface-variant" />
              </div>
              <h4 className="text-xs font-semibold text-on-surface">实验报告</h4>
            </div>
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium bg-surface-container text-on-surface-variant/50 border border-white/5 cursor-not-allowed transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              生成 A4 PDF 报告
            </button>
            <p className="text-[10px] text-on-surface-variant/40 mt-2 text-center">
              参数表 + 关键帧截图 + 数据图表 + 物理结论
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
