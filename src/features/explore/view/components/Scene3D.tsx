/**
 * Scene3D — 双摆 3D 场景主组件（编排层，175行）。
 *
 * 组装 PendulumGeometry + useSceneAnimation + TrailRenderer + ForceArrows3D。
 * 不包含动画逻辑——委托给 useSceneAnimation hook。
 */
import { useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, SpotLight } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { useSimulationStore } from "@/features/simulation";
import { useTrailBuffer } from "../../viewModel/hooks/useTrailBuffer";
import { useSceneController } from "../../viewModel/hooks/useSceneController";
import { useSceneAnimation } from "../../viewModel/hooks/useSceneAnimation";
import { PendulumGeometry } from "./scene/PendulumGeometry";
import { TrailRenderer } from "./TrailRenderer";
import { useButterflyStore } from "../../store";
import { ForceArrows3D } from "@/features/lab/view/components/ForceArrows3D";
import { ButterflySceneContent } from "./ButterflyScene";
import { globalOrbitControlsAdapter } from "@/features/data/infrastructure/adapters/orbitControlsAdapterSingleton";
import { globalWatermarkRenderer } from "@/features/data/infrastructure/adapters/watermarkRendererSingleton";

export type PendulumMaterialType = "metal";
export type EnvironmentPreset = "dark-lab" | "white-teaching";

export interface Scene3DProps {
  environment?: EnvironmentPreset;
  showGrid?: boolean;
  enableShadows?: boolean;
  className?: string;
  butterflyActive?: boolean;
  butterflySide?: "A" | "B";
  ballColor?: string;
  canvasChildren?: React.ReactNode;
}

const MATERIAL_CONFIGS: Record<PendulumMaterialType, { color: string; metalness: number; roughness: number; opacity: number }> = {
  metal: { color: "#D4D9E0", metalness: 0.95, roughness: 0.12, opacity: 1.0 },
};

const ENVIRONMENT_CONFIGS: Record<EnvironmentPreset, { background: string; ambientIntensity: number; spotIntensity: number; spotPosition: Vector3; gridColor: string }> = {
  "dark-lab": { background: "#1A1D22", ambientIntensity: 0.15, spotIntensity: 8, spotPosition: new Vector3(3, 5, 2), gridColor: "#1a1a2e" },
  "white-teaching": { background: "#EAECEF", ambientIntensity: 1.0, spotIntensity: 0, spotPosition: new Vector3(0, 0, 0), gridColor: "#cccccc" },
};

// ─── Canvas 内子组件 ────────────────────────

interface SCProps {
  environment: EnvironmentPreset;
  enableShadows: boolean;
  showGrid: boolean;
  sphereSegments: number;
  cylinderSegments: number;
  butterflySide?: "A" | "B";
  ballColor?: string;
  onParamChange: (invalid: boolean) => void;
  onNanTrigger: () => void;
}

export function SceneContent({
  environment, enableShadows, showGrid, sphereSegments, cylinderSegments,
  butterflySide, ballColor, onParamChange, onNanTrigger,
}: SCProps) {
  const orbitRef = useRef<any>(null);
  const orbitInjectedRef = useRef(false);
  const { trailPoints, appendPoint, clear: clearTrail } = useTrailBuffer();

  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      if (orbitInjectedRef.current) { clearInterval(id); return; }
      if (orbitRef.current) { globalOrbitControlsAdapter.injectControls(orbitRef.current); orbitInjectedRef.current = true; clearInterval(id); }
      if (++attempts >= 50) clearInterval(id);
    }, 100);

    // 注入相机姿态设置函数（供故事模式使用）
    globalOrbitControlsAdapter.injectSetCamera((azimuth, elevation, distance) => {
      if (!orbitRef.current) return;
      const spherical = new THREE.Spherical(distance, elevation, azimuth);
      const offset = new Vector3().setFromSpherical(spherical);
      const target = orbitRef.current.target as Vector3;
      // 不改变 look-at 目标，仅移动相机
      if (orbitRef.current.object) {
        (orbitRef.current.object as { position: Vector3 }).position.copy(target.clone().add(offset));
        orbitRef.current.update();
      }
    });

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!butterflySide) return;
    let prev = useButterflyStore.getState().trailClearSignal;
    return useButterflyStore.subscribe((s) => {
      if (s.trailClearSignal !== prev) { prev = s.trailClearSignal; clearTrail(); }
    });
  }, [butterflySide, clearTrail]);

  const anim = useSceneAnimation(butterflySide, clearTrail, appendPoint, sphereSegments, cylinderSegments);

  // 信号转发：useSceneAnimation → 父组件
  useEffect(() => { onParamChange(anim.paramInvalidRef.current); });
  useEffect(() => { if (anim.nanToast) onNanTrigger(); }, [anim.nanToast]);

  const envConfig = ENVIRONMENT_CONFIGS[environment];
  const materialConfig = MATERIAL_CONFIGS["metal"];
  const ballMaterialColor = ballColor ?? materialConfig.color;
  const params = useSimulationStore((s) => s.params);
  const isPreviewActive = useSimulationStore((s) => s.isPreviewActive);
  const previewTheta1 = useSimulationStore((s) => s.previewTheta1);
  const previewTheta2 = useSimulationStore((s) => s.previewTheta2);

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
      <PendulumGeometry
        cylinderSegments={cylinderSegments} sphereSegments={sphereSegments}
        ballColor={ballMaterialColor}
        materialConfig={materialConfig} isPreviewActive={isPreviewActive}
        previewTheta1={previewTheta1} previewTheta2={previewTheta2}
        paramsL1={params.L1} paramsL2={params.L2}
        arm1Ref={anim.arm1Ref} arm2Ref={anim.arm2Ref}
        ball1Ref={anim.ball1Ref} ball2Ref={anim.ball2Ref}
      />
      <ForceArrows3D />
      <TrailRenderer points={trailPoints} colorMode="velocity" />
      <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08}
        minDistance={0.5} maxDistance={10} maxPolarAngle={Math.PI} />
    </>
  );
}

// ─── 主组件 ─────────────────────────────────

export function Scene3D({
  environment = "dark-lab", showGrid = true,
  enableShadows = true, className = "w-full h-full", butterflyActive, butterflySide, ballColor, canvasChildren,
}: Scene3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { webglSupported, webglLost, webglLostPermanent, nanToast, paramInvalid,
    setParamInvalid, handleNanToast, effectiveShowGrid, effectiveEnableShadows,
    sphereSegments, cylinderSegments, onCanvasCreated } = useSceneController(showGrid, enableShadows);
  const envConfig = ENVIRONMENT_CONFIGS[environment];

  useEffect(() => { if (stageRef.current) globalWatermarkRenderer.injectContainer(stageRef.current); }, []);

  // 蝴蝶模式：禁用 Canvas 指针事件，阻断 R3F 事件系统 + OrbitControls 监听器
  // 避免点击 Canvas 时主线程死锁（OrbitControls 即使 enabled=false 仍注册 DOM 事件）
  useEffect(() => {
    const canvas = stageRef.current?.querySelector("canvas");
    if (canvas) {
      canvas.style.pointerEvents = butterflyActive ? "none" : "auto";
    }
  }, [butterflyActive]);

  if (!webglSupported) {
    return (
      <div className={`${className} flex items-center justify-center bg-surface text-on-surface`}>
        <div className="text-center p-8 max-w-md">
          <p className="text-lg mb-4">您的浏览器不支持 WebGL 2.0</p>
          <p className="text-sm text-gray-400 mb-6">请使用最新版 Chrome、Firefox 或 Edge</p>
          <div className="flex gap-4 justify-center">
            <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Chrome</a>
            <a href="https://www.mozilla.org/firefox/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Firefox</a>
            <a href="https://www.microsoft.com/edge/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Edge</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={stageRef} className={`relative ${className}`}>
      <Canvas shadows={effectiveEnableShadows} camera={{ fov: 45, position: [3.0, 0.6, 2.2] }}
        frameloop="always" style={{ background: envConfig.background }}
        onCreated={({ gl }) => { if (gl) { gl.shadowMap.type = THREE.PCFShadowMap; onCanvasCreated(gl as unknown as { domElement: HTMLCanvasElement }); } }}>
        {butterflyActive ? (
          <ButterflySceneContent
            environment={environment}
            enableShadows={effectiveEnableShadows}
            showGrid={effectiveShowGrid}
          />
        ) : (
          <SceneContent
            environment={environment}
            enableShadows={effectiveEnableShadows} showGrid={effectiveShowGrid}
            sphereSegments={sphereSegments} cylinderSegments={cylinderSegments}
            butterflySide={butterflySide} ballColor={ballColor}
            onParamChange={setParamInvalid} onNanTrigger={handleNanToast}
          />
        )}
        {canvasChildren}
      </Canvas>
      {paramInvalid && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none z-10">
          <p className="text-sm font-medium text-error">参数异常，请在控制面板中调整</p>
        </div>
      )}
      {webglLost && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto z-10">
          <div className="text-center p-6">
            <p className="text-sm text-on-surface mb-4">
              {webglLostPermanent ? "3D 渲染引擎不可用，请刷新页面" : "3D 渲染引擎暂停 — 正在尝试恢复…"}
            </p>
            {webglLostPermanent && (
              <button type="button" onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-on-primary rounded text-sm font-medium hover:opacity-90">刷新页面</button>
            )}
          </div>
        </div>
      )}
      {nanToast && (
        <div className="absolute bottom-4 right-4 bg-surface-container-low px-4 py-2 rounded text-sm text-on-surface shadow-lg z-10 pointer-events-none">
          检测到数值发散，仿真已暂停。请调整参数后重试
        </div>
      )}
    </div>
  );
}
