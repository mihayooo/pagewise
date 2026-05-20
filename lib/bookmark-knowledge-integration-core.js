/**
 * BookmarkKnowledgeIntegration — 书签-知识库联动核心
 *
 * 从 bookmark-knowledge-integration.js 拆分而来 (R193)
 * 包含: 常量、constructor、生命周期、核心查询 API
 *
 * @module lib/bookmark-knowledge-integration-core
 */

import { BookmarkKnowledgeCorrelation } from './bookmark-knowledge-link.js';

// ==================== 默认配置 ====================

/** 默认关联阈值 */
export const DEFAULT_CORRELATION_THRESHOLD = 0.15;

/** 默认返回结果上限 */
export const DEFAULT_MAX_RESULTS = 10;

/** 仪表盘 Top-N */
export const DASHBOARD_TOP_N = 5;

/** 导航提示模板 */
export const NAV_HINTS = {
  strong: '强关联 — URL/标题/标签高度匹配',
  medium: '中等关联 — 内容领域相关',
  weak: '弱关联 — 部分特征相似',
};

// ==================== BookmarkKnowledgeIntegration ====================

export class BookmarkKnowledgeIntegration {
  constructor(options = {}) {
    this._correlationEngine = options.correlationEngine || new BookmarkKnowledgeCorrelation();
    this._correlationThreshold = options.correlationThreshold ?? DEFAULT_CORRELATION_THRESHOLD;
    this._maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    this._ready = false;
    this._syncedAt = null;
    this._bookmarkMap = new Map();
    this._entryMap = new Map();
  }

  // ==================== 生命周期 ====================

  init(bookmarks, entries) {
    const safeBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
    const safeEntries = Array.isArray(entries) ? entries : [];

    this._bookmarkMap.clear();
    this._entryMap.clear();

    for (const bm of safeBookmarks) {
      if (bm && bm.id) {
        this._bookmarkMap.set(String(bm.id), bm);
      }
    }

    for (const entry of safeEntries) {
      if (entry && entry.id !== null) {
        this._entryMap.set(Number(entry.id), entry);
      }
    }

    this._correlationEngine.buildIndex(safeBookmarks, safeEntries);
    this._ready = true;
    this._syncedAt = Date.now();
  }

  sync(bookmarks, entries) {
    if (!this._ready) {
      this.init(bookmarks, entries);
      return;
    }

    if (Array.isArray(bookmarks) || Array.isArray(entries)) {
      this.init(
        Array.isArray(bookmarks) ? bookmarks : [...this._bookmarkMap.values()],
        Array.isArray(entries) ? entries : [...this._entryMap.values()],
      );
    }

    this._syncedAt = Date.now();
  }

  isReady() {
    return this._ready;
  }

  // ==================== 核心查询 API ====================

  getKnowledgeForBookmark(bookmarkId, opts = {}) {
    if (!this._ready) return [];
    const { limit = this._maxResults, minScore } = opts;
    const results = this._correlationEngine.getRelatedEntries(bookmarkId, { limit: 100 });
    return results
      .filter(r => minScore !== null ? r.score >= minScore : true)
      .slice(0, limit)
      .map(r => ({
        score: r.score,
        matchTypes: r.matchTypes,
        entry: r.entry,
        navigationHint: this._buildNavHint(r.score, r.matchTypes),
      }));
  }

  getBookmarksForEntry(entryId, opts = {}) {
    if (!this._ready) return [];
    const { limit = this._maxResults, minScore } = opts;
    const results = this._correlationEngine.getRelatedBookmarks(entryId, { limit: 100 });
    return results
      .filter(r => minScore !== null ? r.score >= minScore : true)
      .slice(0, limit)
      .map(r => ({
        score: r.score,
        matchTypes: r.matchTypes,
        bookmark: r.bookmark,
        navigationHint: this._buildNavHint(r.score, r.matchTypes),
      }));
  }

  // ==================== 资源管理 ====================

  destroy() {
    this._ready = false;
    this._syncedAt = null;
    this._bookmarkMap.clear();
    this._entryMap.clear();
    this._correlationEngine.buildIndex([], []);
  }

  // ==================== 内部方法 ====================

  _buildNavHint(score, _matchTypes) {
    if (score >= 0.6) return NAV_HINTS.strong;
    if (score >= 0.3) return NAV_HINTS.medium;
    return NAV_HINTS.weak;
  }
}
