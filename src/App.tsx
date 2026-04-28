import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";
import { ExplorePage } from "@/features/explore";
import { AnalyzeModePage } from "@/features/analyze";
import { DebugPanel } from "@/shared/components/debug";
import { ToastProvider } from "@/features/system/error-handling/components/ToastProvider";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell>
        <ExplorePage />
        <AnalyzeModePage />
        {null}
        {null}
      </AppShell>
      <ToastProvider />
      {import.meta.env.DEV && <DebugPanel />}
    </DeviceProvider>
  );
}
