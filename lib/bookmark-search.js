/**
 * BookmarkSearch — 书签搜索模块
 * 合并: search, recommender, semantic-search, ai-recommender
 *
 * 向后兼容门面模块 — 委托给拆分后的子模块:
 *   - bookmark-search-core.js — 核心搜索 (search, searchByFilter, 图谱扩展)
 *   - bookmark-search-suggest.js — 搜索建议与工具方法
 *
 * R161 拆分: 原 477 行 → 门面 + 2 子模块
 */

import {
  search,
  searchByFilter,
  _expandWithGraph,
  _mergeResults,
  _sortResults,
} from './bookmark-search-core.js';

import {
  getSearchSuggestions,
  getSuggestions,
  setKnownTags,
  getSearchSuggestionsDebounced,
  getStats,
  _recordSearch,
  _computeHighlights,
  _tokenize,
  _matchesFolder,
  _matchesTags,
  _matchesDomain,
} from './bookmark-search-suggest.js';

/**
 * BookmarkSearch — 书签搜索
 *
 * 整合 BookmarkIndexer（倒排索引）与 BookmarkGraphEngine（图谱），
 * 提供综合搜索、条件过滤、搜索建议。
 *
 * 功能:
 *   - 综合搜索: 索引关键词匹配 + 图谱相关性扩展
 *   - 条件过滤: 文件夹 / 标签 / 状态
 *   - 搜索建议: 基于标签 + 热门搜索，支持 200ms 防抖
 *   - 多排序: relevance / date / title
 */

export class BookmarkSearch {
  /**
   * @param {import('./bookmark-indexer.js').BookmarkIndexer} indexer
   * @param {import('./bookmark-graph.js').BookmarkGraphEngine} graphEngine
   */
  constructor(indexer, graphEngine) {
    if (!indexer) {
      throw new Error('BookmarkSearch requires a BookmarkIndexer instance');
    }
    if (!graphEngine) {
      throw new Error('BookmarkSearch requires a BookmarkGraphEngine instance');
    }

    /** @type {import('./bookmark-indexer.js').BookmarkIndexer} */
    this._indexer = indexer;
    /** @type {import('./bookmark-graph.js').BookmarkGraphEngine} */
    this._graphEngine = graphEngine;

    /** @type {Map<string, number>} query → count — 热门搜索记录 */
    this._searchHistory = new Map();
    /** @type {string[]} 累积所有已知标签 */
    this._knownTags = [];
    /** @type {number|null} 防抖定时器 ID */
    this._debounceTimer = null;
    /** @type {number} 防抖延迟 (ms) */
    this._debounceDelay = 200;
  }
}

// ==================== Mixin ====================

Object.assign(BookmarkSearch.prototype, {
  search,
  searchByFilter,
  getSearchSuggestions,
  getSuggestions,
  setKnownTags,
  getSearchSuggestionsDebounced,
  getStats,
  _expandWithGraph,
  _mergeResults,
  _sortResults,
  _recordSearch,
  _computeHighlights,
  _tokenize,
  _matchesFolder,
  _matchesTags,
  _matchesDomain,
});
