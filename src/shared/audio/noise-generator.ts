import { getAudioContext } from "./audio-context";

export function createNoiseGenerator(durationSec = 2) {
  const ac = getAudioContext();
  const sampleRate = ac.sampleRate;
  const length = sampleRate * durationSec;
  const buffer = ac.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
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
      gain.gain.value = clamp(level, 0, 0.1);
    },
    dispose() {
      source.stop();
      gain.disconnect();
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
