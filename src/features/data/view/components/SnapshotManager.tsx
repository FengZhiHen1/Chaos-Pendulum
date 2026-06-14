/**
 * SnapshotManager — 快照管理器。
 *
 * 缩略卡片列表 + 保存按钮 + 双快照参数差异表。
 * 所有数据通过 useSnapshotViewModel 获取。
 *
 * 边界:
 *   - 依赖: useSnapshotViewModel (ViewModel Hook)
 * 禁止: import application/domain/infrastructure
 */

import { useState } from "react";
import type { SnapshotManagerProps } from "../contracts/SnapshotManager.contract";
import type { SnapshotID } from "../../contracts";

/** 快照列表空状态提示 */
const EMPTY_STATE_TEXT = "暂无快照——在探索模式中保存你的第一个混沌发现";

/** 参数差异表中英文标签映射 */
const PARAM_LABELS: Record<string, string> = {
  m1: "上摆质量", m2: "下摆质量",
  L1: "上摆杆长", L2: "下摆杆长",
  g: "重力加速度", damping: "阻尼系数",
  theta1: "θ₁ 初始角", theta1Dot: "ω₁ 初始角速度",
  theta2: "θ₂ 初始角", theta2Dot: "ω₂ 初始角速度",
};

export function SnapshotManager({ viewModel }: SnapshotManagerProps) {
  const {
    snapshots, selectedSnapshot, comparison, isSaving, isLoading, error,
    loadSnapshot, refreshList, compareSnapshots, clearError, clearSelection,
  } = viewModel;

  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<SnapshotID | null>(null);
  const [compareB, setCompareB] = useState<SnapshotID | null>(null);

  const hasError = error !== null;
  const showComparison = comparison !== null;

  /** 处理双快照选择 */
  const handleCompareSelect = (id: SnapshotID) => {
    if (!compareA) { setCompareA(id); return; }
    if (!compareB && id !== compareA) {
      setCompareB(id);
      compareSnapshots(compareA, id);
      setCompareMode(false);
      setCompareA(null);
      setCompareB(null);
    }
  };

  return (
    <div className="rounded-lg bg-surface-container-low p-5 space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="text-on-surface font-semibold text-sm">快照</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshList}
            disabled={isLoading}
            className="rounded-md px-3 py-1.5 text-xs text-on-surface-variant
                       hover:text-on-surface transition-colors bg-surface-container"
          >
            {isLoading ? "刷新中…" : "刷新"}
          </button>
          <button
            type="button"
            onClick={() => setCompareMode(!compareMode)}
            className={`
              rounded-md px-3 py-1.5 text-xs transition-colors
              ${compareMode
                ? "bg-primary-container text-primary"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              }
            `}
          >
            {compareMode ? "取消对比" : "对比快照"}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {hasError && (
        <div className="rounded-md bg-red-900/20 px-3 py-2 flex items-start justify-between">
          <span className="text-xs text-red-300">{error.message}</span>
          <button type="button" onClick={clearError}
            className="text-red-400 hover:text-red-300 text-xs ml-2">✕</button>
        </div>
      )}

      {/* 快照卡片网格 */}
      {snapshots.length === 0 && !isLoading ? (
        <p className="text-on-surface-variant text-xs text-center py-8">
          {EMPTY_STATE_TEXT}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-h-80 overflow-y-auto">
          {snapshots.map((s) => {
            const isSelectedForCompare = compareA === s.id || compareB === s.id;
            const isCurrentSelected = selectedSnapshot?.id === s.id;

            return (
              <button
                key={s.id}
                type="button"
                disabled={isLoading}
                onClick={() => compareMode
                  ? handleCompareSelect(s.id as SnapshotID)
                  : loadSnapshot(s.id as SnapshotID)
                }
                className={`
                  rounded-lg p-3 text-left transition-all duration-150
                  ${isCurrentSelected
                    ? "bg-primary-container ring-1 ring-primary/40"
                    : isSelectedForCompare
                      ? "bg-surface-container-high ring-1 ring-primary/60"
                      : "bg-surface-container hover:bg-surface-container-high hover:shadow-card-hover"
                  }
                `}
              >
                {/* 缩略图 */}
                <div className="w-full aspect-square rounded-md overflow-hidden bg-surface mb-2">
                  <img
                    src={s.thumbnail}
                    alt={`快照 ${s.timestamp}`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 元数据 */}
                <p className="text-on-surface text-xs font-medium truncate">
                  {s.label ?? s.id.slice(0, 8)}
                </p>
                <p className="text-on-surface-variant text-[10px] mt-0.5 font-mono">
                  t={s.simTime.toFixed(1)}s
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* 对比结果面板 */}
      {showComparison && (
        <div className="rounded-lg bg-surface-container p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <h3 className="text-on-surface text-xs font-semibold">参数差异表</h3>
            <button type="button" onClick={clearSelection}
              className="text-on-surface-variant hover:text-on-surface text-xs">✕</button>
          </div>

          <div className="space-y-1">
            {comparison.paramDiffs.filter(d => d.delta !== 0).map((d) => (
              <div key={d.key}
                className="flex items-center justify-between text-xs py-1.5 px-2
                           rounded bg-surface-container-low"
              >
                <span className="text-on-surface-variant">
                  {PARAM_LABELS[d.key] ?? d.key}
                </span>
                <span className="font-mono">
                  <span className="text-on-surface">{d.valueA.toFixed(3)}</span>
                  <span className="text-on-surface-variant mx-1.5">→</span>
                  <span className={d.delta !== 0 ? "text-primary font-medium" : "text-on-surface-variant"}>
                    {d.valueB.toFixed(3)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {comparison.paramDiffs.every(d => d.delta === 0) && (
            <p className="text-on-surface-variant text-xs text-center py-2">
              两个快照参数完全相同
            </p>
          )}
        </div>
      )}

      {/* 保存按钮——由父组件注入具体调用 */}
      <div className="pt-1">
        <span className="text-on-surface-variant text-[10px]">
          {isSaving ? "保存中…" : `已保存 ${snapshots.length} 个快照`}
        </span>
      </div>
    </div>
  );
}
