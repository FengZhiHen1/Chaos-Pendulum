# Features — 功能模块总览

## 职责
`features/` 是应用的核心功能模块目录。每个 Feature 独立实现五层 Clean Architecture（Domain → Application → ViewModel → View ← Infrastructure），Feature 之间通过 barrel 文件（`index.ts`）进行松耦合通信。

## 依赖方向
- 可以依赖: `shared/` 对应层
- 禁止依赖: 其他 Feature 的内部实现（应通过 barrel 导入）
- 被依赖方: `App.tsx`（路由配置）、`stores/rootStore.ts`（全局状态聚合）

## 设计决策
- Feature-First 架构：每个 Feature 是自包含的功能单元，有自己的 domain/application/viewModel/view/infrastructure
- 跨 Feature 通信用 barrel（`@/features/{name}`）而非直接引用内部文件
- Feature 的状态 slice 通过 Zustand 的 sliced store 模式聚合到 `stores/rootStore.ts`
- 共享内容仅在第二个 Feature 真正需要时提取到 `shared/`

## Feature 清单

| Feature | 职责 | 状态 |
|---------|------|------|
| simulation | 物理仿真引擎——ODE 积分、Worker 通信、参数控制 | 已实现 |
| explore | 混沌现象探索——3D 可视化、蝴蝶效应、时间反演、声音化 | 已实现 |
| analyze | 数据分析——分岔图、Lyapunov 热力图、庞加莱截面、能量景观 | 已实现 |
| lab | 可编程沙盒——Pyodide Python 集成、力分解、代码编辑器 | 已实现 |
| data | 数据管理——快照保存/加载/对比、导出、故事脚本 | 已实现 |
| story | 故事模式——预设演示脚本自动播放 | 已实现 |
| control | 全局控制——导航契约、参数面板契约 | 契约层已定义 |
