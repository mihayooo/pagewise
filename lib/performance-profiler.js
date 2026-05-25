/**
 * PerformanceProfiler — 轻量级运行时性能剖析工具
 *
 * R183: 探索性改进 — 代码质量优化、性能提升或新功能原型
 *
 * 设计约束:
 * - 纯 ES Module，零外部依赖，不依赖 DOM / Chrome API
 * - disabled 模式下接近零开销（直接透传）
 * - maxSamples FIFO 淘汰防止内存无限增长
 *
 * @example
 *   import { measureSync, measureAsync, getProfiler } from './performance-profiler.js'
 *   const result = measureSync('search', () => doSearch(query))
 *   console.log(getProfiler().getReport())
 */

// ==================== 高精度计时 ====================

/** @returns {number} 毫秒级时间戳 */
function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/**
 * 线性插值百分位计算
 * @param {number[]} sorted — 已排序数组
 * @param {number} p — 百分位 (0-100)
 */
function _pct(sorted, p) {
  if (!sorted || sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

// ==================== PerformanceProfiler ====================

/** PerformanceProfiler 类 */
export class PerformanceProfiler {
  /**
   * @param {Object}  [options]
   * @param {boolean} [options.enabled=true]    — 是否启用
   * @param {number}  [options.maxSamples=1000] — 每操作最大采样数
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.maxSamples = typeof options.maxSamples === 'number' ? options.maxSamples : 1000
    /** @type {Map<string, number[]>} */
    this._samples = new Map()
    /** @type {Map<string, number>} */
    this._timers = new Map()
    /** @type {Array} */
    this._marks = []
    /** @type {Array} */
    this._snaps = []
  }

  /** 测量同步函数耗时 */
  measure(name, fn) {
    if (!this.enabled) return fn()
    const t = _now()
    try {
      const result = fn()
      this._record(name, _now() - t)
      return result
    } catch (err) {
      this._record(name, _now() - t)
      throw err
    }
  }

  /** 测量异步函数耗时 */
  async measureAsync(name, fn) {
    if (!this.enabled) return fn()
    const t = _now()
    try {
      const result = await fn()
      this._record(name, _now() - t)
      return result
    } catch (err) {
      this._record(name, _now() - t)
      throw err
    }
  }

  /** 开始计时，返回操作名 */
  start(name) {
    if (this.enabled) this._timers.set(name, _now())
    return name
  }

  /** 结束计时并记录，返回耗时 ms（未 start 过返回 0） */
  end(name) {
    if (!this.enabled) return 0
    const t0 = this._timers.get(name)
    if (t0 === undefined) return 0
    const elapsed = _now() - t0
    this._timers.delete(name)
    this._record(name, elapsed)
    return elapsed
  }

  /** 获取操作统计 { count, totalMs, avgMs, minMs, maxMs, p50, p95, p99 } */
  stats(name) {
    const s = this._samples.get(name)
    if (!s || s.length === 0) {
      return { count: 0, totalMs: 0, avgMs: 0, minMs: Infinity, maxMs: -Infinity, p50: 0, p95: 0, p99: 0 }
    }
    const sorted = [...s].sort((a, b) => a - b)
    const n = sorted.length
    const total = sorted.reduce((a, b) => a + b, 0)
    return {
      count: n, totalMs: total, avgMs: total / n,
      minMs: sorted[0], maxMs: sorted[n - 1],
      p50: _pct(sorted, 50), p95: _pct(sorted, 95), p99: _pct(sorted, 99),
    }
  }

  /** 获取完整报告 */
  getReport() {
    const ops = []
    let total = 0
    for (const name of this._samples.keys()) {
      const s = this.stats(name)
      ops.push({ name, ...s })
      total += s.totalMs
    }
    ops.sort((a, b) => b.totalMs - a.totalMs)
    return { operations: ops, totalTimeMs: total, operationCount: ops.length, marks: this._marks.length, snapshots: this._snaps.length }
  }

  /** 记录标记点 */
  mark(label, data) {
    if (!this.enabled) return
    this._marks.push({ label, timestamp: Date.now(), data: data !== undefined ? data : undefined })
  }

  /** 获取标记点副本 */
  getMarks() { return this._marks.map(m => ({ ...m })) }

  /** 包装函数，自动测量每次调用 */
  wrap(name, fn) {
    if (typeof fn !== 'function') return () => undefined
    if (!this.enabled) return fn
    const self = this
    const isAsync = fn.constructor && fn.constructor.name === 'AsyncFunction'
    return function (...args) {
      if (isAsync) {
        return self.measureAsync(name, () => fn.apply(this, args))
      }
      const result = self.measure(name, () => fn.apply(this, args))
      // 同步函数返回 Promise 的 fallback
      if (result && typeof result.then === 'function') {
        return result
      }
      return result
    }
  }

  /** 内存快照（Node.js only） */
  snapshot(label) {
    if (!this.enabled) return null
    if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') return null // eslint-disable-line no-undef
    const mem = process.memoryUsage() // eslint-disable-line no-undef
    const snap = { label, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, timestamp: Date.now() }
    this._snaps.push(snap)
    return snap
  }

  /** 获取快照副本 */
  getSnapshots() { return this._snaps.map(s => ({ ...s })) }

  /** 清除所有数据 */
  reset() { this._samples.clear(); this._timers.clear(); this._marks = []; this._snaps = [] }

  /** 清除指定操作 */
  clear(name) { this._samples.delete(name); this._timers.delete(name) }

  /** 记录采样（FIFO 淘汰） */
  _record(name, elapsed) {
    if (this.maxSamples <= 0) return
    let arr = this._samples.get(name)
    if (!arr) { arr = []; this._samples.set(name, arr) }
    arr.push(elapsed)
    while (arr.length > this.maxSamples) arr.shift()
  }
}

// ==================== 全局单例与便捷函数 ====================

let _inst = null

/** 获取全局单例 */
export function getProfiler(opts) {
  if (!_inst) _inst = new PerformanceProfiler(opts)
  return _inst
}

/** 便捷: 测量同步函数 */
export function measureSync(name, fn, profiler) {
  return (profiler || getProfiler()).measure(name, fn)
}

/** 便捷: 测量异步函数 */
export async function measureAsync(name, fn, profiler) {
  return (profiler || getProfiler()).measureAsync(name, fn)
}
