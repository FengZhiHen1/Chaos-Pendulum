import { useEffect, useRef, useState, useCallback } from "react";
import type { UseVisibilityChangeOptions, VisibilityState } from "../types";

/**
 * 监听 document.visibilitychange，返回当前可见性状态。
 * 所有后台自动暂停/恢复必须通过此 hook 统一监听。
 */
export function useVisibilityChange(
  options: UseVisibilityChangeOptions = {},
): VisibilityState {
  const { onHidden, onVisible, enabled = true } = options;
  const [isVisible, setIsVisible] = useState<boolean>(
    typeof document !== "undefined"
      ? (document.visibilityState ?? "visible") === "visible"
      : true,
  );
  const [wasHidden, setWasHidden] = useState(false);
  const isMountedRef = useRef(true);

  const handler = useCallback(() => {
    if (!isMountedRef.current) return;

    const visible = (document.visibilityState ?? "visible") === "visible";
    if (!visible) {
      onHidden?.();
      setWasHidden(true);
    } else {
      onVisible?.();
    }
    setIsVisible(visible);
  }, [onHidden, onVisible]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    isMountedRef.current = true;
    document.addEventListener("visibilitychange", handler);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handler);
    };
  }, [enabled, handler]);

  return { isVisible, wasHidden };
}
