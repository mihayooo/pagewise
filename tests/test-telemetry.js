/**
 * 测试 lib/telemetry.js — 本地遥测模块
 *
 * R212: PostLaunchTelemetry — 功能使用频率、错误率追踪、性能指标
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createTelemetry } from '../lib/telemetry.js';

// ==================== Mock Storage ====================

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      const result = {};
      if (typeof keys === 'string') {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) result[k] = store[k];
      } else if (typeof keys === 'object' && keys !== null) {
        for (const [k, def] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : def;
        }
      }
      return result;
    },
    async set(obj) { Object.assign(store, obj); },
    async remove(key) { delete store[key]; },
    _store: store,
  };
}

// ==================== Tests ====================

describe('Telemetry — 初始化与启用/禁用', () => {
  let storage, telemetry;

  beforeEach(() => {
    storage = createMockStorage();
    telemetry = _createTelemetry(storage);
  });

  it('默认启用遥测', async () => {
    assert.equal(telemetry.isEnabled(), true);
  });

  it('可通过 setEnabled(false) 关闭遥测', async () => {
    await telemetry.setEnabled(false);
    assert.equal(telemetry.isEnabled(), false);
  });

  it('关闭后 setEnabled(true) 可重新开启', async () => {
    await telemetry.setEnabled(false);
    await telemetry.setEnabled(true);
    assert.equal(telemetry.isEnabled(), true);
  });

  it('禁用状态下调用 trackFeature 不记录数据', async () => {
    await telemetry.setEnabled(false);
    await telemetry.trackFeature('search');
    const data = await telemetry.getSummary();
    assert.equal(data.features.search, undefined);
  });

  it('禁用状态下调用 trackError 不记录数据', async () => {
    await telemetry.setEnabled(false);
    await telemetry.trackError('ai_call');
    const data = await telemetry.getSummary();
    assert.equal(data.errors.ai_call, undefined);
  });

  it('禁用状态下调用 recordMetric 不记录数据', async () => {
    await telemetry.setEnabled(false);
    await telemetry.recordMetric('search_latency', 42);
    const data = await telemetry.getSummary();
    assert.equal(data.metrics.search_latency, undefined);
  });
});

describe('Telemetry — 功能使用频率统计', () => {
  let storage, telemetry;

  beforeEach(() => {
    storage = createMockStorage();
    telemetry = _createTelemetry(storage);
  });

  it('首次跟踪功能计数为 1', async () => {
    await telemetry.trackFeature('ask_ai');
    const data = await telemetry.getSummary();
    assert.equal(data.features.ask_ai, 1);
  });

  it('多次跟踪同一功能累加计数', async () => {
    await telemetry.trackFeature('search');
    await telemetry.trackFeature('search');
    await telemetry.trackFeature('search');
    const data = await telemetry.getSummary();
    assert.equal(data.features.search, 3);
  });

  it('不同功能独立计数', async () => {
    await telemetry.trackFeature('ask_ai');
    await telemetry.trackFeature('search');
    await telemetry.trackFeature('ask_ai');
    const data = await telemetry.getSummary();
    assert.equal(data.features.ask_ai, 2);
    assert.equal(data.features.search, 1);
  });

  it('getFeatureRanking 返回按使用次数降序排列', async () => {
    await telemetry.trackFeature('search');
    await telemetry.trackFeature('ask_ai');
    await telemetry.trackFeature('ask_ai');
    await telemetry.trackFeature('graph');
    await telemetry.trackFeature('graph');
    await telemetry.trackFeature('graph');
    const ranking = await telemetry.getFeatureRanking();
    assert.equal(ranking[0].feature, 'graph');
    assert.equal(ranking[0].count, 3);
    assert.equal(ranking[1].feature, 'ask_ai');
    assert.equal(ranking[1].count, 2);
    assert.equal(ranking[2].feature, 'search');
    assert.equal(ranking[2].count, 1);
  });

  it('无功能数据时 getFeatureRanking 返回空数组', async () => {
    const ranking = await telemetry.getFeatureRanking();
    assert.deepEqual(ranking, []);
  });
});

describe('Telemetry — 错误率追踪', () => {
  let storage, telemetry;

  beforeEach(() => {
    storage = createMockStorage();
    telemetry = _createTelemetry(storage);
  });

  it('首次记录错误总计数为 1', async () => {
    await telemetry.trackError('ai_call');
    const data = await telemetry.getSummary();
    assert.equal(data.errors.ai_call.total, 1);
    assert.equal(data.errors.ai_call.lastOccurrence > 0, true);
  });

  it('多次记录同一错误累加', async () => {
    await telemetry.trackError('ai_call');
    await telemetry.trackError('ai_call');
    await telemetry.trackError('ai_call');
    const data = await telemetry.getSummary();
    assert.equal(data.errors.ai_call.total, 3);
  });

  it('记录错误时可附带详情', async () => {
    await telemetry.trackError('storage_write', { message: 'quota exceeded' });
    const data = await telemetry.getSummary();
    assert.equal(data.errors.storage_write.total, 1);
    assert.equal(data.errors.storage_write.lastMessage, 'quota exceeded');
  });

  it('不同错误类型独立计数', async () => {
    await telemetry.trackError('ai_call');
    await telemetry.trackError('storage_write');
    await telemetry.trackError('storage_write');
    const data = await telemetry.getSummary();
    assert.equal(data.errors.ai_call.total, 1);
    assert.equal(data.errors.storage_write.total, 2);
  });

  it('getFailureRate 返回错误率百分比', async () => {
    // 模拟 10 次操作，3 次失败
    for (let i = 0; i < 10; i++) await telemetry.trackFeature('ai_call');
    for (let i = 0; i < 3; i++) await telemetry.trackError('ai_call');
    const rate = await telemetry.getFailureRate('ai_call');
    assert.equal(rate.attempts, 10);
    assert.equal(rate.failures, 3);
    assert.ok(Math.abs(rate.rate - 30) < 0.01);
  });

  it('无数据时 getFailureRate 返回 0', async () => {
    const rate = await telemetry.getFailureRate('nonexistent');
    assert.equal(rate.attempts, 0);
    assert.equal(rate.failures, 0);
    assert.equal(rate.rate, 0);
  });
});

describe('Telemetry — 性能指标', () => {
  let storage, telemetry;

  beforeEach(() => {
    storage = createMockStorage();
    telemetry = _createTelemetry(storage);
  });

  it('记录单个性能指标', async () => {
    await telemetry.recordMetric('search_latency', 42);
    const data = await telemetry.getSummary();
    assert.equal(data.metrics.search_latency.count, 1);
    assert.equal(data.metrics.search_latency.latest, 42);
    assert.equal(data.metrics.search_latency.avg, 42);
    assert.equal(data.metrics.search_latency.min, 42);
    assert.equal(data.metrics.search_latency.max, 42);
  });

  it('多个样本正确计算统计值', async () => {
    await telemetry.recordMetric('search_latency', 10);
    await telemetry.recordMetric('search_latency', 20);
    await telemetry.recordMetric('search_latency', 30);
    const data = await telemetry.getSummary();
    const m = data.metrics.search_latency;
    assert.equal(m.count, 3);
    assert.equal(m.latest, 30);
    assert.equal(m.avg, 20);
    assert.equal(m.min, 10);
    assert.equal(m.max, 30);
  });

  it('不同指标名称独立追踪', async () => {
    await telemetry.recordMetric('search_latency', 42);
    await telemetry.recordMetric('graph_render', 150);
    const data = await telemetry.getSummary();
    assert.equal(data.metrics.search_latency.count, 1);
    assert.equal(data.metrics.graph_render.count, 1);
  });

  it('maxSamples 限制防止内存无限增长', async () => {
    const t = _createTelemetry(storage, { maxSamples: 5 });
    for (let i = 1; i <= 10; i++) {
      await t.recordMetric('test_metric', i);
    }
    const data = await t.getSummary();
    assert.equal(data.metrics.test_metric.count, 5);
    // 最新的 5 个: 6,7,8,9,10
    assert.equal(data.metrics.test_metric.min, 6);
    assert.equal(data.metrics.test_metric.max, 10);
    assert.equal(data.metrics.test_metric.avg, 8);
  });
});

describe('Telemetry — 数据持久化与清除', () => {
  it('数据写入 storage', async () => {
    const storage = createMockStorage();
    const telemetry = _createTelemetry(storage);
    await telemetry.trackFeature('search');
    await telemetry.trackError('ai_call');
    await telemetry.recordMetric('search_latency', 42);
    // 验证 storage 中有数据
    const raw = await storage.get('pagewise_telemetry');
    assert.ok(raw.pagewise_telemetry);
    assert.equal(raw.pagewise_telemetry.features.search, 1);
    assert.equal(raw.pagewise_telemetry.errors.ai_call.total, 1);
    assert.equal(raw.pagewise_telemetry.metrics.search_latency.count, 1);
  });

  it('clearAll 重置所有遥测数据', async () => {
    const storage = createMockStorage();
    const telemetry = _createTelemetry(storage);
    await telemetry.trackFeature('search');
    await telemetry.trackError('ai_call');
    await telemetry.recordMetric('search_latency', 42);
    await telemetry.clearAll();
    const data = await telemetry.getSummary();
    assert.deepEqual(data.features, {});
    assert.deepEqual(data.errors, {});
    assert.deepEqual(data.metrics, {});
  });

  it('从已有 storage 数据恢复状态', async () => {
    const storage = createMockStorage({
      pagewise_telemetry: {
        enabled: true,
        features: { search: 5 },
        errors: { ai_call: { total: 2, lastOccurrence: 1000 } },
        metrics: { search_latency: { count: 3, total: 120, min: 30, max: 50, latest: 40 } },
      },
    });
    const telemetry = _createTelemetry(storage);
    const data = await telemetry.getSummary();
    assert.equal(data.features.search, 5);
    assert.equal(data.errors.ai_call.total, 2);
    assert.equal(data.metrics.search_latency.avg, 40);
  });
});

describe('Telemetry — exportData 导出', () => {
  it('exportData 返回 JSON 可序列化的数据', async () => {
    const storage = createMockStorage();
    const telemetry = _createTelemetry(storage);
    await telemetry.trackFeature('search');
    await telemetry.recordMetric('search_latency', 42);
    const exported = telemetry.exportData();
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    assert.ok(parsed.features);
    assert.ok(parsed.metrics);
    assert.ok(parsed.exportedAt > 0);
  });

  it('导出数据包含 enabled 状态', async () => {
    const storage = createMockStorage();
    const telemetry = _createTelemetry(storage);
    const exported = telemetry.exportData();
    assert.equal(exported.enabled, true);
  });
});
