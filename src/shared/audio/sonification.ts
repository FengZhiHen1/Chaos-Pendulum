import { getAudioContext } from "./audio-context";

export interface SonificationParams {
  theta2Dot: number;
  angleBetween: number;
  totalEnergy: number;
  isChaotic: boolean;
}

export function createSonificationEngine() {
  const ac = getAudioContext();
  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const gain = ac.createGain();
  gain.gain.value = 0;

  osc1.type = "sine";
  osc2.type = "sine";
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ac.destination);
  osc1.start();
  osc2.start();

  return {
    update(params: SonificationParams) {
      osc1.frequency.value = clamp(220 + Math.abs(params.theta2Dot * 200), 55, 1760);
      osc2.frequency.value = osc1.frequency.value * (1 + params.angleBetween / (2 * Math.PI));
      gain.gain.value = params.isChaotic ? 0.08 : 0.04;
    },
    setEnabled(on: boolean) {
      gain.gain.value = on ? 0.04 : 0;
    },
    dispose() {
      osc1.stop();
      osc2.stop();
      gain.disconnect();
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
