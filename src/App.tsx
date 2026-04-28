import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";
import { AnalyzeModePage } from "@/features/analyze";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell>
        {null}
        <AnalyzeModePage />
        {null}
        {null}
      </AppShell>
    </DeviceProvider>
  );
}
