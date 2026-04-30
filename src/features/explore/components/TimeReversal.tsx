import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { useSimulationStore, useSimulationHistory, getSimulationHistory, ball2Position, pauseHistoryRecording, resumeHistoryRecording } from "@/features/simulation";
import { getScheduler } from "@/features/simulation/worker/scheduler";
import { useExploreStore } from "../store";
import { updateTrajectoryData, clearTrajectoryData, startTrajectoryFadeOut } from "./TimeReversalTrajectory";
import { notify } from "@/features/system/error-handling/notify";
import type { DriftSample, ReversalMode } from "../store";

// ═══════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════

const MIN_HISTORY_FRAMES = 120; // 2s @ 60fps
const TEACHING_THRESHOLD = 0.05; // 首次相空间漂移 > 0.05 弹出教学注释
const REVERSAL_FPS = 60;

/** 两个状态向量的相空间距离（含角速度），角速度散度远早于位置散度 */
function computeDrift(
  stateA: { theta1: number; omega1: number; theta2: number; omega2: number },
  stateB: { theta1: number; omega1: number; theta2: number; omega2: number },
): number {
  const d1 = stateA.theta1 - stateB.theta1;
  const w1 = stateA.omega1 - stateB.omega1;
  const d2 = stateA.theta2 - stateB.theta2;
  const w2 = stateA.omega2 - stateB.omega2;
  return Math.sqrt(d1 * d1 + w1 * w1 + d2 * d2 + w2 * w2);
}

// ═══════════════════════════════════════════════════
// 漂移曲线 Canvas 2D
// ═══════════════════════════════════════════════════

interface DriftCurvePanelProps {
  driftHistory: DriftSample[];
  maxReversalTime: number;
  mode: ReversalMode;
  visible: boolean;
  engineError: boolean;
}

function DriftCurvePanel({ driftHistory, maxReversalTime, mode, visible, engineError }: DriftCurvePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logScale, setLogScale] = useState(false);
  const W = 320;
  const H = 200;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
    ctx.fillRect(0, 0, W, H);

    const pad = { top: 28, right: 14, bottom: 34, left: 48 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    // 空数据提示
    if (driftHistory.length < 2) {
      ctx.fillStyle = "#777";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("等待反演数据…", W / 2, H / 2);
      return;
    }

    const maxDrift = Math.max(0.1, ...driftHistory.map((d) => d.driftDistance)) * 1.1;
    const maxTime = Math.max(1, maxReversalTime);

    const xS = (t: number) => pad.left + (t / maxTime) * pw;

    const yLinear = (d: number) => pad.top + ph - (d / maxDrift) * ph;
    const yLog = (d: number) => {
      if (d <= 0) return pad.top + ph;
      const logMax = Math.log10(maxDrift);
      const logMin = Math.log10(Math.max(1e-6, maxDrift * 1e-5));
      const logD = Math.log10(Math.max(d, 1e-6));
      const ratio = (logD - logMin) / (logMax - logMin);
      return pad.top + ph - Math.max(0, Math.min(1, ratio)) * ph;
    };
    const yS = logScale ? yLog : yLinear;

    // 坐标轴
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + ph);
    ctx.lineTo(pad.left + pw, pad.top + ph);
    ctx.stroke();

    // 教学阈值虚线
    if (mode === "numerical") {
      const thY = yS(TEACHING_THRESHOLD);
      if (thY > pad.top && thY < pad.top + ph) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, thY);
        ctx.lineTo(pad.left + pw, thY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "9px sans-serif";
        ctx.fillText("0.05", pad.left + pw - 26, thY - 4);
      }
    }

    // 轴标签
    ctx.fillStyle = "#999";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("反演时间 (s)", pad.left + pw / 2, H - 4);
    ctx.save();
    ctx.translate(12, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(logScale ? "相空间距离 (log)" : "相空间距离", 0, 0);
    ctx.restore();

    // 模式标题
    ctx.fillStyle = "#ddd";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      mode === "exact" ? "精确反演 — 理论完全重合" : "数值反演 — 误差指数放大",
      pad.left + pw / 2,
      pad.top - 10,
    );

    // Y 轴刻度
    ctx.fillStyle = "#777";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const d = logScale
        ? Math.pow(10, Math.log10(Math.max(1e-6, maxDrift * 1e-5)) + ratio * (Math.log10(maxDrift) - Math.log10(Math.max(1e-6, maxDrift * 1e-5))))
        : (maxDrift * ratio);
      const y = yS(d);
      ctx.fillText(d < 0.01 ? d.toExponential(1) : d.toFixed(3), pad.left - 4, y + 3);
    }

    // 漂移曲线
    ctx.strokeStyle = "#ff6644";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < driftHistory.length; i++) {
      const d = driftHistory[i]!;
      const x = xS(d.reversalTime);
      const y = yS(d.driftDistance);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 发散标记 — 基于 engineError 而非硬编码阈值
    if (engineError && driftHistory.length > 0) {
      const last = driftHistory[driftHistory.length - 1]!;
      const lx = xS(last.reversalTime);
      const ly = yS(last.driftDistance);
      ctx.fillStyle = "#ff4444";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✕", lx + 8, ly + 4);
    }
  }, [driftHistory, maxReversalTime, mode, logScale, engineError]);

  if (!visible) return null;

  return (
    <div
      className="absolute right-2 bottom-2 z-20 rounded-lg overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {/* Y 轴缩放切换 */}
      <button
        type="button"
        onClick={() => setLogScale((v) => !v)}
        className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
      >
        {logScale ? "线性" : "对数"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 教学注释弹窗
// ═══════════════════════════════════════════════════

function TeachingAnnotationPopup({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 transform -translate-x-1/2 z-30 rounded-xl px-5 py-4 max-w-sm"
      style={{
        bottom: "22%",
        background: "rgba(10, 10, 18, 0.93)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-on-surface text-sm font-semibold mb-2">
            数值漂移 — 混沌的不可逆性
          </h3>
          <p className="text-gray-300 text-xs leading-relaxed">
            哈密顿系统理论上可逆，但混沌使计算机的浮点误差被指数放大——这就是初值敏感性的计算物理体现。正向积分时累积的舍入误差在反向积分中无法被"撤销"，反而被进一步放大。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-on-surface text-base leading-none shrink-0 mt-0.5"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════

interface TimeReversalProps {
  className?: string;
}

export function TimeReversal({ className = "" }: TimeReversalProps) {
  // ── Store 订阅 ──
  const mode = useExploreStore((s) => s.timeReversalMode);
  const setMode = useExploreStore((s) => s.setTimeReversalMode);
  const active = useExploreStore((s) => s.timeReversalActive);
  const setActive = useExploreStore((s) => s.setTimeReversalActive);
  const phase = useExploreStore((s) => s.reversalPhase);
  const setPhase = useExploreStore((s) => s.setReversalPhase);
  const startTime = useExploreStore((s) => s.timeReversalStartTime);
  const setStartTime = useExploreStore((s) => s.setTimeReversalStartTime);
  const driftHistory = useExploreStore((s) => s.driftHistory);
  const clearDriftHistory = useExploreStore((s) => s.clearDriftHistory);
  const annotationDismissed = useExploreStore((s) => s.annotationDismissed);
  const dismissAnnotation = useExploreStore((s) => s.dismissAnnotation);
  const resetAnnotation = useExploreStore((s) => s.resetAnnotation);

  const history = useSimulationHistory();
  const simTime = useSimulationStore((s) => s.t);
  const params = useSimulationStore((s) => s.params);
  const engineError = useSimulationStore((s) => s.engineError);

  // ── 本地 ref ──
  const reversalStartRef = useRef<{
    theta1: number;
    omega1: number;
    theta2: number;
    omega2: number;
  } | null>(null);
  const startSimTimeRef = useRef(0);
  const exactRafRef = useRef(0);
  const exactFrameIdxRef = useRef(0);
  const prevSimTimeRef = useRef(simTime);
  const isReversingRef = useRef(false);
  const fwdSnapshotRef = useRef<ReturnType<typeof getSimulationHistory>>([]);
  const reversalTrailRef = useRef<THREE.Vector3[]>([]);

  // ── 派生状态 ──
  const historyInsufficient = history.length < MIN_HISTORY_FRAMES;
  const buttonDisabled = historyInsufficient || phase === "reversing";
  const tooltipText = historyInsufficient
    ? `需要至少运行 2 秒才能反演（当前已运行 ${(history.length / 60).toFixed(1)} 秒）`
    : mode === "exact"
      ? "精确反演（对照）— 仅视觉回放，无误差"
      : "数值反演（实验）— 真实反向积分，展示浮点误差指数放大";

  // 教学注释自动弹出
  const showAnnotation =
    mode === "numerical" &&
    phase === "reversing" &&
    !annotationDismissed &&
    driftHistory.some((d) => d.driftDistance > TEACHING_THRESHOLD);

  // ── 精确反演 RAF 循环 ──
  function exactPlaybackLoop() {
    const fwdArray = history.toArray();
    const idx = exactFrameIdxRef.current;

    if (idx >= fwdArray.length) {
      // 回放完成：回到历史起点，恢复正向仿真
      setPhase("completed");
      setActive(false);
      isReversingRef.current = false;
      const firstState = fwdArray[0]!;
      getScheduler().reset({
        theta1: firstState.theta1,
        theta1Dot: firstState.omega1,
        theta2: firstState.theta2,
        theta2Dot: firstState.omega2,
      });
      getScheduler().resume();
      return;
    }

    const sv = fwdArray[fwdArray.length - 1 - idx]!;
    // 临时覆盖显示状态，驱动 Scene3D 更新
    useSimulationStore.setState({
      state: {
        theta1: sv.theta1,
        omega1: sv.omega1,
        theta2: sv.theta2,
        omega2: sv.omega2,
      },
    });

    const reversalTime = idx / REVERSAL_FPS;
    useExploreStore.getState().appendDriftSample({
      reversalTime,
      driftDistance: 0,
      forwardSimTime: startSimTimeRef.current - reversalTime,
    });

    // 追加 3D 反演轨迹点
    const pos = ball2Position(sv, useSimulationStore.getState().params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({
      reversalPoints: [...reversalTrailRef.current],
    });

    exactFrameIdxRef.current++;
    exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
  }

  // ── 开始反演 ──
  const startReversal = useCallback(() => {
    const store = useSimulationStore.getState();
    const scheduler = getScheduler();
    const fwdArray = history.toArray();

    if (fwdArray.length < MIN_HISTORY_FRAMES) return;

    reversalStartRef.current = { ...store.state };
    startSimTimeRef.current = store.t;
    clearDriftHistory();
    resetAnnotation();
    reversalTrailRef.current = [];
    setStartTime(store.t);
    setActive(true);
    isReversingRef.current = true;
    prevSimTimeRef.current = store.t;

    // 保存正向历史快照（防止反向帧污染后续 drift 计算）
    fwdSnapshotRef.current = getSimulationHistory();

    // 初始化 3D 轨迹叠加：正向虚线（白色半透明）
    const fwdPts = fwdArray.map((sv) => {
      const p = ball2Position(sv, store.params);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    updateTrajectoryData({
      forwardPoints: fwdPts,
      reversalPoints: [],
      reversalColor: mode === "exact" ? "#ffd700" : "#00ffff",
      visible: true,
    });

    if (mode === "exact") {
      setPhase("reversing");
      exactFrameIdxRef.current = 0;
      scheduler.pause();
      exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
    } else {
      setPhase("reversing");
      pauseHistoryRecording();
      scheduler.setDirection(-1);
    }
  }, [mode, history, setActive, setStartTime, setPhase, clearDriftHistory, resetAnnotation]);

  // ── 停止反演 ──
  const stopReversal = useCallback(() => {
    const scheduler = getScheduler();
    isReversingRef.current = false;

    if (mode === "exact") {
      cancelAnimationFrame(exactRafRef.current);
      const start = reversalStartRef.current;
      if (start) {
        scheduler.reset({
          theta1: start.theta1,
          theta1Dot: start.omega1,
          theta2: start.theta2,
          theta2Dot: start.omega2,
        });
      }
      scheduler.setDirection(1);
      scheduler.resume();
    } else {
      resumeHistoryRecording();
      scheduler.setDirection(1);
    }

    // 10 秒淡出而非立即清除
    startTrajectoryFadeOut();
    setPhase("completed");
    setActive(false);
  }, [mode, setPhase, setActive]);

  // ── 数值反演逐帧漂移检测 ──
  useEffect(() => {
    if (mode !== "numerical" || phase !== "reversing" || !isReversingRef.current) return;

    const store = useSimulationStore.getState();
    const currentSimTime = store.t;

    // simTime 应递减；第一次更新时跳过（prev 还未初始化）
    if (prevSimTimeRef.current > 0 && currentSimTime >= prevSimTimeRef.current) {
      prevSimTimeRef.current = currentSimTime;
      return;
    }
    prevSimTimeRef.current = currentSimTime;

    // 到达时间起点
    if (currentSimTime <= 0.001) {
      stopReversal();
      return;
    }

    // Worker 发散错误
    if (store.engineError) {
      notify({
        title: "数值反演发散",
        description: `于反演时间 t≈${(startSimTimeRef.current - currentSimTime).toFixed(2)}s — 误差已远超可追踪范围`,
        variant: "error",
        durationMs: 5000,
      });
      stopReversal();
      return;
    }

    const fwdArray = fwdSnapshotRef.current;
    const reversalTime = startSimTimeRef.current - currentSimTime;
    const fwdIdx = Math.round(fwdArray.length - 1 - reversalTime * REVERSAL_FPS);

    let drift = 0;
    if (fwdIdx >= 0 && fwdIdx < fwdArray.length) {
      drift = computeDrift(store.state, fwdArray[fwdIdx]!);
    }

    useExploreStore.getState().appendDriftSample({
      reversalTime: Math.max(0, reversalTime),
      driftDistance: drift,
      forwardSimTime: currentSimTime,
    });

    // 追加 3D 反演轨迹点
    const pos = ball2Position(store.state, params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
  }, [mode, phase, simTime, params, history, stopReversal]);

  // 检查 phase 重新进入 reversing 时初始化
  useEffect(() => {
    if (phase === "reversing") {
      isReversingRef.current = true;
      prevSimTimeRef.current = useSimulationStore.getState().t;
    }
  }, [phase]);

  // ── 卸载清理 ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(exactRafRef.current);
      if (isReversingRef.current && mode === "numerical") {
        getScheduler().setDirection(1);
      }
      isReversingRef.current = false;
      clearTrajectoryData();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI 渲染 ──
  return (
    <div className={`pointer-events-none ${className}`}>
      {/* 控制栏 — pointer-events 恢复 */}
      <div
        className="absolute top-2 right-2 z-30 pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: "rgba(10, 10, 20, 0.85)", border: "1px solid #1a1a2e" }}
      >
        {/* 模式切换 */}
        <div
          className="flex rounded overflow-hidden"
          style={{ border: "1px solid #444" }}
        >
          <button
            type="button"
            onClick={() => !active && setMode("exact")}
            disabled={active}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              mode === "exact"
                ? "bg-amber-700 text-amber-100"
                : "bg-transparent text-gray-400 hover:text-gray-200"
            } ${active ? "opacity-50 cursor-not-allowed" : ""}`}
            title="精确反演（对照）— 仅视觉回放，无误差"
          >
            精确反演
          </button>
          <button
            type="button"
            onClick={() => !active && setMode("numerical")}
            disabled={active}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              mode === "numerical"
                ? "bg-cyan-800 text-cyan-100"
                : "bg-transparent text-gray-400 hover:text-gray-200"
            } ${active ? "opacity-50 cursor-not-allowed" : ""}`}
            title="数值反演（实验）— 真实反向积分，展示浮点误差指数放大"
          >
            数值反演
          </button>
        </div>

        {/* 反演启停按钮 */}
        <button
          type="button"
          onClick={active ? stopReversal : startReversal}
          disabled={buttonDisabled}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors whitespace-nowrap ${
            active
              ? "bg-red-700 text-red-100 hover:bg-red-600"
              : historyInsufficient
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-primary text-[#0D1117] hover:opacity-90"
          }`}
          title={tooltipText}
        >
          {active ? "停止反演" : "⌛ 时间倒流"}
        </button>

        {/* 历史帧数指示 */}
        <span
          className={`text-xs font-mono ${
            historyInsufficient ? "text-gray-600" : "text-gray-500"
          }`}
        >
          {history.length}<span className="text-gray-700">/6000</span>
        </span>
      </div>

      {/* 教学注释弹窗 */}
      <div className="pointer-events-auto">
        <TeachingAnnotationPopup visible={showAnnotation} onClose={dismissAnnotation} />
      </div>

      {/* 漂移曲线 */}
      <div className="pointer-events-auto">
        <DriftCurvePanel
          driftHistory={driftHistory}
          maxReversalTime={startTime > 0 ? startTime : 10}
          mode={mode}
          visible={phase === "reversing" || (phase === "completed" && driftHistory.length > 0)}
          engineError={engineError !== null}
        />
      </div>

      {/* 完成标注 */}
      {phase === "completed" && driftHistory.length > 0 && (
        <div
          className="absolute bottom-2 left-2 z-20 pointer-events-auto px-3 py-1.5 rounded text-xs text-gray-400"
          style={{ background: "rgba(10, 10, 15, 0.85)" }}
        >
          最近一次反演（{mode === "exact" ? "精确反演" : "数值反演"}）— 漂移曲线已保留
        </div>
      )}
    </div>
  );
}
