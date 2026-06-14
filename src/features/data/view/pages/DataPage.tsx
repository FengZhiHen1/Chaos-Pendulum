/**
 * DataPage — 数据管理主页面。
 *
 * 整合 5 个子面板：故事播放器、快照管理器、导出面板、历史时间轴、演示模式切换。
 * 页面布局：左侧故事+导出，右侧快照+时间轴，底部演示模式指示器。
 *
 * 边界:
 *   - 依赖: 所有 data ViewModel Hook
 *   - 被依赖: 路由配置 (App.tsx)
 * 禁止: import application/domain/infrastructure
 */

import { useStoryViewModel } from "../../viewModel/hooks/useStoryViewModel";
import { useSnapshotViewModel } from "../../viewModel/hooks/useSnapshotViewModel";
import { useExportViewModel } from "../../viewModel/hooks/useExportViewModel";
import { useDemoModeViewModel } from "../../viewModel/hooks/useDemoModeViewModel";
import { useHistoryPlaybackViewModel } from "../../viewModel/hooks/useHistoryPlaybackViewModel";
import { StoryPlayer } from "../components/StoryPlayer";
import { SnapshotManager } from "../components/SnapshotManager";
import { ExportPanel } from "../components/ExportPanel";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { DemoModeIndicator } from "../components/DemoModeIndicator";
import { useAppStore } from "@/stores/useAppStore";

export function DataPage() {
  const deviceType = useAppStore((s) => s.deviceType);
  const isMobile = deviceType === "mobile";

  // 初始化所有 ViewModel
  const storyVM = useStoryViewModel();
  const snapshotVM = useSnapshotViewModel();
  const exportVM = useExportViewModel();
  const demoVM = useDemoModeViewModel();
  const historyVM = useHistoryPlaybackViewModel();

  // 移动端使用垂直堆叠布局
  if (isMobile) {
    return (
      <div className="min-h-full bg-surface p-4 space-y-4">
        <DemoModeIndicator viewModel={demoVM} />
        <div className="space-y-4">
          <StoryPlayer viewModel={storyVM} />
          <SnapshotManager viewModel={snapshotVM} />
          <ExportPanel viewModel={exportVM} />
          <HistoryTimeline viewModel={historyVM} />
        </div>
      </div>
    );
  }

  // 桌面端使用双栏布局
  return (
    <div className="min-h-full bg-surface p-6">
      <DemoModeIndicator viewModel={demoVM} />

      {/* 页头 */}
      <div className="mb-6">
        <h1 className="text-on-surface text-xl font-semibold tracking-tight">
          演示与数据管理
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          故事脚本 · 演示模式 · 快照 · 导出 · 回放与分叉
        </p>
      </div>

      {/* 双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左栏：故事 + 导出 */}
        <div className="space-y-6">
          <StoryPlayer viewModel={storyVM} />
          <ExportPanel viewModel={exportVM} />
        </div>

        {/* 右栏：快照 + 时间轴 */}
        <div className="space-y-6">
          <SnapshotManager viewModel={snapshotVM} />
          <HistoryTimeline viewModel={historyVM} />
        </div>
      </div>
    </div>
  );
}
