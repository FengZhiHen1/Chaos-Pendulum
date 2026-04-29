import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useSimulationStore } from "@/features/simulation/store";
import { useLabStore } from "@/features/lab/store";
import { FORCE_STRIDE, ForceField } from "@/shared/types";

// ─── 常量 ────────────────────────────────────

const COLORS = {
  gravity: "#27ae60",
  tension: "#e74c3c",
  tensionNeg: "#e056a0",
  inertial: "#3498db",
} as const;

const SHAFT_R = 0.018;
const HEAD_R = 0.045;
const HEAD_L = 0.08;
const MIN_LEN = 0.15;
const BALL_R = 0.06;
const SURFACE_OFF = 0.02;
const Y = new THREE.Vector3(0, 1, 0);
const DASH = 0.04;
const GAP = 0.035;
const CYCLE = DASH + GAP;

type ForceKind = "gravity" | "tension" | "inertial";

const ARROWS: { key: string; idx: 1 | 2; kind: ForceKind }[] = [
  { key: "Fg1", idx: 1, kind: "gravity" },
  { key: "T1", idx: 1, kind: "tension" },
  { key: "Fi1_t", idx: 1, kind: "inertial" },
  { key: "Fi1_n", idx: 1, kind: "inertial" },
  { key: "Fg2", idx: 2, kind: "gravity" },
  { key: "T2", idx: 2, kind: "tension" },
  { key: "Fi2_t", idx: 2, kind: "inertial" },
  { key: "Fi2_n", idx: 2, kind: "inertial" },
];

// ─── 共享几何体 ──────────────────────────────

const shaftGeo = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1, 8);
const headGeo = new THREE.ConeGeometry(HEAD_R, HEAD_L, 8);

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

// ─── 单箭头入口：全部实例化管理 ─────────────

export function ForceArrows3D() {
  const active = useLabStore((s) => s.forceDecomposition.active);
  const arrowGroups = useRef<Map<string, THREE.Group>>(new Map());

  // 初始化 8 个 Group
  const rootRef = useRef<THREE.Group>(null!);

  // 返回渲染的 JSX（稳定不变的树结构）
  const arrowElements = useMemo(() => {
    if (!active) return null;
    return (
      <group ref={rootRef}>
        {ARROWS.map((a) => (
          <group key={a.key} ref={(el) => { if (el) arrowGroups.current.set(a.key, el); }} />
        ))}
      </group>
    );
  }, [active]);

  // 每帧更新
  useFrame(() => {
    const fd = useLabStore.getState().forceDecomposition;
    if (!fd.active || !fd.lastForceData) return;

    const sim = useSimulationStore.getState();
    const t1 = sim.theta1, t2 = sim.theta2;
    if (isNaN(t1) || isNaN(t2)) return;

    const { L1, L2, m1, m2, g } = sim.params;
    const a1 = sim.alpha1, a2 = sim.alpha2;
    const dirs = computeDirs(t1, t2, Math.sign(a1), Math.sign(a2));
    const f = fd.lastForceData;
    if (f.length < FORCE_STRIDE) return;

    const b1 = new THREE.Vector3(L1 * Math.sin(t1), -L1 * Math.cos(t1), 0);
    const b2 = new THREE.Vector3(L1 * Math.sin(t1) + L2 * Math.sin(t2), -L1 * Math.cos(t1) - L2 * Math.cos(t2), 0);

    // 力值索引
    const vals: Record<string, { mag: number; fieldIdx: number }> = {
      Fg1: { mag: f[ForceField.FG1_MAG]!, fieldIdx: ForceField.FG1_MAG },
      T1: { mag: f[ForceField.T1_MAG]!, fieldIdx: ForceField.T1_MAG },
      Fi1_t: { mag: f[ForceField.FI1_T_MAG]!, fieldIdx: ForceField.FI1_T_MAG },
      Fi1_n: { mag: f[ForceField.FI1_N_MAG]!, fieldIdx: ForceField.FI1_N_MAG },
      Fg2: { mag: f[ForceField.FG2_MAG]!, fieldIdx: ForceField.FG2_MAG },
      T2: { mag: f[ForceField.T2_MAG]!, fieldIdx: ForceField.T2_MAG },
      Fi2_t: { mag: f[ForceField.FI2_T_MAG]!, fieldIdx: ForceField.FI2_T_MAG },
      Fi2_n: { mag: f[ForceField.FI2_N_MAG]!, fieldIdx: ForceField.FI2_N_MAG },
    };

    const tMax = Math.max(Math.abs(vals["T1"]!.mag), Math.abs(vals["T2"]!.mag), 1);

    for (const a of ARROWS) {
      const grp = arrowGroups.current.get(a.key);
      if (!grp) continue;

      const v = vals[a.key]!;
      const ball = a.idx === 1 ? b1 : b2;
      const dirKey = a.key as keyof typeof dirs;
      const dir = dirs[dirKey]?.clone().normalize() ?? dirs.gravity;

      // 缩放
      const refVal = a.kind === "gravity" ? (a.idx === 1 ? m1 : m2) * g
        : a.kind === "tension" ? tMax
        : (a.idx === 1 ? m1 * L1 : m2 * L2) || 1;
      const baseScale = a.kind === "gravity" ? 0.5 : a.kind === "tension" ? 0.6 : 0.3;
      let rawLen = Math.abs(v.mag) / refVal * baseScale;
      const isSmall = rawLen < MIN_LEN;
      const finalLen = isSmall ? MIN_LEN : rawLen;
      const opacity = isSmall ? 0.3 : 1;

      // 颜色
      const isTNeg = a.key.startsWith("T") && v.mag < 0;
      const color = a.kind === "gravity" ? COLORS.gravity
        : a.kind === "tension" ? (isTNeg ? COLORS.tensionNeg : COLORS.tension)
        : COLORS.inertial;
      const dashed = a.kind === "inertial";

      const start = ball.clone().add(dir.clone().multiplyScalar(BALL_R + SURFACE_OFF));
      const shaftLen = Math.max(finalLen - HEAD_L * 0.6, 0.01);

      // 清空旧子节点
      while (grp.children.length > 0) grp.remove(grp.children[0]!);

      // 杆身
      if (dashed) {
        let pos = 0;
        while (pos < shaftLen) {
          const sl = Math.min(DASH, shaftLen - pos);
          const seg = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthTest: false }));
          seg.position.copy(start.clone().add(dir.clone().multiplyScalar(pos + sl / 2)));
          seg.quaternion.setFromUnitVectors(Y, dir);
          seg.scale.set(1, sl, 1);
          grp.add(seg);
          pos += CYCLE;
        }
      } else {
        const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthTest: false }));
        shaft.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen / 2)));
        shaft.quaternion.setFromUnitVectors(Y, dir);
        shaft.scale.set(1, shaftLen, 1);
        grp.add(shaft);
      }

      // 箭头尖端
      const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthTest: false }));
      head.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen + HEAD_L * 0.4)));
      head.quaternion.setFromUnitVectors(Y, dir);
      grp.add(head);
    }
  });

  return arrowElements;
}
