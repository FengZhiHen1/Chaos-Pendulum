import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";
import { ExplorePage } from "@/features/explore";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell>
        <ExplorePage />
      </AppShell>
    </DeviceProvider>
  );
}
