import type { ISchedulerProvider } from "../../contracts/boot-dependencies.contract";
import { getScheduler } from "../worker/scheduler-factory";

export class SchedulerProviderAdapter implements ISchedulerProvider {
  get() {
    return getScheduler();
  }
}
