/**
 * BookmarkSmartCollections — 规则匹配方法
 *
 * R203: 从 bookmark-smart-collections.js 拆分
 * 包含: matchesRule / matchesTags / matchesDomain / matchesFolder
 *       matchesDateRange / matchesCategory / bookmarkMatchesRules / evaluateRules
 *
 * @module lib/bookmark-smart-collections-matchers
 */

/**
 * 评估规则集，返回匹配的书签列表
 * @param {Map<string, Object>} bookmarkMap — id → bookmark
 * @param {Object[]} rules
 * @returns {Object[]}
 */
export function evaluateRules(bookmarkMap, rules) {
  const result = [];
  for (const bm of bookmarkMap.values()) {
    if (bookmarkMatchesRules(bm, rules)) {
      result.push(bm);
    }
  }
  return result;
}

/**
 * 检查书签是否满足所有规则 (AND 逻辑)
 * @param {Object} bookmark
 * @param {Object[]} rules
 * @returns {boolean}
 */
export function bookmarkMatchesRules(bookmark, rules) {
  for (const rule of rules) {
    if (!matchesRule(bookmark, rule)) {
      return false;
    }
  }
  return true;
}

/**
 * 检查书签是否匹配单条规则
 * @param {Object} bookmark
 * @param {Object} rule
 * @returns {boolean}
 */
export function matchesRule(bookmark, rule) {
  switch (rule.type) {
    case 'tags':
      return matchesTags(bookmark, rule.value);
    case 'domain':
      return matchesDomain(bookmark, rule.value);
    case 'folder':
      return matchesFolder(bookmark, rule.value);
    case 'status':
      return (bookmark.status || 'unread') === rule.value;
    case 'dateRange':
      return matchesDateRange(bookmark, rule.value);
    case 'category':
      return matchesCategory(bookmark, rule.value);
    default:
      return false;
  }
}

/**
 * 标签匹配: 书签包含任一指定标签
 */
export function matchesTags(bookmark, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return true;
  const bmTags = (bookmark.tags || []).map(t => t.toLowerCase());
  return tags.some(t => bmTags.includes(t.toLowerCase()));
}

/**
 * 域名匹配: URL 包含指定域名片段
 */
export function matchesDomain(bookmark, domain) {
  if (!domain) return true;
  try {
    const url = new URL(bookmark.url);
    return url.hostname.includes(domain.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 文件夹匹配: 书签路径包含任一指定文件夹
 */
export function matchesFolder(bookmark, folders) {
  if (!Array.isArray(folders) || folders.length === 0) return true;
  const path = (bookmark.folderPath || []).map(f => f.toLowerCase());
  return folders.some(f => path.includes(f.toLowerCase()));
}

/**
 * 时间范围匹配
 */
export function matchesDateRange(bookmark, range) {
  if (!bookmark.dateAdded) return false;
  const ts = bookmark.dateAdded;
  if (range.start && ts < range.start) return false;
  if (range.end && ts > range.end) return false;
  return true;
}

/**
 * 分类匹配: 基于 URL/标题/标签的关键词匹配
 */
export function matchesCategory(bookmark, category) {
  if (!category) return true;
  const cat = category.toLowerCase();
  const text = [
    bookmark.title || '',
    ...(bookmark.tags || []),
    ...(bookmark.folderPath || []),
  ].join(' ').toLowerCase();
  // 简单关键词匹配
  const urlDomain = (() => {
    try { return new URL(bookmark.url).hostname.toLowerCase(); } catch { return ''; }
  })();
  return text.includes(cat) || urlDomain.includes(cat);
}
