import { useCallback, useEffect } from "react";
import { CodeEditor } from "./CodeEditor";
import { SandboxSim3D } from "./SandboxSim3D";
import { usePyodide } from "../../hooks/usePyodide";
import { useLabStore } from "../../store";
import { useSimulationStore } from "@/features/simulation/store";
import { SANDBOX_TEMPLATES, SANDBOX_DEFAULTS } from "../../contracts";
import type { SandboxTemplateId } from "../../contracts";

/** 各模板所需的基础参数之外的额外参数默认值 */
const TEMPLATE_EXTRA_PARAMS: Record<SandboxTemplateId, number[]> = {
  spring: [10],        // k (劲度系数)
  driven: [1, 2],      // drive_amp, drive_freq
  magnetic: [1, 1],    // charge, B_field
};
import { Button } from "@/shared/view/components/ui/button";
import { Badge } from "@/shared/view/components/ui/badge";
import { Play, Pause, RotateCcw, Loader2, AlertCircle, CheckCircle, SkipForward } from "lucide-react";

/** 轨迹播放控制 */
function PlaybackControls() {
  const traj = useLabStore((s) => s.sandboxTrajectory);
  const idx = useLabStore((s) => s.sandboxPlaybackIndex);
  const isPlaying = useLabStore((s) => s.sandboxIsPlaying);

  if (!traj) return null;
  const total = traj.time.length;
  const progress = total > 0 ? idx / (total - 1) : 0;
  const currentTime = traj.time[idx]?.toFixed(1) ?? "0.0";
  const totalTime = traj.time[total - 1]?.toFixed(1) ?? "0.0";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-white/5 shrink-0">
      <Button
        variant="primary" size="sm"
        onClick={() => {
          if (idx >= total - 1) useLabStore.setState({ sandboxPlaybackIndex: 0 });
          useLabStore.setState({ sandboxIsPlaying: !isPlaying });
        }}
        title={isPlaying ? "暂停" : idx >= total - 1 ? "重播" : "播放"}
      >
        {isPlaying ? <Pause className="h-3 w-3" /> : idx >= total - 1 ? <SkipForward className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-100"
          style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="font-mono text-[10px] text-on-surface-variant/60 tabular-nums">
        {currentTime}s / {totalTime}s
      </span>
    </div>
  );
}

/** LAB-03 沙箱面板：左编辑器 + 右 3D 预览 */
export function SandboxPanel() {
  const { isReady, isLoading, loadError, execute, computeTrajectory } = usePyodide();

  const userCode = useLabStore((s) => s.userCode);
  const setUserCode = useLabStore((s) => s.setUserCode);
  const codeStatus = useLabStore((s) => s.codeStatus);
  const setCodeStatus = useLabStore((s) => s.setCodeStatus);
  const codeError = useLabStore((s) => s.codeError);
  const setCodeError = useLabStore((s) => s.setCodeError);
  const traj = useLabStore((s) => s.sandboxTrajectory);

  // 首次加载默认模板（弹簧摆），同步设置 activeTemplate 以便参数拼接
  useEffect(() => {
    if (!userCode) {
      const defaultTpl = SANDBOX_TEMPLATES[0];
      if (defaultTpl) {
        setUserCode(defaultTpl.code);
        useLabStore.setState({ activeTemplate: defaultTpl.id, codeStatus: "idle", codeError: null });
      }
    }
  }, [userCode, setUserCode]);

  const isExecuting = codeStatus === "running";

  const handleRun = useCallback(async () => {
    const code = useLabStore.getState().userCode;
    if (!code.trim()) return;
    setCodeStatus("running"); setCodeError(null);

    // 1. 先做语法/语义验证
    const result = await execute(code);
    if (!result.success) {
      setCodeStatus("error");
      setCodeError(result.errorTranslation ?? result.error);
      return;
    }

    // 2. 获取当前仿真状态作为初始条件，按模板拼接额外参数
    const sim = useSimulationStore.getState();
    const templateId = useLabStore.getState().activeTemplate as SandboxTemplateId | null;
    const baseParams = [sim.params.m1, sim.params.m2, sim.params.L1, sim.params.L2, sim.params.g, sim.params.damping];
    const extra = templateId ? (TEMPLATE_EXTRA_PARAMS[templateId] ?? []) : [];
    const params = [...baseParams, ...extra];
    const initState = { theta1: sim.theta1, omega1: sim.theta1Dot, theta2: sim.theta2, omega2: sim.theta2Dot };

    // 3. 用用户方程计算轨迹（10 秒，30s 超时）
    const trajResult = await computeTrajectory(code, initState, params, 10, 30000);
    if (!trajResult.success) {
      setCodeStatus("error");
      setCodeError(trajResult.error ?? "轨迹计算失败");
      return;
    }

    // 4. 注入 Store → 3D 预览回放
    useLabStore.setState({
      sandboxTrajectory: {
        time: trajResult.timePoints,
        theta1: trajResult.states[0] ?? [],
        theta2: trajResult.states[2] ?? [],
      },
      sandboxPlaybackIndex: 0,
      sandboxIsPlaying: true,
      codeStatus: "success",
      codeError: null,
    });
  }, [execute, computeTrajectory, setCodeStatus, setCodeError]);

  const handleReset = useCallback(() => {
    setUserCode(SANDBOX_TEMPLATES[0]?.code ?? "");
    useLabStore.setState({ activeTemplate: null, codeStatus: "idle", codeError: null, sandboxTrajectory: null, sandboxIsPlaying: false });
  }, [setUserCode]);

  const errorLine = codeStatus === "error" && codeError
    ? (() => { const m = codeError.match(/[Ll]ine\s+(\d+)/); return m ? parseInt(m[1]!, 10) : null; })()
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <h4 className="text-xs font-semibold text-on-surface mr-auto">Python 沙箱</h4>
        <Button variant="primary" size="sm"
          disabled={isExecuting || !userCode.trim() || (!isReady && !isLoading)}
          onClick={handleRun}
        >
          {isExecuting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />计算中</>
            : isLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />加载中</>
            : <><Play className="h-3.5 w-3.5 mr-1" />运行</>}
        </Button>
        <Button variant="tertiary" size="sm" onClick={handleReset}><RotateCcw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* 左右分栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左：编辑器 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-white/5">
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={userCode} onChange={setUserCode}
              errorLine={errorLine} height={SANDBOX_DEFAULTS.editorHeight} />
          </div>
          {/* 状态栏 */}
          <div className="shrink-0 px-3 py-1.5 border-t border-white/5">
            {codeStatus === "success" && traj && (
              <div className="flex items-center gap-2 text-emerald-400 text-[10px]">
                <CheckCircle className="h-3.5 w-3.5" />
                轨迹已计算 · {traj.time.length} 帧 · {traj.time[traj.time.length - 1]?.toFixed(1)}s
                <Badge variant="outline" className="text-[9px] ml-auto">{isReady ? "Pyodide ✓" : "就绪"}</Badge>
              </div>
            )}
            {codeStatus === "success" && !traj && (
              <div className="flex items-center gap-2 text-emerald-400 text-[10px]">
                <CheckCircle className="h-3.5 w-3.5" />代码执行成功
              </div>
            )}
            {codeStatus === "error" && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-red-400 text-[10px]">
                  <AlertCircle className="h-3.5 w-3.5" />执行错误
                  {errorLine != null && <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30">第 {errorLine} 行</Badge>}
                </div>
                {codeError && <p className="text-[10px] text-on-surface-variant/70 pl-5 truncate">{codeError}</p>}
              </div>
            )}
            {codeStatus === "idle" && loadError && (
              <div className="flex items-center gap-2 text-amber-400 text-[10px]"><AlertCircle className="h-3.5 w-3.5" />{loadError}</div>
            )}
            {codeStatus === "idle" && !loadError && (
              <p className="text-[10px] text-on-surface-variant/50">
                {isLoading ? "加载 Pyodide…（首次 ~50MB）" : isReady ? "就绪 — 点击「运行」计算轨迹" : "初始化中…"}
              </p>
            )}
          </div>
        </div>

        {/* 右：3D 预览 */}
        <div className="w-[380px] shrink-0 flex flex-col bg-surface-container-lowest">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 shrink-0">
            <span className="text-[10px] text-on-surface-variant font-medium">3D 预览</span>
            {traj && <Badge variant="outline" className="text-[9px]">{traj.time.length} 帧</Badge>}
          </div>
          <div className="flex-1 min-h-0">
            <SandboxSim3D />
          </div>
          <PlaybackControls />
        </div>
      </div>
    </div>
  );
}
