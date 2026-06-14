import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";

export interface UseSceneControllerAPI {
  webglSupported: boolean;
  webglLost: boolean;
  webglLostPermanent: boolean;
  nanToast: boolean;
  paramInvalid: boolean;
  setParamInvalid: (v: boolean) => void;
  handleNanToast: () => void;
  effectiveShowGrid: boolean;
  effectiveEnableShadows: boolean;
  sphereSegments: number;
  cylinderSegments: number;
  onCanvasCreated: (renderer: { domElement: HTMLCanvasElement }) => void;
}

export function useSceneController(
  showGrid: boolean,
  enableShadows: boolean,
): UseSceneControllerAPI {
  const deviceType = useAppStore((s) => s.deviceType);

  const [webglSupported, setWebglSupported] = useState(true);
  const [webglLost, setWebglLost] = useState(false);
  const [webglLostPermanent, setWebglLostPermanent] = useState(false);
  const [paramInvalid, setParamInvalid] = useState(false);
  const [nanToast, setNanToast] = useState(false);

  const webglLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nanToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebGL 支持检测
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    setWebglSupported(!!gl);
  }, []);

  // NaN toast 管理
  const handleNanToast = useCallback(() => {
    setNanToast(true);
    if (nanToastTimerRef.current) clearTimeout(nanToastTimerRef.current);
    nanToastTimerRef.current = setTimeout(() => {
      setNanToast(false);
    }, 5000);
  }, []);

  // WebGL context 事件处理
  const onCanvasCreated = useCallback((renderer: { domElement: HTMLCanvasElement }) => {
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setWebglLost(true);
      setWebglLostPermanent(false);
      console.error("EXP-01: WebGL context lost");
      webglLostTimerRef.current = setTimeout(() => {
        setWebglLostPermanent(true);
      }, 5000);
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      setWebglLost(false);
      setWebglLostPermanent(false);
      if (webglLostTimerRef.current) {
        clearTimeout(webglLostTimerRef.current);
        webglLostTimerRef.current = null;
      }
    });
  }, []);

  // 响应式降级
  const effectiveShowGrid = deviceType === "mobile" ? false : showGrid;
  const effectiveEnableShadows = deviceType !== "desktop" ? false : enableShadows;
  const sphereSegments = deviceType === "desktop" ? 32 : deviceType === "tablet" ? 16 : 8;
  const cylinderSegments = deviceType === "desktop" ? 16 : deviceType === "tablet" ? 8 : 4;

  return {
    webglSupported,
    webglLost,
    webglLostPermanent,
    nanToast,
    paramInvalid,
    setParamInvalid,
    handleNanToast,
    effectiveShowGrid,
    effectiveEnableShadows,
    sphereSegments,
    cylinderSegments,
    onCanvasCreated,
  };
}
