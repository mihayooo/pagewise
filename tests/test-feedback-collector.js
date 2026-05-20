/**
 * 测试 lib/feedback-collector.js — NPS 反馈收集器
 *
 * R212: PostLaunchTelemetry — NPS 评分、文字反馈、通知集成
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createFeedbackCollector } from '../lib/feedback-collector.js';

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

function createMockNotifier() {
  const sent = [];
  return {
    notify(message, type) {
      sent.push({ message, type });
      return { id: `notif-${sent.length}`, message, type };
    },
    _sent: sent,
  };
}

// ==================== Tests ====================

describe('FeedbackCollector — NPS 触发时机', () => {
  it('安装不足 7 天时 shouldShowPrompt 返回 false', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 天前
    });
    const collector = _createFeedbackCollector(storage);
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('安装满 7 天时 shouldShowPrompt 返回 true', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 天前
    });
    const collector = _createFeedbackCollector(storage);
    assert.equal(await collector.shouldShowPrompt(), true);
  });

  it('已提交反馈后 shouldShowPrompt 返回 false', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await collector.submitFeedback(8, '很好用');
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('用户跳过后 shouldShowPrompt 返回 false', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await collector.dismissPrompt();
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('没有安装日期时 shouldShowPrompt 返回 false', async () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(await collector.shouldShowPrompt(), false);
  });
});

describe('FeedbackCollector — NPS 评分提交', () => {
  let storage, collector;

  beforeEach(() => {
    storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    collector = _createFeedbackCollector(storage);
  });

  it('提交有效 NPS 分数 (0-10)', async () => {
    const result = await collector.submitFeedback(8, '不错');
    assert.equal(result.score, 8);
    assert.equal(result.comment, '不错');
    assert.ok(result.timestamp > 0);
  });

  it('分数低于 0 抛出错误', async () => {
    await assert.rejects(
      () => collector.submitFeedback(-1, ''),
      { message: /score.*0.*10/ }
    );
  });

  it('分数高于 10 抛出错误', async () => {
    await assert.rejects(
      () => collector.submitFeedback(11, ''),
      { message: /score.*0.*10/ }
    );
  });

  it('非整数分数抛出错误', async () => {
    await assert.rejects(
      () => collector.submitFeedback(7.5, ''),
      { message: /整数|integer/ }
    );
  });

  it('提交后数据持久化到 storage', async () => {
    await collector.submitFeedback(7, '一般般');
    const raw = await storage.get('pagewise_feedback');
    assert.ok(raw.pagewise_feedback);
    assert.equal(raw.pagewise_feedback.score, 7);
    assert.equal(raw.pagewise_feedback.comment, '一般般');
  });

  it('无文字反馈时 comment 为空字符串', async () => {
    const result = await collector.submitFeedback(9);
    assert.equal(result.comment, '');
  });
});

describe('FeedbackCollector — NPS 分类', () => {
  it('分数 0-6 为贬损者 (detractor)', () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(collector.getNPSCategory(0), 'detractor');
    assert.equal(collector.getNPSCategory(3), 'detractor');
    assert.equal(collector.getNPSCategory(6), 'detractor');
  });

  it('分数 7-8 为被动者 (passive)', () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(collector.getNPSCategory(7), 'passive');
    assert.equal(collector.getNPSCategory(8), 'passive');
  });

  it('分数 9-10 为推荐者 (promoter)', () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(collector.getNPSCategory(9), 'promoter');
    assert.equal(collector.getNPSCategory(10), 'promoter');
  });
});

describe('FeedbackCollector — BookmarkNotifications 集成', () => {
  it('低分 (0-6) 触发"帮助改进"通知', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const notifier = createMockNotifier();
    const collector = _createFeedbackCollector(storage, { notifier });
    await collector.submitFeedback(3, '功能不好用');
    assert.equal(notifier._sent.length, 1);
    assert.ok(notifier._sent[0].message.includes('改进'));
    assert.equal(notifier._sent[0].type, 'info');
  });

  it('高分 (9-10) 引导留 Chrome Web Store 评价', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const notifier = createMockNotifier();
    const collector = _createFeedbackCollector(storage, { notifier });
    await collector.submitFeedback(10, '非常好');
    assert.equal(notifier._sent.length, 1);
    assert.ok(notifier._sent[0].message.includes('评价'));
    assert.ok(notifier._sent[0].message.includes('Chrome Web Store'));
    assert.equal(notifier._sent[0].type, 'info');
  });

  it('中间分 (7-8) 不触发通知', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const notifier = createMockNotifier();
    const collector = _createFeedbackCollector(storage, { notifier });
    await collector.submitFeedback(8, '还行');
    assert.equal(notifier._sent.length, 0);
  });

  it('没有 notifier 时不报错', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await assert.doesNotReject(() => collector.submitFeedback(2, '不好'));
  });
});

describe('FeedbackCollector — 导出 JSON', () => {
  it('exportFeedback 返回反馈数据对象', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await collector.submitFeedback(9, '非常好用');
    const exported = collector.exportFeedback();
    assert.equal(exported.score, 9);
    assert.equal(exported.comment, '非常好用');
    assert.ok(exported.exportedAt > 0);
    assert.ok(exported.category);
  });

  it('无反馈数据时 exportFeedback 返回 null', () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(collector.exportFeedback(), null);
  });

  it('导出数据可 JSON 序列化', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await collector.submitFeedback(5, '一般');
    const exported = collector.exportFeedback();
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    assert.equal(parsed.score, 5);
    assert.equal(parsed.comment, '一般');
  });
});

describe('FeedbackCollector — getFeedback 查看已有反馈', () => {
  it('无反馈时返回 null', async () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(await collector.getFeedback(), null);
  });

  it('有反馈时返回反馈对象', async () => {
    const storage = createMockStorage({
      pagewise_install_date: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const collector = _createFeedbackCollector(storage);
    await collector.submitFeedback(7, '还行');
    const fb = await collector.getFeedback();
    assert.equal(fb.score, 7);
    assert.equal(fb.comment, '还行');
  });
});
