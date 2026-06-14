/**
 * useSnapshotViewModel — 快照功能的跨介质 UI 状态管理。
 *
 * 封装 SaveSnapshotUseCaseImpl / LoadSnapshotUseCaseImpl / CompareSnapshotsUseCaseImpl，
 * 管理 isLoading / error / snapshots / selectedSnapshot / comparison 等 UI 状态。
 *
 * 依赖方向:
 *   - 可以依赖: ../../application/useCases/、../../contracts/、../../infrastructure/
 *   - 禁止依赖: ../../view/
 *   - 被依赖方: ../../view/components/SnapshotManager
 */

import { useState, useCallback } from "react";
import { SaveSnapshotUseCaseImpl } from "../../application/useCases/SaveSnapshotUseCase";
import { LoadSnapshotUseCaseImpl } from "../../application/useCases/LoadSnapshotUseCase";
import { CompareSnapshotsUseCaseImpl } from "../../application/useCases/CompareSnapshotsUseCase";
import { snapshotRepository } from "../../infrastructure/repositories/snapshotDb";
import { thumbnailGenerator } from "../../infrastructure/storage/thumbnailGenerator";
import type {
  Snapshot,
  SnapshotMeta,
  SnapshotID,
  SnapshotComparison,
  SaveSnapshotInput,
} from "../../contracts";

// ─── 单例 UseCase 实例 ─────────────────────────────

const saveUseCase = new SaveSnapshotUseCaseImpl(snapshotRepository, thumbnailGenerator);
const loadUseCase = new LoadSnapshotUseCaseImpl(snapshotRepository);
const compareUseCase = new CompareSnapshotsUseCaseImpl(snapshotRepository);

// ─── Hook ──────────────────────────────────────────

export interface SnapshotViewModelState {
  /** 快照元数据列表（轻量视图） */
  snapshots: SnapshotMeta[];
  /** 当前选中的快照完整实体 */
  selectedSnapshot: Snapshot | null;
  /** 双快照对比结果 */
  comparison: SnapshotComparison | null;
  /** 是否正在执行保存操作 */
  isSaving: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 最近一次错误 */
  error: Error | null;
}

export interface SnapshotViewModelActions {
  /** 保存当前仿真状态为快照 */
  saveSnapshot: (input: SaveSnapshotInput) => Promise<void>;
  /** 加载指定快照的完整数据 */
  loadSnapshot: (id: SnapshotID) => Promise<void>;
  /** 刷新快照列表 */
  refreshList: () => Promise<void>;
  /** 对比两个快照 */
  compareSnapshots: (idA: SnapshotID, idB: SnapshotID) => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
  /** 清除选中 */
  clearSelection: () => void;
}

export type SnapshotViewModel = SnapshotViewModelState & SnapshotViewModelActions;

export function useSnapshotViewModel(): SnapshotViewModel {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearSelection = useCallback(() => {
    setSelectedSnapshot(null);
    setComparison(null);
  }, []);

  const refreshList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await snapshotRepository.list();
      setSnapshots(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSnapshot = useCallback(async (input: SaveSnapshotInput) => {
    setIsSaving(true);
    setError(null);
    try {
      await saveUseCase.execute(input);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [refreshList]);

  const loadSnapshot = useCallback(async (id: SnapshotID) => {
    setIsLoading(true);
    setError(null);
    try {
      const snapshot = await loadUseCase.execute(id);
      setSelectedSnapshot(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const compareSnapshots = useCallback(async (idA: SnapshotID, idB: SnapshotID) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await compareUseCase.execute(idA, idB);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    snapshots,
    selectedSnapshot,
    comparison,
    isSaving,
    isLoading,
    error,
    saveSnapshot,
    loadSnapshot,
    refreshList,
    compareSnapshots,
    clearError,
    clearSelection,
  };
}
