# 功能点：DAT-02 数据导出

> **文档生成时间**：`2026-04-28 21:34:15 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 21:34:15` | AI Assistant | 初始版本，基于功能设计_v0 §七 7.2 + 技术栈 §2 #18 + 已有 export utilities + SIM-05 导出接口兼容 |

> **冲突核查指引**：本版本与已有 `src/features/data/export/` 中的 `exportCSV`/`exportJSON`/`exportPNG` 函数兼容，与 SIM-05 v1.0 `exportPhaseSpaceImage()` 接口兼容。ANL-01/ANL-02/ANL-03 的 Canvas ref 导出接口由本规格定义为新增契约，实现 DAT-02 时需同步要求这些模块暴露 `getCanvas()` 方法。若上游模块接口变更，以时间戳更新的版本为准。

---

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §七 7.2「数据导出」；技术栈设计 §2 #18（jsPDF 2.x）、§4.12（CSV/JSON/PNG 导出）、§5.4（导出文件体积约束）；功能模块全拆解 §六 DAT-02
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供时序数据（StateVector 帧序列、`RingBuffer<StateVector>`），CSV 导出的数据源
  - `EXP-01`（3D 仿真场景）— 提供 R3F `<Canvas>` 的 DOM 元素引用，用于 3D 视图 PNG 截图
  - `SIM-05`（相空间可视化）— 提供 `exportPhaseSpaceImage(scale)` 方法（已在 v1.0 规格中定义），用于相空间图 PNG 导出
  - `ANL-01`（李雅普诺夫指数谱）— 提供热力图 Canvas DOM 元素引用，用于热力图 PNG 导出
  - `ANL-02`（参数空间分岔图）— 提供分岔图 Canvas DOM 元素引用，用于分岔图 PNG 导出
  - `ANL-03`（庞加莱截面）— 提供庞加莱截面 Canvas DOM 元素引用，用于截面图 PNG 导出
- **被依赖模块**：LAB-04（实验报告生成器 — 可能复用 PNG 导出接口）；DAT-01（状态快照 — JSON 场景文件格式与快照 FullSnapshot 共享参数结构）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `DAT-01-状态快照.md` v1.0（2026-04-28）：`FullSnapshot` 类型中的 `SnapshotParams`/`SnapshotInitialConditions`，JSON 导出的场景文件格式与其共享参数结构
  - `SIM-01-双摆物理引擎.md` v2.1：`PendulumParams`（6 字段）、StateVector `[θ₁, θ̇₁, θ₂, θ̇₂]`、buffer 帧布局 FRAME_STRIDE=14（14 个 float64 字段：t/theta1/theta1Dot/theta2/theta2Dot/x1/y1/x2/y2/kineticEnergy/potentialEnergy/totalEnergy/alpha1/alpha2）
  - `SIM-05-相空间可视化.md` v1.0：`exportPhaseSpaceImage(scale: number): string` 导出接口，DAT-02 直接调用此方法获取相空间图 PNG Data URL
  - `EXP-01-3D仿真场景.md` v1.0：`Scene3DProps` 类型，3D 场景通过 R3F `<Canvas>` 渲染为 DOM `<canvas>` 元素
  - `ANL-01-李雅普诺夫指数谱.md` v1.0：D3.js Canvas 2D 热力图渲染
  - `ANL-02-参数空间分岔图.md` v1.0：D3.js Canvas 散点图渲染
  - `ANL-03-庞加莱截面.md` v1.0：D3.js Canvas 散点图渲染
- **兼容性结论**：
  - CSV 导出的列映射与 SIM-01 buffer 帧布局（FRAME_STRIDE=14）完全一致，数据字段名对齐 `consumeFrameToStore` 写入的 Zustand 扁平字段
  - JSON 导出的参数结构复用 `PendulumParams` + `InitialConditions`（SIM-01 Worker 协议），与 DAT-01 `FullSnapshot.params`/`FullSnapshot.initialConditions` 共享类型定义
  - PNG 导出的底层函数 `exportPNG(canvas, filename, resolution)` 已存在于 `src/features/data/export/png-export.ts`，本规格仅定义上层调度逻辑
  - SIM-05 已有 `exportPhaseSpaceImage()` 方法，DAT-02 无需直接访问相空间 Canvas
  - **新增契约**：ANL-01/ANL-02/ANL-03 目前未暴露 Canvas ref 导出接口。本规格要求这些模块的 Canvas 组件通过 `React.forwardRef` 暴露 `getCanvas(): HTMLCanvasElement | null` 方法，供 DAT-02 PNG 导出调用。此契约由 DAT-02 规格定义，各 ANL 模块实现时需遵循
  - **无冲突**，本规格精准引用已有类型并定义新契约
- **复用的已有定义**：`PendulumParams`/`InitialConditions`（SIM-01）、`StateVector`（SIM-01 buffer 布局）、`RingBuffer<StateVector>`（data/ring-buffer）、`exportCSV()`/`exportJSON()`/`exportPNG()`（data/export）、`exportPhaseSpaceImage()`（SIM-05）、`SnapshotParams`/`SnapshotInitialConditions`（DAT-01）、`FullSnapshot`（DAT-01）

---

### 技术栈绑定

- **必须使用**：
  - TypeScript 5.x — 类型安全
  - 浏览器原生 `Blob` + `URL.createObjectURL` — 触发浏览器下载
  - 浏览器原生 `<a download>` — 文件名指定
  - `HTMLCanvasElement.toBlob("image/png")` — PNG 截图导出（已有 `exportPNG()` 使用此 API）
  - `HTMLCanvasElement.toDataURL("image/png")` — 离屏 Canvas 高分辨率导出（已有 `exportPNG()` 使用 `drawImage` + 离屏 canvas 方案）
  - `JSON.stringify(data, null, 2)` — JSON 格式化导出
  - `RingBuffer<StateVector>.toArray()` — 获取全量时序数据用于 CSV 导出
  - `useSimulationStore.getState()` — 读取当前参数和状态用于 JSON 导出
  - `shadcn/ui`（Copy 模式）— `Dialog`（导出面板弹窗）、`Select`（格式/分辨率选择）、`Button`（导出触发按钮）、`Checkbox`（可选导出项勾选）、`Label`、`Tooltip`
  - `lucide-react` — `Download`（导出图标）、`FileSpreadsheet`（CSV 图标）、`FileJson`（JSON 图标）、`Image`（PNG 图标）、`Check`（确认勾选）
  - `tailwindcss@^3.4.16` — 导出面板布局
- **禁止使用**：
  - 禁止使用 `localStorage` 暂存导出数据（导出是即时操作，不需要持久化中间产物）
  - 禁止在 Worker 中执行导出逻辑（Blob/URL.createObjectURL 仅在主线程可用；CSV 数据采集从主线程 RingBuffer 读取，不需要 Worker 参与）
  - 禁止使用 `FileSaver.js` 等第三方下载库（浏览器原生 Blob + `<a download>` 已满足需求，技术栈 §1.2 要求零外部下载依赖）
  - 禁止在导出过程中阻塞 UI 线程 > 500ms（大数据量 CSV（6000 行 × 14 列）序列化若超过 500ms，应使用 `requestIdleCallback` 分批处理或显示进度指示器）
  - 禁止 PNG 导出时直接截取 CSS 像素尺寸的 Canvas 再放大（会导致模糊；必须创建高分辨率离屏 Canvas 后 `drawImage` 放大）

---

### 输入定义（精确类型）

#### CSV 导出输入

```typescript
/**
 * CSV 导出配置。
 */
interface CSVExportOptions {
  /**
   * 导出文件名（不含扩展名）。
   * 默认格式："双摆时序数据_{YYYY-MM-DD}_{HH-mm-ss}"
   * 示例："双摆时序数据_2026-04-28_10-30-00"
   */
  filename: string;

  /**
   * 要导出的列选择。
   * 默认：["t", "theta1", "theta1Dot", "theta2", "theta2Dot", "x1", "y1", "x2", "y2", "kineticEnergy", "potentialEnergy", "totalEnergy"]
   * 可选列：全部 14 个字段（含 alpha1、alpha2）。
   * 用户可在导出面板中通过 Checkbox 勾选/取消。
   */
  columns: CSVColumn[];

  /**
   * 导出的时间范围。
   * - "all": 导出 RingBuffer 中全部数据（最多 6000 帧 = 100s）
   * - "lastN": 导出最近 N 帧
   * - "range": 导出 [startTime, endTime] 之间的帧
   */
  timeRange:
    | { type: "all" }
    | { type: "lastN"; n: number }
    | { type: "range"; startTime: number; endTime: number };
}

/**
 * CSV 列标识符。
 * 与 SIM-01 buffer 帧布局 FRAME_STRIDE=14 的字段一一对应。
 */
type CSVColumn =
  | "t"                // 仿真时间 (s)，buffer offset 0
  | "theta1"           // 上摆角度 (rad)，buffer offset 1
  | "theta1Dot"        // 上摆角速度 (rad/s)，buffer offset 2
  | "theta2"           // 下摆角度 (rad)，buffer offset 3
  | "theta2Dot"        // 下摆角速度 (rad/s)，buffer offset 4
  | "x1"               // 上摆球 x 坐标 (m)，buffer offset 5
  | "y1"               // 上摆球 y 坐标 (m)，buffer offset 6
  | "x2"               // 下摆球 x 坐标 (m)，buffer offset 7
  | "y2"               // 下摆球 y 坐标 (m)，buffer offset 8
  | "kineticEnergy"    // 动能 (J)，buffer offset 9
  | "potentialEnergy"  // 势能 (J)，buffer offset 10
  | "totalEnergy"      // 总能量 (J)，buffer offset 11
  | "alpha1"           // 上摆角加速度 (rad/s²)，buffer offset 12
  | "alpha2";          // 下摆角加速度 (rad/s²)，buffer offset 13

/**
 * CSV 列元数据映射表（不可变常量）。
 * 用于生成 CSV 表头中文名 + 单位。
 */
interface CSVColumnMeta {
  /** 列标识符 */
  key: CSVColumn;
  /** CSV 表头中文名。示例："时间" */
  label: string;
  /** 物理单位。示例："s" */
  unit: string;
  /** 数值精度（小数位数）。示例：4 */
  decimalPlaces: number;
}

/** 所有 CSV 列的元数据注册表 */
const CSV_COLUMN_META: CSVColumnMeta[] = [
  { key: "t",               label: "时间",         unit: "s",      decimalPlaces: 4 },
  { key: "theta1",          label: "上摆角度",      unit: "rad",   decimalPlaces: 6 },
  { key: "theta1Dot",       label: "上摆角速度",    unit: "rad/s", decimalPlaces: 6 },
  { key: "theta2",          label: "下摆角度",      unit: "rad",   decimalPlaces: 6 },
  { key: "theta2Dot",       label: "下摆角速度",    unit: "rad/s", decimalPlaces: 6 },
  { key: "x1",              label: "上摆球X坐标",   unit: "m",     decimalPlaces: 6 },
  { key: "y1",              label: "上摆球Y坐标",   unit: "m",     decimalPlaces: 6 },
  { key: "x2",              label: "下摆球X坐标",   unit: "m",     decimalPlaces: 6 },
  { key: "y2",              label: "下摆球Y坐标",   unit: "m",     decimalPlaces: 6 },
  { key: "kineticEnergy",   label: "动能",         unit: "J",     decimalPlaces: 6 },
  { key: "potentialEnergy", label: "势能",         unit: "J",     decimalPlaces: 6 },
  { key: "totalEnergy",     label: "总能量",       unit: "J",     decimalPlaces: 6 },
  { key: "alpha1",          label: "上摆角加速度",  unit: "rad/s²", decimalPlaces: 6 },
  { key: "alpha2",          label: "下摆角加速度",  unit: "rad/s²", decimalPlaces: 6 },
];
```

#### JSON 导出输入

```typescript
/**
 * JSON 场景文件导出配置。
 */
interface JSONExportOptions {
  /**
   * 导出文件名（不含扩展名）。
   * 默认格式："双摆场景_{YYYY-MM-DD}_{HH-mm-ss}"
   * 示例："双摆场景_2026-04-28_10-30-00"
   */
  filename: string;

  /**
   * 是否包含尾迹数据。
   * 尾迹数组可能有 6000 个点，包含会使 JSON 文件体积达到 ~500KB-1MB。
   * 默认 false（仅导出参数和状态，文件 < 1KB）。
   */
  includeTrail: boolean;

  /**
   * 是否包含缩略图（base64 PNG）。
   * 默认 false。
   */
  includeThumbnail: boolean;

  /**
   * 导出格式版本号。
   * 固定为 1，用于未来版本兼容。
   */
  version: 1;
}

/**
 * JSON 场景文件结构。
 * 该结构设计为可导入复现仿真。
 */
interface SceneFile {
  /** 格式版本号 */
  version: 1;

  /** 导出元数据 */
  metadata: {
    /** 导出时间戳 (ISO 8601) */
    exportedAt: string;
    /** 导出时的应用版本（从 package.json 读取，构建时注入 `__APP_VERSION__`）。示例："2.0.0" */
    appVersion: string;
    /** 导出时的仿真时间 (s)。示例：15.233 */
    simTime: number;
    /** 导出时的运行模式。示例："explore" */
    mode: "explore" | "analyze" | "lab" | "story";
    /** 用户可选的备注。最大 200 字符。可为空字符串 "" */
    notes: string;
  };

  /** 物理参数 */
  params: {
    /** 上摆质量 (kg)。硬约束：> 0。示例：1.0 */
    m1: number;
    /** 下摆质量 (kg)。硬约束：> 0。示例：1.0 */
    m2: number;
    /** 上摆杆长 (m)。硬约束：> 0。示例：1.0 */
    L1: number;
    /** 下摆杆长 (m)。硬约束：> 0。示例：1.0 */
    L2: number;
    /** 重力加速度 (m/s²)。硬约束：>= 0。示例：9.81 */
    g: number;
    /** 阻尼系数 (1/s)。硬约束：>= 0。示例：0.0 */
    damping: number;
  };

  /** 初始条件 */
  initialConditions: {
    /** 上摆初始角度 (rad)。示例：1.5708 */
    theta1: number;
    /** 上摆初始角速度 (rad/s)。示例：0.0 */
    theta1Dot: number;
    /** 下摆初始角度 (rad)。示例：1.5708 */
    theta2: number;
    /** 下摆初始角速度 (rad/s)。示例：0.0 */
    theta2Dot: number;
  };

  /** 积分方法 */
  method: "RK4" | "VelocityVerlet" | "Euler";

  /** 当前状态向量（导出时刻） */
  currentState: {
    /** 上摆角度 (rad)。示例：2.341 */
    theta1: number;
    /** 上摆角速度 (rad/s)。示例：-3.211 */
    theta1Dot: number;
    /** 下摆角度 (rad)。示例：-1.892 */
    theta2: number;
    /** 下摆角速度 (rad/s)。示例：5.674 */
    theta2Dot: number;
  };

  /** 尾迹数据（仅在 includeTrail=true 时存在） */
  trail?: {
    /** 尾迹点总数 */
    count: number;
    /** 尾迹点数组：[ [x, y, z, velocity], ... ]。每个点是 [number, number, number, number] 元组 */
    points: [number, number, number, number][];
  };

  /** 缩略图（仅在 includeThumbnail=true 时存在）。base64 PNG Data URL */
  thumbnail?: string;
}
```

#### PNG 导出输入

```typescript
/**
 * PNG 截图目标类型。
 * 对应可截图的图表/场景。
 */
type PNGTarget =
  | "3d-view"           // 3D 仿真场景（EXP-01 的 R3F Canvas）
  | "phase-space"       // 相空间图（SIM-05）
  | "lyapunov-heatmap"  // 李雅普诺夫热力图（ANL-01）
  | "bifurcation"       // 分岔图（ANL-02）
  | "poincare"          // 庞加莱截面（ANL-03）
  | "energy-monitor";   // 能量监控图（SIM-04）

/**
 * PNG 导出分辨率配置。
 * 倍数相对于 Canvas 的逻辑尺寸（CSS 像素 × devicePixelRatio）。
 */
type PNGResolution =
  | 1    // 屏幕分辨率（Canvas 逻辑尺寸 × dpr）
  | 2    // 2× 超采样（适合 Retina 截图分享）
  | 4;   // 4K 导出（Canvas 逻辑尺寸 × 4，功能设计 §七 7.2 要求最高 4K 分辨率）

/**
 * PNG 导出配置。
 */
interface PNGExportOptions {
  /**
   * 导出文件名（不含扩展名）。
   * 默认格式："{targetLabel}_{YYYY-MM-DD}_{HH-mm-ss}"
   * 示例："3D仿真场景_2026-04-28_10-30-00"
   */
  filename: string;

  /** 截图目标 */
  target: PNGTarget;

  /** 分辨率倍数。默认 1 */
  resolution: PNGResolution;
}

/** PNG 目标的显示标签映射 */
const PNG_TARGET_LABELS: Record<PNGTarget, string> = {
  "3d-view":           "3D仿真场景",
  "phase-space":       "相空间图",
  "lyapunov-heatmap":  "李雅普诺夫热力图",
  "bifurcation":       "分岔图",
  "poincare":          "庞加莱截面",
  "energy-monitor":    "能量监控图",
};
```

#### 各图表组件 Canvas 引用契约（DAT-02 要求）

DAT-02 PNG 导出需要获取各图表组件的 Canvas DOM 元素。以下为 DAT-02 定义的要求契约，各依赖模块实现时需遵循：

```typescript
/**
 * 图表组件的 Canvas 引用接口。
 * 各依赖模块的 Canvas 组件必须通过 React.forwardRef 暴露此接口。
 *
 * 用法示例（在 ANL-02 分岔图组件中）：
 *   const BifurcationChart = forwardRef<ChartCanvasRef, BifurcationProps>(
 *     (props, ref) => {
 *       const canvasRef = useRef<HTMLCanvasElement>(null);
 *       useImperativeHandle(ref, () => ({
 *         getCanvas: () => canvasRef.current,
 *       }));
 *       return <canvas ref={canvasRef} ... />;
 *     }
 *   );
 */
interface ChartCanvasRef {
  /**
   * 获取当前图表的 Canvas DOM 元素。
   * 返回 null 表示 Canvas 尚未挂载或已卸载。
   * 调用方（DAT-02）负责在获取后调用 exportPNG()。
   */
  getCanvas(): HTMLCanvasElement | null;
}
```

---

### 输出定义（精确类型）

```typescript
/**
 * 导出操作的统一结果。
 */
interface ExportResult {
  /** 是否成功 */
  success: boolean;
  /** 成功时返回导出的文件名（含扩展名）。失败时为 null */
  filename: string | null;
  /** 导出格式 */
  format: "csv" | "json" | "png";
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
  /** 失败时的错误分类 */
  errorCode:
    | "NO_DATA"              // 无数据可导出（RingBuffer 为空 / Canvas 未挂载）
    | "CANVAS_UNAVAILABLE"   // PNG 导出目标 Canvas 不可用
    | "SERIALIZATION_FAILED" // 数据序列化失败
    | "BLOB_CREATE_FAILED"   // Blob 创建失败
    | "DOWNLOAD_TRIGGERED"   // 下载已触发（非错误，用于告知用户浏览器下载行为）
    | null;
}
```

---

### 核心逻辑步骤

#### 步骤 1：CSV 时序数据导出

- **操作对象**：`RingBuffer<StateVector>` 中的全量帧数据 → CSV 字符串 → Blob → 浏览器下载
- **具体操作**：
  1. **读取数据源**：从 `useSimulationStore.getState()` 获取仿真运行状态。若 `isInitialized === false` → `ExportResult { success: false, errorCode: "NO_DATA", error: "仿真尚未初始化，无数据可导出" }`
  2. **获取帧数据**：
     - 从 `RingBuffer<StateVector>` 实例调用 `.toArray()` 获取全部帧（每帧为 `Float64Array` 或 `number[]`，包含 14 个字段）
     - 若 `.toArray()` 返回空数组 `[]` → `ExportResult { success: false, errorCode: "NO_DATA", error: "暂无仿真数据，请先运行仿真" }`
  3. **按时间范围筛选**：
     - `timeRange.type === "all"` → 保留全部帧
     - `timeRange.type === "lastN"` → 保留最后 N 帧（N clamp 至 [1, 总帧数]）
     - `timeRange.type === "range"` → 筛选 `t >= startTime && t <= endTime` 的帧
     - 筛选后帧数为 0 → 同"无数据"错误
  4. **构建 CSV 表头行**：从 `CSV_COLUMN_META` 中筛选用户选择的列，生成表头字符串。格式：`"时间(s),上摆角度(rad),上摆角速度(rad/s),..."`（标签+单位括注）
  5. **构建 CSV 数据行**：遍历筛选后的帧数组。对每帧，按 `columns` 顺序从帧数据中读取对应偏移量（`t`→offset 0, `theta1`→offset 1, ...），按 `decimalPlaces` 精度格式化为数字字符串（使用 `Number.toFixed(decimalPlaces)`）。每行用逗号拼接。**特殊处理**：若某帧任意字段为 NaN/Infinity → 跳过该帧，`console.warn("CSV导出跳过异常帧 t={t}")`
  6. **拼接 CSV 内容**：`[headerRow, ...dataRows].join("\n")`
  7. **检查体积**：若 CSV 字符串长度 > 50MB（约 6000 帧 × 14 列 = ~1.5MB，50MB 为极端上限）→ `ExportResult { success: false, errorCode: "SERIALIZATION_FAILED", error: "数据量过大，请缩小时间范围后重试" }`
  8. **触发下载**：调用已有 `exportCSV(filename, headers, rows)` → 函数内部创建 Blob + URL.createObjectURL + `<a download>` 触发浏览器下载
  9. **返回结果**：`ExportResult { success: true, filename: "{filename}.csv", format: "csv", error: null, errorCode: null }`
- **输入来源**：用户点击导出面板中"导出 CSV"按钮，传入 `CSVExportOptions`
- **输出去向**：浏览器触发 `.csv` 文件下载
- **失败行为**：
  - 无数据 → 返回 `NO_DATA` 错误，UI toast 提示"暂无仿真数据"
  - 序列化异常 → `console.error` 记录，返回 `SERIALIZATION_FAILED`

#### 步骤 2：JSON 场景文件导出

- **操作对象**：当前仿真完整状态 → `SceneFile` JSON → Blob → 浏览器下载
- **具体操作**：
  1. **读取参数和状态**：从 `useSimulationStore.getState()` 读取 `params`（`m1, m2, L1, L2, g, damping`）、`initialConditions`（`theta1, theta1Dot, theta2, theta2Dot`）、`method`、`theta1, theta1Dot, theta2, theta2Dot`（当前状态）、`simTime`
  2. **读取模式**：从 `useAppStore.getState()` 读取 `currentMode`
  3. **校验数据完整性**：检查 `params.m1, params.m2, params.L1, params.L2` 是否 > 0。任一非法 → `ExportResult { success: false, errorCode: "NO_DATA", error: "当前仿真参数无效，无法导出" }`
  4. **采集尾迹（可选）**：若 `includeTrail === true` → 从 `RingBuffer<TrailPoint>` 调用 `.toArray()` → 对每个 `TrailPoint` 展平为 `[position.x, position.y, position.z, velocity]` 元组。若尾迹为空 → `trail` 字段不包含在输出中
  5. **生成缩略图（可选）**：若 `includeThumbnail === true` → 尝试获取 3D Canvas → `canvas.toDataURL("image/png")` 生成 base64 Data URL。若 Canvas 不可用 → `thumbnail` 字段不包含在输出中
  6. **构建 SceneFile 对象**：
     ```typescript
     const sceneFile: SceneFile = {
       version: 1,
       metadata: {
         exportedAt: new Date().toISOString(),
         appVersion: "__APP_VERSION__",  // Vite define 注入
         simTime: currentSimTime,
         mode: currentMode,
         notes: userNotes,  // 用户在导出面板中输入的备注
       },
       params: { m1, m2, L1, L2, g, damping },
       initialConditions: { theta1, theta1Dot, theta2, theta2Dot },
       method: currentMethod,
       currentState: { theta1, theta1Dot, theta2, theta2Dot },
       ...(includeTrail && trailPoints.length > 0 ? { trail: { count: trailPoints.length, points: trailPoints } } : {}),
       ...(includeThumbnail && thumbnail ? { thumbnail } : {}),
     };
     ```
  7. **序列化为 JSON**：`JSON.stringify(sceneFile, null, 2)`（缩进 2 空格，人类可读）
  8. **检查体积**：若 JSON 字符串 > 10MB → 弹出确认 Dialog："场景文件体积较大（{size}MB），包含尾迹数据可能导致加载缓慢。是否继续？"，用户确认后继续
  9. **触发下载**：调用已有 `exportJSON(filename, sceneFile)` → 内部 Blob + `<a download>`
  10. **返回结果**：`ExportResult { success: true, filename: "{filename}.json", format: "json", ... }`
- **输入来源**：用户点击导出面板中"导出 JSON"按钮，传入 `JSONExportOptions`
- **输出去向**：浏览器触发 `.json` 场景文件下载。其他用户可通过"导入场景"功能（未来 DAT-02 扩展或单独模块）加载此文件复现仿真
- **失败行为**：
  - JSON.stringify 抛出异常（循环引用，理论上不会发生）→ `SERIALIZATION_FAILED`
  - Blob 创建失败（内存不足）→ `BLOB_CREATE_FAILED`

#### 步骤 3：PNG 截图导出

- **操作对象**：指定图表/场景的 Canvas DOM 元素 → 离屏高分辨率 Canvas → PNG Blob → 浏览器下载
- **具体操作**：
  1. **确定目标 Canvas**：
     - `target === "3d-view"` → 获取 R3F `<Canvas>` 渲染的 DOM `<canvas>` 元素。方式：通过 `document.querySelector("canvas")` 获取（页面中可能有多个 canvas，优先选择位于 `[data-testid="scene3d"]` 容器内的 canvas）
     - `target === "phase-space"` → 调用 SIM-05 的 `exportPhaseSpaceImage(resolution)` 方法，直接获取 Data URL → 跳过步骤 2-3，直接进入步骤 4
     - `target === "lyapunov-heatmap"` → 通过 ANL-01 组件暴露的 `ChartCanvasRef.getCanvas()` 获取 Canvas
     - `target === "bifurcation"` → 通过 ANL-02 组件暴露的 `ChartCanvasRef.getCanvas()` 获取 Canvas
     - `target === "poincare"` → 通过 ANL-03 组件暴露的 `ChartCanvasRef.getCanvas()` 获取 Canvas
     - `target === "energy-monitor"` → 通过 SIM-04 组件暴露的 `ChartCanvasRef.getCanvas()` 获取 Canvas
  2. **Canvas 可用性检查**：若获取的 Canvas 为 `null` → `ExportResult { success: false, errorCode: "CANVAS_UNAVAILABLE", error: "{PNG_TARGET_LABELS[target]} 尚未渲染，请先切换到对应模式" }`
  3. **调用导出函数**：`exportPNG(canvas, filename, resolution)`（已有 `src/features/data/export/png-export.ts`）：
     - 创建离屏 Canvas：`width = canvas.width * resolution`，`height = canvas.height * resolution`
     - `ctx.drawImage(canvas, 0, 0, offScreen.width, offScreen.height)`
     - `offScreen.toBlob(callback, "image/png")` → 触发浏览器下载
  4. **特殊处理 — phase-space 目标**：调用 `exportPhaseSpaceImage(resolution)` 返回 Data URL 字符串 → 转为 Blob → 触发下载：
     ```typescript
     const dataUrl = exportPhaseSpaceImage(resolution);
     const blob = dataURLToBlob(dataUrl);
     const url = URL.createObjectURL(blob);
     // ... <a download> 触发下载
     ```
  5. **返回结果**：`ExportResult { success: true, filename: "{filename}.png", format: "png", ... }`
- **输入来源**：用户选择目标图表 + 分辨率 → 点击"导出 PNG"
- **输出去向**：浏览器触发 `.png` 文件下载
- **失败行为**：
  - Canvas 不可用 → `CANVAS_UNAVAILABLE`，UI toast 提示切换模式
  - `toBlob` 回调中 `blob === null`（浏览器不支持或内存不足）→ `BLOB_CREATE_FAILED`

#### 步骤 4：导出面板 UI 交互

- **操作对象**：`ExportPanel` 组件（`src/features/data/components/ExportPanel.tsx`）
- **具体操作**：
  1. **打开面板**：用户点击导航栏或工具栏中的"导出"按钮（`<Button variant="outline"><Download /></Button>`）→ `Dialog` 打开
  2. **面板布局**：
     - 顶部：三个格式 Tab（CSV / JSON / PNG），使用 shadcn/ui `Tabs`
     - CSV Tab：列选择（14 个 `Checkbox`，默认全选除 alpha1/alpha2）、时间范围（`Select`: 全部 / 最近 10s / 最近 30s / 最近 60s）、文件名 `Input`（预填默认名）
     - JSON Tab：`Checkbox` "包含尾迹数据"（默认不勾选）、`Checkbox` "包含缩略图"（默认不勾选）、备注 `Textarea`（最大 200 字符）、文件名 `Input`
     - PNG Tab：目标选择（`Select` 下拉：3D仿真场景/相空间图/李雅普诺夫热力图/分岔图/庞加莱截面/能量监控图）、分辨率选择（`Select`: 1× 屏幕 / 2× 高清 / 4× 4K）、文件名 `Input`
     - 底部：`Button` "导出"（主操作）+ `Button variant="ghost"` "取消"
  3. **导出按钮点击**：根据当前 Tab，收集配置 → 调用步骤 1/2/3 对应函数 → 成功后关闭 Dialog + toast "已导出 {filename}"
  4. **文件名默认生成规则**：`"{targetLabel}_{YYYY-MM-DD}_{HH-mm-ss}"`。时间使用 `new Date()` 获取（本地时间）
  5. **CSV 列选择"全选/取消全选"**：提供"全选"`Checkbox`，勾选状态 = 所有列被选中 → 点击切换全部列
- **输入来源**：用户操作导出面板
- **输出去向**：触发对应格式的导出函数 → 浏览器下载
- **失败行为**：导出失败 → Dialog 保持打开，错误消息显示在面板底部红色提示横幅中

---

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| RingBuffer | `.toArray(): StateVector[]` | CSV 导出：获取全量时序帧数据 |
| `useSimulationStore` | `.getState()` 读取 `params`/`initialConditions`/`method`/`simTime`/`theta1`/`theta1Dot`/`theta2`/`theta2Dot`/`isInitialized` | CSV/JSON 导出：读取当前仿真参数和状态 |
| `useAppStore` | `.getState().currentMode` | JSON 导出：读取当前模式 |
| EXP-01 3D Canvas | `document.querySelector("canvas[data-testid='scene3d']")` 或 `document.querySelector("#scene3d-container canvas")` | PNG 导出：3D 视图截图 |
| SIM-05 相空间 | `exportPhaseSpaceImage(scale: number): string` | PNG 导出：相空间图截图（返回 Data URL） |
| ANL-01 热力图 | `ChartCanvasRef.getCanvas(): HTMLCanvasElement \| null` | PNG 导出：李雅普诺夫热力图截图 |
| ANL-02 分岔图 | `ChartCanvasRef.getCanvas(): HTMLCanvasElement \| null` | PNG 导出：分岔图截图 |
| ANL-03 庞加莱截面 | `ChartCanvasRef.getCanvas(): HTMLCanvasElement \| null` | PNG 导出：庞加莱截面截图 |
| SIM-04 能量监控 | `ChartCanvasRef.getCanvas(): HTMLCanvasElement \| null` | PNG 导出：能量监控图截图 |
| 已有 `exportCSV()` | `exportCSV(filename: string, headers: string[], rows: number[][]): void` | CSV 导出：构建 CSV 后调用此函数触发下载 |
| 已有 `exportJSON()` | `exportJSON(filename: string, data: unknown): void` | JSON 导出：构建 SceneFile 后调用此函数触发下载 |
| 已有 `exportPNG()` | `exportPNG(canvas: HTMLCanvasElement, filename: string, resolution?: number): void` | PNG 导出：获取 Canvas 后调用此函数触发下载 |
| shadcn/ui Dialog | `<Dialog>` / `<DialogContent>` / `<DialogHeader>` / `<DialogTitle>` | 导出面板弹窗容器 |
| shadcn/ui Tabs | `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>` | CSV/JSON/PNG 格式切换 |
| shadcn/ui Select | `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectItem>` | 时间范围/分辨率/目标选择 |
| shadcn/ui Checkbox | `<Checkbox>` | CSV 列选择、JSON 选项勾选 |

**本模块对外暴露的公共接口**（`src/features/data/index.ts` 中补充）：

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `exportCSVTimeline(options: CSVExportOptions)` | async function → `ExportResult` | 导出 CSV 时序数据 |
| `exportSceneJSON(options: JSONExportOptions)` | async function → `ExportResult` | 导出 JSON 场景文件 |
| `exportChartPNG(options: PNGExportOptions)` | async function → `ExportResult` | 导出 PNG 截图 |
| `ExportPanel` | React 组件 | 导出面板 UI |
| `ChartCanvasRef` | type | Canvas 引用契约类型（供依赖模块实现） |
| `SceneFile` | type | JSON 场景文件结构 |
| `CSVColumn` / `CSVExportOptions` | type | CSV 导出配置类型 |
| `PNGTarget` / `PNGResolution` / `PNGExportOptions` | type | PNG 导出配置类型 |

---

### 状态机

导出操作涉及的状态转换：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 用户点击"导出"按钮 | `configuring` | 导出 Dialog 已打开 | 显示导出面板 |
| `configuring` | 用户切换 Tab（CSV/JSON/PNG） | `configuring`（切换子面板） | — | 更新面板内显示的配置项 |
| `configuring` | 用户修改配置（列选择/时间范围/分辨率等） | `configuring` | — | 更新 `ExportOptions` 本地状态 |
| `configuring` | 用户点击面板内"导出"按钮 | `exporting` | 配置校验通过（文件名非空、至少选择 1 列 CSV、PNG 目标已选择） | 调用对应导出函数 |
| `configuring` | 用户点击面板内"导出"按钮（校验失败） | `configuring` | — | 面板内红框高亮校验失败的字段 + Tooltip 提示 |
| `configuring` | 用户点击"取消"或关闭 Dialog | `idle` | — | 清空面板配置，Dialog 关闭 |
| `exporting` | 导出成功 | `idle` | — | toast "已导出 {filename}"；Dialog 关闭 |
| `exporting` | 导出失败 | `configuring` | — | 面板底部显示红色错误横幅；Dialog 保持打开 |
| `exporting` | CSV 导出帧数 > 0 但部分 NaN 帧被跳过 | `idle` | — | toast "已导出 {filename}（{skipped} 帧异常数据已跳过）" |
| `idle` | 用户按快捷键 `Ctrl+Shift+E` | `configuring` | 导出面板未打开 | 打开导出 Dialog |

---

### 异常与边界条件

#### 异常 1：无数据可导出（CSV/JSON）

- **触发条件**：
  - CSV：`RingBuffer.toArray()` 返回空数组（仿真未运行过）
  - JSON：`useSimulationStore.isInitialized === false`
- **处理策略**：
  1. 返回 `ExportResult { success: false, errorCode: "NO_DATA", error: "暂无仿真数据，请先运行仿真" }`
  2. UI toast 显示错误消息
  3. 导出面板保持打开，不关闭
  4. 对于 CSV，若仿真正在运行但 RingBuffer 刚清空（reset 后），提示"仿真刚重置，请等待数据积累"
- **重试参数**：不自动重试。用户运行仿真后重新导出。

#### 异常 2：Canvas 不可用（PNG 导出）

- **触发条件**：目标图表 Canvas 元素不存在（用户未切换到对应模式、Canvas 未挂载、或组件尚未渲染）。分情况：
  - ANL-01/ANL-02/ANL-03 图表仅在分析模式下渲染
  - SIM-05 在所有模式下可能渲染
  - 3D Canvas 仅在探索模式或仿真运行时渲染
- **处理策略**：
  1. `getCanvas()` 返回 `null` → 返回 `ExportResult { success: false, errorCode: "CANVAS_UNAVAILABLE", error: "{targetLabel} 尚未渲染，请先切换到对应模式" }`
  2. UI toast 提示具体操作："请切换到 {分析模式/探索模式} 并确保 {图表名称} 已显示"
  3. 导出面板保持打开
- **重试参数**：不自动重试。用户切换模式后重新导出。

#### 异常 3：CSV 数据量过大导致序列化阻塞

- **触发条件**：RingBuffer 满 6000 帧 × 14 列 = 84,000 次数字格式化 + 字符串拼接。在主线程同步执行时可能阻塞 UI > 500ms
- **处理策略**：
  1. 导出前预估行数：若 `行数 > 3000` → 使用 `requestIdleCallback` 或分片处理（每 1000 行一批，`setTimeout(0)` 让出主线程）
  2. 导出过程中显示进度指示器：`ExportPanel` 底部显示进度条 + "正在导出 {current}/{total} 行..."
  3. 若浏览器不支持 `requestIdleCallback` → 降级为同步处理，但显示"正在导出，请稍候..."（禁止 UI 假死时无反馈）
  4. 导出完成后自动移除进度指示器
- **重试参数**：不适用（这是性能优化，非故障）。

#### 异常 4：JSON.stringify 内存不足

- **触发条件**：包含尾迹数据时 JSON 序列化尝试创建 > 10MB 字符串，低内存设备上可能失败
- **处理策略**：
  1. 序列化前预估：`trail.count > 3000` 时弹出确认 Dialog："场景文件体积约 {estimatedSize}KB，在低性能设备上可能导致导出缓慢。是否继续？"
  2. 用户确认后执行 `JSON.stringify`。若抛出异常 → `ExportResult { success: false, errorCode: "SERIALIZATION_FAILED", error: "数据序列化失败，请尝试不包含尾迹数据导出" }`
  3. 建议用户关闭 `includeTrail`
- **重试参数**：不自动重试。用户关闭尾迹选项后重试。

#### 异常 5：PNG 导出时目标 Canvas 的 WebGL 上下文未保留绘图缓冲

- **触发条件**：R3F `<Canvas>` 默认 `preserveDrawingBuffer: false`，在 rAF 回调外调用 `toBlob`/`toDataURL` 可能得到空白图像
- **处理策略**：
  1. 对于 R3F Canvas（`target === "3d-view"`），在导出前通过 R3F 的 `gl` 引用强制渲染一帧：`gl.render(scene, camera)` + `gl.readRenderTargetPixels` 或直接设置 `gl.preserveDrawingBuffer = true`（全局配置）
  2. **推荐方案**：在 R3F `<Canvas gl={{ preserveDrawingBuffer: true }}>` 创建时即启用保留绘图缓冲（成本：性能略微下降 ~5%，但 PNG 导出和小窗截图功能可靠）
  3. 若无法修改 R3F 配置 → 替代方案：通过 `useThree()` hook 获取 `gl` 引用，导出时触发一次 `gl.render(scene, camera)` 后立即 `canvas.toBlob()`
- **重试参数**：不重试。这是架构级决策，需在 EXP-01 中配置。

#### 异常 6：浏览器阻止下载

- **触发条件**：浏览器弹窗拦截器阻止 `a.click()` 触发的下载（部分浏览器要求下载必须由直接用户手势触发）
- **处理策略**：
  1. `ExportPanel` 的导出按钮点击事件中直接调用导出函数（确保在用户手势调用栈内）
  2. 不使用 `setTimeout` 延迟触发下载（会脱离用户手势上下文）
  3. 若仍然被阻止 → 降级方案：显示下载链接 `<a href="{blobUrl}" download>点击此处下载</a>`，让用户手动点击
- **重试参数**：显示手动下载链接供用户点击。

---

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §七 7.2 | 三种导出格式：CSV 时序 / JSON 场景 / PNG 截图 | `exportCSVTimeline()` / `exportSceneJSON()` / `exportChartPNG()` 三个独立函数，互不耦合 |
| 功能设计_v0 §七 7.2 | CSV 完整字段：角度/角速度/坐标/能量/时间戳 | CSV 列映射覆盖 SIM-01 buffer 全部 14 个字段，默认导出 12 个（排除 alpha1/alpha2） |
| 功能设计_v0 §七 7.2 | JSON 场景可分享复现 | `SceneFile` 包含完整 `params` + `initialConditions` + `method` + `currentState`，另一用户导入后可调用 Worker `init` 还原 |
| 功能设计_v0 §七 7.2 | PNG 最高 4K 分辨率 | `PNGResolution` 支持 1/2/4，4 对应 `canvas.width * 4` × `canvas.height * 4` 离屏渲染 |
| 功能设计_v0 §七 7.2 | PNG 目标：3D 视图/相空间/分岔图/庞加莱截面 | `PNGTarget` 联合类型覆盖全部 6 个可截图目标 |
| 技术栈设计 §5.4 | 导出文件体积约束 | JSON 含尾迹时 >10MB 弹出确认；CSV >50MB 阻止导出 |
| 核心原则（AGENT.md） | 逻辑层与表现层分离 | `ExportPanel` 组件仅渲染 UI/收集配置；导出逻辑在 `exportCSVTimeline`/`exportSceneJSON`/`exportChartPNG` 纯函数中；已有底层 `exportCSV`/`exportJSON`/`exportPNG` 仅负责 Blob + 下载触发 |
| 技术栈 §1.2 | 零外部下载依赖 | 禁止 FileSaver.js；使用原生 Blob + `<a download>` |
| 项目结构 §4.8 | `data/` Feature 内聚 | 导出逻辑集中在本模块 `export/` 子目录；`ExportPanel` 组件在 `components/` 子目录 |
| SIM-05 v1.0 | 复用已有导出接口 | 相空间图 PNG 导出调用 `exportPhaseSpaceImage()`，不在 DAT-02 中重新实现 |

---

### 验收测试场景

#### 正向测试 1：CSV 导出完整时序数据

- **Given**：
  ```json
  {
    "仿真状态": "已运行 30 秒（约 1800 帧），RingBuffer 中有 1800 帧数据",
    "当前参数": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "导出配置": {
      "filename": "双摆时序数据_2026-04-28_10-30-00",
      "columns": ["t", "theta1", "theta1Dot", "theta2", "theta2Dot", "kineticEnergy", "potentialEnergy", "totalEnergy"],
      "timeRange": { "type": "all" }
    }
  }
  ```
- **When**：用户点击导出面板中"导出 CSV"按钮
- **Then**：
  - 返回 `ExportResult { success: true, filename: "双摆时序数据_2026-04-28_10-30-00.csv", format: "csv" }`
  - 浏览器触发下载，文件保存为 `.csv`
  - CSV 文件第一行为表头：`时间(s),上摆角度(rad),上摆角速度(rad/s),下摆角度(rad),下摆角速度(rad/s),动能(J),势能(J),总能量(J)`
  - CSV 文件共 1801 行（1 表头 + 1800 数据）
  - 第一帧数据行：`t` 列 ≈ 0.0000，`theta1` 列 ≈ 1.570800
  - 最后一帧数据行：`t` 列 ≈ 30.0000
  - 所有数值均为有限值，无 NaN 或 Infinity
  - 导出面板关闭，toast 显示"已导出 双摆时序数据_2026-04-28_10-30-00.csv"

#### 正向测试 2：JSON 场景文件导出（含尾迹）

- **Given**：
  ```json
  {
    "仿真状态": "已运行 15 秒（900 帧），当前 theta1=2.341, theta2=-1.892",
    "当前参数": { "m1": 2.0, "m2": 1.0, "L1": 1.5, "L2": 1.0, "g": 9.81, "damping": 0.1 },
    "初始条件": { "theta1": 1.5708, "theta1Dot": 0.0, "theta2": 1.5708, "theta2Dot": 0.0 },
    "积分方法": "RK4",
    "导出配置": {
      "filename": "双摆场景_2026-04-28_10-30-00",
      "includeTrail": true,
      "includeThumbnail": false,
      "version": 1
    },
    "尾迹点数": 900
  }
  ```
- **When**：用户点击"导出 JSON"按钮
- **Then**：
  - 返回 `ExportResult { success: true, filename: "双摆场景_2026-04-28_10-30-00.json", format: "json" }`
  - 浏览器触发下载 `.json` 文件
  - JSON 文件结构完整：`version: 1`、`metadata.exportedAt` 为 ISO 8601 时间戳、`metadata.mode: "explore"`、`params.m1 === 2.0`、`initialConditions.theta1 === 1.5708`、`method: "RK4"`、`currentState.theta1 === 2.341`、`trail.count === 900`、`trail.points` 为 900 个 `[x, y, z, velocity]` 元组数组
  - `thumbnail` 字段不存在（`includeThumbnail: false`）
  - JSON 格式化缩进为 2 空格，人类可读

#### 正向测试 3：PNG 4K 导出 3D 视图

- **Given**：
  ```json
  {
    "当前模式": "explore",
    "3D 场景": "正常渲染中，Canvas 尺寸 800×600px，preserveDrawingBuffer: true",
    "导出配置": {
      "filename": "3D仿真场景_2026-04-28_10-30-00",
      "target": "3d-view",
      "resolution": 4
    }
  }
  ```
- **When**：用户点击"导出 PNG"按钮
- **Then**：
  - 返回 `ExportResult { success: true, filename: "3D仿真场景_2026-04-28_10-30-00.png", format: "png" }`
  - 浏览器触发下载 `.png` 文件
  - PNG 图片尺寸为 3200×2400px（800×4 × 600×4）
  - 图片内容与当前 3D 视图一致（双摆位置、尾迹、背景）
  - 导出面板关闭，toast 显示"已导出 3D仿真场景_2026-04-28_10-30-00.png"

#### 异常测试 1：无数据时 CSV 导出失败

- **Given**：应用刚启动，仿真尚未开始（`isInitialized === false`，RingBuffer 为空）
- **When**：用户打开导出面板，点击"导出 CSV"
- **Then**：
  - 返回 `ExportResult { success: false, errorCode: "NO_DATA", error: "暂无仿真数据，请先运行仿真" }`
  - UI toast 显示红色提示"暂无仿真数据，请先运行仿真"
  - 导出面板保持打开，不触发下载
  - IndexedDB 无变化

#### 异常测试 2：Canvas 不可用时 PNG 导出失败

- **Given**：当前模式为 "story"（故事模式），ANL-01/ANL-02/ANL-03 图表均未挂载
- **When**：用户选择 `target: "bifurcation"`，点击"导出 PNG"
- **Then**：
  - 返回 `ExportResult { success: false, errorCode: "CANVAS_UNAVAILABLE", error: "分岔图 尚未渲染，请先切换到对应模式" }`
  - UI toast："请切换到 分析模式 并确保 分岔图 已显示"
  - 导出面板保持打开
  - 不触发下载

#### 异常测试 3：CSV 导出含异常帧时跳过并警告

- **Given**：RingBuffer 中有 1000 帧数据，其中第 500 帧 `theta1` 为 `NaN`（模拟积分短暂发散后恢复）
- **When**：用户导出全部数据的 CSV
- **Then**：
  - CSV 文件包含 999 行数据（跳过 1 帧 NaN）
  - 返回 `ExportResult { success: true }`（导出成功）
  - toast："已导出 {filename}（1 帧异常数据已跳过）"
  - `console.warn` 记录跳过的帧索引和异常值

#### 异常测试 4：JSON 含尾迹时大体积确认

- **Given**：RingBuffer 中有 5000 个尾迹点（约 83 秒仿真），`includeTrail: true`
- **When**：用户点击"导出 JSON"
- **Then**：
  - 弹出确认 Dialog："场景文件体积约 850KB，在低性能设备上可能导致导出缓慢。是否继续？"
  - 用户点击"取消"→ 不导出，Dialog 关闭
  - 用户点击"继续"→ 正常导出，JSON 文件包含 5000 个尾迹点

---

### 注意事项与禁止行为

1. **【CSV 数字格式化】** CSV 单元格中的数字必须使用 `Number.toFixed(decimalPlaces)` 格式化，不能直接拼接 `number.toString()`（会导致超高精度小数如 `1.5707963267948966` 溢出单元格宽度）。小数位数根据 `CSV_COLUMN_META.decimalPlaces` 确定。
2. **【CSV 特殊字符转义】** 若用户备注中含有逗号或换行符（JSON 导出时 `metadata.notes`），不需要 CSV 转义（因为备注不导出到 CSV）。CSV 数据均为纯数字，不存在逗号冲突。
3. **【PNG 文件名冲突】** 若用户连续导出同名文件，浏览器会自动添加后缀 `(1)`/`(2)`。无需在应用层处理重名。但默认文件名含秒级时间戳，通常不会重名。
4. **【R3F Canvas 引用获取】** `target === "3d-view"` 时，不能通过 React ref 获取 Canvas（因为 R3F `<Canvas>` 由 R3F 内部管理）。应使用 `document.querySelector` 查询 DOM 中的 `<canvas>` 元素。为精确选择，EXP-01 应在包裹 `<Canvas>` 的容器 `<div>` 上添加 `data-testid="scene3d"` 属性。
5. **【相空间图导出不经过 Canvas 引用】** SIM-05 的 `exportPhaseSpaceImage(scale)` 内部自己创建离屏 Canvas 并返回 Data URL。DAT-02 不需要获取 SIM-05 的 Canvas DOM 元素。这是与其他图表不同的特殊路径。
6. **【导出按钮必须在用户手势内】** 所有导出函数（`exportCSV`/`exportJSON`/`exportPNG`）中的 `a.click()` 必须在用户点击事件的同步调用栈内执行。禁止在 `setTimeout` / `Promise.then` 中延迟调用（会被浏览器弹窗拦截器阻止）。如 CSV 数据需要异步构建（`requestIdleCallback` 分批），则最后一帧处理完成后不应再 `a.click()`，而应显示手动下载链接。
7. **【禁止行为】** 禁止在 CSV 导出时对数据进行任何变换（如角度转角度、坐标翻转）。所有导出数据必须是仿真原始值（rad 制角度、物理坐标系 y 轴向上）。数据使用者负责单位和坐标转换。
8. **【禁止行为】** 禁止 PN导出时修改原 Canvas 的渲染状态（如改变 clearColor、切换 shader）。导出操作必须对 Canvas 只读。
9. **【禁止行为】** 禁止在 JSON 场景文件中包含绝对路径、本地文件引用或任何不可移植的数据。场景文件必须仅含数值参数和状态数据，可在任何设备上导入复现。
10. **【易错点】** `SceneFile.currentState` 和 `SceneFile.initialConditions` 的字段名相同（`theta1/theta1Dot/theta2/theta2Dot`），但语义不同——`initialConditions` 是仿真开始时的初始值（用于 Worker `init`），`currentState` 是导出时刻的即时状态（用于恢复当前位置）。导入场景时必须用 `initialConditions` 初始化 Worker，用 `currentState` 仅作显示参考。
11. **【易错点】** PNG 导出分辨率计算：`canvas.width` 已经是物理像素（= CSS像素 × devicePixelRatio）。`resolution=4` 时离屏 Canvas 为 `canvas.width * 4` × `canvas.height * 4`，对于 800×600 CSS 像素的 Canvas 在 dpr=2 的屏幕上，物理尺寸为 1600×1200，4K 导出为 6400×4800px。需注意此尺寸的 Canvas 在某些设备上可能超出 WebGL 最大纹理尺寸（通常 8192px）。若超出，应自动降级到 `min(resolution, floor(maxTextureSize / max(canvas.width, canvas.height)))`。
12. **【偷懒红线】** 文档中 `CSV_COLUMN_META` 的 14 列元数据、`SceneFile` 的完整结构、`PNG_TARGET_LABELS` 的 6 个目标映射必须精确出现在代码中，不可使用"..."省略或"其他列类似"。

---

*本文档由 AI 辅助生成，基于功能设计_v0 §七 7.2 + 技术栈设计 §2 #18 + §4.12 + 已有 export utilities + SIM-05 v1.0 导出接口兼容。*
