let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

export function resumeAudioContext(): Promise<void> {
  const ac = getAudioContext();
  if (ac.state === "suspended") {
    return ac.resume();
  }
  return Promise.resolve();
}

export function closeAudioContext(): void {
  if (ctx) {
    ctx.close();
    ctx = null;
  }
}
