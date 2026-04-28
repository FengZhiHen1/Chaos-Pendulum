import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { observabilityCoordinator } from "@/shared/lib/observability";
import { useAppStore } from "@/stores/useAppStore";
import App from "./App";
import "./styles/globals.css";

// ── INF-01 可观测性初始化 ──
observabilityCoordinator.init((patch) =>
  useAppStore.getState().updateDebugInfo(patch),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
