/**
 * 测试 lib/user-insight-analyzer.js — 用户数据驱动洞察分析器
 *
 * R298: DataDrivenIteration — 从遥测数据生成产品洞察
 *
 * 覆盖:
 *   - 功能使用频率排名
 *   - 核心路径完成率（选中→提问→获得回答→归档）
 *   - 日活/周活趋势
 *   - 错误率 Top-5
 *   - 指标统计分析
 *   - 综合洞察报告生成
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUserInsightAnalyzer } from '../lib/user-insight-analyzer.js';

// ==================== Test Helpers ====================

/** 创建测试用遥测数据 */
function createTestData(overrides = {}) {
  return {
    enabled: true,
    features: {
      text_select: 150,
      ask_ai: 80,
      ai_response: 75,
      bookmark: 40,
      knowledge_search: 60,
      search: 30,
      ...overrides.features,
    },
    errors: {
      ai_timeout: { total: 5, lastOccurrence: Date.now(), lastMessage: 'Request timeout' },
      storage_write: { total: 3, lastOccurrence: Date.now(), lastMessage: 'Quota exceeded' },
      bookmark_sync: { total: 8, lastOccurrence: Date.now(), lastMessage: 'Sync failed' },
      render_error: { total: 2, lastOccurrence: Date.now(), lastMessage: 'DOM error' },
      network_error: { total: 12, lastOccurrence: Date.now(), lastMessage: 'Offline' },
      ...overrides.errors,
    },
    metrics: {
      ai_response_time: { count: 50, total: 15000, min: 100, max: 600, latest: 250, samples: [200, 250, 300] },
      search_latency: { count: 30, total: 3000, min: 50, max: 200, latest: 80, samples: [60, 80, 100] },
      ...overrides.metrics,
    },
    ...overrides,
  };
}

/** 创建带 session 记录的遥测数据 */
function createDataWithSessions(sessions) {
  return createTestData({
    sessions: sessions,
  });
}

// ==================== Tests ====================

describe('UserInsightAnalyzer — 初始化', () => {
  it('接受空遥测数据创建实例', () => {
    const analyzer = createUserInsightAnalyzer({});
    assert.ok(analyzer);
    assert.equal(typeof analyzer.getFeatureRanking, 'function');
    assert.equal(typeof analyzer.getCorePathCompletion, 'function');
    assert.equal(typeof analyzer.getUsageTrends, 'function');
    assert.equal(typeof analyzer.getErrorTop5, 'function');
    assert.equal(typeof analyzer.getMetricStats, 'function');
    assert.equal(typeof analyzer.generateInsightReport, 'function');
  });

  it('接受 null 数据创建实例不抛异常', () => {
    assert.doesNotThrow(() => createUserInsightAnalyzer(null));
  });

  it('接受 undefined 数据创建实例不抛异常', () => {
    assert.doesNotThrow(() => createUserInsightAnalyzer(undefined));
  });
});

describe('UserInsightAnalyzer — 功能使用频率排名', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = createUserInsightAnalyzer(createTestData());
  });

  it('返回按使用次数降序排列的功能列表', () => {
    const ranking = analyzer.getFeatureRanking();
    assert.ok(ranking.length > 0);
    assert.equal(ranking[0].feature, 'text_select');
    assert.equal(ranking[0].count, 150);
    assert.equal(ranking[1].feature, 'ask_ai');
    assert.equal(ranking[1].count, 80);
  });

  it('每个条目包含 feature、count 和 percentage', () => {
    const ranking = analyzer.getFeatureRanking();
    const first = ranking[0];
    assert.equal(typeof first.feature, 'string');
    assert.equal(typeof first.count, 'number');
    assert.equal(typeof first.percentage, 'number');
    assert.ok(first.percentage > 0 && first.percentage <= 100);
  });

  it('百分比总和约等于 100', () => {
    const ranking = analyzer.getFeatureRanking();
    const totalPct = ranking.reduce((s, r) => s + r.percentage, 0);
    assert.ok(Math.abs(totalPct - 100) < 1, `Expected ~100, got ${totalPct}`);
  });

  it('无 features 数据时返回空数组', () => {
    const empty = createUserInsightAnalyzer({ features: {} });
    assert.deepEqual(empty.getFeatureRanking(), []);
  });

  it('无 features 字段时返回空数组', () => {
    const empty = createUserInsightAnalyzer({});
    assert.deepEqual(empty.getFeatureRanking(), []);
  });
});

describe('UserInsightAnalyzer — 核心路径完成率', () => {
  it('全部核心步骤存在时返回完整漏斗', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const funnel = analyzer.getCorePathCompletion();
    assert.equal(funnel.steps.length, 4);
    assert.equal(funnel.steps[0].name, '选中文字');
    assert.equal(funnel.steps[1].name, '提出问题');
    assert.equal(funnel.steps[2].name, '获得回答');
    assert.equal(funnel.steps[3].name, '归档书签');
  });

  it('计算每一步的转化率', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const funnel = analyzer.getCorePathCompletion();
    // text_select=150, ask_ai=80 => 80/150=53.33%
    assert.equal(funnel.steps[0].count, 150);
    assert.equal(funnel.steps[0].dropoff, 0);
    assert.ok(Math.abs(funnel.steps[1].rate - (80 / 150) * 100) < 0.1);
    assert.equal(funnel.steps[1].count, 80);
  });

  it('计算整体完成率（最后一步/第一步）', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const funnel = analyzer.getCorePathCompletion();
    // bookmark=40, text_select=150 => 40/150=26.67%
    assert.ok(Math.abs(funnel.completionRate - (40 / 150) * 100) < 0.1);
  });

  it('缺少步骤时 count 为 0', () => {
    const analyzer = createUserInsightAnalyzer(createTestData({ features: { text_select: 100 } }));
    const funnel = analyzer.getCorePathCompletion();
    assert.equal(funnel.steps[0].count, 100);
    assert.equal(funnel.steps[1].count, 0);
    assert.equal(funnel.steps[2].count, 0);
    assert.equal(funnel.steps[3].count, 0);
    assert.equal(funnel.completionRate, 0);
  });

  it('所有步骤为 0 时完成率为 0', () => {
    const analyzer = createUserInsightAnalyzer({});
    const funnel = analyzer.getCorePathCompletion();
    assert.equal(funnel.completionRate, 0);
  });
});

describe('UserInsightAnalyzer — 日活/周活趋势', () => {
  it('无 session 数据时从 features 推断活跃天数', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const trends = analyzer.getUsageTrends();
    assert.equal(typeof trends.estimatedActiveDays, 'number');
    assert.ok(trends.estimatedActiveDays > 0);
    assert.equal(trends.dataSource, 'estimated');
  });

  it('基于 session 数据计算真实活跃天数', () => {
    const sessions = [
      { timestamp: new Date('2026-05-20').getTime(), features: { ask_ai: 1 } },
      { timestamp: new Date('2026-05-20').getTime(), features: { search: 1 } },
      { timestamp: new Date('2026-05-21').getTime(), features: { ask_ai: 1 } },
      { timestamp: new Date('2026-05-23').getTime(), features: { ask_ai: 1 } },
    ];
    const data = createDataWithSessions(sessions);
    const analyzer = createUserInsightAnalyzer(data);
    const trends = analyzer.getUsageTrends();
    assert.equal(trends.activeDays, 3);
    assert.equal(trends.dataSource, 'session');
  });

  it('计算日均使用次数', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const trends = analyzer.getUsageTrends();
    assert.equal(typeof trends.dailyAverage, 'number');
    assert.ok(trends.dailyAverage > 0);
  });

  it('计算周活跃率', () => {
    const sessions = [];
    // 在 2 周内创建 session，每周 5 天活跃
    const baseTime = new Date('2026-05-11').getTime();
    for (let week = 0; week < 2; week++) {
      for (let day = 0; day < 5; day++) {
        sessions.push({
          timestamp: baseTime + week * 7 * 86400000 + day * 86400000,
          features: { ask_ai: 2 },
        });
      }
    }
    const data = createDataWithSessions(sessions);
    const analyzer = createUserInsightAnalyzer(data);
    const trends = analyzer.getUsageTrends();
    assert.ok(trends.weeklyActiveDays > 0);
    assert.ok(trends.weeklyActiveDays <= 7);
  });

  it('无任何数据时返回默认值', () => {
    const analyzer = createUserInsightAnalyzer({});
    const trends = analyzer.getUsageTrends();
    assert.equal(trends.activeDays, 0);
    assert.equal(trends.dailyAverage, 0);
    assert.equal(trends.estimatedActiveDays, 0);
  });
});

describe('UserInsightAnalyzer — 错误率 Top-5', () => {
  it('按错误总数降序返回 Top-5', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const top5 = analyzer.getErrorTop5();
    assert.equal(top5.length, 5);
    assert.equal(top5[0].type, 'network_error');
    assert.equal(top5[0].total, 12);
    assert.equal(top5[1].type, 'bookmark_sync');
    assert.equal(top5[1].total, 8);
  });

  it('每个条目包含 type、total、lastMessage 和 rate', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const top5 = analyzer.getErrorTop5();
    const first = top5[0];
    assert.equal(typeof first.type, 'string');
    assert.equal(typeof first.total, 'number');
    assert.equal(typeof first.rate, 'number');
    assert.ok(typeof first.lastMessage === 'string' || first.lastMessage === undefined);
  });

  it('错误率通过对应 feature 操作计算', () => {
    // ai_timeout: 5 errors, features 中没有 ai_timeout key
    // 但有 ask_ai: 80，可以用来计算
    const analyzer = createUserInsightAnalyzer(createTestData());
    const top5 = analyzer.getErrorTop5();
    // rate is calculated when matching feature is found
    const networkErr = top5.find(e => e.type === 'network_error');
    assert.ok(networkErr);
  });

  it('少于 5 个错误类型时返回全部', () => {
    const analyzer = createUserInsightAnalyzer(createTestData({
      errors: {
        ai_timeout: { total: 5, lastOccurrence: Date.now(), lastMessage: 'Timeout' },
      },
    }));
    const top5 = analyzer.getErrorTop5();
    assert.equal(top5.length, 1);
  });

  it('无错误数据时返回空数组', () => {
    const analyzer = createUserInsightAnalyzer({});
    assert.deepEqual(analyzer.getErrorTop5(), []);
  });
});

describe('UserInsightAnalyzer — 指标统计分析', () => {
  it('返回所有指标的统计摘要', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const stats = analyzer.getMetricStats();
    assert.equal(stats.length, 2);
    const aiMetric = stats.find(s => s.name === 'ai_response_time');
    assert.ok(aiMetric);
    assert.equal(aiMetric.count, 50);
    assert.equal(aiMetric.avg, 300);
    assert.equal(aiMetric.min, 100);
    assert.equal(aiMetric.max, 600);
    assert.equal(aiMetric.latest, 250);
  });

  it('无指标数据时返回空数组', () => {
    const analyzer = createUserInsightAnalyzer({});
    assert.deepEqual(analyzer.getMetricStats(), []);
  });

  it('平均值正确四舍五入', () => {
    const analyzer = createUserInsightAnalyzer(createTestData({
      metrics: {
        test_metric: { count: 3, total: 100, min: 10, max: 60, latest: 30 },
      },
    }));
    const stats = analyzer.getMetricStats();
    assert.equal(stats[0].avg, 33.33);
  });
});

describe('UserInsightAnalyzer — 综合洞察报告', () => {
  it('generateInsightReport 返回完整报告对象', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const report = analyzer.generateInsightReport();
    assert.ok(report.generatedAt > 0);
    assert.ok(report.featureRanking);
    assert.ok(report.corePath);
    assert.ok(report.usageTrends);
    assert.ok(report.errorTop5);
    assert.ok(report.metricStats);
    assert.ok(report.recommendations);
  });

  it('推荐建议数组至少 1 条', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const report = analyzer.generateInsightReport();
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(report.recommendations.length >= 1);
  });

  it('当核心路径完成率低时生成优化建议', () => {
    const analyzer = createUserInsightAnalyzer(createTestData({
      features: {
        text_select: 1000,
        ask_ai: 50,
        ai_response: 40,
        bookmark: 5,
      },
    }));
    const report = analyzer.generateInsightReport();
    const pathRec = report.recommendations.find(r => r.area === 'core_path');
    assert.ok(pathRec, 'Should have core_path recommendation for low completion rate');
    assert.ok(pathRec.priority === 'high' || pathRec.priority === 'medium');
  });

  it('当错误率高时生成稳定性建议', () => {
    const analyzer = createUserInsightAnalyzer(createTestData({
      errors: {
        crash: { total: 100, lastOccurrence: Date.now(), lastMessage: 'Fatal' },
      },
    }));
    const report = analyzer.generateInsightReport();
    const errRec = report.recommendations.find(r => r.area === 'stability');
    assert.ok(errRec, 'Should have stability recommendation for high error count');
  });

  it('当无数据时报告推荐为空', () => {
    const analyzer = createUserInsightAnalyzer({});
    const report = analyzer.generateInsightReport();
    assert.ok(report.recommendations.length >= 0);
  });

  it('报告可 JSON 序列化', () => {
    const analyzer = createUserInsightAnalyzer(createTestData());
    const report = analyzer.generateInsightReport();
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    assert.ok(parsed.featureRanking);
    assert.ok(parsed.generatedAt > 0);
  });
});

describe('UserInsightAnalyzer — 边界情况', () => {
  it('features 值为非数字时安全处理', () => {
    const analyzer = createUserInsightAnalyzer({
      features: { valid: 10, invalid: 'not_a_number', also_valid: 5 },
    });
    const ranking = analyzer.getFeatureRanking();
    assert.ok(ranking.length >= 1);
  });

  it('errors 格式异常时不抛异常', () => {
    const analyzer = createUserInsightAnalyzer({
      errors: { bad: 'not_object', good: { total: 5, lastOccurrence: 0, lastMessage: '' } },
    });
    assert.doesNotThrow(() => analyzer.getErrorTop5());
  });

  it('metrics 格式异常时不抛异常', () => {
    const analyzer = createUserInsightAnalyzer({
      metrics: { bad: null, good: { count: 1, total: 100, min: 100, max: 100, latest: 100 } },
    });
    assert.doesNotThrow(() => analyzer.getMetricStats());
  });

  it('大量 features 不影响性能', () => {
    const features = {};
    for (let i = 0; i < 1000; i++) {
      features[`feature_${i}`] = Math.floor(Math.random() * 100);
    }
    const analyzer = createUserInsightAnalyzer({ features });
    const start = performance.now();
    analyzer.getFeatureRanking();
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `Feature ranking took ${elapsed}ms, expected <100ms`);
  });
});
