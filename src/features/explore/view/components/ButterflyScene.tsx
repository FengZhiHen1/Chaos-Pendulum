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
    // OrbitControls 在 Canvas 内异步挂载，用单次 requestAnimationFrame
    // 等待下一帧 ref 就绪后注入适配器，避免 setInterval 轮询的不可靠延迟
    const raf = requestAnimationFrame(() => {
      if (orbitRef.current && !injectedRef.current) {
        globalOrbitControlsAdapter.injectControls(orbitRef.current);
        injectedRef.current = true;
      }
    });
    // 兜底：若 rAF 被跳过，100ms 后再次尝试
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

  // ═══ 暴力验证：useFrame 最小化 ═══
  useFrame(() => {
    const bf = useButterflyStore.getState();
    if (!bf.bfInitialized) return;
    // 不做任何 3D 操作，仅验证是否能进入蝴蝶模式而不卡死
  });

  // ═══ 暴力验证：最简场景，隔离 Three.js 几何体创建 ═══
  return (
    <>
      <ambientLight intensity={0.5} />
      <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08}
        minDistance={2} maxDistance={14} maxPolarAngle={Math.PI} target={[0, -1, 0]} />
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
