import type { IPrecomputeBootstrap } from "../../contracts/boot-dependencies.contract";
import { prefetchPrecomputeData } from "@/shared/infrastructure/storage/precomputePrefetch";

export class PrecomputeBootstrapAdapter implements IPrecomputeBootstrap {
  prefetch(): Promise<void> {
    return prefetchPrecomputeData();
  }
}
