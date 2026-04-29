import { getAudioContext } from "./audio-context";

export interface NoiseGenerator {
  source: AudioBufferSourceNode;
  gain: GainNode;
  start(): void;
  setLevel(level: number): void;
  dispose(): void;
}

/**
 * 创建白噪声发生器。
 * 生成 2 秒立体声白噪声 buffer，loop 播放。
 * 在声音化引擎中通过 ConvolverNode 实现混沌"声音碎裂"效果。
 */
export function createNoiseGenerator(durationSec = 2): NoiseGenerator {
  const ac = getAudioContext();
  const sampleRate = ac.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = ac.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ac.createGain();
  gain.gain.value = 0;
  source.connect(gain);

  return {
    source,
    gain,
    start() {
      source.start();
    },
    setLevel(level: number) {
      const target = clamp(level, 0, 0.1);
      gain.gain.setTargetAtTime(target, ac.currentTime, 0.3);
    },
    dispose() {
      try { source.stop(); } catch { /* 已停止则忽略 */ }
      gain.disconnect();
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
