import { useEffect } from "react";

export function useVisibilityChange(onHidden: () => void, onVisible: () => void) {
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        onHidden();
      } else {
        onVisible();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [onHidden, onVisible]);
}
