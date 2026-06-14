import type { IWorkerFactory } from "../../contracts/boot-dependencies.contract";
import { createOdeWorker } from "../worker/createOdeWorker";

export class WorkerFactoryAdapter implements IWorkerFactory {
  create(timeoutMs: number): Promise<Worker> {
    return createOdeWorker(timeoutMs);
  }
}
