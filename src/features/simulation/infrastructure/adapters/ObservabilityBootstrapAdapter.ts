import type { IObservabilityBootstrap } from "../../contracts/boot-dependencies.contract";
import { observabilityCoordinator } from "@/shared/infrastructure/observability/coordinator";

export class ObservabilityBootstrapAdapter implements IObservabilityBootstrap {
  init(
    onDebugUpdate: (patch: Record<string, unknown>) => void,
    onError: (errors: string[]) => void,
  ): void {
    observabilityCoordinator.init(onDebugUpdate, onError);
  }
  updatePyodideProgress(ratio: number): void {
    observabilityCoordinator.updatePyodideProgress(ratio);
  }
}
