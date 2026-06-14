# explore — View 层

## 职责
探索模式的纯表现层——3D 场景渲染、蝴蝶效应双视口、时间反演 UI、控制面板、教学标注。

## 依赖方向
- 可以依赖: ../viewModel/
- 禁止依赖: ../application/、../domain/、../infrastructure/、axios、localStorage 直接操作
- 被依赖方: 路由配置（App.tsx）

## 设计决策
- 组件只负责渲染和用户交互事件转发
- 所有业务数据通过 ViewModel Hook / Presenter 获取
- GUI 视觉状态（`isHovered`、`isFocused`、`scrollY`）放 View 内部
- 禁止 import Domain 实体——通过 viewModel/selectors/ 透传

## 内容清单
### pages/
- `ExplorePage.tsx`: 探索模式主页面（3D 场景 + 侧边栏 + 底部工具栏）

### components/
- `Scene3D.tsx`: Three.js/R3F 双摆 3D 场景
- `ButterflySplit.tsx`: 蝴蝶效应双视口对比
- `ButterflyUI.tsx`: 蝴蝶效应控制面板 + 分离度动画
- `TimeReversal.tsx`: 时间反演控制 + 漂移曲线
- `TimeReversalTrajectory.tsx`: 反转轨迹叠加渲染
- `TrailControls.tsx`: 轨迹长度/样式控制
- `TrailRenderer.tsx`: 轨迹渲染器
- `ChaosIndicator.tsx`: 混沌程度指示器
- `SonificationToggle.tsx`: 声音化开关
- `TeachingAnnotationPopup.tsx`: 教学标注弹窗
- `DriftCurvePanel.tsx`: 漂移曲线面板
- `ExploreStageOverlay.tsx`: 舞台覆盖层
- `ExploreRightPanel.tsx`: 右侧控制面板
- `ExploreBottomToolbar.tsx`: 底部工具栏

### components/scene/（阶段 5 拆分）
- `PendulumGeometry.tsx`: 摆锤几何体
- `StageLighting.tsx`: 舞台光照预设
- `CameraRig.tsx`: 相机动画控制器
