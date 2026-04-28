import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import { markToastProviderMounted } from "../notify";

/**
 * Toast Provider：挂载 Sonner Toaster，并注册 notify() 模块级函数。
 * 在应用顶层（App.tsx）渲染一次。
 */
export function ToastProvider(): JSX.Element {
  const deviceType = useAppStore((s) => s.deviceType);

  const position = deviceType === "desktop" ? "top-right" : "top-center";
  const visibleToasts =
    deviceType === "desktop" ? 5 : deviceType === "tablet" ? 3 : 2;

  useEffect(() => {
    markToastProviderMounted();
  }, []);

  return (
    <Toaster
      position={position}
      visibleToasts={visibleToasts}
      gap={8}
      closeButton
      toastOptions={{
        style: {
          zIndex: 9999,
        },
      }}
      style={{
        zIndex: 9999,
      }}
    />
  );
}
