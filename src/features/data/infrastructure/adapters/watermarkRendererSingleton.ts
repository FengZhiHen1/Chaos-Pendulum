/**
 * 模块: data.infrastructure.adapters.watermarkRendererSingleton
 * 职责: 全局唯一的水印渲染器实例，供演示模式与 3D 舞台共享。
 *
 * 演示模式 Manager（data 域）控制水印显隐，而水印需要挂载到 3D 舞台的 DOM 容器。
 * 通过单例渲染器，ExplorePage/Scene3D 可在运行时注入容器，Manager 无需感知 React 树结构。
 */

import { WatermarkRendererImpl } from "./WatermarkRendererImpl";

export const globalWatermarkRenderer = new WatermarkRendererImpl("bottom-right");
