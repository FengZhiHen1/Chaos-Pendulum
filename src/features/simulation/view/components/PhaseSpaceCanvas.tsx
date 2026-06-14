import { usePhaseSpaceCanvasRendering } from "../../viewModel/hooks/usePhaseSpaceCanvasRendering";
import type { PhaseSpaceCanvasProps } from "./PhaseSpaceCanvasUtils";

// 重新导出，保持向后兼容
export type { PhaseVariable } from "./PhaseSpaceCanvasUtils";
export { exportPhaseSpaceImage } from "./PhaseSpaceCanvasUtils";

export function PhaseSpaceCanvas(props: PhaseSpaceCanvasProps) {
  const { width, height } = props;
  const canvasRef = usePhaseSpaceCanvasRendering(props);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
