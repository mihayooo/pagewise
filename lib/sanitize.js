/**
 * lib/sanitize.js — 统一用户输入净化层
 *
 * R111: InputSanitization — 集中所有输入净化逻辑为单一模块
 *
 * 功能:
 *   - escapeHtml / escapeHtmlAttr: HTML 实体编码 (XSS 防护)
 *   - sanitizeUrl: URL 校验 (仅允许 http/https, javascript: 拦截)
 *   - escapeSearchQuery: 搜索注入防护 (特殊字符转义)
 *   - truncate: 文本截断
 *   - sanitizeBookmarkTitle: 书签标题净化 + 长度限制
 *   - sanitizeTag: 标签净化 + 长度限制
 *
 * 设计原则:
 *   - 纯函数，零副作用，不依赖 DOM / Chrome API
 *   - ES Module (export)
 *   - 所有函数对 null/undefined 安全
 *
 * @module lib/sanitize
 */

// ==================== 常量 ====================

/** 书签标题默认最大长度 */
const BOOKMARK_TITLE_MAX_LENGTH = 200;

/** 标签默认最大长度 */
const TAG_MAX_LENGTH = 50;

/** 允许的 URL 协议白名单 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'file:']);

/** 危险协议黑名单 (小写匹配) */
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'vbscript:', 'data:']);

// ==================== HTML 实体编码 ====================

/**
 * HTML 实体编码 — 将 < > & " ' 转义为 HTML 实体
 *
 * 用途: 防止 XSS 注入，所有输出到 HTML 的用户内容都应先调用此函数。
 *
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串；null/undefined/非字符串返回空字符串
 */
export function escapeHtml(str) {
  if (str == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法：同时检查 null 和 undefined
  const s = String(str);
  if (s.length === 0) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML 属性值编码 — 与 escapeHtml 相同编码逻辑，语义区分用于属性上下文
 *
 * 用途: 将值嵌入 HTML 属性时使用 (如 title="...", data-xxx="...")
 *
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtmlAttr(str) {
  return escapeHtml(str);
}

// ==================== URL 校验 ====================

/**
 * URL 安全校验 — 仅允许 http/https/mailto/file 协议
 *
 * 拦截 javascript:, vbscript:, data: 等危险协议。
 * 处理大小写混淆和前导空白绕过。
 *
 * @param {string} url - 原始 URL
 * @returns {string} 安全 URL；危险 URL 返回空字符串
 */
export function sanitizeUrl(url) {
  if (url == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法
  const s = String(url).trim();
  if (s.length === 0) return '';

  // 提取协议部分 (处理大小写混淆)
  const colonIdx = s.indexOf(':');
  if (colonIdx > 0) {
    const protocol = s.slice(0, colonIdx + 1).toLowerCase();

    // 黑名单拦截
    if (BLOCKED_PROTOCOLS.has(protocol)) {
      return '';
    }

    // 白名单检查 (仅对有协议的 URL 做检查)
    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      // 未知协议，也拦截
      return '';
    }
  }

  // 无协议（相对 URL、锚点等）视为安全
  return s;
}

// ==================== 搜索注入防护 ====================

/**
 * 转义正则特殊字符
 *
 * 用于将用户搜索输入安全地嵌入正则表达式或搜索上下文。
 * 同时对 HTML 特殊字符做基础编码，防止搜索结果渲染时的 XSS。
 *
 * @param {string} str - 原始搜索查询
 * @returns {string} 转义后的查询字符串
 */
export function escapeSearchQuery(str) {
  if (str == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法
  const s = String(str);
  if (s.length === 0) return '';

  // 1. 先转义正则特殊字符 (\ 要最先处理)
  const regexEscaped = s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

  // 2. 再转义 HTML 特殊字符
  return regexEscaped
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== 文本截断 ====================

/**
 * 文本截断 — 超长文本安全截断
 *
 * @param {string} str - 原始字符串
 * @param {number} maxLen - 最大长度 (含后缀)
 * @param {string} [suffix='...'] - 截断后缀
 * @returns {string} 截断后的字符串
 */
export function truncate(str, maxLen, suffix = '...') {
  if (str == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法
  const s = String(str);
  if (!maxLen || maxLen <= 0) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - suffix.length) + suffix;
}

// ==================== 书签标题 / 标签专用 ====================

/**
 * 书签标题净化 — trim + HTML 转义 + 长度限制
 *
 * @param {string} title - 原始标题
 * @param {number} [maxLen=BOOKMARK_TITLE_MAX_LENGTH] - 最大长度
 * @returns {string} 净化后的标题
 */
export function sanitizeBookmarkTitle(title, maxLen = BOOKMARK_TITLE_MAX_LENGTH) {
  if (title == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法
  const trimmed = String(title).trim();
  if (trimmed.length === 0) return '';

  const escaped = escapeHtml(trimmed);
  if (escaped.length <= maxLen) return escaped;

  // 截断（保留后缀指示截断）
  return escaped.slice(0, maxLen - 3) + '...';
}

/**
 * 标签净化 — trim + 小写 + 移除不安全字符 + 长度限制
 *
 * 保留: 字母、数字、中文、连字符(-)、下划线(_)、空格
 * 移除: < > " ' & 等 HTML 特殊字符
 *
 * @param {string} tag - 原始标签
 * @param {number} [maxLen=TAG_MAX_LENGTH] - 最大长度
 * @returns {string} 净化后的标签
 */
export function sanitizeTag(tag, maxLen = TAG_MAX_LENGTH) {
  if (tag == null) return ''; // eslint-disable-line eqeqeq -- == null 惯用法
  const trimmed = String(tag).trim().toLowerCase();
  if (trimmed.length === 0) return '';

  // 移除不安全字符，保留字母/数字/中文/连字符/下划线/空格
  const cleaned = trimmed.replace(/[<>"'&=;/\\{}[\]()]/g, '');
  if (cleaned.length === 0) return '';

  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen);
}

// ==================== 默认导出 ====================

export default {
  escapeHtml,
  escapeHtmlAttr,
  sanitizeUrl,
  escapeSearchQuery,
  truncate,
  sanitizeBookmarkTitle,
  sanitizeTag,
  BOOKMARK_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
};
