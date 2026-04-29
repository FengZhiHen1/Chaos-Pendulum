import { useCallback } from "react";
import { FlaskConical, CheckCircle, XCircle, Circle, FileText, Code, Play } from "lucide-react";
import { useLabStore } from "./store";
import { cn } from "@/shared/lib/cn";
import { runAllValidations } from "./validation-runner";

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

function StatusIcon({ status }: { status: "idle" | "running" | "passed" | "failed" }) {
  switch (status) {
    case "passed":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-400" />;
    case "running":
      return <Circle className="w-4 h-4 text-yellow-400 animate-pulse" />;
    default:
      return <Circle className="w-4 h-4 text-on-surface-variant" />;
  }
}

export function LabPage() {
  const validationResults = useLabStore((s) => s.validationResults);
  const validationDetails = useLabStore((s) => s.validationDetails);
  const validationRunning = useLabStore((s) => s.validationRunning);
  const allPassed = useLabStore((s) => s.allPassed);
  const setValidationResult = useLabStore((s) => s.setValidationResult);
  const setValidationDetail = useLabStore((s) => s.setValidationDetail);
  const setValidationRunning = useLabStore((s) => s.setValidationRunning);
  const setAllPassed = useLabStore((s) => s.setAllPassed);
  const activeTemplate = useLabStore((s) => s.activeTemplate);

  const handleRunValidation = useCallback(() => {
    setValidationRunning(true);
    // 先将所有状态重置为 running
    setValidationResult("smallAngle", "running");
    setValidationResult("singlePendulum", "running");
    setValidationResult("energy", "running");
    setAllPassed(false);

    // 使用 setTimeout 让 UI 先更新
    setTimeout(() => {
      const results = runAllValidations("RK4");
      let allOk = true;
      for (const r of results) {
        setValidationResult(r.test, r.passed ? "passed" : "failed");
        setValidationDetail(r.test, r.detail);
        if (!r.passed) allOk = false;
      }
      setAllPassed(allOk);
      setValidationRunning(false);
    }, 50);
  }, [setValidationResult, setValidationDetail, setValidationRunning, setAllPassed]);

  const anyHasRun = Object.values(validationResults).some((s) => s !== "idle");

  return (
    <div className="w-full h-full flex flex-col">
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-on-surface tracking-wider">实验模式</h2>
          <span className="text-[10px] text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded">
            P2 · 物理验证 + 代码实验
          </span>
        </div>
        {allPassed && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3.5 h-3.5" />
            物理模型验证通过
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：物理验证套件 */}
        <div className="flex-1 p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
            物理模型验证
          </h3>
          <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
            三项自动化验证确保仿真引擎的物理正确性。
            验证使用 RK4 积分器直接调用物理引擎核心函数，无需 Worker 通信开销。
          </p>

          <div className="space-y-3">
            {CHECKS.map((check) => (
              <div
                key={check.key}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                  validationResults[check.key] === "passed"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : validationResults[check.key] === "failed"
                      ? "border-red-500/30 bg-red-500/5"
                      : validationResults[check.key] === "running"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-white/5 bg-surface-container-low",
                )}
              >
                <StatusIcon status={validationResults[check.key]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-on-surface font-medium">{check.label}</span>
                    {validationResults[check.key] === "passed" && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        通过
                      </span>
                    )}
                    {validationResults[check.key] === "failed" && (
                      <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                        未通过
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">{check.desc}</p>
                  {validationDetails[check.key] && (
                    <p className="text-[10px] text-on-surface-variant mt-1.5 leading-relaxed opacity-80">
                      {validationDetails[check.key]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleRunValidation}
              disabled={validationRunning}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all",
                validationRunning
                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 cursor-wait"
                  : "bg-primary-container text-primary hover:bg-primary/30 border border-primary/30 active:scale-[0.98]",
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
              <p className="text-[10px] text-on-surface-variant mt-2">
                调用物理引擎核心函数，在浏览器主线程中运行三项验证（约 1-2 秒）
              </p>
            )}
          </div>
        </div>

        {/* 右侧：代码实验区 */}
        <div
          className="w-80 shrink-0 flex flex-col border-l border-white/5"
        >
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-3.5 h-3.5 text-on-surface-variant" />
              <h4 className="text-xs font-semibold text-on-surface">代码模板</h4>
            </div>
            <div className="space-y-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled
                  className={cn(
                    "w-full text-left px-3 py-2 rounded text-xs border transition-colors",
                    activeTemplate === t.id
                      ? "border-primary/40 bg-primary-container text-primary"
                      : "border-transparent text-on-surface-variant hover:border-white/5 bg-surface-container-low",
                    "opacity-60 cursor-not-allowed",
                  )}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[10px] text-on-surface-variant ml-2">{t.file}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant mt-3">
              Pyodide 沙箱集成开发中，届时支持在线编辑与运行 Python 物理模拟代码
            </p>
          </div>

          {/* 报告生成器 */}
          <div className="mt-auto p-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-3.5 h-3.5 text-on-surface-variant" />
              <h4 className="text-xs font-semibold text-on-surface">实验报告</h4>
            </div>
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 py-2 rounded text-xs font-medium bg-surface-container text-on-surface-variant border border-white/5 cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5" />
              生成 A4 PDF 报告
            </button>
            <p className="text-[10px] text-on-surface-variant mt-2 text-center">
              参数表 + 关键帧截图 + 数据图表 + 物理结论
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
