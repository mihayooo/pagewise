/**
 * BookmarkClusterer - theme clustering engine（编排层）
 *
 * R280: 从原 399 行拆分为:
 *   - bookmark-clusterer-core.js — BUILTIN_CATEGORIES + clusterBookmarks() 核心算法
 *   - bookmark-clusterer.js — BookmarkClusterer 类（编排层 + 阈值配置 + 公共 API）
 *
 * Classifies bookmarks into 15+ tech domains via keyword/URL rules
 * @module lib/bookmark-clusterer
 */

import { BUILTIN_CATEGORIES, clusterBookmarks } from './bookmark-clusterer-core.js';

// 向后兼容 re-export
export { BUILTIN_CATEGORIES } from './bookmark-clusterer-core.js';

// ==================== BookmarkClusterer ====================

export class BookmarkClusterer {
  /**
   * @param {Bookmark[]} bookmarks — 书签数组
   */
  constructor(bookmarks) {
    /** @type {Bookmark[]} */
    this._bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
    /** @type {Map<string, Set<string>>} category → bookmarkId set */
    this._assignments = new Map();
    /** @type {Map<string, Set<string>>} 原始自动聚类结果（用于 moveBookmark 校验） */
    this._autoAssignments = new Map();

    // 执行自动聚类
    this._autoCluster();
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────

  /**
   * 执行聚类，返回 Map<category, Bookmark[]>
   * @returns {Map<string, Bookmark[]>}
   */
  cluster() {
    const result = new Map();
    const idMap = this._buildIdMap();

    for (const [cat, ids] of this._assignments) {
      const bookmarks = [];
      for (const id of ids) {
        const bm = idMap.get(id);
        if (bm) bookmarks.push(bm);
      }
      if (bookmarks.length > 0) {
        result.set(cat, bookmarks);
      }
    }

    return result;
  }

  /**
   * 获取所有分类概览
   * @returns {{ name: string, count: number, keywords: string[] }[]}
   */
  getCategories() {
    const result = [];
    for (const cat of BUILTIN_CATEGORIES) {
      const ids = this._assignments.get(cat.name);
      const count = ids ? ids.size : 0;
      if (count > 0) {
        result.push({ name: cat.name, count, keywords: cat.keywords.slice(0, 10) });
      }
    }
    const otherIds = this._assignments.get('其他');
    if (otherIds && otherIds.size > 0) {
      result.push({ name: '其他', count: otherIds.size, keywords: [] });
    }
    return result;
  }

  /**
   * 将书签从一个分类移到另一个
   * @param {string} bookmarkId
   * @param {string} fromCategory
   * @param {string} toCategory
   * @returns {boolean}
   */
  moveBookmark(bookmarkId, fromCategory, toCategory) {
    const fromSet = this._assignments.get(fromCategory);
    if (!fromSet || !fromSet.has(bookmarkId)) return false;

    fromSet.delete(bookmarkId);
    if (fromSet.size === 0) this._assignments.delete(fromCategory);

    if (!this._assignments.has(toCategory)) {
      this._assignments.set(toCategory, new Set());
    }
    this._assignments.get(toCategory).add(bookmarkId);

    return true;
  }

  /**
   * 合并两个分类
   * @param {string} cat1
   * @param {string} cat2
   * @param {string} mergedName — 合并后的分类名称
   * @returns {boolean}
   */
  mergeCategories(cat1, cat2, mergedName) {
    const set1 = this._assignments.get(cat1);
    const set2 = this._assignments.get(cat2);
    if (!set1 && !set2) return false;

    const merged = new Set();
    if (set1) for (const id of set1) merged.add(id);
    if (set2) for (const id of set2) merged.add(id);

    this._assignments.delete(cat1);
    this._assignments.delete(cat2);
    this._assignments.set(mergedName, merged);

    return true;
  }

  /**
   * 查询某个书签所属分类
   * @param {string} bookmarkId
   * @returns {string | null}
   */
  getCategoryForBookmark(bookmarkId) {
    for (const [cat, ids] of this._assignments) {
      if (ids.has(bookmarkId)) return cat;
    }
    return null;
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  /** @private */
  _buildIdMap() {
    const map = new Map();
    for (const bm of this._bookmarks) {
      map.set(String(bm.id), bm);
    }
    return map;
  }

  /** @private 自动聚类入口 */
  _autoCluster() {
    const result = clusterBookmarks(this._bookmarks);
    this._assignments = result.assignments;
    this._autoAssignments = result.autoAssignments;
  }
}
