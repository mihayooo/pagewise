/**
 * BookmarkLinkChecker — HTTP 请求与辅助方法
 *
 * R203: 从 bookmark-link-checker.js 拆分
 * 包含: _throttleDomain / _isNonHttp / _isValidUrl / _makeResult
 *       _updateCounters / _buildReport / _emptyReport / _sleep
 *
 * @module lib/bookmark-link-checker-request
 */

/** 非 HTTP 协议前缀，不发起请求 */
export const NON_HTTP_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:',
  'javascript:', 'data:', 'blob:', 'file:',
  'edge://', 'brave://', 'opera://', 'vivaldi://',
];

/**
 * 域名限流：同域名请求间隔 ≥ 500ms (QPS ≤ 2)
 *
 * @param {Object} ctx — BookmarkLinkChecker 上下文
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function throttleDomain(ctx, url) {
  let domain;
  try {
    domain = new URL(url).hostname;
  } catch {
    return; // 无效 URL，不做限流
  }

  const now = Date.now();
  const lastTime = ctx._domainTimestamps.get(domain) || 0;
  const elapsed = now - lastTime;

  if (elapsed < 500) {
    await sleep(500 - elapsed);
  }

  ctx._domainTimestamps.set(domain, Date.now());
}

/**
 * 判断是否为非 HTTP 协议
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isNonHttp(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase().trim();
  return !lower.startsWith('http://') && !lower.startsWith('https://')
    || NON_HTTP_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * 判断 URL 格式是否有效
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 构造 LinkResult
 *
 * @returns {Object} LinkResult
 */
export function makeResult(id, url, status, statusCode, redirectUrl, startTime, error = null, duration = null) {
  return {
    id: id || '',
    url,
    status,
    statusCode: statusCode ?? null,
    redirectUrl: redirectUrl ?? null,
    checkedAt: Date.now(),
    error: error ?? null,
    duration: duration ?? (Date.now() - startTime),
  };
}

/**
 * 更新统计计数器
 *
 * @param {Object} ctx — BookmarkLinkChecker 上下文
 * @param {Object} result — LinkResult
 */
export function updateCounters(ctx, result) {
  switch (result.status) {
    case 'alive': ctx._alive++; break;
    case 'dead': ctx._dead++; break;
    case 'redirect': ctx._redirect++; break;
    case 'unknown': ctx._unknown++; break;
  }
}

/**
 * 构造报告
 *
 * @param {Object} ctx — BookmarkLinkChecker 上下文
 * @param {number} total
 * @param {number} duration
 * @returns {Object} Report
 */
export function buildReport(ctx, total, duration) {
  return {
    total,
    alive: ctx._alive,
    dead: ctx._dead,
    redirect: ctx._redirect,
    unknown: ctx._unknown,
    duration,
    results: [...ctx.results],
  };
}

/**
 * 空报告
 *
 * @returns {Object} Report
 */
export function emptyReport() {
  return {
    total: 0,
    alive: 0,
    dead: 0,
    redirect: 0,
    unknown: 0,
    duration: 0,
    results: [],
  };
}

/**
 * 异步等待
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
