/**
 * ContextRetriever — 知识检索层
 *
 * 封装知识检索逻辑，统一从 BookmarkSemanticSearch（语义搜索）
 * 和 KnowledgeBaseQuery（全文搜索）获取与查询相关的条目。
 *
 * 优先级：hybridSearch → fullTextSearch → 空（静默降级）
 *
 * @module lib/context-retriever
 */

import { sanitizeContent } from './ai-client-context.js'

/**
 * @typedef {Object} RetrieveOptions
 * @property {number} [limit=3]      — 返回条目数
 * @property {number} [minScore=0.1] — 最低相关度阈值
 * @property {number} [maxLength=2000] — 注入内容总字符数上限
 */

/**
 * @typedef {Object} ContextItem
 * @property {string} title   — 条目标题
 * @property {string} summary — 摘要片段
 * @property {string} url     — 来源 URL
 * @property {number} score   — 相关度分数
 * @property {string} source  — 数据来源标识
 */

export class ContextRetriever {
  /**
   * @param {Object} [options]
   * @param {Object} [options.semanticSearch] — BookmarkSemanticSearch 实例
   * @param {Object} [options.knowledgeQuery] — KnowledgeBaseQuery 实例
   * @param {number} [options.timeoutMs=500]  — 检索超时毫秒数
   */
  constructor(options = {}) {
    this._semanticSearch = options.semanticSearch || null
    this._knowledgeQuery = options.knowledgeQuery || null
    this._timeoutMs = options.timeoutMs || 500
  }

  /**
   * 统一检索接口 — 从知识库获取与查询相关的条目
   *
   * @param {string} query
   * @param {RetrieveOptions} [options]
   * @returns {Promise<ContextItem[]>}
   */
  async retrieveContext(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return []
    }

    const {
      limit = 3,
      minScore = 0.1,
      maxLength = 2000,
    } = options

    let results = []

    // 优先级 1: 语义混合搜索
    results = await this._tryWithTimeout(
      () => this._searchSemantic(query, { limit, minScore })
    )

    // 优先级 2: 知识库全文搜索降级
    if (results.length === 0) {
      results = await this._searchKnowledgeBase(query, { limit })
    }

    // 按 maxLength 截断总内容
    return this._enforceMaxLength(results, maxLength)
  }

  /**
   * 获取当前页面关联的已存书签
   *
   * @param {string} url — 页面 URL
   * @param {Object} [options]
   * @param {number} [options.limit=3]
   * @returns {Promise<ContextItem[]>}
   */
  async getPageBookmarks(url, options = {}) {
    if (!url || !this._knowledgeQuery) return []

    const { limit = 3 } = options

    try {
      const results = await this._knowledgeQuery.searchByUrl(url)
      return (results || []).slice(0, limit).map(item => this._formatItem(item, 'knowledge-base'))
    } catch (e) {
      console.warn('[ContextRetriever]', e?.message || e);
      return []
    }
  }

  /**
   * 术语解释专用检索 — 针对短文本优化
   *
   * @param {string} term — 术语文本
   * @param {Object} [options]
   * @param {number} [options.limit=2]
   * @returns {Promise<ContextItem[]>}
   */
  async retrieveForTerm(term, options = {}) {
    if (!term || typeof term !== 'string' || term.trim().length < 2) {
      return []
    }

    const { limit = 2 } = options
    const enrichedQuery = `${term} definition explanation`

    return this.retrieveContext(enrichedQuery, { limit, minScore: 0.05, maxLength: 1000 })
  }

  // ==================== 内部方法 ====================

  /**
   * 带超时的异步调用包装
   * @private
   */
  async _tryWithTimeout(fn) {
    try {
      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve([]), this._timeoutMs)
      )
      const result = await Promise.race([fn(), timeoutPromise])
      return Array.isArray(result) ? result : []
    } catch (e) {
      console.warn('[ContextRetriever]', e?.message || e);
      return []
    }
  }

  /**
   * 语义搜索（带 minScore 过滤）
   * @private
   */
  async _searchSemantic(query, { limit, minScore }) {
    if (!this._semanticSearch) return []

    const rawResults = await this._semanticSearch.hybridSearch(query, { limit })

    return (rawResults || [])
      .filter(r => r.score >= minScore)
      .slice(0, limit)
      .map(r => this._formatItem(r.bookmark || r, 'semantic-search', r.score))
  }

  /**
   * 知识库全文搜索降级
   * @private
   */
  async _searchKnowledgeBase(query, { limit }) {
    if (!this._knowledgeQuery) return []

    try {
      const rawResults = await this._knowledgeQuery.search(query)
      return (rawResults || [])
        .slice(0, limit)
        .map(item => this._formatItem(item, 'knowledge-base'))
    } catch (e) {
      console.warn('[ContextRetriever]', e?.message || e);
      return []
    }
  }

  /**
   * 格式化搜索结果为统一 ContextItem
   * @private
   */
  _formatItem(raw, source, score = 0.5) {
    const contentPreview = raw.contentPreview || raw.content || raw.summary || ''
    return {
      title: sanitizeContent(raw.title || '未知标题'),
      summary: sanitizeContent(
        (raw.summary || contentPreview || '').slice(0, 300)
      ),
      url: raw.url || '',
      score,
      source,
    }
  }

  /**
   * 按总字符数上限截断结果列表
   * @private
   */
  _enforceMaxLength(results, maxLength) {
    if (!maxLength || maxLength <= 0) return results

    const output = []
    let totalLen = 0

    for (const item of results) {
      const itemLen = (item.title || '').length + (item.summary || '').length
      if (totalLen + itemLen > maxLength && output.length > 0) {
        break
      }
      output.push(item)
      totalLen += itemLen
    }

    return output
  }
}
