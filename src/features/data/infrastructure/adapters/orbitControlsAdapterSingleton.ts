/**
 * 模块: data.infrastructure.adapters.orbitControlsAdapterSingleton
 * 职责: 全局唯一的 OrbitControlsAdapter 实例，供演示模式与 3D 舞台共享。
 *
 * 演示模式 Manager（data 域）需要操作 Three.js OrbitControls 的 autoRotate，
 * 而实际 OrbitControls 实例在 explore/Scene3D 中创建。通过单例适配器，
 * 双方在运行时将同一端口对象注入，避免跨层直接依赖 Three.js 实例。
 */

import { OrbitControlsAdapter } from "./OrbitControlsAdapter";

export const globalOrbitControlsAdapter = new OrbitControlsAdapter();
