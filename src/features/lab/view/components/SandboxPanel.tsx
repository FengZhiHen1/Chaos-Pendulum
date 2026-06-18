import { useCallback, useEffect } from "react";
import { CodeEditor } from "./CodeEditor";
import { usePyodide } from "../../hooks/usePyodide";
import { useLabStore } from "../../store";
import { SANDBOX_TEMPLATES, SANDBOX_DEFAULTS } from "../../contracts";
import type { SandboxTemplateId } from "../../contracts";
import { Button } from "@/shared/view/components/ui/button";
import { Badge } from "@/shared/view/components/ui/badge";
import { Play, RotateCcw, Loader2, AlertCircle, CheckCircle } from "lucide-react";

/** LAB-03 用户可编程沙箱面板：CodeMirror 编辑器 + 模板 + Pyodide 执行 */
export function SandboxPanel() {
  const { isReady, isLoading, loadError, execute } = usePyodide();

  const userCode = useLabStore((s) => s.userCode);
  const setUserCode = useLabStore((s) => s.setUserCode);
  const codeStatus = useLabStore((s) => s.codeStatus);
  const setCodeStatus = useLabStore((s) => s.setCodeStatus);
  const codeError = useLabStore((s) => s.codeError);
  const setCodeError = useLabStore((s) => s.setCodeError);
  const activeTemplate = useLabStore((s) => s.activeTemplate);

  // 首次加载时填入默认模板代码
  useEffect(() => {
    if (!userCode) {
      setUserCode(SANDBOX_TEMPLATES[0]?.code ?? "");
    }
  }, [userCode, setUserCode]);

  const isExecuting = codeStatus === "running";

  const handleLoadTemplate = useCallback((id: SandboxTemplateId) => {
    const tpl = SANDBOX_TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      setUserCode(tpl.code);
      useLabStore.setState({ activeTemplate: id, codeStatus: "idle", codeError: null });
    }
  }, [setUserCode]);

  const handleRun = useCallback(async () => {
    const code = useLabStore.getState().userCode;
    if (!code.trim()) return;

    setCodeStatus("running");
    setCodeError(null);

    const result = await execute(code);

    if (result.success) {
      setCodeStatus("success");
      setCodeError(null);
    } else {
      setCodeStatus("error");
      setCodeError(result.errorTranslation ?? result.error);
    }
  }, [execute, setCodeStatus, setCodeError]);

  const handleReset = useCallback(() => {
    setUserCode(SANDBOX_TEMPLATES[0]?.code ?? "");
    useLabStore.setState({ activeTemplate: null, codeStatus: "idle", codeError: null });
  }, [setUserCode]);

  // 提取错误行号用于 CodeMirror 标红
  const errorLine = codeStatus === "error" && codeError
    ? (() => {
        const m = codeError.match(/[Ll]ine\s+(\d+)/);
        return m ? parseInt(m[1]!, 10) : null;
      })()
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <h4 className="text-xs font-semibold text-on-surface mr-auto">Python 沙箱</h4>
        <Button
          variant="primary"
          size="sm"
          disabled={isExecuting || !userCode.trim() || (!isReady && !isLoading)}
          onClick={handleRun}
        >
          {isExecuting ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />运行中</>
          ) : isLoading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />加载中</>
          ) : (
            <><Play className="h-3.5 w-3.5 mr-1" />运行</>
          )}
        </Button>
        <Button variant="tertiary" size="sm" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 模板按钮 */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-white/5 shrink-0">
        {SANDBOX_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => handleLoadTemplate(tpl.id)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              activeTemplate === tpl.id
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-on-surface-variant border-transparent hover:border-white/10"
            }`}
            title={tpl.description}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      {/* 编辑器 */}
      <div className="flex-1 overflow-hidden p-2">
        <CodeEditor
          value={userCode}
          onChange={setUserCode}
          errorLine={errorLine}
          height={Math.max(200, SANDBOX_DEFAULTS.editorHeight)}
        />
      </div>

      {/* 状态栏 */}
      <div className="shrink-0 px-3 py-2 border-t border-white/5">
        {codeStatus === "success" && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">代码执行成功</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {isReady ? "Pyodide ✓" : "就绪"}
            </Badge>
          </div>
        )}
        {codeStatus === "error" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">执行错误</span>
              {errorLine != null && (
                <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">
                  第 {errorLine} 行
                </Badge>
              )}
            </div>
            {codeError && (
              <p className="text-[11px] text-on-surface-variant pl-6">{codeError}</p>
            )}
          </div>
        )}
        {codeStatus === "idle" && loadError && (
          <div className="flex items-center gap-2 text-amber-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-[11px]">{loadError}</span>
          </div>
        )}
        {codeStatus === "idle" && !loadError && (
          <p className="text-[10px] text-on-surface-variant/50">
            {isLoading
              ? "正在加载 Pyodide 运行时…（首次约需下载 ~40MB）"
              : isReady
                ? "Pyodide 就绪，点击「运行」执行代码"
                : "初始化中…"}
          </p>
        )}
      </div>
    </div>
  );
}
