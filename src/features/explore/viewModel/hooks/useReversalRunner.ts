/**
 * useReversalRunner — 时间反演状态机 Hook。
 *
 * 封装反演启动/停止/确认/取消的所有状态管理和副作用。
 * 从 TimeReversal 组件中提取，组件仅负责 JSX 渲染。
 */
import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import {
  useSimulationStore,
  useSimulationHistory,
  getSimulationHistory,
  ball2Position,
  pauseHistoryRecording,
  resumeHistoryRecording,
} from "@/features/simulation";
import { useExploreStore } from "../../store";
import { commandBus } from "@/shared/infrastructure/commandBus";
import {
  updateTrajectoryData,
  clearTrajectoryData,
  startTrajectoryFadeOut,
} from "../../view/components/TimeReversalTrajectory";
import { notificationPort } from "@/shared/infrastructure/adapters";
import { REVERSAL_DEFAULTS, InsufficientHistoryError } from "../../contracts";
import { useDriftCalculation } from "./useDriftCalculation";

/** Worker 预取超时（毫秒）——超时后自动取消反演准备 */
const PREFETCH_TIMEOUT_MS = 10_000;

export interface ReversalRunnerAPI {
  mode: "exact" | "numerical";
  setMode: (m: "exact" | "numerical") => void;
  active: boolean;
  phase: string;
  driftHistory: Array<{ reversalTime: number; driftDistance: number; forwardSimTime: number }>;
  startTime: number;
  historyInsufficient: boolean;
  buttonDisabled: boolean;
  tooltipText: string;
  /** 按钮禁用时的内联提示文字（空字符串表示无提示） */
  hintText: string;
  /** 实验入口卡片是否打开 */
  introOpen: boolean;
  openIntro: () => void;
  closeIntro: () => void;
  /** 叙事阶段 */
  narrativePhase: "coinciding" | "separating" | "diverging";
  /** 最大漂移距离 */
  maxDrift: number;
  /** 首次分离的反演时间（秒），null 表示未分离 */
  separationStartTime: number | null;
  /** 已进行的反演时间（秒） */
  elapsedReversalTime: number;
  showAnnotation: boolean;
  annotationDismissed: boolean;
  dismissAnnotation: () => void;
  completedOpen: boolean;
  exactCompletedOpen: boolean;
  engineError: string | null;
  startReversal: () => void;
  stopReversal: () => void;
  pauseReversal: () => void;
  resumeReversal: () => void;
  handleCancelReversal: () => void;
  handleRestoreState: () => void;
  handleResetAfterComplete: () => void;
  handleExactRestoreState: () => void;
  handleExactResetAfterComplete: () => void;
  history: ReturnType<typeof useSimulationHistory>;
}

export function useReversalRunner(): ReversalRunnerAPI {
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
  const introOpen = useExploreStore((s) => s.timeReversalIntroOpen);
  const setIntroOpen = useExploreStore((s) => s.setTimeReversalIntroOpen);
  const { computeDrift } = useDriftCalculation();

  const history = useSimulationHistory();
  const simTime = useSimulationStore((s) => s.t);
  const engineError = useSimulationStore((s) => s.engineError);
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);

  const reversalStartRef = useRef<{ theta1: number; omega1: number; theta2: number; omega2: number } | null>(null);
  const startSimTimeRef = useRef(0);
  const exactRafRef = useRef(0);
  const exactFrameIdxRef = useRef(0);
  const prevSimTimeRef = useRef(simTime);
  const isReversingRef = useRef(false);
  const fwdSnapshotRef = useRef<ReturnType<typeof getSimulationHistory>>([]);
  const reversalTrailRef = useRef<THREE.Vector3[]>([]);
  const awaitingConfirmRef = useRef(false);
  /** 反演启动时快照的杆长参数，保证整个反演期间位置计算一致 */
  const reversalParamsRef = useRef<{ L1: number; L2: number }>({ L1: 1, L2: 1 });

  const [completedOpen, setCompletedOpen] = useState(false);
  const [exactCompletedOpen, setExactCompletedOpen] = useState(false);

  // Worker 预取超时计时器
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // 通过 ref 持有最新 getSimulationHistory，避免 history 对象每帧变化导致 useCallback 依赖失效
  const getHistoryFnRef = useRef(getSimulationHistory);
  getHistoryFnRef.current = getSimulationHistory;

  const minFrames = REVERSAL_DEFAULTS.minHistoryFrames;
  const historyInsufficient = history.length < minFrames;
  const buttonDisabled = historyInsufficient || phase === "awaitingConfirm";
  const tooltipText = phase === "awaitingConfirm" ? "反向积分数据准备中…"
    : historyInsufficient ? `需要至少运行 2 秒才能反演（当前已运行 ${(history.length / 60).toFixed(1)} 秒）`
    : mode === "exact" ? "精确反演（对照）— 仅视觉回放，无误差"
    : "数值反演（实验）— 真实反向积分，展示浮点误差指数放大";

  const hintText = phase === "awaitingConfirm" ? "反向积分数据准备中，请稍候…"
    : historyInsufficient ? `需要至少运行 2 秒才能反演（当前 ${(history.length / 60).toFixed(1)} 秒）`
    : "";

  // ── 叙事阶段：根据漂移数据自动判定 ──
  const maxDrift = driftHistory.length > 0 ? Math.max(...driftHistory.map((d) => d.driftDistance)) : 0;
  const separationSample = driftHistory.find((d) => d.driftDistance > REVERSAL_DEFAULTS.teachingThreshold);
  /** 叙事阶段：coinciding(重合期) → separating(分离期) → diverging(发散期) */
  const narrativePhase: "coinciding" | "separating" | "diverging" =
    phase === "completed" ? "diverging"
    : maxDrift < REVERSAL_DEFAULTS.teachingThreshold ? "coinciding"
    : maxDrift < REVERSAL_DEFAULTS.teachingThreshold * 10 ? "separating"
    : "diverging";
  /** 首次分离的反演时间（秒），null 表示尚未分离 */
  const separationStartTime: number | null = separationSample?.reversalTime ?? null;
  /** 反演已进行的时间（秒） */
  const elapsedReversalTime = driftHistory.length > 0 ? driftHistory[driftHistory.length - 1]!.reversalTime : 0;

  const showAnnotation = mode === "numerical" && phase === "reversing"
    && !annotationDismissed && driftHistory.some((d) => d.driftDistance > REVERSAL_DEFAULTS.teachingThreshold);

  function exactPlaybackLoop() {
    const fwdArray = fwdSnapshotRef.current;
    const idx = exactFrameIdxRef.current;
    if (idx >= fwdArray.length) {
      cancelAnimationFrame(exactRafRef.current);
      setPhase("completed"); setActive(false); isReversingRef.current = false;
      setExactCompletedOpen(true);
      return;
    }
    const sv = fwdArray[fwdArray.length - 1 - idx]!;
    commandBus.emit({ type: "simulation:overrideState", state: { theta1: sv.theta1, omega1: sv.omega1, theta2: sv.theta2, omega2: sv.omega2 } });
    useExploreStore.getState().appendDriftSample({ reversalTime: idx / REVERSAL_DEFAULTS.reversalFps, driftDistance: 0, forwardSimTime: startSimTimeRef.current - idx / REVERSAL_DEFAULTS.reversalFps });
    const pos = ball2Position(sv, reversalParamsRef.current);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
    exactFrameIdxRef.current++;
    exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
  }

  const startReversal = useCallback(() => {
    const store = useSimulationStore.getState();
    const fwdArray = getHistoryFnRef.current();
    if (fwdArray.length < minFrames) throw new InsufficientHistoryError(fwdArray.length, minFrames);
    reversalStartRef.current = { ...store.state };
    startSimTimeRef.current = store.t;
    reversalParamsRef.current = { L1: store.params.L1, L2: store.params.L2 };
    clearDriftHistory(); resetAnnotation();
    reversalTrailRef.current = [];
    setStartTime(store.t); setActive(true);
    isReversingRef.current = true;
    prevSimTimeRef.current = store.t;
    fwdSnapshotRef.current = getHistoryFnRef.current();
    clearTrajectoryData();
    const fwdPts = fwdArray.map((sv) => { const p = ball2Position(sv, reversalParamsRef.current); return new THREE.Vector3(p.x, p.y, p.z); });
    updateTrajectoryData({ forwardPoints: fwdPts, reversalPoints: [], reversalColor: mode === "exact" ? "#FFD700" : "#00FFFF", visible: true, fadeOutAt: null });
    if (mode === "exact") {
      setPhase("reversing"); exactFrameIdxRef.current = 0;
      commandBus.emit({ type: "scheduler:pause" });
      exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
    } else {
      awaitingConfirmRef.current = true;
      setPhase("awaitingConfirm"); pauseHistoryRecording();
      commandBus.emit({ type: "scheduler:pause" });
      commandBus.emit({ type: "scheduler:reset", initialConditions: { theta1: store.state.theta1, theta1Dot: store.state.omega1, theta2: store.state.theta2, theta2Dot: store.state.omega2 }, simTime: store.t });
      commandBus.emit({ type: "scheduler:setDirection", direction: -1 });
      commandBus.emit({ type: "scheduler:prefetchBatch" });
      // Worker 预取完成后自动启动反演（无需二次确认弹窗）
      void commandBus.once("scheduler:prefetchReady", () => {
        if (!awaitingConfirmRef.current) return;
        awaitingConfirmRef.current = false;
        setIntroOpen(false);
        setPhase("reversing");
        commandBus.emit({ type: "scheduler:resume" });
      });
      // 预取超时保护：10 秒后 Worker 仍未响应则自动取消
      prefetchTimeoutRef.current = setTimeout(() => {
        if (!awaitingConfirmRef.current) return;
        notificationPort.notify({ title: "反演准备超时", description: "Worker 未在 10 秒内响应预取请求，请重试", variant: "warning", durationMs: 5000 });
        handleCancelReversal();
      }, PREFETCH_TIMEOUT_MS);
    }
  }, [mode, minFrames, setActive, setStartTime, setPhase, clearDriftHistory, resetAnnotation]);

  const stopReversal = useCallback(() => {
    isReversingRef.current = false;
    if (mode === "exact") {
      cancelAnimationFrame(exactRafRef.current);
      const start = reversalStartRef.current;
      if (start) commandBus.emit({ type: "scheduler:reset", initialConditions: { theta1: start.theta1, theta1Dot: start.omega1, theta2: start.theta2, theta2Dot: start.omega2 } });
      commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      commandBus.emit({ type: "scheduler:resume" });
      startTrajectoryFadeOut();
      setPhase("completed"); setActive(false);
    } else {
      resumeHistoryRecording();
      commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      commandBus.emit({ type: "simulation:setRunning", isRunning: false });
      setPhase("completed"); setActive(false);
      setCompletedOpen(true);
    }
  }, [mode, setPhase, setActive]);

  const pauseReversal = useCallback(() => {
    if (phase !== "reversing") return;
    setPhase("paused");
    if (mode === "exact") {
      cancelAnimationFrame(exactRafRef.current);
    } else {
      commandBus.emit({ type: "scheduler:pause" });
    }
  }, [mode, phase, setPhase]);

  const resumeReversal = useCallback(() => {
    if (phase !== "paused") return;
    setPhase("reversing");
    prevSimTimeRef.current = useSimulationStore.getState().t;
    if (mode === "exact") {
      exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
    } else {
      commandBus.emit({ type: "scheduler:resume" });
    }
  }, [mode, phase, setPhase]);

  const openIntro = useCallback(() => {
    commandBus.emit({ type: "scheduler:pause" });
    setIntroOpen(true);
  }, [setIntroOpen]);

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    commandBus.emit({ type: "scheduler:resume" });
  }, [setIntroOpen]);

  const handleCancelReversal = useCallback(() => {
    if (prefetchTimeoutRef.current) { clearTimeout(prefetchTimeoutRef.current); prefetchTimeoutRef.current = undefined; }
    awaitingConfirmRef.current = false;
    setIntroOpen(false);
    commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
    commandBus.emit({ type: "scheduler:resume" });
    resumeHistoryRecording();
    setPhase("idle"); setActive(false);
    isReversingRef.current = false;
    clearTrajectoryData(); clearDriftHistory();
  }, [setPhase, setActive, clearDriftHistory, setIntroOpen]);
  const handleRestoreState = useCallback(() => { setCompletedOpen(false); const start = reversalStartRef.current; if (start) { useSimulationStore.setState({ initialConditions: { theta1: start.theta1, theta1Dot: start.omega1, theta2: start.theta2, theta2Dot: start.omega2 } }); useSimulationStore.getState().applyCurrentSettings(); startTrajectoryFadeOut(); } useExploreStore.getState().resetReversalState(); }, []);
  const handleResetAfterComplete = useCallback(() => { setCompletedOpen(false); clearTrajectoryData(); useSimulationStore.getState().applyCurrentSettings(); useExploreStore.getState().resetReversalState(); }, []);

  const handleExactRestoreState = useCallback(() => {
    setExactCompletedOpen(false);
    const start = reversalStartRef.current;
    if (start) {
      commandBus.emit({ type: "scheduler:reset", initialConditions: { theta1: start.theta1, theta1Dot: start.omega1, theta2: start.theta2, theta2Dot: start.omega2 } });
      commandBus.emit({ type: "scheduler:resume" });
      startTrajectoryFadeOut();
    }
    useExploreStore.getState().resetReversalState();
  }, []);

  const handleExactResetAfterComplete = useCallback(() => { setExactCompletedOpen(false); clearTrajectoryData(); useSimulationStore.getState().applyCurrentSettings(); useExploreStore.getState().resetReversalState(); }, []);

  // 数值反演逐帧漂移检测
  useEffect(() => {
    if (mode !== "numerical" || phase !== "reversing" || !isReversingRef.current) return;
    const store = useSimulationStore.getState();
    const currentSimTime = store.t;
    if (prevSimTimeRef.current > 0 && currentSimTime >= prevSimTimeRef.current) { prevSimTimeRef.current = currentSimTime; return; }
    prevSimTimeRef.current = currentSimTime;
    if (currentSimTime <= 0.001) { stopReversal(); return; }
    if (store.engineError) {
      notificationPort.notify({ title: "数值反演发散", description: `于反演时间 t≈${(startSimTimeRef.current - currentSimTime).toFixed(2)}s — 误差已远超可追踪范围`, variant: "error", durationMs: 5000 });
      stopReversal(); return;
    }
    const fwdArray = fwdSnapshotRef.current;
    const reversalTime = startSimTimeRef.current - currentSimTime;
    const fwdIdx = Math.round(fwdArray.length - 1 - reversalTime * REVERSAL_DEFAULTS.reversalFps);
    let drift = 0;
    if (fwdIdx >= 0 && fwdIdx < fwdArray.length) drift = computeDrift(store.state, fwdArray[fwdIdx]!);
    useExploreStore.getState().appendDriftSample({ reversalTime: Math.max(0, reversalTime), driftDistance: drift, forwardSimTime: currentSimTime });
    const pos = ball2Position(store.state, reversalParamsRef.current);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
  }, [mode, phase, simTime, stopReversal]);

  useEffect(() => { if (phase === "reversing") { isReversingRef.current = true; prevSimTimeRef.current = useSimulationStore.getState().t; } }, [phase]);

  const prevResetTriggerRef = useRef(resetTrigger);
  useEffect(() => {
    if (resetTrigger !== prevResetTriggerRef.current) {
      prevResetTriggerRef.current = resetTrigger;
      if (isReversingRef.current && mode === "numerical") commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      isReversingRef.current = false; cancelAnimationFrame(exactRafRef.current);
      clearTrajectoryData(); useExploreStore.getState().resetReversalState();
    }
  }, [resetTrigger, mode]);

  useEffect(() => { return () => { if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current); cancelAnimationFrame(exactRafRef.current); if (isReversingRef.current && mode === "numerical") commandBus.emit({ type: "scheduler:setDirection", direction: 1 }); isReversingRef.current = false; clearTrajectoryData(); }; }, []);

  return {
    mode, setMode, active, phase, driftHistory, startTime, historyInsufficient, buttonDisabled,
    tooltipText, hintText, introOpen, openIntro, closeIntro,
    narrativePhase, maxDrift, separationStartTime, elapsedReversalTime,
    showAnnotation, annotationDismissed, dismissAnnotation,
    completedOpen, exactCompletedOpen, engineError,
    startReversal, stopReversal, pauseReversal, resumeReversal,
    handleCancelReversal,
    handleRestoreState, handleResetAfterComplete,
    handleExactRestoreState, handleExactResetAfterComplete,
    history,
  };
}
