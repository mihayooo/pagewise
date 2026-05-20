/**
 * BookmarkDuplicateDetector — 工具方法
 *
 * R203: 从 bookmark-duplicate-detector.js 拆分
 * 包含: TRACKING_PARAMS / TRACKING_PARAMS_RE / normalizeUrl / _scoreBookmark / CLEANUP_STRATEGIES
 *
 * @module lib/bookmark-duplicate-detector-utils
 */

// ==================== 跟踪参数 ====================

/** 跟踪参数集合 */
export const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', '_ga', 'yclid', 'gad_source',
]);

/** 匹配跟踪参数的正则 */
export const TRACKING_PARAMS_RE = /[?&](utm_|fbclid|gclid|msclkid|dclid|twclid|mc_cid|mc_eid|yclid|gad_source)/i;

// ==================== 清理策略 ====================

export const CLEANUP_STRATEGIES = {
  /** 保留最新的书签 */
  'keep-newest': (group) => {
    return group.sort((a, b) => {
      const da = a.dateAdded || a.lastModified || '';
      const db = b.dateAdded || b.lastModified || '';
      return db.localeCompare(da); // 降序 → 最新在前
    });
  },
  /** 保留最旧的书签 (可能是原始书签) */
  'keep-oldest': (group) => {
    return group.sort((a, b) => {
      const da = a.dateAdded || a.lastModified || '';
      const db = b.dateAdded || b.lastModified || '';
      return da.localeCompare(db); // 升序 → 最旧在前
    });
  },
  /** 保留标签最多的书签 */
  'keep-most-tags': (group) => {
    return group.sort((a, b) => {
      const ta = Array.isArray(a.tags) ? a.tags.length : 0;
      const tb = Array.isArray(b.tags) ? b.tags.length : 0;
      return tb - ta;
    });
  },
  /** 保留描述最长的书签 */
  'keep-longest-description': (group) => {
    return group.sort((a, b) => {
      const da = (a.description || '').length;
      const db = (b.description || '').length;
      return db - da;
    });
  },
  /** 保留标题最长的书签 (通常信息量更大) */
  'keep-longest-title': (group) => {
    return group.sort((a, b) => (b.title || '').length - (a.title || '').length);
  },
};

// ==================== 静态工具方法 ====================

/**
 * URL 规范化
 *
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
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

/**
 * 为书签评分 — 信息越丰富得分越高
 *
 * @param {Object} bm — 书签对象
 * @returns {number}
 */
export function scoreBookmark(bm) {
  let score = 0;

  // 标签数量 (+3 每个)
  if (Array.isArray(bm.tags)) {
    score += bm.tags.length * 3;
  }

  // 描述长度 (+1 每 10 字符，最多 10 分)
  const descLen = (bm.description || '').length;
  score += Math.min(Math.floor(descLen / 10), 10);

  // 标题长度 (+1 每 5 字符，最多 5 分)
  const titleLen = (bm.title || '').length;
  score += Math.min(Math.floor(titleLen / 5), 5);

  // URL 不含跟踪参数 (+5)
  if (bm.url && !TRACKING_PARAMS_RE.test(bm.url)) {
    score += 5;
  }

  // 有 folderPath (+2)
  if (Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
    score += 2;
  }

  return score;
}
