# 功能点：STY-01 故事脚本引擎

> **文档生成时间**：2026-04-28 20:40:31 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:40:31 | AI Assistant | 初始版本，对齐 SIM-03 storyPhase/storyEnd 接口及功能设计 §六 7 阶段脚本 |

> **冲突核查指引**：本模块依赖 SIM-03 的 `storyPhase`（导航锁定）、`storyEnd`（自动退出）接口。SIM-03 v1.0 已定义这些接口占位符，本模块予以实现。无冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §六 6.1「一键故事模式」（7 阶段脚本编排、自动转场、电影式字幕、脉冲高亮、打断机制、重播按钮）；技术栈设计 §4.11「故事模式」（Zustand 状态机 + rAF 时间轴）
- **依赖的其他功能模块**：
  - `SIM-03`（全局导航系统）— 写入 `storyPhase`（锁定导航栏）；触发 `storyEnd`/`storyInterrupted`（自动退出故事模式）
  - `SIM-02`（参数控制面板）— 调用 `injectParams` / `applyPreset` 在脚本各阶段调整物理参数
  - `EXP-01`（3D 仿真场景）— 通过 `useExploreStore` 切换相机预设、环境背景
  - `EXP-02`（运动尾迹渲染）— 调整尾迹持久度与可见性
  - `EXP-03`（声音化引擎）— 开启/关闭物理声效
  - `EXP-04`（蝴蝶效应对比器）— 启动/停止分屏对比模式
  - `EXP-05`（时间反演实验）— 触发时间倒流实验
  - `ANL-01`（李雅普诺夫指数谱）— 在分析阶段展示热力图
  - `ANL-02`（参数空间分岔图）— 在分析阶段展示分岔图
- **被依赖模块**：`SIM-03`（消费 `storyPhase` 用于导航锁定与自动退出）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-03-全局导航系统.md` v1.0：步骤 7「故事模式特殊入口」— 读取 `storyPhase` 锁定导航按钮；步骤 9「故事模式自动退出」— 监听 `storyEnd` 事件并调用 `setMode(previousMode)`。本模块提供 `storyPhase` 状态的写入和 `storyEnd`/`storyInterrupted` 事件的触发。
  - `SIM-02-参数控制面板.md` v1.0：`injectParams` / `applyPreset` 接口 — 脚本阶段通过这两个接口调整物理参数，不经过用户交互校验。
  - `EXP-01-3D仿真场景.md` v1.0：`useExploreStore` 的 `viewPreset` 和 `environmentPreset` — 脚本通过该 store 切换相机和背景。
- **兼容性结论**：
  - SIM-03 已预留 `storyPhase`（`StoryPhase` 类型）和 `storyEnd`/`storyInterrupted` 事件机制，本模块提供完整实现
  - 参数调整通过 SIM-02 的 `injectParams`（静默注入，不触发用户校验 UI），与故事模式的自动化特性兼容
  - 无冲突
- **复用的已有定义**：SIM-03 的 `StoryPhase` 类型（扩展为 9 状态）；`useAppStore.setMode`；SIM-02 的 `injectParams`；`useExploreStore.viewPreset` / `useExploreStore.environmentPreset`

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — 字幕组件 UI
  - `zustand@^4.5.5` — 故事状态机 store（`useStoryStore`）
  - `tailwindcss@^3.4.16` — 字幕条、脉冲高亮、模式切换过渡动画
  - `framer-motion@^11.x` — 字幕淡入淡出（`AnimatePresence` + `motion.div`）、控件脉冲高亮（`animate={{ scale: [1, 1.05, 1] }}`）
  - `requestAnimationFrame` — 故事时间轴驱动（纯 JS，不依赖第三方动画库）
  - TypeScript 5.x
- **禁止使用**：
  - 禁止使用 `setTimeout`/`setInterval` 驱动故事时间轴（时间精度不足，`setTimeout` 最小延迟 4ms 且受后台 throttling 影响，必须用 rAF + `performance.now()`）
  - 禁止在脚本动作中直接操作 DOM（必须通过 Zustand store 驱动 UI 变化）

### 输入定义（精确类型）

#### 故事脚本定义

```typescript
/** 故事阶段标识 */
type StoryPhase =
  | "idle"
  | "intro"          // 0:00-0:25
  | "upgrade"        // 0:25-0:50
  | "butterfly"      // 0:50-1:30
  | "sonification"   // 1:30-2:00
  | "analysis"       // 2:00-2:30
  | "timereversal"   // 2:30-3:00
  | "climax"         // 3:00-3:30
  | "finished";      // 脚本结束

/**
 * 故事脚本动作类型。
 * 每个动作在阶段进入时原子执行。
 */
type StoryAction =
  /** 切换应用模式（探索/分析） */
  | { type: "setMode"; mode: "explore" | "analyze" }
  /** 调整物理参数（静默注入，不触发校验 UI） */
  | { type: "setParams"; params: Partial<PendulumParams> }
  /** 调整初始条件（触发 Worker reset） */
  | { type: "setInitialConditions"; ic: Partial<InitialConditions> }
  /** 切换相机预设 */
  | { type: "setCamera"; preset: "experimenter" | "god" | "chaos" }
  /** 切换环境背景 */
  | { type: "setEnvironment"; preset: "dark-lab" | "white-teaching" }
  /** 开启/关闭声效 */
  | { type: "setSound"; enabled: boolean }
  /** 设置尾迹持久度 */
  | { type: "setTrailPersistence"; mode: "short" | "medium" | "long" | "infinite" | "cycle" }
  /** 启动蝴蝶效应分屏对比 */
  | { type: "startButterfly"; deltaDeg: number }
  /** 停止蝴蝶效应分屏 */
  | { type: "stopButterfly" }
  /** 启动时间反演 */
  | { type: "startTimeReversal" }
  /** 停止时间反演 */
  | { type: "stopTimeReversal" }
  /** 脉冲高亮指定 UI 控件（需预先注册的元素 ID） */
  | { type: "highlightControl"; elementId: string }
  /** 取消所有控件高亮 */
  | { type: "clearHighlights" }
  /** 等待指定秒数（在阶段内创建暂停） */
  | { type: "wait"; seconds: number };

/**
 * 单个故事阶段的脚本定义。
 */
interface StoryScriptStep {
  /** 阶段标识 */
  phase: StoryPhase;
  /** 阶段起始时间 (s)，从故事开始计时 */
  startTime: number;
  /** 旁白字幕文本（支持 \n 换行，最多 2 行） */
  subtitle: string;
  /** 进入阶段时立即执行的原子动作序列 */
  onEnter: StoryAction[];
  /** 阶段内持续执行的并行动作（如相机 lerp），可选 */
  during?: StoryAction[];
  /** 离开阶段时执行的清理动作，可选 */
  onExit?: StoryAction[];
}

/** 完整故事脚本 — 7 阶段，总时长 210 秒（3 分 30 秒） */
const STORY_SCRIPT: StoryScriptStep[] = [
  {
    phase: "intro",
    startTime: 0,
    subtitle: "一个摆，我们知道它会在哪里",
    onEnter: [
      { type: "setMode", mode: "explore" },
      { type: "setEnvironment", preset: "dark-lab" },
      { type: "setCamera", preset: "experimenter" },
      { type: "setParams", params: { m2: 1e-6 } },        // 退化为单摆
      { type: "setInitialConditions", ic: { theta1: 0.3, theta1Dot: 0, theta2: 0, theta2Dot: 0 } },
      { type: "setTrailPersistence", mode: "medium" },
      { type: "setSound", enabled: false },
    ],
  },
  {
    phase: "upgrade",
    startTime: 25,
    subtitle: "再加一个摆，世界变得不可预测",
    onEnter: [
      { type: "setParams", params: { m2: 1.0 } },         // 恢复双摆
      { type: "setInitialConditions", ic: { theta1: Math.PI/2, theta1Dot: 0, theta2: Math.PI/2, theta2Dot: 0 } },
      { type: "setCamera", preset: "chaos" },              // 混沌视角跟随
      { type: "setTrailPersistence", mode: "long" },
    ],
  },
  {
    phase: "butterfly",
    startTime: 50,
    subtitle: "初始差异仅 0.001°，30 秒后它们形同陌路",
    onEnter: [
      { type: "startButterfly", deltaDeg: 0.001 },
      { type: "setCamera", preset: "god" },                // 上帝视角同时看两摆
    ],
    onExit: [
      { type: "stopButterfly" },
    ],
  },
  {
    phase: "sonification",
    startTime: 90,
    subtitle: "混沌不仅能看见，还能听见",
    onEnter: [
      { type: "setSound", enabled: true },
      { type: "setCamera", preset: "chaos" },
      { type: "highlightControl", elementId: "sound-toggle" },
    ],
    onExit: [
      { type: "clearHighlights" },
    ],
  },
  {
    phase: "analysis",
    startTime: 120,
    subtitle: "这不是随机，是有结构的复杂",
    onEnter: [
      { type: "setMode", mode: "analyze" },
      { type: "highlightControl", elementId: "lyapunov-heatmap" },
      { type: "wait", seconds: 15 },
      { type: "highlightControl", elementId: "bifurcation-diagram" },
    ],
    onExit: [
      { type: "clearHighlights" },
    ],
  },
  {
    phase: "timereversal",
    startTime: 150,
    subtitle: "甚至计算机也无法让混沌回头",
    onEnter: [
      { type: "setMode", mode: "explore" },
      { type: "startTimeReversal" },
      { type: "setCamera", preset: "experimenter" },
    ],
    onExit: [
      { type: "stopTimeReversal" },
    ],
  },
  {
    phase: "climax",
    startTime: 180,
    subtitle: "确定性系统的内在随机性——这就是混沌",
    onEnter: [
      { type: "setCamera", preset: "god" },
      { type: "setTrailPersistence", mode: "infinite" },
      { type: "setEnvironment", preset: "white-teaching" },
    ],
  },
];
```

#### Zustand 故事 Store

```typescript
interface StoryState {
  // ===== 运行时状态 =====
  /** 当前故事阶段 */
  phase: StoryPhase;
  /** 故事是否正在运行 */
  isRunning: boolean;
  /** 故事开始至今的 elapsed 秒数 (s) */
  elapsed: number;
  /** 当前显示的字幕文本。null 表示不显示字幕 */
  currentSubtitle: string | null;
  /** 当前脉冲高亮的控件 ID 集合 */
  highlightedControls: Set<string>;
  /** 故事是否被用户手动暂停（打断） */
  isInterrupted: boolean;

  // ===== Actions =====
  /** 开始故事：重置所有状态 → 切换到故事模式 */
  start: () => void;
  /** 用户打断：暂停故事 → 恢复手动控制 */
  pause: () => void;
  /** 从暂停恢复 */
  resume: () => void;
  /** 重播：从 phase 0 重新开始 */
  replay: () => void;
  /** 内部：时间轴每帧 tick */
  _tick: (now: number) => void;
  /** 内部：进入指定阶段 */
  _enterPhase: (step: StoryScriptStep) => void;
  /** 内部：离开指定阶段 */
  _exitPhase: (step: StoryScriptStep) => void;
}

/** 故事总时长常量 */
const STORY_TOTAL_DURATION = 210; // 3 分 30 秒
```

### 输出定义（精确类型）

#### 事件接口（供 SIM-03 消费）

```typescript
/**
 * 故事结束事件。
 * STY-01 在 _tick 中检测到 elapsed >= STORY_TOTAL_DURATION 时触发。
 * SIM-03 监听此事件 → 调用 setMode(previousMode)。
 */
type StoryEndEvent = { type: "storyEnd" };

/**
 * 故事打断事件。
 * 用户点击故事画面任意位置时触发（step 6）。
 * SIM-03 监听此事件 → 恢复导航栏按钮交互。
 */
type StoryInterruptedEvent = { type: "storyInterrupted" };
```

#### 字幕组件渲染

```tsx
/**
 * StorySubtitle — 全屏底部字幕覆盖层。
 * 在故事运行时渲染于所有 UI 之上（z-50）。
 */
function StorySubtitle() {
  const subtitle = useStoryStore(s => s.currentSubtitle);
  const isRunning = useStoryStore(s => s.isRunning);

  if (!isRunning || !subtitle) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={subtitle}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn(
          "fixed bottom-16 left-1/2 -translate-x-1/2 z-50",
          "px-8 py-3 rounded-lg",
          "bg-black/70 backdrop-blur-sm",
          "text-white text-xl font-serif text-center",
          "max-w-2xl",
          "select-none pointer-events-none",  // 字幕不拦截点击（点击穿透到打断处理）
        )}
      >
        {subtitle}
      </motion.div>
    </AnimatePresence>
  );
}
```

### 核心逻辑步骤

#### 阶段 A：故事初始化

**步骤 1：开始故事（start）**

- **操作对象**：`useStoryStore` 全部字段 + `useAppStore.activeMode`
- **具体操作**：
  1. `useAppStore.getState().setMode("story")` — 触发 SIM-03 的模式切换，导航栏锁定
  2. `set({ phase: "intro", isRunning: true, elapsed: 0, currentSubtitle: null, highlightedControls: new Set(), isInterrupted: false })`
  3. 执行第一个阶段 `STORY_SCRIPT[0]`（intro）的 `onEnter` 动作序列（步骤 5）
  4. 记录 `startTimestamp = performance.now()`
  5. 启动 rAF 循环：`requestAnimationFrame(tick)`
- **输入来源**：用户点击导航栏故事模式按钮（SIM-03）或 "重播故事" 按钮
- **输出去向**：故事模式激活 → SIM-03 锁定导航；`_tick` 开始驱动时间轴
- **失败行为**：`STORY_SCRIPT` 为空 → `console.error`，不启动 rAF

**步骤 2：每帧 tick（_tick）**

- **操作对象**：`elapsed`、`phase`、`currentSubtitle`
- **具体操作**：

  ```typescript
  function tick(now: number) {
    const state = get();
    if (!state.isRunning || state.isInterrupted) return;

    const elapsed = (now - startTimestamp) / 1000;
    set({ elapsed });

    // 检测故事结束
    if (elapsed >= STORY_TOTAL_DURATION) {
      set({ phase: "finished", isRunning: false, currentSubtitle: null });
      // 触发 storyEnd 事件（SIM-03 消费）
      window.dispatchEvent(new CustomEvent("storyEnd"));
      return; // 停止 rAF
    }

    // 检测阶段切换
    const currentStep = STORY_SCRIPT.find(s => s.phase === state.phase)!;
    const currentIdx = STORY_SCRIPT.indexOf(currentStep);
    const nextStep = STORY_SCRIPT[currentIdx + 1];

    if (nextStep && elapsed >= nextStep.startTime) {
      // 离开当前阶段
      if (currentStep.onExit) executeActions(currentStep.onExit);
      // 进入下一阶段
      set({ phase: nextStep.phase });
      executeActions(nextStep.onEnter);
      set({ currentSubtitle: nextStep.subtitle });
    }

    // 处理阶段内的 highlightControl 动作（逐帧检查）
    processHighlightActions(currentStep);

    requestAnimationFrame(tick);
  }
  ```

- **输入来源**：`performance.now()`（高精度时间戳）
- **输出去向**：`elapsed` 更新 → 字幕组件重渲染；阶段切换 → `_enterPhase` / `_exitPhase`
- **失败行为**：`startTimestamp` 未初始化 → 跳过本帧（`return`）

**步骤 3：动作执行器（executeActions）**

- **操作对象**：`StoryAction[]` 数组
- **具体操作**：按顺序同步执行每个 action：

  ```typescript
  function executeActions(actions: StoryAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case "setMode":
          useAppStore.getState().setMode(action.mode);
          break;
        case "setParams":
          useSimulationStore.getState().injectParams(action.params);
          break;
        case "setInitialConditions":
          useSimulationStore.getState().injectParams({}, action.ic);
          break;
        case "setCamera":
          useExploreStore.getState().setViewPreset(action.preset);
          break;
        case "setEnvironment":
          useExploreStore.getState().setEnvironmentPreset(action.preset);
          break;
        case "setSound":
          // 控制 EXP-03 声音化引擎开关
          useSonificationStore.getState().setEnabled(action.enabled);
          break;
        case "setTrailPersistence":
          useExploreStore.getState().setTrailPersistence(action.mode);
          break;
        case "startButterfly":
          useButterflyStore.getState().start(action.deltaDeg);
          break;
        case "stopButterfly":
          useButterflyStore.getState().stop();
          break;
        case "startTimeReversal":
          // 通过 SIM-01 Worker bridge 发送 setDirection(-1)
          worker.postMessage({ type: "setDirection", direction: -1 });
          break;
        case "stopTimeReversal":
          worker.postMessage({ type: "setDirection", direction: 1 });
          break;
        case "highlightControl":
          set(s => ({ highlightedControls: new Set([...s.highlightedControls, action.elementId]) }));
          break;
        case "clearHighlights":
          set({ highlightedControls: new Set() });
          break;
        case "wait":
          // wait 是空操作：时间轴自然流逝 until 阶段结束
          break;
      }
    }
  }
  ```

- **输入来源**：`StoryScriptStep.onEnter` / `onExit` 的动作列表
- **输出去向**：对应 Zustand store 的状态变更 + Worker postMessage
- **失败行为**：未知 `action.type` → `console.warn`，跳过该动作继续执行后续

#### 阶段 B：中断与恢复

**步骤 4：用户打断故事（pause）**

- **操作对象**：`isInterrupted`、`isRunning`
- **具体操作**：
  1. `set({ isInterrupted: true, isRunning: false })`
  2. 停止 rAF 循环（不调用 `cancelAnimationFrame`，`tick` 检测到 `isInterrupted` 后自然退出）
  3. 字幕消失：`set({ currentSubtitle: null })`
  4. 取消所有控件高亮：`set({ highlightedControls: new Set() })`
  5. 触发 `window.dispatchEvent(new CustomEvent("storyInterrupted"))`
  6. SIM-03 监听到 `storyInterrupted` → 恢复导航栏所有按钮的交互
  7. 当前仿真参数和状态保留（故事模式的参数变更不撤销）
  8. 页面显示 "故事已暂停 · 点击探索" 提示（3 秒后自动消失）
- **输入来源**：用户在故事运行期间点击画面任意位置（除重播按钮外）
- **输出去向**：故事暂停，返回手动探索模式
- **失败行为**：无

**步骤 5：重播故事（replay）**

- **操作对象**：全部故事状态
- **具体操作**：
  1. `set({ phase: "idle", isRunning: false, elapsed: 0, currentSubtitle: null, highlightedControls: new Set(), isInterrupted: false })`
  2. 重置所有被故事修改的仿真参数为默认值（调用 `useSimulationStore.getState().resetToDefaults()`）
  3. 停止蝴蝶效应分屏（若仍在运行）
  4. 停止时间反演（若仍在运行）
  5. 关闭声效
  6. 调用 `start()`（步骤 1）
- **输入来源**：用户点击 "重播故事" 按钮
- **输出去向**：从头开始新的故事播放
- **失败行为**：`resetToDefaults` 失败 → 使用硬编码默认值回退

#### 阶段 C：UI 交互

**步骤 6：点击画面打断**

- **操作对象**：全屏透明点击拦截层
- **具体操作**：
  1. 故事运行时渲染一个全屏透明 `<div>`（`fixed inset-0 z-40 cursor-pointer`），拦截点击事件
  2. 用户点击 → 调用 `useStoryStore.getState().pause()`
  3. 点击事件不穿透到下层 UI（防止误操作滑块或按钮）
  4. "重播故事" 按钮在此层的 `z-50` 之上（不受拦截）
- **输入来源**：用户点击故事画面
- **输出去向**：`pause()` → 故事打断
- **失败行为**：拦截层未渲染 → 用户点击可能穿透到下层 UI 控件，触发意外的参数修改。必须在故事启动时确保拦截层挂载。

**步骤 7：重播按钮**

- **操作对象**：悬浮 "重播故事" 按钮
- **具体操作**：
  1. 故事运行期间，屏幕右上角渲染一个半透明按钮（`opacity-60 hover:opacity-100`）：
     ```tsx
     <Button
       variant="ghost"
       size="sm"
       className="fixed top-16 right-4 z-50 opacity-60 hover:opacity-100"
       onClick={() => useStoryStore.getState().replay()}
     >
       <RotateCcw className="h-4 w-4 mr-1" />
       重播故事
     </Button>
     ```
  2. 点击 → `replay()` → 步骤 5
  3. 按钮在故事打断后仍可见（用户可以随时重播）
- **输入来源**：用户点击
- **输出去向**：`replay()` → 重播

**步骤 8：控件脉冲高亮**

- **操作对象**：被 `highlightControl` action 指定的 UI 控件
- **具体操作**：
  1. 每个可被高亮的控件需预先注册 `data-story-element` 属性（如 `<Button data-story-element="sound-toggle">`）
  2. `useStoryStore` 的 `highlightedControls` 包含某控件 ID 时，该控件渲染脉冲动画：

     ```tsx
     function HighlightableControl({ elementId, children }: { elementId: string; children: React.ReactNode }) {
       const isHighlighted = useStoryStore(s => s.highlightedControls.has(elementId));

       return (
         <motion.div
           animate={isHighlighted ? { scale: [1, 1.06, 1], boxShadow: [
             "0 0 0 0 rgba(59,130,246,0)",
             "0 0 0 6px rgba(59,130,246,0.4)",
             "0 0 0 0 rgba(59,130,246,0)"
           ] } : {}}
           transition={{ repeat: Infinity, duration: 2 }}
         >
           {children}
         </motion.div>
       );
     }
     ```

  3. 脉冲动画：scale 1 → 1.06 → 1 + 蓝色光晕扩展收缩，2 秒周期循环
- **输入来源**：`highlightedControls` Set
- **输出去向**：对应控件的视觉脉冲效果
- **失败行为**：`elementId` 未在任何控件中注册 → 无视觉变化（`console.warn`）

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand (useAppStore) | `setMode("story")` | 进入故事模式，触发 SIM-03 导航锁定 |
| Zustand (useSimulationStore) | `injectParams` / `resetToDefaults` | 脚本各阶段调整参数；重播时恢复默认 |
| Zustand (useExploreStore) | `setViewPreset` / `setEnvironmentPreset` / `setTrailPersistence` | 相机、环境、尾迹切换 |
| Zustand (useSonificationStore) | `setEnabled` | 声音化开关 |
| Zustand (useButterflyStore) | `start(deltaDeg)` / `stop()` | 蝴蝶效应分屏 |
| Worker (SIM-01) | `postMessage({ type: "setDirection", direction })` | 时间反演方向控制 |
| window | `dispatchEvent(new CustomEvent("storyEnd" \| "storyInterrupted"))` | 通知 SIM-03 恢复导航 |

**对外暴露的公共接口**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| SIM-03 全局导航 | `window.addEventListener("storyEnd", ...)` | 故事结束 → `setMode(previousMode)` |
| SIM-03 全局导航 | `window.addEventListener("storyInterrupted", ...)` | 故事打断 → 恢复导航按钮交互 |
| SIM-03 全局导航 | `useStoryStore(s => s.phase)` | `phase !== "idle"` 时锁定非故事导航按钮 |

### 状态机

故事脚本引擎的完整状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | `start()` | `intro` | 无 | 切换到 story 模式；执行 intro `onEnter` 动作；字幕显示；rAF 循环启动；全屏拦截层挂载；导航栏锁定 |
| `intro` | `elapsed >= 25s` | `upgrade` | `isRunning = true` | 执行 intro `onExit`；执行 upgrade `onEnter`（恢复双摆参数）；字幕切换 |
| `upgrade` | `elapsed >= 50s` | `butterfly` | `isRunning = true` | 执行 upgrade `onExit`；执行 butterfly `onEnter`（启动分屏、切换上帝视角）；字幕切换 |
| `butterfly` | `elapsed >= 90s` | `sonification` | `isRunning = true` | 执行 butterfly `onExit`（停止分屏）；执行 sonification `onEnter`（开启声效）；字幕切换 |
| `sonification` | `elapsed >= 120s` | `analysis` | `isRunning = true` | 执行 sonification `onExit`（清除高亮）；执行 analysis `onEnter`（切换到分析模式、高亮热力图）；字幕切换 |
| `analysis` | `elapsed >= 150s` | `timereversal` | `isRunning = true` | 执行 analysis `onExit`（清除高亮）；执行 timereversal `onEnter`（回探索模式、启动时间反演）；字幕切换 |
| `timereversal` | `elapsed >= 180s` | `climax` | `isRunning = true` | 执行 timereversal `onExit`（停止时间反演）；执行 climax `onEnter`（上帝视角、无限尾迹、白底）；字幕切换 |
| `climax` | `elapsed >= 210s` | `finished` | `isRunning = true` | 字幕消失；触发 `storyEnd` 事件；导航栏恢复；拦截层卸载 |
| 任意（除 `idle`/`finished`） | 用户点击画面 `pause()` | `当前状态`（保持） | `isRunning = true` | `isInterrupted = true`；`isRunning = false`；字幕消失；触发 `storyInterrupted`；导航栏恢复；拦截层保留（用户可再次点击进入手动探索） |
| 任意（`isInterrupted = true`） | `replay()` | `intro` | 无 | 重置所有仿真参数；停止蝴蝶/反演/声效；重新执行 `start()` 流程 |
| `finished` | `replay()` | `intro` | 无 | 同上 |
| `finished` | 用户手动切换到其他模式 | `idle` | SIM-03 `setMode` → `activeMode !== "story"` | `phase` 重置为 `idle` |

### 异常与边界条件

#### 异常 1：故事运行中 Worker 崩溃

- **触发条件**：故事播放期间 SIM-01 Worker 崩溃（如积分发散未被捕获）
- **处理策略**：
  1. Worker `onerror` 触发 → 自动重建（SIM-01 异常 3 的处理流程）
  2. 故事时间轴**不暂停**（Worker 重建后自动恢复，故事继续推进）
  3. 若 Worker 重建失败（连续 2 次崩溃）→ 故事显示浮层提示 "仿真引擎暂时不可用"但字幕和阶段切换**继续**（叙事独立于仿真）
  4. Worker 恢复后，下一个阶段的 `setParams` / `setInitialConditions` 正常发送
- **重试参数**：Worker 自动重建 1 次；故事不重试

#### 异常 2：阶段切换时参数注入失败

- **触发条件**：`executeActions` 中 `injectParams` 因校验失败而拒绝（如脚本定义了非法参数值）
- **处理策略**：
  1. `injectParams` 的失败字段静默跳过（SIM-02 行为）
  2. `console.error("story: injectParams failed for", action.params)`
  3. 故事**不中断**（叙事优先，参数尽量应用）
  4. 失败的参数在新阶段被后续的 action 覆盖
- **重试参数**：不重试。脚本定义错误需在开发期修复。

#### 异常 3：声音化激活被浏览器自动播放策略阻止

- **触发条件**：`sonification` 阶段 `setSound(true)` 执行时，`AudioContext` 未获得用户手势授权（故事由 `start()` 程序化触发，非用户点击触发）
- **处理策略**：
  1. `AudioContext` 的 `resume()` 返回 rejected promise → 捕获
  2. 声效静默失败（不影响故事继续）
  3. `console.warn("story: AudioContext blocked by autoplay policy")`
  4. 字幕正常显示 "混沌不仅能看见，还能听见"
  5. 用户被打断后手动点击 → AudioContext 获得授权 → 声效恢复
- **重试参数**：不自动重试。等待用户手势。

#### 异常 4：浏览器后台运行时 rAF 被节流

- **触发条件**：用户在故事播放期间切换到其他标签页 → 浏览器将 rAF 降至 1fps
- **处理策略**：
  1. `_tick` 使用 `performance.now()` 计算 `elapsed`（绝对时间），不受 rAF 频率影响
  2. 即使用户切标签页 30 秒，切回时 `elapsed` 正确反映实际经过时间
  3. 若 `elapsed` 已超过 `STORY_TOTAL_DURATION` → 直接跳转到 `finished` 阶段
  4. 多个阶段被跳过 → 执行最后一个应到达阶段的 `onEnter`（跳过中间阶段的 onEnter/onExit）
- **重试参数**：自动处理，恢复时一次性追赶。

#### 异常 5：蝴蝶效应 Worker B 启动失败

- **触发条件**：`butterfly` 阶段 `startButterfly()` 时，EXP-04 创建第二个 Worker 失败（如内存不足）
- **处理策略**：
  1. `startButterfly` 抛出异常 → `executeActions` 捕获
  2. `console.error("story: butterfly effect failed to start")`
  3. 故事**不中断**，仍切换到上帝视角（但画面只有单个摆 A）
  4. 字幕正常显示 "初始差异仅 0.001°"
  5. 用户可能看不出蝴蝶效应视觉（但叙事不受影响）
- **重试参数**：不重试。降级为单摆模式。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §六 6.1 | 一键故事模式 | `start()` 一键触发 7 阶段全自动播放；无需手动操作即可完成 3 分 30 秒完整演示 |
| 功能设计_v0 §六 6.1 | 可中断 + 可重播 | 点击画面任意位置 → `pause()` 中断故事；中断后用户自由操作所有控件；"重播故事"按钮从头重放 |
| 功能设计_v0 §六 6.1 | 自动转场 | 阶段切换自动触发：模式切换（`setMode`）、参数调节（`setParams`）、视角旋转（`setCamera`）、UI 高亮（`highlightControl`） |
| 功能设计_v0 §六 6.1 | 电影式字幕 | 字幕使用 `framer-motion` 淡入淡出（duration 0.6s）；位置固定底部中央；2 行上限；不拦截点击 |
| 技术栈设计 §4.11 | 状态机驱动 | 故事状态机使用 Zustand 而非 React state；`_tick` 使用 rAF + `performance.now()` 而非 `setInterval` |
| 通用原则 | 叙事与仿真解耦 | 故事时间轴独立于仿真状态；Worker 崩溃/参数注入失败不影响叙事推进；字幕继续显示 |

### 验收测试场景

#### 正向测试 1：完整 7 阶段自动播放

- **Given**：应用已启动，默认参数，用户在探索模式
- **When**：用户点击导航栏"故事模式"按钮
- **Then**：
  - `activeMode` 变为 `"story"`
  - 故事从 `intro` 阶段开始：暗色背景 + 单摆（m2退化为1e-6）+ 字幕 "一个摆，我们知道它会在哪里"
  - 25s 时自动切换到 `upgrade`：恢复双摆 + 混沌视角 + 字幕切换
  - 50s 时切换到 `butterfly`：分屏对比启动 + 上帝视角 + 字幕
  - 90s 时切换到 `sonification`：声音开启 + 声效按钮脉冲高亮
  - 120s 时切换到 `analysis`：切换到分析模式 + 热力图高亮
  - 150s 时切换到 `timereversal`：回探索模式 + 时间反演启动
  - 180s 时切换到 `climax`：上帝视角 + 无限尾迹 + 白底 + 字幕
  - 210s 时故事结束：`storyEnd` 事件触发 → SIM-03 自动切回之前的模式
  - 导航栏按钮恢复交互

#### 正向测试 2：用户打段后恢复手动控制

- **Given**：故事正在 `butterfly` 阶段播放中（elapsed ≈ 60s）
- **When**：用户点击画面任意位置
- **Then**：
  - 字幕消失
  - `isInterrupted = true`，`isRunning = false`
  - `storyInterrupted` 事件触发 → SIM-03 恢复导航按钮交互
  - 当前参数和状态保留（分屏对比仍在运行、上帝视角保持）
  - 用户可自由旋转 3D 视角、调整参数、切换模式
  - "重播故事"按钮仍可见

#### 正向测试 3：重播故事从头开始

- **Given**：故事已播放完毕（`phase = "finished"`）或被打断
- **When**：用户点击"重播故事"按钮
- **Then**：
  - 所有仿真参数恢复默认
  - 蝴蝶效应停止（若运行中）
  - 时间反演停止（若运行中）
  - 声效关闭
  - `phase` 重置为 `intro`，`elapsed = 0`
  - 故事从 `intro` 阶段重新播放

#### 异常测试 1：后台标签页切回后追赶

- **Given**：故事正在 `upgrade` 阶段（elapsed ≈ 30s）
- **When**：用户切换到其他标签页，60 秒后切回
- **Then**：
  - `elapsed` 约为 90s（`performance.now()` 绝对时间）
  - 故事立即跳转到 `sonification` 阶段（elapsed >= 90s）
  - `upgrade` 和 `butterfly` 的 `onExit` 被跳过
  - `sonification` 的 `onEnter` 执行（声效开启）
  - 当前字幕为 "混沌不仅能看见，还能听见"
  - 故事继续向前推进（不卡在旧阶段）

#### 异常测试 2：声效自动播放被浏览器阻止

- **Given**：故事到达 `sonification` 阶段（elapsed = 90s），浏览器未获得 AudioContext 用户手势授权
- **When**：`executeActions` 执行 `{ type: "setSound", enabled: true }`
- **Then**：
  - `audioContext.resume()` rejected → 静默捕获
  - `console.warn` 输出警告
  - 故事**不中断**，继续推进
  - 字幕正常显示
  - 用户打段后手动点击页面 → AudioContext 恢复 → 声效正常

### 注意事项与禁止行为

1. **【`performance.now()` 而非 `Date.now()`】** 故事时间戳必须使用 `performance.now()`（单调递增、不受系统时间调整影响、精度 5μs）。禁止使用 `Date.now()`（可被 NTP 同步回拨，导致 `elapsed` 跳变）。
2. **【`requestAnimationFrame` 而非 `setInterval`】** 故事时间轴驱动必须使用 rAF，使阶段切换与浏览器渲染帧对齐。后台节流场景下，rAF 被降至 1fps 但不影响 `elapsed` 计算（因为用的是绝对时间差）。
3. **【故事 store 独立于仿真 store】** `useStoryStore` 与 `useSimulationStore` 是两个独立的 Zustand store。故事 store 通过调用仿真 store 的 actions 间接修改仿真状态，不直接写入仿真 store 的字段。这保证了故事结束后仿真 store 的完整性。
4. **【全屏拦截层的 z-index】** 拦截层 `z-40`，字幕 `z-50`，重播按钮 `z-50`。确保字幕和重播按钮在拦截层之上，点击重播按钮不会触发打断。
5. **【禁止行为】** 禁止在 `executeActions` 中使用 `await` 或异步操作。所有 action 必须同步执行（`wait` action 除外，它依赖时间轴自然流逝）。异步初始化（如蝴蝶效应 Worker 创建）可能失败但不阻塞后续 action。
6. **【禁止行为】** 禁止在故事运行中允许用户通过 SIM-02 UI 滑块修改参数（故事模式的参数控制面板应 disabled，或拦截层阻止交互）。参数变更必须仅由脚本 action 驱动。
7. **【易错点】** `STORY_SCRIPT` 的阶段顺序由 `startTime` 隐式定义（按时间排序），而非数组索引。若 `startTime` 配置错误（如两个阶段时间重叠），`tick` 逻辑会按 `startTime` 先后顺序切换。开发期必须校验：`STORY_SCRIPT[i].startTime < STORY_SCRIPT[i+1].startTime`。
8. **【易错点】** 阶段切换发生在 `elapsed >= nextStep.startTime` 的**第一帧**。若某一帧的 `elapsed` 跨越了多个阶段边界（如后台切回场景），`tick` 会循环检测并依次执行每个被跳过的阶段的 `onExit`。但为避免 210 秒全部跳过时的连锁效应，跳过超过 2 个阶段时仅执行最后一个到达阶段的 `onEnter`（不执行中间阶段的 onEnter/onExit）。
9. **【偷懒红线】** 禁止将 7 个阶段的脚本硬编码为 `if/else if` 链。必须使用 `STORY_SCRIPT` 数组 + `find` 查找当前阶段 + `startTime` 比较的方式，确保新增/调整阶段只需修改数据而非控制流代码。
