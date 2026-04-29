import { useEffect } from "react";
import { setupSimulationBridge } from "@/features/simulation";

export function useSimulationBridge() {
  useEffect(() => {
    const cleanup = setupSimulationBridge();
    return cleanup;
  }, []);
}
