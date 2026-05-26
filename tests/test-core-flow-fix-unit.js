/**
 * 测试 lib/core-flow-fix.js + lib/core-flow-fix-queue.js
 * 核心流程改进模块 — 选区重试 + AI 超时检测 + 检索空态引导 + 重试队列
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const flowFix = await import('../lib/core-flow-fix.js');

const {
  SELECTION_RETRY_DEFAULTS,
  calcBackoffDelay,
  getSelectionRetryMessage,
  getSelectionFailedMessage,
  AI_TIMEOUT_DEFAULTS,
  formatElapsedTime,
  shouldShowTimeoutWarning,
  getTimeoutWarningMessage,
  getTimeoutSuggestion,
  GuidanceType,
  getEmptyKBGuidance,
  getNoResultsGuidance,
  getSearchTips,
  generateSearchGuidance,
  CORE_FLOW_FIX_VERSION,
} = flowFix;

const {
  QUEUE_DEFAULTS,
  createQueueEntry,
  calcRetryDelay,
  calcNextRetryTime,
  shouldRetry,
  markRetry,
  markSuccess,
  markFailed,
  enqueue,
  getPendingItems,
  clearCompleted,
  getQueueStats,
} = flowFix;

// ==================== 选区重试 ====================

describe('CoreFlowFix — Selection Retry', () => {

  it('1. SELECTION_RETRY_DEFAULTS 有正确的默认值', () => {
    assert.equal(SELECTION_RETRY_DEFAULTS.maxRetries, 3);
    assert.equal(SELECTION_RETRY_DEFAULTS.baseDelayMs, 300);
    assert.equal(SELECTION_RETRY_DEFAULTS.maxDelayMs, 2000);
  });

  it('2. calcBackoffDelay(0) 返回 0', () => {
    assert.equal(calcBackoffDelay(0), 0);
  });

  it('3. calcBackoffDelay(1) 返回 baseDelay', () => {
    assert.equal(calcBackoffDelay(1, 300, 2000), 300);
  });

  it('4. calcBackoffDelay 指数递增', () => {
    assert.equal(calcBackoffDelay(2, 300, 2000), 600);
    assert.equal(calcBackoffDelay(3, 300, 2000), 1200);
  });

  it('5. calcBackoffDelay 受 maxDelay 限制', () => {
    assert.equal(calcBackoffDelay(10, 300, 2000), 2000);
  });

  it('6. getSelectionRetryMessage(attempt=0) 返回空字符串', () => {
    assert.equal(getSelectionRetryMessage(0, 3), '');
  });

  it('7. getSelectionRetryMessage 正常重试', () => {
    const msg = getSelectionRetryMessage(1, 3);
    assert.ok(msg.includes('第 1/3 次'));
  });

  it('8. getSelectionRetryMessage 最后一次提示', () => {
    const msg = getSelectionRetryMessage(3, 3);
    assert.ok(msg.includes('无法获取'));
  });

  it('9. getSelectionFailedMessage 返回失败消息', () => {
    const msg = getSelectionFailedMessage();
    assert.ok(msg.includes('无法获取选中文本'));
  });
});

// ==================== AI 超时检测 ====================

describe('CoreFlowFix — AI Timeout', () => {

  it('10. AI_TIMEOUT_DEFAULTS 有正确的默认值', () => {
    assert.equal(AI_TIMEOUT_DEFAULTS.warningThresholdMs, 15000);
    assert.equal(AI_TIMEOUT_DEFAULTS.timeoutThresholdMs, 120000);
  });

  it('11. formatElapsedTime 0 秒', () => {
    assert.equal(formatElapsedTime(0), '0s');
  });

  it('12. formatElapsedTime 秒', () => {
    assert.equal(formatElapsedTime(5000), '5s');
    assert.equal(formatElapsedTime(59000), '59s');
  });

  it('13. formatElapsedTime 分钟', () => {
    assert.equal(formatElapsedTime(60000), '1m 0s');
    assert.equal(formatElapsedTime(83000), '1m 23s');
  });

  it('14. formatElapsedTime 负数视为 0', () => {
    assert.equal(formatElapsedTime(-100), '0s');
  });

  it('15. shouldShowTimeoutWarning 正常情况', () => {
    assert.equal(shouldShowTimeoutWarning(100, 50, 200), true);
    assert.equal(shouldShowTimeoutWarning(100, 200, 150), false);
  });

  it('16. shouldShowTimeoutWarning 非法输入', () => {
    assert.equal(shouldShowTimeoutWarning('abc', 50, 200), false);
    assert.equal(shouldShowTimeoutWarning(100, -1, 200), false);
    assert.equal(shouldShowTimeoutWarning(100, 50, NaN), false);
  });

  it('17. getTimeoutWarningMessage 包含经过时间', () => {
    const msg = getTimeoutWarningMessage('5s');
    assert.ok(msg.includes('5s'));
  });

  it('18. getTimeoutSuggestion 返回建议文本', () => {
    const msg = getTimeoutSuggestion();
    assert.ok(msg.includes('频繁超时'));
  });
});

// ==================== 检索空态引导 ====================

describe('CoreFlowFix — Search Guidance', () => {

  it('19. GuidanceType 枚举值正确', () => {
    assert.equal(GuidanceType.EMPTY_KB, 'empty_kb');
    assert.equal(GuidanceType.NO_RESULTS, 'no_results');
    assert.equal(GuidanceType.TIPS, 'tips');
  });

  it('20. getEmptyKBGuidance 返回正确的引导', () => {
    const g = getEmptyKBGuidance();
    assert.equal(g.type, 'empty_kb');
    assert.ok(g.tips.length > 0);
  });

  it('21. getNoResultsGuidance 有建议时', () => {
    const g = getNoResultsGuidance('test', ['建议1', '建议2']);
    assert.equal(g.type, 'no_results');
    assert.equal(g.suggestions.length, 2);
    assert.ok(g.tips.length > 0);
  });

  it('22. getNoResultsGuidance 无建议时', () => {
    const g = getNoResultsGuidance('test', []);
    assert.ok(g.tips.length > 0);
  });

  it('23. getSearchTips 返回技巧', () => {
    const g = getSearchTips();
    assert.equal(g.type, 'tips');
    assert.ok(g.tips.length > 0);
  });

  it('24. generateSearchGuidance 知识库为空时', () => {
    const g = generateSearchGuidance(0, 'test');
    assert.equal(g.type, 'empty_kb');
  });

  it('25. generateSearchGuidance 有知识库但无结果时', () => {
    const g = generateSearchGuidance(10, 'test', ['建议']);
    assert.equal(g.type, 'no_results');
  });
});

// ==================== 版本常量 ====================

describe('CoreFlowFix — Constants', () => {

  it('26. CORE_FLOW_FIX_VERSION 存在', () => {
    assert.equal(typeof CORE_FLOW_FIX_VERSION, 'string');
    assert.ok(CORE_FLOW_FIX_VERSION.length > 0);
  });
});

// ==================== 重试队列 ====================

describe('CoreFlowFix — Retry Queue', () => {

  it('27. QUEUE_DEFAULTS 默认值', () => {
    assert.equal(QUEUE_DEFAULTS.maxRetries, 3);
    assert.equal(QUEUE_DEFAULTS.baseDelayMs, 1000);
    assert.equal(QUEUE_DEFAULTS.maxDelayMs, 10000);
    assert.equal(QUEUE_DEFAULTS.maxQueueSize, 50);
  });

  it('28. createQueueEntry 创建有效条目', () => {
    const entry = createQueueEntry({ title: 'test' });
    assert.ok(entry.id.startsWith('qw_'));
    assert.equal(entry.entryData.title, 'test');
    assert.equal(entry.retryCount, 0);
    assert.equal(entry.status, 'pending');
    assert.equal(entry.lastError, null);
  });

  it('29. calcRetryDelay(0) 返回 0', () => {
    assert.equal(calcRetryDelay(0), 0);
  });

  it('30. calcRetryDelay 指数退避', () => {
    assert.equal(calcRetryDelay(1, 1000, 10000), 1000);
    assert.equal(calcRetryDelay(2, 1000, 10000), 2000);
    assert.equal(calcRetryDelay(3, 1000, 10000), 4000);
    assert.equal(calcRetryDelay(4, 1000, 10000), 8000);
  });

  it('31. calcRetryDelay 受 maxDelay 限制', () => {
    assert.equal(calcRetryDelay(10, 1000, 10000), 10000);
  });

  it('32. calcNextRetryTime 返回 ISO 字符串', () => {
    const time = calcNextRetryTime(1);
    assert.ok(!isNaN(new Date(time).getTime()));
  });

  it('33. shouldRetry — null 返回 false', () => {
    assert.equal(shouldRetry(null), false);
  });

  it('34. shouldRetry — success 状态返回 false', () => {
    const entry = createQueueEntry({ t: 1 });
    entry.status = 'success';
    assert.equal(shouldRetry(entry), false);
  });

  it('35. shouldRetry — failed 状态返回 false', () => {
    const entry = createQueueEntry({ t: 1 });
    entry.status = 'failed';
    assert.equal(shouldRetry(entry), false);
  });

  it('36. shouldRetry — 超过最大重试次数返回 false', () => {
    const entry = createQueueEntry({ t: 1 });
    entry.retryCount = 5;
    assert.equal(shouldRetry(entry, 3), false);
  });

  it('37. shouldRetry — pending 且在重试时间内返回 true', () => {
    const entry = createQueueEntry({ t: 1 });
    entry.nextRetryAt = new Date(Date.now() - 1000).toISOString();
    assert.equal(shouldRetry(entry, 3), true);
  });

  it('38. markRetry 增加重试计数', () => {
    const entry = createQueueEntry({ t: 1 });
    const updated = markRetry(entry, 'error msg');
    assert.equal(updated.retryCount, 1);
    assert.equal(updated.lastError, 'error msg');
    assert.equal(updated.status, 'pending');
  });

  it('39. markSuccess 标记成功', () => {
    const entry = createQueueEntry({ t: 1 });
    const updated = markSuccess(entry);
    assert.equal(updated.status, 'success');
    assert.equal(updated.lastError, null);
  });

  it('40. markFailed 标记失败', () => {
    const entry = createQueueEntry({ t: 1 });
    const updated = markFailed(entry, 'connection error');
    assert.equal(updated.status, 'failed');
    assert.equal(updated.lastError, 'connection error');
  });

  it('41. enqueue 添加条目', () => {
    const { queue, newEntry } = enqueue([], { title: 'test' });
    assert.equal(queue.length, 1);
    assert.ok(newEntry.id);
  });

  it('42. enqueue 超出最大队列大小时移除旧条目', () => {
    const q = [];
    for (let i = 0; i < 50; i++) {
      const result = enqueue(q, { title: `item-${i}` });
      q.push(result.newEntry);
    }
    const result = enqueue(q, { title: 'overflow' });
    assert.equal(result.queue.length, 50);
  });

  it('43. getPendingItems 返回待重试条目', () => {
    const entry1 = createQueueEntry({ t: 1 });
    const entry2 = createQueueEntry({ t: 2 });
    entry2.nextRetryAt = new Date(Date.now() - 1000).toISOString();
    const pending = getPendingItems([entry1, entry2], 3);
    assert.ok(pending.length >= 1);
  });

  it('44. getPendingItems 非数组输入返回空', () => {
    assert.deepEqual(getPendingItems(null), []);
    assert.deepEqual(getPendingItems(undefined), []);
  });

  it('45. clearCompleted 移除已完成条目', () => {
    const entry1 = createQueueEntry({ t: 1 });
    const entry2 = createQueueEntry({ t: 2 });
    entry2.status = 'success';
    const cleared = clearCompleted([entry1, entry2]);
    assert.equal(cleared.length, 1);
  });

  it('46. clearCompleted 非数组输入返回空', () => {
    assert.deepEqual(clearCompleted(null), []);
  });

  it('47. getQueueStats 统计正确', () => {
    const entry1 = createQueueEntry({ t: 1 });
    const entry2 = createQueueEntry({ t: 2 });
    entry2.status = 'success';
    const entry3 = createQueueEntry({ t: 3 });
    entry3.status = 'failed';
    const stats = getQueueStats([entry1, entry2, entry3]);
    assert.equal(stats.total, 3);
    assert.equal(stats.pending, 1);
    assert.equal(stats.success, 1);
    assert.equal(stats.failed, 1);
  });

  it('48. getQueueStats 非数组返回全零', () => {
    const stats = getQueueStats(null);
    assert.equal(stats.total, 0);
    assert.equal(stats.pending, 0);
    assert.equal(stats.failed, 0);
    assert.equal(stats.success, 0);
  });
});
