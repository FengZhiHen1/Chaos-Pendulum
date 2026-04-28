# MVP 实现度差距分析

> **分析日期**：2026-04-28
> **基线提交**：`a339825` feat(inf-01): 落地应用可观测性模块
> **范围标准**：`MVP范围定义.md` — P0+P1 必须 17 模块 + SYS 4 模块 + INF 3 模块，共 24 模块
> **重点关注**：多模块之间的联动与集成完整性

---

## 一、总体评估

| 维度 | 完成 | 部分完成 | 未开始 | 完成率 |
|------|:----:|:--------:|:------:|:------:|
| SIM (5 模块) | 4 | 1 | 0 | 80% |
| EXP (5 模块) | 2 | 2 | 1 | 40% |
| ANL (3 模块) | 1 | 2 | 0 | 33% |
| LAB (0 模块，P2) | — | — | — | N/A |
| STY (1 模块) | 0 | 1 | 0 | 0% |
| SYS (4 模块) | 2 | 2 | 0 | 50% |
| INF (3 模块) | 2 | 1 | 0 | 67% |
| **总计** | **11** | **9** | **1** | **~45%** |

> 注：部分完成 = 模块核心能力存在但缺 UI 组件或完整联动；未开始 = 模块代码完全不存在。

---

## 二、逐模块评估

### SIM-01 双摆物理引擎 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| ODE 求解（RK4/RK45） | ✅ | `integrators.ts` + `derivatives.ts` |
| Web Worker 批量积分 | ✅ | `ode-worker.ts` + `scheduler.ts` |
| Float64Array 池 + Transferable | ✅ | `float64-pool.ts` |
| 能量字段输出（K/V/T） | ✅ | FRAME_STRIDE 14 字段完整 |
| Worker→Store 数据消费 | ✅ | `bridge.ts` → `consumeFrameFromBuffer` |
| Worker 崩溃恢复 | ✅ | `MAX_CRASH_RECOVERY=1` + `useWorkerRecovery` |
| `setDirection` (时间反演) | ✅ | Worker 端完整实现 `_direction` 翻转 |

### SIM-02 参数控制面板 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| ≥8 参数滑块+输入双模式 | ✅ | `ParamPanel` + `ParamSlider` |
| 合法性校验 + 红框拒绝 | ✅ | `validateParam` + `isSceneFrozen` |
| `injectParams`（静默注入） | ✅ | 跳过 `activeField` 编辑中的字段 |
| `applyPreset`（预设应用） | ✅ | `PresetButtons` |
| 跨模块消费接口 | ✅ | ANL-01 热力图点击填充已正确调用 `injectParams` |

### SIM-03 全局导航系统 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 4 模式 Tabs 导航 | ✅ | `GlobalNavBar` + `MODE_REGISTRY` |
| AppShell 条件渲染 | ✅ | 桌面/平板/手机三端布局 |
| 键盘快捷键 1-4 | ✅ | `handleKeyDown` + `SHORTCUT_MAP` |
| Error Boundary | ✅ | `ModeErrorBoundary` |
| **故事模式导航锁定** | ❌ | `setMode` 无故事模式锁定检查——用户可按 `1`/`2`/`3` 在故事播放时强制切出 |
| **故事结束自动退出** | ❌ | 未监听 `storyEnd`/`storyInterrupted` 事件——故事结束/打断后不会自动 `setMode(previousMode)` |
| **导航栏脉冲动画** | ❌ | 故事模式非激活时无 `animate-pulse` 引导 |
| **快速切换防抖** | ❌ | 无 300ms 防抖窗口 |

### SIM-04 能量实时监控 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 能量折线图（Canvas 2D） | ✅ | `EnergyCanvas` + `EnergyMonitorPanel` |
| 动能/势能/总能量三线 | ✅ | D3 `d3-shape` + Canvas 绑定 |
| 漂移百分比 + 阈值告警 | ✅ | `DRIFT_THRESHOLD=0.005` + `driftExceeded` |
| NaN 检测 + 自动暂停 | ✅ | `MAX_NAN_FRAMES=60` → `isSimulationActive=false` |
| LAB-02 消费接口 | ✅ | `energyDrift` / `driftExceeded` 字段可供读取 |

### SIM-05 相空间可视化 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| θ-θ̇ 相平面 Canvas 2D | ✅ | `PhaseSpaceCanvas` + `PhaseSpacePanel` |
| 变量对切换 | ✅ | θ₁-θ̇₁ / θ₂-θ̇₂ |
| 实时+历史轨迹叠加 | ✅ | 半透明历史层 |

### EXP-01 3D 仿真场景 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| R3F + drei 3D 渲染 | ✅ | `Scene3D` 完整实现 |
| 3 种视角预设 | ✅ | side/top/chaos |
| 3 种材质 + 2 种环境 | ✅ | metal/wood/glass + dark-lab/white-teaching |
| 响应式降级 | ✅ | 球体分段 32/16/8 + 阴影开关 |
| **未集成到 App.tsx** | ❌ | `App.tsx` 第 1 个子节点是 `{null}`，而非 `<ExplorePage />` |
| ExplorePage 未包含完整 UI | ❌ | `ExplorePage` 只渲染 `Scene3D`，缺少工具栏、视角控制、尾迹控制、蝴蝶效应开关 |
| 3D 场景工具栏（播放/暂停/重置/反演/蝴蝶） | ❌ | 未实现 |
| 视角预设按钮（Canvas 左上覆盖层） | ❌ | 未实现 |
| WebGL 丢失遮罩 | ❌ | 未渲染 |

### EXP-02 运动尾迹渲染 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| TrailRenderer + useTrailBuffer | ✅ | 组件和 Hook 已实现 |
| **未接入 ExplorePage** | ❌ | `ExplorePage` 未渲染 `<TrailRenderer />` |
| **尾迹持久度选择 UI** | ❌ | 设计中 5 种持久度，但无 UI 控件 |

### EXP-03 声音化引擎 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Web Audio API 引擎 | ✅ | `sonification.ts` — 双振荡器 + 增益 |
| AudioContext 单例 | ✅ | `audio-context.ts` |
| **未接入任何 UI 组件** | ❌ | 无开关按钮、无 `<SonificationToggle />` |
| **未订阅仿真 Store** | ❌ | `createSonificationEngine().update()` 未被任何组件调用 |
| **混沌听觉标记未实现** | ❌ | 白噪声 + 混响"声音碎裂"——规格要求但 `noise-generator.ts` 未被 `sonification.ts` 消费 |
| **和声映射未实现** | ❌ | 规格要求两杆夹角→和声复杂度，当前仅简单 `osc2.frequency = osc1 * (1 + angleBetween/2π)` |

### EXP-04 蝴蝶效应对比器 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 双 Viewport + 双 Worker | ✅ | `ButterflySplit` + `ButterflyScheduler` |
| DeltaPanel + 分离度显示 | ✅ | `ButterflyUI` |
| SeparationAlert（脉冲提示） | ✅ | >90° 触发 |
| 三模式参数调节 | ✅ | synced/a-only/b-only |
| **未集成到 ExplorePage** | ❌ | `ButterflySplit` 存在但探索模式页面未引用 |
| **蝴蝶效应与主仿真的同步** | ❌ | 启动蝴蝶效应时主仿真应暂停/继续，当前无此逻辑 |
| **非桌面端的 A/B 视图切换** | ❌ | 平板/手机端的 A/B toggle 按钮是空的 `onClick={() => {}}` |

### EXP-05 时间反演实验 ❌ 未开始

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Worker setDirection 接口 | ✅ | Worker 侧完整实现 |
| Scheduler setDirection | ✅ | `SimulationScheduler.setDirection()` 存在 |
| **TimeReversal UI 组件** | ❌ | 完全不存在 |
| **反演模式选择（精确/数值）** | ❌ | 未实现 |
| **漂移距离曲线** | ❌ | 未实现 |
| **教学注释气泡** | ❌ | 未实现 |
| **实线/虚线轨迹对比** | ❌ | 未实现 |

### ANL-01 李雅普诺夫指数谱 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Canvas 2D 热力图 | ✅ | D3 发散色阶 + OffscreenCanvas |
| 图层切换（3 种） | ✅ | λ_max / λ_min / energy_curvature |
| 悬浮 Tooltip | ✅ | λ 值 + 参数坐标 + 混沌/稳定标签 |
| 点击填充参数 | ✅ | `ParameterFillDialog` → `injectParams` + `setRunning(true)` |
| 双向联动游标 | ✅ | `useSimulationStore.subscribe` 跟踪参数变化 |
| SYS-03 预计算数据加载 | ✅ | `usePrecomputeData` + IndexedDB 缓存 |
| **点击后未切换到探索模式** | ❌ | 规格要求"点击格点自动将该组参数填充至控制面板**并启动 3D 仿真**"，当前仅填充参数不切换模式 |
| **图例色条** | ❌ | 无垂直色条显示 λ 范围 |
| **十字游标 DOM 渲染** | ⚠️ | 通过 SVG overlay 实现，但未作为独立组件导出 |
| **空数据格点处理** | ✅ | NaN 格点显示为灰色 `#333333` |

### ANL-02 参数空间分岔图 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Canvas 2D 散点图 | ✅ | `BifurcationPlot` |
| 数据加载（SYS-03） | ✅ | JSON fetch + IndexedDB |
| **竖直游标联动仿真参数** | ❌ | 游标拖拽→参数更新的双向联动未可见实现 |
| **框选放大（d3-zoom）** | ❌ | 未可见实现 |
| **当前仿真参数指示线** | ❌ | 未可见实现 |
| **BifurcationDialog 详细视图** | ✅ | `BifurcationDialog` 存在 |

### ANL-03 庞加莱截面 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Canvas 2D 散点图动态生长 | ✅ | 增量绘制 + alpha aging |
| 截面条件编辑 | ✅ | variable / targetValue / direction |
| Worker 穿越检测 | ✅ | `ode-worker.ts` 线性插值 + 符号穿越检测 |
| Bridge 同步条件到 Worker | ✅ | `bridge.ts` `syncPoincareCondition` |
| 当前/历史基线叠加 | ✅ | saveBaseline / clearBaseline |
| 点截断（防止 OOM） | ✅ | >10,000 点 → 截取最近 5,000 |
| 条件切换确认对话框 | ✅ | 有点数据时提示清空 |

### STY-01 故事脚本引擎 ⚠️ 部分完成（实质性未完成）

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| useStoryStore（状态机） | ✅ | play/pause/reset/setStage 框架存在 |
| STORY_SCRIPT（7 阶段数据） | ✅ | 时间/模式/字幕定义完整 |
| **StoryModePage 组件** | ❌ | **完全不存在**——这是最大的缺口 |
| **rAF 时间轴驱动** | ❌ | 无 `performance.now()` + `requestAnimationFrame` 循环 |
| **executeActions 动作执行器** | ❌ | 无——`STORY_SCRIPT` 的 `onEnter`/`onExit` 字段不存在于当前类型定义中 |
| **字幕渲染** | ❌ | 无 `AnimatePresence` 淡入淡出 |
| **脉冲高亮** | ❌ | 无 `HighlightableControl` 组件 |
| **点击打断** | ❌ | 无全屏透明拦截层 |
| **重播按钮** | ❌ | 无 |
| **自动转场** | ❌ | 无阶段切换时的 `setMode`/`setParams`/`setCamera` 调用 |
| **storyEnd/storyInterrupted 事件** | ❌ | 未向 `window` 派发 |
| **storyPhase 导航锁定** | ❌ | `useStoryStore` 无 `storyPhase` 字段供 SIM-03 消费 |

> ⚠️ 故事模式的 `store.ts` 和 `script.ts` 仅定义了数据结构和空状态机，无任何运行时行为。这不等同于"部分实现"——实质上故事模式尚未开始编码。

### SYS-01 响应式布局引擎 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| useDeviceType + ResizeObserver | ✅ | 断点 768/1024/1366/1920 |
| DeviceProvider | ✅ | 写入 `useAppStore.deviceType` |
| AppShell 三端布局 | ✅ | 桌面顶部导航+右侧面板 / 平板手机底部导航 |

### SYS-02 运行时异常处理 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| ToastProvider + notify() | ✅ | 全局 Toast 通知 |
| useAutoPause（后台→暂停仿真） | ✅ | visibilitychange + 恢复提示 |
| useLongRunningDetector | ✅ | >10 分钟自动降级 |
| useWorkerRecovery | ✅ | Worker 崩溃重建 |
| 错误字典（中文翻译） | ✅ | `error-dictionary.ts` |

### SYS-03 预计算数据管线 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| usePrecomputeData | ✅ | fetch + IndexedDB 缓存 + SHA-256 hash 校验 |
| 图层缓存 | ✅ | `useAnalyzeStore.layerCacheStatus` |
| 加载/错误状态 | ✅ | loading/ready/error 三态 |
| 重试机制 | ✅ | `precomputeState.retry()` |

### SYS-04 应用初始化加载 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| LoadingScreen（进度条） | ✅ | 百分比 + 已下载/总量 |
| BootManager | ✅ | 启动流程编排 |
| ErrorScreen（失败降级） | ✅ | 离线重试入口 |
| Worker 注入 | ✅ | `create-ode-worker.ts` → `scheduler.injectWorker` |
| Pyodide 缓存 | ✅ | `pyodide-cache.ts` |

### INF-01 应用可观测性 ✅ 完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| FPS 帧率追踪 | ✅ | `FPSTracker` |
| Worker 耗时记录 | ✅ | `perf-mark.ts` |
| 全局错误捕获 | ✅ | `error-capture.ts` |
| DebugPanel（DEV 可见） | ✅ | `App.tsx` 中条件渲染 |
| Zustand debug store 集成 | ✅ | `updateDebugInfo` |

### INF-02 持续部署管线 ⚠️ 未验证

不在源代码目录中，需检查 `.github/workflows/`。

### INF-03 自动化测试体系 ⚠️ 部分完成

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 物理引擎测试 | ✅ | `engine.test.ts` |
| 能量计算测试 | ✅ | `energy.test.ts` |
| 参数校验测试 | ✅ | `params.test.ts` |
| 相空间测试 | ✅ | `phaseSpace.test.ts` |
| **物理回归测试（三项验证）** | ❌ | 规格要求的自动化验证（小角度<2%/单摆退化/能量漂移<0.5%）未作为独立测试套件 |
| **预计算数据 hash 校验** | ❌ | 未作为独立测试 |
| **E2E 测试** | ❌ | 无 Playwright/Cypress 配置 |

---

## 三、跨模块联动热力分析

这是本次审查的核心关注点。以下是所有模块间联动的实现状态：

### 已实现的关键联动

| # | 连线 | 状态 | 技术路径 |
|---|------|:----:|---------|
| 1 | SIM-01 → SIM-04 能量监控 | ✅ | Worker → `consumeFrameFromBuffer` → `energyDrift`/`driftExceeded` → `EnergyCanvas` |
| 2 | SIM-01 → SIM-05 相空间 | ✅ | Worker → store `theta1/theta2/omega1/omega2` → `PhaseSpaceCanvas` |
| 3 | SIM-01 → EXP-01 3D 场景 | ✅ | Store `state: StateVector` → `Scene3D.useFrame` → Three.js ref 直写 |
| 4 | SIM-02 ↔ ANL-01 热力图点击填充 | ✅ | `handleConfirmFill` → `simInjectParams` + `simSetRunning(true)` |
| 5 | SYS-03 → ANL-01/ANL-02 数据加载 | ✅ | `usePrecomputeData` → `LyapunovHeatmap`/`BifurcationPlot` |
| 6 | ANL-03 ↔ SIM-01 庞加莱穿越检测 | ✅ | `bridge.ts` 双向同步：条件→Worker + Worker→`poincarePoints`→`analyzeStore` |
| 7 | SYS-01 → AppShell 响应式布局 | ✅ | `deviceType` → `isDesktop` 三端切换 |
| 8 | SYS-02 → SIM-01 后台暂停 | ✅ | `useAutoPause` → `visibilitychange` → `store.pause()` |
| 9 | INF-01 → useAppStore 调试面板 | ✅ | `observabilityCoordinator` → `updateDebugInfo` |

### 缺失的关键联动

| # | 连线 | 优先级 | 描述 |
|---|------|:------:|------|
| **A** | **App.tsx → ExplorePage** | 🔴 P0 | `AppShell` 第 1 个子节点是 `{null}`，探索模式不可用 |
| **B** | **STY-01 → SIM-03 导航锁定** | 🔴 P0 | 故事播放时 `setMode` 无锁定检查，用户可按快捷键强制逃脱 |
| **C** | **STY-01 → SIM-03 自动退出** | 🔴 P0 | 故事结束/打断不触发 `storyEnd` 事件 → 导航栏不恢复 |
| **D** | **STY-01 → 所有模式组件** | 🔴 P0 | 故事脚本的 `executeActions` 完全不存在——无法调用 `setMode`/`injectParams`/`setCamera`/`startButterfly` 等 |
| **E** | **EXP-03 → SIM-01 Store** | 🟡 P1 | 声音化引擎未订阅 `kineticEnergy`/`theta2Dot`/`totalEnergy` 等字段 |
| **F** | **EXP-05 → Worker** | 🟡 P1 | `scheduler.setDirection(-1)` 接口存在但无 UI 调用 |
| **G** | **ANL-01 → SIM-03 模式切换** | 🟡 P1 | 点击热力图格点应执行 `setMode("explore")` 切换到 3D 场景 |
| **H** | **EXP-04 → ExplorePage** | 🟡 P1 | 蝴蝶效应分屏组件未在探索模式页面中引用 |
| **I** | **EXP-02 → ExplorePage** | 🟡 P1 | 尾迹渲染组件未在探索模式页面中引用 |
| **J** | **EXP-05 → EXP-01 轨迹叠加** | 🟡 P1 | 时间反演的实线/虚线对比需要 3D 场景支持叠加渲染 |
| **K** | **SYS-04 → App.tsx** | 🟡 P1 | `BootManager`/`LoadingScreen` 存在但未在 `App.tsx` 的渲染流程中接入 |
| **L** | **Lab 模式空白** | 🟢 P2 | `AppShell` 第 3 个子节点是 `{null}`，实验模式页面完全不存在 |
| **M** | **ANL-02 → SIM-02 游标联动** | 🟢 P2 | 分岔图竖直游标拖拽→参数更新的双向联动未实现 |
| **N** | **ANL-04 能量景观** | 🟢 P2 | 完全未实现（设计预期 P2 选做） |
| **O** | **LAB-02 → SIM-01 物理验证** | 🟢 P2 | 三项一键验证的 Worker 调用路径不存在 |

---

## 四、集成风险热点

### 🔴 阻塞级：故事模式（STY-01）缺失

故事模式是 P1 核心差异点，但当前只有**空状态机 store** + **7 阶段数据定义**，缺乏所有运行时行为。缺少的部分包括：

1. **StoryModePage 组件**——任何故事 UI 都不存在
2. **rAF 时间轴**——`performance.now()` + `requestAnimationFrame` 驱动循环
3. **executeActions**——将 `STORY_SCRIPT` 阶段转为实际 Store 调用的调度器
4. **字幕系统**——`framer-motion` 淡入淡出底部字幕条
5. **打断机制**——全屏透明拦截层 + 恢复手动控制
6. **导航锁定/解锁**——`setMode` 的故事锁 + `storyEnd`/`storyInterrupted` 事件

**影响链**：STY-01 缺失 → SIM-03 导航锁定无法测试 → 故事模式演示功能不可用 → 评审关键体验断裂。

### 🔴 阻塞级：ExplorePage 未接入 AppShell

`App.tsx` 第 11 行 `{null}` 意味着当前版本启动后探索模式是**空白页**。而 `ExplorePage` 本身也只是一个仅包含 `Scene3D` 的骨架，缺少工具栏、尾迹、声效开关、蝴蝶效应开关等完整 UI。

**影响链**：用户启动应用 → 看到 3D Canvas（如果加载成功）→ 但无控制面板（控制面板在右侧 aside 中，能量/相空间在下方）→ 关键交互按钮（播放/暂停/时间反演）不存在于 Canvas 上方。

### 🟡 高优先级：Sonification 未连线

`sonification.ts` 引擎已实现但未消费。需要：
- `useSonificationStore`（或通过 `useExploreStore` 管理）
- `SonificationToggle` UI 组件
- `useEffect` 订阅 `useSimulationStore` 的 `kineticEnergy`/`state.theta2Dot`/`totalEnergy` 调用 `engine.update()`
- 混沌听觉标记：当 `isChaotic` 为 true 时混入 `noise-generator.ts` 的白噪声

### 🟡 高优先级：Time Reversal 零 UI 实现

Worker 和 Scheduler 的 `setDirection` 已完全实现，但前端无任何入口：

```
缺少的 UI 链路:
  TimeReversalButton → handleClick → scheduler.setDirection(-1) → Worker 反向积分
  ↑ 按钮的 onClick 不存在
```

此外，反演模式选择（精确反演 vs 数值反演）、漂移距离曲线、教学注释气泡——全部缺失。

### 🟡 中优先级：Lyapunov 热力图点击不切换模式

当前行为：
```
点击格点 → ParameterFillDialog → injectParams + setRunning(true) → 仿真在后台运行
```

规格要求：
```
点击格点 → 填充参数 → setMode("explore") → 用户看到 3D 场景以新参数运行
```

只需在 `handleConfirmFill` 末尾添加 `useAppStore.getState().setMode("explore")` 即可修复。

### 🟢 低优先级：Lab 模式完全空白

Lab 模式在 MVP 中属于 P2 推荐选做，当前不在必须范围内。但 `AppShell` 第 3 个 slot 是 `{null}`，切换过去显示"模式「lab」— 待实现"占位符，用户体验可接受。

---

## 五、代码质量与架构合规性

### 架构优势

1. **Worker 隔离良好**：仿真计算与 React 生命周期完全解耦，模式切换不中断仿真。
2. **Store 粒度合理**：`useSimulationStore`（仿真域）、`useAnalyzeStore`（分析域）、`useExploreStore`（探索域）、`useLabStore`（实验域）、`useAppStore`（应用域）各司其职。
3. **bridge.ts 模式优雅**：Store ↔ Worker 双向同步通过单一桥接模块管理，带防抖和 Poincare 条件同步。
4. **庞加莱截面全链路完整**：从 Worker 穿越检测 → scheduler 回调 → bridge → analyzeStore → Canvas 增量绘制 → UI 基线对比——是项目中实现最完整的跨模块联动。

### 架构风险

1. **Story 脚本与 Store 耦合过重**：`STORY_SCRIPT` 的 `StoryAction` 需要直接调用 8 个不同 Store 的 action。如果动作执行器（`executeActions`）设计不当，会让故事模式成为 God Object。
2. **ButterflySplit 与主仿真的关系不明确**：蝴蝶效应启动时是否暂停主仿真？参数调节时是否需要同步到 `useSimulationStore`？当前两个蝴蝶 Worker 完全独立于主仿真 Worker。
3. **Sonification 缺乏 Store 状态管理**：音频引擎是纯函数，需在 React 中通过 `useEffect` 订阅 Store 驱动。缺少中间层会导致组件代码膨胀。
4. **ExplorePage 即将膨胀**：探索模式需要集成 Scene3D + TrailRenderer + ButterflySplit + TimeReversal + Sonification + 工具栏 + 视角控制——如果全部塞进 `ExplorePage.tsx`，组件将超过 300 行且难以维护。

---

## 六、修复优先级排序

按阻塞程度和投入产出比排列：

| 优先级 | 任务 | 预估工时 | 阻塞什么 |
|:------:|------|:--------:|---------|
| **1** | **App.tsx 接入 ExplorePage** + ExplorePage 补全工具栏 | 0.5 天 | 探索模式完全不可见 |
| **2** | **STY-01 StoryModePage + 时间轴 + executeActions** | 2 天 | 故事模式不可用；导航锁定无法闭环 |
| **3** | **SIM-03 故事模式导航锁定 + 事件监听** | 0.5 天 | 故事模式期间用户可强制逃脱 |
| **4** | **EXP-03 声效开关 + Store 订阅** | 0.5 天 | 声音化功能不可用 |
| **5** | **EXP-05 TimeReversal UI + Worker 联动** | 1 天 | 时间反演功能不可用 |
| **6** | **ANL-01 热力图点击→setMode("explore")** | 0.5 行 | 用户体验不一致 |
| **7** | **EXP-04 蝴蝶效应集成到 ExplorePage** | 0.5 天 | 蝴蝶效应入口不可见 |
| **8** | **SYS-04 LoadingScreen 接入 App.tsx** | 0.5 天 | 首次加载无进度反馈 |
| **9** | **LAB 模式骨架（物理验证套件 P2）** | 1-2 天 | P2 推荐，非阻塞 |
| **10** | **ANL-02 游标联动 + 框选放大** | 0.5 天 | 用户体验不完整 |

**关键路径**：任务 1→2→3 构成最小可演示链路——完成这三项即可进行评审演示。任务 4→8 补全 P1 差异点。任务 9→10 为 P2 增强。

---

## 七、测试覆盖盲区

| 缺失项 | 影响 |
|--------|------|
| 物理回归自动化测试（小角度<2%/单摆退化/能量漂移<0.5%） | 每次改动物理引擎无自动化安全网 |
| 蝴蝶效应分叉逻辑测试 | `butterfly-store.test.ts` 存在但未覆盖 `_updateSide` 分离度计算 |
| 故事模式阶段切换测试 | 无 StoryModePage，无法测试 |
| 时间反演 Worker 测试 | `setDirection` Worker 逻辑无测试 |
| E2E 测试 | 无 Playwright/Cypress，关键用户路径（探索→分析→热力图点击→3D 场景）无自动验收 |
| 预计算数据一致性测试 | 预计算 JSON 的 hash 校验未纳入 CI |

---

*本文档基于 `docs/功能设计/` 下全部 22 份模块规格 + 源码逐文件审查生成。*
