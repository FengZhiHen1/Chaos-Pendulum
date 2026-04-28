import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { DeviceType, DeviceInfo, DegradationRules } from "@/shared/types";

/**
 * 响应式断点阈值（单位：像素）。
 * 与 tailwind.config.ts 的 screens 配置严格同步。
 *
 * ⚠️ 修改此常量时，必须同步修改 tailwind.config.ts 的 screens 字段。
 */
export const BREAKPOINTS = {
  /** 桌面宽敞布局阈值（≥ 1920px）。完整三栏 + 全功能。 */
  DESKTOP_WIDE: 1920,
  /** 桌面紧凑布局阈值（≥ 1366px）。两栏 + 图表标签页切换。 */
  DESKTOP_COMPACT: 1366,
  /** 平板布局阈值（≥ 768px）。单栏 + 底部抽屉面板。 */
  TABLET: 768,
} as const;

const VALID_DEVICE_TYPES: ReadonlySet<string> = new Set<DeviceType>([
  "desktop",
  "tablet",
  "mobile",
]);

const DEBOUNCE_MS = 150;

/**
 * 根据视口宽度计算设备类型（纯函数，可在 Node 环境直接测试）。
 */
export function classifyDevice(width: number): DeviceType {
  if (width >= BREAKPOINTS.DESKTOP_COMPACT) return "desktop";
  if (width >= BREAKPOINTS.TABLET) return "tablet";
  return "mobile";
}

/**
 * 获取当前设备的功能降级规则（纯函数）。
 */
export function getDegradationRules(deviceType: DeviceType): DegradationRules {
  switch (deviceType) {
    case "desktop":
      return {
        enable3DShadows: true,
        maxTrailLength: 1000,
        enableTrail: true,
        enableSonification: true,
        enableCodeEditor: true,
        enablePrecomputedData: true,
        enableAdvancedAnalysis: true,
      };
    case "tablet":
      return {
        enable3DShadows: false,
        maxTrailLength: 200,
        enableTrail: true,
        enableSonification: false,
        enableCodeEditor: true,
        enablePrecomputedData: true,
        enableAdvancedAnalysis: true,
      };
    case "mobile":
      return {
        enable3DShadows: false,
        maxTrailLength: 0,
        enableTrail: false,
        enableSonification: false,
        enableCodeEditor: false,
        enablePrecomputedData: false,
        enableAdvancedAnalysis: false,
      };
  }
}

function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === "string" && VALID_DEVICE_TYPES.has(value);
}

function buildDeviceInfo(
  deviceType: DeviceType,
  width: number,
  height: number,
  dpr: number,
  prefersReducedMotion: boolean,
): DeviceInfo {
  return {
    deviceType,
    isDesktop: deviceType === "desktop",
    isWide: width >= BREAKPOINTS.DESKTOP_WIDE,
    isTablet: deviceType === "tablet",
    isMobile: deviceType === "mobile",
    viewportWidth: width,
    viewportHeight: height,
    dpr,
    prefersReducedMotion,
  };
}

function readViewport(): { width: number; height: number; dpr: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

const SSR_FALLBACK: DeviceInfo = {
  deviceType: "desktop",
  isDesktop: true,
  isWide: true,
  isTablet: false,
  isMobile: false,
  viewportWidth: 1920,
  viewportHeight: 1080,
  dpr: 1,
  prefersReducedMotion: false,
};

/**
 * 全局设备类型检测 Hook。
 * SYS-01 是 useAppStore().deviceType 的唯一生产者。
 */
export function useDeviceType(): DeviceInfo {
  // SSR 安全
  if (typeof window === "undefined") return SSR_FALLBACK;

  const setDeviceType = useAppStore((s) => s.setDeviceType);

  // 初始化：优先从 store 读取，非法则修复
  const [info, setInfo] = useState<DeviceInfo>(() => {
    const stored = useAppStore.getState().deviceType;
    const valid = isDeviceType(stored) ? stored : "desktop";
    if (!isDeviceType(stored)) {
      useAppStore.setState({ deviceType: "desktop" });
    }
    const { width, height, dpr } = readViewport();
    return buildDeviceInfo(valid, width, height, dpr, false);
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceTypeRef = useRef<DeviceType>(info.deviceType);
  const infoRef = useRef(info);
  infoRef.current = info;

  // ResizeObserver 回调
  const handleViewportResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (width === 0) return; // 窗口最小化，不更新 deviceType

      const dpr = window.devicePixelRatio || 1;
      const newType = classifyDevice(width);
      const prevType = deviceTypeRef.current;

      // 实时更新 info（viewportWidth/Height/dpr 不做去抖）
      setInfo((prev) =>
        prev.viewportWidth === width &&
        prev.viewportHeight === height &&
        prev.dpr === dpr
          ? prev
          : { ...prev, viewportWidth: width, viewportHeight: height, dpr },
      );

      // deviceType 变更 → 去抖动写入 store
      if (newType !== prevType) {
        deviceTypeRef.current = newType;
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          setDeviceType(newType);
        }, DEBOUNCE_MS);
      }
    },
    [setDeviceType],
  );

  // ResizeObserver 回退
  const handleResizeFallback = useCallback(() => {
    const { width, height, dpr } = readViewport();
    if (width === 0) return;

    const newType = classifyDevice(width);
    const prevType = deviceTypeRef.current;

    setInfo((prev) =>
      prev.viewportWidth === width &&
      prev.viewportHeight === height &&
      prev.dpr === dpr
        ? prev
        : { ...prev, viewportWidth: width, viewportHeight: height, dpr },
    );

    if (newType !== prevType) {
      deviceTypeRef.current = newType;
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        setDeviceType(newType);
      }, DEBOUNCE_MS);
    }
  }, [setDeviceType]);

  // 主 effect：ResizeObserver + matchMedia
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ResizeObserver on <html>
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleViewportResize);
      observer.observe(document.documentElement);
    } else {
      console.warn(
        "ResizeObserver unavailable, falling back to window.resize",
      );
      window.addEventListener("resize", handleResizeFallback);
    }

    // matchMedia: prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = (e: MediaQueryListEvent | MediaQueryList) => {
      setInfo((prev) =>
        prev.prefersReducedMotion === e.matches
          ? prev
          : { ...prev, prefersReducedMotion: e.matches },
      );
    };
    updateMotion(motionQuery);
    motionQuery.addEventListener("change", updateMotion);

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", handleResizeFallback);
      }
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      motionQuery.removeEventListener("change", updateMotion);
    };
  }, [handleViewportResize, handleResizeFallback]);

  // 同步 store 中的 deviceType 回 info（当 store 被外部合法修改时）
  const storeDeviceType = useAppStore((s) => s.deviceType);
  useEffect(() => {
    if (
      storeDeviceType !== infoRef.current.deviceType &&
      isDeviceType(storeDeviceType)
    ) {
      deviceTypeRef.current = storeDeviceType;
      const { width, height, dpr } = readViewport();
      setInfo(
        buildDeviceInfo(
          storeDeviceType,
          width,
          height,
          dpr,
          infoRef.current.prefersReducedMotion,
        ),
      );
    }
  }, [storeDeviceType]);

  return info;
}
