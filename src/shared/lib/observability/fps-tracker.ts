export class FPSTracker {
  private samples: number[] = [];
  private lastTime = 0;
  private maxSamples: number;

  constructor(maxSamples = 60) {
    this.maxSamples = maxSamples;
  }

  tick(now: number) {
    if (this.lastTime > 0) {
      const delta = now - this.lastTime;
      this.samples.push(1000 / delta);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
    }
    this.lastTime = now;
  }

  get average(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  reset() {
    this.samples = [];
    this.lastTime = 0;
  }
}
