/**
 * PageSummarizer — 内容提取辅助方法
 *
 * R203: 从 page-summarizer.js 拆分
 * 包含: _parseHTML / _basicParse / _stripTags / _extractTitle
 *       _extractTitleFromRegex / _removeNoiseElements / _tryHighConfidenceSelectors
 *
 * @module lib/page-summarizer-extract
 */

/** 不可见 / 噪音标签集合 */
export const NOISE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'INPUT',
  'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL', 'FIGURE'
]);

/** 内容标签集合 — 用于计算段落密度 */
export const CONTENT_TAGS = new Set([
  'P', 'LI', 'PRE', 'BLOCKQUOTE', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
]);

/** 高置信度内容选择器 */
export const POSITIVE_SELECTORS = [
  'article', 'main', '[role="main"]',
  '.post-content', '.article-content', '.entry-content',
  '.post-body', '.article-body', '.story-body',
  '.markdown-body', '.content-body', '.page-content',
  '#article', '#content', '#main'
];

/** 负面选择器 — 导航、广告等 */
export const NEGATIVE_SELECTORS = [
  'nav', 'aside', '.sidebar', '.ad', '.advertisement',
  '.comment', '.comments', '.related', '.recommended',
  '.footer', '.header', '.menu', '.breadcrumb',
  '.social', '.share', '.widget'
];

/**
 * 解析 HTML 字符串
 *
 * @param {string} html
 * @returns {Object|null} doc 对象
 */
export function parseHTML(html) {
  if (typeof DOMParser !== 'undefined') {
    try {
      return new DOMParser().parseFromString(html, 'text/html');
    } catch {
      /* safe: DOMParser may fail on malformed HTML, fallback to basicParse */
      return null;
    }
  }
  // Node.js 环境 — 基本标签解析（测试用）
  return basicParse(html);
}

/**
 * 基本 HTML 解析（Node.js 测试环境用）
 * @param {string} html
 * @returns {Object}
 */
export function basicParse(html) {
  const bodyContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                          .replace(/<style[\s\S]*?<\/style>/gi, '')
                          .replace(/<head[\s\S]*?<\/head>/gi, '');

  const elements = [];
  const tagRegex = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(bodyContent)) !== null) {
    elements.push({ tag: match[1].toUpperCase(), innerHTML: match[2], textContent: stripTags(match[2]) });
  }

  return {
    title: extractTitleFromRegex(html),
    body: { innerHTML: bodyContent, textContent: stripTags(bodyContent), querySelectorAll: () => elements },
    querySelectorAll: (sel) => elements.filter(el => {
      const tag = sel.replace(/[^a-z]/gi, '').toUpperCase();
      return el.tag === tag;
    }),
    querySelector: (sel) => {
      const tag = sel.replace(/[^a-z]/gi, '').toUpperCase();
      return elements.find(el => el.tag === tag) || null;
    }
  };
}

/**
 * 移除 HTML 标签
 * @param {string} html
 * @returns {string}
 */
export function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 从 doc 提取标题
 * @param {Object} doc
 * @returns {string}
 */
export function extractTitle(doc) {
  const h1 = doc.querySelector('h1');
  if (h1?.textContent?.trim()) return h1.textContent.trim();

  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle?.getAttribute?.('content')) return ogTitle.getAttribute('content');

  return doc.title || '';
}

/**
 * 从 HTML 字符串中用正则提取标题
 * @param {string} html
 * @returns {string}
 */
export function extractTitleFromRegex(html) {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return stripTags(h1Match[1]);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return stripTags(titleMatch[1]);
  return '';
}

/**
 * 移除噪音元素
 * @param {Object} doc
 */
export function removeNoiseElements(doc) {
  if (!doc.body) return;
  NOISE_TAGS.forEach(tag => {
    const els = doc.body.querySelectorAll?.(tag);
    if (els?.forEach) {
      els.forEach(el => el.remove?.());
    }
  });
  // 移除负面选择器
  NEGATIVE_SELECTORS.forEach(sel => {
    try {
      const els = doc.querySelectorAll?.(sel) || [];
      els.forEach?.(el => el.remove?.());
    } catch { /* 忽略无效选择器 */ }
  });
}

/**
 * 尝试高置信度选择器
 * @param {Object} doc
 * @param {Function} getTextLength
 * @returns {Object|null}
 */
export function tryHighConfidenceSelectors(doc, getTextLength) {
  for (const sel of POSITIVE_SELECTORS) {
    try {
      const el = doc.querySelector(sel);
      if (el && getTextLength(el) > 100) {
        return el;
      }
    } catch { /* 忽略无效选择器 */ }
  }
  return null;
}
