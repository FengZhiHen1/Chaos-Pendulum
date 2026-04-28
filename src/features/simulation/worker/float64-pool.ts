export class Float64Pool {
  private buffers: Float64Array[];
  private free: number[];

  constructor(count: number, size: number) {
    this.buffers = Array.from({ length: count }, () => new Float64Array(size));
    this.free = Array.from({ length: count }, (_, i) => i);
  }

  acquire(): { buf: Float64Array; index: number } | null {
    if (this.free.length === 0) return null;
    const index = this.free.pop()!;
    return { buf: this.buffers[index]!, index };
  }

  release(index: number): void {
    if (index >= 0 && index < this.buffers.length) {
      this.free.push(index);
    }
  }

  get size(): number {
    return this.buffers.length;
  }

  get available(): number {
    return this.free.length;
  }
}
