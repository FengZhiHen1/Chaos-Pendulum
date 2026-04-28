import { useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { DeviceType } from "@/shared/types";

const breakpoints: { width: number; type: DeviceType }[] = [
  { width: 1366, type: "desktop" },
  { width: 768, type: "tablet" },
  { width: 0, type: "mobile" },
];

function getDeviceType(width: number): DeviceType {
  for (const bp of breakpoints) {
    if (width >= bp.width) return bp.type;
  }
  return "mobile";
}

export function useDeviceType() {
  const setDeviceType = useAppStore((s) => s.setDeviceType);

  useEffect(() => {
    const handler = () => setDeviceType(getDeviceType(window.innerWidth));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [setDeviceType]);
}
