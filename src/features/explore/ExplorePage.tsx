import { Scene3D } from "./components/Scene3D";

/**
 * 探索模式根页面。
 *
 * 包含：
 * - EXP-01: 3D 仿真场景（主视觉区）
 * - EXP-02: 运动尾迹渲染（待接入）
 * - EXP-03: 视角控制面板（待接入）
 */
export function ExplorePage() {
  return (
    <div className="w-full h-full relative">
      <Scene3D
        pendulumMaterial="metal"
        environment="dark-lab"
        showGrid
        enableShadows
      />
    </div>
  );
}
