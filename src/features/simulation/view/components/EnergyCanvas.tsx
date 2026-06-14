import { useEnergyCanvasRendering } from "../../viewModel/hooks/useEnergyCanvasRendering";
import type { EnergyCanvasProps } from "./EnergyCanvasUtils";

// 重新导出，保持向后兼容
export type { EnergyDataPoint } from "./EnergyCanvasUtils";

export function EnergyCanvas(props: EnergyCanvasProps) {
  const { width, height } = props;
  const canvasRef = useEnergyCanvasRendering(props);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
