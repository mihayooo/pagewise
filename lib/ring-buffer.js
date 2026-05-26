/**
 * RingBuffer — 定长环形缓冲区
 *
 * R183: 探索性改进 — FIFO 淘汰 O(1) 优化
 *
 * 替代 Array.push + Array.shift (O(n)) 实现 O(1) 的 FIFO 淘汰。
 * 用于 PerformanceProfiler 和 PerformanceMonitor 的高频采样缓冲。
 *
 * 设计约束:
 *   - 纯 ES Module，零外部依赖
 *   - 定长数组 + 双指针，不分配新内存
 *   - FIFO 语义: toArray() 按插入顺序返回
 *
 * @module lib/ring-buffer
 *
 * @example
 *   const buf = new RingBuffer(100)
 *   buf.push(val1)
 *   buf.push(val2)
 *   console.log(buf.toArray()) // [val1, val2]
 *   console.log(buf.length)    // 2
 */

export class RingBuffer {
  /**
   * @param {number} capacity — 最大元素数
   */
  constructor(capacity) {
    /** @type {number} */
    this._capacity = Math.max(0, Math.floor(capacity) || 0)
    /** @type {Array} */
    this._buf = new Array(this._capacity)
    /** @type {number} 写指针（下一个写入位置） */
    this._write = 0
    /** @type {number} 当前元素数 */
    this._count = 0
  }

  /**
   * 容量（只读）
   * @returns {number}
   */
  get capacity() {
    return this._capacity
  }

  /**
   * 当前元素数
   * @returns {number}
   */
  get length() {
    return this._count
  }

  /**
   * 推入一个元素。满时自动覆盖最旧元素 (O(1))
   * @param {*} value
   */
  push(value) {
    if (this._capacity <= 0) return

    this._buf[this._write] = value
    this._write = (this._write + 1) % this._capacity
    if (this._count < this._capacity) this._count++
  }

  /**
   * 按 FIFO 顺序返回所有元素副本
   * @returns {Array}
   */
  toArray() {
    if (this._count === 0) return []

    const result = new Array(this._count)
    // 最旧元素的位置: 如果缓冲区已满，write 指向最旧元素；
    // 如果未满，最旧元素在位置 0
    const start = this._count < this._capacity
      ? 0
      : this._write

    for (let i = 0; i < this._count; i++) {
      result[i] = this._buf[(start + i) % this._capacity]
    }
    return result
  }

  /**
   * 清空缓冲区
   */
  clear() {
    // 释放引用防止内存泄漏
    for (let i = 0; i < this._capacity; i++) {
      this._buf[i] = undefined
    }
    this._write = 0
    this._count = 0
  }
}
