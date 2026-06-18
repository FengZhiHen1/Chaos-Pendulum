/**
 * PendulumGeometry — 双摆几何体组件。
 *
 * 纯表现层：支点 + 两根摆杆 + 两个摆球 + 预览叠加层。
 * 仅负责渲染，不包含动画逻辑。
 */
import type { Mesh } from "three";

export interface PendulumGeometryProps {
  /** 摆杆段数 */
  cylinderSegments: number;
  /** 球体段数 */
  sphereSegments: number;
  /** 材质类型 */
  pendulumMaterial: "metal" | "wood" | "glass";
  /** 材质颜色 */
  ballColor: string;
  /** 材质配置 */
  materialConfig: { color: string; metalness: number; roughness: number; opacity: number };
  /** 是否显示预览 */
  isPreviewActive: boolean;
  /** 预览 theta1 */
  previewTheta1: number;
  /** 预览 theta2 */
  previewTheta2: number;
  /** 摆杆长度 */
  paramsL1: number;
  /** 摆杆长度 */
  paramsL2: number;
  /** 摆臂 1 ref */
  arm1Ref: React.Ref<Mesh>;
  /** 摆臂 2 ref */
  arm2Ref: React.Ref<Mesh>;
  /** 摆球 1 ref */
  ball1Ref: React.Ref<Mesh>;
  /** 摆球 2 ref */
  ball2Ref: React.Ref<Mesh>;
}

/** 默认圆柱高度 */
const DEFAULT_CYLINDER_HEIGHT = 1.0;
/** 基础杆半径 */
const BASE_RADIUS = 0.02;

export function PendulumGeometry({
  cylinderSegments,
  sphereSegments,
  pendulumMaterial,
  ballColor,
  materialConfig,
  isPreviewActive,
  previewTheta1,
  previewTheta2,
  paramsL1,
  paramsL2,
  arm1Ref,
  arm2Ref,
  ball1Ref,
  ball2Ref,
}: PendulumGeometryProps) {
  const isGlass = pendulumMaterial === "glass";

  const ballMaterial = isGlass ? (
    <meshPhysicalMaterial
      color={ballColor}
      metalness={materialConfig.metalness}
      roughness={materialConfig.roughness}
      transparent
      opacity={materialConfig.opacity}
      transmission={0.9}
    />
  ) : (
    <meshStandardMaterial
      color={ballColor}
      metalness={materialConfig.metalness}
      roughness={materialConfig.roughness}
    />
  );

  return (
    <>
      {/* 固定支点 */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>

      {/* 下摆杆（支点到上摆球） */}
      <mesh ref={arm1Ref}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, DEFAULT_CYLINDER_HEIGHT, cylinderSegments]} />
        <meshStandardMaterial color="#555555" />
      </mesh>

      {/* 上摆杆（上摆球到下摆球） */}
      <mesh ref={arm2Ref}>
        <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, DEFAULT_CYLINDER_HEIGHT, cylinderSegments]} />
        <meshStandardMaterial color="#555555" />
      </mesh>

      {/* 上摆球 */}
      <mesh ref={ball1Ref}>
        <sphereGeometry args={[0.08, sphereSegments, sphereSegments]} />
        {ballMaterial}
      </mesh>

      {/* 下摆球 */}
      <mesh ref={ball2Ref}>
        <sphereGeometry args={[0.08, sphereSegments, sphereSegments]} />
        {ballMaterial}
      </mesh>

      {/* 半透明预览摆 */}
      {isPreviewActive && (() => {
        // 预览摆位置计算——与主摆的 computeDerived 和 updateArm 逻辑一致
        const pvBall1X = paramsL1 * Math.sin(previewTheta1);
        const pvBall1Y = -paramsL1 * Math.cos(previewTheta1);
        const pvBall2X = pvBall1X + paramsL2 * Math.sin(previewTheta2);
        const pvBall2Y = pvBall1Y - paramsL2 * Math.cos(previewTheta2);
        // 杆旋转角：将 CylinderGeometry 的 Y 轴对齐到物理方向 (sinθ, -cosθ)
        const arm1RotZ = previewTheta1 + Math.PI;
        const arm2RotZ = previewTheta2 + Math.PI;
        // 杆中点（与 updateArm 中 start.clone().add(end).multiplyScalar(0.5) 一致）
        const arm1MidX = pvBall1X / 2;
        const arm1MidY = pvBall1Y / 2;
        const arm2MidX = pvBall1X + (pvBall2X - pvBall1X) / 2;
        const arm2MidY = pvBall1Y + (pvBall2Y - pvBall1Y) / 2;
        return (
        <group>
          <mesh position={[arm1MidX, arm1MidY, 0]} rotation={[0, 0, arm1RotZ]}>
            <cylinderGeometry args={[0.015, 0.015, paramsL1, 16]} />
            <meshStandardMaterial color={ballColor} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh position={[arm2MidX, arm2MidY, 0]} rotation={[0, 0, arm2RotZ]}>
            <cylinderGeometry args={[0.015, 0.015, paramsL2, 16]} />
            <meshStandardMaterial color={ballColor} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh position={[pvBall1X, pvBall1Y, 0]}>
            <sphereGeometry args={[0.06, 24, 24]} />
            <meshStandardMaterial color={ballColor} transparent opacity={0.4} depthWrite={false} />
          </mesh>
          <mesh position={[pvBall2X, pvBall2Y, 0]}>
            <sphereGeometry args={[0.06, 24, 24]} />
            <meshStandardMaterial color={ballColor} transparent opacity={0.4} depthWrite={false} />
          </mesh>
        </group>
        );
      })()}
    </>
  );
}
