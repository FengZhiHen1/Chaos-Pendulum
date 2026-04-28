import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";
import { AnalyzeModePage } from "@/features/analyze";
import { DebugPanel } from "@/shared/components/debug";
import { ToastProvider } from "@/features/system/error-handling/components/ToastProvider";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell>
        {null}
        <AnalyzeModePage />
        {null}
        {null}
      </AppShell>
      <ToastProvider />
      {import.meta.env.DEV && <DebugPanel />}
    </DeviceProvider>
  );
}
