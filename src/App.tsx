import { DeviceProvider } from "@/components/DeviceProvider";
import { AppShell } from "@/shared/components/layout/AppShell";

export default function App() {
  return (
    <DeviceProvider>
      <AppShell />
    </DeviceProvider>
  );
}
