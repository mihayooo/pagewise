/**
 * PerformanceMonitor — 运行时性能监控模块
 *
 * R277: 运行时性能优化与内存治理 RuntimePerfOpt
 *
 * 追踪 SidePanel 首屏渲染时间 / 知识库查询延迟 / AI 响应时间 / IndexedDB 事务耗时。
 * 与 PerformanceProfiler (R183) 的区别:
 *   - PerformanceProfiler: 通用剖析工具，任何操作均可 measure
 *   - PerformanceMonitor: 面向业务场景的监控，内建阈值告警、内存快照、运行报告
 *
 * 设计约束:
 *   - 纯 ES Module，零外部依赖，不依赖 DOM / Chrome API
 *   - FIFO 采样淘汰，防止内存无限增长
 *   - 线性插值百分位（与 PerformanceProfiler 一致）
 *
 * @module lib/performance-monitor
 */

// ==================== 高精度计时 ====================

/** @returns {number} 毫秒级时间戳 */
function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * 线性插值百分位计算
 * @param {number[]} sorted — 已排序数组
 * @param {number} p — 百分位 (0-100)
 */
function _pct(sorted, p) {
  if (!sorted || sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ==================== 核心指标名常量 ====================

/**
 * 业务场景指标名
 * @enum {string}
 */
export const METRIC_NAMES = {
  /** SidePanel 首屏渲染时间 */
  SIDEPANEL_RENDER: 'sidepanelRender',
  /** 知识库查询延迟 */
  KNOWLEDGE_QUERY: 'knowledgeQuery',
  /** AI 响应时间 */
  AI_RESPONSE: 'aiResponse',
  /** IndexedDB 事务耗时 */
  INDEXEDDB_TXN: 'indexedDBTransaction',
};

// ==================== 默认配置 ====================

/** 默认阈值 (ms) — 超过这些值产生告警 */
const DEFAULT_THRESHOLDS = {
  [METRIC_NAMES.SIDEPANEL_RENDER]: 300,
  [METRIC_NAMES.KNOWLEDGE_QUERY]: 50,
  [METRIC_NAMES.AI_RESPONSE]: 5000,
  [METRIC_NAMES.INDEXEDDB_TXN]: 100,
};

/** 默认最大采样数 */
const DEFAULT_MAX_SAMPLES = 200;

// ==================== PerformanceMonitor ====================

/**
 * 运行时性能监控器
 *
 * @example
 *   const monitor = new PerformanceMonitor();
 *   monitor.start('sidepanelRender');
 *   // ... 渲染 ...
 *   monitor.end('sidepanelRender');
 *   console.log(monitor.getReport());
 */
export class PerformanceMonitor {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSamples=200] — 每操作最大采样数
   * @param {Object} [options.thresholds] — 自定义阈值覆盖
   */
  constructor(options = {}) {
    /** @type {number} */
    this._maxSamples = typeof options.maxSamples === 'number' ? options.maxSamples : DEFAULT_MAX_SAMPLES;

    /** @type {Object} 阈值配置 */
    this._thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };

    /** @type {Map<string, number[]>} 操作名 → 采样数组 */
    this._samples = new Map();

    /** @type {Map<string, number>} 操作名 → 起始时间戳 */
    this._timers = new Map();

    /** @type {Array<Object>} 内存快照 */
    this._snapshots = [];
  }

  // ==================== 计时器 API ====================

  /**
   * 开始计时
   * @param {string} name — 操作名
   * @returns {string} 操作名（支持链式调用）
   */
  start(name) {
    this._timers.set(name, _now());
    return name;
  }

  /**
   * 结束计时并记录耗时
   * @param {string} name — 操作名（须与 start 一致）
   * @returns {number} 耗时 ms，未 start 过返回 -1
   */
  end(name) {
    const t0 = this._timers.get(name);
    if (t0 === undefined) return -1;
    const elapsed = _now() - t0;
    this._timers.delete(name);
    this._record(name, elapsed);
    return elapsed;
  }

  /**
   * 测量同步函数耗时
   * @param {string} name — 操作名
   * @param {Function} fn — 要测量的函数
   * @returns {*} fn 的返回值
   */
  measure(name, fn) {
    const t = _now();
    try {
      const result = fn();
      this._record(name, _now() - t);
      return result;
    } catch (err) {
      this._record(name, _now() - t);
      throw err;
    }
  }

  /**
   * 测量异步函数耗时
   * @param {string} name — 操作名
   * @param {Function} fn — 要测量的异步函数
   * @returns {Promise<*>} fn 的返回值
   */
  async measureAsync(name, fn) {
    const t = _now();
    try {
      const result = await fn();
      this._record(name, _now() - t);
      return result;
    } catch (err) {
      this._record(name, _now() - t);
      throw err;
    }
  }

  // ==================== 统计查询 ====================

  /**
   * 获取指定操作的统计信息
   * @param {string} name — 操作名
   * @returns {{ count: number, avgMs: number, minMs: number, maxMs: number, p50: number, p95: number, p99: number }}
   */
  getStats(name) {
    const s = this._samples.get(name);
    if (!s || s.length === 0) {
      return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50: 0, p95: 0, p99: 0 };
    }
    const sorted = [...s].sort((a, b) => a - b);
    const n = sorted.length;
    const total = sorted.reduce((a, b) => a + b, 0);
    return {
      count: n,
      avgMs: total / n,
      minMs: sorted[0],
      maxMs: sorted[n - 1],
      p50: _pct(sorted, 50),
      p95: _pct(sorted, 95),
      p99: _pct(sorted, 99),
    };
  }

  /**
   * 获取所有操作的统计
   * @returns {Object} { [name]: stats }
   */
  getAllStats() {
    const result = {};
    for (const name of this._samples.keys()) {
      result[name] = this.getStats(name);
    }
    return result;
  }

  /**
   * 获取完整性能报告
   * @returns {Object} { timestamp, operations, totalSamples, alerts }
   */
  getReport() {
    const operations = {};
    let totalSamples = 0;
    for (const [name, samples] of this._samples) {
      operations[name] = this.getStats(name);
      totalSamples += samples.length;
    }
    return {
      timestamp: new Date().toISOString(),
      operations,
      totalSamples,
      alerts: this.getAlerts(),
      snapshots: this._snapshots.length,
    };
  }

  // ==================== 阈值告警 ====================

  /**
   * 获取超出阈值的告警列表
   * @returns {Array<{ metric: string, actualMs: number, thresholdMs: number, severity: string }>}
   */
  getAlerts() {
    const alerts = [];
    for (const [name, samples] of this._samples) {
      const threshold = this._thresholds[name];
      if (threshold === undefined || samples.length === 0) continue;

      const stats = this.getStats(name);
      // 基于 avgMs 判断告警（平均值更能反映系统性劣化）
      if (stats.avgMs > threshold) {
        const ratio = stats.avgMs / threshold;
        let severity = 'warning';
        if (ratio > 3) severity = 'critical';
        else if (ratio > 2) severity = 'error';

        alerts.push({
          metric: name,
          actualMs: Math.round(stats.avgMs * 100) / 100,
          thresholdMs: threshold,
          severity,
        });
      }
    }
    return alerts;
  }

  // ==================== 内存快照 ====================

  /**
   * 记录内存快照（Node.js only，浏览器环境返回 null）
   * @param {string} label — 快照标签
   * @returns {Object|null} 快照对象或 null
   */
  snapshot(label) {
    if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') return null;
    const mem = process.memoryUsage();
    const snap = {
      label,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external || 0,
      rss: mem.rss || 0,
      timestamp: Date.now(),
    };
    this._snapshots.push(snap);
    return snap;
  }

  /**
   * 获取快照列表副本
   * @returns {Array<Object>}
   */
  getSnapshots() {
    return this._snapshots.map(s => ({ ...s }));
  }

  // ==================== 数据管理 ====================

  /**
   * 清除所有数据
   */
  reset() {
    this._samples.clear();
    this._timers.clear();
    this._snapshots = [];
  }

  /**
   * 清除指定操作的数据
   * @param {string} name
   */
  clear(name) {
    this._samples.delete(name);
    this._timers.delete(name);
  }

  /**
   * 记录采样值（FIFO 淘汰）
   * @param {string} name
   * @param {number} elapsed
   * @private
   */
  _record(name, elapsed) {
    if (this._maxSamples <= 0) return;
    let arr = this._samples.get(name);
    if (!arr) {
      arr = [];
      this._samples.set(name, arr);
    }
    arr.push(elapsed);
    // FIFO 淘汰
    while (arr.length > this._maxSamples) arr.shift();
  }
}

// ==================== 全局单例与工厂 ====================

let _instance = null;

/**
 * 创建性能监控器实例
 * @param {Object} [options] — 同 PerformanceMonitor 构造参数
 * @returns {PerformanceMonitor}
 */
export function createPerformanceMonitor(options) {
  return new PerformanceMonitor(options);
}

/**
 * 获取全局单例
 * @param {Object} [options] — 仅首次调用生效
 * @returns {PerformanceMonitor}
 */
export function getMonitor(options) {
  if (!_instance) _instance = new PerformanceMonitor(options);
  return _instance;
}

/**
 * 重置全局单例（测试用）
 */
export function resetMonitor() {
  _instance = null;
}
