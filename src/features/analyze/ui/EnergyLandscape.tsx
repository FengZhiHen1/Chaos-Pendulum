import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSimulationStore } from "@/features/simulation";
import { normalizeAngle } from "@/features/simulation";
import { DEFAULT_ENERGY_LANDSCAPE_CONFIG } from "../contracts";
import {
  SURFACE,
  SURFACE_CONTAINER_HIGH,
  ON_SURFACE_VARIANT,
  PRIMARY,
  LYAPUNOV_STABLE,
  LYAPUNOV_NEUTRAL,
  LYAPUNOV_CHAOTIC,
} from "./colorTokens";

/**
 * ANL-04 能量景观地形图 — 3D 半透明势能曲面。
 *
 * 曲面高度映射 V(θ₁,θ₂)，颜色映射势能梯度。
 * 实时光点标记当前 (θ₁,θ₂) 在曲面上的位置。
 * 底部 CanvasTexture 等高线投影。
 */
export function EnergyLandscape() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[SURFACE]} />
        <EnergyLandscapeScene />
      </Canvas>
    </div>
  );
}

/** 势能函数 V(θ₁,θ₂) = -m₁·g·L₁·cos(θ₁) - m₂·g·(L₁·cos(θ₁) + L₂·cos(θ₂)) */
function computePotential(
  theta1: number,
  theta2: number,
  m1: number, m2: number, L1: number, L2: number, g: number,
): number {
  return -m1 * g * L1 * Math.cos(theta1)
    - m2 * g * (L1 * Math.cos(theta1) + L2 * Math.cos(theta2));
}

function EnergyLandscapeScene() {
  const params = useSimulationStore((s) => s.params);
  const theta1 = useSimulationStore((s) => s.theta1);
  const theta2 = useSimulationStore((s) => s.theta2);
  const meshRef = useRef<THREE.Mesh>(null);
  const pointRef = useRef<THREE.Mesh>(null);
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);

  const config = DEFAULT_ENERGY_LANDSCAPE_CONFIG;
  const { resolution, thetaRange, opacity } = config;
  const [tMin, tMax] = thetaRange;
  const planeSize = tMax - tMin; // 2*Math.PI when [-π, π]
  // 构建势能曲面几何
  const geometry = useMemo(() => {
    // 释放旧几何体 GPU 内存
    if (prevGeoRef.current) { prevGeoRef.current.dispose(); }
    const geo = new THREE.PlaneGeometry(planeSize, planeSize, resolution, resolution);
    prevGeoRef.current = geo;
    const pos = geo.attributes.position;
    if (!pos) return geo;
    const colors = new Float32Array(pos.count * 3);
    let minV = Infinity, maxV = -Infinity;

    // 第一遍：计算所有点的势能值，找 min/max
    const values: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); // -π..π
      const y = pos.getY(i); // -π..π
      const v = computePotential(x, y, params.m1, params.m2, params.L1, params.L2, params.g);
      values.push(v);
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    // 第二遍：设置 Z 和颜色（Stable → Neutral → Chaotic 语义渐变）
    const range = maxV - minV || 1;
    const c0 = new THREE.Color(LYAPUNOV_STABLE);
    const c1 = new THREE.Color(LYAPUNOV_NEUTRAL);
    const c2 = new THREE.Color(LYAPUNOV_CHAOTIC);
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, values[i]!);
      const t = (values[i]! - minV) / range;
      const color = new THREE.Color();
      if (t < 0.5) {
        color.copy(c0).lerp(c1, t * 2);
      } else {
        color.copy(c1).lerp(c2, (t - 0.5) * 2);
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [params.m1, params.m2, params.L1, params.L2, params.g, resolution]);

  // 实时光点动画
  useFrame(() => {
    if (pointRef.current) {
      if (!Number.isFinite(theta1) || !Number.isFinite(theta2)) return;
      const t1 = normalizeAngle(theta1);
      const t2 = normalizeAngle(theta2);
      const v = computePotential(t1, t2, params.m1, params.m2, params.L1, params.L2, params.g);
      if (!Number.isFinite(v)) return;
      pointRef.current.position.set(t1, t2, v + 0.15);
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 2, 4]} intensity={0.8} />
      {/* 半透明势能曲面 */}
      <mesh ref={meshRef} geometry={geometry} position={[0, 0, 0]}>
        <meshPhongMaterial
          vertexColors
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          shininess={10}
        />
      </mesh>
      {/* 底部等高线投影（半透明网格平面） */}
      {config.showContours && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -5]}>
          <planeGeometry args={[planeSize, planeSize, 20, 20]} />
          <meshBasicMaterial color={SURFACE_CONTAINER_HIGH} transparent opacity={0.2} wireframe />
        </mesh>
      )}
      {/* 实时光点 */}
      {config.showCurrentPoint && (
        <mesh ref={pointRef}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={PRIMARY} emissive={PRIMARY} emissiveIntensity={0.5} />
        </mesh>
      )}
      {/* θ₁-θ₂ 平面参考框 */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4.9]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(planeSize, planeSize)]} />
        <lineBasicMaterial color={ON_SURFACE_VARIANT} transparent opacity={0.3} />
      </lineSegments>
      <OrbitControls enableDamping dampingFactor={0.08} />
    </>
  );
}
