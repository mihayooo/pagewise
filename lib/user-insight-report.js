/**
 * UserInsightReport — 报告生成与推荐逻辑
 *
 * 从 user-insight-analyzer.js 拆分 (R305)，负责:
 *   - generateReport — 生成综合洞察报告
 *   - formatMetrics — 格式化指标统计
 *   - buildRecommendations — 基于分析结果生成产品建议
 *
 * @module lib/user-insight-report
 */

// ==================== 常量 ====================

/** 完成率低阈值（百分比） */
const LOW_COMPLETION_THRESHOLD = 30;

/** 高错误总量阈值 */
const HIGH_ERROR_THRESHOLD = 50;

/**
 * 百分比四舍五入到两位小数
 * @param {number} value
 * @returns {number}
 */
function _pct(value) {
  return Math.round(value * 100) / 100;
}

// ==================== 推荐生成 ====================

/**
 * 基于分析结果生成可行动的产品建议
 * @param {Array} featureRanking
 * @param {object} corePath
 * @param {object} usageTrends
 * @param {Array} errorTop5
 * @param {Array} metricStats
 * @returns {Array<Recommendation>}
 */
export function buildRecommendations(featureRanking, corePath, usageTrends, errorTop5, metricStats) {
  const recs = [];

  // 1. 核心路径完成率低
  if (corePath.completionRate > 0 && corePath.completionRate < LOW_COMPLETION_THRESHOLD) {
    let worstStep = null;
    let worstDropoff = 0;
    for (const step of corePath.steps) {
      if (step.dropoff > worstDropoff) {
        worstDropoff = step.dropoff;
        worstStep = step;
      }
    }
    recs.push({
      area: 'core_path',
      priority: 'high',
      title: '核心路径完成率过低',
      detail: `整体完成率 ${corePath.completionRate}%（低于 ${LOW_COMPLETION_THRESHOLD}% 门槛）` +
        (worstStep ? `。最大流失发生在「${worstStep.name}」步骤（流失 ${worstStep.dropoff}%）` : ''),
      action: worstStep
        ? `优先优化「${worstStep.name}」体验，减少到下一步的流失`
        : '审查核心路径每一步的用户体验',
    });
  }

  // 2. 高错误率
  const totalErrors = errorTop5.reduce((s, e) => s + e.total, 0);
  if (totalErrors > HIGH_ERROR_THRESHOLD) {
    const topErr = errorTop5[0];
    recs.push({
      area: 'stability',
      priority: 'high',
      title: '错误总量过高',
      detail: `累计 ${totalErrors} 个错误。最高频错误: 「${topErr.type}」(${topErr.total} 次) — ${topErr.lastMessage}`,
      action: `优先修复「${topErr.type}」错误，目标: 将错误总量降至 ${Math.floor(totalErrors * 0.3)} 以下`,
    });
  } else if (totalErrors > 10) {
    recs.push({
      area: 'stability',
      priority: 'medium',
      title: '存在需关注的错误',
      detail: `累计 ${totalErrors} 个错误。最高频: 「${errorTop5[0]?.type}」(${errorTop5[0]?.total} 次)`,
      action: '建议定期审查错误日志，优先处理高频错误',
    });
  }

  // 3. 功能使用集中度过高
  if (featureRanking.length > 2) {
    const topCount = featureRanking[0].count;
    const totalCount = featureRanking.reduce((s, r) => s + r.count, 0);
    const topPct = totalCount > 0 ? (topCount / totalCount) * 100 : 0;
    if (topPct > 60) {
      recs.push({
        area: 'feature_diversity',
        priority: 'low',
        title: '功能使用高度集中',
        detail: `「${featureRanking[0].feature}」占比 ${_pct(topPct)}%，其余功能使用率较低`,
        action: '考虑通过引导教程提升低频功能的曝光度',
      });
    }
  }

  // 4. AI 响应性能
  const aiMetric = metricStats.find(m => m.name === 'ai_response_time');
  if (aiMetric && aiMetric.avg > 3000) {
    recs.push({
      area: 'performance',
      priority: 'medium',
      title: 'AI 响应时间偏高',
      detail: `平均响应 ${aiMetric.avg}ms，最大 ${aiMetric.max}ms`,
      action: '考虑优化 prompt 策略、缓存常见问题、或切换更快的模型',
    });
  }

  // 5. 使用深度不足
  if (usageTrends.estimatedActiveDays > 0 && usageTrends.dailyAverage > 0) {
    if (usageTrends.dailyAverage < 3) {
      recs.push({
        area: 'engagement',
        priority: 'low',
        title: '日均使用频次较低',
        detail: `日均 ${usageTrends.dailyAverage} 次操作`,
        action: '通过提示气泡、快捷键提示提升用户与扩展的互动频次',
      });
    }
  }

  // 6. 如果无任何数据
  if (featureRanking.length === 0 && errorTop5.length === 0 && metricStats.length === 0) {
    recs.push({
      area: 'data_collection',
      priority: 'medium',
      title: '遥测数据为空',
      detail: '未检测到任何遥测数据。请确认遥测模块已正确集成到各核心动作中',
      action: '检查 telemetry.trackFeature() 是否在 text_select/ask_ai/ai_response/bookmark/knowledge_search 五个核心动作中被调用',
    });
  }

  return recs;
}

// ==================== 报告生成 ====================

/**
 * 格式化指标统计为报告用的摘要字符串
 *
 * @param {Array} metricStats — getMetricStats() 返回的指标数组
 * @returns {string} 格式化的指标摘要
 */
export function formatMetrics(metricStats) {
  if (!metricStats || metricStats.length === 0) return '(无指标数据)';
  return metricStats
    .map(m => `${m.name}: avg=${m.avg}ms, min=${m.min}ms, max=${m.max}ms (${m.count}次)`)
    .join('\n');
}

/**
 * 生成综合洞察报告
 *
 * 包含: 功能排名、核心路径、使用趋势、错误分析、指标统计、产品建议
 *
 * @param {object} analyzer — createUserInsightAnalyzer 返回的实例
 * @returns {InsightReport}
 */
export function generateReport(analyzer) {
  const featureRanking = analyzer.getFeatureRanking();
  const corePath = analyzer.getCorePathCompletion();
  const usageTrends = analyzer.getUsageTrends();
  const errorTop5 = analyzer.getErrorTop5();
  const metricStats = analyzer.getMetricStats();
  const recommendations = buildRecommendations(
    featureRanking, corePath, usageTrends, errorTop5, metricStats
  );

  return {
    generatedAt: Date.now(),
    featureRanking,
    corePath,
    usageTrends,
    errorTop5,
    metricStats,
    recommendations,
  };
}

/**
 * @typedef {Object} Recommendation
 * @property {string} area — 关注领域
 * @property {'high'|'medium'|'low'} priority — 优先级
 * @property {string} title — 标题
 * @property {string} detail — 详情
 * @property {string} action — 建议行动
 */

/**
 * @typedef {Object} InsightReport
 * @property {number} generatedAt — 生成时间戳
 * @property {Array} featureRanking
 * @property {object} corePath
 * @property {object} usageTrends
 * @property {Array} errorTop5
 * @property {Array} metricStats
 * @property {Array<Recommendation>} recommendations
 */
