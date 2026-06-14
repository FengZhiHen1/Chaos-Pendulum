import { useBootSequence } from "../../viewModel/hooks/useBootSequence";
import { LoadingScreen } from "./LoadingScreen";
import { ErrorScreen } from "./ErrorScreen";
import type { BootConfig } from "@/features/simulation/types.boot";

interface BootManagerProps {
  config?: BootConfig;
  children: React.ReactNode;
}

export function BootManager({ config = {}, children }: BootManagerProps) {
  const {
    bootProgress,
    error,
    transitioning,
    showChildren,
    handleRetry,
    handleOffline,
    mergedConfig,
  } = useBootSequence(config);

  return (
    <>
      {!showChildren && error === null && (
        <LoadingScreen
          progress={bootProgress}
          showQuotes={mergedConfig.showQuotes}
          transitioning={transitioning}
        />
      )}
      {error && (
        <ErrorScreen
          error={error}
          onRetry={handleRetry}
          onOffline={handleOffline}
        />
      )}
      {showChildren && children}
    </>
  );
}
