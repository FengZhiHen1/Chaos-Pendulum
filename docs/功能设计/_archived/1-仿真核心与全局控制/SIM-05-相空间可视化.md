# 功能点：SIM-05 相空间可视化

> **文档生成时间**：2026-04-28 20:35:38 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:35:38 | AI Assistant | 初始版本，对齐 SIM-01 v2.0 扁平状态字段名及 D3.js Canvas 渲染模式 |

> **冲突核查指引**：本模块消费的 `theta1`/`theta1Dot`/`theta2`/`theta2Dot` 字段与 SIM-01 v2.0 `consumeFrameToStore` 写入的扁平字段完全一致。与 ANL-03（庞加莱截面）的边界已在模块全拆解附录 C 中记录（全相空间 vs 特定截面）。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §十 P0（第一版已有相空间图）；§五 5.4（实验报告的数据图表组件）；§七 7.2（相空间图可导出为 PNG 4K）；技术栈设计 §2 #6（D3.js 按需模块）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 通过 Zustand store 消费 `theta1`/`theta1Dot`/`theta2`/`theta2Dot` 每帧数据
- **被依赖模块**：LAB-04（实验报告生成器 — 截取相空间图作为报告图表）；DAT-02（数据导出 — 相空间图导出为 PNG）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.0：buffer 布局中 `theta1`(offset 1)、`theta1Dot`(offset 2)、`theta2`(offset 3)、`theta2Dot`(offset 4)；`consumeFrameToStore` 以扁平字段名写入 Zustand
  - `SIM-04-能量实时监控.md` v1.0：同为 D3.js Canvas 实时图表，复用 Canvas 渲染模式和 `devicePixelRatio` 处理
  - `功能模块全拆解.md` 附录 C：SIM-05 与 ANL-03 边界决策（全相空间轨迹 vs 特定截面离散点，保持分离）
- **兼容性结论**：
  - 数据字段名与 SIM-01 完全一致（`theta1`/`theta1Dot`/`theta2`/`theta2Dot` 扁平路径）
  - Canvas 渲染模式与 SIM-04 一致（D3.js + Canvas 2D + `devicePixelRatio` 适配），可共享 canvas 初始化工具函数
  - 无冲突
- **复用的已有定义**：SIM-01 的 `FRAME_STRIDE`(14)、状态字段偏移常量(1/2/3/4)；SIM-04 的 Canvas 初始化模式（D3 scale + `devicePixelRatio` 处理）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架
  - `d3@^7.9.0`（按需模块：`d3-scale`、`d3-shape`、`d3-axis`、`d3-selection`）— 相空间轨迹 Canvas 渲染
  - `zustand@^4.5.5` — 从 `useSimulationStore` 订阅状态字段
  - `tailwindcss@^3.4.16` — 面板布局
  - `shadcn/ui`（Copy 模式）— `Card`（面板容器）、`Toggle` / `Select`（变量对切换）、`Tooltip`
  - TypeScript 5.x
- **禁止使用**：
  - 禁止使用 SVG 渲染轨迹（高密度轨迹点 1000+ 时 SVG 性能不可接受，必须用 Canvas）
  - 禁止在每帧渲染时重新创建 D3 scale（仅在变量对切换或 resize 时重建）

### 输入定义（精确类型）

#### 组件 Props

```typescript
/**
 * 相空间变量对标识。
 * "theta1" = (θ₁, θ̇₁) — 上摆相空间
 * "theta2" = (θ₂, θ̇₂) — 下摆相空间
 */
type PhaseVariable = "theta1" | "theta2";

interface PhaseSpaceProps {
  /** Canvas 宽度 (px)。默认 320。 */
  width?: number;
  /** Canvas 高度 (px)。默认 320（1:1 方形，因为 θ 和 θ̇ 范围可比）。 */
  height?: number;
  /**
   * 轨迹点上限。
   * Canvas 中保留的最大点数，超过后从头部移除旧点。
   * 默认 3000（约 50 秒 @60fps）。
   */
  maxTrailPoints?: number;
  /**
   * 当前点高亮半径 (px)。
   * 默认 5。
   */
  cursorRadius?: number;
  /**
   * 轨迹线宽 (px)。
   * 默认 1.5。
   */
  trailWidth?: number;
}
```

#### Zustand 数据源（从 `useSimulationStore` 读取，由 SIM-01 写入）

```typescript
/** SIM-01 consumeFrameToStore 写入的字段（本模块只读消费） */
interface SimulationStateFields {
  theta1: number;     // 上摆角度 (rad)，buffer offset 1
  theta1Dot: number;  // 上摆角速度 (rad/s)，buffer offset 2
  theta2: number;     // 下摆角度 (rad)，buffer offset 3
  theta2Dot: number;  // 下摆角速度 (rad/s)，buffer offset 4
}
```

### 输出定义（精确类型）

#### 组件渲染结构

```
┌─────────────────────────────────────────────┐
│  相空间图                                   │
│  ┌───────────────────────────────┐ [θ₁-θ̇₁] │ ← 标题行 + Toggle 切换
│  │                               │ [θ₂-θ̇₂] │
│  │   ┌─ Canvas (320×320) ────┐   │          │
│  │   │  θ̇ (rad/s)            │   │          │
│  │   │   ↑ 网格 + 刻度        │   │          │
│  │   │   │  ··轨迹（渐变淡）   │   │          │
│  │   │   │    ● ← 当前位置    │   │          │
│  │   │   └──────────→ θ (rad) │   │          │
│  │   │      网格 + 刻度        │   │          │
│  │   └────────────────────────┘   │          │
│  └───────────────────────────────────────────┘
│  当前: θ₁=1.23 rad  θ̇₁=0.45 rad/s            │ ← 数值标签行
└─────────────────────────────────────────────┘
```

#### 导出接口（供 LAB-04 和 DAT-02 调用）

```typescript
/**
 * 将当前 Canvas 内容导出为 PNG Data URL。
 * 供 LAB-04（报告嵌入）和 DAT-02（独立导出）调用。
 * @param scale — 输出倍率。1 = Canvas 逻辑尺寸，4 = 4K 导出。
 */
function exportPhaseSpaceImage(scale: number = 1): string {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width * scale;
  exportCanvas.height = canvas.height * scale;
  const exportCtx = exportCanvas.getContext("2d")!;
  exportCtx.scale(scale, scale);
  exportCtx.drawImage(canvas, 0, 0);
  return exportCanvas.toDataURL("image/png");
}
```

### 核心逻辑步骤

#### 阶段 A：数据采集

**步骤 1：订阅状态字段并追加轨迹点**

- **操作对象**：模块内部的轨迹点环形缓冲区 `trailBuffer: { theta: number; thetaDot: number }[]`
- **具体操作**：
  1. 使用 Zustand `subscribe` 监听 `theta1` 变化（非 `useStore` hook，避免每帧 React 重渲染）
  2. 根据当前 `activeVariable` 读取对应字段：
     - `"theta1"` → `theta = state.theta1, thetaDot = state.theta1Dot`
     - `"theta2"` → `theta = state.theta2, thetaDot = state.theta2Dot`
  3. 将 `{ theta, thetaDot }` 追加到 `trailBuffer`
  4. 若 `trailBuffer.length > maxTrailPoints` → 从头部移除最旧点（`shift`）
  5. 归一化 angle：`theta = ((theta + π) % 2π + 2π) % 2π - π`（确保在 `(-π, π]` 范围内，避免轨迹在 ±π 边界处跳跃断开）
- **输入来源**：`useSimulationStore` 的 `theta1`/`theta1Dot`/`theta2`/`theta2Dot`
- **输出去向**：`trailBuffer`（模块内部 `useRef` 持有）
- **失败行为**：`theta` 或 `thetaDot` 为 NaN → 跳过本帧，不追加

**步骤 2：变量对切换**

- **操作对象**：`activeVariable: PhaseVariable`
- **具体操作**：
  1. 用户点击 Toggle 按钮 → `setActiveVariable("theta1" | "theta2")`
  2. 切换时清空 `trailBuffer`（不同变量对的轨迹不能混合显示）
  3. 重新设置坐标轴默认范围：
     - `"theta1"`：X 轴 `[-π, π]`（角度），Y 轴自适应（初始 `[-5, 5]`，随数据扩展）
     - `"theta2"`：同上
  4. Canvas 全量重绘（清空 + 重绘网格）
- **输入来源**：用户点击 Toggle 按钮
- **输出去向**：Canvas 清空，新变量对的轨迹从头开始累积
- **失败行为**：`activeVariable` 值非法 → 回退为 `"theta1"`

**步骤 3：Y 轴自适应范围**

- **操作对象**：D3 `yScale` 的 domain
- **具体操作**：
  1. 每 60 帧（1 秒）检查一次 `trailBuffer` 中 `thetaDot` 的极值
  2. 计算 `absMax = max(|min(thetaDot)|, |max(thetaDot)|) * 1.1`（加 10% 余量）
  3. 若 `absMax < 1.0` → Y 轴 domain 保持 `[-1.0, 1.0]`（最小范围，避免窄范围时噪声被放大）
  4. 否则 → `yScale.domain([-absMax, absMax]).nice()`
  5. Y 轴重绘（刻度线和标签）
- **输入来源**：`trailBuffer` 中最近 60 帧的 `thetaDot` 值
- **输出去向**：Canvas Y 轴更新
- **失败行为**：`trailBuffer` 为空 → 保持当前 domain

#### 阶段 B：Canvas 渲染

**步骤 4：Canvas 初始化**

- **操作对象**：`<canvas>` 元素及 2D 上下文
- **具体操作**：
  1. 组件挂载时创建 Canvas ref
  2. 设置物理像素：`canvas.width = width * devicePixelRatio; canvas.height = height * devicePixelRatio`
  3. CSS 尺寸保持逻辑像素：`canvas.style.width = width + "px"; canvas.style.height = height + "px"`
  4. `ctx.scale(devicePixelRatio, devicePixelRatio)`
  5. 创建 D3 scale：

     ```typescript
     const margin = { top: 20, right: 20, bottom: 35, left: 45 };
     const plotWidth = width - margin.left - margin.right;
     const plotHeight = height - margin.top - margin.bottom;

     // X 轴：角度 θ (rad)，固定范围 [-π, π]
     const xScale = d3.scaleLinear()
       .domain([-Math.PI, Math.PI])
       .range([margin.left, margin.left + plotWidth]);

     // Y 轴：角速度 θ̇ (rad/s)，初始 [-5, 5]，自适应
     const yScale = d3.scaleLinear()
       .domain([-5, 5])
       .range([margin.top + plotHeight, margin.top]);
     ```

  6. 绘制静态元素（初始化时一次，resize 时重绘）：
     - 背景填充：`ctx.fillStyle = "#0a0a1a"; ctx.fillRect(0, 0, width, height)`
     - 网格线（`strokeStyle = "rgba(255,255,255,0.06)"`，主网格 0.5rad/1rad 间隔）
     - X 轴：标签 "θ (rad)"，刻度 `-π`/`-π/2`/`0`/`π/2`/`π`
     - Y 轴：标签 "θ̇ (rad/s)"，刻度自适应
     - 原点十字线（`strokeStyle = "rgba(255,255,255,0.15)"`）
- **输入来源**：`width`/`height` props + `activeVariable`
- **输出去向**：就绪的 Canvas，等待步骤 5 的每帧轨迹绘制
- **失败行为**：Canvas 上下文获取失败 → 降级显示纯数值标签（当前角度/角速度的文本）

**步骤 5：每帧轨迹绘制**

- **操作对象**：Canvas 2D 上下文（全量重绘模式）
- **具体操作**：
  1. 使用独立 `requestAnimationFrame` 驱动（30fps 即可，相空间图变化慢于仿真帧率）
  2. 每帧执行：
     a. **清空绘制区**：`ctx.clearRect(margin.left, margin.top, plotWidth, plotHeight)`
     b. **绘制轨迹**（从旧到新，渐变透明度和颜色）：

        ```typescript
        const len = trailBuffer.length;
        for (let i = 0; i < len; i++) {
          const { theta, thetaDot } = trailBuffer[i];
          const alpha = 0.05 + (i / len) * 0.75;  // 旧点透明 5%，新点 80%
          const x = xScale(theta);
          const y = yScale(thetaDot);
          // 轨迹颜色：从暗蓝渐变到亮青
          const r = Math.round(30 + (i / len) * 25);
          const g = Math.round(80 + (i / len) * 175);
          const b = Math.round(150 + (i / len) * 105);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);  // 小矩形模拟点
        }
        ```

     c. **绘制当前位置高亮**：

        ```typescript
        const last = trailBuffer[len - 1];
        if (last) {
          const cx = xScale(last.theta);
          const cy = yScale(last.thetaDot);
          // 外发光
          ctx.fillStyle = "rgba(0, 255, 255, 0.25)";
          ctx.beginPath();
          ctx.arc(cx, cy, cursorRadius * 2, 0, Math.PI * 2);
          ctx.fill();
          // 核心点
          ctx.fillStyle = "#00ffff";
          ctx.beginPath();
          ctx.arc(cx, cy, cursorRadius, 0, Math.PI * 2);
          ctx.fill();
          // 白色高光
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(cx, cy, cursorRadius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ```

  3. 轨迹点超过 `maxTrailPoints` 时，旧点在 `shift` 后自然被清除
- **输入来源**：`trailBuffer`（模块内部数组）
- **输出去向**：Canvas 像素更新
- **失败行为**：`trailBuffer` 为空 → 仅清空绘图区

**步骤 6：数值标签更新**

- **操作对象**：Canvas 下方的 DOM 文本元素
- **具体操作**：
  1. React 组件使用 `useSimulationStore` hook 订阅当前帧的状态值（低频更新，每 10 帧触发一次 React 重渲染）
  2. 渲染当前变量对的数值：

     ```tsx
     function PhaseValueLabel() {
       const activeVar = usePhaseStore(s => s.activeVariable);
       const theta1 = useSimulationStore(s => s.theta1);
       const theta1Dot = useSimulationStore(s => s.theta1Dot);
       const theta2 = useSimulationStore(s => s.theta2);
       const theta2Dot = useSimulationStore(s => s.theta2Dot);

       const theta = activeVar === "theta1" ? theta1 : theta2;
       const thetaDot = activeVar === "theta1" ? theta1Dot : theta2Dot;

       return (
         <div className="flex gap-4 text-xs font-mono text-muted-foreground">
           <span>θ = {theta.toFixed(3)} rad</span>
           <span>θ̇ = {thetaDot.toFixed(3)} rad/s</span>
         </div>
       );
     }
     ```

  3. 使用 `useSimulationStore` 的 `equalityFn` 做浅比较去抖（`(a, b) => a.theta1 === b.theta1 && ...`），减少无效重渲染
- **输入来源**：`useSimulationStore` 的当前状态字段
- **输出去向**：DOM 文本更新
- **失败行为**：字段为 NaN → 显示 "--"

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand (useSimulationStore) | `useSimulationStore(s => s.theta1)` 等 | 订阅每帧状态值 |
| D3.js | `d3.scaleLinear` `d3.axisBottom` `d3.axisLeft` | Canvas 坐标映射 |
| shadcn/ui | `Card` `Toggle` `Tooltip` | 面板容器和变量切换 |

**对外暴露的公共接口**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| LAB-04 实验报告生成器 | `exportPhaseSpaceImage(4)` → Data URL | 4K PNG 截图嵌入 PDF 报告 |
| DAT-02 数据导出 | `exportPhaseSpaceImage(4)` → Data URL | 4K PNG 独立导出 |

### 状态机

变量对切换状态机（极简，仅 2 状态）：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `theta1` | 用户点击 "θ₂-θ̇₂" Toggle | `theta2` | 无 | 清空 `trailBuffer`；重设 Y 轴 domain 为 `[-5, 5]`；重绘坐标轴标签 |
| `theta2` | 用户点击 "θ₁-θ̇₁" Toggle | `theta1` | 无 | 同上 |
| 任意 | 仿真 reset | 不变 | 无 | 清空 `trailBuffer`；保留当前 `activeVariable` |

### 异常与边界条件

#### 异常 1：轨迹在 ±π 边界断裂

- **触发条件**：θ 值从接近 π 跳变到接近 -π（或反之），轨迹在相空间中横跨整个图幅绘制一条直线
- **处理策略**：
  1. 步骤 1 的 `theta` 归一化保证值在 `(-π, π]`
  2. 在追加新点前检测 `|newTheta - lastTheta| > π`（角度跨越 ±π 边界）
  3. 若检测到跨越 → 不绘制连接线，从新位置开始新的轨迹段（`trailBuffer` 中标记为断点）
  4. `trailBuffer` 中额外存储 `isBreak: boolean` 字段；Canvas 渲染遇到断点时 `ctx.moveTo` 跳转而非 `ctx.lineTo`
  5. 实际上，由于我们使用点绘（小矩形），而非连线，跨越问题天然不存在 — 但视觉上点会在 ±π 边界处"消失"然后从另一侧"出现"。这是物理正确的（角度循环），无需特殊处理
- **重试参数**：自动处理，不影响渲染

#### 异常 2：Y 轴范围在混沌区急剧扩展

- **触发条件**：混沌运动中角速度可达 ±50 rad/s，远超初始 `[-5, 5]` 范围
- **处理策略**：
  1. 步骤 3 的 Y 轴自适应每 60 帧检查一次
  2. 范围扩展时使用指数移动平均平滑过渡：`newDomain = oldDomain * 0.8 + observedDomain * 0.2`，避免坐标轴频繁抖动
  3. Y 轴扩展后重绘刻度线
  4. 轨迹点可能暂时超出 Y 轴范围 → 被裁剪在绘图区边缘（Canvas `ctx.save/restore` + `clip` 路径）
- **重试参数**：自动适应，EMA 平滑因子 0.2

#### 异常 3：变量对切换时旧 Canvas 内容残留

- **触发条件**：用户在 `theta1` 和 `theta2` 之间切换
- **处理策略**：
  1. 切换时立即全量清空 Canvas：`ctx.clearRect(0, 0, width, height)`
  2. 重绘静态元素（背景、网格、坐标轴、标签）
  3. `trailBuffer` 清空 → 下一帧的步骤 5 从空 buffer 开始，不绘制任何轨迹
  4. 新变量对的轨迹从下一帧开始累积
- **重试参数**：无

#### 异常 4：长时间运行轨迹点过多导致 Canvas 绘制卡顿

- **触发条件**：`trailBuffer.length` 超过 5000 点，每帧遍历 5000+ 点绘制小矩形
- **处理策略**：
  1. `maxTrailPoints` 默认 3000，硬上限在追加时自动 `shift` 旧点
  2. 每 10 帧执行一次"稀疏化"：若 `trailBuffer.length > maxTrailPoints * 0.9` → 隔点保留（保留奇数索引点），点数减半
  3. 稀疏化后视觉效果几乎不变（3000 → 1500 点仍密集），但绘制时间减半
  4. 若 `deviceType === "mobile"` → `maxTrailPoints` 降为 1000
- **重试参数**：自动稀疏化，无需人工介入

#### 异常 5：仿真暂停后轨迹不更新

- **触发条件**：仿真暂停（`isRunning === false`），Zustand store 中 `theta1`/`theta1Dot` 等不再更新
- **处理策略**：
  1. 本模块的 rAF 循环检查 `useSimulationStore.getState().isRunning`
  2. 若 `isRunning === false` → 跳过步骤 5（不追加新点，不清空 Canvas），保持最后一帧的画面
  3. 当前位置高亮点保持渲染（冻结在最后一帧位置）
  4. 仿真恢复（`isRunning === true`）→ rAF 循环恢复更新
- **重试参数**：无需处理，行为正确

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §一 1.1 | 分层递进认知 | 本模块仅展示相空间轨迹（分析层可视化），不做物理解释（解释由 LAB-01/EXP-05 教学注释负责） |
| 功能设计_v0 §十 P0 | 第一版已有基础 | 相空间图为 P0 优先级，必须实现；功能简洁（二选一变量对 + 实时轨迹），不引入额外复杂度 |
| 技术栈设计 §3.2 | Canvas 高性能渲染 | 使用 Canvas 2D 点绘（非 SVG circle），3000 点绘制 < 2ms；D3 scale 仅在切换/resize 时重建 |
| 通用原则 | 实时性 | Y 轴自适应延迟 < 60 帧（1s）；当前位置更新延迟 < 2 帧（~33ms） |

### 验收测试场景

#### 正向测试 1：θ₁-θ̇₁ 相空间默认渲染

- **Given**：
  - 仿真已启动，默认参数（两个摆初始 π/2 静止释放）
  - `activeVariable = "theta1"`
- **When**：仿真运行 5 秒（300 帧）
- **Then**：
  - Canvas 上显示约 300 个轨迹点（暗蓝→亮青渐变）
  - 当前位置显示为青色发光圆点（外发光 + 白色高光核心）
  - X 轴范围为 `[-π, π]`，刻度标注在 `-π`/`-π/2`/`0`/`π/2`/`π`
  - Y 轴初始范围 `[-5, 5]`，标签 "θ̇ (rad/s)"
  - Canvas 下方显示 "θ = x.xxx rad  θ̇ = x.xxx rad/s" 数值
  - 轨迹形态为有规律的闭合或准周期图案（非混沌参数下）

#### 正向测试 2：切换到 θ₂-θ̇₂

- **Given**：正向测试 1 的状态（`theta1` 已累积 300 点轨迹）
- **When**：用户点击 "θ₂-θ̇₂" Toggle 按钮
- **Then**：
  - Canvas 立即清空（旧 `theta1` 轨迹消失）
  - 坐标轴标签更新为 "θ₂ (rad)" / "θ̇₂ (rad/s)"
  - `trailBuffer` 清空 → 从下一帧开始累积 `theta2` 新轨迹
  - 数值标签切换为显示 θ₂ 和 θ̇₂
  - 切换过程无闪烁或残留

#### 正向测试 3：长时间运行轨迹稀疏化

- **Given**：仿真持续运行 100 秒（6000 帧）
- **When**：`maxTrailPoints = 3000`
- **Then**：
  - `trailBuffer.length` 始终 ≤ 3000
  - 旧轨迹点自动移除，新点持续追加
  - Canvas 绘制性能保持 < 3ms/帧
  - 轨迹的"新鲜"部分（最近 1000 点）亮度高，"陈旧"部分（最远 3000 点）逐渐透明化
  - 无内存泄漏（buffer 大小恒定）

#### 异常测试 1：仿真暂停后画面冻结

- **Given**：仿真运行 300 帧，`isRunning = true`
- **When**：用户点击暂停按钮 → `isRunning = false`
- **Then**：
  - `trailBuffer` 停止追加新点
  - Canvas 画面保持最后一帧的内容（不清空）
  - 当前位置高亮圆点冻结在暂停时的位置
  - 数值标签保持暂停时的值
  - 恢复仿真后画面继续更新

#### 异常测试 2：NaN 状态值不污染轨迹

- **Given**：仿真正常运行中
- **When**：模拟 SIM-01 写入 `theta1 = NaN`（积分发散前瞬态）
- **Then**：
  - 步骤 1 检测 `isNaN(theta)` → 跳过本帧追加
  - `trailBuffer` 保持上一次有效点
  - Canvas 上不出现 NaN 点的渲染 artifacts
  - 数值标签显示 "--" 而非 NaN
  - 下一帧有效值恢复后正常追加

### 注意事项与禁止行为

1. **【角度归一化位置】** θ 归一化必须在步骤 1（追加 `trailBuffer` 前）执行，而非在 Canvas 渲染时。原因是 `trailBuffer` 中的值后续可能被其他模块消费（DAT-02 数据导出），需确保存储的即是归一化值。
2. **【Canvas 全量重绘 vs 增量绘制】** 本模块使用全量重绘（每帧 clearRect + 遍历 buffer 重绘所有点），而非增量绘制（仅追加新点）。原因是：a) Canvas 不支持图层，增量绘制时旧点无法单独更新透明度；b) 3000 点的遍历绘制时间 < 2ms，全量重绘性能可接受。若将来 `maxTrailPoints` 调整到 > 10000，再考虑分层 Canvas（静态背景层 + 动态轨迹层）。
3. **【Y 轴自适应 vs 庞加莱截面】** 本模块与 ANL-03（庞加莱截面）共享 `theta`/`thetaDot` 坐标空间，但渲染模式完全不同：本模块是连续的轨迹点序列，ANL-03 是离散的截面穿越散点。两者的 Canvas 实例独立，不共享渲染上下文。
4. **【D3 scale 重建时机】** `xScale` 固定 domain `[-π, π]`，仅在 resize 时重建。`yScale` 的 domain 在自适应更新时调用 `yScale.domain([newMin, newMax])` 无需重建 scale 对象（D3 scale 的 domain 可动态修改，`range` 不变）。仅在 `activeVariable` 切换或 resize 时创建新 scale 对象。
5. **【禁止行为】** 禁止将 `trailBuffer` 存储在 Zustand 中（3000 点 × 2 浮点 × 8 字节 = 48KB，每个 Zustand 状态快照都会复制一份，导致内存膨胀）。必须使用 `useRef<Point[]>` 持有。
6. **【禁止行为】** 禁止对 θ 和 θ̇ 做不必要的单位转换（全程使用弧度，仅在坐标轴标签上标注 "rad"）。前端不显示角度制转换。
7. **【易错点】** Canvas 的 `width`/`height` 属性修改后，2D 上下文的状态（`scale`、`fillStyle`、`strokeStyle` 等）会重置为默认值。每次 resize 后必须重新调用 `ctx.scale(devicePixelRatio, devicePixelRatio)` 和重建 D3 渲染管线。
8. **【易错点】** 当前点的高亮圆使用 `ctx.arc()`，在密集轨迹区域可能被后续绘制的轨迹点覆盖。绘制顺序必须是：先绘制轨迹点（因为包含旧点），最后绘制当前高亮圆心（确保始终在最上层）。
9. **【偷懒红线】** 禁止使用 `<svg>` + `<circle>` 渲染轨迹。"3000 个 SVG circle 元素的 DOM 操作" 在 30fps 下不可接受，必须使用 Canvas 2D。
