# explore — ViewModel 层

## 职责
探索模式的跨介质 UI 状态管理——蝴蝶效应状态、时间反演状态、声音化开关、场景预设、轨迹长度。

## 依赖方向
- 可以依赖: ../application/useCases/、../contracts/、../domain/ 类型
- 禁止依赖: ../view/、axios/直接 HTTP 调用
- 被依赖方: ../view/components/、../view/pages/

## 设计决策
- Zustand store slice 聚合到 `stores/rootStore.ts`
- Hooks 包装 Application UseCase，管理 `isLoading` / `error` / `selectedTab` 等跨介质状态
- GUI 视觉状态（`isHovered`、`scrollY`）不放这里，放 View 内部

## 内容清单
### stores/
- `exploreSlice.ts`: 视图预设、轨迹长度、声音化、时间反演状态、混沌检测
- `butterflySlice.ts`: 蝴蝶效应双摆状态、分离度指标、Delta 编辑模式

### hooks/
- `useButterflyMode.ts`: 蝴蝶效应模式 Hook
- `useButterflySimulation.ts`: 蝴蝶效应仿真控制 Hook
- `useChaosIndicator.ts`: 混沌指标读取 Hook
- `useChaosUpdater.ts`: 混沌状态更新 Hook
- `useForceAnalysis.ts`: 力矢量分析 Hook
- `useSceneController.ts`: 3D 场景控制 Hook
- `useSonification.ts`: 物理参数→音频映射 Hook
- `useTrailBuffer.ts`: 轨迹缓冲区管理 Hook

### selectors/
- `domainTypes.ts`: Domain 类型重导出（View 不直接引用 Domain，经此处透传）
