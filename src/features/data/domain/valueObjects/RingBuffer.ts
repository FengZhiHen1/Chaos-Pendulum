/**
 * 环形缓冲区——高效存储固定容量内的最近 N 个帧数据。
 *
 * 当缓冲区满时，新写入覆盖最旧的数据。
 * API 兼容 IRingBufferReader 接口，为回放提供只读访问能力。
 *
 * 注: 不正式 implements IRingBufferReader（泛型 T vs 具体 StateVector），
 *     但提供完全兼容的 API 表面。运行时通过结构类型匹配。
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private count = 0;
  readonly capacity: number;

  /** 每帧对应的仿真时间间隔 (s) */
  private readonly frameInterval: number;

  constructor(capacity: number, fps: number = 60) {
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
    this.frameInterval = 1 / fps;
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

  /** 读取最新一帧 */
  latest(): T | undefined {
    if (this.count === 0) return undefined;
    return this.at(this.count - 1);
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

  /**
   * 按仿真时间查找最接近的帧索引。
   * @param time 仿真时间 (s)
   * @returns 最接近的帧索引，-1 表示不在范围内
   */
  findIndexByTime(time: number): number {
    if (this.count === 0 || time < 0) return -1;
    const frameIndex = Math.round(time / this.frameInterval);
    if (frameIndex < 0 || frameIndex >= this.count) return -1;
    return frameIndex;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
