/**
 * ButterflyScene — 单 Canvas 双摆并排 3D 渲染。
 */
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, SpotLight } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { useButterflyStore } from "../../store";
import { globalOrbitControlsAdapter } from "@/features/data/infrastructure/adapters/orbitControlsAdapterSingleton";

const X_OFF = 1.6;
const TRAIL_LEN = 400;
const ROD_R = 0.025;
const BALL_MIN = 0.07;
const BALL_MAX = 0.18;
const CYL_H = 1.0;

const GOLD = "#FBBF24";
const PURPLE = "#A78BFA";
const ROD_C = "#C0C4CC";

interface Props { environment: "dark-lab" | "white-teaching"; enableShadows: boolean; showGrid: boolean; }

export function ButterflySceneContent({ environment, enableShadows, showGrid }: Props) {
  const orbitRef = useRef<any>(null);
  const injectedRef = useRef(false);
  const lastM1 = useRef(0); const lastM2 = useRef(0);

  // 摆 A
  const aA1 = useRef<THREE.Mesh>(null); const aA2 = useRef<THREE.Mesh>(null);
  const bA1 = useRef<THREE.Mesh>(null); const bA2 = useRef<THREE.Mesh>(null);
  // 摆 B
  const aB1 = useRef<THREE.Mesh>(null); const aB2 = useRef<THREE.Mesh>(null);
  const bB1 = useRef<THREE.Mesh>(null); const bB2 = useRef<THREE.Mesh>(null);
  // 尾迹
  const tA = useRef<THREE.Line>(null); const tB = useRef<THREE.Line>(null);
  const ptsA = useRef<THREE.Vector3[]>([]); const ptsB = useRef<THREE.Vector3[]>([]);
  // 预分配 trail 缓冲区，复用避免每帧 dispose BufferGeometry
  const trailBufA = useRef(new Float32Array(TRAIL_LEN * 3));
  const trailBufB = useRef(new Float32Array(TRAIL_LEN * 3));
  const trailGeomInit = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (orbitRef.current && !injectedRef.current) {
        globalOrbitControlsAdapter.injectControls(orbitRef.current);
        injectedRef.current = true;
      }
    });
    const fallback = setTimeout(() => {
      if (orbitRef.current && !injectedRef.current) {
        globalOrbitControlsAdapter.injectControls(orbitRef.current);
        injectedRef.current = true;
      }
    }, 100);
    return () => { cancelAnimationFrame(raf); clearTimeout(fallback); };
  }, []);

  const env = useMemo(() => ({
    "dark-lab": { amb: 0.12, spot: 10, spotPos: new Vector3(0, 6, 3), grid: "#1a1a2e" },
    "white-teaching": { amb: 1, spot: 0, spotPos: new Vector3(0, 0, 0), grid: "#cccccc" },
  }[environment] ?? { amb: 0.12, spot: 10, spotPos: new Vector3(0, 6, 3), grid: "#1a1a2e" }), [environment]);

  function ballR(m: number) { return Math.max(BALL_MIN, Math.min(BALL_MAX, 0.08 * Math.pow(Math.max(m, 0.1), 1 / 3))); }

  const initializedRef = useRef(false);
  useFrame(() => {
    const bf = useButterflyStore.getState();

    // ── 哨兵：等待 butterfly store 通过 init() 写入真实数据 ──
    if (!bf.bfInitialized) return;

    // ── 首次初始化：几何体等一次性设置 ──
    if (!initializedRef.current) {
      initializedRef.current = true;
      // 球半径首次设置（走 useFrame 确保 mesh ref 已挂载）
      const p = bf.sideA.params;
      lastM1.current = p.m1; lastM2.current = p.m2;
      const r1 = ballR(p.m1); const r2 = ballR(p.m2);
      [bA1, bB1].forEach(r => { if (r.current) { r.current.geometry?.dispose(); r.current.geometry = new THREE.SphereGeometry(r1, 48, 48); } });
      [bA2, bB2].forEach(r => { if (r.current) { r.current.geometry?.dispose(); r.current.geometry = new THREE.SphereGeometry(r2, 48, 48); } });
    }

    const p = bf.sideA.params;

    // 质量变化时重建球几何体（罕见，走 useEffect 更好但此处保持兼容）
    if (p.m1 !== lastM1.current || p.m2 !== lastM2.current) {
      lastM1.current = p.m1; lastM2.current = p.m2;
      const r1 = ballR(p.m1); const r2 = ballR(p.m2);
      [bA1, bB1].forEach(r => { if (r.current) { r.current.geometry?.dispose(); r.current.geometry = new THREE.SphereGeometry(r1, 48, 48); } });
      [bA2, bB2].forEach(r => { if (r.current) { r.current.geometry?.dispose(); r.current.geometry = new THREE.SphereGeometry(r2, 48, 48); } });
    }

    updateSide(-X_OFF, bf.sideA, aA1.current, aA2.current, bA1.current, bA2.current);
    updateSide( X_OFF, bf.sideB, aB1.current, aB2.current, bB1.current, bB2.current);

    if (bf.isRunning) {
      ptsA.current.push(new Vector3(bf.sideA.x2 - X_OFF, bf.sideA.y2, 0));
      ptsB.current.push(new Vector3(bf.sideB.x2 + X_OFF, bf.sideB.y2, 0));
      if (ptsA.current.length > TRAIL_LEN) ptsA.current = ptsA.current.slice(-TRAIL_LEN);
      if (ptsB.current.length > TRAIL_LEN) ptsB.current = ptsB.current.slice(-TRAIL_LEN);
      updTrailBuf(tA.current, trailBufA.current, ptsA.current, !trailGeomInit.current);
      updTrailBuf(tB.current, trailBufB.current, ptsB.current, !trailGeomInit.current);
      trailGeomInit.current = true;
    }
  });

  return (
    <>
      <ambientLight intensity={env.amb} />
      {env.spot > 0 && <SpotLight position={[env.spotPos.x, env.spotPos.y, env.spotPos.z]}
        intensity={env.spot} castShadow={enableShadows}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />}
      {showGrid && <Grid position={[0, -3, 0]} args={[24, 24]} cellSize={0.5} cellThickness={0.5}
        cellColor={env.grid} fadeDistance={10} />}

      {/* 分隔线 */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position"
            args={[new Float32Array([0, -3.5, 0, 0, 2.2, 0]), 3]} count={2} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.2} />
      </line>

      {/* 支点标记 */}
      <mesh position={[-X_OFF, 0, 0]}><sphereGeometry args={[0.06, 16, 16]} /><meshBasicMaterial color={GOLD} /></mesh>
      <mesh position={[ X_OFF, 0, 0]}><sphereGeometry args={[0.06, 16, 16]} /><meshBasicMaterial color={PURPLE} /></mesh>

      {/* 摆 A */}
      <mesh ref={aA1}><cylinderGeometry args={[ROD_R, ROD_R, CYL_H, 32]} /><meshStandardMaterial color={ROD_C} metalness={0.9} roughness={0.12} /></mesh>
      <mesh ref={bA1}><sphereGeometry args={[ballR(1), 48, 48]} /><meshStandardMaterial color={GOLD} metalness={0.25} roughness={0.25} /></mesh>
      <mesh ref={aA2}><cylinderGeometry args={[ROD_R, ROD_R, CYL_H, 32]} /><meshStandardMaterial color={ROD_C} metalness={0.9} roughness={0.12} /></mesh>
      <mesh ref={bA2}><sphereGeometry args={[ballR(1), 48, 48]} /><meshStandardMaterial color={GOLD} metalness={0.25} roughness={0.25} /></mesh>

      {/* 摆 B */}
      <mesh ref={aB1}><cylinderGeometry args={[ROD_R, ROD_R, CYL_H, 32]} /><meshStandardMaterial color={ROD_C} metalness={0.9} roughness={0.12} /></mesh>
      <mesh ref={bB1}><sphereGeometry args={[ballR(1), 48, 48]} /><meshStandardMaterial color={PURPLE} metalness={0.25} roughness={0.25} /></mesh>
      <mesh ref={aB2}><cylinderGeometry args={[ROD_R, ROD_R, CYL_H, 32]} /><meshStandardMaterial color={ROD_C} metalness={0.9} roughness={0.12} /></mesh>
      <mesh ref={bB2}><sphereGeometry args={[ballR(1), 48, 48]} /><meshStandardMaterial color={PURPLE} metalness={0.25} roughness={0.25} /></mesh>

      {/* 尾迹 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={tA as any}><bufferGeometry /><lineBasicMaterial color={GOLD} transparent opacity={0.55} depthTest={false} /></line>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={tB as any}><bufferGeometry /><lineBasicMaterial color={PURPLE} transparent opacity={0.55} depthTest={false} /></line>

      {/* OrbitControls 完全移除——即使 enableRotate=false，组件内部仍注册 Canvas DOM 事件监听器 */}
      {/* <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08}
        enableRotate={false} enableZoom={false} enablePan={false}
        minDistance={2} maxDistance={14} maxPolarAngle={Math.PI} target={[0, -1, 0]} /> */}
    </>
  );
}

function updateSide(xOff: number, s: { x1: number; y1: number; x2: number; y2: number; params: { L1: number; L2: number } }, a1: THREE.Mesh | null, a2: THREE.Mesh | null, b1: THREE.Mesh | null, b2: THREE.Mesh | null) {
  const p1 = new Vector3(s.x1 + xOff, s.y1, 0);
  const p2 = new Vector3(s.x2 + xOff, s.y2, 0);
  const piv = new Vector3(xOff, 0, 0);
  if (b1) b1.position.copy(p1);
  if (b2) b2.position.copy(p2);
  updArm(a1, piv, p1, s.params.L1);
  updArm(a2, p1, p2, s.params.L2);
}

function updArm(m: THREE.Mesh | null, s: Vector3, e: Vector3, len: number) {
  if (!m) return; const d = e.clone().sub(s); const dist = d.length();
  if (dist < 0.001) { m.visible = false; return; }
  m.visible = true; d.normalize();
  m.position.copy(s.clone().add(e).multiplyScalar(0.5));
  m.scale.y = len / CYL_H;
  m.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d));
}

/** 将 trail 点写入预分配 Float32Array，复用 BufferGeometry（避免每帧 dispose 导致 GPU 抖动） */
function updTrailBuf(line: THREE.Line | null, buf: Float32Array, pts: THREE.Vector3[], initGeom: boolean) {
  if (!line || pts.length < 2) { if (line) line.visible = false; return; }
  line.visible = true;
  const count = Math.min(pts.length, buf.length / 3);
  for (let i = 0; i < count; i++) {
    const p = pts[pts.length - count + i]!;
    buf[i * 3] = p.x;
    buf[i * 3 + 1] = p.y;
    buf[i * 3 + 2] = p.z;
  }
  if (initGeom) {
    // 首次：创建 BufferGeometry 并挂载到 line
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(buf.slice(0, count * 3), 3));
    g.setDrawRange(0, count);
    line.geometry.dispose();
    line.geometry = g;
  } else {
    // 后续帧：原地更新缓冲区，仅标记 needsUpdate
    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    if (attr && attr.array instanceof Float32Array && attr.array.length >= count * 3) {
      attr.array.set(buf.subarray(0, count * 3));
      attr.needsUpdate = true;
      (line.geometry as THREE.BufferGeometry).setDrawRange(0, count);
    }
  }
}
