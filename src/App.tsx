import { DeviceProvider } from "@/components/DeviceProvider";
import { BootManager } from "@/features/system/init";
import { AppShell } from "@/shared/components/layout/AppShell";
import { ExplorePage } from "@/features/explore";
import { AnalyzeModePage } from "@/features/analyze";
import { LabPage } from "@/features/lab";
import { StoryPage } from "@/features/story/StoryPage";
import { DebugPanel } from "@/shared/components/debug";
import { ToastProvider } from "@/features/system/error-handling/components/ToastProvider";

/**
 * App 根组件。
 *
 * 渲染流程：
 * 1. BootManager 管理启动序列（Worker 注入、Pyodide 预加载、可观测性初始化）
 * 2. 启动中 → LoadingScreen（进度条 + 名言 + ETA）
 * 3. 启动完成 → "进入应用" 按钮 → 平滑过渡到 AppShell
 * 4. AppShell 根据 activeMode 条件渲染对应页面
 */
export default function App() {
  return (
    <DeviceProvider>
      <BootManager
        config={{
          pyodideLoadStrategy: "lazy",
          enablePrecomputePrefetch: true,
          showQuotes: true,
        }}
      >
        <AppShell>
          <ExplorePage />
          <AnalyzeModePage />
          <LabPage />
          <StoryPage />
        </AppShell>
        <ToastProvider />
        {import.meta.env.DEV && <DebugPanel />}
      </BootManager>
    </DeviceProvider>
  );
}
