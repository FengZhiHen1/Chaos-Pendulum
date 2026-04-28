import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";
import { AnalyzeModePage } from "@/features/analyze";
import { DebugPanel } from "@/shared/components/debug";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell>
        {null}
        <AnalyzeModePage />
        {null}
        {null}
      </AppShell>
      {import.meta.env.DEV && <DebugPanel />}
    </DeviceProvider>
  );
}
