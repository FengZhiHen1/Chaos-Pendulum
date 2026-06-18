import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useSimulationStore } from "@/features/simulation/store";
import { useLabStore } from "@/features/lab/store";
import { FORCE_STRIDE, ForceField } from "../../viewModel/selectors/physics";

// ─── 常量 ────────────────────────────────────

// 力矢量颜色 —— 与 force-decomposition.contract FORCE_DISPLAY_COLORS 保持一致
const COLORS = {
  gravity: "#4ADE80",
  tension: "#F87171",
  tensionNeg: "#E056A0",
  inertial: "#60A5FA",
} as const;

const SHAFT_R = 0.018;
const HEAD_R = 0.045;
const HEAD_L = 0.08;
const MIN_LEN = 0.15;
const BALL_R = 0.06;
const SURFACE_OFF = 0.02;
const HOVER_R = 0.06;
const Y = new THREE.Vector3(0, 1, 0);
const DASH = 0.04;
const GAP = 0.035;
const CYCLE = DASH + GAP;

type ForceKind = "gravity" | "tension" | "inertial";

interface ArrowMeta {
  key: string;
  idx: 1 | 2;
  kind: ForceKind;
  label: string;
}

const ARROWS: ArrowMeta[] = [
  { key: "Fg1", idx: 1, kind: "gravity", label: "上摆重力 (Fg₁)" },
  { key: "T1", idx: 1, kind: "tension", label: "杆 1 张力 (T₁)" },
  { key: "Fi1_t", idx: 1, kind: "inertial", label: "上摆切向惯性力 (Fi₁_t)" },
  { key: "Fi1_n", idx: 1, kind: "inertial", label: "上摆法向惯性力 (Fi₁_n)" },
  { key: "Fg2", idx: 2, kind: "gravity", label: "下摆重力 (Fg₂)" },
  { key: "T2", idx: 2, kind: "tension", label: "杆 2 张力 (T₂)" },
  { key: "Fi2_t", idx: 2, kind: "inertial", label: "下摆切向惯性力 (Fi₂_t)" },
  { key: "Fi2_n", idx: 2, kind: "inertial", label: "下摆法向惯性力 (Fi₂_n)" },
];

// ─── 共享几何体（预分配，所有箭头复用几何体）─────────

const shaftGeo = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1, 8);
const headGeo = new THREE.ConeGeometry(HEAD_R, HEAD_L, 8);
const hoverGeo = new THREE.CylinderGeometry(HOVER_R, HOVER_R, 1, 8);

// ─── 力方向计算 ──────────────────────────────

function computeDirs(t1: number, t2: number, s1: number, s2: number) {
  return {
    gravity: new THREE.Vector3(0, -1, 0),
    T1: new THREE.Vector3(-Math.sin(t1), Math.cos(t1), 0).normalize(),
    T2: new THREE.Vector3(-Math.sin(t2), Math.cos(t2), 0).normalize(),
    Fi1_t: new THREE.Vector3(Math.cos(t1), Math.sin(t1), 0).multiplyScalar(-s1 || -1).normalize(),
    Fi1_n: new THREE.Vector3(Math.sin(t1), -Math.cos(t1), 0).normalize(),
    Fi2_t: new THREE.Vector3(Math.cos(t2), Math.sin(t2), 0).multiplyScalar(-s2 || -1).normalize(),
    Fi2_n: new THREE.Vector3(Math.sin(t2), -Math.cos(t2), 0).normalize(),
  };
}

// ─── 单箭头组件 ──────────────────────────────

interface SingleArrowProps {
  meta: ArrowMeta;
}

/** 每个箭头实例的材质池最大容量（杆身段 + 箭头） */
const PER_ARROW_POOL_SIZE = 16;

function SingleArrow({ meta }: SingleArrowProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visGroupRef = useRef<THREE.Group>(null);
  const hoverRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // ── 实例级材质池（不与其他箭头共享，避免颜色串扰）──
  const matPoolRef = useRef<THREE.MeshStandardMaterial[] | null>(null);
  const matIdxRef = useRef(0);

  /** 获取实例私有的材质池 */
  function getMatPool(): THREE.MeshStandardMaterial[] {
    if (!matPoolRef.current) {
      matPoolRef.current = Array.from(
        { length: PER_ARROW_POOL_SIZE },
        () => new THREE.MeshStandardMaterial({ depthTest: false }),
      );
    }
    return matPoolRef.current;
  }

  /** 从实例私有池取一个材质 */
  function acquireMaterial(): THREE.MeshStandardMaterial {
    const pool = getMatPool();
    return pool[matIdxRef.current++ % pool.length]!;
  }

  /** 重置实例私有池游标 */
  function resetMatPool(): void { matIdxRef.current = 0; }

  useEffect(() => {
    return () => {
      matPoolRef.current?.forEach((m) => m.dispose());
      matPoolRef.current = null;
    };
  }, []);

  const [tooltipData, setTooltipData] = useState<{
    label: string; magnitude: number; directionDeg: number;
    c1: number; c2: number; c1Label: string; c2Label: string;
  } | null>(null);

  const isDashed = meta.kind === "inertial";

  const handlePointerEnter = useCallback(() => {
    const fd = useLabStore.getState().forceDecomposition;
    if (!fd.lastForceData) return;
    const sim = useSimulationStore.getState();
    const frameIdx = sim.consumedFrameIndex;
    const off = frameIdx * FORCE_STRIDE;
    const f = fd.lastForceData;
    if (off + FORCE_STRIDE > f.length) return;

    let mag = 0, angle = 0;
    const idx = meta.idx;
    if (idx === 1) {
      switch (meta.key) {
        case "Fg1": mag = f[off + ForceField.FG1_MAG]!; angle = f[off + ForceField.FG1_ANGLE]!; break;
        case "T1": mag = f[off + ForceField.T1_MAG]!; angle = f[off + ForceField.T1_ANGLE]!; break;
        case "Fi1_t": mag = f[off + ForceField.FI1_T_MAG]!; angle = f[off + ForceField.FI1_T_ANGLE]!; break;
        case "Fi1_n": mag = f[off + ForceField.FI1_N_MAG]!; angle = f[off + ForceField.FI1_N_ANGLE]!; break;
      }
    } else {
      switch (meta.key) {
        case "Fg2": mag = f[off + ForceField.FG2_MAG]!; angle = f[off + ForceField.FG2_ANGLE]!; break;
        case "T2": mag = f[off + ForceField.T2_MAG]!; angle = f[off + ForceField.T2_ANGLE]!; break;
        case "Fi2_t": mag = f[off + ForceField.FI2_T_MAG]!; angle = f[off + ForceField.FI2_T_ANGLE]!; break;
        case "Fi2_n": mag = f[off + ForceField.FI2_N_MAG]!; angle = f[off + ForceField.FI2_N_ANGLE]!; break;
      }
    }

    const deg = ((angle * 180) / Math.PI);
    // 自然坐标分量
    const theta = meta.idx === 1 ? sim.theta1 : sim.theta2;
    const Fx = mag * Math.cos(angle), Fy = mag * Math.sin(angle);
    const Ft = Fx * Math.cos(theta) + Fy * Math.sin(theta);
    const Fn = Fx * Math.sin(theta) - Fy * Math.cos(theta);

    setTooltipData({
      label: meta.label,
      magnitude: mag,
      directionDeg: deg,
      c1: Ft, c2: Fn,
      c1Label: "Ft", c2Label: "Fn",
    });
    setHovered(true);
    useLabStore.getState().setForceHovered({ forceType: meta.key, massIndex: meta.idx });
  }, [meta]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    setTooltipData(null);
    useLabStore.getState().setForceHovered(null);
  }, []);

  // 每帧更新箭头 + 悬停目标位置
  useFrame(() => {
    const fd = useLabStore.getState().forceDecomposition;
    if (!fd.active || !fd.lastForceData) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    const sim = useSimulationStore.getState();
    const t1 = sim.theta1, t2 = sim.theta2;
    if (isNaN(t1) || isNaN(t2)) return;

    const { L1, L2, m1, m2, g } = sim.params;
    const a1 = sim.alpha1, a2 = sim.alpha2;
    const dirs = computeDirs(t1, t2, Math.sign(a1), Math.sign(a2));
    const f = fd.lastForceData;
    const frameIdx = sim.consumedFrameIndex;
    const o = frameIdx * FORCE_STRIDE;
    if (o + FORCE_STRIDE > f.length) return;

    const b1 = new THREE.Vector3(L1 * Math.sin(t1), -L1 * Math.cos(t1), 0);
    const b2 = new THREE.Vector3(L1 * Math.sin(t1) + L2 * Math.sin(t2), -L1 * Math.cos(t1) - L2 * Math.cos(t2), 0);

    // 力值
    let mag = 0;
    if (meta.idx === 1) {
      switch (meta.key) {
        case "Fg1": mag = f[o + ForceField.FG1_MAG]!; break;
        case "T1": mag = f[o + ForceField.T1_MAG]!; break;
        case "Fi1_t": mag = f[o + ForceField.FI1_T_MAG]!; break;
        case "Fi1_n": mag = f[o + ForceField.FI1_N_MAG]!; break;
      }
    } else {
      switch (meta.key) {
        case "Fg2": mag = f[o + ForceField.FG2_MAG]!; break;
        case "T2": mag = f[o + ForceField.T2_MAG]!; break;
        case "Fi2_t": mag = f[o + ForceField.FI2_T_MAG]!; break;
        case "Fi2_n": mag = f[o + ForceField.FI2_N_MAG]!; break;
      }
    }

    const tMax = Math.max(
      Math.abs(f[o + ForceField.T1_MAG]!), Math.abs(f[o + ForceField.T2_MAG]!), 1,
    );
    const refVal = meta.kind === "gravity" ? (meta.idx === 1 ? m1 : m2) * g
      : meta.kind === "tension" ? tMax
      : (meta.idx === 1 ? m1 * L1 : m2 * L2) || 1;
    const baseScale = meta.kind === "gravity" ? 0.5 : meta.kind === "tension" ? 0.6 : 0.3;
    let rawLen = Math.abs(mag) / refVal * baseScale;
    const isSmall = rawLen < MIN_LEN;
    const finalLen = isSmall ? MIN_LEN : rawLen;
    const opacity = isSmall ? 0.3 : 1;
    const shaftLen = Math.max(finalLen - HEAD_L * 0.6, 0.01);

    const dirKey = meta.key as keyof typeof dirs;
    const dir = (dirs[dirKey] ?? dirs.gravity).clone().normalize();
    const ball = meta.idx === 1 ? b1 : b2;
    const start = ball.clone().add(dir.clone().multiplyScalar(BALL_R + SURFACE_OFF));

    // 颜色
    const isTNeg = meta.key.startsWith("T") && mag < 0;
    const color = meta.kind === "gravity" ? COLORS.gravity
      : meta.kind === "tension" ? (isTNeg ? COLORS.tensionNeg : COLORS.tension)
      : COLORS.inertial;

    const grp = groupRef.current;
    const vis = visGroupRef.current;
    if (!grp || !vis) return;
    grp.visible = true;

    // 清空可见子节点（回收材质池）
    while (vis.children.length > 0) { vis.remove(vis.children[0]!); }
    resetMatPool();

    // 杆身（复用材质池）
    if (isDashed) {
      let pos = 0;
      while (pos < shaftLen) {
        const sl = Math.min(DASH, shaftLen - pos);
        const m = acquireMaterial();
        m.color.set(color); m.transparent = true; m.opacity = opacity;
        const seg = new THREE.Mesh(shaftGeo, m);
        seg.position.copy(start.clone().add(dir.clone().multiplyScalar(pos + sl / 2)));
        seg.quaternion.setFromUnitVectors(Y, dir);
        seg.scale.set(1, sl, 1);
        vis.add(seg);
        pos += CYCLE;
      }
    } else {
      const m = acquireMaterial();
      m.color.set(color); m.transparent = true; m.opacity = opacity;
      const shaft = new THREE.Mesh(shaftGeo, m);
      shaft.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen / 2)));
      shaft.quaternion.setFromUnitVectors(Y, dir);
      shaft.scale.set(1, shaftLen, 1);
      vis.add(shaft);
    }

    // 箭头尖端
    const hm = acquireMaterial();
    hm.color.set(color); hm.transparent = true; hm.opacity = opacity;
    const head = new THREE.Mesh(headGeo, hm);
    head.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen + HEAD_L * 0.4)));
    head.quaternion.setFromUnitVectors(Y, dir);
    vis.add(head);

    // 悬停目标（覆盖整个箭头长度）
    if (hoverRef.current) {
      hoverRef.current.position.copy(start.clone().add(dir.clone().multiplyScalar((shaftLen + HEAD_L) / 2)));
      hoverRef.current.quaternion.setFromUnitVectors(Y, dir);
      hoverRef.current.scale.set(1, shaftLen + HEAD_L, 1);
    }
  });

  const dirDeg = tooltipData?.directionDeg ?? 0;

  return (
    <group ref={groupRef} visible={false}>
      {/* 不可见悬停检测体 */}
      <mesh
        ref={hoverRef}
        geometry={hoverGeo}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* 可见箭头（命令式管理） */}
      <group ref={visGroupRef} />

      {/* Tooltip */}
      {hovered && tooltipData && (
        <Html position={[0, 0.12, 0]} center style={{ pointerEvents: "none" }}>
          <div className="bg-surface-container-high/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
            <div className="font-semibold text-on-surface mb-1">{tooltipData.label}</div>
            <div className="text-on-surface-variant">
              大小：<span className="text-on-surface tabular-nums">{tooltipData.magnitude.toFixed(3)} N</span>
            </div>
            <div className="text-on-surface-variant">
              方向：<span className="text-on-surface tabular-nums">{dirDeg.toFixed(1)}°</span>
            </div>
            <div className="text-on-surface-variant">
              {tooltipData.c1Label}：<span className="text-on-surface tabular-nums">{tooltipData.c1.toFixed(2)} N</span>
              {"  "}
              {tooltipData.c2Label}：<span className="text-on-surface tabular-nums">{tooltipData.c2.toFixed(2)} N</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── 主入口 ──────────────────────────────────

export function ForceArrows3D() {
  const active = useLabStore((s) => s.forceDecomposition.active);

  if (!active) return null;

  return (
    <group>
      {ARROWS.map((meta) => (
        <SingleArrow key={meta.key} meta={meta} />
      ))}
    </group>
  );
}
