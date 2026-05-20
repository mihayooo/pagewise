/**
 * Telemetry — 本地遥测模块
 *
 * R212: PostLaunchTelemetry — 发布后遥测与反馈收集
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

// ==================== 工厂函数 ====================

/**
 * 创建 Telemetry 实例（支持依赖注入）
 *
 * @param {object} storage — chrome.storage.local 兼容接口
 * @param {object} [options]
 * @param {number} [options.maxSamples=500] — 每指标最大采样数
 * @returns {TelemetryAPI}
 */
export function _createTelemetry(storage, options = {}) {
  const maxSamples = typeof options.maxSamples === 'number' ? options.maxSamples : DEFAULT_MAX_SAMPLES;

  // 内存缓存，减少 storage 读取
  let _cache = null;

  /**
   * 从 storage 加载数据
   * @returns {Promise<TelemetryData>}
   */
  async function _load() {
    if (_cache) return _cache;
    try {
      const raw = await storage.get(STORAGE_KEY);
      _cache = _normalize(raw[STORAGE_KEY]);
    } catch (_e) {
      _cache = _createDefault();
    }
    return _cache;
  }

  /**
   * 保存数据到 storage
   * @param {TelemetryData} data
   */
  async function _save(data) {
    _cache = data;
    try {
      await storage.set({ [STORAGE_KEY]: data });
    } catch (_e) {
      // 静默处理存储错误
    }
  }

  /**
   * 创建默认数据结构
   * @returns {TelemetryData}
   */
  function _createDefault() {
    return {
      enabled: true,
      features: {},
      errors: {},
      metrics: {},
    };
  }

  /**
   * 标准化从 storage 读取的数据
   * @param {*} raw
   * @returns {TelemetryData}
   */
  function _normalize(raw) {
    if (!raw || typeof raw !== 'object') return _createDefault();
    return {
      enabled: raw.enabled !== false,
      features: typeof raw.features === 'object' ? { ...raw.features } : {},
      errors: typeof raw.errors === 'object' ? { ...raw.errors } : {},
      metrics: typeof raw.metrics === 'object' ? _normalizeMetrics(raw.metrics) : {},
    };
  }

  /**
   * 标准化指标数据
   * @param {object} metrics
   * @returns {object}
   */
  function _normalizeMetrics(metrics) {
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

  // ==================== API ====================

  return {
    /**
     * 检查遥测是否启用
     * @returns {boolean}
     */
    isEnabled() {
      // 同步返回缓存状态（初始化时已在 load 中设置）
      return _cache ? _cache.enabled : true;
    },

    /**
     * 设置遥测启用状态
     * @param {boolean} enabled
     */
    async setEnabled(enabled) {
      const data = await _load();
      data.enabled = !!enabled;
      await _save(data);
    },

    /**
     * 跟踪功能使用
     * @param {string} featureName — 功能名称
     */
    async trackFeature(featureName) {
      if (typeof featureName !== 'string' || !featureName) return;
      const data = await _load();
      if (!data.enabled) return;
      if (typeof data.features[featureName] !== 'number') {
        data.features[featureName] = 0;
      }
      data.features[featureName]++;
      await _save(data);
    },

    /**
     * 追踪错误发生
     * @param {string} errorType — 错误类型 (如 'ai_call', 'storage_write')
     * @param {object} [details] — 错误详情
     * @param {string} [details.message] — 错误消息
     */
    async trackError(errorType, details = {}) {
      if (typeof errorType !== 'string' || !errorType) return;
      const data = await _load();
      if (!data.enabled) return;
      if (!data.errors[errorType] || typeof data.errors[errorType] !== 'object') {
        data.errors[errorType] = { total: 0, lastOccurrence: 0, lastMessage: '' };
      }
      data.errors[errorType].total++;
      data.errors[errorType].lastOccurrence = Date.now();
      if (details && typeof details.message === 'string') {
        data.errors[errorType].lastMessage = details.message;
      }
      await _save(data);
    },

    /**
     * 记录性能指标
     * @param {string} metricName — 指标名称 (如 'search_latency', 'graph_render')
     * @param {number} value — 指标值 (毫秒)
     */
    async recordMetric(metricName, value) {
      if (typeof metricName !== 'string' || !metricName) return;
      if (typeof value !== 'number' || !isFinite(value)) return;
      const data = await _load();
      if (!data.enabled) return;
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
      await _save(data);
    },

    /**
     * 获取功能使用排名（按使用次数降序）
     * @returns {Promise<Array<{feature: string, count: number}>>}
     */
    async getFeatureRanking() {
      const data = await _load();
      return Object.entries(data.features)
        .map(([feature, count]) => ({ feature, count }))
        .sort((a, b) => b.count - a.count);
    },

    /**
     * 获取错误失败率
     * @param {string} errorType — 错误类型
     * @returns {Promise<{attempts: number, failures: number, rate: number}>}
     */
    async getFailureRate(errorType) {
      const data = await _load();
      const failures = (data.errors[errorType] && data.errors[errorType].total) || 0;
      // 尝试匹配对应的 feature 计数作为 attempts
      const attempts = (data.features[errorType] && data.features[errorType]) || 0;
      const rate = attempts > 0 ? (failures / attempts) * 100 : 0;
      return { attempts, failures, rate: Math.round(rate * 100) / 100 };
    },

    /**
     * 获取遥测数据摘要
     * @returns {Promise<TelemetrySummary>}
     */
    async getSummary() {
      const data = await _load();
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
    },

    /**
     * 清除所有遥测数据
     */
    async clearAll() {
      _cache = _createDefault();
      await _save(_cache);
    },

    /**
     * 导出遥测数据 (JSON 可序列化)
     * @returns {object}
     */
    exportData() {
      const data = _cache || _createDefault();
      return {
        enabled: data.enabled,
        features: { ...data.features },
        errors: JSON.parse(JSON.stringify(data.errors)),
        metrics: JSON.parse(JSON.stringify(data.metrics)),
        exportedAt: Date.now(),
      };
    },
  };
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
