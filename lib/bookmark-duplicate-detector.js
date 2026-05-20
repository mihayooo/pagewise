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

// ==================== 内部工具 ====================

/**
 * 将文本按空格/标点分词，返回小写 token 集合
 * @param {string} text
 * @returns {Set<string>}
 */
function _tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,.;:!?\-_/\\|()[\]{}'"`~@#$%^&*+=<>]+/)
      .filter((t) => t.length > 0)
  );
}

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
  //  来自 BookmarkDedup 的扩展方法（R207 合并）
  // ----------------------------------------------------------------

  /**
   * 计算两个标题的 Jaccard 相似度 (0-1)
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} 0-1
   */
  static titleSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;

    const tokensA = _tokenize(a);
    const tokensB = _tokenize(b);

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 按规范化 URL 分组，返回每组包含 2+ 书签的数组
   *
   * @returns {Array<Array>}
   */
  findByExactUrl() {
    const groups = new Map();

    for (const bm of this.bookmarks) {
      const normalized = normalizeUrl(bm.url);
      if (!normalized) continue;

      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized).push(bm);
    }

    return [...groups.values()].filter((g) => g.length > 1);
  }

  /**
   * 按标题相似度分组，返回每组包含 2+ 书签的数组
   *
   * @param {number} [threshold=0.7]
   * @returns {Array<Array>}
   */
  findBySimilarTitle(threshold = 0.7) {
    const n = this.bookmarks.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const rank = new Array(n).fill(0);

    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra]++;
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = BookmarkDuplicateDetector.titleSimilarity(
          this.bookmarks[i].title,
          this.bookmarks[j].title
        );
        if (sim >= threshold) {
          union(i, j);
        }
      }
    }

    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(this.bookmarks[i]);
    }

    return [...groups.values()].filter((g) => g.length > 1);
  }

  /**
   * 综合 URL 规范化去重 + 标题相似度去重
   *
   * @returns {{ original: Object, duplicates: Object[], reason: string }[]}
   */
  findDuplicates() {
    const processed = new Set();
    const results = [];

    // 1) URL 规范化去重
    for (const group of this.findByExactUrl()) {
      const ids = group.map((b) => b.id);
      if (ids.some((id) => processed.has(id))) continue;

      const [original, ...duplicates] = group;
      results.push({
        original,
        duplicates,
        reason: `URL 完全匹配 (规范化: ${normalizeUrl(original.url)})`,
      });
      ids.forEach((id) => processed.add(id));
    }

    // 2) 标题相似度去重 (排除已处理的)
    for (const group of this.findBySimilarTitle()) {
      const unprocessed = group.filter((b) => !processed.has(b.id));
      if (unprocessed.length < 2) continue;

      const [original, ...duplicates] = unprocessed;
      results.push({
        original,
        duplicates,
        reason: `标题相似度 ≥ 0.7 ("${original.title}")`,
      });
      unprocessed.forEach((b) => processed.add(b.id));
    }

    return results;
  }

  /**
   * 基于 findDuplicates() 生成清理建议
   *
   * @returns {{ action: 'remove'|'merge', bookmarkId: string, reason: string }[]}
   */
  suggestCleanup() {
    const suggestions = [];

    for (const dup of this.findDuplicates()) {
      const { original, duplicates, reason } = dup;

      for (const bm of duplicates) {
        const isUrlDup = reason.startsWith('URL');
        suggestions.push({
          action: isUrlDup ? 'remove' : 'merge',
          bookmarkId: bm.id,
          reason: isUrlDup
            ? `与 #${original.id} URL 重复，建议删除`
            : `与 #${original.id} 标题相似，建议合并`,
        });
      }
    }

    return suggestions;
  }

  /**
   * 从内部书签列表中移除指定 ID 的书签
   *
   * @param {string[]} bookmarkIds
   * @returns {number} 实际移除的数量
   */
  batchRemove(bookmarkIds) {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) return 0;

    const idSet = new Set(bookmarkIds.map(String));
    const before = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter((bm) => !idSet.has(String(bm.id)));
    return before - this.bookmarks.length;
  }

  // ----------------------------------------------------------------
  //  静态工具方法 — 委托 utils 模块
  // ----------------------------------------------------------------

  static normalizeUrl(url) { return normalizeUrl(url); }
  static _scoreBookmark(bm) { return scoreBookmark(bm); }
}

export { BookmarkDuplicateDetector };
export default BookmarkDuplicateDetector;
