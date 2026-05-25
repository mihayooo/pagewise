/**
 * R288 — 单元测试: E2E 冒烟测试辅助函数
 *
 * 测试 isTimeoutError 和 withTimeoutRetry 的行为，
 * 确保重试逻辑仅针对 TimeoutError，非超时错误直接抛出。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== 内联实现（与 test-smoke.js 中的逻辑一致，便于独立测试）====================

/**
 * 判断错误是否为 TimeoutError
 */
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

/**
 * 带重试的异步函数执行器（仅 TimeoutError 重试）
 */
async function withTimeoutRetry(fn, options = {}) {
  const { maxRetries = 2, label = 'test' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTimeout = isTimeoutError(err);
      if (isTimeout && attempt <= maxRetries) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ==================== isTimeoutError 测试 ====================

describe('isTimeoutError', () => {

  it('应识别 Playwright TimeoutError (name=TimeoutError)', () => {
    const err = new Error('Timeout 30000ms exceeded');
    err.name = 'TimeoutError';
    assert.ok(isTimeoutError(err));
  });

  it('应识别 message 含 "timeout" 的错误', () => {
    const err = new Error('Waiting for selector .foo timeout exceeded');
    assert.ok(isTimeoutError(err));
  });

  it('应识别 message 含 "timed out" 的错误', () => {
    const err = new Error('Test timed out after 30000ms');
    assert.ok(isTimeoutError(err));
  });

  it('应识别 ERR_TEST_FAILURE + timeout 组合', () => {
    const err = new Error('test timed out');
    err.code = 'ERR_TEST_FAILURE';
    assert.ok(isTimeoutError(err));
  });

  it('应拒绝 null/undefined', () => {
    assert.equal(isTimeoutError(null), false);
    assert.equal(isTimeoutError(undefined), false);
  });

  it('应拒绝普通错误（非超时）', () => {
    const err = new Error('Element not found');
    assert.equal(isTimeoutError(err), false);
  });

  it('应拒绝 TypeError', () => {
    const err = new TypeError('Cannot read property');
    assert.equal(isTimeoutError(err), false);
  });

  it('应拒绝空对象', () => {
    assert.equal(isTimeoutError({}), false);
  });

  it('应大小写不敏感', () => {
    const err = new Error('TIMEOUT exceeded');
    assert.ok(isTimeoutError(err));
  });

  it('应识别 "timed out" 在长消息中的出现', () => {
    const err = new Error('The operation "waitForSelector" has timed out: 30000ms');
    assert.ok(isTimeoutError(err));
  });
});

// ==================== withTimeoutRetry 测试 ==================== {

describe('withTimeoutRetry', () => {

  it('成功时应直接返回结果（无重试）', async () => {
    let callCount = 0;
    const result = await withTimeoutRetry(async () => {
      callCount++;
      return 42;
    });
    assert.equal(result, 42);
    assert.equal(callCount, 1);
  });

  it('TimeoutError 应重试最多 maxRetries 次', async () => {
    let callCount = 0;
    const result = await withTimeoutRetry(async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error('Timeout 30000ms exceeded');
        err.name = 'TimeoutError';
        throw err;
      }
      return 'success';
    }, { maxRetries: 2 });
    assert.equal(result, 'success');
    assert.equal(callCount, 3); // 1 initial + 2 retries
  });

  it('超过 maxRetries 应抛出最后的 TimeoutError', async () => {
    let callCount = 0;
    await assert.rejects(
      () => withTimeoutRetry(async () => {
        callCount++;
        const err = new Error('Timeout 30000ms exceeded');
        err.name = 'TimeoutError';
        throw err;
      }, { maxRetries: 2 }),
      (err) => {
        assert.ok(err.name === 'TimeoutError' || err.message.includes('Timeout'));
        return true;
      }
    );
    assert.equal(callCount, 3); // 1 initial + 2 retries = 3 total
  });

  it('非 TimeoutError 应直接抛出（不重试）', async () => {
    let callCount = 0;
    await assert.rejects(
      () => withTimeoutRetry(async () => {
        callCount++;
        throw new Error('Element not found');
      }, { maxRetries: 2 }),
      { message: 'Element not found' }
    );
    assert.equal(callCount, 1); // 只调用 1 次，不重试
  });

  it('TypeError 应直接抛出（不重试）', async () => {
    let callCount = 0;
    await assert.rejects(
      () => withTimeoutRetry(async () => {
        callCount++;
        throw new TypeError('Cannot read property');
      }, { maxRetries: 3 }),
      { name: 'TypeError' }
    );
    assert.equal(callCount, 1);
  });

  it('默认 maxRetries 应为 2', async () => {
    let callCount = 0;
    await assert.rejects(
      () => withTimeoutRetry(async () => {
        callCount++;
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      }),
      { name: 'TimeoutError' }
    );
    // 默认 maxRetries=2: 1 initial + 2 retries = 3
    assert.equal(callCount, 3);
  });

  it('maxRetries=0 应不重试（仅执行一次）', async () => {
    let callCount = 0;
    await assert.rejects(
      () => withTimeoutRetry(async () => {
        callCount++;
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      }, { maxRetries: 0 }),
      { name: 'TimeoutError' }
    );
    assert.equal(callCount, 1);
  });

  it('应传递异步返回值（对象）', async () => {
    const result = await withTimeoutRetry(async () => {
      return { id: 'abc', data: [1, 2, 3] };
    });
    assert.deepEqual(result, { id: 'abc', data: [1, 2, 3] });
  });

  it('应传递 undefined 返回值', async () => {
    const result = await withTimeoutRetry(async () => {
      // 没有 return 语句
    });
    assert.equal(result, undefined);
  });

  it('node:test ERR_TEST_FAILURE 含 timeout 时应重试', async () => {
    let callCount = 0;
    const result = await withTimeoutRetry(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('test timed out');
        err.code = 'ERR_TEST_FAILURE';
        throw err;
      }
      return 'recovered';
    }, { maxRetries: 1 });
    assert.equal(result, 'recovered');
    assert.equal(callCount, 2);
  });
});
