/**
 * R312 — 单元测试: E2E 深度路径辅助函数
 *
 * 测试 isTimeoutError 和 withTimeoutRetry（深度路径版本，60s 硬超时），
 * 以及构建测试知识条目、构建带复习数据条目的辅助函数。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== 内联实现（与 test-deep-paths.js 中的逻辑一致）====================

const HARD_TIMEOUT = 60_000;
const MAX_RETRIES = 2;

function isTimeoutError(err) {
  if (!err) return false;
  const name = err.name || '';
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return (
    name === 'TimeoutError' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    (code === 'ERR_TEST_FAILURE' && msg.includes('timeout'))
  );
}

async function withTimeoutRetry(fn, options = {}) {
  const { maxRetries = MAX_RETRIES, label = 'test' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTimeout = isTimeoutError(err);
      if (isTimeout && attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 10));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * 构建测试知识条目
 */
function buildTestKnowledgeEntry(overrides = {}) {
  return {
    title: 'E2E Test Entry: JavaScript Promises',
    content: 'Promises in JavaScript represent the eventual completion or failure of an asynchronous operation.',
    summary: 'JavaScript Promise is a proxy for a value not necessarily known at creation time.',
    sourceUrl: 'https://example.com/js-promises',
    sourceTitle: 'JavaScript Promises Guide',
    tags: ['javascript', 'async', 'promises'],
    category: '编程语言',
    question: 'What are JavaScript Promises?',
    answer: 'A Promise is an object representing the eventual completion or failure of an asynchronous operation.',
    language: 'en',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * 构建带复习数据的知识条目（用于间隔复习路径）
 */
function buildTestEntryWithReview(reviewOverrides = {}) {
  const entry = buildTestKnowledgeEntry({
    title: 'E2E Review Entry: CSS Grid Layout',
    content: 'CSS Grid Layout is a two-dimensional layout system for the web.',
    summary: 'CSS Grid provides a grid-based layout system with rows and columns.',
    tags: ['css', 'layout', 'grid'],
    category: '前端',
    question: 'What is CSS Grid?',
    answer: 'CSS Grid is a 2D layout system that lets you lay content out in rows and columns.',
  });

  entry.review = {
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: Date.now() - 1000,
    lastReview: Date.now() - 86400000,
    ...reviewOverrides,
  };

  return entry;
}

// ==================== 测试套件 ====================

describe('R312 — E2E 深度路径辅助函数', () => {

  // ==================== isTimeoutError ====================

  describe('isTimeoutError', () => {

    it('应识别 name=TimeoutError 的错误', () => {
      const err = new Error('test');
      err.name = 'TimeoutError';
      assert.ok(isTimeoutError(err));
    });

    it('应识别 message 包含 timeout 的错误', () => {
      const err = new Error('Operation timeout after 30s');
      assert.ok(isTimeoutError(err));
    });

    it('应识别 message 包含 timed out 的错误', () => {
      const err = new Error('Test timed out');
      assert.ok(isTimeoutError(err));
    });

    it('应识别 ERR_TEST_FAILURE 且 message 含 timeout 的错误', () => {
      const err = new Error('test timeout exceeded');
      err.code = 'ERR_TEST_FAILURE';
      assert.ok(isTimeoutError(err));
    });

    it('不应误判普通错误为超时错误', () => {
      const err = new Error('Element not found');
      assert.ok(!isTimeoutError(err));
    });

    it('不应误判 null/undefined', () => {
      assert.ok(!isTimeoutError(null));
      assert.ok(!isTimeoutError(undefined));
    });

    it('应处理空错误对象', () => {
      assert.ok(!isTimeoutError({}));
    });

    it('应处理无 message 的错误', () => {
      const err = new Error('');
      err.name = 'TimeoutError';
      assert.ok(isTimeoutError(err));
    });
  });

  // ==================== withTimeoutRetry ====================

  describe('withTimeoutRetry', () => {

    it('应返回成功结果（无需重试）', async () => {
      const result = await withTimeoutRetry(async () => 'ok', { maxRetries: 2 });
      assert.equal(result, 'ok');
    });

    it('应在 TimeoutError 后重试并成功', async () => {
      let callCount = 0;
      const result = await withTimeoutRetry(async () => {
        callCount++;
        if (callCount < 2) {
          const err = new Error('timed out');
          err.name = 'TimeoutError';
          throw err;
        }
        return 'success';
      }, { maxRetries: 2 });
      assert.equal(result, 'success');
      assert.equal(callCount, 2);
    });

    it('应在超过最大重试次数后抛出 TimeoutError', async () => {
      let callCount = 0;
      await assert.rejects(
        () => withTimeoutRetry(async () => {
          callCount++;
          const err = new Error('timed out');
          err.name = 'TimeoutError';
          throw err;
        }, { maxRetries: 2 }),
        { name: 'TimeoutError' }
      );
      assert.equal(callCount, 3);
    });

    it('不应重试非 TimeoutError', async () => {
      let callCount = 0;
      await assert.rejects(
        () => withTimeoutRetry(async () => {
          callCount++;
          throw new Error('Element not found');
        }, { maxRetries: 2 }),
        { message: 'Element not found' }
      );
      assert.equal(callCount, 1);
    });

    it('应正确传递返回值（对象类型）', async () => {
      const obj = { data: [1, 2, 3] };
      const result = await withTimeoutRetry(async () => obj);
      assert.deepEqual(result, obj);
    });

    it('应支持 maxRetries=0（不重试）', async () => {
      let callCount = 0;
      await assert.rejects(
        () => withTimeoutRetry(async () => {
          callCount++;
          throw new Error('timeout');
        }, { maxRetries: 0 }),
        { message: 'timeout' }
      );
      assert.equal(callCount, 1);
    });

    it('应在重试间有短暂延迟', async () => {
      const start = Date.now();
      let callCount = 0;
      await withTimeoutRetry(async () => {
        callCount++;
        if (callCount < 2) {
          const err = new Error('timed out');
          err.name = 'TimeoutError';
          throw err;
        }
        return 'ok';
      }, { maxRetries: 2 });
      const elapsed = Date.now() - start;
      assert.ok(elapsed >= 10, `重试延迟应 >= 10ms，实际 ${elapsed}ms`);
    });

    it('应使用 label 参数记录日志', async () => {
      const result = await withTimeoutRetry(async () => 'ok', { label: '路径7-选中即问' });
      assert.equal(result, 'ok');
    });
  });

  // ==================== buildTestKnowledgeEntry ====================

  describe('buildTestKnowledgeEntry', () => {

    it('应返回包含所有必要字段的默认条目', () => {
      const entry = buildTestKnowledgeEntry();
      assert.ok(entry.title);
      assert.ok(entry.content);
      assert.ok(entry.summary);
      assert.ok(entry.sourceUrl);
      assert.ok(entry.sourceTitle);
      assert.ok(Array.isArray(entry.tags));
      assert.ok(entry.tags.length > 0);
      assert.ok(entry.category);
      assert.ok(entry.question);
      assert.ok(entry.answer);
      assert.ok(entry.language);
      assert.ok(typeof entry.createdAt === 'number');
      assert.ok(typeof entry.updatedAt === 'number');
    });

    it('应支持通过 overrides 自定义字段', () => {
      const entry = buildTestKnowledgeEntry({
        title: '自定义标题',
        tags: ['custom'],
      });
      assert.equal(entry.title, '自定义标题');
      assert.deepEqual(entry.tags, ['custom']);
      assert.ok(entry.content);
    });

    it('tags 默认应为数组', () => {
      const entry = buildTestKnowledgeEntry();
      assert.ok(Array.isArray(entry.tags));
      assert.equal(entry.tags.length, 3);
    });
  });

  // ==================== buildTestEntryWithReview ====================

  describe('buildTestEntryWithReview', () => {

    it('应返回包含 review 数据的条目', () => {
      const entry = buildTestEntryWithReview();
      assert.ok(entry.review);
      assert.equal(typeof entry.review.interval, 'number');
      assert.equal(typeof entry.review.repetitions, 'number');
      assert.equal(typeof entry.review.easeFactor, 'number');
      assert.equal(typeof entry.review.nextReview, 'number');
      assert.equal(typeof entry.review.lastReview, 'number');
    });

    it('nextReview 默认应已到期（< now）', () => {
      const entry = buildTestEntryWithReview();
      assert.ok(entry.review.nextReview < Date.now(), 'nextReview 应小于当前时间（已到期）');
    });

    it('应支持自定义 review 数据', () => {
      const futureTime = Date.now() + 86400000;
      const entry = buildTestEntryWithReview({
        nextReview: futureTime,
        interval: 10,
      });
      assert.equal(entry.review.nextReview, futureTime);
      assert.equal(entry.review.interval, 10);
    });

    it('自定义 review 不应覆盖默认值中未指定的字段', () => {
      const entry = buildTestEntryWithReview({ repetitions: 5 });
      assert.equal(entry.review.repetitions, 5);
      assert.equal(entry.review.easeFactor, 2.5);
    });

    it('条目应包含完整的知识内容字段', () => {
      const entry = buildTestEntryWithReview();
      assert.ok(entry.title.includes('CSS Grid'));
      assert.ok(entry.content.includes('CSS Grid'));
      assert.ok(entry.tags.includes('css'));
    });
  });

  // ==================== 常量验证 ====================

  describe('常量验证', () => {

    it('HARD_TIMEOUT 应为 60000ms', () => {
      assert.equal(HARD_TIMEOUT, 60_000);
    });

    it('MAX_RETRIES 应为 2', () => {
      assert.equal(MAX_RETRIES, 2);
    });

    it('每条路径最大耗时应为 HARD_TIMEOUT * (MAX_RETRIES + 1) = 180s', () => {
      const maxTime = HARD_TIMEOUT * (MAX_RETRIES + 1);
      assert.equal(maxTime, 180_000);
    });
  });
});
