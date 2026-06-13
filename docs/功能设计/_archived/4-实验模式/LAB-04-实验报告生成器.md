# 功能点：LAB-04 实验报告生成器

> **文档生成时间**：2026-04-28 22:06:30 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 22:06:30 | AI Assistant | 初始版本，对齐已有 `useLabStore.reportGenerating` + jsPDF/jspdf-autotable 技术选型 + SIM-04/SIM-05 Canvas 截图接口 |

> **冲突核查指引**：本模块使用 `useLabStore.reportGenerating`（已存在于 `src/features/lab/store.ts`）。通过 Canvas `toDataURL()` 截取 SIM-04 能量曲线和 SIM-05 相空间图，不修改这两个模块的内部状态。页脚署名水印使用与 STY-02 相同的团队名/作品名常量。无冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §五 5.4「一键实验报告生成」；功能模块全拆解 §四 LAB-04「实验报告生成器」；技术栈设计 §2 #18（jsPDF）、§4.10「一键实验报告生成」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供当前仿真参数（`m1, m2, L1, L2, g, damping`）、初始条件、当前状态向量
  - `SIM-04`（能量实时监控）— 提供能量数据的 Canvas 截图（`kineticEnergy` / `potentialEnergy` / `totalEnergy` 曲线）
  - `SIM-05`（相空间可视化）— 提供相空间图的 Canvas 截图（`theta-omega` 轨迹图）
  - `EXP-01`（3D 仿真场景）— 提供 3D 场景的关键帧截图（4 张：初始/中期/分离或混沌/稳态）
  - `DAT-02`（数据导出）— 共享 PNG 导出基础设施（`Canvas.toDataURL` / `Canvas.toBlob` 模式）
- **被依赖模块**：无（终端输出模块，被用户直接消费）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `LAB-01-受力拆解视图.md` v1.0：共享 `useLabStore`，LAB-01 使用 `coordinateSystem` 字段，本模块使用 `reportGenerating` 字段，无冲突
  - `LAB-02-物理验证套件.md` v1.0：本模块的"误差分析"节可引用 LAB-02 的验证结果（若用户运行过验证），但本模块独立计算能量漂移，不依赖 LAB-02 的状态
  - `LAB-03-用户可编程沙箱.md` v1.0：共享 `useLabStore`，LAB-03 使用 `userCode`/`codeStatus`/`codeError`，本模块使用 `reportGenerating`，字段无冲突
  - `SIM-04-能量实时监控.md` v2.0：本模块通过 Canvas `toDataURL()` 截取能量曲线图；SIM-04 的 Canvas 元素需暴露 ref 或通过 DOM 查询获取
  - `SIM-05-相空间可视化.md` v1.0：本模块通过 Canvas `toDataURL()` 截取相空间图；SIM-05 需以相同方式提供 Canvas 访问
  - `STY-02-演示模式.md` v1.0：`WATERMARK_CONFIG.text` 常量（"双摆混沌实验室 / Chaos Pendulum Lab"）——本模块页脚署名复用同一团队名和作品名
- **兼容性结论**：
  - 所有截图目标（3D Canvas、能量曲线 Canvas、相空间图 Canvas）通过 DOM 查询或 ref 转发获取，不修改被截图模块的内部状态
  - Canvas 截图依赖 `preserveDrawingBuffer: true`（WebGL 上下文属性），需在 EXP-01 的 `<Canvas>` 配置中显式设置（R3F 默认不保留绘制缓冲）
  - 页脚署名与 STY-02 保持一致的团队名/作品名
  - 无冲突
- **复用的已有定义**：`useLabStore.reportGenerating`、`useSimulationStore`（参数和状态）、`WATERMARK_CONFIG.text`（STY-02）、jsPDF 2.x + jspdf-autotable 3.x

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 组件（导出按钮 + 生成进度遮罩）
  - `jspdf@^2.5.2` — PDF 文档生成（A4 竖版，mm 单位坐标系）
  - `jspdf-autotable@^3.8.3` — PDF 表格（参数设置表、误差分析表）
  - `zustand@^4.5.5` — `useLabStore.reportGenerating` + `useSimulationStore` 读取仿真数据
  - `shadcn/ui`（Copy 模式）— `Button`（"导出报告"按钮）、`Dialog`（生成进度弹窗）、`Alert`（生成失败提示）
  - `lucide-react` — `FileText`（报告图标）、`Download`（导出按钮图标）、`Loader2`（生成中旋转动画）
  - `tailwindcss@^3.4.16` — 按钮和弹窗样式
  - TypeScript 5.x
- **禁止使用**：
  - 禁止使用服务端 PDF 生成方案（Puppeteer、Headless Chrome 渲染 PDF 等）——项目为纯客户端，PDF 必须在浏览器中通过 jsPDF 前端合成
  - 禁止依赖外部 CDN 加载中文字体（jsPDF 默认字体不支持中文，必须通过 `jsPDF.addFont()` 嵌入 Base64 编码的中文字体子集）
  - 禁止使用 `<canvas>.toBlob()` 异步截图后不等待完成就继续生成 PDF（截图是异步的，必须 `Promise.all()` 等待全部截图完成后再开始 PDF 合成）

### 输入定义（精确类型）

#### 报告生成配置

```typescript
// ============================================================
// 实验报告的内容配置与数据输入
// 位置：src/features/lab/report/report-config.ts
// ============================================================

/**
 * 报告生成配置。
 * 用户可通过 UI 修改部分字段（如实验标题、实验目的），其余字段从仿真状态自动填充。
 */
interface ReportConfig {
  /**
   * 实验标题。
   * 默认："双摆混沌实验室 — 物理实验报告"
   * 用户可在导出前通过输入框自定义。
   */
  title: string;

  /**
   * 实验目的。
   * 默认：根据当前仿真模式自动生成——
   *   - 探索模式："观察双摆系统在给定初始条件下的运动行为，记录轨迹与能量变化"
   *   - 分析模式："分析特定参数区间内双摆系统的混沌特征，包括 Lyapunov 指数与分岔结构"
   *   - 实验模式："验证双摆系统在自定义模型/受力分析下的物理性质"
   *   - 故事模式：不适用（story 模式下禁用报告导出）
   * 用户可在导出前通过 textarea 自定义。
   */
  purpose: string;

  /**
   * 实验者姓名/学号。
   * 默认：空字符串（用户自行填写）
   */
  experimenter: string;

  /**
   * 是否在报告中包含当前 3D 场景截图。
   * 默认：true
   */
  includeScreenshot3D: boolean;

  /**
   * 是否在报告中包含能量曲线图。
   * 默认：true
   */
  includeEnergyChart: boolean;

  /**
   * 是否在报告中包含相空间图。
   * 默认：true
   */
  includePhaseSpaceChart: boolean;

  /**
   * 截图分辨率倍数（相对于 Canvas 当前尺寸）。
   * 1 = 原始分辨率，2 = 2× 超采样（推荐），4 = 4×（4K 级别）
   * 默认：2
   */
  screenshotScale: 1 | 2 | 4;
}
```

#### 报告数据输入（从各 Store/Canvas 收集）

```typescript
// ============================================================
// 生成报告时从各数据源收集的完整输入
// ============================================================

interface ReportInputData {
  /** 报告配置 */
  config: ReportConfig;

  /** 物理参数 */
  params: {
    m1: number; m2: number;
    L1: number; L2: number;
    g: number; damping: number;
  };

  /** 初始条件 */
  initialConditions: {
    theta1: number; theta1Dot: number;
    theta2: number; theta2Dot: number;
  };

  /** 当前仿真状态 */
  currentState: {
    t: number;                     // 当前仿真时间 (s)
    theta1: number; theta1Dot: number;
    theta2: number; theta2Dot: number;
    kineticEnergy: number;
    potentialEnergy: number;
    totalEnergy: number;
  };

  /** 仿真统计（从 RingBuffer 或 Store 中提取） */
  simulationStats: {
    /** 仿真运行总时长 (s) */
    totalSimTime: number;
    /** 仿真帧数 */
    totalFrames: number;
    /** 积分方法 */
    method: string;
    /** 积分步长 (s) */
    dt: number;
  };

  /** 能量统计 */
  energyStats: {
    /** 初始总能量 (J) */
    energyInitial: number;
    /** 总能量最大值 (J) */
    energyMax: number;
    /** 总能量最小值 (J) */
    energyMin: number;
    /** 能量相对漂移（比例，非百分比） */
    drift: number;
  };

  /** Canvas 截图（Base64 Data URL） */
  screenshots: {
    /** 3D 场景关键帧截图（4 张） */
    scene3D: string[];             // Data URL 数组，长度 4
    /** 能量曲线图截图（1 张） */
    energyChart: string;           // Data URL
    /** 相空间图截图（1 张） */
    phaseSpaceChart: string;       // Data URL
  };

  /** 混沌判定信息 */
  chaosAssessment: {
    /** 当前系统是否处于混沌状态（基于能量漂移 + 状态分离度估算） */
    isChaotic: boolean;
    /** 判定依据文本 */
    reasoning: string;
  };

  /** 生成时间戳 (ISO 8601) */
  generatedAt: string;
}
```

#### 关键帧选取算法输入

```typescript
// ============================================================
// 4 帧自动选取——从 RingBuffer / sandboxTrajectory 中选取
// ============================================================

interface KeyframeSelector {
  /**
   * 帧 1：初始帧。
   * 选取规则：t = 0 或仿真开始后第 1 帧。
   */
  frameInitial: number;          // RingBuffer 中的帧索引

  /**
   * 帧 2：中期帧。
   * 选取规则：t = totalSimTime × 0.3 处最近的帧（约 30% 进度）
   */
  frameMid: number;

  /**
   * 帧 3：分离或混沌帧。
   * 选取规则：
   *   - 若 theta1/theta2 的时间导数方差超过阈值 → 选取方差最大时刻的帧
   *   - 否则 → 选取 t = totalSimTime × 0.7 处最近的帧
   */
  frameChaos: number;

  /**
   * 帧 4：稳态帧。
   * 选取规则：仿真最后一帧（当前状态）。
   */
  frameSteady: number;
}

/** 关键帧选取的参数 */
interface KeyframeSelectionParams {
  /** 总仿真帧数 */
  totalFrames: number;
  /** 总仿真时间 (s) */
  totalSimTime: number;
  /** theta1 序列（用于方差计算） */
  theta1Series: Float64Array;
  /** theta2 序列（用于方差计算） */
  theta2Series: Float64Array;
}
```

### 输出定义（精确类型）

#### PDF 报告结构

生成的 A4 PDF（210mm × 297mm，竖版）包含以下页和节：

```
第 1 页 — 封面与基础信息
┌──────────────────────────────┐
│                              │
│    双摆混沌实验室               │  ← 标题（18pt，居中，加粗）
│    物理实验报告                │  ← 副标题（14pt）
│                              │
│  实验者：_____________        │  ← 12pt
│  日期：2026-04-28 22:06      │  ← 自动填充
│  仿真方法：RK4 固定步长        │
│  仿真时长：XXX 秒             │
│                              │
│  ┌──────────────────────┐   │
│  │                      │   │  ← 3D 场景关键帧拼贴（2×2 网格）
│  │  初始    │  中期      │   │     每格标注帧类型和时间
│  │  t=0s    │  t=Xs     │   │
│  │──────────┼───────────│   │
│  │  混沌    │  稳态      │   │
│  │  t=Xs    │  t=Xs     │   │
│  └──────────────────────┘   │
│                              │
└──────────────────────────────┘

第 2 页 — 参数与数据
┌──────────────────────────────┐
│  一、实验目的                 │
│  （来自 config.purpose）      │
│                              │
│  二、参数设置                 │
│  ┌──────────────────────┐   │
│  │ 参数      │ 值    │ 单位│   │  ← jspdf-autotable
│  │ m₁       │ 1.0   │ kg  │   │
│  │ m₂       │ 1.0   │ kg  │   │
│  │ L₁       │ 1.0   │ m   │   │
│  │ L₂       │ 1.0   │ m   │   │
│  │ g        │ 9.81  │m/s² │   │
│  │ damping  │ 0     │ 1/s │   │
│  │ θ₁(0)    │ 90°   │ deg │   │
│  │ θ̇₁(0)   │ 0     │rad/s│   │
│  │ θ₂(0)    │ 90°   │ deg │   │
│  │ θ̇₂(0)   │ 0     │rad/s│   │
│  └──────────────────────┘   │
│                              │
│  三、数据图表                 │
│  ┌──────────────────────┐   │
│  │  [能量曲线图]          │   │  ← Canvas 截图
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │  [相空间图]            │   │  ← Canvas 截图
│  └──────────────────────┘   │
└──────────────────────────────┘

第 3 页 — 结论与误差分析
┌──────────────────────────────┐
│  四、物理结论                 │
│  基于当前仿真数据的混沌判定：    │
│  - 能量漂移：X.XX%             │
│  - 状态分离度：...             │
│  - 结论：该系统当前处于         │
│    [周期/准周期/混沌] 运动状态   │
│                              │
│  五、误差分析                 │
│  ┌──────────────────────┐   │
│  │ 误差来源   │ 量级  │ 说明│   │  ← jspdf-autotable
│  │ 数值积分   │ O(dt⁴)│ RK4 │   │
│  │ 浮点精度   │ 1e-15 │ ... │   │
│  │ 模型假设   │ —    │ ... │   │
│  └──────────────────────┘   │
│                              │
│  ──────────────────────────  │
│  双摆混沌实验室               │  ← 页脚
│  Chaos Pendulum Lab          │
│  生成时间：2026-04-28 22:06   │
└──────────────────────────────┘
```

#### 页面布局常量

```typescript
// ============================================================
// A4 PDF 布局常量（所有尺寸单位为 mm，jsPDF 默认单位）
// ============================================================

const PAGE = {
  width: 210,          // A4 宽度 (mm)
  height: 297,         // A4 高度 (mm)
  marginLeft: 20,      // 左边距
  marginRight: 20,     // 右边距
  marginTop: 20,       // 上边距
  marginBottom: 25,    // 下边距（为页脚留空间）
  contentWidth: 170,   // 内容区宽度 = 210 - 20 - 20
};

const FONT = {
  title: { size: 18, style: "bold" },
  subtitle: { size: 14, style: "normal" },
  heading: { size: 13, style: "bold" },
  body: { size: 10, style: "normal" },
  tableHeader: { size: 9, style: "bold" },
  tableBody: { size: 9, style: "normal" },
  footer: { size: 8, style: "italic" },
};

const SCREENSHOT = {
  /** 截图的 PDF 宽度 (mm)。4 帧以 2×2 网格排列，单帧宽度 */
  width: 78,           // (contentWidth - gap) / 2 = (170 - 14) / 2 ≈ 78
  /** 截图的 PDF 高度 (mm)。保持 Canvas 宽高比 */
  height: 55,           // 基于 3D Canvas 的 aspect ratio (~1.42)
  /** 截图间距 (mm) */
  gap: 14,
};
```

### 核心逻辑步骤

#### 步骤 1：报告入口——导出按钮

- **操作对象**：`<Button>` 组件（在实验模式面板中渲染）
- **具体操作**：
  1. 渲染"导出报告"按钮（图标 `FileText`，标签"导出实验报告"）
  2. 按钮位于实验模式面板底部或工具栏
  3. 点击 → 弹出 `<Dialog>` 确认/配置弹窗：
     ```tsx
     <Dialog>
       <DialogTrigger asChild>
         <Button variant="outline">
           <FileText className="h-4 w-4 mr-2" />
           导出实验报告
         </Button>
       </DialogTrigger>
       <DialogContent>
         <DialogHeader>
           <DialogTitle>实验报告设置</DialogTitle>
           <DialogDescription>确认以下信息后生成 A4 PDF 报告</DialogDescription>
         </DialogHeader>
         <div className="space-y-4">
           {/* 实验标题输入 */}
           <Label>实验标题</Label>
           <Input value={title} onChange={setTitle} />

           {/* 实验目的输入 */}
           <Label>实验目的</Label>
           <Textarea value={purpose} onChange={setPurpose} rows={3} />

           {/* 实验者姓名 */}
           <Label>实验者</Label>
           <Input value={experimenter} onChange={setExperimenter} placeholder="姓名/学号" />

           {/* 包含内容勾选 */}
           <div className="flex gap-4">
             <Checkbox checked={includeScreenshot3D}>含 3D 截图</Checkbox>
             <Checkbox checked={includeEnergyChart}>含能量图</Checkbox>
             <Checkbox checked={includePhaseSpaceChart}>含相空间图</Checkbox>
           </div>
         </div>
         <DialogFooter>
           <Button onClick={generateReport} disabled={reportGenerating}>
             {reportGenerating ? <Loader2 className="animate-spin" /> : <Download />}
             {reportGenerating ? "生成中..." : "生成报告"}
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
     ```
  4. `title` 默认值：`"双摆混沌实验室 — 物理实验报告"`
  5. `purpose` 默认值：根据当前模式自动填充（见 `ReportConfig.purpose` 默认值规则）
  6. 确认弹窗的"生成报告"按钮调用 `generateReport()`
- **输入来源**：用户填写/确认的配置表单
- **输出去向**：`generateReport()` 函数调用
- **失败行为**：必填字段为空 → 按钮 disabled（`title.trim() === ""`）

#### 步骤 2：收集报告数据

- **操作对象**：`useSimulationStore`、`useLabStore`、DOM 中的 Canvas 元素
- **具体操作**：
  1. 设置 `useLabStore.getState().setReportGenerating(true)`
  2. 显示全屏生成进度遮罩："正在生成实验报告..."
  3. 从 `useSimulationStore.getState()` 收集参数和状态：
     ```typescript
     const simStore = useSimulationStore.getState();
     const input: Partial<ReportInputData> = {
       config: { title, purpose, experimenter, ... },
       params: { ...simStore.params },
       initialConditions: { ...simStore.initialConditions },
       currentState: {
         t: simStore.t, theta1: simStore.theta1, theta1Dot: simStore.theta1Dot,
         theta2: simStore.theta2, theta2Dot: simStore.theta2Dot,
         kineticEnergy: simStore.kineticEnergy,
         potentialEnergy: simStore.potentialEnergy,
         totalEnergy: simStore.totalEnergy,
       },
       simulationStats: {
         totalSimTime: simStore.t,
         totalFrames: Math.floor(simStore.t * 60),
         method: simStore.method,
         dt: 1/60,
       },
       energyStats: {
         energyInitial: simStore.energyInitial ?? simStore.totalEnergy,
         energyMax: simStore.totalEnergy,   // 简化：用当前值；实际应从 RingBuffer 统计
         energyMin: simStore.totalEnergy,
         drift: simStore.energyDrift,
       },
       generatedAt: new Date().toISOString(),
     };
     ```
  4. 若 `trajectorySource === "sandbox"`，从 `sandboxTrajectory` 读取数据；否则从 RingBuffer 读取
- **输入来源**：各 Zustand store 的当前状态
- **输出去向**：`ReportInputData` 结构体（不含截图）
- **失败行为**：仿真从未运行（`t === 0` 且无历史数据）→ 提示"请先运行仿真以生成报告数据"，终止生成

#### 步骤 3：截取 Canvas 图片

- **操作对象**：DOM 中的 3D Canvas（WebGL）、能量曲线 Canvas（2D）、相空间图 Canvas（2D）
- **具体操作**：
  1. **3D 场景关键帧**（4 张）：
     - 3D Canvas 为 WebGL 上下文，需在创建时设置 `preserveDrawingBuffer: true`（R3F `<Canvas>` 的 `gl={{ preserveDrawingBuffer: true }}` prop）
     - 从 RingBuffer 或 sandboxTrajectory 中按关键帧选取算法（步骤 4）找到 4 个时间点
     - 对于每个关键帧：
       a. 将仿真状态设置到该帧（通过 `useSimulationStore.setState({ theta1, theta1Dot, theta2, theta2Dot, x1, y1, x2, y2 })` 临时设置顶层字段）
       b. 等待一个 rAF 周期（确保 3D 场景已渲染该帧）
       c. 调用 `canvas.toDataURL("image/png")` 截取
       d. 恢复当前仿真状态
     - 若 `screenshotScale > 1`，先通过 OffscreenCanvas 缩放实现超采样：
       ```typescript
       async function captureHighRes(
         sourceCanvas: HTMLCanvasElement,
         scale: number
       ): Promise<string> {
         const w = sourceCanvas.width * scale;
         const h = sourceCanvas.height * scale;
         const offscreen = new OffscreenCanvas(w, h);
         const ctx = offscreen.getContext("2d")!;
         ctx.drawImage(sourceCanvas, 0, 0, w, h);
         const blob = await offscreen.convertToBlob({ type: "image/png" });
         return URL.createObjectURL(blob);
       }
       ```
  2. **能量曲线图**（1 张）：
     - 通过 DOM 查询获取 SIM-04 的 `<canvas>` 元素：`document.querySelector("[data-report-canvas='energy']")`
     - 要求 SIM-04 在 Canvas 元素上设置 `data-report-canvas="energy"` 属性
     - 直接调用 `canvas.toDataURL("image/png")`
     - 无需超采样（2D Canvas 可通过 `canvas.width/height` 属性设置分辨率）
  3. **相空间图**（1 张）：
     - 通过 DOM 查询获取 SIM-05 的 `<canvas>` 元素：`document.querySelector("[data-report-canvas='phase-space']")`
     - 同能量曲线图方式截取
  4. 全部截图以 Base64 Data URL 字符串数组形式收集到 `input.screenshots`
- **输入来源**：DOM 中的 Canvas 元素 + 关键帧时间索引
- **输出去向**：`ReportInputData.screenshots` 填充完毕
- **失败行为**：
  - Canvas 元素不存在（对应面板未渲染或 feature 未挂载）→ 该项截图为 null，报告中跳过该图片并注明"未捕获"
  - `preserveDrawingBuffer: false`（WebGL Canvas 默认）→ `toDataURL()` 返回空白图片 → 在初始化阶段检测并 console.error 提示

#### 步骤 4：关键帧自动选取

- **操作对象**：RingBuffer 或 sandboxTrajectory 中的轨迹数据
- **具体操作**：
  1. **帧 1 — 初始帧**：`index = 0`（第一帧）
  2. **帧 2 — 中期帧**：`index = Math.floor(totalFrames × 0.3)`
  3. **帧 3 — 分离/混沌帧**：
     ```typescript
     function selectChaosFrame(theta2Series: Float64Array, windowSize: number): number {
       // 滑动窗口计算 theta2 的局部方差
       let maxVariance = 0;
       let maxVarianceIndex = Math.floor(theta2Series.length * 0.5);
       for (let i = windowSize; i < theta2Series.length - windowSize; i++) {
         const window = theta2Series.subarray(i - windowSize, i + windowSize);
         const mean = window.reduce((a, b) => a + b) / window.length;
         const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
         if (variance > maxVariance) {
           maxVariance = variance;
           maxVarianceIndex = i;
         }
       }
       return maxVarianceIndex;  // theta2 方差最大时刻的帧——运动最"混沌"
     }
     ```
     窗口大小 `windowSize = Math.floor(totalFrames * 0.1)`（覆盖 10% 的仿真时长）
  4. **帧 4 — 稳态帧**：`index = totalFrames - 1`（最后一帧）
  5. 若 `totalFrames < 4`（仿真运行不足 4 帧）→ 所有帧取最后一帧（退化处理）
- **输入来源**：`KeyframeSelectionParams`
- **输出去向**：4 个帧索引 → 步骤 3 中用于设置仿真状态并截图
- **失败行为**：`theta2Series` 为空或 NaN → 帧 3 退化为 `Math.floor(totalFrames × 0.7)`

#### 步骤 5：PDF 合成

- **操作对象**：`jsPDF` 实例（A4 竖版）
- **具体操作**：
  1. 创建 jsPDF 实例：`const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })`
  2. 中文支持：加载嵌入的中文字体（从 Base64 字符串）：
     ```typescript
     // 中文字体需预编译为 Base64 并嵌入项目
     // 使用 jsPDF 的 addFont 方法注册自定义字体
     // 推荐字体：Noto Sans SC（思源黑体）子集，约 200KB 覆盖常用汉字
     // 或降级为 ASCII-only 并用英文撰写报告（P2 阶段可接受的降级方案）

     // 方案 A：嵌入中文字体子集（推荐）
     // import { NOTO_SANS_SC_BASE64 } from "./fonts/noto-sans-sc-subset";
     // doc.addFileToVFS("NotoSansSC-Regular.ttf", NOTO_SANS_SC_BASE64);
     // doc.addFont("NotoSansSC-Regular.ttf", "NotoSansSC", "normal");
     // doc.setFont("NotoSansSC");

     // 方案 B：降级为 ASCII（P2 v1.0 可接受）
     // 报告文本使用英文撰写，仅参数名/署名保留中文（用 Canvas 截图替代文本渲染）
     doc.setFont("helvetica");
     ```
  3. **第 1 页 — 封面**：
     - 标题（居中，18pt，加粗）：`doc.setFontSize(18); doc.text(title, 105, 30, { align: "center" })`
     - 副标题（居中，14pt）：`doc.text("实验报告", 105, 38, { align: "center" })`
     - 元信息行（12pt，左对齐，y=50 起）：
       - `实验者：${experimenter || "___________"}`
       - `日期：${formatDate(generatedAt)}`
       - `仿真方法：${simulationStats.method}`
       - `仿真时长：${simulationStats.totalSimTime.toFixed(1)} s`
     - 3D 场景关键帧（2×2 网格，y=85 起）：
       ```typescript
       const gridStartY = 85;
       const cellW = SCREENSHOT.width;
       const cellH = SCREENSHOT.height;
       const gap = SCREENSHOT.gap;
       const labels = ["初始 t=0s", "中期", "分离/混沌", "稳态"];
       for (let i = 0; i < 4; i++) {
         const col = i % 2;
         const row = Math.floor(i / 2);
         const x = PAGE.marginLeft + col * (cellW + gap);
         const y = gridStartY + row * (cellH + gap + 6);  // +6 for label
         if (screenshots.scene3D[i]) {
           doc.addImage(screenshots.scene3D[i], "PNG", x, y + 4, cellW, cellH);
         }
         doc.setFontSize(8);
         doc.text(labels[i], x, y + cellH + 5);
       }
       ```
  4. **第 2 页 — 参数与数据**：
     - `doc.addPage()`
     - 一级标题"一、实验目的"，正文为 `purpose` 文本（支持自动换行：`doc.text(purpose, x, y, { maxWidth: PAGE.contentWidth })`）
     - 一级标题"二、参数设置"，渲染 `jspdf-autotable`：
       ```typescript
       import autoTable from "jspdf-autotable";
       autoTable(doc, {
         startY: currentY,
         head: [["参数", "值", "单位"]],
         body: [
           ["m₁ (上摆质量)", params.m1.toFixed(2), "kg"],
           ["m₂ (下摆质量)", params.m2.toFixed(2), "kg"],
           ["L₁ (上摆杆长)", params.L1.toFixed(2), "m"],
           ["L₂ (下摆杆长)", params.L2.toFixed(2), "m"],
           ["g (重力加速度)", params.g.toFixed(2), "m/s²"],
           ["damping (阻尼)", params.damping.toFixed(4), "1/s"],
           ["θ₁(0)", radToDeg(initialConditions.theta1).toFixed(2), "°"],
           ["θ̇₁(0)", initialConditions.theta1Dot.toFixed(2), "rad/s"],
           ["θ₂(0)", radToDeg(initialConditions.theta2).toFixed(2), "°"],
           ["θ̇₂(0)", initialConditions.theta2Dot.toFixed(2), "rad/s"],
         ],
         theme: "grid",
         styles: { fontSize: 9 },
         headStyles: { fillColor: [60, 60, 60] },
       });
       ```
     - 一级标题"三、数据图表"，依次插入能量曲线截图和相空间截图（等宽缩放至 `PAGE.contentWidth`，保持宽高比）
  5. **第 3 页 — 结论与误差分析**：
     - `doc.addPage()`
     - 一级标题"四、物理结论"，混沌判定文本：
       ```typescript
       const driftPercent = (energyStats.drift * 100).toFixed(2);
       const chaosText = energyStats.drift > 0.005
         ? `该系统当前处于混沌运动状态。能量漂移 ${driftPercent}%（> 0.5%），系统表现出对初始条件的敏感依赖性。`
         : `该系统当前处于周期或准周期运动状态。能量漂移 ${driftPercent}%（< 0.5%），系统运动具有良好的可预测性。`;
       doc.text(chaosText, x, y, { maxWidth: PAGE.contentWidth });
       ```
     - 一级标题"五、误差分析"，渲染第二张表格：
       ```typescript
       autoTable(doc, {
         startY: currentY,
         head: [["误差来源", "量级", "说明"]],
         body: [
           ["数值积分误差", `O(dt⁴) ≈ ${((1/60)**4).toExponential(2)}`, `RK4 方法局部截断误差，步长 dt = ${(1/60).toFixed(3)}s`],
           ["浮点舍入误差", "≈ 10⁻¹⁵", "IEEE 754 double precision，在 1000s 尺度上累积可忽略"],
           ["模型假设误差", "—", "刚性杆、无空气阻力、点质量、恒定重力加速度"],
           ["能量漂移", `${driftPercent}%`, `1000s 仿真总能量变化比例`],
         ],
         theme: "grid",
         styles: { fontSize: 9 },
         headStyles: { fillColor: [60, 60, 60] },
       });
       ```
  6. **页脚**（每页底部）：
     ```typescript
     // 为每一页添加页脚（使用 jsPDF 的页眉页脚插件或手动）
     for (let i = 1; i <= doc.getNumberOfPages(); i++) {
       doc.setPage(i);
       doc.setFontSize(8);
       doc.setTextColor(128, 128, 128);  // 灰色
       const footerY = PAGE.height - 12;
       doc.text("双摆混沌实验室  |  Chaos Pendulum Lab", PAGE.marginLeft, footerY);
       doc.text(`生成时间：${formatDate(generatedAt)}`, PAGE.width - PAGE.marginRight, footerY, { align: "right" });
     }
     ```
  7. 最终导出：
     ```typescript
     doc.save(`双摆混沌实验室-实验报告-${formatDate(generatedAt)}.pdf`);
     ```
- **输入来源**：`ReportInputData`（完整填充）
- **输出去向**：浏览器下载 `.pdf` 文件
- **失败行为**：见步骤 6 异常处理

#### 步骤 6：清理与完成

- **操作对象**：`useLabStore.reportGenerating` + 进度遮罩
- **具体操作**：
  1. PDF 保存触发下载后 → `setReportGenerating(false)`
  2. 关闭进度遮罩
  3. 显示 `<Alert variant="success">`"报告已生成，请查看下载文件"
  4. 释放临时截图 URL（`URL.revokeObjectURL(dataUrl)`）避免内存泄漏
- **输入来源**：PDF 生成完成事件
- **输出去向**：UI 恢复可交互状态
- **失败行为**：`doc.save()` 被浏览器下载拦截 → 显示手动下载提示

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useLabStore` | `(s) => s.reportGenerating` | 读取/设置生成状态 |
| `useLabStore` | `getState().setReportGenerating(bool)` | 控制生成遮罩显隐 |
| `useSimulationStore` | `getState()` → params, initialConditions, 所有状态字段 | 收集仿真参数和当前状态 |
| SIM-04 Canvas | `document.querySelector("[data-report-canvas='energy']")` → `toDataURL()` | 截取能量曲线图 |
| SIM-05 Canvas | `document.querySelector("[data-report-canvas='phase-space']")` → `toDataURL()` | 截取相空间图 |
| EXP-01 Canvas | R3F `<Canvas gl={{ preserveDrawingBuffer: true }}>` → `toDataURL()` | 截取 3D 场景关键帧 |
| `RingBuffer` | `ringBuf.at(index)` | 读取关键帧时刻的状态向量 |
| `jsPDF` | `new jsPDF()` / `doc.text()` / `doc.addImage()` / `doc.save()` | PDF 文档创建与导出 |
| `jspdf-autotable` | `autoTable(doc, { ... })` | PDF 表格渲染 |

### 状态机

报告生成流程的状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 用户点击"导出报告"按钮 | `configuring` | — | 弹出配置 Dialog |
| `configuring` | 用户填写配置并点击"生成报告" | `collecting` | `title.trim() !== ""` | 关闭 Dialog；显示全屏进度遮罩"正在收集数据..."；`reportGenerating = true` |
| `configuring` | 用户点击取消 / 关闭 Dialog | `idle` | — | — |
| `collecting` | 数据收集完成 | `capturing` | — | 进度文本更新为"正在截取关键帧 (1/4)..." |
| `capturing` | 全部截图完成（4 帧 + 能量图 + 相空间图） | `composing` | — | 进度文本更新为"正在合成 PDF..." |
| `composing` | PDF 合成并保存完成 | `idle` | — | `doc.save()` 触发下载；进度遮罩关闭；`reportGenerating = false`；成功 Toast 显示 |
| 任意（除 idle） | 截图失败（Canvas 不可用） | `composing`（降级） | — | 缺失截图在报告中跳过；继续合成剩余内容 |
| 任意（除 idle） | jsPDF 抛出异常 | `error` | — | 进度遮罩显示错误信息 + "重试"按钮；`reportGenerating = false` |
| `error` | 用户点击"重试" | `collecting`（重新开始） | — | — |

### 异常与边界条件

#### 异常 1：WebGL Canvas 未设置 preserveDrawingBuffer

- **触发条件**：EXP-01 的 R3F `<Canvas>` 默认 `preserveDrawingBuffer: false`，`toDataURL()` 返回透明/空白图片
- **处理策略**：
  1. 在报告生成的初始化阶段（`generateReport` 函数开头）进行一次探测截图
  2. 检查截图是否为纯透明（所有像素 alpha=0）或纯色空白
  3. 若为空白 → 显示 `<Alert variant="warning">`"3D 场景截取失败：请在初始化时设置 Canvas preserveDrawingBuffer=true。报告将不包含 3D 截图"
  4. 报告跳过 3D 截图部分，其余内容正常生成
  5. 在开发期，EXP-01 的 `<Canvas>` 需添加 `gl={{ preserveDrawingBuffer: true }}` prop（轻微性能影响）
- **重试参数**：不重试（Canvas 配置是静态的，运行时不可更改）

#### 异常 2：中文字体未嵌入导致乱码

- **触发条件**：jsPDF 默认 `helvetica` 字体不支持 CJK 字符，中文参数名和署名渲染为乱码/方框
- **处理策略**：
  1. v1.0 降级方案：报告全文使用英文撰写
     - 标题："Chaos Pendulum Lab — Physics Experiment Report"
     - 页脚："Chaos Pendulum Lab | Generated at ..."
     - 参数表头使用英文
  2. 中文署名使用**Canvas 截图**方式嵌入——将署名文本渲染到一个离屏 Canvas 上，截图后以图片形式嵌入 PDF
  3. v1.1 增强：嵌入 Noto Sans SC 字体子集（Base64），通过 `doc.addFont()` 注册
- **重试参数**：不重试。v1.0 默认使用英文降级方案

#### 异常 3：Canvas 截图跨域污染（Tainted Canvas）

- **触发条件**：Canvas 中包含了跨域资源（如从 CDN 加载的环境贴图 HDR），导致 Canvas 被标记为 `tainted`，`toDataURL()` 抛出 `SecurityError`
- **处理策略**：
  1. 在截图代码中 try-catch 包裹 `toDataURL()`
  2. 捕获 `SecurityError` → 该截图替换为占位灰色图片（纯色 OffscreenCanvas 生成）
  3. 灰色图片上叠加文字："截图不可用（跨域资源限制）"
  4. 其余报告内容正常生成
- **重试参数**：不重试

#### 异常 4：生成过程中用户切换模式导致 Canvas 卸载

- **触发条件**：`capturing` 阶段用户通过导航栏切换到其他模式，EXP-01/SIM-04/SIM-05 的 Canvas 被卸载
- **处理策略**：
  1. 在每个截图步骤前检查 Canvas 元素是否仍在 DOM 中：`document.contains(canvas)`
  2. 若已卸载 → 该截图标记为缺失，跳过
  3. 继续生成剩余内容
  4. 生成完成后恢复实验模式（通过 `useAppStore.setMode("lab")` 自动切回，或提示用户手动切回查看报告）
- **重试参数**：不重试

#### 异常 5：生成的 PDF 文件过大（多张 4K 截图）

- **触发条件**：`screenshotScale = 4` 且 Canvas 尺寸为 1920×1080 → 每张截图约 8MB PNG → 6 张 ≈ 48MB → PDF 可能超过 50MB
- **处理策略**：
  1. 截图前检查估算大小：`canvas.width × canvas.height × 4 × scale²` bytes
  2. 若估算 > 30MB → 自动降低 `screenshotScale`：4→2 或 2→1
  3. 在进度遮罩中提示"已自动降低截图分辨率以控制文件大小"
  4. 默认 `screenshotScale = 2`（合理平衡质量与体积）
- **重试参数**：自动降级一次

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.4 | 6 项内容自动生成 | 标题与目的、参数设置表、4 关键帧截图、数据图表（能量+相空间）、物理结论（混沌判定）、误差分析——全部由代码自动填充，无需用户手动输入 |
| 功能设计_v0 §五 5.4 | 4 个关键帧自动选取 | 初始帧（t=0）、中期帧（t=30%）、分离/混沌帧（方差最大时刻）、稳态帧（最后一帧）——通过 `selectChaosFrame` 算法自动选择 |
| 功能设计_v0 §五 5.4 | 模仿高校物理实验报告排版 | A4 竖版 + 封面标题居中 + 表格化参数 + 章节编号（一/二/三/四/五）+ 页脚署名+时间戳 |
| 功能设计_v0 §五 5.4 | 页脚署名 | 每页底部固定显示"双摆混沌实验室 / Chaos Pendulum Lab"+"生成时间：YYYY-MM-DD HH:MM" |
| 技术栈设计 §4.10 | jsPDF + Canvas.toBlob | PDF 通过 jsPDF 前端合成；截图通过 Canvas API 截取；表格通过 jspdf-autotable 渲染；不依赖服务端 |
| 通用原则 | 逻辑与表现分离 | `generateReport()` 函数封装全部数据收集+PDF合成逻辑；`ReportDialog` 组件仅负责 UI 配置表单和触发 |

### 验收测试场景

#### 正向测试 1：标准参数下导出完整报告

- **Given**：
  - 仿真已在探索模式下运行 ≥ 30 秒（RingBuffer 中有 ≥ 1800 帧数据）
  - 参数为默认值（`m₁=1, m₂=1, L₁=1, L₂=1, g=9.81, damping=0`）
  - 3D Canvas 已设置 `preserveDrawingBuffer: true`
  - 能量曲线面板和相空间面板可见
- **When**：用户点击"导出报告" → 在 Dialog 中保持默认配置 → 点击"生成报告"
- **Then**：
  - 全屏进度遮罩显示，文本依次变为：
    - "正在收集数据..."
    - "正在截取关键帧 (1/4)..." → "(4/4)"
    - "正在合成 PDF..."
  - 浏览器下载一个 `.pdf` 文件，文件名格式：`双摆混沌实验室-实验报告-YYYY-MM-DDTHHMM.pdf`
  - PDF 包含 3 页：
    - 第 1 页：标题 + 元信息 + 2×2 关键帧网格（4 张 3D 截图分别标注初始/中期/混沌/稳态）
    - 第 2 页：实验目的 + 10 行参数表 + 能量曲线截图 + 相空间截图
    - 第 3 页：物理结论（含能量漂移百分比和混沌判定文本）+ 4 行误差分析表
  - 每页底部有灰色页脚"双摆混沌实验室 / Chaos Pendulum Lab / 生成时间"
  - 进度遮罩关闭，显示成功 Toast
  - `reportGenerating = false`

#### 正向测试 2：用户自定义标题和实验目的

- **Given**：同测试 1 的初始状态
- **When**：
  1. 用户点击"导出报告"
  2. 在 Dialog 中将标题改为"弹簧摆模型仿真实验"
  3. 将实验目的改为"验证弹簧摆模型在 k=10.0 下的运动规律"
  4. 实验者填写"张三 20240001"
  5. 取消勾选"含相空间图"
  6. 点击"生成报告"
- **Then**：
  - PDF 标题为"弹簧摆模型仿真实验"
  - 实验目的文本为自定义内容
  - 实验者显示"张三 20240001"
  - 第 2 页不包含相空间截图（其余内容正常）
  - 其他内容（参数表、能量图、3D 截图、结论、误差分析）不变

#### 异常测试 1：仿真未运行时尝试导出

- **Given**：用户首次打开应用，直接切换到实验模式，仿真从未启动（`t === 0`，RingBuffer 为空）
- **When**：用户点击"导出报告" → 确认配置 → 点击"生成报告"
- **Then**：
  - 数据收集阶段检测到 `totalSimTime === 0`
  - 生成终止
  - 进度遮罩关闭
  - 显示 `<Alert variant="destructive">`"请先运行仿真以生成报告数据"
  - `reportGenerating = false`

#### 异常测试 2：3D Canvas 截图失败——preserveDrawingBuffer 未设置

- **Given**：EXP-01 的 `<Canvas>` 为默认配置（`preserveDrawingBuffer: false`），仿真正常运行
- **When**：用户点击"导出报告" → 生成报告
- **Then**：
  - 3D 截图全部为透明/空白
  - 生成继续（不中断）
  - PDF 中 3D 关键帧区域显示占位灰框 + 文字"3D 场景截图不可用（请启用 preserveDrawingBuffer）"
  - 其余内容正常（参数表、能量图、相空间图、结论、误差分析）
  - 进度遮罩中显示黄色警告提示
  - PDF 成功保存

### 注意事项与禁止行为

1. **【preserveDrawingBuffer 性能代价】** 设置 `preserveDrawingBuffer: true` 后，WebGL 上下文不会在每次绘制后丢弃帧缓冲，导致 GPU 无法使用双缓冲/三重缓冲优化。在某些移动 GPU 上可能导致帧率下降 5-15%。该设置应在整个应用生命周期中保持启用（因为报告可在任意时刻导出），或通过动态切换（仅在截图前临时启用）减少性能影响。推荐方案：始终启用（性能代价可接受）

2. **【截图前的 Canvas 状态保证】** 在截取 3D 关键帧之前，必须通过设置 `useSimulationStore` 的顶层字段来同步状态，并等待至少一个 `requestAnimationFrame` 周期确保 R3F 已渲染该帧。禁止在设置状态后立即调用 `toDataURL()`（会截取到上一帧的画面）

3. **【中文报告 vs 英文报告】** v1.0 推荐使用英文撰写报告内容（避免嵌入中文字体的复杂性）。中文参数名可通过 Canvas 截图方式嵌入（将参数名渲染到离屏 Canvas 上以图片形式嵌入 PDF）。v1.1 可引入中文字体子集升级为完整中文报告

4. **【临时 URL 清理】** 通过 `OffscreenCanvas.convertToBlob()` + `URL.createObjectURL()` 创建的临时 Data URL 必须在报告生成完成后（无论成功或失败）通过 `URL.revokeObjectURL()` 释放。在 `finally` 块中执行清理，防止内存泄漏

5. **【禁止阻塞主线程】** PDF 合成涉及大量图片处理和 jsPDF 布局计算，禁止在合成期间阻塞主线程超过 100ms。若截图超过 6 张，考虑在 Web Worker 中执行 PDF 合成（jsPDF 不直接支持 Worker，但可通过 OffscreenCanvas + ImageBitmap 传递截图数据到 Worker 中重建 PDF）

6. **【jsPDF addImage 的格式限制】** `doc.addImage()` 支持 PNG、JPEG 和 WEBP 格式的 Data URL。3D Canvas 截图为 PNG（无损），2D Canvas 亦可使用 PNG。禁止使用 BMP 或 TIFF（jsPDF 不支持）

7. **【关键帧选取的降级策略】** 当 `totalFrames < 4` 时，关键帧选取退化为全部取最后一帧。当 `theta2Series` 全为 NaN 时，帧 3（混沌帧）退化为 `Math.floor(totalFrames * 0.7)`。禁止在降级情况下抛出异常——关键帧选取是"尽力而为"的辅助功能

8. **【易错点】** jspdf-autotable 的 `startY` 参数指定表格起始 Y 坐标。在表格之后继续添加内容时，必须使用 `doc.lastAutoTable.finalY` 获取表格结束的 Y 坐标，而非估算。直接硬编码 Y 值会导致表格与后续内容重叠

9. **【易错点】** `doc.addImage()` 的 `width`/`height` 参数单位是 mm（与 `unit: "mm"` 一致）。从 `canvas.width`（像素）转换为 mm 的公式：`widthMM = (canvasWidth / 96) * 25.4`（标准屏幕 DPI = 96）。高 DPI 屏幕（`devicePixelRatio = 2`）的实际 Canvas 尺寸需用 `canvas.width / devicePixelRatio` 计算显示像素再转换
