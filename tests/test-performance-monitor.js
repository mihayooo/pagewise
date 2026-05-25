/**
 * 测试 lib/performance-monitor.js — 运行时性能监控模块
 *
 * R277: 运行时性能优化与内存治理 RuntimePerfOpt
 * 覆盖: 构造/配置、计时器操作、指标记录、阈值告警、快照导出、内存治理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { PerformanceMonitor, METRIC_NAMES, createPerformanceMonitor } = await import('../lib/performance-monitor.js');

// ==================== 构造与配置 ====================

describe('PerformanceMonitor — 构造与配置', () => {
  it('默认构造创建有效实例', () => {
    const monitor = new PerformanceMonitor();
    assert.ok(monitor instanceof PerformanceMonitor);
  });

  it('自定义 maxSamples 配置', () => {
    const monitor = new PerformanceMonitor({ maxSamples: 50 });
    assert.equal(monitor._maxSamples, 50);
  });

  it('自定义阈值配置', () => {
    const monitor = new PerformanceMonitor({
      thresholds: { sidepanelRender: 500 }
    });
    assert.equal(monitor._thresholds.sidepanelRender, 500);
  });

  it('默认阈值包含所有核心指标', () => {
    const monitor = new PerformanceMonitor();
    assert.ok(monitor._thresholds.sidepanelRender > 0);
    assert.ok(monitor._thresholds.knowledgeQuery > 0);
    assert.ok(monitor._thresholds.aiResponse > 0);
    assert.ok(monitor._thresholds.indexedDBTransaction > 0);
  });

  it('createPerformanceMonitor 工厂函数返回实例', () => {
    const monitor = createPerformanceMonitor({ maxSamples: 10 });
    assert.ok(monitor instanceof PerformanceMonitor);
  });

  it('默认 maxSamples 为 200', () => {
    const monitor = new PerformanceMonitor();
    assert.equal(monitor._maxSamples, 200);
  });
});

// ==================== 计时器操作 ====================

describe('PerformanceMonitor — 计时器操作', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor({ maxSamples: 100 });
  });

  it('start/end 记录耗时', () => {
    monitor.start('test-op');
    const elapsed = monitor.end('test-op');
    assert.ok(elapsed >= 0, `elapsed=${elapsed} 应 >=0`);
  });

  it('end 对未 start 的操作返回 -1', () => {
    const elapsed = monitor.end('never-started');
    assert.equal(elapsed, -1);
  });

  it('start 返回操作名（链式调用支持）', () => {
    const name = monitor.start('op');
    assert.equal(name, 'op');
  });

  it('多次 start/end 记录多个采样', () => {
    for (let i = 0; i < 5; i++) {
      monitor.start('op');
      monitor.end('op');
    }
    const stats = monitor.getStats('op');
    assert.equal(stats.count, 5);
  });

  it('measure 同步函数正确记录耗时', () => {
    const result = monitor.measure('sync-op', () => {
      return 42;
    });
    assert.equal(result, 42);
    const stats = monitor.getStats('sync-op');
    assert.equal(stats.count, 1);
    assert.ok(stats.avgMs >= 0);
  });

  it('measure 异步函数正确记录耗时', async () => {
    const result = await monitor.measureAsync('async-op', async () => {
      return 'done';
    });
    assert.equal(result, 'done');
    const stats = monitor.getStats('async-op');
    assert.equal(stats.count, 1);
  });

  it('measure 异常时仍记录耗时', () => {
    assert.throws(() => {
      monitor.measure('error-op', () => { throw new Error('boom'); });
    }, /boom/);
    const stats = monitor.getStats('error-op');
    assert.equal(stats.count, 1);
  });

  it('measureAsync 异常时仍记录耗时', async () => {
    await assert.rejects(async () => {
      await monitor.measureAsync('async-error', async () => { throw new Error('fail'); });
    }, /fail/);
    const stats = monitor.getStats('async-error');
    assert.equal(stats.count, 1);
  });
});

// ==================== 指标统计 ====================

describe('PerformanceMonitor — 指标统计', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor({ maxSamples: 100 });
  });

  it('getStats 无数据时返回零值', () => {
    const stats = monitor.getStats('empty');
    assert.equal(stats.count, 0);
    assert.equal(stats.avgMs, 0);
    assert.equal(stats.minMs, 0);
    assert.equal(stats.maxMs, 0);
    assert.equal(stats.p50, 0);
    assert.equal(stats.p95, 0);
    assert.equal(stats.p99, 0);
  });

  it('getStats 统计正确（手动记录）', () => {
    monitor._record('manual', 10);
    monitor._record('manual', 20);
    monitor._record('manual', 30);
    const stats = monitor.getStats('manual');
    assert.equal(stats.count, 3);
    assert.equal(stats.avgMs, 20);
    assert.equal(stats.minMs, 10);
    assert.equal(stats.maxMs, 30);
  });

  it('FIFO 淘汰: 超过 maxSamples 时丢弃最早的采样', () => {
    const m = new PerformanceMonitor({ maxSamples: 3 });
    m._record('op', 1);
    m._record('op', 2);
    m._record('op', 3);
    m._record('op', 4);
    const stats = m.getStats('op');
    assert.equal(stats.count, 3);
    assert.equal(stats.minMs, 2); // 最早的 1 被淘汰
  });

  it('getAllStats 返回所有操作的统计', () => {
    monitor._record('op-a', 10);
    monitor._record('op-b', 20);
    const all = monitor.getAllStats();
    assert.ok('op-a' in all);
    assert.ok('op-b' in all);
    assert.equal(all['op-a'].count, 1);
    assert.equal(all['op-b'].count, 1);
  });

  it('getReport 返回完整报告', () => {
    monitor._record('sidepanelRender', 150);
    monitor._record('knowledgeQuery', 30);
    const report = monitor.getReport();
    assert.ok(report.timestamp);
    assert.ok(report.operations);
    assert.ok(typeof report.totalSamples === 'number');
    assert.ok(report.totalSamples >= 2);
  });
});

// ==================== 阈值告警 ====================

describe('PerformanceMonitor — 阈值告警', () => {
  it('超出阈值的指标被标记为 slow', () => {
    const monitor = new PerformanceMonitor({
      thresholds: { testOp: 10 }
    });
    monitor._record('testOp', 50);
    const alerts = monitor.getAlerts();
    assert.ok(alerts.length > 0);
    assert.equal(alerts[0].metric, 'testOp');
    assert.ok(alerts[0].actualMs > alerts[0].thresholdMs);
  });

  it('未超出阈值不产生告警', () => {
    const monitor = new PerformanceMonitor({
      thresholds: { testOp: 100 }
    });
    monitor._record('testOp', 5);
    const alerts = monitor.getAlerts();
    assert.equal(alerts.length, 0);
  });

  it('getAlerts 基于 avgMs 判断', () => {
    const monitor = new PerformanceMonitor({
      thresholds: { testOp: 10 }
    });
    // 录入高于阈值的值
    for (let i = 0; i < 5; i++) monitor._record('testOp', 50);
    const alerts = monitor.getAlerts();
    assert.ok(alerts.length > 0);
    assert.equal(alerts[0].metric, 'testOp');
  });

  it('告警包含 severity 字段', () => {
    const monitor = new PerformanceMonitor({
      thresholds: { testOp: 10 }
    });
    monitor._record('testOp', 200);
    const alerts = monitor.getAlerts();
    assert.ok(alerts.length > 0);
    assert.ok(typeof alerts[0].severity === 'string');
  });
});

// ==================== 快照与导出 ====================

describe('PerformanceMonitor — 快照与导出', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor({ maxSamples: 100 });
  });

  it('snapshot 创建内存快照（Node 环境）', () => {
    const snap = monitor.snapshot('test-snap');
    // Node.js 有 process.memoryUsage
    if (snap !== null) {
      assert.ok(snap.label === 'test-snap');
      assert.ok(typeof snap.heapUsed === 'number');
      assert.ok(snap.timestamp > 0);
    }
  });

  it('getSnapshots 返回快照列表', () => {
    monitor.snapshot('s1');
    monitor.snapshot('s2');
    const snaps = monitor.getSnapshots();
    assert.ok(Array.isArray(snaps));
    // 至少不报错
  });

  it('reset 清除所有数据', () => {
    monitor._record('op', 100);
    monitor.start('timer');
    monitor.snapshot('snap');
    monitor.reset();
    assert.equal(monitor.getStats('op').count, 0);
    assert.equal(monitor.getSnapshots().length, 0);
  });

  it('clear 清除指定操作数据', () => {
    monitor._record('a', 1);
    monitor._record('b', 2);
    monitor.clear('a');
    assert.equal(monitor.getStats('a').count, 0);
    assert.equal(monitor.getStats('b').count, 1);
  });
});

// ==================== METRIC_NAMES 常量 ====================

describe('METRIC_NAMES 常量', () => {
  it('定义核心指标名', () => {
    assert.ok(typeof METRIC_NAMES.SIDEPANEL_RENDER === 'string');
    assert.ok(typeof METRIC_NAMES.KNOWLEDGE_QUERY === 'string');
    assert.ok(typeof METRIC_NAMES.AI_RESPONSE === 'string');
    assert.ok(typeof METRIC_NAMES.INDEXEDDB_TXN === 'string');
  });

  it('4 个核心指标', () => {
    const names = Object.values(METRIC_NAMES);
    assert.ok(names.length >= 4);
  });
});

// ==================== 统计百分位 ====================

describe('PerformanceMonitor — 百分位计算', () => {
  it('p50 中位数正确', () => {
    const m = new PerformanceMonitor({ maxSamples: 100 });
    // 录入 10 个已知值
    for (let i = 1; i <= 10; i++) m._record('test', i);
    const stats = m.getStats('test');
    // p50 of [1..10] ≈ 5.5
    assert.ok(stats.p50 >= 5 && stats.p50 <= 6, `p50=${stats.p50}`);
  });

  it('p95 接近最大值', () => {
    const m = new PerformanceMonitor({ maxSamples: 100 });
    for (let i = 1; i <= 100; i++) m._record('test', i);
    const stats = m.getStats('test');
    // p95 of [1..100] ≈ 95.05
    assert.ok(stats.p95 >= 95, `p95=${stats.p95}`);
  });

  it('单个采样时 p50 = p95 = p99 = 值本身', () => {
    const m = new PerformanceMonitor({ maxSamples: 100 });
    m._record('single', 42);
    const stats = m.getStats('single');
    assert.equal(stats.p50, 42);
    assert.equal(stats.p95, 42);
    assert.equal(stats.p99, 42);
  });
});
