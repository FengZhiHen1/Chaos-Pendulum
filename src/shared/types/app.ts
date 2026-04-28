export type AppMode = "explore" | "analyze" | "lab" | "story";

export type DeviceType = "desktop" | "tablet" | "mobile";

export type LoadingState = "loading" | "ready" | "error";

export interface SnapshotMeta {
  id: string;
  timestamp: string;
  label?: string;
  thumbnail: string;
}
