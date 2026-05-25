/**
 * BookmarkLinkChecker — 链接健康检查
 *
 * 批量检测书签链接的有效性（HTTP HEAD 请求），
 * 支持并发控制、速率限制、进度回调和结果持久化。
 * R203: HTTP/辅助方法 → bookmark-link-checker-request.js
 *
 * @module BookmarkLinkChecker
 */

import {
  NON_HTTP_PREFIXES, throttleDomain, isNonHttp, isValidUrl,
  makeResult, updateCounters, buildReport, emptyReport, sleep,
} from './bookmark-link-checker-request.js'

// Re-export for backward compatibility
export { NON_HTTP_PREFIXES }

/** 默认配置 */
const DEFAULT_OPTIONS = { concurrency: 5, timeout: 8000, onProgress: null, onComplete: null };

/** BookmarkLinkChecker 类 */
export class BookmarkLinkChecker {
  constructor(options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.concurrency = Math.max(1, Math.min(10, opts.concurrency ?? 5));
    const minTimeout = opts._minTimeout ?? 3000;
    this.timeout = Math.max(minTimeout, Math.min(30000, opts.timeout ?? 8000));
    this.onProgress = opts.onProgress || null;
    this.onComplete = opts.onComplete || null;
    this.results = [];
    this._cancelled = false;
    this._lastCheckedAt = null;
    this._domainTimestamps = new Map();
    this._domainThrottleMs = opts._domainThrottleMs ?? 500;
    this._alive = 0;
    this._dead = 0;
    this._redirect = 0;
    this._unknown = 0;
  }

  // ==================== 公开方法 ====================

  async checkAll(bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return emptyReport();
    this._cancelled = false;
    this.results = [];
    this._alive = 0; this._dead = 0; this._redirect = 0; this._unknown = 0;
    this._lastCheckedAt = null;
    this._domainTimestamps.clear();
    const total = bookmarks.length;
    const startTime = Date.now();
    let index = 0;
    const workers = [];
    const worker = async () => {
      while (index < bookmarks.length && !this._cancelled) {
        const currentIndex = index++;
        const bookmark = bookmarks[currentIndex];
        await throttleDomain(this, bookmark.url);
        if (this._cancelled) break;
        const result = await this.checkOne(bookmark.url, bookmark.id);
        this.results.push(result);
        updateCounters(this, result);
        this._lastCheckedAt = result.checkedAt;
        if (this.onProgress) {
          try { this.onProgress(this.results.length, total, result); } catch (_e) {}
        }
      }
    };
    for (let i = 0; i < Math.min(this.concurrency, bookmarks.length); i++) workers.push(worker());
    await Promise.all(workers);
    const duration = Date.now() - startTime;
    const report = buildReport(this, total, duration);
    if (this.onComplete) { try { this.onComplete(report); } catch (_e) {} }
    return report;
  }

  async checkOne(url, bookmarkId = '') {
    const startTime = Date.now();
    if (!isValidUrl(url)) return makeResult(bookmarkId, url, 'unknown', null, null, startTime, 'invalid-url');
    if (isNonHttp(url)) return makeResult(bookmarkId, url, 'unknown', null, null, startTime, 'non-http-protocol');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      let response;
      try {
        response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'manual', mode: 'no-cors' });
      } catch (headError) {
        if (!controller.signal.aborted) {
          try { response = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'manual', mode: 'no-cors' }); }
          catch (getError) { clearTimeout(timeoutId); throw getError; }
        } else { clearTimeout(timeoutId); throw headError; }
      }
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (response.type === 'opaque') return makeResult(bookmarkId, url, 'alive', 0, null, startTime, null, duration);
      const statusCode = response.status;
      if (statusCode >= 300 && statusCode < 400) {
        const redirectUrl = response.headers?.get('location') || null;
        return makeResult(bookmarkId, url, 'redirect', statusCode, redirectUrl, startTime, null, duration);
      }
      if (statusCode >= 200 && statusCode < 300) return makeResult(bookmarkId, url, 'alive', statusCode, null, startTime, null, duration);
      return makeResult(bookmarkId, url, 'dead', statusCode, null, startTime, `HTTP ${statusCode}`, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      if (error.name === 'AbortError') return makeResult(bookmarkId, url, 'dead', null, null, startTime, 'timeout', duration);
      return makeResult(bookmarkId, url, 'dead', null, null, startTime, error.message || 'network-error', duration);
    }
  }

  cancel() { this._cancelled = true; }

  getReport() {
    const total = this.results.length;
    const duration = total > 0 ? (this.results[this.results.length - 1]?.checkedAt || 0) - (this.results[0]?.checkedAt || 0) : 0;
    return buildReport(this, total, duration);
  }

  getDeadLinks() { return this.getResultsByStatus('dead'); }
  getRedirectLinks() { return this.getResultsByStatus('redirect'); }
  getResultsByStatus(status) { return this.results.filter(r => r.status === status); }
  getLastCheckedAt() { return this._lastCheckedAt; }

  // 内部方法委托
  _throttleDomain(url) { return throttleDomain(this, url); }
  _isNonHttp(url) { return isNonHttp(url); }
  _isValidUrl(url) { return isValidUrl(url); }
  _makeResult(id, url, status, statusCode, redirectUrl, startTime, error, duration) { return makeResult(id, url, status, statusCode, redirectUrl, startTime, error, duration); }
  _updateCounters(result) { return updateCounters(this, result); }
  _buildReport(total, duration) { return buildReport(this, total, duration); }
  _emptyReport() { return emptyReport(); }
  _sleep(ms) { return sleep(ms); }
}
