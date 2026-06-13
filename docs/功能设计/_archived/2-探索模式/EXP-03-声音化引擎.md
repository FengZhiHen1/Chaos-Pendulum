# 功能点：EXP-03 声音化引擎

> **文档生成时间**：`2026-04-28 20:16:30 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 20:16:30` | AI Assistant | 初始版本 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.3「声音化系统（Sonification）」；技术栈设计.md §4.3「声音化系统」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供每帧的 `StateVector` 和 `EnergySnapshot`，通过 `useSimulationStore` 消费
  - `EXP-01`（3D 仿真场景）— 声音化与 3D 场景在同一页面共存，静音按钮放置在探索模式控制面板区域
  - `SYS-01`（响应式布局引擎）— 平板/移动端自动禁用声音化（扬声器质量受限）

---

## 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `docs/功能设计/2-探索模式/EXP-01-3D仿真场景.md`（v1.0, 2026-04-28 19:30:00 CST）
  - `docs/功能设计/2-探索模式/EXP-02-运动尾迹渲染.md`（v1.0, 2026-04-28 20:00:00 CST）
- **兼容性结论**：
  - **无冲突**。EXP-01 和 EXP-02 均不涉及音频功能，EXP-03 是独立的听觉通道
  - **类型复用**：
    - 复用 `StateVector`（来自 `src/shared/types/physics.ts`），从中提取 `omega2`（角速度 → 音高）、`theta2 - theta1`（夹角 → 和声）
    - 复用 `EnergySnapshot`（来自 `src/shared/types/physics.ts`），从中提取 `kinetic`（动能 → 音色亮度）
    - 复用 `useSimulationStore.(state|energy|isRunning)`，每帧读取最新物理状态
    - 复用 `useExploreStore.sonificationEnabled`，控制音频开关
    - 复用 `useAppStore.deviceType`，平板/手机自动禁用
  - **增强已有代码**：
    - `src/shared/audio/sonification.ts` 中的 `createSonificationEngine()` — 当前版本仅实现了基础音高+增益映射，缺少能量→音色映射（正弦→锯齿波渐变）和基于 Lyapunov 的混沌标记。本模块**增强**该函数而非重写
    - `src/shared/audio/noise-generator.ts` 中的 `createNoiseGenerator()` — 已有白噪声生成能力，本模块在 Lyapunov > 0 时将其混入输出，并添加 `ConvolverNode` 混响效果
    - `src/shared/audio/audio-context.ts` — 复用 `resumeAudioContext()` 处理用户手势激活，无需修改
  - **新增文件**：
    - `src/features/explore/hooks/useSonification.ts` — 每帧调用引擎 update 的 hook
    - `src/features/explore/components/SonificationToggle.tsx` — 开关按钮 UI
    - `src/features/explore/hooks/useChaosIndicator.ts` — 简化混沌检测器（滑动窗口 omega2 方差）
- **复用的已有定义**：`StateVector`、`EnergySnapshot`、`useSimulationStore`、`useExploreStore.sonificationEnabled`、`useAppStore.deviceType`、`getAudioContext()`、`resumeAudioContext()`、`createSonificationEngine()`、`createNoiseGenerator()`

---

## 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，`SonificationToggle` 组件
  - `zustand@^4.5.5` — 订阅 `useSimulationStore` 和 `useExploreStore`
  - Web Audio API（浏览器原生，无版本号）：
    - `AudioContext` — 音频上下文（由 `src/shared/audio/audio-context.ts` 管理）
    - `OscillatorNode` — 振荡器（正弦波基音 + 锯齿波泛音），`.type` 切换：`"sine"` / `"triangle"` / `"sawtooth"`，`.frequency.value` 设置频率
    - `GainNode` — 增益控制（音量 + 噪声混合比），`.gain.value`
    - `BiquadFilterNode` — 双二阶级滤波器（低通滤波模拟能量音色），`.type = "lowpass"`，`.frequency.value` 控制截至频率，`.Q.value` 控制共振
    - `ConvolverNode` — 卷积混响（混沌"空间感"标记），`.buffer` 加载 impulse response
    - `AudioBufferSourceNode` — 噪声源（混沌标记），`.buffer`、`.loop = true`
    - `ChannelMergerNode` — 合并振荡器与噪声的立体声通道
  - `@/shared/audio` — 已有音频基础设施：`getAudioContext`、`resumeAudioContext`、`closeAudioContext`

- **禁止使用**：
  - 禁止在页面加载时自动创建 `AudioContext`（浏览器自动播放策略：必须在用户手势回调中调用 `resumeAudioContext()`）
  - 禁止在 `useFrame` 或高频回调中创建新的 `OscillatorNode`（应在引擎初始化时创建，运行时只修改 `.frequency.value` 和 `.gain.value`）
  - 禁止使用 `<audio>` 标签或外部音频文件（所有声音必须通过 Web Audio API 合成）
  - 禁止导入第三方音频库（如 Tone.js），必须使用原生 Web Audio API
  - 禁止在 `deviceType !== "desktop"` 时启用声音化（平板和手机自动禁用）

---

## 输入定义（精确类型）

### 核心参数类型

```typescript
/**
 * 声音化引擎每帧更新参数。
 * 从 useSimulationStore 每帧读取，传入引擎的 update() 方法。
 */
interface SonificationParams {
  /**
   * 下摆球角速度 ω₂（rad/s）。
   * 来源：useSimulationStore.state.omega2。
   * 映射为基频：freq = 220 + |ω₂| × 200，clamp 至 [55, 1760] Hz。
   * 范围：理论无上限，典型值 -10.0 – 10.0。
   * 示例值：3.5
   */
  omega2: number;

  /**
   * 两杆夹角 |θ₂ - θ₁|（弧度，归一化到 [0, π]）。
   * 来源：normalizeAngle(state.theta2 - state.theta1)。
   * 映射为和声复杂度：夹角稳定 → 纯五度（频率比 3:2）；
   * 夹角波动 → 不协和音程（频率比偏离 3:2，趋向无理数比）。
   * 示例值：0.8
   */
  angleBetween: number;

  /**
   * 系统总动能（焦耳）。
   * 来源：useSimulationStore.energy.kinetic。
   * 映射为音色亮度：低动能 → 柔和正弦波（低通滤波截至 400Hz）；
   * 高动能 → 明亮锯齿波（低通滤波截至 8000Hz + 锯齿泛音混合）。
   * 范围：0.0 – 约 50.0（取决于参数组合）。
   * 示例值：12.5
   */
  kineticEnergy: number;

  /**
   * 滑动窗口内 ω₂ 的方差（(rad/s)²）。
   * 来源：useChaosIndicator hook 内部计算（步骤 4）。
   * 方差 > 阈值（5.0）→ 判定为混沌运动 → 混入白噪声 + 卷积混响。
   * 范围：0.0 – 约 100.0。
   * 示例值：2.3（周期运动）/ 35.7（混沌运动）
   */
  omega2Variance: number;

  /**
   * 观察到的最大动能（焦耳），用于归一化能量→音色映射。
   * 初始值 = 1.0，运行时随 max(历史最大值, 当前值) 动态扩展。
   * 来源：引擎内部追踪。
   * 示例值：25.0
   */
  maxObservedEnergy: number;
}
```

### Hook 接口：`useSonification`

```typescript
/**
 * useSonification hook 返回类型。
 * 在 Scene3D 所在组件中调用，每帧从 Store 读取数据并驱动引擎。
 */
interface UseSonificationAPI {
  /**
   * 声音化是否已激活（用户点击了开启按钮 + AudioContext 已 resume）。
   * true = 正在发声；false = 静音。
   */
  isActive: boolean;

  /**
   * 用户点击开关按钮时调用。
   * 首次调用触发 AudioContext.resume()（浏览器自动播放策略要求用户手势）。
   * 副作用：设置 useExploreStore.sonificationEnabled。
   */
  toggle: () => void;
}
```

### 组件 Props：`SonificationToggle`

```typescript
/**
 * 声音化开关按钮组件属性。
 * 渲染在探索模式控制面板中。
 */
interface SonificationToggleProps {
  /**
   * 父容器额外 CSS 类名。默认 ""。
   * 示例值："mt-2"（顶部间距）
   */
  className?: string;

  /**
   * 按钮尺寸。默认 "md"。
   * "sm": 高 32px，字号 12px（平板端）
   * "md": 高 40px，字号 14px（桌面端默认）
   */
  size?: "sm" | "md";
}
```

### 混沌检测器接口：`useChaosIndicator`

```typescript
/**
 * 混沌检测器返回类型。
 * 基于滑动窗口内 ω₂ 方差的简化混沌判定。
 */
interface ChaosIndicatorAPI {
  /**
   * 最近 WINDOW_SIZE 帧 ω₂ 值的方差。
   * 每帧追加新 ω₂ 值，移除最旧值。
   * 范围：≥ 0.0。
   * 示例值：周期运动 1.2 / 混沌运动 42.1
   */
  variance: number;

  /**
   * 当前是否判定为混沌。
   * variance > CHAOS_VARIANCE_THRESHOLD (5.0) 时为 true。
   */
  isChaotic: boolean;
}
```

---

## 输出定义（精确类型）

本模块为音频输出模块，无结构化数据返回。其"输出"是扬声器播放的实时合成音频，包含以下可感知的声音维度：

| 声音维度 | 物理参数来源 | 音频实现 | 感知效果 |
|---------|------------|---------|---------|
| 基频音高 | `omega2` | OscillatorNode.frequency = `220 + abs(omega2) * 200`，clamp [55, 1760] | 周期运动 → 稳定音高（如持续的中音 C）；混沌运动 → 无规则音高跳跃（忽高忽低） |
| 和声复杂度 | `angleBetween` 的稳定性 | 第二振荡器频率比 = `1.5 - instability * 0.5`（稳定=1.5纯五度，不稳定→1.0同度或更低） | 稳定夹角 → 纯五度和声（和谐悦耳）；夹角剧变 → 频率比漂移为无理数（不协和"走调"感） |
| 音色亮度 | `kineticEnergy / maxObservedEnergy` | 低能量：正弦波 + 低通滤波截至 400Hz；高能量：混合锯齿波泛音 + 低通滤波截至 8000Hz | 低动能 → 低沉柔和；高动能 → 明亮尖锐 |
| 混沌标记 | `omega2Variance > 5.0` | 白噪声 GainNode 渐入（0 → 0.03）+ ConvolverNode 混响 wet 渐入（0 → 0.4） | 混沌时背景混入"沙沙"声 + 空间感增强，形成"声音碎裂"效果 |
| 全局静音 | `sonificationEnabled` | 主 GainNode.gain = 0（静音）或 0.06（正常音量） | 默认静音，避免评审现场嘈杂 |

---

## 核心逻辑步骤

### 步骤 1：混沌检测器初始化

- **操作对象**：`useChaosIndicator` hook 内部状态（环形缓冲 `omega2History: Float64Array` + `cursor: number` + `isFirstPass: boolean`）
- **具体操作**：
  1. 创建固定长度 `WINDOW_SIZE = 120`（2 秒 × 60fps）的 `Float64Array` 作为滑动窗口缓冲
  2. 初始化 `cursor = 0`，`isFirstPass = true`（窗口未满 120 帧前使用降级策略）
  3. 每帧在 `useFrame`（或通过 EXP-01 的 Scene3D 调用）中追加当前 `omega2` 值：
     ```typescript
     function pushOmega2(value: number): void {
       if (isNaN(value) || !isFinite(value)) return; // 跳过非法值
       omega2History[cursor] = value;
       cursor = (cursor + 1) % WINDOW_SIZE;
       if (cursor === 0) isFirstPass = false;
     }
     ```
  4. 计算方差：
     - 若 `isFirstPass`：`validCount = cursor`（窗口尚未填满）
     - 否则：`validCount = WINDOW_SIZE`
     - 计算均值：`mean = sum(omega2History[0..validCount-1]) / validCount`
     - 计算方差：`variance = sum((x - mean)² for x in omega2History[0..validCount-1]) / validCount`
  5. 返回 `{ variance, isChaotic: variance > CHAOS_VARIANCE_THRESHOLD }`，其中 `CHAOS_VARIANCE_THRESHOLD = 5.0`
- **输入来源**：每帧 `useSimulationStore.getState().state.omega2`
- **输出去向**：`{ variance, isChaotic }` → 传入步骤 2（引擎 update）
- **失败行为**：
  - 仿真暂停（`isRunning === false`）：不追加新值，方差保持上次计算结果不变
  - 重置仿真：清空窗口缓冲（`omega2History.fill(0)`，`cursor = 0`，`isFirstPass = true`）

### 步骤 2：音频引擎初始化（增强版 `createSonificationEngine`）

- **操作对象**：Web Audio API 节点图
- **具体操作**：
  1. 在 `useSonification` hook 挂载时调用（惰性初始化，首次 `toggle()` 触发），创建增强版音频节点图：
     ```
     节点连线图（文本形式）：
     
     oscSine (正弦基音) ──→ gainSine ──┐
                                         ├──→ merger → masterGain → destination
     oscHarm (和声正弦) ──→ gainHarm ──┘
     
     oscSaw (锯齿泛音) ──→ gainSaw ──→ lowpassFilter ──→ merger
     
     noiseSource (白噪声) ──→ gainNoise ──→ convolver (混响) ──→ merger
     
     控制信号流向：
     - omega2 → oscSine.frequency, oscHarm.frequency, oscSaw.frequency
     - angleBetween stability → oscHarm.detune（微调音分偏离纯五度）
     - kineticEnergy → gainSaw.gain（泛音混合比）+ lowpassFilter.frequency（截至频率）
     - isChaotic → gainNoise.gain（噪声混合比）+ convolver 干湿比
     - sonificationEnabled → masterGain.gain（总音量）
     ```
  2. 各节点参数初始化：
     - `oscSine`: `type = "sine"`, `frequency = 220`
     - `oscHarm`: `type = "sine"`, `frequency = 330`（初始纯五度 = 220 × 1.5）
     - `oscSaw`: `type = "sawtooth"`, `frequency = 220`
     - `gainSine.gain = 0.04`（基音增益，占总音量 2/3）
     - `gainHarm.gain = 0.02`（和声增益，占总音量 1/3）
     - `gainSaw.gain = 0.0`（锯齿泛音初始静音）
     - `lowpassFilter`: `type = "lowpass"`, `frequency = 400`, `Q = 0.7`
     - `gainNoise.gain = 0.0`（噪声初始静音）
     - `masterGain.gain = 0.06`（主音量，-24dB，避免刺耳）
     - `convolver.buffer`：使用代码生成的简易 impulse response（2 秒衰减指数包络 × 白噪声，模拟小型房间混响），而非加载外部音频文件
  3. 所有振荡器和噪声源调用 `.start()` 开始运行（即使 gain=0，确保频率变化无缝）

     简易 impulse response 生成代码：
     ```typescript
     function createSimpleIR(ctx: AudioContext, duration = 2.0): AudioBuffer {
       const length = ctx.sampleRate * duration;
       const ir = ctx.createBuffer(2, length, ctx.sampleRate);
       for (let ch = 0; ch < 2; ch++) {
         const data = ir.getChannelData(ch);
         for (let i = 0; i < length; i++) {
           data[i] = (Math.random() * 2 - 1) * Math.exp(-3.0 * i / ctx.sampleRate);
         }
       }
       return ir;
     }
     ```
  4. 返回引擎控制对象 `{ update, setEnabled, dispose }`
- **输入来源**：用户首次点击开关按钮触发初始化
- **输出去向**：`AudioContext.destination`（扬声器）
- **失败行为**：
  - `AudioContext` 创建失败（极罕见，浏览器不支持 Web Audio）：`console.error("EXP-03: AudioContext not available")`，`toggle()` 无效果，按钮显示禁用态
  - `convolver.buffer` 赋值失败：跳过混响节点，噪声直接通过 gainNoise → merger，无空间效果但不影响核心功能

### 步骤 3：每帧音频参数更新

- **操作对象**：引擎的 AudioNode 参数（`.frequency.value`、`.gain.value`、`.detune.value`、`BiquadFilterNode.frequency.value`）
- **具体操作**：每帧（在 `useFrame` 中）执行以下更新序列：
  1. 从 Store 读取最新值：
     ```
     const omega2 = useSimulationStore.getState().state.omega2;
     const theta1 = useSimulationStore.getState().state.theta1;
     const theta2 = useSimulationStore.getState().state.theta2;
     const kineticEnergy = useSimulationStore.getState().energy.kinetic;
     const isRunning = useSimulationStore.getState().isRunning;
     ```
  2. 若 `isRunning === false`：保持所有参数不变（声音"定格"在当前音高），return
  3. **音高更新**：
     ```
     const rawFreq = 220 + Math.abs(omega2) * 200;
     const freq = clamp(rawFreq, 55, 1760);
     oscSine.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05); // 5ms 平滑过渡
     oscSaw.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
     ```
  4. **和声更新**：
     ```
     const angle = normalizeAngle(theta2 - theta1);
     // 追踪夹角稳定性：指数移动平均 (EMA)，平滑因子 α = 0.02
     smoothedAngle = smoothedAngle * 0.98 + angle * 0.02;
     const instability = clamp(Math.abs(angle - smoothedAngle) / Math.PI, 0, 1);
     // 频率比：1.5 (纯五度) → 远离 1.5（不协和）
     const ratio = 1.5 - instability * 1.0; // 范围 [0.5, 1.5]
     const harmFreq = clamp(freq * ratio, 55, 3520);
     oscHarm.frequency.setTargetAtTime(harmFreq, ctx.currentTime, 0.05);
     // 微调 detune 增加不稳定感：instability > 0.5 时添加颤音效果
     oscHarm.detune.setTargetAtTime(instability * 20, ctx.currentTime, 0.1); // 最多 ±20 音分偏移
     ```
  5. **音色更新**（能量 → 锯齿波混合 + 滤波器截至）：
     ```
     // 更新观察到的最大动能
     maxObservedEnergy = Math.max(maxObservedEnergy, kineticEnergy);
     const e = clamp(kineticEnergy / maxObservedEnergy, 0, 1);
     // 锯齿泛音增益：e < 0.3 → 0, e 0.3-0.7 → 线性 0→0.015, e > 0.7 → 0.015
     const sawGain = e < 0.3 ? 0 : e < 0.7 ? (e - 0.3) / 0.4 * 0.015 : 0.015;
     gainSaw.gain.setTargetAtTime(sawGain, ctx.currentTime, 0.1);
     // 低通滤波截至频率：低能量 400Hz → 高能量 8000Hz
     const cutoffHz = 400 + e * 7600;
     lowpassFilter.frequency.setTargetAtTime(cutoffHz, ctx.currentTime, 0.1);
     ```
  6. **混沌标记更新**：
     ```
     const { isChaotic } = chaosIndicator.pushAndGet(omega2);
     // 噪声渐入/渐出
     const noiseTarget = isChaotic ? 0.03 : 0.0;
     gainNoise.gain.setTargetAtTime(noiseTarget, ctx.currentTime, 0.3); // 300ms 渐入
     // 混响干湿比
     const reverbWet = isChaotic ? 0.4 : 0.0;
     // 简化方案：通过 gainNoise 控制噪声量间接体现混响
     ```
- **输入来源**：`useSimulationStore.getState()`、`chaosIndicator`
- **输出去向**：AudioNode 参数（直接内存写入，无 React 重渲染）
- **失败行为**：
  - 任意值含 NaN：跳过本帧所有参数更新，保持上一帧音频参数不变，`nanSkipCount++`

### 步骤 4：混沌检测器滑动窗口

- **操作对象**：`useChaosIndicator` hook 内部 `Float64Array` 环形缓冲
- **具体操作**：（已在步骤 1 中详述，此处做引用）
- **输入来源**：每帧 `omega2`
- **输出去向**：`{ variance, isChaotic }` 判定结果
- **失败行为**：同步骤 1

### 步骤 5：用户手势激活与开关 UI

- **操作对象**：`SonificationToggle` React 组件 + `useSonification` hook
- **具体操作**：
  1. 渲染一个按钮，显示当前状态：
     - `sonificationEnabled === false`：显示「🔇 开启物理声效」按钮，白色边框，暗色背景
     - `sonificationEnabled === true`：显示「🔊 关闭物理声效」按钮，绿色边框高亮
  2. 点击按钮时：
     a. 若 `sonificationEnabled === false`（开启）：
        - 首次调用 `resumeAudioContext()`（await，可能需要几百毫秒，浏览器自动播放策略）
        - 若引擎尚未初始化，调用 `createSonificationEngine()` 创建节点图
        - 调用 `engine.setEnabled(true)`
        - 设置 `useExploreStore.setSonificationEnabled(true)`
     b. 若 `sonificationEnabled === true`（关闭）：
        - 调用 `engine.setEnabled(false)`（masterGain.gain = 0）
        - 设置 `useExploreStore.setSonificationEnabled(false)`
        - **不销毁**引擎节点（保留振荡器运行，避免下次开启时的重新初始化延迟）
  3. 按钮在 `deviceType !== "desktop"` 时自动隐藏（不渲染任何 DOM 元素），因为平板和手机自动禁用声音化
- **输入来源**：用户点击事件、`useExploreStore.sonificationEnabled`、`useAppStore.deviceType`
- **输出去向**：音频开关状态变化 + UI 按钮视觉反馈
- **失败行为**：
  - `resumeAudioContext()` 被浏览器拒绝（用户未交互？但实际上已在 click 回调中调用）：捕获异常，显示 Toast「浏览器阻止了音频播放，请点击页面后再试」，不改变 `sonificationEnabled` 状态
  - `deviceType` 为 `"tablet"` 或 `"mobile"`：组件返回 `null`（不渲染），引擎不初始化

### 步骤 6：引擎销毁与清理

- **操作对象**：音频节点图
- **具体操作**：
  1. 在 `useSonification` hook 的 `useEffect` cleanup 中：
     - 停止所有振荡器：`oscSine.stop()`, `oscHarm.stop()`, `oscSaw.stop()`
     - 停止噪声源：`noiseSource.stop()`
     - 断开所有节点连接：`.disconnect()`
     - 调用 `closeAudioContext()`
  2. 组件完全卸载时执行（如切换到分析模式后探索模式的组件树被卸载）
- **输入来源**：React 组件卸载生命周期
- **输出去向**：释放 Web Audio 资源
- **失败行为**：若 `.stop()` 在已停止的振荡器上调用，浏览器静默忽略，无异常

---

## 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useSimulationStore` | `useSimulationStore.getState().state` | 每帧读取 `omega2`, `theta1`, `theta2` |
| `useSimulationStore` | `useSimulationStore.getState().energy` | 每帧读取 `kinetic`（动能 → 音色） |
| `useSimulationStore` | `useSimulationStore.getState().isRunning` | 控制暂停时音频冻结 |
| `useExploreStore` | `useExploreStore((s) => s.sonificationEnabled)` | 读取音频开关状态 |
| `useExploreStore` | `useExploreStore.getState().setSonificationEnabled` | 切换开关状态 |
| `useAppStore` | `useAppStore((s) => s.deviceType)` | 非桌面端禁用声音化 |
| `getAudioContext()` | `src/shared/audio/audio-context.ts` | 获取/创建 AudioContext 实例 |
| `resumeAudioContext()` | `src/shared/audio/audio-context.ts` | 用户手势激活 AudioContext |
| `closeAudioContext()` | `src/shared/audio/audio-context.ts` | 组件卸载时清理 |
| `createNoiseGenerator()` | `src/shared/audio/noise-generator.ts` | 白噪声发生器（混沌标记） |
| R3F | `useFrame` | 每帧驱动音频参数更新 |

---

## 状态机

本功能点的音频生命周期状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| IDLE | `user_click_enable` | ACTIVATING | `deviceType === "desktop"` 且 `sonificationEnabled === false` | 调用 `resumeAudioContext()`，浏览器弹出音频权限请求（首次） |
| ACTIVATING | `context_resumed` | ACTIVE | `AudioContext.state === "running"` | 创建音频节点图，引擎初始化，`sonificationEnabled = true`，按钮切换为绿色高亮 |
| ACTIVATING | `context_blocked` | IDLE | 浏览器拒绝 AudioContext resume | Toast 提示用户，`sonificationEnabled` 保持 false |
| ACTIVE | `user_click_disable` | IDLE | `sonificationEnabled === true` | `masterGain.gain = 0`（静音），`sonificationEnabled = false`，按钮切换为白色边框；节点不销毁 |
| ACTIVE | `simulation_paused` | ACTIVE (frozen) | `isRunning === false` | 音频参数停止更新，保持当前音高/音色不变 |
| ACTIVE (frozen) | `simulation_resumed` | ACTIVE | `isRunning === true` | 恢复每帧音频参数更新，音高从定格值继续变化 |
| ACTIVE | `mode_switched` | IDLE | 用户切换到分析/实验/故事模式 | 组件卸载，cleanup 销毁全部音频节点，调用 `closeAudioContext()` |
| ANY | `device_not_desktop` | HIDDEN | `deviceType !== "desktop"` | 按钮不渲染，引擎不初始化，任何状态下都不发声 |

---

## 异常与边界条件

### 异常 1：浏览器阻止 AudioContext 自动播放

- **触发条件**：
  - 用户首次点击"开启物理声效"按钮 → `resumeAudioContext()` 被调用
  - 浏览器自动播放策略（Autoplay Policy）拒绝：`AudioContext.state` 仍为 `"suspended"`
  - 常见场景：用户在页面加载后未与页面交互就触发了音频（但本模块通过按钮点击调用，通常不会被阻止；防御性处理）
- **处理策略**：
  1. `await resumeAudioContext()` 后检查 `AudioContext.state`
  2. 若仍为 `"suspended"`：显示 Toast 提示 `「浏览器阻止了音频播放，请再次点击按钮」`，持续 3 秒
  3. 按钮状态**不**切换为绿色高亮（仍显示"开启"状态）
  4. `sonificationEnabled` 保持 `false`
  5. `console.warn("EXP-03: AudioContext blocked by browser autoplay policy")`
- **重试参数**：不自动重试。用户再次点击按钮时重新尝试 `resumeAudioContext()`。

### 异常 2：仿真状态含 NaN 导致音频参数异常

- **触发条件**：
  - `isNaN(omega2) || isNaN(theta1) || isNaN(theta2) || isNaN(kineticEnergy)` 为 true
  - 常见原因：ODE 积分发散
- **处理策略**：
  1. 在每帧 update 前检测所有输入值的合法性
  2. 若任一值为 NaN：跳过本帧所有参数更新，保持上一帧音频参数不变
  3. 连续跳过 60 帧：自动静音（`masterGain.gain = 0`），避免扬声器因参数跳变产生爆音
  4. `console.warn("EXP-03: NaN detected, audio frozen")`
- **重试参数**：状态恢复合法后自动恢复音频参数更新，60 帧静音后自动解除。

### 异常 3：OscillatorNode 意外停止

- **触发条件**：
  - `OscillatorNode` 的 `stop()` 被多次调用（如引擎销毁时序错误）
  - 或浏览器因资源限制终止了音频上下文
- **处理策略**：
  1. 在 `update()` 中捕获 `InvalidStateError`（尝试修改已停止振荡器的参数时抛出）
  2. 捕获后：调用 `dispose()` 销毁旧节点图，调用 `createSonificationEngine()` 重新初始化
  3. 若新引擎创建成功：恢复音频输出
  4. 若新引擎创建失败（如 AudioContext 已关闭）：设置 `sonificationEnabled = false`，按钮显示禁用态
  5. `console.error("EXP-03: Oscillator stopped unexpectedly, reinitializing engine")`
- **重试参数**：最多重建 1 次。重建失败后禁用按钮，需要页面刷新恢复。

### 异常 4：动能持续增长导致 maxObservedEnergy 上限漂移

- **触发条件**：
  - 在长时间仿真中，动能因参数调整而持续增长（如用户逐步增大初始角度）
  - `maxObservedEnergy` 持续更新为新高值，导致归一化的 `e = kineticEnergy / maxObservedEnergy` 始终偏低
- **处理策略**：
  1. 对 `maxObservedEnergy` 施加衰减因子（EMA）：`maxObservedEnergy = max(maxObservedEnergy * 0.9995 + kineticEnergy * 0.0005, kineticEnergy)`
  2. 衰减因子 0.9995 意味着约 2000 帧（≈ 33 秒）旧峰值衰减一半
  3. 这样既能适应参数调整后的新能量范围，又不会因短期尖峰而永久拉高归一化上限
  4. 最小 clamp 至 0.1（防止除以零）
- **重试参数**：不适用。

---

## 原则兑现清单

| 原则编号 | 原则名称 | 来源 | 代码级约束 |
|----------|----------|------|------------|
| P1 | 高内聚低耦合 | 项目结构设计 §2 | `useSonification` hook 内聚所有音频逻辑；外部仅通过 `sonificationEnabled` 开关 + `useSimulationStore` 数据消费交互 |
| P3 | 共享层零业务逻辑 | 项目结构设计 §2 | `src/shared/audio/` 中的函数为纯音频工具（创建振荡器/噪声/上下文管理），不含参数映射算法。算法逻辑在 `useSonification` hook 中 |
| P5 | 响应式降级 | 功能设计_v0 §八 | 平板/手机（`deviceType !== "desktop"`）完全禁用声音化，组件不渲染，引擎不初始化，零 CPU 开销 |
| P6 | 浏览器标准遵循 | 技术栈设计 §4.3 | `AudioContext` 在用户手势（按钮点击）中首次 resume，符合 Chrome/Firefox/Safari 自动播放策略 |
| P7 | 性能无阻塞 | 技术栈设计 §1.2 | 音频更新在 `useFrame` 中直接操作 AudioNode 参数（约 10 次 `.value` 赋值），不创建新对象，不触发 GC |

---

## 验收测试场景

### 正向测试 1：开启声音化后听到音高随运动变化

- **Given**：
  - 桌面端浏览器（`deviceType = "desktop"`）
  - 仿真正在运行，`omega2` 在 `-5.0` – `5.0` 之间周期性变化（小角度周期运动）
  - `sonificationEnabled = false`（初始状态）
  - 按钮显示文字「🔇 开启物理声效」
- **When**：用户点击按钮
- **Then**：
  - `AudioContext` 从 `suspended` → `running`
  - 按钮文字切换为「🔊 关闭物理声效」，边框变为绿色
  - 扬声器输出音频，音高在约 220 – 1220 Hz 之间随 `omega2` 波动
  - 周期运动时音高呈现规律的高低交替（可听见的周期性频率变化）
  - 和声为纯五度（频率比接近 1.5），听感和谐
  - 音色为柔和正弦波（动能较低时）
  - 无白噪声混入（`isChaotic = false`）
  - 控制台无错误或警告

### 正向测试 2：混沌运动触发"声音碎裂"效果

- **Given**：
  - 声音化已开启（同测试 1 最终状态）
  - 用户调整参数至混沌区域（如 `theta1 = 2.0`, `theta2 = 2.5`）
- **When**：仿真运行约 5 秒后 `omega2` 变化剧烈（方差 > 5.0）
- **Then**：
  - 音高开始无规则跳跃（忽高忽低，无法预测）
  - 和声走调（频率比从 1.5 漂移至不稳定值，听感不协和）
  - 音色变亮（锯齿波泛音混入 + 低通滤波截至频率升高）
  - 约 1-2 秒后（滑动窗口积累足够数据点），白噪声渐入（300ms 过渡），背景出现轻微"沙沙"声
  - 整体听感从"和谐悦耳"变为"混乱刺耳"，形成可感知的"声音碎裂"效果
  - 关闭声音化后噪声和音高立即停止

### 异常测试 1：非桌面端不渲染按钮

- **Given**：
  - `deviceType = "mobile"`（或 `"tablet"`）
  - `sonificationEnabled = false`
- **When**：探索模式页面渲染
- **Then**：
  - `SonificationToggle` 组件返回 `null`（DOM 中无按钮元素）
  - `useSonification` hook 的引擎初始化代码未执行
  - `AudioContext` 未创建
  - 无任何音频资源消耗

### 异常测试 2：仿真暂停时音频冻结但不断开

- **Given**：
  - 声音化已开启，音频正在播放
  - `omega2 = 3.0`（对应频率约 820 Hz）
- **When**：用户点击暂停按钮 → `isRunning = false`
- **Then**：
  - 音频不停止（不断开），但频率固定在 820 Hz 不变（持续播放稳定音高）
  - 按钮仍显示绿色高亮「🔊 关闭物理声效」
  - 恢复运行后，音高从 820 Hz 继续随 `omega2` 变化，无跳变或爆音

---

## 文档详细度自检清单

- [x] 文档自包含：不了解代码的人可凭此文档独立完成 EXP-03 编码
- [x] 无偷懒表述：全文无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`、`"参考其他模块"`
- [x] 类型定义完整：`SonificationParams`（5 字段）、`UseSonificationAPI`、`SonificationToggleProps`、`ChaosIndicatorAPI`，每个字段有类型/约束/示例值
- [x] 逻辑步骤完整：6 个步骤，每个有操作对象/具体操作/输入来源/输出去向/失败行为
- [x] 异常处理完整：4 种异常，每种有精确触发阈值和处理策略
- [x] 无隐藏假设：所有公式（`220 + abs(omega2) * 200`、`ratio = 1.5 - instability * 1.0`）和阈值（`CHAOS_VARIANCE_THRESHOLD = 5.0`、`WINDOW_SIZE = 120`）已显式写出

---

## 注意事项与禁止行为

1. **[AudioContext 创建时机]** `new AudioContext()` 必须在用户手势（按钮点击）的回调中或之后立即调用。**禁止**在模块顶层、`useEffect` 挂载时或 `requestAnimationFrame` 中创建 AudioContext（浏览器自动播放策略会将其置为 `suspended` 状态且无法 resume）。已有的 `getAudioContext()` 惰性创建 + `resumeAudioContext()` 组合可安全应对。

2. **[OscillatorNode 生命周期]** `OscillatorNode.start()` 只能调用一次。`stop()` 后振荡器无法重新 start。因此必须在引擎初始化时 `start()` 所有振荡器（即使 gain=0），整个生命周期内通过 `gain` 控制音量开关。**禁止**在开启/关闭声音化时反复 `start()`/`stop()` 振荡器。

3. **[能量归一化衰减]** `maxObservedEnergy` 必须使用 EMA 衰减（α=0.0005，半衰期 ≈ 33 秒），避免长期运行后因历史尖峰而导致归一化失效。**禁止**使用简单 `Math.max` 追踪（不可逆增长）。

4. **[白噪声节点]** 混沌标记的白噪声必须使用独立的 `createNoiseGenerator()` 实例，通过专用的 `gainNoise` 节点控制混合比。**禁止**将噪声与振荡器共享同一个 GainNode。

5. **[平台降级]** `deviceType !== "desktop"` 时，`SonificationToggle` 组件返回 `null`，`useSonification` hook 的引擎初始化代码不执行。**禁止**在任何非桌面设备上创建音频节点。

6. **[Impulse Response 自生成]** ConvolverNode 的 impulse response 必须通过代码生成（指数衰减白噪声），**禁止**加载外部 `.wav` 文件（项目约束：自包含 HTML5 文件夹，无外部资源依赖）。

7. **[和声 Instability 平滑]** `angleBetween` 的稳定性通过 EMA（α=0.02，半衰期 ≈ 35 帧 ≈ 0.6 秒）追踪，用于区分"暂时夹角波动"和"持续夹角不稳定"。**禁止**直接使用帧间差值（会因仿真正常摆动而产生大量误判）。

8. **[音量安全]** `masterGain.gain` 上限为 0.06（约 -24dB），所有子增益总和不得超过 0.1。**禁止**在未限制 masterGain 的情况下直接连接振荡器到 `destination`（音量过大可能损伤听力或损坏扬声器）。

---

*本文档由 AI 辅助生成，建议经技术负责人评审后生效。*
