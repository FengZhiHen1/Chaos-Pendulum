import { useState, useCallback, useMemo } from "react";
import { useSimulationStore } from "../store";
import type { PhaseVariable } from "../contracts";

export interface UsePhaseSpaceAPI {
  theta: number;
  thetaDot: number;
  thetaStr: string;
  thetaDotStr: string;
  activeVariable: PhaseVariable;
  setActiveVariable: (v: PhaseVariable) => void;
  isRunning: boolean;
}

export function usePhaseSpace(): UsePhaseSpaceAPI {
  const [activeVariable, setActiveVariable] = useState<PhaseVariable>("theta1");

  const theta1 = useSimulationStore((s) => s.theta1);
  const theta1Dot = useSimulationStore((s) => s.theta1Dot);
  const theta2 = useSimulationStore((s) => s.theta2);
  const theta2Dot = useSimulationStore((s) => s.theta2Dot);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const theta = useMemo(
    () => (activeVariable === "theta1" ? theta1 : theta2),
    [activeVariable, theta1, theta2],
  );

  const thetaDot = useMemo(
    () => (activeVariable === "theta1" ? theta1Dot : theta2Dot),
    [activeVariable, theta1Dot, theta2Dot],
  );

  const thetaStr = useMemo(
    () => (isNaN(theta) ? "--" : theta.toFixed(3)),
    [theta],
  );

  const thetaDotStr = useMemo(
    () => (isNaN(thetaDot) ? "--" : thetaDot.toFixed(3)),
    [thetaDot],
  );

  const handleToggle = useCallback((v: PhaseVariable) => {
    setActiveVariable(v);
  }, []);

  return {
    theta,
    thetaDot,
    thetaStr,
    thetaDotStr,
    activeVariable,
    setActiveVariable: handleToggle,
    isRunning,
  };
}
