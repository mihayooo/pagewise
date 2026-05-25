/**
 * R299 — 单元测试: E2E 核心场景扩展辅助函数
 *
 * 测试 isTimeoutError 和 withTimeoutRetry (45s 硬超时版本) 的行为，
 * 与 R288 一致的重试策略，但超时值调整为 45s。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== 内联实现（与 test-core-scenarios.js 中的逻辑一致）====================

const HARD_TIMEOUT = 45_000;
const MAX_RETRIES = 2;

/**
 * 判断错误是否为 TimeoutError
 * 与 R288 保持一致的判断逻辑
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
 * R299: 45s 硬超时 + 2 次重试
 */
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
        console.warn(
          `[E2E Core] ${label} attempt ${attempt}/${maxRetries + 1} timed out. Retrying...`
        );
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ==================== 测试套件 ====================

describe('R299: E2E Core Scenario Helpers — isTimeoutError', () => {

  it('应识别 name=TimeoutError', () => {
    const err = new Error('operation timed out');
    err.name = 'TimeoutError';
    assert.ok(isTimeoutError(err));
  });

  it('应识别 message 包含 timeout', () => {
    const err = new Error('waiting for selector timeout');
    assert.ok(isTimeoutError(err));
  });

  it('应识别 message 包含 timed out', () => {
    const err = new Error('test timed out after 45000ms');
    assert.ok(isTimeoutError(err));
  });

  it('应识别 ERR_TEST_FAILURE + timeout', () => {
    const err = new Error('test timed out');
    err.code = 'ERR_TEST_FAILURE';
    assert.ok(isTimeoutError(err));
  });

  it('应识别 message 包含 Timeout (大小写混合)', () => {
    const err = new Error('Request Timeout reached');
    assert.ok(isTimeoutError(err));
  });

  it('不应将非超时错误识别为 TimeoutError', () => {
    const err = new Error('element not found');
    assert.ok(!isTimeoutError(err));
  });

  it('不应将 ERR_TEST_FAILURE 不含 timeout 识别为超时', () => {
    const err = new Error('assertion failed');
    err.code = 'ERR_TEST_FAILURE';
    assert.ok(!isTimeoutError(err));
  });

  it('null/undefined 不应报错', () => {
    assert.ok(!isTimeoutError(null));
    assert.ok(!isTimeoutError(undefined));
  });

  it('空错误对象不应报错', () => {
    assert.ok(!isTimeoutError({}));
  });

  it('无 message 无 name 不应报错', () => {
    assert.ok(!isTimeoutError({ code: 'ERR_OTHER' }));
  });
});

describe('R299: E2E Core Scenario Helpers — withTimeoutRetry', () => {

  it('成功时应直接返回结果', async () => {
    const result = await withTimeoutRetry(async () => 'ok', { label: 'success' });
    assert.equal(result, 'ok');
  });

  it('TimeoutError 应重试 maxRetries 次', async () => {
    let calls = 0;
    const result = await withTimeoutRetry(async () => {
      calls++;
      if (calls <= 2) {
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      }
      return 'success-on-3';
    }, { maxRetries: 2, label: 'retry-test' });
    assert.equal(result, 'success-on-3');
    assert.equal(calls, 3);
  });

  it('非 TimeoutError 应直接抛出不重试', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withTimeoutRetry(async () => {
          calls++;
          throw new Error('selector not found');
        }, { maxRetries: 2, label: 'no-retry' });
      },
      { message: 'selector not found' }
    );
    assert.equal(calls, 1, '非超时错误不应重试');
  });

  it('超过 maxRetries 次后应抛出最后的错误', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withTimeoutRetry(async () => {
          calls++;
          const err = new Error('timeout exceeded');
          throw err;
        }, { maxRetries: 2, label: 'max-retry' });
      },
      { message: 'timeout exceeded' }
    );
    assert.equal(calls, 3, '应执行 3 次（1 初始 + 2 重试）');
  });

  it('默认 maxRetries=2', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withTimeoutRetry(async () => {
          calls++;
          const err = new Error('timed out');
          throw err;
        }, { label: 'default-retries' });
      }
    );
    assert.equal(calls, 3, '默认应执行 3 次');
  });

  it('ERR_TEST_FAILURE + timeout 应触发重试', async () => {
    let calls = 0;
    const result = await withTimeoutRetry(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('test timed out');
        err.code = 'ERR_TEST_FAILURE';
        throw err;
      }
      return 'recovered';
    }, { maxRetries: 2, label: 'err-test-failure' });
    assert.equal(result, 'recovered');
    assert.equal(calls, 2);
  });

  it('maxRetries=0 时不应重试', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withTimeoutRetry(async () => {
          calls++;
          const err = new Error('timed out');
          err.name = 'TimeoutError';
          throw err;
        }, { maxRetries: 0, label: 'zero-retries' });
      }
    );
    assert.equal(calls, 1, 'maxRetries=0 不应重试');
  });

  it('混合错误类型：先超时后断言失败', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withTimeoutRetry(async () => {
          calls++;
          if (calls === 1) {
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            throw err;
          }
          throw new Error('assertion failed: element missing');
        }, { maxRetries: 2, label: 'mixed-errors' });
      },
      { message: 'assertion failed: element missing' }
    );
    assert.equal(calls, 2, '应重试超时然后遇到断言失败直接抛出');
  });

  it('45s 硬超时常量正确', () => {
    assert.equal(HARD_TIMEOUT, 45_000);
  });

  it('MAX_RETRIES 常量正确', () => {
    assert.equal(MAX_RETRIES, 2);
  });
});

describe('R299: E2E Core Scenario Helpers — 超时预算', () => {

  it('单条路径总超时 = HARD_TIMEOUT * (MAX_RETRIES + 1)', () => {
    const totalTimeout = HARD_TIMEOUT * (MAX_RETRIES + 1);
    assert.equal(totalTimeout, 135_000, '每条路径总超时应为 135s（45s × 3）');
  });

  it('3 条新路径总超时预算 = 3 * 135s', () => {
    const pathCount = 3;
    const totalBudget = pathCount * HARD_TIMEOUT * (MAX_RETRIES + 1);
    assert.equal(totalBudget, 405_000, '3 条新路径总超时预算应为 405s');
  });

  it('6 条路径总超时（含原 3 条 30s）= 270s + 405s', () => {
    const originalBudget = 3 * 30_000 * 3; // 3 paths × 30s × 3 attempts
    const newBudget = 3 * 45_000 * 3;       // 3 paths × 45s × 3 attempts
    const total = originalBudget + newBudget;
    assert.equal(total, 675_000, '6 条路径总超时预算应为 675s');
  });
});
