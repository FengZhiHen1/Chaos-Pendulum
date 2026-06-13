/**
 * @deprecated
 * 纯数据加载函数已迁至 → @/shared/infrastructure/storage/precomputeLoader
 * React Hook 已迁至 → @/features/analyze/hooks/usePrecomputeData
 *
 * 此文件仅为向后兼容保留 re-export。
 * 请在新代码中使用上述新路径。
 */

// 纯加载器的 re-export
export {
  loadPrecomputeData,
  clearPrecomputeCache,
} from "../../infrastructure/storage/precomputeLoader";

export type {
  PrecomputeLoadInput,
  PrecomputeLoadResult,
  PrecomputeCacheEntry,
  PrecomputeNoticeHandler,
} from "../../infrastructure/storage/precomputeLoader";
