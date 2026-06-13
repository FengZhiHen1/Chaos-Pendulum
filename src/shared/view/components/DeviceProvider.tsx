import { type ReactNode } from "react";
import { useDeviceType } from "@/shared/hooks/useDeviceType";

interface DeviceProviderProps {
  children: ReactNode;
}

/**
 * 全局设备类型检测 Provider。
 * 在应用根节点挂载 useDeviceType（全局单例），将检测结果写入 useAppStore。
 * 所有消费模块通过 useAppStore().deviceType 或 useDeviceType() 读取。
 */
export function DeviceProvider({ children }: DeviceProviderProps) {
  useDeviceType();
  return <>{children}</>;
}
