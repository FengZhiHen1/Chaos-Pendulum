export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const start = this.count < this.capacity ? 0 : this.head;
    return this.buffer[(start + index) % this.capacity];
  }

  get length(): number {
    return this.count;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const v = this.at(i);
      if (v !== undefined) result.push(v);
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
