// ─── 类型 ──────────────────────────────────────

export interface EnergyDataPoint {
  t: number;
  K: number;
  V: number;
  E: number;
}

export interface EnergyCanvasProps {
  width: number;
  height: number;
  timeWindow: number;
  showComponents: boolean;
}

// ─── 常量 ──────────────────────────────────────

export const ENERGY_MARGIN = { top: 20, right: 80, bottom: 30, left: 60 };
export const IDLE_FPS = 2;
export const IDLE_INTERVAL = 1000 / IDLE_FPS;
export const ENERGY_COLORS = {
  E: "#4ADE80",
  K: "#4B9FFF",
  V: "#F97316",
  grid: "rgba(255, 255, 255, 0.04)",
  gridMajor: "rgba(255, 255, 255, 0.10)",
  axis: "#9BA0AA",
  axisLabel: "#9BA0AA",
  legend: "#E8EAED",
  bg: "#1E2127",
  zeroLine: "rgba(255, 255, 255, 0.12)",
};
export const ENERGY_FONT = '11px "JetBrains Mono", "Manrope", sans-serif';
