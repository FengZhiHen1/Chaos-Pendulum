import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useSimulationStore, getScheduler, ball2Position } from "@/features/simulation";
import {
  useSimulationHistory,
  getSimulationHistory,
  pauseHistoryRecording,
  resumeHistoryRecording,
} from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import {
  updateTrajectoryData,
  clearTrajectoryData,
} from "../components/TimeReversalTrajectory";

// ─── 常量 ──────────────────────────────────────

const MIN_HISTORY_FRAMES = 120;
const TEACHING_THRESHOLD = 0.1; // rad

// ─── 纯函数：计算漂移 ─────────────────────────

export function computeDrift(
  theta1A: number,
  omega1A: number,
  theta2A: number,
  omega2A: number,
  theta1B: number,
  omega1B: number,
  theta2B: number,
  omega2B: number,
): number {
  const dTheta1 = Math.abs(theta1A - theta1B);
  const dTheta1Dot = Math.abs(omega1A - omega1B);
  const dTheta2 = Math.abs(theta2A - theta2B);
  const dTheta2Dot = Math.abs(omega2A - omega2B);
  return Math.sqrt(dTheta1 ** 2 + dTheta1Dot ** 2 + dTheta2 ** 2 + dTheta2Dot ** 2);
}

// ─── Hook 接口 ────────────────────────────────

export type TimeReversalMode = "exact" | "numerical";

export interface UseTimeReversalAPI {
  mode: TimeReversalMode;
  setMode: (m: TimeReversalMode) => void;
  active: boolean;
  phase: string;
  driftHistory: { reversalTime: number; driftDistance: number }[];
  annotationDismissed: boolean;
  dismissAnnotation: () => void;
  startTime: number;
  reversalTime: number;
  historyDuration: string;
  buttonDisabled: boolean;
  tooltipText: string;
  showAnnotation: boolean;
  startReversal: () => void;
  stopReversal: () => void;
  isReversing: boolean;
  reversalTrailRef: React.MutableRefObject<THREE.Vector3[]>;
}

export function useTimeReversal(): UseTimeReversalAPI {
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
  const isReversing = phase === "reversing";
  const buttonDisabled = historyInsufficient || isReversing;
  const tooltipText = historyInsufficient
    ? `需要至少运行 2 秒才能反演（当前已运行 ${(history.length / 60).toFixed(1)} 秒）`
    : mode === "exact"
      ? "精确反演（对照）— 仅视觉回放，无误差"
      : "数值反演（实验）— 真实反向积分，展示浮点误差指数放大";

  const showAnnotation =
    mode === "numerical" &&
    !annotationDismissed &&
    driftHistory.some((d) => d.driftDistance > TEACHING_THRESHOLD);

  const historyDuration = (history.length / 60).toFixed(1);
  const reversalTime = simTime;

  // ── 精确反演 RAF 循环 ──
  const exactPlaybackLoop = useCallback(() => {
    const fwd = fwdSnapshotRef.current;
    if (exactFrameIdxRef.current >= fwd.length) {
      stopReversalRef.current?.();
      return;
    }
    const frame = fwd[exactFrameIdxRef.current]!;
    exactFrameIdxRef.current += 1;

    useSimulationStore.setState({
      state: {
        theta1: frame.theta1,
        omega1: frame.omega1,
        theta2: frame.theta2,
        omega2: frame.omega2,
      },
    });

    const reversalTime_ = startSimTimeRef.current - exactFrameIdxRef.current * (1 / 60);
    const store = useSimulationStore.getState();
    const { x: xA, y: yA, z: zA } = ball2Position(frame, store.params);
    reversalTrailRef.current.push(new THREE.Vector3(xA, yA, zA));

    let driftDist = 0;
    if (fwdSnapshotRef.current.length > exactFrameIdxRef.current) {
      const currentState = {
        theta1: frame.theta1,
        omega1: frame.omega1,
        theta2: frame.theta2,
        omega2: frame.omega2,
      };
      const prevState = fwdSnapshotRef.current[
        fwdSnapshotRef.current.length - 1 - (exactFrameIdxRef.current - 1)
      ];
      if (prevState) {
        driftDist = computeDrift(
          currentState.theta1,
          currentState.omega1,
          currentState.theta2,
          currentState.omega2,
          prevState.theta1,
          prevState.omega1,
          prevState.theta2,
          prevState.omega2,
        );
      }
    }
    useExploreStore.getState().appendDriftSample({
      reversalTime: reversalTime_,
      driftDistance: driftDist,
      forwardSimTime: reversalTime_,
    });

    updateTrajectoryData({
      forwardPoints: reversalTrailRef.current.slice(),
      reversalPoints: [],
      reversalColor: "#ffd700",
      visible: true,
    });

    exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
  }, []);

  // ── 开始反演 ──
  const startReversal = useCallback(() => {
    const store = useSimulationStore.getState();
    const scheduler = getScheduler();

    if (history.length < MIN_HISTORY_FRAMES) return;

    reversalStartRef.current = { ...store.state };
    startSimTimeRef.current = store.t;
    clearDriftHistory();
    resetAnnotation();
    reversalTrailRef.current = [];
    setStartTime(store.t);
    setActive(true);
    isReversingRef.current = true;
    prevSimTimeRef.current = store.t;

    fwdSnapshotRef.current = getSimulationHistory();

    const fwdPts = history.toArray().map((sv) => {
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
  }, [
    mode,
    history,
    setActive,
    setStartTime,
    setPhase,
    clearDriftHistory,
    resetAnnotation,
    exactPlaybackLoop,
  ]);

  // ── 停止反演 — 通过 ref 暴露给 exact playback 使用 ──
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

    clearTrajectoryData();
    setPhase("completed");
    setActive(false);
  }, [mode, setPhase, setActive]);

  // 使用 ref 传递 stopReversal 给 exactPlaybackLoop 避免闭包问题
  const stopReversalRef = useRef(stopReversal);
  stopReversalRef.current = stopReversal;

  // ── 数值反演逐帧漂移检测 ──
  useEffect(() => {
    if (mode !== "numerical" || phase !== "reversing" || !isReversingRef.current) return;

    const store = useSimulationStore.getState();
    const currentSimTime = store.t;

    if (currentSimTime <= 0.001) {
      stopReversal();
      return;
    }

    if (store.engineError) {
      stopReversal();
      return;
    }

    const start = reversalStartRef.current;
    if (!start) return;

    const driftDist = computeDrift(
      start.theta1,
      start.omega1,
      start.theta2,
      start.omega2,
      store.state.theta1,
      store.state.omega1,
      store.state.theta2,
      store.state.omega2,
    );

    const elapsedSec = startSimTimeRef.current - currentSimTime;

    useExploreStore.getState().appendDriftSample({
      reversalTime: elapsedSec,
      driftDistance: driftDist,
      forwardSimTime: elapsedSec,
    });

    const store_ = useSimulationStore.getState();
    const { x: xRev, y: yRev } = ball2Position(store_.state, store_.params);
    reversalTrailRef.current.push(new THREE.Vector3(xRev, yRev, 0));

    updateTrajectoryData({
      forwardPoints: fwdSnapshotRef.current.map((sv) => {
        const p = ball2Position(sv, store_.params);
        return new THREE.Vector3(p.x, p.y, p.z);
      }),
      reversalPoints: reversalTrailRef.current.slice(),
      reversalColor: "#00ffff",
      visible: true,
    });
  }, [mode, phase, simTime, stopReversal]);

  // 初始化 effect
  useEffect(() => {
    if (active && phase === "idle") {
      setPhase("idle");
      prevSimTimeRef.current = simTime;
    }
  }, [active, phase, simTime, setPhase]);

  // 清理
  useEffect(() => {
    return () => {
      cancelAnimationFrame(exactRafRef.current);
      getScheduler().setDirection(1);
    };
  }, []);

  return {
    mode,
    setMode,
    active,
    phase,
    driftHistory,
    annotationDismissed,
    dismissAnnotation,
    startTime,
    reversalTime,
    historyDuration,
    buttonDisabled,
    tooltipText,
    showAnnotation,
    startReversal,
    stopReversal,
    isReversing,
    reversalTrailRef,
  };
}
