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
  showAnnotation: boolean;
  annotationDismissed: boolean;
  dismissAnnotation: () => void;
  confirmOpen: boolean;
  dialogPhase: "loading" | "ready";
  completedOpen: boolean;
  engineError: string | null;
  startReversal: () => void;
  stopReversal: () => void;
  handleConfirmReversal: () => void;
  handleCancelReversal: () => void;
  handleRestoreState: () => void;
  handleResetAfterComplete: () => void;
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
  const { computeDrift } = useDriftCalculation();

  const history = useSimulationHistory();
  const simTime = useSimulationStore((s) => s.t);
  const params = useSimulationStore((s) => s.params);
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogPhase, setDialogPhase] = useState<"loading" | "ready">("loading");
  const [completedOpen, setCompletedOpen] = useState(false);

  const minFrames = REVERSAL_DEFAULTS.minHistoryFrames;
  const historyInsufficient = history.length < minFrames;
  const buttonDisabled = historyInsufficient || phase === "awaitingConfirm";
  const tooltipText = phase === "awaitingConfirm" ? "反向积分数据准备中…"
    : historyInsufficient ? `需要至少运行 2 秒才能反演（当前已运行 ${(history.length / 60).toFixed(1)} 秒）`
    : mode === "exact" ? "精确反演（对照）— 仅视觉回放，无误差"
    : "数值反演（实验）— 真实反向积分，展示浮点误差指数放大";

  const showAnnotation = mode === "numerical" && phase === "reversing"
    && !annotationDismissed && driftHistory.some((d) => d.driftDistance > REVERSAL_DEFAULTS.teachingThreshold);

  function exactPlaybackLoop() {
    const fwdArray = history.toArray();
    const idx = exactFrameIdxRef.current;
    if (idx >= fwdArray.length) {
      setPhase("completed"); setActive(false); isReversingRef.current = false;
      const first = fwdArray[0]!;
      commandBus.emit({ type: "scheduler:reset", initialConditions: { theta1: first.theta1, theta1Dot: first.omega1, theta2: first.theta2, theta2Dot: first.omega2 } });
      commandBus.emit({ type: "scheduler:resume" });
      return;
    }
    const sv = fwdArray[fwdArray.length - 1 - idx]!;
    commandBus.emit({ type: "simulation:overrideState", state: { theta1: sv.theta1, omega1: sv.omega1, theta2: sv.theta2, omega2: sv.omega2 } });
    useExploreStore.getState().appendDriftSample({ reversalTime: idx / REVERSAL_DEFAULTS.reversalFps, driftDistance: 0, forwardSimTime: startSimTimeRef.current - idx / REVERSAL_DEFAULTS.reversalFps });
    const pos = ball2Position(sv, useSimulationStore.getState().params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
    exactFrameIdxRef.current++;
    exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
  }

  const startReversal = useCallback(() => {
    const store = useSimulationStore.getState();
    const fwdArray = history.toArray();
    if (fwdArray.length < minFrames) throw new InsufficientHistoryError(fwdArray.length, minFrames);
    reversalStartRef.current = { ...store.state };
    startSimTimeRef.current = store.t;
    clearDriftHistory(); resetAnnotation();
    reversalTrailRef.current = [];
    setStartTime(store.t); setActive(true);
    isReversingRef.current = true;
    prevSimTimeRef.current = store.t;
    fwdSnapshotRef.current = getSimulationHistory();
    clearTrajectoryData();
    const fwdPts = fwdArray.map((sv) => { const p = ball2Position(sv, store.params); return new THREE.Vector3(p.x, p.y, p.z); });
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
      setDialogPhase("loading"); setConfirmOpen(true);
      commandBus.emit({ type: "scheduler:prefetchBatch" });
      void commandBus.once("scheduler:prefetchReady", () => { if (!awaitingConfirmRef.current) return; awaitingConfirmRef.current = false; setDialogPhase("ready"); });
    }
  }, [mode, history, minFrames, setActive, setStartTime, setPhase, clearDriftHistory, resetAnnotation]);

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

  const handleConfirmReversal = useCallback(() => { setConfirmOpen(false); setPhase("reversing"); commandBus.emit({ type: "scheduler:resume" }); }, [setPhase]);
  const handleCancelReversal = useCallback(() => { setConfirmOpen(false); commandBus.emit({ type: "scheduler:setDirection", direction: 1 }); commandBus.emit({ type: "scheduler:resume" }); resumeHistoryRecording(); setPhase("idle"); setActive(false); isReversingRef.current = false; clearTrajectoryData(); clearDriftHistory(); }, [setPhase, setActive, clearDriftHistory]);
  const handleRestoreState = useCallback(() => { setCompletedOpen(false); const start = reversalStartRef.current; if (start) { useSimulationStore.setState({ initialConditions: { theta1: start.theta1, theta1Dot: start.omega1, theta2: start.theta2, theta2Dot: start.omega2 } }); useSimulationStore.getState().applyCurrentSettings(); startTrajectoryFadeOut(); } }, []);
  const handleResetAfterComplete = useCallback(() => { setCompletedOpen(false); clearTrajectoryData(); useSimulationStore.getState().applyCurrentSettings(); }, []);

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
    const pos = ball2Position(store.state, params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
  }, [mode, phase, simTime, params, history, stopReversal]);

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

  useEffect(() => { return () => { cancelAnimationFrame(exactRafRef.current); if (isReversingRef.current && mode === "numerical") commandBus.emit({ type: "scheduler:setDirection", direction: 1 }); isReversingRef.current = false; clearTrajectoryData(); }; }, []);

  return {
    mode, setMode, active, phase, driftHistory, startTime, historyInsufficient, buttonDisabled,
    tooltipText, showAnnotation, annotationDismissed, dismissAnnotation,
    confirmOpen, dialogPhase, completedOpen, engineError,
    startReversal, stopReversal, handleConfirmReversal, handleCancelReversal,
    handleRestoreState, handleResetAfterComplete, history,
  };
}
