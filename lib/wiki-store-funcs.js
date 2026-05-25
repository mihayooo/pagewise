/**
 * WikiStore 纯函数层 — 从 wiki-store.js (R130) 拆分
 *
 * 包含 Wiki 页面的纯函数：
 *   - 页面 ID 生成/解析
 *   - 实体/概念/Q&A → Wiki 页面转换
 *   - Wikilink 提取/渲染/反向链接
 *   - 搜索/过滤/分页
 *
 * @module wiki-store-funcs
 */

import { escapeHtml, escapeHtmlAttr } from './sanitize.js';

// ==================== 常量 ====================

/** Wiki 页面类型 */
export const WIKI_PAGE_TYPE = {
  ENTITY: 'entity',
  CONCEPT: 'concept',
  QA: 'qa',
};

/** 页面类型标签 */
export const PAGE_TYPE_LABELS = {
  entity: '实体',
  concept: '概念',
  qa: '知识',
};

/** 页面类型图标 */
export const PAGE_TYPE_ICONS = {
  entity: '🏷️',
  concept: '💡',
  qa: '❓',
};

/** 实体类型标签 */
const ENTITY_TYPE_LABELS = {
  person: '人物',
  tool: '工具',
  framework: '框架',
  api: 'API',
  language: '编程语言',
  platform: '平台',
  library: '库',
  service: '服务',
  other: '其他',
};

// ==================== 页面 ID ====================

/**
 * @param {string} type - 页面类型
 * * @param {string} identifier - 标识符
 * * @returns {string} Wiki 页面 ID
 */
export function buildPageId(type, identifier) {
  if (!type || identifier === undefined || identifier === null) return '';
  return `${type}:${String(identifier)}`;
}

/**
 * @param {string} pageId - Wiki 页面 ID
 * * @returns {{type: string, identifier: string}|null}
 */
export function parsePageId(pageId) {
  if (!pageId || typeof pageId !== 'string') return null;
  const idx = pageId.indexOf(':');
  if (idx <= 0) return null;
  const type = pageId.substring(0, idx);
  const identifier = pageId.substring(idx + 1);
  if (!type || !identifier) return null;
  if (!Object.values(WIKI_PAGE_TYPE).includes(type)) return null;
  return { type, identifier };
}

// ==================== 页面转换 ====================

/**
 * @param {object} entity - 实体对象
 * * @returns {object|null} Wiki 页面对象
 */
export function entityToWikiPage(entity) {
  if (!entity || !entity.name) return null;
  const displayName = entity.displayName || entity.name;
  const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';
  const content = [`# ${displayName}`, '', `**类型**: ${typeLabel}`, ''];
  if (entity.description) content.push(entity.description, '');
  if (entity.entryIds && entity.entryIds.length > 0) {
    content.push(`## 相关知识 (${entity.entryIds.length} 条)`, '');
    for (const entryId of entity.entryIds) content.push(`- [[qa:${entryId}]]`);
    content.push('');
  }
  return {
    id: buildPageId(WIKI_PAGE_TYPE.ENTITY, entity.name),
    type: WIKI_PAGE_TYPE.ENTITY,
    title: displayName,
    content: content.join('\n'),
    tags: [typeLabel, entity.type || 'other'],
    metadata: {
      name: entity.name,
      entityType: entity.type,
      entryCount: entity.entryIds ? entity.entryIds.length : 0,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    },
  };
}

/**
 * @param {object} concept - 概念对象
 * * @returns {object|null} Wiki 页面对象
 */
export function conceptToWikiPage(concept) {
  if (!concept || !concept.name) return null;
  const displayName = concept.displayName || concept.name;
  const content = [`# ${displayName}`, '', '**类型**: 概念', ''];
  if (concept.description) content.push(concept.description, '');
  if (concept.entryIds && concept.entryIds.length > 0) {
    content.push(`## 相关知识 (${concept.entryIds.length} 条)`, '');
    for (const entryId of concept.entryIds) content.push(`- [[qa:${entryId}]]`);
    content.push('');
  }
  return {
    id: buildPageId(WIKI_PAGE_TYPE.CONCEPT, concept.name),
    type: WIKI_PAGE_TYPE.CONCEPT,
    title: displayName,
    content: content.join('\n'),
    tags: ['概念'],
    metadata: {
      name: concept.name,
      entryCount: concept.entryIds ? concept.entryIds.length : 0,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
    },
  };
}

/**
 * @param {object} entry - Q&A 条目
 * * @returns {object|null} Wiki 页面对象
 */
export function entryToWikiPage(entry) {
  if (!entry) return null;
  const title = entry.title || entry.question || `知识 #${entry.id}`;
  const content = [`# ${title}`, ''];
  if (entry.question && entry.question !== title) {
    content.push('## 问题', '', entry.question, '');
  }
  if (entry.answer) content.push('## 回答', '', entry.answer, '');
  const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];
  if (entry.sourceUrl) {
    content.push('## 来源', '', `[${entry.sourceUrl}](${entry.sourceUrl})`, '');
  }
  return {
    id: buildPageId(WIKI_PAGE_TYPE.QA, entry.id),
    type: WIKI_PAGE_TYPE.QA,
    title,
    content: content.join('\n'),
    tags,
    metadata: {
      entryId: entry.id,
      sourceUrl: entry.sourceUrl,
      createdAt: entry.createdAt,
      category: entry.category,
    },
  };
}

// ==================== Wikilink 工具 ====================

/**
 * @param {string} content - 包含 Wikilink 的文本
 * * @returns {string[]} Wikilink 目标列表
 */
export function extractWikilinks(text) {
  if (!text || typeof text !== 'string') return [];
  const links = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) links.push(target);
  }
  return links;
}

/**
 * @param {string} text - 包含 Wikilink 的文本
 * @param {Map} pageMap - 页面 ID→页面对象映射
 * @param {object} [options] - 渲染选项
 * @param {string} [options.cssClass] - 链接 CSS 类名
 * @returns {string} HTML 字符串
 */
export function renderWikilinks(text, pageMap, options = {}) {
  if (!text || typeof text !== 'string') return text || '';
  const cssClass = options.cssClass || 'wiki-link';
  return text.replace(/\[\[([^\]]+)\]\]/g, (fullMatch, target) => {
    const pageId = target.trim();
    const page = pageMap ? pageMap.get(pageId) : null;
    const label = page ? page.title : pageId;
    return `<a href="#" class="${cssClass}" data-wiki-page="${escapeHtmlAttr(pageId)}" title="${escapeHtmlAttr(pageId)}">${escapeHtml(label)}</a>`;
  });
}

/**
 * @param {Array} pages - Wiki 页面列表
 * @returns {Map<string, string[]>} 页面 ID → 引用该页面的来源页面 ID 列表
 */
export function buildBacklinkIndex(pages) {
  const backlinks = new Map();
  if (!Array.isArray(pages)) return backlinks;
  for (const page of pages) {
    if (page && page.id) backlinks.set(page.id, []);
  }
  for (const page of pages) {
    if (!page || !page.content) continue;
    const outlinks = extractWikilinks(page.content);
    for (const target of outlinks) {
      if (!backlinks.has(target)) backlinks.set(target, []);
      backlinks.get(target).push(page.id);
    }
  }
  return backlinks;
}

/**
 * @param {object} page - Wiki 页面对象
 * @returns {string[]} 出链目标列表
 */
export function getOutlinks(page) {
  if (!page || !page.content) return [];
  return extractWikilinks(page.content);
}

/**
 * @param {Array} pages - Wiki 页面列表
 * @returns {Map<string, object>} 页面 ID → 页面对象映射
 */
export function buildPageMap(pages) {
  const map = new Map();
  if (!Array.isArray(pages)) return map;
  for (const page of pages) {
    if (page && page.id) map.set(page.id, page);
  }
  return map;
}

// ==================== 搜索与过滤 ====================

/**
 * @param {object} pages - 页面数据
 * * @param {string} query - 搜索查询
 * * @returns {object[]} 搜索结果
 */
export function searchPages(pages, query) {
  if (!query || !Array.isArray(pages)) return pages || [];
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return pages;
  const scored = [];
  for (const page of pages) {
    if (!page) continue;
    let score = 0;
    if (page.title && page.title.toLowerCase().includes(lowerQuery)) {
      score += 10;
      if (page.title.toLowerCase() === lowerQuery) score += 5;
    }
    if (Array.isArray(page.tags)) {
      for (const tag of page.tags) {
        if (tag && tag.toLowerCase().includes(lowerQuery)) score += 3;
      }
    }
    if (page.content && page.content.toLowerCase().includes(lowerQuery)) score += 1;
    if (score > 0) scored.push({ page, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.page);
}

/**
 * @param {Array} pages - 页面列表
 * @param {string|string[]} types - 类型或类型数组
 * @returns {Array} 过滤后的页面
 */
export function filterByType(pages, types) {
  if (!Array.isArray(pages)) return [];
  const typeSet = new Set(Array.isArray(types) ? types : [types]);
  return pages.filter(page => page && typeSet.has(page.type));
}

/**
 * @param {Array} pages - 页面列表
 * @param {string|string[]} tags - 标签或标签数组
 * @returns {Array} 过滤后的页面
 */
export function filterByTags(pages, tags) {
  if (!Array.isArray(pages)) return [];
  const tagList = Array.isArray(tags) ? tags : [tags];
  const lowerTags = tagList.map(t => t.toLowerCase().trim()).filter(Boolean);
  if (lowerTags.length === 0) return pages;
  return pages.filter(page => {
    if (!page || !Array.isArray(page.tags)) return false;
    const pageTags = page.tags.map(t => t.toLowerCase().trim());
    return lowerTags.some(t => pageTags.includes(t));
  });
}

/**
 * @param {Array} items - 待分页项目
 * * @param {number} page - 页码（1-based）
 * * @param {number} pageSize - 每页大小
 * * @returns {{items: Array, totalPages: number, currentPage: number}}
 */
export function paginate(items, page = 1, pageSize = 20) {
  const total = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: Array.isArray(items) ? items.slice(start, end) : [],
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}