/**
 * Bookmark Duplicate Detector — 检测方法
 * 从 bookmark-duplicate-detector.js 拆分
 *
 * @module lib/bookmark-duplicate-detector-detect
 */

/** 匹配跟踪参数的正则 */
export const TRACKING_PARAMS_RE = /[?&](utm_|fbclid|gclid|msclkid|dclid|twclid|mc_cid|mc_eid|yclid|gad_source)/i;

/** 跟踪参数集合 */
export const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', '_ga', 'yclid', 'gad_source',
]);

/**
 * 精确 URL 重复检测
 *
 * 找出原始 URL 完全相同的书签 (不经过规范化)。
 * 适用于检测复制粘贴产生的完全相同的书签。
 *
 * @param {Bookmark[]} [bookmarks] — 可选，默认使用构造时的书签
 * @returns {DuplicateGroup[]}
 */
export function findExactDuplicates(bookmarks) {
  const list = bookmarks || this.bookmarks;
  /** @type {Map<string, Bookmark[]>} */
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
    .map(([key, bms]) => ({
      reason: `URL 精确匹配: ${key}`,
      type: 'exact',
      bookmarks: bms,
      normalizedKey: key,
    }));
}

/**
 * 模糊 URL 重复检测
 *
 * 通过 URL 规范化 (移除 www、尾部斜杠、跟踪参数) 找出
 * "本质上相同" 但原始 URL 有细微差异的书签。
 *
 * @param {Bookmark[]} [bookmarks]
 * @returns {DuplicateGroup[]}
 */
export function findFuzzyDuplicates(bookmarks) {
  const list = bookmarks || this.bookmarks;
  /** @type {Map<string, Bookmark[]>} */
  const groups = new Map();

  for (const bm of list) {
    if (!bm.url || typeof bm.url !== 'string') continue;
    const normalized = BookmarkDuplicateDetector_normalizeUrl(bm.url);
    if (!normalized) continue;

    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(bm);
  }

  // 仅返回组内原始 URL 有差异的 (排除已有的精确重复)
  const results = [];
  for (const [normalizedKey, bms] of groups.entries()) {
    if (bms.length < 2) continue;

    // 检查是否所有 URL 都完全相同
    const uniqueUrls = new Set(bms.map((b) => b.url.trim()));
    if (uniqueUrls.size <= 1) continue; // 精确匹配，由 findExactDuplicates 处理

    results.push({
      reason: `URL 模糊匹配 (规范化后相同: ${normalizedKey})`,
      type: 'fuzzy',
      bookmarks: bms,
      normalizedKey,
    });
  }

  return results;
}

/**
 * 标题重复检测
 *
 * 找出标题完全相同但 URL 不同的书签。
 * 这类重复可能是不同来源收录的同一页面。
 *
 * @param {Bookmark[]} [bookmarks]
 * @returns {DuplicateGroup[]}
 */
export function findTitleDuplicates(bookmarks) {
  const list = bookmarks || this.bookmarks;
  /** @type {Map<string, Bookmark[]>} */
  const groups = new Map();

  for (const bm of list) {
    if (!bm.title || typeof bm.title !== 'string') continue;
    const key = bm.title.trim().toLowerCase();
    if (!key) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bm);
  }

  // 仅返回标题相同但 URL 不同的组
  return [...groups.entries()]
    .filter(([, bms]) => {
      if (bms.length < 2) return false;
      const urls = new Set(
        bms.map((b) => (b.url || '').trim().toLowerCase()).filter(Boolean)
      );
      return urls.size > 1; // URL 不同才算是"标题重复"
    })
    .map(([key, bms]) => ({
      reason: `标题相同: "${bms[0].title}"`,
      type: 'title',
      bookmarks: bms,
      normalizedKey: key,
    }));
}

/**
 * URL 规范化 — 独立副本供 findFuzzyDuplicates 内部使用
 * 与 BookmarkDuplicateDetector.normalizeUrl 逻辑相同
 *
 * @param {string} url
 * @returns {string}
 */
function BookmarkDuplicateDetector_normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';

  let normalized = url.trim();

  // 移除协议
  normalized = normalized.replace(/^https?:\/\//i, '');

  // 移除 www. 前缀
  normalized = normalized.replace(/^www\./i, '');

  // 分离路径和查询/锚点
  const [rest, fragment] = normalized.split('#');
  const [pathPart, queryPart] = rest.split('?');

  // 处理查询参数 — 移除跟踪参数
  let cleanQuery = '';
  if (queryPart) {
    const params = queryPart.split('&');
    const kept = params.filter((p) => {
      const key = p.split('=')[0].toLowerCase();
      return !TRACKING_PARAMS.has(key) && !key.startsWith('utm_');
    });
    if (kept.length > 0) {
      cleanQuery = '?' + kept.join('&');
    }
  }

  // 重建 URL 并转小写
  let result = pathPart.toLowerCase() + cleanQuery;
  if (fragment !== undefined) {
    result += '#' + fragment.toLowerCase();
  }

  // 移除尾部斜杠 (但保留仅 "/" 的情况)
  if (result.length > 1) {
    result = result.replace(/\/+$/, '');
  }

  return result;
}
