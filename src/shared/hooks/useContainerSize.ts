import { useCallback, useEffect, useRef, useState } from "react";
import type { ContainerSize, UseContainerSizeOptions } from "@/shared/types";

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * 容器尺寸监听 Hook。
 * 供 2D Canvas 图表组件（ANL-01~04、SIM-05）和 3D Canvas 父容器使用。
 */
export function useContainerSize(
  options: UseContainerSizeOptions,
): ContainerSize {
  const { ref, debounceMs = DEFAULT_DEBOUNCE_MS, enabled = true } = options;

  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    ready: false,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useCallback(
    (entry: ResizeObserverEntry) => {
      const { width, height } = entry.contentRect ?? {};
      if (width === 0 || height === 0) return;
      if (!document.contains(entry.target)) {
        setSize({ width: 0, height: 0, ready: false });
        return;
      }

      const update = () => {
        setSize({ width, height, ready: true });
      };

      if (debounceMs <= 0) {
        update();
        return;
      }
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        update();
      }, debounceMs);
    },
    [debounceMs],
  );

  useEffect(() => {
    if (!enabled || !ref.current) {
      setSize({ width: 0, height: 0, ready: false });
      return;
    }

    const el = ref.current;

    // 初始测量
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setSize({ width, height, ready: true });
    }

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        handleResize(entry);
      });
      observer.observe(el);

      return () => {
        observer.disconnect();
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      };
    }

    // 降级：window.resize + getBoundingClientRect
    const fallback = () => {
      if (!ref.current) return;
      handleResize({
        contentRect: ref.current.getBoundingClientRect(),
        target: ref.current,
      } as unknown as ResizeObserverEntry);
    };
    window.addEventListener("resize", fallback);

    return () => {
      window.removeEventListener("resize", fallback);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [enabled, ref, handleResize]);

  return size;
}
