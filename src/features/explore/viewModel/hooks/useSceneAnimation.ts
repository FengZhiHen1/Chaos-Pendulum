/**
 * useSceneAnimation — Scene3D 动画状态管理 Hook。
 *
 * 封装 useFrame 主循环、相机管理、参数合法性检测、NaN 处理、尾迹追加。
 * 从 Scene3D.tsx 中提取，使组件保持纯 JSX 编排。
 */
import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Vector3 } from "three";
import { useSimulationStore, getScheduler } from "@/features/simulation";
import { commandBus } from "@/shared/infrastructure/commandBus";
import { useExploreStore } from "../../store";
import { useButterflyStore } from "../../store";
import type { TrailPoint } from "../hooks/useTrailBuffer";
import type { PendulumParams, StateVector } from "../selectors/domainTypes";
import type { ViewPreset } from "../../contracts";

/** 默认圆柱高度（用于摆杆缩放） */
const DEFAULT_CYLINDER_HEIGHT = 1.0;
/** 基础杆半径 */
const BASE_RADIUS = 0.02;

/** 相机预设 */
const CAMERA_PRESETS: Record<ViewPreset, { position: Vector3; target: Vector3; fov: number }> = {
  side: { position: new Vector3(3.0, 0.6, 2.2), target: new Vector3(0, -1.0, 0), fov: 45 },
  top: { position: new Vector3(0, 4.0, 0.01), target: new Vector3(0, -1.0, 0), fov: 50 },
  chaos: { position: new Vector3(0, 0, 3.5), target: new Vector3(0, -1.0, 0), fov: 55 },
};

function updateArm(mesh: THREE.Mesh | null, start: Vector3, end: Vector3, length: number): void {
  if (!mesh) return;
  const direction = end.clone().sub(start);
  const dist = direction.length();
  if (dist < 0.001) { mesh.visible = false; return; }
  mesh.visible = true;
  direction.normalize();
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.scale.y = length / DEFAULT_CYLINDER_HEIGHT;
  mesh.scale.x = 1; mesh.scale.z = 1;
  mesh.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction));
}

// ─── Hook 接口 ─────────────────────────────

export interface SceneAnimationState {
  arm1Ref: React.Ref<THREE.Mesh>;
  arm2Ref: React.Ref<THREE.Mesh>;
  ball1Ref: React.Ref<THREE.Mesh>;
  ball2Ref: React.Ref<THREE.Mesh>;
  orbitRef: React.Ref<any>;
  paramInvalidRef: React.MutableRefObject<boolean>;
  nanToast: boolean;
  handleNanToast: () => void;
  onCanvasCreated: (gl: { domElement: HTMLCanvasElement }) => void;
}

export function useSceneAnimation(
  butterflySide: "A" | "B" | undefined,
  onTrailClear: () => void,
  appendTrailPoint: (point: TrailPoint, params: PendulumParams, state: StateVector) => void,
  sphereSegments: number,
  cylinderSegments: number,
): SceneAnimationState {
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);
  const ball1Ref = useRef<THREE.Mesh>(null);
  const ball2Ref = useRef<THREE.Mesh>(null);
  const arm1Ref = useRef<THREE.Mesh>(null);
  const arm2Ref = useRef<THREE.Mesh>(null);

  const isMountedRef = useRef(true);
  const nanFrameCountRef = useRef(0);
  const transitionFrameRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const currentTargetRef = useRef(new Vector3());
  const paramInvalidRef = useRef(false);
  const lastParamsRef = useRef<string>("");
  const simTimeAccRef = useRef(0);

  const viewPreset = useExploreStore((s) => s.viewPreset);
  const params = useSimulationStore((s) => s.params);
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const nanToastRef = useRef(false);

  const handleNanToast = () => { nanToastRef.current = true; };

  const onCanvasCreated = (gl: { domElement: HTMLCanvasElement }) => {
    gl.domElement.setAttribute("data-webgl", "active");
  };

  // ── viewPreset 变化 → 启动相机过渡 ──
  const prevViewPresetRef = useRef(viewPreset);
  useEffect(() => {
    if (prevViewPresetRef.current !== viewPreset && viewPreset !== "chaos") {
      isTransitioningRef.current = true;
      transitionFrameRef.current = 0;
      if (orbitRef.current) orbitRef.current.enabled = false;
    }
    prevViewPresetRef.current = viewPreset;
  }, [viewPreset]);

  // ── Unmount 清理 ──
  useEffect(() => { return () => { isMountedRef.current = false; onTrailClear(); }; }, []);

  // ── 仿真重置时清空帧累加器 ──
  const prevResetTriggerRef = useRef(resetTrigger);
  useEffect(() => {
    if (prevResetTriggerRef.current !== resetTrigger) {
      prevResetTriggerRef.current = resetTrigger;
      simTimeAccRef.current = 0;
    }
  }, [resetTrigger]);

  // ── Unmount 清理 ──
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // ── params 变化时重建几何体 ──
  useEffect(() => {
    const paramsKey = `${params.m1},${params.m2},${params.L1},${params.L2}`;
    if (lastParamsRef.current === paramsKey) return;
    lastParamsRef.current = paramsKey;

    const r1 = Math.max(0.04, Math.min(0.2, 0.08 * Math.pow(params.m1, 1 / 3)));
    const r2 = Math.max(0.04, Math.min(0.2, 0.08 * Math.pow(params.m2, 1 / 3)));
    const arm1r = BASE_RADIUS * (1 + params.m1 * 0.15);
    const arm2r = BASE_RADIUS * (1 + params.m2 * 0.15);

    [ball1Ref, ball2Ref].forEach((ref, i) => {
      if (ref.current) {
        ref.current.geometry?.dispose();
        ref.current.geometry = new THREE.SphereGeometry(i === 0 ? r1 : r2, sphereSegments, sphereSegments);
      }
    });
    [arm1Ref, arm2Ref].forEach((ref, i) => {
      if (ref.current) {
        ref.current.geometry?.dispose();
        ref.current.geometry = new THREE.CylinderGeometry(
          i === 0 ? arm1r : arm2r, i === 0 ? arm1r : arm2r, DEFAULT_CYLINDER_HEIGHT, cylinderSegments,
        );
        ref.current.visible = (i === 0 ? params.L1 : params.L2) > 0.001;
      }
    });
  }, [params, sphereSegments, cylinderSegments]);

  // ── useFrame 每帧更新 ──
  useFrame((_, delta) => {
    if (!isMountedRef.current) return;

    if (!butterflySide && isRunning) {
      simTimeAccRef.current += delta;
      commandBus.emit({ type: "scheduler:requestTick", delta });
    }

    const bfStore = butterflySide ? useButterflyStore.getState() : null;
    const bfSide = bfStore ? (butterflySide === "A" ? bfStore.sideA : bfStore.sideB) : null;
    const store = useSimulationStore.getState();
    const p = bfSide?.params ?? store.params;
    const sv = bfSide?.state ?? store.state;
    const effectiveRunning = bfStore?.isRunning ?? store.isRunning;

    // 参数合法性
    const isInvalid = p.L1 <= 0.001 || p.L2 <= 0.001 || p.m1 <= 0 || p.m2 <= 0;
    paramInvalidRef.current = isInvalid;
    if (isInvalid) return;

    const { theta1, omega1, theta2, omega2 } = sv;

    // NaN 检测
    if (isNaN(theta1) || isNaN(omega1) || isNaN(theta2) || isNaN(omega2) ||
        !isFinite(theta1) || !isFinite(omega1) || !isFinite(theta2) || !isFinite(omega2)) {
      nanFrameCountRef.current++;
      if (nanFrameCountRef.current >= 60) {
        if (bfStore) bfStore.pause();
        else store.setRunning(false);
        nanToastRef.current = true;
      }
      return;
    }
    nanFrameCountRef.current = 0;

    // 3D 位置计算
    let ball1Pos: Vector3, ball2Pos: Vector3;
    if (bfSide) {
      ball1Pos = new Vector3(bfSide.x1, bfSide.y1, 0);
      ball2Pos = new Vector3(bfSide.x2, bfSide.y2, 0);
    } else if (effectiveRunning) {
      const scheduler = getScheduler();
      const { prev, curr } = scheduler.getInterpolationFrames();
      const dt = 1 / 60;
      const alpha = Math.min(simTimeAccRef.current / dt, 1.0);
      const effectivelyStopped = !scheduler.isRunning || alpha < 0.001;
      if (curr && (effectivelyStopped || !prev)) {
        ball1Pos = new Vector3(curr.x1, curr.y1, 0);
        ball2Pos = new Vector3(curr.x2, curr.y2, 0);
      } else if (prev && curr) {
        ball1Pos = new Vector3(prev.x1 + (curr.x1 - prev.x1) * alpha, prev.y1 + (curr.y1 - prev.y1) * alpha, 0);
        ball2Pos = new Vector3(prev.x2 + (curr.x2 - prev.x2) * alpha, prev.y2 + (curr.y2 - prev.y2) * alpha, 0);
      } else {
        ball1Pos = new Vector3(store.x1, store.y1, 0);
        ball2Pos = new Vector3(store.x2, store.y2, 0);
      }
    } else {
      ball1Pos = new Vector3(store.x1, store.y1, 0);
      ball2Pos = new Vector3(store.x2, store.y2, 0);
    }

    // 尾迹
    if (effectiveRunning) {
      appendTrailPoint({ position: ball2Pos.clone(), velocity: p.L2 * Math.abs(omega2) }, p, sv);
    }

    // 当 L 参数刚变更时，Worker 帧中的笛卡尔坐标还基于旧 L 值。
    // 若检测到杆长与球位置不匹配，立即从当前角度+新 L 重新计算，避免球体脱离杆。
    const arm1Dist = ball1Pos.length();
    const arm2Dist = ball2Pos.clone().sub(ball1Pos).length();
    if (Math.abs(arm1Dist - p.L1) > 0.001 || Math.abs(arm2Dist - p.L2) > 0.001) {
      const sx1 = p.L1 * Math.sin(theta1);
      const sy1 = -p.L1 * Math.cos(theta1);
      const sx2 = sx1 + p.L2 * Math.sin(theta2);
      const sy2 = sy1 - p.L2 * Math.cos(theta2);
      ball1Pos = new Vector3(sx1, sy1, 0);
      ball2Pos = new Vector3(sx2, sy2, 0);
    }

    // 更新网格
    if (ball1Ref.current) ball1Ref.current.position.copy(ball1Pos);
    if (ball2Ref.current) ball2Ref.current.position.copy(ball2Pos);
    updateArm(arm1Ref.current, new Vector3(0, 0, 0), ball1Pos, p.L1);
    updateArm(arm2Ref.current, ball1Pos, ball2Pos, p.L2);

    // 相机管理
    if (viewPreset === "chaos") {
      const targetPos = ball2Pos.clone().add(new Vector3(0, 0, 2.5));
      camera.position.lerp(targetPos, Math.abs(omega2) > 10 ? 0.15 : 0.05);
      camera.lookAt(ball2Pos);
    } else if (isTransitioningRef.current) {
      const preset = CAMERA_PRESETS[viewPreset];
      transitionFrameRef.current++;
      const t = transitionFrameRef.current / 60;
      if (t >= 1) {
        isTransitioningRef.current = false;
        if (orbitRef.current) orbitRef.current.enabled = true;
        camera.position.copy(preset.position);
        currentTargetRef.current.copy(preset.target);
        if (orbitRef.current) orbitRef.current.target.copy(preset.target);
      } else {
        camera.position.lerp(preset.position, 0.1);
        currentTargetRef.current.lerp(preset.target, 0.1);
        camera.lookAt(currentTargetRef.current);
      }
    }
  });

  return {
    arm1Ref, arm2Ref, ball1Ref, ball2Ref, orbitRef,
    paramInvalidRef,
    nanToast: nanToastRef.current,
    handleNanToast,
    onCanvasCreated,
  };
}
