/**
 * SandboxSim3D — 沙箱 3D 轨迹预览。
 *
 * 独立的 R3F Canvas，消费 labSlice.sandboxTrajectory，
 * 以固定帧率回放用户自定义方程计算的摆运动+尾迹。
 */

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useLabStore } from "../../store";

// ── 常量 ────────────────────────────────────────

const BALL_RADIUS = 0.06;
const ARM_RADIUS = 0.015;
const TRAIL_MAX = 500;

// ── 场景内容 ────────────────────────────────────

function SandboxScene() {
  const arm1Ref = useRef<THREE.Mesh>(null);
  const arm2Ref = useRef<THREE.Mesh>(null);
  const ball1Ref = useRef<THREE.Mesh>(null);
  const ball2Ref = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.LineSegments>(null);

  const geomArm = useMemo(() => new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, 1, 8), []);
  const geomBall = useMemo(() => new THREE.SphereGeometry(BALL_RADIUS, 20, 20), []);
  const matArm = useMemo(() => new THREE.MeshStandardMaterial({ color: "#555555" }), []);
  const matBall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#D4D9E0", metalness: 0.95, roughness: 0.12 }), []);

  useFrame(() => {
    const traj = useLabStore.getState().sandboxTrajectory;
    const idx = useLabStore.getState().sandboxPlaybackIndex;
    const isPlaying = useLabStore.getState().sandboxIsPlaying;

    if (!traj || traj.time.length < 2) return;

    // 推进帧
    if (isPlaying && idx < traj.time.length - 1) {
      useLabStore.setState({ sandboxPlaybackIndex: idx + 1 });
    }

    const i = isPlaying ? Math.min(idx + 1, traj.time.length - 1) : idx;
    const t1 = traj.theta1[i]!;
    const t2 = traj.theta2[i]!;
    const L1 = 0.5;
    const L2 = 0.5;

    const x1 = L1 * Math.sin(t1);
    const y1 = -L1 * Math.cos(t1);
    const x2 = x1 + L2 * Math.sin(t2);
    const y2 = y1 - L2 * Math.cos(t2);

    // 摆杆
    if (arm1Ref.current) {
      arm1Ref.current.position.set(x1 / 2, y1 / 2, 0);
      arm1Ref.current.rotation.set(0, 0, Math.atan2(x1, -y1));
      arm1Ref.current.scale.set(1, L1, 1);
    }
    if (arm2Ref.current) {
      arm2Ref.current.position.set(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, 0);
      arm2Ref.current.rotation.set(0, 0, Math.atan2(x2 - x1, -(y2 - y1)));
      arm2Ref.current.scale.set(1, L2, 1);
    }
    // 摆球
    if (ball1Ref.current) ball1Ref.current.position.set(x1, y1, 0);
    if (ball2Ref.current) ball2Ref.current.position.set(x2, y2, 0);

    // 尾迹
    if (trailRef.current) {
      const trail = trailRef.current;
      const start = Math.max(0, i - TRAIL_MAX);
      const pts: number[] = [];
      for (let j = start; j <= i; j++) {
        const tt1 = traj.theta1[j]!;
        const tt2 = traj.theta2[j]!;
        const bx = L1 * Math.sin(tt1) + L2 * Math.sin(tt2);
        const by = -L1 * Math.cos(tt1) - L2 * Math.cos(tt2);
        pts.push(bx, by, 0);
      }
      (trail.geometry as THREE.BufferGeometry).setAttribute(
        "position", new THREE.Float32BufferAttribute(pts, 3),
      );
      (trail.geometry as THREE.BufferGeometry).setDrawRange(0, pts.length / 3);
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 2, 3]} intensity={0.6} />
      <mesh ref={arm1Ref} geometry={geomArm} material={matArm} />
      <mesh ref={arm2Ref} geometry={geomArm} material={matArm} />
      <mesh ref={ball1Ref} geometry={geomBall} material={matBall} />
      <mesh ref={ball2Ref} geometry={geomBall} material={matBall} />
      <lineSegments ref={trailRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#4B9FFF" transparent opacity={0.6} />
      </lineSegments>
    </>
  );
}

// ── 主组件 ──────────────────────────────────────

export function SandboxSim3D() {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-surface-container-low">
      <Canvas
        camera={{ position: [0, -0.4, 3.2], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#1A1D22"]} />
        <SandboxScene />
      </Canvas>
    </div>
  );
}
