/**
 * ButterflyScene — 单 Canvas 内同时渲染双摆对比。
 *
 * 摆 A（金色，左侧 x=-1.5）和摆 B（紫色，右侧 x=+1.5）独立渲染，
 * 各有独立尾迹。共用光源、网格、相机、OrbitControls。
 * 不创建独立 Canvas——嵌入主 Scene3D。
 */
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, SpotLight } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { useButterflyStore } from "../../store";
import { globalOrbitControlsAdapter } from "@/features/data/infrastructure/adapters/orbitControlsAdapterSingleton";

/** 两侧水平偏移量（世界坐标） */
const X_OFFSET_A = -1.5;
const X_OFFSET_B = 1.5;
/** 尾迹最大点数 */
const TRAIL_MAX = 300;
/** 基础杆半径 */
const BASE_RADIUS = 0.02;
/** 默认圆柱高度 */
const CYLINDER_HEIGHT = 1.0;

const BALL_COLOR_A = "#FBBF24";
const BALL_COLOR_B = "#A78BFA";
const TRAIL_COLOR_A = "#FBBF24";
const TRAIL_COLOR_B = "#A78BFA";

interface ButterflySceneContentProps {
  environment: "dark-lab" | "white-teaching";
  enableShadows: boolean;
  showGrid: boolean;
}

export function ButterflySceneContent({
  environment, enableShadows, showGrid,
}: ButterflySceneContentProps) {
  const orbitRef = useRef<any>(null);
  const orbitInjectedRef = useRef(false);

  // 摆臂和球 refs
  const arm1ARef = useRef<THREE.Mesh>(null);
  const arm2ARef = useRef<THREE.Mesh>(null);
  const ball1ARef = useRef<THREE.Mesh>(null);
  const ball2ARef = useRef<THREE.Mesh>(null);
  const arm1BRef = useRef<THREE.Mesh>(null);
  const arm2BRef = useRef<THREE.Mesh>(null);
  const ball1BRef = useRef<THREE.Mesh>(null);
  const ball2BRef = useRef<THREE.Mesh>(null);

  // 尾迹线 ref
  const trailARef = useRef<THREE.Line>(null);
  const trailBRef = useRef<THREE.Line>(null);

  // 尾迹历史（模块级持久化）
  const trailA = useRef<THREE.Vector3[]>([]);
  const trailB = useRef<THREE.Vector3[]>([]);

  // OrbitControls 注入（复用全局适配器）
  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      if (orbitInjectedRef.current) { clearInterval(id); return; }
      if (orbitRef.current) {
        globalOrbitControlsAdapter.injectControls(orbitRef.current);
        orbitInjectedRef.current = true;
        clearInterval(id);
      }
      if (++attempts >= 50) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // 环境配置
  const envConfig = useMemo(() => {
    const configs: Record<string, { ambientIntensity: number; spotIntensity: number; spotPosition: Vector3; gridColor: string }> = {
      "dark-lab": { ambientIntensity: 0.15, spotIntensity: 8, spotPosition: new Vector3(3, 5, 2), gridColor: "#1a1a2e" },
      "white-teaching": { ambientIntensity: 1.0, spotIntensity: 0, spotPosition: new Vector3(0, 0, 0), gridColor: "#cccccc" },
    };
    return configs[environment] ?? configs["dark-lab"]!;
  }, [environment]);

  /** 更新单侧摆臂+球位置 */
  function updateSide(
    xOff: number,
    x1: number, y1: number, x2: number, y2: number,
    arm1: THREE.Mesh | null, arm2: THREE.Mesh | null,
    ball1: THREE.Mesh | null, ball2: THREE.Mesh | null,
    L1: number, L2: number,
  ) {
    const b1Pos = new Vector3(x1 + xOff, y1, 0);
    const b2Pos = new Vector3(x2 + xOff, y2, 0);
    const pivot = new Vector3(xOff, 0, 0);

    if (ball1) ball1.position.copy(b1Pos);
    if (ball2) ball2.position.copy(b2Pos);

    const updateArm = (mesh: THREE.Mesh | null, start: Vector3, end: Vector3, length: number) => {
      if (!mesh) return;
      const dir = end.clone().sub(start);
      const dist = dir.length();
      if (dist < 0.001) { mesh.visible = false; return; }
      mesh.visible = true;
      dir.normalize();
      mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
      mesh.scale.y = length / CYLINDER_HEIGHT;
      mesh.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    };
    updateArm(arm1, pivot, b1Pos, L1);
    updateArm(arm2, b1Pos, b2Pos, L2);
  }

  /** 更新尾迹线几何 */
  function updateTrail(line: THREE.Line | null, points: THREE.Vector3[]) {
    if (!line || points.length < 2) { if (line) line.visible = false; return; }
    line.visible = true;
    const arr: number[] = [];
    for (const p of points) { arr.push(p.x, p.y, p.z); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    line.geometry.dispose();
    line.geometry = geo;
  }

  useFrame(() => {
    const bf = useButterflyStore.getState();
    const sA = bf.sideA;
    const sB = bf.sideB;

    updateSide(X_OFFSET_A, sA.x1, sA.y1, sA.x2, sA.y2,
      arm1ARef.current, arm2ARef.current, ball1ARef.current, ball2ARef.current,
      sA.params.L1, sA.params.L2);
    updateSide(X_OFFSET_B, sB.x1, sB.y1, sB.x2, sB.y2,
      arm1BRef.current, arm2BRef.current, ball1BRef.current, ball2BRef.current,
      sB.params.L1, sB.params.L2);

    // 运行中才追加尾迹
    if (bf.isRunning) {
      trailA.current.push(new Vector3(sA.x2 + X_OFFSET_A, sA.y2, 0));
      trailB.current.push(new Vector3(sB.x2 + X_OFFSET_B, sB.y2, 0));
      if (trailA.current.length > TRAIL_MAX) trailA.current = trailA.current.slice(-TRAIL_MAX);
      if (trailB.current.length > TRAIL_MAX) trailB.current = trailB.current.slice(-TRAIL_MAX);
    }
    if (bf.trailClearSignal) {
      trailA.current = [];
      trailB.current = [];
    }

    updateTrail(trailARef.current, trailA.current);
    updateTrail(trailBRef.current, trailB.current);
  });

  return (
    <>
      <ambientLight intensity={envConfig.ambientIntensity} />
      {envConfig.spotIntensity > 0 && (
        <SpotLight position={[envConfig.spotPosition.x, envConfig.spotPosition.y, envConfig.spotPosition.z]}
          intensity={envConfig.spotIntensity} castShadow={enableShadows}
          shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      )}
      {showGrid && (
        <Grid position={[0, -3, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.5}
          cellColor={envConfig.gridColor} fadeDistance={8} />
      )}

      {/* 摆 A — 金色 */}
      <mesh ref={arm1ARef}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, CYLINDER_HEIGHT, 32]} />
        <meshStandardMaterial color="#D4D9E0" metalness={0.9} roughness={0.12} />
      </mesh>
      <mesh ref={ball1ARef}>
        <sphereGeometry args={[0.08, 64, 64]} />
        <meshStandardMaterial color={BALL_COLOR_A} metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh ref={arm2ARef}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, CYLINDER_HEIGHT, 32]} />
        <meshStandardMaterial color="#D4D9E0" metalness={0.9} roughness={0.12} />
      </mesh>
      <mesh ref={ball2ARef}>
        <sphereGeometry args={[0.08, 64, 64]} />
        <meshStandardMaterial color={BALL_COLOR_A} metalness={0.3} roughness={0.3} />
      </mesh>

      {/* 摆 B — 紫色 */}
      <mesh ref={arm1BRef}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, CYLINDER_HEIGHT, 32]} />
        <meshStandardMaterial color="#D4D9E0" metalness={0.9} roughness={0.12} />
      </mesh>
      <mesh ref={ball1BRef}>
        <sphereGeometry args={[0.08, 64, 64]} />
        <meshStandardMaterial color={BALL_COLOR_B} metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh ref={arm2BRef}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, CYLINDER_HEIGHT, 32]} />
        <meshStandardMaterial color="#D4D9E0" metalness={0.9} roughness={0.12} />
      </mesh>
      <mesh ref={ball2BRef}>
        <sphereGeometry args={[0.08, 64, 64]} />
        <meshStandardMaterial color={BALL_COLOR_B} metalness={0.3} roughness={0.3} />
      </mesh>

      {/* 尾迹线 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={trailARef as any}>
        <bufferGeometry />
        <lineBasicMaterial color={TRAIL_COLOR_A} transparent opacity={0.7} depthTest />
      </line>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={trailBRef as any}>
        <bufferGeometry />
        <lineBasicMaterial color={TRAIL_COLOR_B} transparent opacity={0.7} depthTest />
      </line>

      {/* 分隔竖线 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, -3, 0, 0, 2, 0]), 3]}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.15} />
      </line>

      <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08}
        minDistance={2} maxDistance={12} maxPolarAngle={Math.PI}
        target={[0, -1, 0]} />
    </>
  );
}
