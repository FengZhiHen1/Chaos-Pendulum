import { useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { AppMode } from "@/shared/domain/valueObjects";

const SHORTCUT_MAP: Record<string, AppMode> = {
  "1": "explore",
  "2": "analyze",
  "3": "lab",
  "4": "story",
};

export function useKeyboardShortcuts() {
  const setMode = useAppStore((s) => s.setMode);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const mode = SHORTCUT_MAP[e.key];
      if (mode) setMode(mode);
    },
    [setMode],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
