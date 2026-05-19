/**
 * BookmarkKnowledgeCorrelation — 关联计算子模块
 *
 * 从 bookmark-knowledge-link.js 拆分，负责:
 *   - URL 匹配计算
 *   - 标题语义相似度计算
 *   - 标签重叠度 (Jaccard)
 *   - 综合关联度计算
 *
 * @module lib/bookmark-knowledge-link-scorer
 */

/** URL 精确匹配权重 */
export const URL_MATCH_WEIGHT = 0.4

/** 标题语义相似度权重 */
export const TITLE_SIMILARITY_WEIGHT = 0.3

/** 标签重叠度权重 */
export const TAG_OVERLAP_WEIGHT = 0.3

/** 关联阈值 — 低于此值不认为有关联 */
export const CORRELATION_THRESHOLD = 0.15

/** 建议阈值 — 建议中的最低关联度 */
export const SUGGESTION_THRESHOLD = 0.2

/**
 * URL 规范化 — 移除协议/www/尾斜杠/fragment，转小写
 *
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return ''
  try {
    const u = new URL(url)
    let normalized = u.hostname.replace(/^www\./, '') + u.pathname
    normalized = normalized.replace(/\/+$/, '').toLowerCase()
    return normalized
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
  }
}

/**
 * 标签规范化 — 小写、去首尾空格
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  if (!tag || typeof tag !== 'string') return ''
  return tag.trim().toLowerCase()
}

/**
 * URL 匹配: 比较书签 URL 和条目 sourceUrl 的规范化形式
 *
 * @param {Object} bookmark
 * @param {Object} entry
 * @returns {number} 0 or 1
 */
export function computeUrlMatch(bookmark, entry, _normalizeUrlFn = normalizeUrl) {
  const bmUrl = _normalizeUrlFn(bookmark.url || '')
  const entryUrl = _normalizeUrlFn(entry.sourceUrl || '')

  if (!bmUrl || !entryUrl) return 0

  if (bmUrl === entryUrl) return 1

  if (bmUrl.startsWith(entryUrl + '/') || entryUrl.startsWith(bmUrl + '/')) return 0.7

  const bmDomain = bmUrl.split('/')[0]
  const entryDomain = entryUrl.split('/')[0]
  if (bmDomain === entryDomain && bmDomain.length > 0) return 0.3

  return 0
}

/**
 * 标题语义相似度 — 基于 EmbeddingEngine 的 TF-IDF 余弦相似度
 *
 * @param {Object} bookmark
 * @param {Object} entry
 * @param {Object} embeddingEngine
 * @returns {number} 0-1
 */
export function computeTitleSimilarity(bookmark, entry, embeddingEngine) {
  const bmText = [bookmark.title || '', (bookmark.contentPreview || '')].join(' ')
  const entryText = [entry.title || '', entry.question || '', (entry.summary || '')].join(' ')

  if (!bmText.trim() || !entryText.trim()) return 0

  try {
    const bmVec = embeddingEngine.generateVector(bmText)
    const entryVec = embeddingEngine.generateVector(entryText)

    if (bmVec.size === 0 || entryVec.size === 0) return 0

    return embeddingEngine.cosineSimilarity(bmVec, entryVec)
  } catch {
    return 0
  }
}

/**
 * 标签重叠度 — Jaccard 系数
 *
 * @param {Object} bookmark
 * @param {Object} entry
 * @returns {number} 0-1
 */
export function computeTagOverlap(bookmark, entry, _normalizeTagFn = normalizeTag) {
  const bmTags = new Set(
    (bookmark.tags || []).map(t => _normalizeTagFn(t)).filter(Boolean)
  )
  const entryTags = new Set(
    (entry.tags || []).map(t => _normalizeTagFn(t)).filter(Boolean)
  )

  if (bmTags.size === 0 || entryTags.size === 0) return 0

  let intersection = 0
  for (const tag of bmTags) {
    if (entryTags.has(tag)) intersection++
  }

  const union = bmTags.size + entryTags.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * 计算单个书签-条目对的关联强度
 *
 * @param {Object} bookmark
 * @param {Object} entry
 * @param {Object} embeddingEngine
 * @returns {{ urlMatch: number, titleSimilarity: number, tagOverlap: number, total: number }}
 */
export function computeCorrelation(bookmark, entry, embeddingEngine) {
  const urlMatch = computeUrlMatch(bookmark, entry)
  const titleSimilarity = computeTitleSimilarity(bookmark, entry, embeddingEngine)
  const tagOverlap = computeTagOverlap(bookmark, entry)

  const total = urlMatch * URL_MATCH_WEIGHT
              + titleSimilarity * TITLE_SIMILARITY_WEIGHT
              + tagOverlap * TAG_OVERLAP_WEIGHT

  return {
    urlMatch: Math.round(urlMatch * 1000) / 1000,
    titleSimilarity: Math.round(titleSimilarity * 1000) / 1000,
    tagOverlap: Math.round(tagOverlap * 1000) / 1000,
    total: Math.round(total * 1000) / 1000,
  }
}
