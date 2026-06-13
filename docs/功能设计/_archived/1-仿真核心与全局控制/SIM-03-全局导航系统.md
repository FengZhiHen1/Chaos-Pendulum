# 功能点：SIM-03 全局导航系统

> **文档生成时间**：2026-04-28 20:14:49 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:14:49 | AI Assistant | 初始版本，对齐已有 useAppStore 约定与各模式组件接口 |
> | v1.1 | 2026-04-28 21:10:00 | AI Assistant | 修正 MODE_REGISTRY 中故事模式 id 从 `"studio"` 改为 `"story"`（typo）；补充 currentMode→activeMode 重命名说明 |

> **冲突核查指引**：本模块扩展 `useAppStore`（`src/stores/useAppStore.ts`），新增 `activeMode` 字段。已有模块（EXP-01/EXP-02/SIM-02）仅订阅 `deviceType`，不受新增字段影响（Zustand selector 粒度隔离）。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §二「系统架构：四大工作模式」；技术栈设计 §2 #7 Zustand、#8 Tailwind CSS、#9 shadcn/ui、§3.1 架构分层图（UI 层）
- **依赖的其他功能模块**：
  - `SYS-01`（响应式布局引擎）— 提供 `deviceType`（写入 `useAppStore`），本模块据此切换导航栏布局（顶部 tabs / 底部 tab bar / 折叠菜单）
  - `SIM-01`（双摆物理引擎）— 模式切换时**不**干预 Worker 运行（仿真持续进行）
- **被依赖模块**：EXP-01、EXP-02、EXP-03、EXP-04、EXP-05、ANL-01、ANL-02、ANL-03、ANL-04、LAB-01、LAB-02、LAB-03、LAB-04、STY-01、STY-02（所有模式组件均通过 `useAppStore().activeMode` 判断自身是否激活，通过 SIM-03 的 `<AppShell>` 获得布局容器）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.0：Worker 在模式切换时保持运行（无 pause/resume 依赖）
  - `SIM-02-参数控制面板.md` v1.0：`useAppStore().deviceType` 用于响应式布局；`isPanelExpanded` 用于面板折叠状态
  - `EXP-01-3D仿真场景.md` v1.0：`useAppStore((s) => s.deviceType)` 用于渲染降级
  - `EXP-02-运动尾迹渲染.md`（存在）：`useAppStore((s) => s.deviceType)` 用于降级
  - `ANL-01-李雅普诺夫指数谱.md`（存在）：Canvas 渲染，模式切换时 Canvas 卸载/重建
- **兼容性结论**：
  - `useAppStore` 已有 `deviceType: "desktop" | "tablet" | "mobile"` 字段（被 EXP-01/EXP-02/SIM-02 消费），本模块在此文件基础上新增 `activeMode` 字段，不修改已有字段名和类型
  - 所有已有模块的 `useAppStore` selector 仅提取 `deviceType`，不受新增 `activeMode` 影响（Zustand 按 selector 粒度重渲染）
  - 无冲突，本模块复用并扩展已有 `useAppStore`
- **复用的已有定义**：`useAppStore` 的 `deviceType` 字段（来自 SYS-01 域，由 EXP-01/SIM-02 已确立的约定）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，使用条件渲染（`{mode === "explore" && <ExploreMode />}`）控制模式内容区
  - `zustand@^4.5.5` — 在 `src/stores/useAppStore.ts` 中新增 `activeMode` 字段与 `setMode` action
  - `tailwindcss@^3.4.16` — 导航栏布局（桌面 `flex-row` / 移动 `fixed bottom-0 flex-row`）
  - `shadcn/ui`（Copy 模式）— `Tabs`（导航栏模式切换，`variant="pills"` 风格）、`Tooltip`（图标悬浮提示模式名称）
  - `lucide-react` — `Compass`（探索）、`BarChart3`（分析）、`FlaskConical`（实验）、`Play`（故事）
- **禁止使用**：
  - 禁止使用 React Router 或任何 URL 路由库实现模式切换（纯客户端单页，模式切换不改变 URL，不用 `react-router-dom`）
  - 禁止在模式切换时调用 Worker 的 pause/resume（仿真必须持续运行，Worker 不感知 UI 模式变化）
  - 禁止使用 CSS `display: none` 替代条件渲染来"保留"模式组件（除 Lab 模式的代码编辑器外，其他模式组件在非激活时应卸载以释放 GPU/内存资源）

### 输入定义（精确类型）

#### useAppStore 扩展（在 `src/stores/useAppStore.ts` 中新增）

```typescript
import { create } from "zustand";

/**
 * 应用工作模式。
 * - "explore": 探索模式（3D 场景 + 感官认知）
 * - "analyze": 分析模式（科研级诊断工具）
 * - "lab": 实验模式（教学闭环与创造）
 * - "story": 故事模式（评审专用演示）
 */
type AppMode = "explore" | "analyze" | "lab" | "story";

/**
 * 单个模式的定义元数据。
 * 用于渲染导航栏按钮和快捷键绑定。
 */
interface ModeDefinition {
  /** 模式标识符 */
  id: AppMode;
  /** 中文显示名称 */
  label: string;
  /** 短标签（平板等窄屏使用） */
  shortLabel: string;
  /** lucide-react 图标组件名 */
  iconName: "Compass" | "BarChart3" | "FlaskConical" | "Play";
  /** 键盘快捷键（数字键 1-4） */
  shortcut: "1" | "2" | "3" | "4";
  /** 悬浮提示文本 */
  tooltip: string;
}

/** 所有模式的元数据注册表（不可变常量） */
const MODE_REGISTRY: ModeDefinition[] = [
  {
    id: "explore",
    label: "探索模式",
    shortLabel: "探索",
    iconName: "Compass",
    shortcut: "1",
    tooltip: "3D 实时仿真与感官认知 · 快捷键 1",
  },
  {
    id: "analyze",
    label: "分析模式",
    shortLabel: "分析",
    iconName: "BarChart3",
    shortcut: "2",
    tooltip: "科研级诊断工具 · 快捷键 2",
  },
  {
    id: "lab",
    label: "实验模式",
    shortLabel: "实验",
    iconName: "FlaskConical",
    shortcut: "3",
    tooltip: "教学闭环与可编程沙箱 · 快捷键 3",
  },
  {
    id: "story",
    label: "故事模式",
    shortLabel: "故事",
    iconName: "Play",
    shortcut: "4",
    tooltip: "评审专用一键演示 · 快捷键 4",
  },
];

interface AppState {
  // ===== 已有字段（由 SYS-01 管理，此处仅声明以保持兼容） =====
  /** 当前设备类型。由 SYS-01（响应式布局引擎）通过 ResizeObserver 检测并写入 */
  deviceType: "desktop" | "tablet" | "mobile";

  // ===== 本模块新增字段 =====
  /** 当前激活的应用模式 */
  activeMode: AppMode;
  /**
   * 模式切换前的上一个模式。
   * 用于"从故事模式退出后返回之前的模式"等场景。
   */
  previousMode: AppMode | null;
  /**
   * 所有可用模式的定义元数据。
   * 在 store 初始化时写入（不可变），供导航栏组件渲染。
   */
  modeRegistry: ModeDefinition[];

  // ===== Actions =====
  /**
   * 切换当前模式。
   * 执行前将当前 activeMode 写入 previousMode。
   * 若 newMode === activeMode → 忽略（幂等）。
   * @param newMode - 目标模式标识符
   */
  setMode: (newMode: AppMode) => void;
}

const useAppStore = create<AppState>((set, get) => ({
  // 已有字段默认值（与 SYS-01 约定一致）
  deviceType: "desktop",

  // 新增字段
  activeMode: "explore",    // 默认启动为探索模式
  previousMode: null,
  modeRegistry: MODE_REGISTRY,

  setMode: (newMode: AppMode) => {
    const { activeMode } = get();
    if (newMode === activeMode) return; // 幂等
    set({ previousMode: activeMode, activeMode: newMode });
  },
}));
```

### 输出定义（精确类型）

#### 组件导出

```typescript
/**
 * AppShell — 应用顶层布局容器。
 * 渲染全局导航栏 + 模式内容区。
 * 该组件在 src/App.tsx 中作为根布局使用。
 *
 * 使用示例：
 * ```tsx
 * // src/App.tsx
 * function App() {
 *   return (
 *     <AppShell>
 *       <ExploreMode />   // 当 activeMode === "explore" 时渲染
 *       <AnalyzeMode />   // 当 activeMode === "analyze" 时渲染
 *       <LabMode />       // 当 activeMode === "lab" 时渲染
 *       <StoryMode />     // 当 activeMode === "story" 时渲染
 *     </AppShell>
 *   );
 * }
 * ```
 */
interface AppShellProps {
  /** 子节点必须恰好包含 4 个模式根组件（按 explore/analyze/lab/story 顺序） */
  children: React.ReactNode;
}

/**
 * GlobalNavBar — 全局导航栏。
 * 在 AppShell 内部渲染，始终可见。
 * 不单独导出（AppShell 内部使用的私有组件）。
 */
```

#### AppShell 渲染的 DOM 结构

```
<!-- desktop (deviceType === "desktop") -->
<div className="h-screen flex flex-col bg-background">
  <nav className="h-12 flex items-center gap-2 px-4 border-b">
    ← GlobalNavBar 在此渲染（水平 tabs）
  </nav>
  <main className="flex-1 overflow-hidden">
    ← 当前激活模式的组件在此渲染（条件渲染，仅挂载 1 个）
  </main>
</div>

<!-- tablet (deviceType === "tablet") -->
<div className="h-screen flex flex-col bg-background">
  <main className="flex-1 overflow-hidden">
    ← 当前激活模式的组件
  </main>
  <nav className="h-11 flex items-center justify-around border-t">
    ← GlobalNavBar 在此渲染（紧凑水平 tabs）
  </nav>
</div>

<!-- mobile (deviceType === "mobile") -->
<div className="h-screen flex flex-col bg-background">
  <main className="flex-1 overflow-hidden">
    ← 当前激活模式的组件
  </main>
  <nav className="h-12 flex items-center justify-around border-t safe-area-bottom">
    ← GlobalNavBar 在此渲染（底部图标 tab bar，仅显示图标 + 短标签）
  </nav>
</div>
```

### 核心逻辑步骤

#### 阶段 A：初始化

**步骤 1：注册模式元数据**

- **操作对象**：`useAppStore` 中的 `modeRegistry` 和 `activeMode`
- **具体操作**：
  1. 在 `create<AppState>(...)` 中，`modeRegistry` 初始化为 `MODE_REGISTRY` 常量（4 个模式定义）
  2. `activeMode` 初始化为 `"explore"`（应用默认进入探索模式）
  3. `previousMode` 初始化为 `null`
- **输入来源**：编译时硬编码的 `MODE_REGISTRY`
- **输出去向**：store 就绪，`GlobalNavBar` 可消费 `modeRegistry` 渲染导航按钮
- **失败行为**：无（纯同步初始化，无不依赖外部 I/O）

#### 阶段 B：模式切换

**步骤 2：模式切换（setMode）**

- **操作对象**：`useAppStore` 的 `activeMode` 和 `previousMode`
- **具体操作**：
  1. 调用 `get().activeMode` 获取当前模式
  2. 若 `newMode === activeMode` → 直接返回（幂等，不触发任何副作用）
  3. `set({ previousMode: activeMode, activeMode: newMode })` — 原子更新，先保存旧值再切换
  4. Zustand 通知所有订阅了 `activeMode` 的组件重新渲染
- **输入来源**：用户点击导航栏按钮、键盘快捷键（步骤 4）、故事模式结束自动退出（步骤 9）
- **输出去向**：
  - `AppShell` 的内容区根据 `activeMode` 卸载旧模式组件、挂载新模式组件
  - 所有模式组件通过 `useAppStore(s => s.activeMode)` 感知自身是否激活
- **失败行为**：`newMode` 不在 `MODE_REGISTRY` 的 `id` 列表中 → 忽略（`console.warn`），不修改状态

**步骤 3：模式切换时的状态保存与恢复**

- **操作对象**：各模式组件在挂载/卸载时的副作用
- **具体操作**（说明模式切换时各组件的生命周期行为）：

  | 组件 | 卸载时行为 | 挂载时行为 |
  |------|-----------|-----------|
  | 3D Canvas（EXP-01） | R3F `<Canvas>` 销毁 → WebGL 上下文释放。当前帧状态保留在 RingBuffer 中 | 新建 Canvas → WebGL 上下文初始化 → `useFrame` 从 RingBuffer 最新位置开始消费 → 1-2 帧内恢复显示 |
  | 2D 图表（ANL-*） | Canvas DOM 移除。图表数据在 Zustand store 中保留 | Canvas 重建 → 从 store 读取数据 → 重新绘制（首次绘制约 16ms） |
  | CodeMirror（LAB-03） | 编辑器 DOM 移除。用户代码文本在 Zustand store 中保留 | 编辑器重建 → `doc.setText(store.code)` 恢复内容 → 光标回到开头（`store.cursorPos` 可选恢复） |
  | 参数面板（SIM-02） | React 组件树卸载。参数值在 `useSimulationStore` 中保留 | 组件树重建 → 从 store 读取 `params` / `initialConditions` → 恢复所有滑块位置 |
  | Web Audio（EXP-03） | `OscillatorNode` 保持运行（AudioContext 是全局单例，不随组件卸载而销毁） | 重新订阅 store → 恢复参数映射 → 无中断 |
  | Worker（SIM-01） | **不卸载**（Worker 是全局单例，独立于 React 生命周期） | **无变化**（Worker 持续运行，仿真不中断） |

- **输入来源**：React 条件渲染根据 `activeMode` 变化卸载/挂载组件
- **输出去向**：各组件在挂载时从 store 恢复状态
- **失败行为**：组件挂载时 store 中数据丢失（极端情况，如页面刷新）→ 各组件使用默认值初始化（SIM-02 的 `DEFAULT_PARAMS`，EXP-01 的默认视角等）

**步骤 4：键盘快捷键切换**

- **操作对象**：`window` 全局键盘事件
- **具体操作**：
  1. `AppShell` 挂载时注册 `window.addEventListener("keydown", handleKeyDown)`
  2. `handleKeyDown` 逻辑：

     ```typescript
     function handleKeyDown(e: KeyboardEvent) {
       // 忽略输入框内的按键（避免在参数编辑时误触发模式切换）
       if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
       // 忽略含修饰键的组合键（Ctrl+1 / Alt+1 等留给浏览器）
       if (e.ctrlKey || e.altKey || e.metaKey) return;

       const modeMap: Record<string, AppMode> = {
         "1": "explore",
         "2": "analyze",
         "3": "lab",
         "4": "story",
       };
       const mode = modeMap[e.key];
       if (mode) useAppStore.getState().setMode(mode);
     }
     ```

  3. `AppShell` 卸载时移除事件监听
- **输入来源**：用户按下数字键 1/2/3/4
- **输出去向**：调用 `setMode` → 模式切换（步骤 2）
- **失败行为**：焦点在 `<input>` 或 `<textarea>` 内 → 忽略（用户正在输入文字）

#### 阶段 C：导航栏 UI

**步骤 5：渲染桌面端导航栏**

- **操作对象**：`<nav>` 元素（水平排列在页面顶部）
- **具体操作**：
  1. 从 `useAppStore` 获取 `activeMode`、`modeRegistry`
  2. 渲染 shadcn/ui `Tabs`（`variant="pills"`）：

     ```tsx
     function GlobalNavBar() {
       const activeMode = useAppStore(s => s.activeMode);
       const modeRegistry = useAppStore(s => s.modeRegistry);
       const setMode = useAppStore(s => s.setMode);
       const deviceType = useAppStore(s => s.deviceType);

       return (
         <Tabs value={activeMode} onValueChange={(v) => setMode(v as AppMode)}>
           <TabsList className="gap-1">
             {modeRegistry.map((mode) => (
               <TabsTrigger key={mode.id} value={mode.id} className="gap-2">
                 <DynamicIcon name={mode.iconName} className="h-4 w-4" />
                 {deviceType === "desktop" ? mode.label : mode.shortLabel}
               </TabsTrigger>
             ))}
           </TabsList>
         </Tabs>
       );
     }
     ```

  3. `DynamicIcon` 组件根据 `iconName` 字符串动态渲染对应的 `lucide-react` 图标
  4. 桌面端（`deviceType === "desktop"`）：显示完整中文标签 + 图标
  5. 平板端（`deviceType === "tablet"`）：显示短标签 + 图标
  6. 移动端（`deviceType === "mobile"`）：仅显示图标 + 短标签，`TabsList` 使用 `justify-around` 均分底部宽度，添加 `safe-area-bottom` padding 避免 iPhone 底部横条遮挡
- **输入来源**：`useAppStore` 的 `activeMode`、`modeRegistry`、`deviceType`
- **输出去向**：用户点击 → `onValueChange` → `setMode` → 步骤 2
- **失败行为**：`modeRegistry` 为空数组 → 渲染空 `<nav>`（不崩溃）

**步骤 6：导航栏激活态指示器**

- **操作对象**：当前激活模式对应的 `TabsTrigger` 元素
- **具体操作**：
  1. shadcn/ui `Tabs` 组件自动管理激活态样式（`data-state="active"` → Tailwind `bg-primary text-primary-foreground`）
  2. 激活态触发时，在 `TabsTrigger` 下方显示 2px 彩色指示条：
     - explore: `bg-blue-500`（探索 = 蓝色，暗示"发现"）
     - analyze: `bg-emerald-500`（分析 = 绿色，暗示"精确"）
     - lab: `bg-amber-500`（实验 = 琥珀色，暗示"创造"）
     - story: `bg-violet-500`（故事 = 紫色，暗示"沉浸"）
  3. 模式切换时，指示条以 CSS `transition-all duration-200` 滑动到新位置
- **输入来源**：`activeMode` 变化
- **输出去向**：纯视觉反馈，无状态变更
- **失败行为**：CSS transition 不兼容旧浏览器 → 降级为瞬间切换（`@supports (transition: all)` 检测）

**步骤 7：故事模式特殊入口**

- **操作对象**：故事模式的 `TabsTrigger`
- **具体操作**：
  1. 故事模式的导航按钮在非激活时显示脉冲动画（`animate-pulse`，暗示"点击我"）
  2. 脉冲动画在用户首次点击故事模式后永久停止（`localStorage.setItem("story-pulse-dismissed", "1")`）
  3. 故事模式激活时，导航栏其余模式按钮变为 `disabled`（故事脚本运行期间禁止手动切换模式，防止打断演示）
  4. 故事脚本运行结束或用户手动中断 → 恢复所有按钮的 `enabled` 状态
- **输入来源**：`activeMode === "story"`；故事脚本状态（来自 STY-01 的 `storyPhase`）
- **输出去向**：导航栏按钮的交互状态
- **失败行为**：`localStorage` 不可用（隐私模式）→ 脉冲动画每次访问都显示（不存储抑制标志）

#### 阶段 D：内容区管理

**步骤 8：模式内容区条件渲染**

- **操作对象**：`<main>` 元素内的模式根组件
- **具体操作**：

  ```tsx
  function AppShell({ children }: AppShellProps) {
    const activeMode = useAppStore(s => s.activeMode);
    const deviceType = useAppStore(s => s.deviceType);

    // 将 children 按模式分组
    const childrenArray = React.Children.toArray(children);
    const modeMap: Record<AppMode, React.ReactNode> = {
      explore: childrenArray[0],  // 第 1 个子节点 = ExploreMode
      analyze: childrenArray[1],  // 第 2 个子节点 = AnalyzeMode
      lab: childrenArray[2],      // 第 3 个子节点 = LabMode
      story: childrenArray[3],    // 第 4 个子节点 = StoryMode
    };

    const isNavTop = deviceType === "desktop";

    return (
      <div className="h-screen flex flex-col bg-background">
        {isNavTop && <GlobalNavBar />}
        <main className="flex-1 overflow-hidden">
          {/* 仅渲染当前激活模式 */}
          {modeMap[activeMode]}
        </main>
        {!isNavTop && <GlobalNavBar />}
      </div>
    );
  }
  ```

- **输入来源**：`activeMode` + `children`（4 个模式根组件）
- **输出去向**：仅 1 个模式组件挂载在 DOM 中
- **失败行为**：`children` 数量 !== 4 → `console.warn`，降级为渲染全部 children（所有模式同时挂载，丧失性能优势但功能可用）

**步骤 9：故事模式自动退出**

- **操作对象**：`activeMode`
- **具体操作**：
  1. STY-01（故事脚本引擎）在演示结束时触发 `storyEnd` 事件
  2. SIM-03 监听此事件：`useAppStore.getState().setMode(previousMode ?? "explore")`
  3. 退出逻辑：恢复到进入故事模式之前的模式（`previousMode`），若 `previousMode` 为 null（用户直接打开故事模式）→ 回退到 `"explore"`
  4. 取消导航栏其余按钮的 `disabled` 状态
- **输入来源**：STY-01 的 `storyEnd` 事件
- **输出去向**：`setMode` → 步骤 2 → 恢复之前的模式
- **失败行为**：`previousMode` 也为 `"story"`（极端异常）→ 回退到 `"explore"`

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand | `create<AppState>(...)` | 创建/扩展 `useAppStore`，管理 `activeMode` |
| shadcn/ui | `<Tabs>` `<TabsList>` `<TabsTrigger>` | 导航栏 UI 组件 |
| lucide-react | `Compass` `BarChart3` `FlaskConical` `Play` 图标组件 | 导航按钮图标 |
| Tailwind CSS | `h-screen flex flex-col` `border-b` `safe-area-bottom` | 布局容器 |
| SYS-01 | `useAppStore().deviceType` | 响应式导航栏布局切换 |
| STY-01 | 故事模式 `storyEnd` 事件 | 故事结束后自动退出故事模式 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| 所有模式组件 | `useAppStore(s => s.activeMode)` | 判断自身是否激活（条件渲染、副作用控制） |
| 所有模式组件 | `useAppStore(s => s.setMode)` | 程序化触发模式切换（如 ANL-01 从热力图跳转到 explore） |
| STY-01 故事脚本引擎 | `useAppStore(s => s.activeMode === "story")` | 故事模式激活时启动脚本 |
| SYS-01 响应式布局 | `useAppStore(s => s.deviceType)` | 已有字段，本模块不修改，仅消费 |
| EXP-04 蝴蝶效应对比器 | `<AppShell>` 提供的布局容器 | 双 Viewport 布局在 AppShell 的 `<main>` 内渲染 |

### 状态机

全局模式切换状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `explore` | 点击"分析模式"按钮 / 按 2 | `analyze` | `activeMode === "explore"` | `previousMode = "explore"`；探索模式组件卸载；分析模式组件挂载；Worker 继续运行；WebGL 上下文释放 |
| `explore` | 点击"实验模式"按钮 / 按 3 | `lab` | `activeMode === "explore"` | 同上模式切换逻辑 |
| `explore` | 点击"故事模式"按钮 / 按 4 | `story` | `activeMode === "explore"` | 进入故事模式；导航栏其余按钮 disabled；STY-01 脚本开始播放 |
| `analyze` | 点击"探索模式"按钮 / 按 1 | `explore` | `activeMode === "analyze"` | `previousMode = "analyze"`；Canvas 图表卸载；3D Canvas 重建 |
| `analyze` | 点击"实验模式"按钮 / 按 3 | `lab` | `activeMode === "analyze"` | 同上 |
| `analyze` | 点击"故事模式"按钮 / 按 4 | `story` | `activeMode === "analyze"` | 同上进入故事模式逻辑 |
| `lab` | 点击"探索模式"按钮 / 按 1 | `explore` | `activeMode === "lab"` | `previousMode = "lab"`；CodeMirror 内容保留在 store |
| `lab` | 点击"分析模式"按钮 / 按 2 | `analyze` | `activeMode === "lab"` | 同上 |
| `lab` | 点击"故事模式"按钮 / 按 4 | `story` | `activeMode === "lab"` | 同上进入故事模式逻辑 |
| `story` | 故事脚本结束 / 用户打断 | `previousMode \|\| "explore"` | `activeMode === "story"` | 导航栏按钮恢复 enabled；恢复到进入前的模式 |
| 任意 | 点击当前模式按钮 | 不变 | `newMode === activeMode` | 无副作用（幂等） |
| 任意 | 输入非法 mode 值 | 不变 | mode 不在 `MODE_REGISTRY` 中 | `console.warn` |

### 异常与边界条件

#### 异常 1：模式组件挂载失败

- **触发条件**：模式根组件在挂载时抛出未捕获异常（如 3D Canvas 因 WebGL 不可用而崩溃）
- **处理策略**：
  1. 使用 React Error Boundary 包裹 `<main>` 内容区
  2. 捕获错误 → 显示降级 UI：`"当前模式加载失败"` + "返回探索模式"按钮
  3. 用户点击按钮 → `setMode("explore")` 回到安全模式
  4. 错误详情写入 `console.error` + Zustand debug store
  5. 其他模式仍可正常切换（Error Boundary 隔离单个模式的崩溃）
- **重试参数**：用户手动点击按钮重试，不自动重试

#### 异常 2：快速连续切换模式导致组件闪烁

- **触发条件**：用户在 200ms 内连续点击 2 个不同模式按钮（如快速从 explore → analyze → explore）
- **处理策略**：
  1. `setMode` 使用 Zustand 的 `set` 批量更新（React 18 自动批处理），中间状态不会触发渲染
  2. 最终仅渲染 `explore` 模式的组件（中间 `analyze` 模式的渲染被 React 跳过）
  3. 若用户反复快速切换（5 次/秒，连续 3 秒）→ 防抖：300ms 内的多次 `setMode` 调用仅执行最后一次
- **重试参数**：300ms 防抖窗口，自动合并

#### 异常 3：移动端底部导航栏被系统手势区域遮挡

- **触发条件**：iOS Safari 底部横条（Home Indicator）或 Android 手势导航栏与 `bottom-0` 定位的导航栏重叠
- **处理策略**：
  1. 使用 CSS `env(safe-area-inset-bottom)` 作为底部导航栏的额外 `padding-bottom`
  2. Tailwind 类：`pb-[env(safe-area-inset-bottom)]`
  3. 若浏览器不支持 `env()`（旧版浏览器）→ 降级为固定 `pb-4`
- **重试参数**：纯 CSS 方案，无需 JS 干预

#### 异常 4：键盘快捷键与浏览器默认行为冲突

- **触发条件**：用户按 `Ctrl+1` 或 `Alt+2`（某些浏览器用它切换标签页）
- **处理策略**：
  1. `handleKeyDown` 检查 `e.ctrlKey || e.altKey || e.metaKey` → 有修饰键则忽略
  2. Firefox 中 `Alt+Shift+数字` 也可能触发 → 额外检查 `e.shiftKey` 并忽略
  3. 仅纯数字键（无任何修饰键）触发模式切换
- **重试参数**：无，修饰键 + 数字不触发模式切换

#### 异常 5：故事模式进行中用户尝试强制切换模式

- **触发条件**：故事模式激活时（轨道栏其余按钮 `disabled`），用户通过键盘快捷键按 `1/2/3` 尝试切换
- **处理策略**：
  1. `setMode` 在执行前检查：若 `get().activeMode === "story"` 且 STY-01 脚本未结束，则 `setMode` 忽略非 story 的切换请求
  2. 仅在用户通过故事模式 UI 点击"退出故事"或脚本自然结束时，才允许切换
  3. 若故事被打断（STY-01 的 `storyInterrupted` 事件），恢复切换自由
- **重试参数**：不重试。用户需先退出故事模式。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §二 | 四大模式平等并列 | `MODE_REGISTRY` 包含 4 个等权重的模式定义；导航栏中 4 个按钮等宽排列；无模式优先于其他模式 |
| 功能设计_v0 §二 | "用户可随时切换" | 导航栏始终可见（所有设备端、所有模式下均渲染，仅在故事模式运行中锁定非故事按钮）；键盘快捷键 1-4 提供无鼠标切换路径 |
| 功能设计_v0 §二 | "切换模式时保持当前仿真运行状态不中断" | `setMode` 不触碰 `useSimulationStore` 和 Worker；Worker 独立于 React 生命周期；模式切换仅为 UI 层操作 |
| 技术栈设计 §4.11 | 故事模式打断后可恢复手动 | `previousMode` 记录进入故事模式前的模式；故事结束/打断后自动 `setMode(previousMode)` |
| 通用原则 | 渐进增强 | 桌面端：完整标签 + 图标 + 键盘快捷键；平板端：短标签 + 图标；移动端：图标 + 短标签 + 底部定位 |
| 通用原则 | 可观测性 | 每次 `setMode` 调用记录 `console.info("mode_switch", { from, to, timestamp })`；Error Boundary 捕获的模式崩溃写入 debug store |

### 验收测试场景

#### 正向测试 1：正常模式切换

- **Given**：
  - 应用已启动，当前为探索模式（`activeMode = "explore"`）
  - 3D 场景正常渲染（EXP-01 挂载）
  - Worker 运行中（SIM-01）
- **When**：用户点击导航栏"分析模式"按钮
- **Then**：
  - `activeMode` 变为 `"analyze"`
  - `previousMode` 变为 `"explore"`
  - 3D Canvas 卸载（EXP-01 不再渲染）
  - 分析模式组件挂载（ANL-* Canvas 开始渲染）
  - Worker 保持运行（`console.info` 显示 Worker 仍在输出 batch）
  - 导航栏"分析模式"按钮处于激活态（绿色指示条）
  - URL 未变化（仍为原始 URL，无 hash/query 参数变更）

#### 正向测试 2：键盘快捷键切换

- **Given**：当前为探索模式，焦点在页面主体（非 input 元素内）
- **When**：用户按下键盘数字键 `2`
- **Then**：
  - `activeMode` 变为 `"analyze"`
  - 导航栏"分析模式"按钮高亮
  - 页面内容切换为分析模式组件
- **When**：用户再按 `1`
- **Then**：`activeMode` 恢复为 `"explore"`，3D Canvas 重新挂载并恢复渲染

#### 正向测试 3：故事模式结束后自动退出

- **Given**：当前为探索模式（`previousMode = null`）
- **When**：
  1. 用户点击"故事模式"按钮 → `activeMode = "story"`, `previousMode = "explore"`
  2. 故事脚本播放完毕（STY-01 触发 `storyEnd`）
- **Then**：
  - `activeMode` 自动变为 `"explore"`（恢复到 `previousMode`）
  - 导航栏所有按钮恢复 `enabled` 状态
  - 3D Canvas 重新挂载

#### 异常测试 1：快速连续切换不产生中间渲染

- **Given**：当前为探索模式
- **When**：用户在 100ms 内连续执行：
  1. 点击"分析模式"
  2. 点击"实验模式"
  3. 点击"探索模式"
- **Then**：
  - React 18 自动批处理导致中间两次 `setMode` 的渲染被跳过
  - 最终状态：`activeMode = "explore"`，`previousMode = "explore"`（被第 1 次调用覆盖为 "explore"，第 2 次调用 `newMode = activeMode` 幂等跳过）
  - 3D 场景持续渲染，未出现闪烁或短暂黑屏
  - Worker 未收到任何 pause/resume 命令

#### 异常测试 2：故事模式中强制切换被阻止

- **Given**：故事模式激活中（`activeMode = "story"`），STY-01 脚本播放中，导航栏非故事按钮 `disabled`
- **When**：用户按键盘数字键 `1`
- **Then**：
  - `setMode("explore")` 被忽略（故事模式锁定）
  - `activeMode` 保持 `"story"`
  - 故事脚本继续播放，未被中断

#### 异常测试 3：模式组件崩溃后 Error Boundary 恢复

- **Given**：当前为探索模式，3D 场景正常
- **When**：
  1. 切换到分析模式 → 正常
  2. 模拟 ANL-01 组件崩溃（抛异常）
- **Then**：
  - Error Boundary 捕获异常
  - 内容区显示降级 UI："当前模式加载失败" + "返回探索模式"按钮
  - 导航栏仍可交互（其他模式按钮未 disabled）
  - 用户点击"返回探索模式" → `setMode("explore")` → 3D Canvas 正常重建

### 注意事项与禁止行为

1. **【Worker 生命周期独立】** SIM-01 Worker 的创建/销毁不绑定到任何模式组件。Worker 在应用启动时由 App.tsx 入口初始化（通过 SYS-04 加载流程触发），在应用关闭（页面关闭/刷新）时销毁。模式切换仅影响 UI 层，Worker 无感知。
2. **【模式组件索引顺序】** `AppShell` 依赖 `React.Children.toArray(children)[0..3]` 按顺序映射到 4 个模式。`App.tsx` 中必须严格按 `explore → analyze → lab → story` 顺序传入子节点。违反此顺序将导致模式渲染错位。推荐使用具名插槽而非索引：`<AppShell explore={<ExploreMode />} analyze={<AnalyzeMode />} ...>`。
3. **【AudioContext 不随模式切换销毁】** Web Audio API 的 `AudioContext` 是全局单例，在探索模式的 EXP-03 声音化引擎中创建。切换到其他模式时不应调用 `audioContext.close()`（否则切回探索模式时需重新创建，且需要新的用户手势授权）。仅在页面卸载时关闭。
4. **【3D Canvas 卸载的 GPU 内存】** 每次从探索模式切换到其他模式，R3F `<Canvas>` 卸载时释放 WebGL 上下文和 GPU 内存。切回探索模式时重新创建。这在桌面端（GPU 内存充裕）是合理的行为。但在移动端（GPU 内存紧张），这是必要的资源释放。无需特殊处理。
5. **【禁止行为】** 禁止在模式切换时调用 `worker.terminate()` 或 `worker.postMessage({ type: "pause" })`。Worker 对模式切换完全无感知。
6. **【禁止行为】** 禁止在导航栏中为某个模式添加"未读"角标或动态排序（模式顺序固定为探索→分析→实验→故事，不可变）。
7. **【禁止行为】** 禁止使用 `react-router-dom` 的 `<Link>` 或 `useNavigate` 实现模式切换（本项目无 URL 路由）。
8. **【易错点】** `useAppStore` 的 `activeMode` selector 在模式组件中使用时，组件仅在 `activeMode` 变化时重渲染（精确订阅）。但如果组件同时订阅了其他高频变化的字段（如 `deviceType`），需拆分为两个独立的 `useAppStore` selector 以避免不必要的重渲染。
9. **【易错点】** 移动端 `safe-area-inset-bottom` 在 iOS Safari 全屏模式（`apple-mobile-web-app-capable`）下需额外处理。若应用以 PWA 模式添加到主屏幕，`env(safe-area-inset-bottom)` 可能返回 0，需兜底 20px。
10. **【偷懒红线】** 禁止将 4 个模式的 UI 组件全部挂载并用 CSS `display: none/block` 控制显示。必须使用条件渲染（`{activeMode === "explore" && <ExploreMode />}`），确保非激活模式的 GPU 资源被释放。
