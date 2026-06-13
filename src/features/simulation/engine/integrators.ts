/** @deprecated 请从 @/features/simulation/domain/services/integrators 导入 */
export {
  integratorStep,
  registerIntegrator,
  getIntegrator,
  RKF45Integrator,
  VelocityVerletIntegrator,
  EulerIntegrator,
} from "../domain/services/integrators";
export type { Integrator } from "../domain/services/integrators";
