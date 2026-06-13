import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSimulationStore } from "@/features/simulation";
import { normalizeAngle } from "@/features/simulation";
import { DEFAULT_ENERGY_LANDSCAPE_CONFIG } from "../contracts";

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

  const config = DEFAULT_ENERGY_LANDSCAPE_CONFIG;
  const { resolution, opacity } = config;

  // 构建势能曲面几何
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2 * Math.PI, 2 * Math.PI, resolution, resolution);
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

    // 第二遍：设置 Z 和颜色
    const range = maxV - minV || 1;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, values[i]!);
      const t = (values[i]! - minV) / range;
      // 蓝色(低势能) → 青 → 橙 → 红(高势能)
      const color = new THREE.Color();
      color.setHSL(0.6 - t * 0.55, 0.8, 0.3 + t * 0.4);
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
      const t1 = normalizeAngle(theta1);
      const t2 = normalizeAngle(theta2);
      const v = computePotential(t1, t2, params.m1, params.m2, params.L1, params.L2, params.g);
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
          <planeGeometry args={[2 * Math.PI, 2 * Math.PI, 20, 20]} />
          <meshBasicMaterial color="#334155" transparent opacity={0.15} wireframe />
        </mesh>
      )}
      {/* 实时光点 */}
      {config.showCurrentPoint && (
        <mesh ref={pointRef}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={0.5} />
        </mesh>
      )}
      {/* θ₁-θ₂ 平面参考框 */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4.9]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2 * Math.PI, 2 * Math.PI)]} />
        <lineBasicMaterial color="#64748b" transparent opacity={0.3} />
      </lineSegments>
      <OrbitControls enableDamping dampingFactor={0.08} />
    </>
  );
}
