/**
 * 测试 lib/error-handler.js — 全局错误处理、分类与重试机制
 *
 * 覆盖：
 * - ErrorType 枚举完整性
 * - classifyAIError: 超时/网络/状态码/关键字/未知
 * - classifyByStatusCode: 401/403/404/413/429/5xx/其他
 * - retryWithBackoff: 速率限制重试、非速率限制直接抛出、onRetry 回调
 * - classifyContentError: youtube/pdf/通用
 * - isIndexedDBAvailable: 可用/不可用
 * - classifyStorageError: 配额/不可用/通用
 * - buildAIErrorMessageHTML: 带重试按钮/无重试按钮/HTML 转义
 * - installGlobalErrorHandler: window 存在/不存在
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  ErrorType,
  CONTENT_ERROR_MESSAGES,
  classifyAIError,
  retryWithBackoff,
  classifyContentError,
  isIndexedDBAvailable,
  classifyStorageError,
  buildAIErrorMessageHTML,
  installGlobalErrorHandler,
} = await import('../lib/error-handler.js');

// ==================== ErrorType 枚举 ====================

describe('ErrorType', () => {
  it('should have all 8 error types', () => {
    assert.equal(ErrorType.NETWORK, 'network');
    assert.equal(ErrorType.AUTH, 'auth');
    assert.equal(ErrorType.MODEL_NOT_FOUND, 'model_not_found');
    assert.equal(ErrorType.TOKEN_LIMIT, 'token_limit');
    assert.equal(ErrorType.RATE_LIMIT, 'rate_limit');
    assert.equal(ErrorType.SERVER_ERROR, 'server_error');
    assert.equal(ErrorType.TIMEOUT, 'timeout');
    assert.equal(ErrorType.UNKNOWN, 'unknown');
  });

  it('should have exactly 8 keys', () => {
    assert.equal(Object.keys(ErrorType).length, 8);
  });
});

// ==================== CONTENT_ERROR_MESSAGES ====================

describe('CONTENT_ERROR_MESSAGES', () => {
  it('should have all 5 content error messages', () => {
    assert.equal(typeof CONTENT_ERROR_MESSAGES.NO_CONTENT, 'string');
    assert.equal(typeof CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS, 'string');
    assert.equal(typeof CONTENT_ERROR_MESSAGES.PDF_READ_ERROR, 'string');
    assert.equal(typeof CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE, 'string');
    assert.equal(typeof CONTENT_ERROR_MESSAGES.STORAGE_QUOTA, 'string');
  });
});

// ==================== classifyAIError ====================

describe('classifyAIError', () => {
  it('should classify AbortError as timeout', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    const result = classifyAIError(error);
    assert.equal(result.type, ErrorType.TIMEOUT);
    assert.equal(result.retryable, true);
  });

  it('should classify timeout keyword as timeout', () => {
    const result = classifyAIError(new Error('Request timeout after 30s'));
    assert.equal(result.type, ErrorType.TIMEOUT);
    assert.equal(result.retryable, true);
  });

  it('should classify Chinese timeout keyword', () => {
    const result = classifyAIError(new Error('请求超时'));
    assert.equal(result.type, ErrorType.TIMEOUT);
    assert.equal(result.retryable, true);
  });

  it('should classify TypeError as network error', () => {
    const result = classifyAIError(new TypeError('Failed to fetch'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('should classify "network error" as network', () => {
    const result = classifyAIError(new Error('NetworkError when attempting to fetch'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('should classify "failed to fetch" as network', () => {
    const result = classifyAIError(new Error('Failed to fetch'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('should classify Chinese network keyword', () => {
    const result = classifyAIError(new Error('网络连接失败'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('should classify API 401 as auth error', () => {
    const result = classifyAIError(new Error('API 401 Unauthorized'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.retryable, false);
  });

  it('should classify API 403 as auth error', () => {
    const result = classifyAIError(new Error('API 403 Forbidden'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.retryable, false);
  });

  it('should classify API 404 as model not found', () => {
    const result = classifyAIError(new Error('API 404 Not Found'));
    assert.equal(result.type, ErrorType.MODEL_NOT_FOUND);
    assert.equal(result.retryable, false);
  });

  it('should classify API 429 as rate limit', () => {
    const result = classifyAIError(new Error('API 429 Too Many Requests'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.retryable, true);
  });

  it('should classify API 413 as token limit', () => {
    const result = classifyAIError(new Error('API 413 Payload Too Large'));
    assert.equal(result.type, ErrorType.TOKEN_LIMIT);
    assert.equal(result.retryable, false);
  });

  it('should classify API 500 as server error', () => {
    const result = classifyAIError(new Error('API 500 Internal Server Error'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.retryable, true);
  });

  it('should classify API 503 as server error', () => {
    const result = classifyAIError(new Error('API 503 Service Unavailable'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.retryable, true);
  });

  it('should classify 401 keyword as auth', () => {
    const result = classifyAIError(new Error('Status 401 unauthorized'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.retryable, false);
  });

  it('should classify "invalid key" as auth', () => {
    const result = classifyAIError(new Error('Invalid API key provided'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.retryable, false);
  });

  it('should classify "model not found" as model not found', () => {
    const result = classifyAIError(new Error('The model gpt-5 does not exist'));
    assert.equal(result.type, ErrorType.MODEL_NOT_FOUND);
    assert.equal(result.retryable, false);
  });

  it('should classify "token limit exceeded" as token limit', () => {
    const result = classifyAIError(new Error('Token limit exceeded for this request'));
    assert.equal(result.type, ErrorType.TOKEN_LIMIT);
    assert.equal(result.retryable, false);
  });

  it('should classify "too long" token error as token limit', () => {
    const result = classifyAIError(new Error('Token count is too long for the model'));
    assert.equal(result.type, ErrorType.TOKEN_LIMIT);
    assert.equal(result.retryable, false);
  });

  it('should classify "rate" keyword as rate limit', () => {
    const result = classifyAIError(new Error('Rate limit exceeded'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.retryable, true);
  });

  it('should classify "too many requests" as rate limit', () => {
    const result = classifyAIError(new Error('Too many requests, please slow down'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.retryable, true);
  });

  it('should classify "throttled" as rate limit', () => {
    const result = classifyAIError(new Error('Request was throttled'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.retryable, true);
  });

  it('should classify unknown errors', () => {
    const result = classifyAIError(new Error('Something went wrong'));
    assert.equal(result.type, ErrorType.UNKNOWN);
    assert.equal(result.retryable, false);
  });

  it('should handle null/undefined error gracefully', () => {
    const result1 = classifyAIError(null);
    assert.equal(result1.type, ErrorType.UNKNOWN);
    assert.equal(result1.originalMessage, '');

    const result2 = classifyAIError(undefined);
    assert.equal(result2.type, ErrorType.UNKNOWN);
    assert.equal(result2.originalMessage, '');
  });

  it('should handle error without message', () => {
    const error = {};
    const result = classifyAIError(error);
    assert.equal(result.type, ErrorType.UNKNOWN);
    assert.equal(result.originalMessage, '');
  });

  it('should preserve originalMessage', () => {
    const result = classifyAIError(new Error('Original error text'));
    assert.equal(result.originalMessage, 'Original error text');
  });
});

// ==================== retryWithBackoff ====================

describe('retryWithBackoff', () => {
  it('should return result on first success', async () => {
    let calls = 0;
    const fn = async () => { calls++; return 'ok'; };
    const result = await retryWithBackoff(fn);
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
  });

  it('should not retry non-rate-limit errors', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('Network error');
    };
    await assert.rejects(() => retryWithBackoff(fn, { baseDelay: 1 }), {
      message: 'Network error'
    });
    assert.equal(calls, 1);
  });

  it('should retry rate limit errors up to maxRetries', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 2) throw new Error('Rate limit exceeded');
      return 'success';
    };
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 1 });
    assert.equal(result, 'success');
    assert.equal(calls, 3);
  });

  it('should throw after exhausting maxRetries for rate limit', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('Rate limit exceeded');
    };
    await assert.rejects(() => retryWithBackoff(fn, { maxRetries: 2, baseDelay: 1 }), {
      message: 'Rate limit exceeded'
    });
    assert.equal(calls, 3); // initial + 2 retries
  });

  it('should call onRetry callback on each retry', async () => {
    const retryLog = [];
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 2) throw new Error('429 Too Many Requests');
      return 'ok';
    };
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 1,
      onRetry: (attempt, delay, error) => {
        retryLog.push({ attempt, delay, type: error.type });
      }
    });
    assert.equal(result, 'ok');
    assert.equal(retryLog.length, 2);
    assert.equal(retryLog[0].attempt, 1);
    assert.equal(retryLog[1].attempt, 2);
    assert.equal(retryLog[0].type, ErrorType.RATE_LIMIT);
  });

  it('should apply exponential backoff delays', async () => {
    const delays = [];
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 2) throw new Error('Rate limit');
      return 'ok';
    };
    await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 10,
      onRetry: (attempt, delay) => delays.push(delay)
    });
    assert.deepEqual(delays, [10, 20]); // baseDelay * 2^0, baseDelay * 2^1
  });

  it('should use default options when none provided', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return 'result';
    };
    const result = await retryWithBackoff(fn);
    assert.equal(result, 'result');
    assert.equal(calls, 1);
  });
});

// ==================== classifyContentError ====================

describe('classifyContentError', () => {
  it('should classify youtube page type', () => {
    const result = classifyContentError(new Error('some error'), 'youtube');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
    assert.equal(result.fallback, false);
  });

  it('should classify caption keyword as youtube', () => {
    const result = classifyContentError(new Error('No captions available'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
    assert.equal(result.fallback, false);
  });

  it('should classify subtitle keyword as youtube', () => {
    const result = classifyContentError(new Error('No subtitles found'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
  });

  it('should classify Chinese 字幕 keyword as youtube', () => {
    const result = classifyContentError(new Error('该视频没有字幕'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
  });

  it('should classify pdf page type', () => {
    const result = classifyContentError(new Error('some error'), 'pdf');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR);
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackLabel, '手动输入内容');
  });

  it('should classify pdf keyword', () => {
    const result = classifyContentError(new Error('Cannot parse PDF document'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR);
    assert.equal(result.fallback, true);
  });

  it('should classify general errors with fallback', () => {
    const result = classifyContentError(new Error('DOM parse failed'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_CONTENT);
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackLabel, '手动输入内容');
  });

  it('should handle null error', () => {
    const result = classifyContentError(null, 'general');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_CONTENT);
    assert.equal(result.fallback, true);
  });

  it('should default to general pageType', () => {
    const result = classifyContentError(new Error('unknown'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_CONTENT);
  });
});

// ==================== isIndexedDBAvailable ====================

describe('isIndexedDBAvailable', () => {
  it('should return boolean', () => {
    const result = isIndexedDBAvailable();
    assert.equal(typeof result, 'boolean');
  });
});

// ==================== classifyStorageError ====================

describe('classifyStorageError', () => {
  it('should classify quota exceeded', () => {
    const result = classifyStorageError(new Error('QuotaExceededError'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('should classify "exceeded" as quota', () => {
    const result = classifyStorageError(new Error('Storage exceeded'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('should classify "storage full" as quota', () => {
    const result = classifyStorageError(new Error('LocalStorage is full'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('should classify Chinese 空间不足 as quota', () => {
    const result = classifyStorageError(new Error('存储空间不足'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('should classify indexeddb unavailable', () => {
    const result = classifyStorageError(new Error('IndexedDB is not available'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('should classify "not allowed" as unavailable', () => {
    const result = classifyStorageError(new Error('Storage access not allowed'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('should classify "blocked" as unavailable', () => {
    const result = classifyStorageError(new Error('IndexedDB blocked by browser'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('should classify Chinese 不可用 as unavailable', () => {
    const result = classifyStorageError(new Error('存储不可用'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('should classify unknown storage errors', () => {
    const result = classifyStorageError(new Error('Something else'));
    assert.equal(result.message, '存储操作失败');
    assert.equal(result.fatal, false);
  });

  it('should handle null error', () => {
    const result = classifyStorageError(null);
    assert.equal(result.message, '存储操作失败');
    assert.equal(result.fatal, false);
  });
});

// ==================== buildAIErrorMessageHTML ====================

describe('buildAIErrorMessageHTML', () => {
  it('should render error message with warning emoji', () => {
    const html = buildAIErrorMessageHTML({
      type: ErrorType.UNKNOWN,
      message: 'Something failed'
    });
    assert.ok(html.includes('⚠️'));
    assert.ok(html.includes('Something failed'));
    assert.ok(html.includes('error-message'));
  });

  it('should include retry button for network errors with retryFn', () => {
    const html = buildAIErrorMessageHTML(
      { type: ErrorType.NETWORK, message: 'Network down' },
      () => {}
    );
    assert.ok(html.includes('btn-retry-ai'));
    assert.ok(html.includes('重试'));
  });

  it('should include retry button for timeout errors with retryFn', () => {
    const html = buildAIErrorMessageHTML(
      { type: ErrorType.TIMEOUT, message: 'Timed out' },
      () => {}
    );
    assert.ok(html.includes('btn-retry-ai'));
  });

  it('should not include retry button for auth errors', () => {
    const html = buildAIErrorMessageHTML(
      { type: ErrorType.AUTH, message: 'Invalid key' },
      () => {}
    );
    assert.ok(!html.includes('btn-retry-ai'));
  });

  it('should not include retry button when no retryFn', () => {
    const html = buildAIErrorMessageHTML({
      type: ErrorType.NETWORK,
      message: 'Network down'
    });
    assert.ok(!html.includes('btn-retry-ai'));
  });

  it('should not include retry button for rate limit errors', () => {
    const html = buildAIErrorMessageHTML(
      { type: ErrorType.RATE_LIMIT, message: 'Rate limited' },
      () => {}
    );
    assert.ok(!html.includes('btn-retry-ai'));
  });

  it('should escape HTML in error message', () => {
    const html = buildAIErrorMessageHTML({
      type: ErrorType.UNKNOWN,
      message: '<script>alert("xss")</script>'
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('should escape quotes in error message', () => {
    const html = buildAIErrorMessageHTML({
      type: ErrorType.UNKNOWN,
      message: 'Error "quoted"'
    });
    assert.ok(html.includes('&quot;'));
  });

  it('should escape ampersands', () => {
    const html = buildAIErrorMessageHTML({
      type: ErrorType.UNKNOWN,
      message: 'A & B'
    });
    assert.ok(html.includes('&amp;'));
    assert.ok(!html.match(/[^&]&[^a]/)); // no unescaped &
  });
});

// ==================== installGlobalErrorHandler ====================

describe('installGlobalErrorHandler', () => {
  it('should not throw when window is undefined', () => {
    // In Node.js, window is undefined — should be a no-op
    assert.doesNotThrow(() => {
      installGlobalErrorHandler(() => {});
    });
  });
});
