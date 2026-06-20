/**
 * Telemetry — 本地遥测模块
 *
 * R212: PostLaunchTelemetry — 发布后遥测与反馈收集
 * R342: _createTelemetry 超长函数拆分 — 纯函数提取至模块级别
 *
 * 设计约束:
 *   - 所有数据纯本地存储（chrome.storage.local），不上传任何服务器
 *   - 用户可一键关闭遥测（复用 setEnabled 机制）
 *   - 支持功能使用频率统计、错误率追踪、性能指标记录
 *   - 纯 ES Module，依赖注入 storage 接口便于测试
 *
 * @example
 *   import { createTelemetry } from './lib/telemetry.js'
 *   const telemetry = createTelemetry(chrome.storage.local)
 *   await telemetry.trackFeature('ask_ai')
 *   await telemetry.trackError('ai_call', { message: 'timeout' })
 *   await telemetry.recordMetric('search_latency', 42)
 *   const summary = await telemetry.getSummary()
 *
 * @module lib/telemetry
 */

// ==================== 常量 ====================

const STORAGE_KEY = 'pagewise_telemetry';

/** 默认每指标最大采样数 */
const DEFAULT_MAX_SAMPLES = 500;

// ==================== 纯函数（模块级别，可独立测试） ====================

/**
 * 创建默认遥测数据结构
 *
 * @returns {TelemetryData} 默认空遥测数据
 */
export function _createDefault() {
  return {
    enabled: true,
    features: {},
    errors: {},
    metrics: {},
  };
}

/**
 * 标准化从 storage 读取的原始数据
 *
 * @param {*} raw — storage 原始值
 * @param {number} maxSamples — 每指标最大采样数
 * @returns {TelemetryData} 标准化后的遥测数据
 */
export function _normalize(raw, maxSamples) {
  if (!raw || typeof raw !== 'object') return _createDefault();
  return {
    enabled: raw.enabled !== false,
    features: typeof raw.features === 'object' ? { ...raw.features } : {},
    errors: typeof raw.errors === 'object' ? { ...raw.errors } : {},
    metrics: typeof raw.metrics === 'object' ? _normalizeMetrics(raw.metrics, maxSamples) : {},
  };
}

/**
 * 标准化指标数据，确保每个指标有完整的统计字段
 *
 * @param {object} metrics — 原始指标对象
 * @param {number} maxSamples — 每指标最大采样数
 * @returns {object} 标准化后的指标对象
 */
export function _normalizeMetrics(metrics, maxSamples) {
  const result = {};
  for (const [key, val] of Object.entries(metrics)) {
    if (val && typeof val === 'object' && typeof val.count === 'number') {
      result[key] = {
        count: val.count,
        total: typeof val.total === 'number' ? val.total : 0,
        min: typeof val.min === 'number' ? val.min : 0,
        max: typeof val.max === 'number' ? val.max : 0,
        latest: typeof val.latest === 'number' ? val.latest : 0,
        samples: Array.isArray(val.samples) ? val.samples.slice(-maxSamples) : [],
      };
    }
  }
  return result;
}

/**
 * 记录功能使用到数据对象（纯函数，不涉及 I/O）
 *
 * @param {TelemetryData} data — 遥测数据对象（会被就地修改）
 * @param {string} featureName — 功能名称
 */
export function _trackFeatureToData(data, featureName) {
  if (typeof data.features[featureName] !== 'number') {
    data.features[featureName] = 0;
  }
  data.features[featureName]++;
}

/**
 * 记录错误到数据对象（纯函数，不涉及 I/O）
 *
 * @param {TelemetryData} data — 遥测数据对象（会被就地修改）
 * @param {string} errorType — 错误类型
 * @param {object} [details] — 错误详情
 * @param {string} [details.message] — 错误消息
 */
export function _trackErrorToData(data, errorType, details = {}) {
  if (!data.errors[errorType] || typeof data.errors[errorType] !== 'object') {
    data.errors[errorType] = { total: 0, lastOccurrence: 0, lastMessage: '' };
  }
  data.errors[errorType].total++;
  data.errors[errorType].lastOccurrence = Date.now();
  if (details && typeof details.message === 'string') {
    data.errors[errorType].lastMessage = details.message;
  }
}

/**
 * 记录性能指标到数据对象（纯函数，不涉及 I/O）
 *
 * @param {TelemetryData} data — 遥测数据对象（会被就地修改）
 * @param {string} metricName — 指标名称
 * @param {number} value — 指标值
 * @param {number} maxSamples — 每指标最大采样数
 */
export function _recordMetricToData(data, metricName, value, maxSamples) {
  if (!data.metrics[metricName]) {
    data.metrics[metricName] = { count: 0, total: 0, min: Infinity, max: -Infinity, latest: 0, samples: [] };
  }
  const m = data.metrics[metricName];
  m.samples.push(value);
  // FIFO 淘汰
  if (m.samples.length > maxSamples) {
    m.samples = m.samples.slice(-maxSamples);
  }
  // 从 samples 重新计算统计值，确保与采样窗口一致
  m.count = m.samples.length;
  m.total = m.samples.reduce((s, v) => s + v, 0);
  m.min = Math.min(...m.samples);
  m.max = Math.max(...m.samples);
  m.latest = value;
}

/**
 * 从遥测数据生成摘要报告（纯函数，不涉及 I/O）
 *
 * @param {TelemetryData} data — 遥测数据对象
 * @returns {TelemetrySummary} 摘要报告
 */
export function _generateReport(data) {
  const features = { ...data.features };
  const errors = {};
  for (const [key, val] of Object.entries(data.errors)) {
    if (val && typeof val === 'object') {
      errors[key] = { ...val };
    }
  }
  const metrics = {};
  for (const [key, val] of Object.entries(data.metrics)) {
    if (val && typeof val === 'object') {
      metrics[key] = {
        count: val.count,
        avg: val.count > 0 ? Math.round((val.total / val.count) * 100) / 100 : 0,
        min: val.min,
        max: val.max,
        latest: val.latest,
      };
    }
  }
  return { features, errors, metrics };
}

/**
 * 导出遥测数据为 JSON 可序列化格式（纯函数，不涉及 I/O）
 *
 * @param {TelemetryData} data — 遥测数据对象
 * @returns {object} JSON 可序列化的导出数据
 */
export function _exportTelemetryData(data) {
  return {
    enabled: data.enabled,
    features: { ...data.features },
    errors: JSON.parse(JSON.stringify(data.errors)),
    metrics: JSON.parse(JSON.stringify(data.metrics)),
    exportedAt: Date.now(),
  };
}

/**
 * 计算错误失败率（纯函数）
 *
 * @param {TelemetryData} data — 遥测数据对象
 * @param {string} errorType — 错误类型
 * @returns {{attempts: number, failures: number, rate: number}} 失败率统计
 */
export function _calcFailureRate(data, errorType) {
  const failures = (data.errors[errorType] && data.errors[errorType].total) || 0;
  const attempts = (data.features[errorType] && data.features[errorType]) || 0;
  const rate = attempts > 0 ? (failures / attempts) * 100 : 0;
  return { attempts, failures, rate: Math.round(rate * 100) / 100 };
}

// ==================== 工厂函数 ====================

/**
 * 创建 Telemetry 实例（支持依赖注入）
 *
 * @param {object} storage — chrome.storage.local 兼容接口
 * @param {object} [options]
 * @param {number} [options.maxSamples=500] — 每指标最大采样数
 * @returns {TelemetryAPI}
 */
/**
 * 构建 Telemetry API 对象（纯协调层，所有逻辑委托给模块级纯函数）
 *
 * @param {function} load — 从 storage 加载数据
 * @param {function} save — 保存数据到 storage
 * @param {function} getCache — 获取当前缓存引用
 * @param {function} setCache — 设置缓存引用
 * @param {number} maxSamples — 每指标最大采样数
 * @returns {TelemetryAPI}
 */
/** @param {function} load @param {function} save @param {function} getCache @param {function} setCache @param {number} maxSamples @returns {TelemetryAPI} */
export function _buildTelemetryAPI(load, save, getCache, setCache, maxSamples) {
  return {
    isEnabled() { return getCache() ? getCache().enabled : true },
    async setEnabled(enabled) { const d = await load(); d.enabled = !!enabled; await save(d) },
    async trackFeature(name) {
      if (typeof name !== 'string' || !name) return
      const d = await load(); if (!d.enabled) return
      _trackFeatureToData(d, name); await save(d)
    },
    async trackError(type, details = {}) {
      if (typeof type !== 'string' || !type) return
      const d = await load(); if (!d.enabled) return
      _trackErrorToData(d, type, details); await save(d)
    },
    async recordMetric(name, value) {
      if (typeof name !== 'string' || !name) return
      if (typeof value !== 'number' || !isFinite(value)) return
      const d = await load(); if (!d.enabled) return
      _recordMetricToData(d, name, value, maxSamples); await save(d)
    },
    async getFeatureRanking() {
      const d = await load()
      return Object.entries(d.features).map(([f, c]) => ({ feature: f, count: c })).sort((a, b) => b.count - a.count)
    },
    async getFailureRate(errorType) { return _calcFailureRate(await load(), errorType) },
    async getSummary() { return _generateReport(await load()) },
    async clearAll() { setCache(_createDefault()); await save(getCache()) },
    exportData() { return _exportTelemetryData(getCache() || _createDefault()) },
  }
}

/**
 * 创建 Telemetry 实例（支持依赖注入）
 *
 * 内部仅负责 storage I/O 适配和缓存管理，
 * API 构建委托给 _buildTelemetryAPI，业务逻辑委托给模块级纯函数。
 *
 * @param {object} storage — chrome.storage.local 兼容接口
 * @param {object} [options]
 * @param {number} [options.maxSamples=500] — 每指标最大采样数
 * @returns {TelemetryAPI}
 */
export function _createTelemetry(storage, options = {}) {
  const maxSamples = typeof options.maxSamples === 'number' ? options.maxSamples : DEFAULT_MAX_SAMPLES;

  let _cache = null;

  async function _load() {
    if (_cache) return _cache;
    try {
      const raw = await storage.get(STORAGE_KEY);
      _cache = _normalize(raw[STORAGE_KEY], maxSamples);
    } catch (_e) {
      /* safe: storage read failure — fall back to defaults */
      _cache = _createDefault();
    }
    return _cache;
  }

  async function _save(data) {
    _cache = data;
    try {
      await storage.set({ [STORAGE_KEY]: data });
    } catch (_e) {
      // telemetry fire-and-forget: storage write failure is expected, data stays in cache
    }
  }

  return _buildTelemetryAPI(_load, _save, () => _cache, (v) => { _cache = v }, maxSamples);
}

/**
 * 生产环境创建入口（使用 chrome.storage.local）
 * 在非 Chrome 环境中不可用
 *
 * @param {object} [chromeStorageLocal]
 * @returns {TelemetryAPI}
 */
export function createTelemetry(chromeStorageLocal) {
  if (!chromeStorageLocal) {
    throw new Error('telemetry: storage 接口必须提供');
  }
  return _createTelemetry(chromeStorageLocal);
}

/**
 * @typedef {Object} TelemetryData
 * @property {boolean} enabled — 是否启用
 * @property {Object<string, number>} features — 功能使用计数
 * @property {Object<string, ErrorEntry>} errors — 错误追踪
 * @property {Object<string, MetricEntry>} metrics — 性能指标
 */

/**
 * @typedef {Object} ErrorEntry
 * @property {number} total — 总计数
 * @property {number} lastOccurrence — 最后发生时间
 * @property {string} lastMessage — 最后错误消息
 */

/**
 * @typedef {Object} MetricEntry
 * @property {number} count — 采样数
 * @property {number} total — 总和
 * @property {number} min — 最小值
 * @property {number} max — 最大值
 * @property {number} latest — 最新值
 * @property {number[]} samples — 采样数组
 */

/**
 * @typedef {Object} TelemetryAPI
 * @property {function(): boolean} isEnabled
 * @property {function(boolean): Promise<void>} setEnabled
 * @property {function(string): Promise<void>} trackFeature
 * @property {function(string, object=): Promise<void>} trackError
 * @property {function(string, number): Promise<void>} recordMetric
 * @property {function(): Promise<Array>} getFeatureRanking
 * @property {function(string): Promise<object>} getFailureRate
 * @property {function(): Promise<object>} getSummary
 * @property {function(): Promise<void>} clearAll
 * @property {function(): object} exportData
 */
