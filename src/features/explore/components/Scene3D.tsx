import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, SpotLight } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { useSimulationStore, ball2Position } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { useTrailBuffer } from "../hooks/useTrailBuffer";
import { useSceneController } from "../hooks/useSceneController";
import type { TrailPoint } from "../hooks/useTrailBuffer";
import type { PendulumParams, StateVector } from "@/shared/types";
import { TrailRenderer } from "./TrailRenderer";
import { useButterflyStore } from "../butterfly-store";

// ─── 类型定义 ────────────────────────────────────

type PendulumMaterialType = "metal" | "wood" | "glass";
type EnvironmentPreset = "dark-lab" | "white-teaching";
type ViewPreset = "side" | "top" | "chaos";

export interface Scene3DProps {
  /** 摆体材质类型。默认 "metal" */
  pendulumMaterial?: PendulumMaterialType;
  /** 环境预设。默认 "dark-lab" */
  environment?: EnvironmentPreset;
  /** 是否显示地面参考网格。默认 true */
  showGrid?: boolean;
  /** 是否启用阴影映射。默认 true */
  enableShadows?: boolean;
  /** 父容器 CSS 类名。默认 "w-full h-full" */
  className?: string;
  /** 蝴蝶效应模式下的分侧标识。非 butterfly 模式下不传 */
  butterflySide?: "A" | "B";
  /** Canvas 内的附加子节点（EXP-05 轨迹叠加层等） */
  canvasChildren?: React.ReactNode;
}

interface CameraConfig {
  position: Vector3;
  target: Vector3;
  fov: number;
}

interface MaterialVisualConfig {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
}

interface EnvironmentVisualConfig {
  background: string;
  ambientIntensity: number;
  spotIntensity: number;
  spotPosition: Vector3;
  gridColor: string;
}

interface SceneContentProps {
  pendulumMaterial: PendulumMaterialType;
  environment: EnvironmentPreset;
  effectiveEnableShadows: boolean;
  effectiveShowGrid: boolean;
  sphereSegments: number;
  cylinderSegments: number;
  onParamInvalidChange: (invalid: boolean) => void;
  onNanToast: () => void;
  trailPoints: TrailPoint[];
  appendTrailPoint: (point: TrailPoint, params: PendulumParams, state: StateVector) => void;
  onTrailClear: () => void;
  butterflySide?: "A" | "B";
}

// ─── 常量配置表 ──────────────────────────────────

const DEFAULT_CYLINDER_HEIGHT = 1.0;
const BASE_RADIUS = 0.02;

const MATERIAL_CONFIGS: Record<PendulumMaterialType, MaterialVisualConfig> = {
  metal: { color: "#C0C0C0", metalness: 0.8, roughness: 0.2, opacity: 1.0 },
  wood: { color: "#8B5E3C", metalness: 0.0, roughness: 0.7, opacity: 1.0 },
  glass: { color: "#E8F0F8", metalness: 0.1, roughness: 0.1, opacity: 0.6 },
};

const CAMERA_PRESETS: Record<ViewPreset, CameraConfig> = {
  side: {
    position: new Vector3(3.5, 0, 0),
    target: new Vector3(0, -1.2, 0),
    fov: 45,
  },
  top: {
    position: new Vector3(0, 4.0, 0.01),
    target: new Vector3(0, -1.0, 0),
    fov: 50,
  },
  chaos: {
    position: new Vector3(0, 0, 3.5),
    target: new Vector3(0, -1.0, 0),
    fov: 55,
  },
};

const ENVIRONMENT_CONFIGS: Record<EnvironmentPreset, EnvironmentVisualConfig> = {
  "dark-lab": {
    background: "#1A1D22",
    ambientIntensity: 0.15,
    spotIntensity: 8,
    spotPosition: new Vector3(3, 5, 2),
    gridColor: "#1a1a2e",
  },
  "white-teaching": {
    background: "#EAECEF",
    ambientIntensity: 1.0,
    spotIntensity: 0,
    spotPosition: new Vector3(0, 0, 0),
    gridColor: "#cccccc",
  },
};

// ─── 辅助函数：更新摆杆 ───────────────────────────

function updateArm(
  mesh: THREE.Mesh | null,
  start: Vector3,
  end: Vector3,
  length: number,
): void {
  if (!mesh) return;

  const direction = end.clone().sub(start);
  const dist = direction.length();

  if (dist < 0.001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;

  direction.normalize();

  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  mesh.position.copy(midpoint);

  mesh.scale.y = length / DEFAULT_CYLINDER_HEIGHT;
  mesh.scale.x = 1;
  mesh.scale.z = 1;

  const up = new Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
  mesh.quaternion.copy(quaternion);
}

// ─── 主组件：Scene3D ─────────────────────────────

export function Scene3D({
  pendulumMaterial = "metal",
  environment = "dark-lab",
  showGrid = true,
  enableShadows = true,
  className = "w-full h-full",
  butterflySide,
  canvasChildren,
}: Scene3DProps) {
  const {
    webglSupported,
    webglLost,
    webglLostPermanent,
    nanToast,
    paramInvalid,
    setParamInvalid,
    handleNanToast,
    effectiveShowGrid,
    effectiveEnableShadows,
    sphereSegments,
    cylinderSegments,
    onCanvasCreated,
  } = useSceneController(showGrid, enableShadows);

  const { trailPoints, appendPoint, clear: clearTrail } = useTrailBuffer();

  const envConfig = ENVIRONMENT_CONFIGS[environment];

  if (!webglSupported) {
    return (
      <div className={`${className} flex items-center justify-center bg-surface text-on-surface`}>
        <div className="text-center p-8 max-w-md">
          <p className="text-lg mb-4">您的浏览器不支持 WebGL 2.0</p>
          <p className="text-sm text-gray-400 mb-6">
            请使用最新版 Chrome、Firefox 或 Edge
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Chrome
            </a>
            <a
              href="https://www.mozilla.org/firefox/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Firefox
            </a>
            <a
              href="https://www.microsoft.com/edge/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Edge
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Canvas
        shadows={effectiveEnableShadows}
        camera={{ fov: 50, position: [3.5, 0, 0] }}
        style={{ background: envConfig.background }}
        onCreated={({ gl }) => {
          if (!gl) return;
          onCanvasCreated(gl as unknown as { domElement: HTMLCanvasElement });
        }}
      >
        <SceneContent
          pendulumMaterial={pendulumMaterial}
          environment={environment}
          effectiveEnableShadows={effectiveEnableShadows}
          effectiveShowGrid={effectiveShowGrid}
          sphereSegments={sphereSegments}
          cylinderSegments={cylinderSegments}
          onParamInvalidChange={setParamInvalid}
          onNanToast={handleNanToast}
          trailPoints={trailPoints}
          appendTrailPoint={appendPoint}
          onTrailClear={clearTrail}
          butterflySide={butterflySide}
        />
        {canvasChildren}
      </Canvas>

      {/* 参数异常遮罩 */}
      {paramInvalid && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none z-10">
          <p className="text-sm font-medium" style={{ color: "#ff6644" }}>
            参数异常，请在控制面板中调整
          </p>
        </div>
      )}

      {/* WebGL 丢失遮罩 */}
      {webglLost && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto z-10">
          <div className="text-center p-6">
            <p className="text-sm text-on-surface mb-4">
              {webglLostPermanent
                ? "3D 渲染引擎不可用，请刷新页面"
                : "3D 渲染引擎暂停 — 正在尝试恢复…"}
            </p>
            {webglLostPermanent && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-[#0D1117] rounded text-sm font-medium hover:opacity-90"
              >
                刷新页面
              </button>
            )}
          </div>
        </div>
      )}

      {/* NaN Toast */}
      {nanToast && (
        <div className="absolute bottom-4 right-4 bg-surface-container-low px-4 py-2 rounded text-sm text-on-surface shadow-lg z-10 pointer-events-none">
          检测到数值发散，仿真已暂停。请调整参数后重试
        </div>
      )}
    </div>
  );
}

// ─── Canvas 内子组件：SceneContent ───────────────

function SceneContent({
  pendulumMaterial,
  environment,
  effectiveEnableShadows,
  effectiveShowGrid,
  sphereSegments,
  cylinderSegments,
  onParamInvalidChange,
  onNanToast,
  trailPoints,
  appendTrailPoint,
  onTrailClear,
  butterflySide,
}: SceneContentProps) {
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);

  // Three.js 对象引用
  const ball1Ref = useRef<THREE.Mesh>(null);
  const ball2Ref = useRef<THREE.Mesh>(null);
  const arm1Ref = useRef<THREE.Mesh>(null);
  const arm2Ref = useRef<THREE.Mesh>(null);

  // 内部状态引用
  const isMountedRef = useRef(true);
  const nanFrameCountRef = useRef(0);
  const lastValidBall1Ref = useRef(new Vector3());
  const lastValidBall2Ref = useRef(new Vector3());
  const isUserInteractingRef = useRef(false);
  const transitionFrameRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const currentTargetRef = useRef(new Vector3());
  const paramInvalidRef = useRef(false);
  const lastParamsRef = useRef<string>("");

  // Store 订阅（React 重渲染触发器）
  const viewPreset = useExploreStore((s) => s.viewPreset);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const params = useSimulationStore((s) => s.params);

  const materialConfig = MATERIAL_CONFIGS[pendulumMaterial];
  const envConfig = ENVIRONMENT_CONFIGS[environment];

  // ── viewPreset 变化 → 启动相机过渡 ──
  const prevViewPresetRef = useRef(viewPreset);
  useEffect(() => {
    if (prevViewPresetRef.current !== viewPreset && viewPreset !== "chaos") {
      isTransitioningRef.current = true;
      transitionFrameRef.current = 0;
      if (orbitRef.current) {
        orbitRef.current.enabled = false;
      }
    }
    prevViewPresetRef.current = viewPreset;
  }, [viewPreset]);

  // ── 仿真重置时清空尾迹 ──
  const wasRunningRef = useRef(isRunning);
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      const s = useSimulationStore.getState();
      if (s.isSceneFrozen && s.fieldErrors && Object.keys(s.fieldErrors).length === 0) {
        // 可能是重置操作
      }
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  // ── Unmount 清理 ──
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      onTrailClear();
      console.log("EXP-01: Scene3D unmounted, stopping frame updates");
    };
  }, []);

  // ── params 变化时重建几何体 ──
  useEffect(() => {
    const paramsKey = `${params.m1},${params.m2},${params.L1},${params.L2}`;
    if (lastParamsRef.current === paramsKey) return;
    lastParamsRef.current = paramsKey;

    // 球体半径
    const r1 = Math.max(0.04, Math.min(0.2, 0.08 * Math.pow(params.m1, 1 / 3)));
    const r2 = Math.max(0.04, Math.min(0.2, 0.08 * Math.pow(params.m2, 1 / 3)));

    if (ball1Ref.current) {
      ball1Ref.current.geometry?.dispose();
      ball1Ref.current.geometry = new THREE.SphereGeometry(r1, sphereSegments, sphereSegments);
    }
    if (ball2Ref.current) {
      ball2Ref.current.geometry?.dispose();
      ball2Ref.current.geometry = new THREE.SphereGeometry(r2, sphereSegments, sphereSegments);
    }

    // 杆粗细（质量相关）
    const arm1r = BASE_RADIUS * (1 + params.m1 * 0.15);
    const arm2r = BASE_RADIUS * (1 + params.m2 * 0.15);

    if (arm1Ref.current) {
      arm1Ref.current.geometry?.dispose();
      arm1Ref.current.geometry = new THREE.CylinderGeometry(
        arm1r, arm1r, DEFAULT_CYLINDER_HEIGHT, cylinderSegments,
      );
      arm1Ref.current.visible = params.L1 > 0.001;
    }
    if (arm2Ref.current) {
      arm2Ref.current.geometry?.dispose();
      arm2Ref.current.geometry = new THREE.CylinderGeometry(
        arm2r, arm2r, DEFAULT_CYLINDER_HEIGHT, cylinderSegments,
      );
      arm2Ref.current.visible = params.L2 > 0.001;
    }
  }, [params, sphereSegments, cylinderSegments]);

  // ── 每帧更新 ──
  useFrame(() => {
    if (!isMountedRef.current) return;

    // 蝴蝶效应模式：从 ButterflySimStore 读取
    const bfStore = butterflySide ? useButterflyStore.getState() : null;
    const bfSide = bfStore ? (butterflySide === "A" ? bfStore.sideA : bfStore.sideB) : null;

    const store = useSimulationStore.getState();
    const p = bfSide ? bfSide.params : store.params;
    const sv = bfSide ? bfSide.state : store.state;
    const effectiveRunning = bfStore ? bfStore.isRunning : isRunning;

    // ── 参数合法性检查 ──
    const isInvalid = p.L1 <= 0.001 || p.L2 <= 0.001 || p.m1 <= 0 || p.m2 <= 0;
    if (isInvalid !== paramInvalidRef.current) {
      paramInvalidRef.current = isInvalid;
      onParamInvalidChange(isInvalid);
      if (isInvalid) {
        console.error("EXP-01: invalid physics params", {
          L1: p.L1,
          L2: p.L2,
          m1: p.m1,
          m2: p.m2,
        });
      }
    }
    if (isInvalid) return;

    const theta1 = sv.theta1;
    const omega1 = sv.omega1;
    const theta2 = sv.theta2;
    const omega2 = sv.omega2;

    // ── NaN / Infinity 检测 ──
    if (
      isNaN(theta1) || isNaN(omega1) || isNaN(theta2) || isNaN(omega2) ||
      !isFinite(theta1) || !isFinite(omega1) || !isFinite(theta2) || !isFinite(omega2)
    ) {
      nanFrameCountRef.current++;
      if (nanFrameCountRef.current === 1) {
        console.warn("EXP-01: NaN/Infinity detected in StateVector, freezing scene", {
          theta1,
          omega1,
          theta2,
          omega2,
        });
      }
      if (nanFrameCountRef.current >= 60) {
        if (bfStore) {
          bfStore.pause();
        } else {
          store.setRunning(false);
        }
        onNanToast();
      }
      return;
    }

    if (nanFrameCountRef.current > 0) {
      nanFrameCountRef.current = 0;
    }

    // 仿真暂停时保持当前位置
    if (!effectiveRunning) return;

    // ── 计算 3D 位置 ──
    const ball1Pos = new Vector3(
      p.L1 * Math.sin(theta1),
      -p.L1 * Math.cos(theta1),
      0,
    );
    const b2 = ball2Position(sv, p);
    const ball2Pos = new Vector3(b2.x, b2.y, b2.z);

    lastValidBall1Ref.current.copy(ball1Pos);
    lastValidBall2Ref.current.copy(ball2Pos);

    // ── 追加尾迹点（EXP-02） ──
    appendTrailPoint(
      { position: ball2Pos.clone(), velocity: p.L2 * Math.abs(omega2) },
      p,
      sv,
    );

    // ── 更新摆球位置 ──
    if (ball1Ref.current) ball1Ref.current.position.copy(ball1Pos);
    if (ball2Ref.current) ball2Ref.current.position.copy(ball2Pos);

    // ── 更新摆杆 ──
    updateArm(arm1Ref.current, new Vector3(0, 0, 0), ball1Pos, p.L1);
    updateArm(arm2Ref.current, ball1Pos, ball2Pos, p.L2);

    // ── 相机管理 ──
    if (viewPreset === "chaos") {
      const targetPos = ball2Pos.clone().add(new Vector3(0, 0, 2.5));
      const distToBall = camera.position.distanceTo(ball2Pos);
      if (distToBall < 0.01) {
        console.warn("EXP-01: chaos camera coincident with ball, falling back to side view");
        camera.position.copy(CAMERA_PRESETS.side.position);
        camera.lookAt(CAMERA_PRESETS.side.target);
      } else {
        const lerpFactor = Math.abs(omega2) > 10 ? 0.15 : 0.05;
        camera.position.lerp(targetPos, lerpFactor);
        camera.lookAt(ball2Pos);
      }
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

  // ── JSX ──
  return (
    <>
      {/* 环境光 */}
      <ambientLight intensity={envConfig.ambientIntensity} />

      {/* 聚光灯 */}
      {envConfig.spotIntensity > 0 && (
        <SpotLight
          position={[
            envConfig.spotPosition.x,
            envConfig.spotPosition.y,
            envConfig.spotPosition.z,
          ]}
          intensity={envConfig.spotIntensity}
          castShadow={effectiveEnableShadows}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      )}

      {/* 地面网格 */}
      {effectiveShowGrid && (
        <Grid
          position={[0, -3, 0]}
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor={envConfig.gridColor}
          fadeDistance={8}
        />
      )}

      {/* 固定支点 */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>

      {/* 下摆杆（支点到上摆球） */}
      <mesh ref={arm1Ref}>
        <cylinderGeometry
          args={[BASE_RADIUS, BASE_RADIUS, DEFAULT_CYLINDER_HEIGHT, cylinderSegments]}
        />
        <meshStandardMaterial color="#555555" />
      </mesh>

      {/* 上摆杆（上摆球到下摆球） */}
      <mesh ref={arm2Ref}>
        <cylinderGeometry
          args={[BASE_RADIUS, BASE_RADIUS, DEFAULT_CYLINDER_HEIGHT, cylinderSegments]}
        />
        <meshStandardMaterial color="#555555" />
      </mesh>

      {/* 上摆球 */}
      <mesh ref={ball1Ref}>
        <sphereGeometry args={[0.08, sphereSegments, sphereSegments]} />
        {pendulumMaterial === "glass" ? (
          <meshPhysicalMaterial
            color={materialConfig.color}
            metalness={materialConfig.metalness}
            roughness={materialConfig.roughness}
            transparent
            opacity={materialConfig.opacity}
            transmission={0.9}
          />
        ) : (
          <meshStandardMaterial
            color={materialConfig.color}
            metalness={materialConfig.metalness}
            roughness={materialConfig.roughness}
          />
        )}
      </mesh>

      {/* 下摆球 */}
      <mesh ref={ball2Ref}>
        <sphereGeometry args={[0.08, sphereSegments, sphereSegments]} />
        {pendulumMaterial === "glass" ? (
          <meshPhysicalMaterial
            color={materialConfig.color}
            metalness={materialConfig.metalness}
            roughness={materialConfig.roughness}
            transparent
            opacity={materialConfig.opacity}
            transmission={0.9}
          />
        ) : (
          <meshStandardMaterial
            color={materialConfig.color}
            metalness={materialConfig.metalness}
            roughness={materialConfig.roughness}
          />
        )}
      </mesh>

      {/* 运动尾迹（EXP-02） */}
      <TrailRenderer
        points={trailPoints}
        colorMode="velocity"
        opacity={0.85}
        maxWidth={3}
      />

      {/* 相机控制 */}
      <OrbitControls
        ref={orbitRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.5}
        maxDistance={10}
        maxPolarAngle={Math.PI}
        onStart={() => {
          isUserInteractingRef.current = true;
        }}
        onEnd={() => {
          isUserInteractingRef.current = false;
        }}
      />
    </>
  );
}
