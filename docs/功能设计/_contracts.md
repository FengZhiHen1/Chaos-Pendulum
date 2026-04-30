# 模块接口契约索引

> 本文件为 `docs/功能设计/` 下所有功能规格文档的接口契约摘要索引。每条约 8 行，仅提取接口表面信息（输入/输出类型签名、状态机摘要、模块依赖、外部依赖、技术栈绑定），完整定义见各模块独立规格文档。
>
> **更新规则**：新模块规格生成后必须同步增/改本索引条目；已存在同编号条目则替换。更新时间通过 `get_timestamp.py` 脚本获取。

---

## SIM-01 — 双摆物理引擎
- **输入**: `WorkerInitCommand {params: PendulumParams, initialConditions, method} | WorkerStepCommand {buffer: Float64Array} | WorkerUpdateParamsCommand | WorkerResetCommand | WorkerSetMethodCommand | WorkerSetDirectionCommand | WorkerPauseCommand | WorkerResumeCommand`
- **输出**: `WorkerBatchReadyResponse {buffer: Float64Array, frameCount, simTime, ...} | WorkerErrorResponse {code, message}`
- **状态机**: 无（纯计算 Worker，状态由主线程驱动）
- **模块依赖**: 无（系统最底层计算依赖）
- **外部依赖**: Web Worker API, `Float64Array` Transferable 池 (10×4000, ~320KB), `RingBuffer<StateVector>` (容量 6000)
- **技术栈**: TypeScript 5.x, 自实现 RKF45 + VelocityVerlet + Euler (纯 JS, <250 行), 原生 postMessage
- **更新时间**: `2026-04-30 19:48:09`

## SIM-02 — 参数控制面板
- **输入**: `PendulumParams {m1, m2, L1, L2, g, damping}`, `InitialConditions {theta1, theta1Dot, theta2, theta2Dot}`, `IntegratorMethod = "RKF45" | "VelocityVerlet" | "Euler"`, `ParamPreset {id, label, params, initialConditions, method}`
- **输出**: `useSimulationStore` 写入 (params/initialConditions/method/isRunning), Worker bridge 命令 (updateParams/reset/setMethod/setDirection)
- **状态机**: 无
- **模块依赖**: SIM-01 (Worker 命令协议), SYS-01 (deviceType)
- **外部依赖**: zustand 4.5, shadcn/ui (Slider/Input/Select/Tabs/Tooltip/Button/Label/Badge), lucide-react
- **技术栈**: react 18.3, zustand 4.5, tailwindcss 3.4, shadcn/ui, TypeScript 5.x
- **更新时间**: `2026-04-30 19:48:09`

## SIM-03 — 全局导航系统
- **输入**: `AppMode = "explore" | "analyze" | "lab" | "story"`, `ModeDefinition {id, label, shortLabel, iconName, shortcut, tooltip}`, `StoryPhase` (故事模式锁定/解锁)
- **输出**: `useAppStore` 写入 (activeMode, previousMode), AppShell 条件渲染
- **状态机**: 无（简单模式切换，故事模式期间有锁定检查）
- **模块依赖**: SYS-01 (deviceType → 导航栏布局), SIM-01 (不干预 Worker 运行)
- **外部依赖**: zustand 4.5, shadcn/ui (Tabs/Tooltip), lucide-react (Compass/BarChart3/FlaskConical/Play)
- **技术栈**: react 18.3, zustand 4.5, tailwindcss 3.4, shadcn/ui
- **更新时间**: `2026-04-30 19:48:09`

## SIM-04 — 能量实时监控
- **输入**: `kineticEnergy, potentialEnergy, totalEnergy` (from useSimulationStore, flat fields); `PendulumParams.damping`
- **输出**: Canvas 2D 折线图渲染, `energyDrift: number`, `driftExceeded: boolean` (阈值 0.5%/1000s)
- **状态机**: 无
- **模块依赖**: SIM-01 (能量字段消费, RingBuffer 模式)
- **外部依赖**: d3-scale 4.x, d3-shape 3.x, d3-axis 3.x, d3-selection 3.x (D3 7.x), Canvas 2D API
- **技术栈**: react 18.3, D3 7.x (Canvas), zustand 4.5, tailwindcss 3.4, shadcn/ui (Card/Badge/Tooltip)
- **更新时间**: `2026-04-30 19:48:09`

## SIM-05 — 相空间可视化
- **输入**: `PhaseVariable = "theta1" | "theta2"`, `PhaseSpaceProps {width?, height?, ...}`, `theta1/theta1Dot/theta2/theta2Dot` (from useSimulationStore)
- **输出**: Canvas 2D 相平面轨迹渲染, `exportPhaseSpaceImage(scale: number): string` (Data URL)
- **状态机**: 无
- **模块依赖**: SIM-01 (状态字段消费)
- **外部依赖**: d3-scale 4.x, d3-shape 3.x, d3-axis 3.x, d3-selection 3.x (D3 7.x), Canvas 2D API
- **技术栈**: react 18.3, D3 7.x (Canvas), zustand 4.5, tailwindcss 3.4, shadcn/ui (Card/Toggle/Select/Tooltip)
- **更新时间**: `2026-04-30 19:48:09`

## EXP-01 — 3D 仿真场景
- **输入**: `Scene3DProps {pendulumMaterial: "metal"|"wood"|"glass", environment: "dark-lab"|"white-teaching", enableShadows?, qualityLevel?}`, `StateVector` (from useSimulationStore), `viewPreset` (from useExploreStore)
- **输出**: R3F 3D 渲染 (双摆几何体 + 环境 + 光照), `deviceType` → 渲染降级
- **状态机**: 无
- **模块依赖**: SIM-01 (StateVector 消费), SIM-02 (PhysicsParams 消费), EXP-02 (尾迹渲染), SYS-01 (deviceType)
- **外部依赖**: @react-three/fiber 8.17, @react-three/drei 9.114, three 0.184
- **技术栈**: react 18.3, R3F 8.17, drei 9.114, three 0.184, zustand 4.5
- **更新时间**: `2026-04-30 19:48:09`

## EXP-02 — 运动尾迹渲染
- **输入**: `TrailPoint {position: Vector3, velocity: number}`, `TrailPersistence` (50|200|1000|0=无限|-1=仅当前周期), `StateVector` (from useSimulationStore)
- **输出**: R3F BufferGeometry 三角形带尾迹渲染 (vertexColors + round cap), `setGhostTrail(points)`
- **状态机**: 无
- **模块依赖**: SIM-01 (StateVector 消费), EXP-01 (在 Canvas 内渲染), EXP-04 (双尾迹支持), SYS-01 (deviceType)
- **外部依赖**: @react-three/fiber 8.17, three 0.184, RingBuffer<T> (from src/features/data)
- **技术栈**: react 18.3, R3F 8.17, three 0.184, zustand 4.5
- **更新时间**: `2026-04-30 19:48:09`

## EXP-03 — 声音化引擎
- **输入**: `StateVector {omega2, theta2, theta1}`, `EnergySnapshot {kinetic, total}` (from useSimulationStore), `sonificationEnabled` (from useExploreStore)
- **输出**: Web Audio API 音频流 (OscillatorNode 音高/和声 + GainNode 音色 + ConvolverNode/白噪声 混沌标记)
- **状态机**: 无（AudioContext 需用户手势激活）
- **模块依赖**: SIM-01 (物理状态消费), EXP-01 (同页面共存), SYS-01 (平板/手机关闭)
- **外部依赖**: Web Audio API (AudioContext/OscillatorNode/GainNode/BiquadFilterNode/ConvolverNode/AudioBufferSourceNode), zustand 4.5
- **技术栈**: react 18.3, Web Audio API (原生), zustand 4.5
- **更新时间**: `2026-04-30 19:48:09`

## EXP-04 — 蝴蝶效应对比器
- **输入**: `butterflyDelta: number` (δ=10⁻⁶°), `ButterflySimStore` (双 Worker 实例 + 双 StateVector), `separationState` (派生 |Δθ|)
- **输出**: 双 Scene3D Viewport 渲染 (金色 A / 紫色 B), SeparationAlert 脉冲提示 (>90°)
- **状态机**: 无（双 Worker 同步控制通过 syncControlBus）
- **模块依赖**: SIM-01 (双 Worker 实例), EXP-01 (Scene3D 复用), EXP-02 (双尾迹), EXP-03 (分离警报混入噪声), SYS-01 (分屏布局)
- **外部依赖**: @react-three/fiber 8.17, three 0.184, Web Workers (原生)
- **技术栈**: react 18.3, R3F 8.17, zustand 4.5, tailwindcss 3.4, CSS @keyframes
- **更新时间**: `2026-04-30 19:48:09`

## EXP-05 — 时间反演实验
- **输入**: `timeReversalMode: "exact" | "numerical"`, `timeReversalActive: boolean`, `timeReversalStartTime: number`, `RingBuffer<StateVector>` (正向轨迹历史)
- **输出**: 反演轨迹 (实线), 正向历史轨迹 (虚线叠加), 漂移距离曲线 (Canvas 2D)
- **状态机**: IDLE → REVERSING → COMPLETED | PAUSED
- **模块依赖**: SIM-01 (Worker setDirection(-1), RingBuffer 消费), EXP-01 (Scene3D 复用), EXP-02 (TrailRenderer 叠加), SYS-01 (漂移面板折叠)
- **外部依赖**: d3-scale 4.x, d3-shape 3.x, Canvas 2D API, Web Workers, RingBuffer<T>
- **技术栈**: react 18.3, zustand 4.5, R3F 8.17, D3 7.x (Canvas)
- **更新时间**: `2026-04-30 19:48:09`

## ANL-01 — 李雅普诺夫指数谱
- **输入**: `LyapunovGrid {metadata: {solverVersion, generatedAt, gridHash, paramRanges, gridSize}, grid: number[][]}`, `layerType: "lambda_max" | "lambda_min" | "energy_curvature"`
- **输出**: Canvas 2D 热力图 (d3-scale-chromatic 色阶), `ParameterFillDialog` → SIM-02 `injectParams` + `setRunning(true)`, 双向联动游标
- **状态机**: 无
- **模块依赖**: SYS-03 (预计算数据加载 + IndexedDB 缓存), SIM-02 (参数填充)
- **外部依赖**: d3-scale 4.x, d3-scale-chromatic 3.x, d3-zoom 3.x, d3-selection 3.x, IndexedDB, Web Crypto API (SHA-256)
- **技术栈**: react 18.3, D3 7.x (Canvas), zustand 4.5, shadcn/ui (Tabs/Tooltip/Skeleton/Dialog)
- **更新时间**: `2026-04-30 19:48:09`

## ANL-02 — 参数空间分岔图
- **输入**: `BifurcationData {metadata, samples: number[][]}`, 扫描控制参数选择
- **输出**: Canvas 2D 散点图 (d3-zoom 框选), `BifurcationDialog` → SIM-02 `injectParams`, 竖直游标联动
- **状态机**: 无
- **模块依赖**: SYS-03 (预计算数据加载), SIM-02 (参数填充)
- **外部依赖**: d3-scale 4.x, d3-zoom 3.x, d3-selection 3.x, IndexedDB, Web Crypto API
- **技术栈**: react 18.3, D3 7.x (Canvas), zustand 4.5, shadcn/ui (Dialog/Tooltip)
- **更新时间**: `2026-04-30 19:48:09`

## ANL-03 — 庞加莱截面
- **输入**: `PoincareCondition {variable: "theta1"|"theta2"|"theta1Dot"|"theta2Dot", targetValue: number, direction: "positive"|"negative"|"both"}`, Worker 实时状态流
- **输出**: Canvas 2D 增量散点图 (动态生长 + alpha aging), `PoincareState` (points/baseline/status)
- **状态机**: IDLE → COLLECTING → PAUSED; 点截断 >10000 → 保留最近 5000
- **模块依赖**: SIM-01 (Worker RK45 穿越检测 + bridge 双向同步), SIM-02 (截面条件参数读取)
- **外部依赖**: D3.js (Canvas 2D), Web Worker (RK45 + 线性插值)
- **技术栈**: react 18.3, D3 7.x (Canvas), Canvas 2D API, zustand 4.5
- **更新时间**: `2026-04-30 19:48:09`

## ANL-04 — 能量景观地形图
- **输入**: `(theta1, theta2)` (from useSimulationStore), `PendulumParams` (用于曲面公式计算 V(θ₁,θ₂))
- **输出**: R3F 3D 半透明曲面 + 实时光点 + 等高线投影 (CanvasTexture)
- **状态机**: 无
- **模块依赖**: SIM-01 (实时角度定位), SIM-02 (参数→曲面重建)
- **外部依赖**: @react-three/fiber 8.17, @react-three/drei 9.114, three 0.184, d3-contour
- **技术栈**: react 18.3, R3F 8.17, drei 9.114, three 0.184, zustand 4.5
- **更新时间**: `2026-04-30 19:48:09`

## LAB-01 — 受力拆解视图
- **输入**: StateVector + force components (from Worker 扩展协议), `coordinateSystem: "cartesian" | "polar" | "natural"`
- **输出**: R3F Arrow 力矢量叠加 (绿色重力/红色张力/蓝色虚线惯性力), React 分量分解表格
- **状态机**: 无
- **模块依赖**: SIM-01 (Worker 力分量输出), EXP-01 (共享 R3F Canvas)
- **外部依赖**: @react-three/fiber 8.17, three 0.184, @react-three/drei 9.114 (Arrow)
- **技术栈**: react 18.3, R3F 8.17, drei 9.114, zustand 4.5, shadcn/ui
- **更新时间**: `2026-04-30 19:48:09`

## LAB-02 — 物理验证套件
- **输入**: 三项验证场景参数集 (小角度/单摆退化/能量守恒), Worker 仿真输出
- **输出**: `ValidationResults {smallAngle: ValidationStatus, singlePendulum: ValidationStatus, energy: ValidationStatus}` (ValidationStatus = "idle"|"running"|"passed"|"failed")
- **状态机**: IDLE → RUNNING → PASSED | FAILED (每项独立)
- **模块依赖**: SIM-01 (Worker 协议), LAB-03 (JS/Python 交叉校验)
- **外部依赖**: zustand 4.5, shadcn/ui (Button/Badge/Card/Tooltip/Alert), lucide-react
- **技术栈**: react 18.3, zustand 4.5, tailwindcss 3.4, shadcn/ui
- **更新时间**: `2026-04-30 19:48:09`

## LAB-03 — 用户可编程沙箱
- **输入**: Python 代码字符串 (CodeMirror 6 编辑), `activeTemplate`, Pyodide 实例
- **输出**: 轨迹数组 → JsProxy → Float64Array → `useSimulationStore` 注入, 3D 场景切换至新模型
- **状态机**: IDLE → RUNNING → SUCCESS | ERROR (5s 超时中断)
- **模块依赖**: SYS-04 (Pyodide 实例获取), SIM-01 (不经过 JS Worker), EXP-01 (消费轨迹), LAB-02 (交叉校验)
- **外部依赖**: pyodide 0.26+, SciPy solve_ivp, NumPy, codemirror 6.0, @codemirror/lang-python 6.1, @codemirror/view 6.35
- **技术栈**: react 18.3, CodeMirror 6, Pyodide 0.26, zustand 4.5, shadcn/ui
- **更新时间**: `2026-04-30 19:48:09`

## LAB-04 — 实验报告生成器
- **输入**: Report config, Canvas refs (3D/能量/相空间), simulation data, LAB-02 验证结果 (可选)
- **输出**: A4 PDF (jsPDF + autoTable): 标题/参数表/4 关键帧截图/能量图/相空间图/混沌判定/误差分析
- **状态机**: IDLE → GENERATING → COMPLETED | ERROR
- **模块依赖**: SIM-01 (参数/状态), SIM-04 (能量 Canvas), SIM-05 (相空间 Canvas), EXP-01 (3D Canvas, preserveDrawingBuffer: true), DAT-02 (PNG 导出基础设施)
- **外部依赖**: jsPDF 2.5, jspdf-autotable 3.8, Canvas.toDataURL()/toBlob()
- **技术栈**: react 18.3, jsPDF 2.5, zustand 4.5, shadcn/ui (Button/Dialog/Alert), lucide-react
- **更新时间**: `2026-04-30 19:48:09`

## STY-01 — 故事脚本引擎
- **输入**: `STORY_SCRIPT` (7 阶段时间轴: 阶段/时长/模式/参数/相机/字幕/脉冲高亮目标), `useStoryStore` 状态
- **输出**: `executeActions` (setMode/injectParams/setCamera/startButterfly 等), 字幕渲染 (framer-motion), `storyPhase` → SIM-03 锁定/解锁, `storyEnd`/`storyInterrupted` 事件
- **状态机**: IDLE → PLAYING → INTERRUPTED → RESUMING | COMPLETED (StoryPhase 9 状态: idle/phase_1~7/completed/interrupted)
- **模块依赖**: SIM-03 (导航锁定/自动退出), SIM-02 (injectParams/applyPreset), EXP-01 (相机/环境切换), EXP-02/03/04/05, ANL-01/02
- **外部依赖**: framer-motion 11.x, requestAnimationFrame + performance.now(), zustand 4.5
- **技术栈**: react 18.3, zustand 4.5, framer-motion 11.x, tailwindcss 3.4
- **更新时间**: `2026-04-30 19:48:09`

## STY-02 — 演示模式
- **输入**: `demoMode: boolean` (from useStoryStore)
- **输出**: UI 面板条件隐藏, R3F OrbitControls autoRotate (0.5°/s), 水印署名渲染 (WATERMARK_CONFIG.text)
- **状态机**: 无（从 useStoryStore.demoMode 派生）
- **模块依赖**: STY-01 (demoMode setter), EXP-01 (OrbitControls autoRotate), SIM-03 (NavBar 隐藏), SIM-02/04/05, EXP-02
- **外部依赖**: @react-three/drei (OrbitControls autoRotate/autoRotateSpeed props), zustand 4.5
- **技术栈**: react 18.3, zustand 4.5, R3F + drei
- **更新时间**: `2026-04-30 19:48:09`

## DAT-01 — 状态快照
- **输入**: `FullSnapshot {id, timestamp, params: PendulumParams, initialConditions, stateVector, trail: Float64Array[], thumbnail, mode: AppMode, label?}`, `SnapshotMeta`
- **输出**: IndexedDB CRUD (snapshots store, 键 `snapshot-{uuid}`), 缩略卡片列表, 双快照参数差异表 + 轨迹叠加
- **状态机**: 无（持久化操作, LRU 上限 50）
- **模块依赖**: SIM-01 (params/StateVector/simTime), EXP-02 (RingBuffer<TrailPoint> → toArray()), SIM-03 (AppMode)
- **外部依赖**: IndexedDB (原生), Canvas.toDataURL() (64px 缩略图), zustand 4.5
- **技术栈**: react 18.3, zustand 4.5, IndexedDB
- **更新时间**: `2026-04-30 19:48:09`

## DAT-02 — 数据导出
- **输入**: Canvas refs (3D/相空间/热力图/分岔图/庞加莱), `RingBuffer<StateVector>` (SIM-01 buffer), 导出选项 (格式/分辨率)
- **输出**: CSV 文件 (14 字段时序), JSON 场景文件 (PendulumParams + trajectory), PNG 截图 (最高 4K)
- **状态机**: 无
- **模块依赖**: SIM-01 (RingBuffer/帧数据), EXP-01 (3D Canvas), SIM-05 (exportPhaseSpaceImage()), ANL-01/02/03 (Canvas ref → getCanvas())
- **外部依赖**: Canvas.toBlob()/toDataURL(), File API/URL.createObjectURL()
- **技术栈**: react 18.3, zustand 4.5, 原生 Web APIs
- **更新时间**: `2026-04-30 19:48:09`

## DAT-03 — 历史回放与分叉
- **输入**: `replayTime: number`, `isReplaying: boolean`, `forkActive: boolean`, `RingBuffer<StateVector>` (容量 6000 = 100s @60fps)
- **输出**: 时间轴 Slider 回溯, 分叉 Worker 实例 (初始条件 = ringBuffer.at(t)), 原始轨迹 ghost trail 叠加
- **状态机**: NORMAL → REPLAYING (时间轴拖拽) → FORKED (独立 Worker 并行运行)
- **模块依赖**: SIM-01 (Worker 命令协议 init/reset/updateParams, RingBuffer.at()), EXP-01 (3D 姿态更新), EXP-02 (setGhostTrail()), SIM-02 (分叉前参数修改)
- **外部依赖**: RingBuffer<T>, Web Workers, zustand 4.5
- **技术栈**: react 18.3, zustand 4.5, Web Workers
- **更新时间**: `2026-04-30 19:48:09`

## SYS-01 — 响应式布局引擎
- **输入**: Viewport 尺寸 (ResizeObserver)
- **输出**: `DeviceType = "desktop" | "tablet" | "mobile"` → useAppStore (唯一写入者), `isCompact: boolean` (desktop 内部二级标识), `useContainerSize()` hook
- **状态机**: 无
- **模块依赖**: 无（系统最底层基础设施，不依赖任何其他模块）
- **外部依赖**: ResizeObserver (原生), Tailwind CSS breakpoints (lg/md/sm), zustand 4.5
- **技术栈**: react 18.3 (useSyncExternalStore), zustand 4.5, tailwindcss 3.4
- **更新时间**: `2026-04-30 19:48:09`

## SYS-02 — 运行时异常处理
- **输入**: Error events (from INF-01 `initErrorCapture.onError`), Worker 错误 (`WorkerErrorResponse`), visibility change 事件, `deviceType`
- **输出**: Toast 通知 (shadcn/ui Sonner), 自动暂停/恢复 (useVisibilityChange), 长运行降级 (>10min dt 1/60→1/30), 中文错误翻译 (error-dictionary.ts), Worker 崩溃恢复编排
- **状态机**: 无（事件驱动响应）
- **模块依赖**: INF-01 (错误采集回调), SIM-01 (Worker ref + 崩溃恢复), SYS-01 (deviceType), SIM-02 (全局异常通知)
- **外部依赖**: shadcn/ui Sonner (Toast), document.visibilitychange, zustand 4.5
- **技术栈**: react 18.3, zustand 4.5, shadcn/ui (Sonner)
- **更新时间**: `2026-04-30 19:48:09`

## SYS-03 — 预计算数据管线
- **输入**: Parameter grid config (from `scripts/precompute/config.py`)
- **输出**: `LyapunovGrid` JSON (100×100 浮点矩阵), `BifurcationData` JSON (采样序列) → `src/shared/data/` → Vite build → dist/assets/ → IndexedDB cache (键 `{type}-{gridHash}`, LRU ≤10)
- **状态机**: 无（离线 pipeline + 前端缓存层）
- **模块依赖**: 无（离线数据生产者，不依赖运行时模块）
- **外部依赖**: Python 3.11+, NumPy ≥1.24, SciPy ≥1.10 (solve_ivp), hashlib (SHA-256), IndexedDB, Web Crypto API
- **技术栈**: Python 3.11 + NumPy + SciPy (离线); TypeScript 5.x + IndexedDB (前端)
- **更新时间**: `2026-04-30 19:48:09`

## SYS-04 — 应用初始化加载
- **输入**: BootConfig {pyodideLoadStrategy: "lazy", enablePrecomputePrefetch, showQuotes}
- **输出**: `LoadingState = "loading" | "ready" | "error"` → useAppStore (唯一写入者), Worker 实例 (createOdeWorker()), Pyodide 实例 (懒加载), 预计算 JSON prefetch
- **状态机**: LOADING → READY | ERROR (含进度条 + ETA + 离线重试)
- **模块依赖**: INF-01 (observabilityCoordinator.init(), pyodideLoadPct 报告, initErrorCapture), SIM-01 (createOdeWorker), SYS-02 (notify 错误详情)
- **外部依赖**: Pyodide 0.26+ (三级缓存: 本地文件→IndexedDB→CDN), IndexedDB, Vite build assets
- **技术栈**: react 18.3, zustand 4.5, Pyodide 0.26
- **更新时间**: `2026-04-30 19:48:09`

## INF-01 — 应用可观测性
- **输入**: performance.mark/measure (Worker 耗时), requestAnimationFrame ticks (FPS), window.onerror/unhandledrejection (错误), Pyodide 加载进度 (from SYS-04)
- **输出**: `debugInfo {fps, workerLatencyMs, errors[], pyodideLoadPct}` → useAppStore (唯一写入者); DebugPanel (DEV only, Ctrl+Shift+D)
- **状态机**: 无
- **模块依赖**: SIM-01 (Worker ref 耗时测量), SYS-04 (Pyodide 进度 + observabilityCoordinator.init() 触发)
- **外部依赖**: performance.mark/measure (原生), requestAnimationFrame, window.onerror, window.unhandledrejection, zustand 4.5
- **技术栈**: TypeScript 5.x, zustand 4.5, shadcn/ui (Sheet), lucide-react, 原生 Web APIs (<150 行)
- **更新时间**: `2026-04-30 19:48:09`

## INF-02 — 持续部署管线
- **输入**: Git push/PR events → GitHub Actions workflow_dispatch/push/PR triggers
- **输出**: 三阶段 CI 流水线 (check: tsc+ESLint+Prettier → test: Vitest+物理回归+预计算校验 → build: Vite+Pyodide 打包 → artifact upload), dist/ 产物
- **状态机**: 无（CI pipeline 线性执行）
- **模块依赖**: SIM-01 (物理回归测试), SYS-03 (预计算 hash 校验), INF-03 (测试套件标准)
- **外部依赖**: GitHub Actions, pnpm 10, Node 22, actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v4, actions/upload-artifact@v4
- **技术栈**: GitHub Actions (YAML), pnpm 10, Node 22
- **更新时间**: `2026-04-30 19:48:09`

## INF-03 — 自动化测试体系
- **输入**: Source code (SIM-01 纯函数, SIM-02 Store actions, SIM-03 mode switching, RingBuffer/Float64Pool, shared hooks)
- **输出**: 四层测试: 单元测试 (Vitest) + 物理回归测试 (小角度<2%/单摆退化/能量漂移<0.5%) + 预计算 hash 校验 + UI 组件测试 (@testing-library/react)
- **状态机**: 无
- **模块依赖**: SIM-01 (被测目标), SYS-03 (预计算校验目标), SIM-02/03 (组件测试目标), data Feature (数据结构测试)
- **外部依赖**: Vitest 2.1, @testing-library/react 16.1, jsdom 25.0, vitest coverage (v8/istanbul)
- **技术栈**: Vitest 2.1, @testing-library/react 16.1, jsdom 25.0
- **更新时间**: `2026-04-30 19:48:09`
