/**
 * @deprecated 启动序列已拆解迁移：
 * - BootManager, LoadingScreen, ErrorScreen → @/features/simulation/ui/
 * - createOdeWorker → @/features/simulation/worker/
 * - 类型 → @/features/simulation/types.boot
 * - precompute-prefetch → @/shared/infrastructure/storage/precomputePrefetch
 * - pyodide-cache → @/features/lab/pyodideCache
 */

// 向后兼容 re-export
export { BootManager } from "@/features/simulation/ui/BootManager";
export { LoadingScreen } from "@/features/simulation/ui/LoadingScreen";
export { ErrorScreen } from "@/features/simulation/ui/ErrorScreen";
export { createOdeWorker, getGlobalWorker, releaseGlobalWorker } from "@/features/simulation/worker/createOdeWorker";
export { prefetchPrecomputeData } from "@/shared/infrastructure/storage/precomputePrefetch";
export {
  getCachedPyodide,
  cachePyodideResource,
  cleanupStalePyodideCache,
  validatePyodideCache,
  downloadPyodideResource,
  checkLocalPyodideFile,
  buildPyodideCdnUrl,
} from "@/features/lab/pyodideCache";
export type { BootConfig, BootPhase, BootProgress, BootError, PyodideCacheEntry } from "@/features/simulation/types.boot";
export { BOOT_PHASE_WEIGHTS, DEFAULT_BOOT_PROGRESS, PYODIDE_VERSION } from "@/features/simulation/types.boot";
