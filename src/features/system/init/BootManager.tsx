import { useBootSequence } from "../hooks/useBootSequence";
import { LoadingScreen } from "./LoadingScreen";
import { ErrorScreen } from "./ErrorScreen";
import type { BootConfig } from "./types";

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
    handleEnter,
    handleRetry,
    handleOffline,
    mergedConfig,
  } = useBootSequence(config);

  const loadingState = bootProgress.phase === "ready"
    ? "ready"
    : error ? "error" : "loading";

  return (
    <>
      {!showChildren && error === null && (
        <LoadingScreen
          progress={bootProgress}
          showQuotes={mergedConfig.showQuotes}
          onEnter={loadingState === "ready" ? handleEnter : undefined}
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
