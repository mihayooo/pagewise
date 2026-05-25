/**
 * UserInsightAnalyzer — 用户数据驱动洞察分析器
 *
 * R298: DataDrivenIteration — 从遥测数据生成产品洞察
 *
 * 设计约束:
 *   - 纯逻辑分析模块，无 I/O、无 Chrome API 依赖
 *   - 输入: Telemetry.exportData() 输出的 JSON 对象
 *   - 输出: 结构化洞察（排名、漏斗、趋势、错误、推荐）
 *   - 支持从 chrome.storage.local 遥测数据提取可行动的产品改进清单
 *
 * @example
 *   import { createUserInsightAnalyzer } from './lib/user-insight-analyzer.js'
 *   const analyzer = createUserInsightAnalyzer(telemetryData)
 *   const report = analyzer.generateInsightReport()
 *   console.log(report.recommendations)
 *
 * @module lib/user-insight-analyzer
 */

import { generateReport, formatMetrics, buildRecommendations } from './user-insight-report.js';

// Re-export for API compatibility
export { generateReport, formatMetrics, buildRecommendations };

// ==================== 常量 ====================

/** 核心路径步骤名称与 telemetry feature key 映射 */
const CORE_PATH_STEPS = [
  { key: 'text_select', name: '选中文字' },
  { key: 'ask_ai', name: '提出问题' },
  { key: 'ai_response', name: '获得回答' },
  { key: 'bookmark', name: '归档书签' },
];

/** 天/毫秒 */
const _MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==================== 工具函数 ====================

/**
 * 安全读取 features 对象
 * @param {object} data
 * @returns {Record<string, number>}
 */
function _safeFeatures(data) {
  if (!data || typeof data.features !== 'object' || data.features === null) return {};
  const result = {};
  for (const [k, v] of Object.entries(data.features)) {
    if (typeof v === 'number' && isFinite(v)) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * 安全读取 errors 对象
 * @param {object} data
 * @returns {Record<string, object>}
 */
function _safeErrors(data) {
  if (!data || typeof data.errors !== 'object' || data.errors === null) return {};
  const result = {};
  for (const [k, v] of Object.entries(data.errors)) {
    if (v && typeof v === 'object' && typeof v.total === 'number') {
      result[k] = v;
    }
  }
  return result;
}

/**
 * 安全读取 metrics 对象
 * @param {object} data
 * @returns {Record<string, object>}
 */
function _safeMetrics(data) {
  if (!data || typeof data.metrics !== 'object' || data.metrics === null) return {};
  const result = {};
  for (const [k, v] of Object.entries(data.metrics)) {
    if (v && typeof v === 'object' && typeof v.count === 'number') {
      result[k] = v;
    }
  }
  return result;
}

/**
 * 安全读取 sessions 数组
 * @param {object} data
 * @returns {Array}
 */
function _safeSessions(data) {
  if (!data || !Array.isArray(data.sessions)) return [];
  return data.sessions;
}

/**
 * 百分比四舍五入到两位小数
 * @param {number} value
 * @returns {number}
 */
function _pct(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 将时间戳归一化到天（0:00:00）
 * @param {number} ts
 * @returns {number}
 */
function _dayKey(ts) {
  return Math.floor(ts / _MS_PER_DAY) * _MS_PER_DAY;
}

/**
 * 获取 ISO 周编号（YYYY-Www）
 * @param {number} ts
 * @returns {string}
 */
function _weekKey(ts) {
  const d = new Date(ts);
  // ISO week calculation
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(
    ((target.getTime() - week1.getTime()) / _MS_PER_DAY - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${target.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ==================== 工厂函数 ====================

/**
 * 创建 UserInsightAnalyzer 实例（纯函数，无 I/O）
 *
 * @param {object|null|undefined} telemetryData — Telemetry.exportData() 的输出
 * @returns {UserInsightAnalyzerAPI}
 */
export function createUserInsightAnalyzer(telemetryData) {
  const data = telemetryData || {};

  return {
    /**
     * 功能使用频率排名（按使用次数降序）
     *
     * @returns {Array<{feature: string, count: number, percentage: number}>}
     */
    getFeatureRanking() {
      const features = _safeFeatures(data);
      const entries = Object.entries(features);
      if (entries.length === 0) return [];

      const total = entries.reduce((s, [, v]) => s + v, 0);

      return entries
        .sort((a, b) => b[1] - a[1])
        .map(([feature, count]) => ({
          feature,
          count,
          percentage: total > 0 ? _pct((count / total) * 100) : 0,
        }));
    },

    /**
     * 核心路径完成率漏斗
     *
     * 路径: 选中文字 → 提出问题 → 获得回答 → 归档书签
     * 计算每一步的转化率和流失率
     *
     * @returns {{steps: Array<{name: string, count: number, rate: number, dropoff: number}>, completionRate: number}}
     */
    getCorePathCompletion() {
      const features = _safeFeatures(data);

      const steps = CORE_PATH_STEPS.map((step, index) => {
        const count = features[step.key] || 0;
        const firstCount = features[CORE_PATH_STEPS[0].key] || 0;
        const prevCount = index > 0 ? (features[CORE_PATH_STEPS[index - 1].key] || 0) : count;

        return {
          name: step.name,
          key: step.key,
          count,
          rate: index === 0
            ? 100
            : firstCount > 0 ? _pct((count / firstCount) * 100) : 0,
          dropoff: index === 0
            ? 0
            : prevCount > 0 ? _pct(((prevCount - count) / prevCount) * 100) : 100,
        };
      });

      const firstCount = features[CORE_PATH_STEPS[0].key] || 0;
      const lastCount = features[CORE_PATH_STEPS[CORE_PATH_STEPS.length - 1].key] || 0;
      const completionRate = firstCount > 0 ? _pct((lastCount / firstCount) * 100) : 0;

      return { steps, completionRate };
    },

    /**
     * 日活/周活趋势
     *
     * 支持两种数据源:
     *   1. sessions 数组: 有时间戳，计算真实活跃天数和周数
     *   2. 仅有 features 聚合: 按 "每天约 10 次操作" 估算活跃天数
     *
     * @returns {UsageTrends}
     */
    getUsageTrends() {
      const sessions = _safeSessions(data);
      const features = _safeFeatures(data);
      const totalCount = Object.values(features).reduce((s, v) => s + v, 0);

      if (sessions.length > 0) {
        // 按天聚合
        const daySet = new Set();
        const weekSet = new Set();
        for (const session of sessions) {
          if (session && typeof session.timestamp === 'number') {
            daySet.add(_dayKey(session.timestamp));
            weekSet.add(_weekKey(session.timestamp));
          }
        }

        const activeDays = daySet.size;
        const activeWeeks = weekSet.size;
        const dailyAverage = activeDays > 0 ? _pct(totalCount / activeDays) : 0;

        // 计算周活跃天数（最近一周内活跃天数）
        let weeklyActiveDays = 0;
        if (daySet.size > 0) {
          const sortedDays = [...daySet].sort((a, b) => b - a);
          const latestDay = sortedDays[0];
          const weekStart = latestDay - 6 * _MS_PER_DAY;
          weeklyActiveDays = sortedDays.filter(d => d >= weekStart).length;
        }

        return {
          activeDays,
          activeWeeks,
          weeklyActiveDays,
          dailyAverage,
          estimatedActiveDays: activeDays,
          dataSource: 'session',
        };
      }

      // 无 session 数据时的估算
      const estimatedDays = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / 10)) : 0;
      const dailyAverage = estimatedDays > 0 ? _pct(totalCount / estimatedDays) : 0;

      return {
        activeDays: 0,
        activeWeeks: 0,
        weeklyActiveDays: 0,
        dailyAverage,
        estimatedActiveDays: estimatedDays,
        dataSource: 'estimated',
      };
    },

    /**
     * 错误率 Top-5（按总错误数降序）
     *
     * @returns {Array<{type: string, total: number, lastMessage: string, rate: number}>}
     */
    getErrorTop5() {
      const errors = _safeErrors(data);
      const features = _safeFeatures(data);
      const entries = Object.entries(errors);
      if (entries.length === 0) return [];

      return entries
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([type, entry]) => {
          // 尝试匹配同名 feature 作为 attempts
          const attempts = features[type] || 0;
          const rate = attempts > 0 ? _pct((entry.total / attempts) * 100) : 0;

          return {
            type,
            total: entry.total,
            lastMessage: entry.lastMessage || '',
            rate,
          };
        });
    },

    /**
     * 性能指标统计
     *
     * @returns {Array<{name: string, count: number, avg: number, min: number, max: number, latest: number}>}
     */
    getMetricStats() {
      const metrics = _safeMetrics(data);
      return Object.entries(metrics).map(([name, m]) => ({
        name,
        count: m.count,
        avg: m.count > 0 ? _pct(m.total / m.count) : 0,
        min: m.min,
        max: m.max,
        latest: m.latest,
      }));
    },

    /**
     * 生成综合洞察报告
     *
     * 包含: 功能排名、核心路径、使用趋势、错误分析、指标统计、产品建议
     *
     * @returns {InsightReport}
     */
    generateInsightReport() {
      return generateReport(this);
    },
  };
}
