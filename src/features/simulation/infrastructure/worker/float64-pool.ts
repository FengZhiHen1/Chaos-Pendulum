import type { IFloat64Pool } from "../../contracts";

const POOL_COUNT = 10;
const POOL_SIZE = 4000; // > BUFFER_LENGTH (1680)

/**
 * Float64Array 对象池。
 * 主线程 acquire() 获取 buffer → transfer 到 Worker → Worker transfer 回 → release() 归还。
 *
 * 实现 IFloat64Pool 契约接口。
 */
export class Float64Pool implements IFloat64Pool {
  private buffers: (Float64Array | null)[];
  private free: number[];
  /** WeakMap 用于从 buffer 引用反向查找池索引，供 release 时使用 */
  private indexMap: WeakMap<Float64Array, number>;

  constructor(count = POOL_COUNT, size = POOL_SIZE) {
    this.buffers = Array.from({ length: count }, () => new Float64Array(size));
    this.free = Array.from({ length: count }, (_, i) => i);
    this.indexMap = new WeakMap();
    for (let i = 0; i < count; i++) {
      this.indexMap.set(this.buffers[i]!, i);
    }
  }

  /** 获取一个空闲 buffer。返回 null 表示池耗尽。 */
  acquire(): { buffer: Float64Array; index: number } | null {
    if (this.free.length === 0) return null;
    const idx = this.free.pop()!;
    let buf = this.buffers[idx]!;
    // buffer 在上一轮 transfer 后可能已 detached，此时需重新分配
    if (buf.byteLength === 0) {
      buf = new Float64Array(POOL_SIZE);
      this.buffers[idx] = buf;
      this.indexMap.set(buf, idx);
    }
    return { buffer: buf, index: idx };
  }

  /** 归还 buffer 到池中，可选传入新的 buffer 引用以更新槽位 */
  release(index: number, newBuffer?: Float64Array): void {
    if (index >= 0 && index < this.buffers.length && !this.free.includes(index)) {
      if (newBuffer) {
        this.buffers[index] = newBuffer;
        this.indexMap.set(newBuffer, index);
      }
      this.free.push(index);
    }
  }

  /** 通过 buffer 引用归还 */
  releaseBuffer(buffer: Float64Array): void {
    const idx = this.indexMap.get(buffer);
    if (idx !== undefined) {
      this.release(idx);
    }
  }

  get size(): number {
    return this.buffers.length;
  }

  get available(): number {
    return this.free.length;
  }
}
