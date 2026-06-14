/**
 * useDriftCalculation — 漂移计算 ViewModel Hook。
 *
 * 封装 Domain 层的 driftCalculator，禁止 View 直接引用 Domain 运行时对象。
 */
import { useCallback, useRef } from "react";
import { driftCalculator } from "../../domain/drift-calculator";
import type { IDriftCalculator } from "../../contracts";

export interface DriftCalculationAPI {
  computeDrift: IDriftCalculator["compute"];
}

const calculatorInstance = driftCalculator;

export function useDriftCalculation(): DriftCalculationAPI {
  const calcRef = useRef(calculatorInstance);

  const computeDrift = useCallback(
    (forwardState: Parameters<IDriftCalculator["compute"]>[0], reversedState: Parameters<IDriftCalculator["compute"]>[1]) =>
      calcRef.current.compute(forwardState, reversedState),
    [],
  );

  return { computeDrift };
}
