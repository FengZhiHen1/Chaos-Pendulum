import { getAudioContext } from "./audio-context";
import { createNoiseGenerator } from "./noise-generator";

// ─── 参数类型 ──────────────────────────────────────

export interface SonificationParams {
  /** 下摆球角速度 ω₂ (rad/s)，映射基频: 220 + |ω₂|×200, clamp [55,1760] */
  omega2: number;
  /** 两杆夹角 |θ₂-θ₁| (rad, 归一化 [0,π])，映射和声复杂度 */
  angleBetween: number;
  /** 系统动能 (J)，映射音色亮度 */
  kineticEnergy: number;
  /** 滑动窗口 ω₂ 方差 ((rad/s)²)，>5.0 判定混沌 */
  omega2Variance: number;
  /** 观察到的最大动能 (J)，用于归一化能量→音色映射 */
  maxObservedEnergy: number;
}

// ─── 引擎返回类型 ──────────────────────────────────

export interface SonificationEngine {
  update(params: SonificationParams): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

// ─── 音频节点图常量 ────────────────────────────────

const BASE_FREQ = 220;
const FREQ_SCALE = 200;
const FREQ_MIN = 55;
const FREQ_MAX = 1760;
const MASTER_VOLUME = 0.06; // -24dB 安全上限
const CHAOS_VARIANCE_THRESHOLD = 5.0;
const ANGLE_EMA_ALPHA = 0.02; // 夹角稳定性平滑因子

// ─── 简易 impulse response（代码生成，无外部文件依赖）──

function createSimpleIR(ctx: AudioContext, duration = 2.0): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-3.0 * i) / ctx.sampleRate);
    }
  }
  return ir;
}

// ─── 引擎工厂 ──────────────────────────────────────

/**
 * 创建增强版声音化引擎。
 *
 * 音频节点图:
 *   oscSine ─→ gainSine ─┐
 *   oscHarm ─→ gainHarm ─┤
 *   oscSaw ──→ gainSaw ──→ lowpassFilter ─┤
 *                                          ├──→ merger → masterGain → destination
 *   noiseSource ─→ gainNoise ─→ convolver ─┘
 *
 * 控制映射:
 *   omega2          → oscSine.frequency, oscHarm.frequency, oscSaw.frequency
 *   angleBetween    → oscHarm.detune (纯五度偏离)
 *   kineticEnergy   → gainSaw.gain + lowpassFilter.frequency
 *   omega2Variance  → gainNoise.gain + convolver 干湿比
 *   maxObservedEnergy → 动能归一化分母
 */
export function createSonificationEngine(): SonificationEngine {
  const ctx = getAudioContext();

  // ── 振荡器 ──
  const oscSine = ctx.createOscillator();
  oscSine.type = "sine";
  oscSine.frequency.value = BASE_FREQ;

  const oscHarm = ctx.createOscillator();
  oscHarm.type = "sine";
  oscHarm.frequency.value = BASE_FREQ * 1.5;

  const oscSaw = ctx.createOscillator();
  oscSaw.type = "sawtooth";
  oscSaw.frequency.value = BASE_FREQ;

  // ── 增益 ──
  const gainSine = ctx.createGain();
  gainSine.gain.value = 0.04;

  const gainHarm = ctx.createGain();
  gainHarm.gain.value = 0.02;

  const gainSaw = ctx.createGain();
  gainSaw.gain.value = 0.0;

  // ── 低通滤波 ──
  const lowpassFilter = ctx.createBiquadFilter();
  lowpassFilter.type = "lowpass";
  lowpassFilter.frequency.value = 400;
  lowpassFilter.Q.value = 0.7;

  // ── 噪声 + 混响 ──
  const noise = createNoiseGenerator(2.0);
  const gainNoise = ctx.createGain();
  gainNoise.gain.value = 0.0;

  // 卷积混响（代码生成 impulse response）
  const convolver = ctx.createConvolver();
  try {
    convolver.buffer = createSimpleIR(ctx, 2.0);
  } catch {
    console.warn("EXP-03: Convolver buffer creation failed, reverb disabled");
  }

  // ── 合并 + 主增益 ──
  const merger = ctx.createChannelMerger(1);
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0; // 初始静音

  // ── 连线 ──
  oscSine.connect(gainSine);
  oscHarm.connect(gainHarm);
  oscSaw.connect(gainSaw);

  gainSine.connect(merger);
  gainHarm.connect(merger);
  gainSaw.connect(lowpassFilter);
  lowpassFilter.connect(merger);

  noise.source.connect(gainNoise);
  gainNoise.connect(convolver);
  convolver.connect(merger);

  merger.connect(masterGain);
  masterGain.connect(ctx.destination);

  // ── 启动所有振荡器和噪声源 ──
  oscSine.start();
  oscHarm.start();
  oscSaw.start();
  noise.start();

  // ── 内部可变状态 ──
  let smoothedAngle = 0;
  let firstAngle = true;
  let enabled = false;
  let nanSkipCount = 0;

  // ── 引擎 API ──
  return {
    update(params: SonificationParams) {
      const { omega2, angleBetween, kineticEnergy, omega2Variance, maxObservedEnergy } = params;

      // NaN 检测
      if (isNaN(omega2) || isNaN(angleBetween) || isNaN(kineticEnergy) || isNaN(omega2Variance) || isNaN(maxObservedEnergy)) {
        nanSkipCount++;
        if (nanSkipCount >= 60) {
          masterGain.gain.value = 0; // 防止爆音
        }
        return;
      }
      if (nanSkipCount > 0) {
        nanSkipCount = 0;
        if (enabled) masterGain.gain.value = MASTER_VOLUME;
      }

      // ── 音高更新（omega2 → frequency）──
      const rawFreq = BASE_FREQ + Math.abs(omega2) * FREQ_SCALE;
      const freq = clamp(rawFreq, FREQ_MIN, FREQ_MAX);
      const now = ctx.currentTime;
      const smoothTime = 0.05;

      oscSine.frequency.setTargetAtTime(freq, now, smoothTime);
      oscSaw.frequency.setTargetAtTime(freq, now, smoothTime);

      // ── 和声更新（angleBetween 稳定性 → harmony）──
      if (firstAngle) {
        smoothedAngle = angleBetween;
        firstAngle = false;
      } else {
        smoothedAngle = smoothedAngle * (1 - ANGLE_EMA_ALPHA) + angleBetween * ANGLE_EMA_ALPHA;
      }
      const instability = clamp(Math.abs(angleBetween - smoothedAngle) / Math.PI, 0, 1);
      const ratio = 1.5 - instability * 1.0; // [0.5, 1.5]，1.5=纯五度
      const harmFreq = clamp(freq * ratio, 55, 3520);
      oscHarm.frequency.setTargetAtTime(harmFreq, now, smoothTime);
      // 颤音效果：不稳定时增加 detune 偏移
      oscHarm.detune.setTargetAtTime(instability * 20, now, 0.1);

      // ── 音色更新（动能 → 锯齿混合 + 滤波器截至）──
      const effectiveMaxEnergy = Math.max(0.1, maxObservedEnergy);
      const e = clamp(kineticEnergy / effectiveMaxEnergy, 0, 1);
      const sawGain =
        e < 0.3 ? 0 : e < 0.7 ? ((e - 0.3) / 0.4) * 0.015 : 0.015;
      gainSaw.gain.setTargetAtTime(sawGain, now, 0.1);
      const cutoffHz = 400 + e * 7600; // [400, 8000]
      lowpassFilter.frequency.setTargetAtTime(cutoffHz, now, 0.1);

      // ── 混沌标记（omega2 方差 → 噪声 + 混响）──
      const isChaotic = omega2Variance > CHAOS_VARIANCE_THRESHOLD;
      const noiseTarget = isChaotic ? 0.03 : 0.0;
      gainNoise.gain.setTargetAtTime(noiseTarget, now, 0.3);
    },

    setEnabled(on: boolean) {
      enabled = on;
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setTargetAtTime(on ? MASTER_VOLUME : 0, ctx.currentTime, 0.05);
      if (!on) {
        // 关闭时重置 NaN 计数器
        nanSkipCount = 0;
      }
    },

    dispose() {
      try { oscSine.stop(); } catch { /* 已停止则忽略 */ }
      try { oscHarm.stop(); } catch { /* 已停止则忽略 */ }
      try { oscSaw.stop(); } catch { /* 已停止则忽略 */ }
      noise.dispose();
      gainSine.disconnect();
      gainHarm.disconnect();
      gainSaw.disconnect();
      gainNoise.disconnect();
      lowpassFilter.disconnect();
      convolver.disconnect();
      merger.disconnect();
      masterGain.disconnect();
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
