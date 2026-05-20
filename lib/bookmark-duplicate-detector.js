/**
 * BookmarkDuplicateDetector — 书签重复检测器
 *
 * 在 BookmarkDedup 基础上扩展高级重复检测。
 * R203: 工具方法 → bookmark-duplicate-detector-utils.js
 *
 * @module lib/bookmark-duplicate-detector
 */

import {
  TRACKING_PARAMS, TRACKING_PARAMS_RE, CLEANUP_STRATEGIES,
  normalizeUrl, scoreBookmark,
} from './bookmark-duplicate-detector-utils.js';

// Re-export for backward compatibility
export { TRACKING_PARAMS, TRACKING_PARAMS_RE, CLEANUP_STRATEGIES, normalizeUrl };

// ==================== BookmarkDuplicateDetector ====================

class BookmarkDuplicateDetector {
  /** @param {Object[]} bookmarks */
  constructor(bookmarks = []) {
    this.bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
  }

  // ----------------------------------------------------------------
  //  核心检测方法
  // ----------------------------------------------------------------

  findExactDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    const groups = new Map();
    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue;
      const key = bm.url.trim();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bm);
    }
    return [...groups.entries()]
      .filter(([, bms]) => bms.length > 1)
      .map(([key, bms]) => ({ reason: `URL 精确匹配: ${key}`, type: 'exact', bookmarks: bms, normalizedKey: key }));
  }

  findFuzzyDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    const groups = new Map();
    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue;
      const normalized = normalizeUrl(bm.url);
      if (!normalized) continue;
      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized).push(bm);
    }
    const results = [];
    for (const [normalizedKey, bms] of groups.entries()) {
      if (bms.length < 2) continue;
      const uniqueUrls = new Set(bms.map((b) => b.url.trim()));
      if (uniqueUrls.size <= 1) continue;
      results.push({ reason: `URL 模糊匹配 (规范化后相同: ${normalizedKey})`, type: 'fuzzy', bookmarks: bms, normalizedKey });
    }
    return results;
  }

  findTitleDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    const groups = new Map();
    for (const bm of list) {
      if (!bm.title || typeof bm.title !== 'string') continue;
      const key = bm.title.trim().toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bm);
    }
    return [...groups.entries()]
      .filter(([, bms]) => {
        if (bms.length < 2) return false;
        const urls = new Set(bms.map((b) => (b.url || '').trim().toLowerCase()).filter(Boolean));
        return urls.size > 1;
      })
      .map(([key, bms]) => ({ reason: `标题相同: "${bms[0].title}"`, type: 'title', bookmarks: bms, normalizedKey: key }));
  }

  // ----------------------------------------------------------------
  //  合并与清理
  // ----------------------------------------------------------------

  mergeDuplicates(duplicateGroups) {
    const kept = [], removed = [], mergeLog = [];
    for (const group of duplicateGroups) {
      if (!group.bookmarks || group.bookmarks.length < 2) continue;
      const scored = group.bookmarks.map((bm) => ({ bookmark: bm, score: scoreBookmark(bm) }));
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0].bookmark;
      const rest = scored.slice(1).map((s) => s.bookmark);
      kept.push(best);
      removed.push(...rest);
      mergeLog.push({ keptId: best.id, removedIds: rest.map((r) => r.id), reason: group.reason });
    }
    return { kept, removed, mergeLog };
  }

  getDuplicateStats(bookmarks) {
    const list = bookmarks || this.bookmarks;
    const exactGroups = this.findExactDuplicates(list);
    const fuzzyGroups = this.findFuzzyDuplicates(list);
    const titleGroups = this.findTitleDuplicates(list);
    const allDuplicateIds = new Set();
    for (const g of [...exactGroups, ...fuzzyGroups, ...titleGroups]) {
      for (const bm of g.bookmarks) allDuplicateIds.add(bm.id);
    }
    return {
      totalBookmarks: list.length,
      exactDuplicateGroups: exactGroups.length,
      exactDuplicateCount: exactGroups.reduce((sum, g) => sum + g.bookmarks.length, 0),
      fuzzyDuplicateGroups: fuzzyGroups.length,
      fuzzyDuplicateCount: fuzzyGroups.reduce((sum, g) => sum + g.bookmarks.length, 0),
      titleDuplicateGroups: titleGroups.length,
      titleDuplicateCount: titleGroups.reduce((sum, g) => sum + g.bookmarks.length, 0),
      totalDuplicateGroups: exactGroups.length + fuzzyGroups.length + titleGroups.length,
      totalDuplicateCount: allDuplicateIds.size,
      uniqueBookmarks: list.length - allDuplicateIds.size + (exactGroups.length + fuzzyGroups.length + titleGroups.length),
      deduplicationRatio: list.length === 0 ? 0 : +(allDuplicateIds.size / list.length).toFixed(4),
    };
  }

  cleanDuplicates(bookmarks, strategy = 'keep-newest') {
    const list = bookmarks || this.bookmarks;
    const sortFn = CLEANUP_STRATEGIES[strategy];
    if (!sortFn) throw new Error(`未知清理策略: "${strategy}". 支持的策略: ${Object.keys(CLEANUP_STRATEGIES).join(', ')}`);
    const allGroups = [...this.findExactDuplicates(list), ...this.findFuzzyDuplicates(list), ...this.findTitleDuplicates(list)];
    const processed = new Set();
    const removed = [];
    let groupsProcessed = 0;
    for (const group of allGroups) {
      const unprocessed = group.bookmarks.filter((bm) => !processed.has(bm.id));
      if (unprocessed.length < 2) continue;
      const sorted = sortFn([...unprocessed]);
      const keeper = sorted[0];
      const toRemove = sorted.slice(1);
      processed.add(keeper.id);
      for (const bm of toRemove) { processed.add(bm.id); removed.push(bm); }
      groupsProcessed++;
    }
    const removedIds = new Set(removed.map((b) => b.id));
    return { cleaned: list.filter((bm) => !removedIds.has(bm.id)), removed, strategy, groupsProcessed };
  }

  // ----------------------------------------------------------------
  //  静态工具方法 — 委托 utils 模块
  // ----------------------------------------------------------------

  static normalizeUrl(url) { return normalizeUrl(url); }
  static _scoreBookmark(bm) { return scoreBookmark(bm); }
}

export { BookmarkDuplicateDetector };
export default BookmarkDuplicateDetector;
