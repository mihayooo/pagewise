/**
 * WikiStore — L3.1 Wiki 浏览模式数据层 (R130 拆分)
 *
 * 纯函数已迁移至 wiki-store-funcs.js，此文件保留 WikiStore 类并 re-export 所有 API。
 *
 * @module wiki-store
 */

// Re-export all pure functions for backward compatibility
export {
  WIKI_PAGE_TYPE,
  PAGE_TYPE_LABELS,
  PAGE_TYPE_ICONS,
  buildPageId,
  parsePageId,
  entityToWikiPage,
  conceptToWikiPage,
  entryToWikiPage,
  extractWikilinks,
  renderWikilinks,
  buildBacklinkIndex,
  getOutlinks,
  buildPageMap,
  searchPages,
  filterByType,
  filterByTags,
  paginate,
} from './wiki-store-funcs.js'

import {
  WIKI_PAGE_TYPE,
  entityToWikiPage,
  conceptToWikiPage,
  entryToWikiPage,
  buildPageMap,
  buildBacklinkIndex,
  getOutlinks,
  searchPages,
  filterByType,
  filterByTags,
  paginate,
  renderWikilinks as _renderWikilinks,
} from './wiki-store-funcs.js'

/**
 * Wiki 数据存储层
 *
 * 聚合来自 AutoClassifier（实体/概念）和 KnowledgeBase（Q&A 条目）的数据，
 * 构建统一的 Wiki 页面视图。
 */
export class WikiStore {
  constructor() {
    this._pageMap = new Map()
    this._backlinkIndex = new Map()
    this._loaded = false
    this._stats = { entityCount: 0, conceptCount: 0, qaCount: 0, total: 0 }
  }

  loadAll(entities, concepts, entries) {
    const pages = []

    if (Array.isArray(entities)) {
      for (const entity of entities) {
        const page = entityToWikiPage(entity)
        if (page) pages.push(page)
      }
    }

    if (Array.isArray(concepts)) {
      for (const concept of concepts) {
        const page = conceptToWikiPage(concept)
        if (page) pages.push(page)
      }
    }

    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const page = entryToWikiPage(entry)
        if (page) pages.push(page)
      }
    }

    this._pageMap = buildPageMap(pages)
    this._backlinkIndex = buildBacklinkIndex(pages)
    this._loaded = true

    const entityCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.ENTITY).length
    const conceptCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.CONCEPT).length
    const qaCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.QA).length

    this._stats = { entityCount, conceptCount, qaCount, total: pages.length }
    return { ...this._stats }
  }

  getAllPages() {
    return [...this._pageMap.values()]
  }

  getPage(pageId) {
    return this._pageMap.get(pageId) || null
  }

  search(query) {
    return searchPages(this.getAllPages(), query)
  }

  getByType(types) {
    return filterByType(this.getAllPages(), types)
  }

  getByTags(tags) {
    return filterByTags(this.getAllPages(), tags)
  }

  getBacklinks(pageId) {
    const linkIds = this._backlinkIndex.get(pageId) || []
    return linkIds.map(id => this._pageMap.get(id)).filter(Boolean)
  }

  getOutlinksFromPage(pageId) {
    const page = this._pageMap.get(pageId)
    if (!page) return []
    const linkIds = getOutlinks(page)
    return linkIds.map(id => this._pageMap.get(id)).filter(Boolean)
  }

  getPaginated(page = 1, pageSize = 20) {
    return paginate(this.getAllPages(), page, pageSize)
  }

  getAllTags() {
    const tagSet = new Set()
    for (const page of this._pageMap.values()) {
      if (Array.isArray(page.tags)) {
        for (const tag of page.tags) tagSet.add(tag)
      }
    }
    return [...tagSet].sort()
  }

  getStats() {
    return { ...this._stats }
  }

  renderWikilinks(text) {
    return _renderWikilinks(text, this._pageMap)
  }

  resolveWikilink(pageId) {
    return this._pageMap.get(pageId) || null
  }

  isLoaded() {
    return this._loaded
  }

  clear() {
    this._pageMap.clear()
    this._backlinkIndex.clear()
    this._loaded = false
    this._stats = { entityCount: 0, conceptCount: 0, qaCount: 0, total: 0 }
  }
}
