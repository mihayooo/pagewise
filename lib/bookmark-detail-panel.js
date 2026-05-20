/**
 * BookmarkDetailPanel — 书签详情面板
 *
 * 点击图谱节点后显示书签详情，支持:
 *   - 书签元数据展示 (标题/URL/文件夹/添加时间)
 *   - 标签编辑 (添加/删除/自动补全)
 *   - 状态标记 (unread/reading/read)
 *   - 相似书签列表 (Top-5)
 *   - 操作回调 (打开URL/编辑标签/标记状态)
 *
 * 设计为纯数据+渲染逻辑，不依赖 DOM，可集成到任意 UI 框架。
 */

import { emitAction, formatDate, formatFolderPath } from './bookmark-detail-panel-helpers.js'

/** 允许的书签状态 */
const VALID_STATUSES = ['unread', 'reading', 'read']

/** 相似书签默认最大数量 */
const DEFAULT_SIMILAR_LIMIT = 5

// ==================== BookmarkDetailPanel ====================

export class BookmarkDetailPanel {
  constructor() {
    this._visible = false
    this._bookmark = null
    this._tags = []
    this._status = 'unread'
    this._similarBookmarks = []
    this._actionCallbacks = []
    this._allTags = []
    this._previousBookmark = null
  }

  // ==================== 核心 API ====================

  show(bookmark, similarBookmarks = []) {
    if (!bookmark || !bookmark.id) {
      return
    }

    if (this._bookmark && this._bookmark.id !== bookmark.id) {
      this._previousBookmark = { ...this._bookmark }
    }

    this._bookmark = { ...bookmark }

    this._tags = Array.isArray(bookmark.tags)
      ? [...bookmark.tags]
      : []

    this._status = VALID_STATUSES.includes(bookmark.status)
      ? bookmark.status
      : 'unread'

    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : []

    this._visible = true

    emitAction(this._actionCallbacks, 'show', {
      bookmarkId: bookmark.id,
      title: bookmark.title,
    })
  }

  hide() {
    this._visible = false
    emitAction(this._actionCallbacks, 'hide', { bookmarkId: this._bookmark?.id || null })
  }

  update(bookmark) {
    if (!bookmark || !bookmark.id) {
      return
    }

    if (!this._bookmark) {
      this.show(bookmark)
      return
    }

    const prevId = this._bookmark.id
    this._bookmark = { ...bookmark }

    if (bookmark.id === prevId) {
      if (Array.isArray(bookmark.tags) && this._tags.length === 0) {
        this._tags = [...bookmark.tags]
      }
      if (VALID_STATUSES.includes(bookmark.status) && this._status === 'unread') {
        this._status = bookmark.status
      }
    } else {
      this._tags = Array.isArray(bookmark.tags)
        ? [...bookmark.tags]
        : []
      this._status = VALID_STATUSES.includes(bookmark.status)
        ? bookmark.status
        : 'unread'
    }

    emitAction(this._actionCallbacks, 'update', {
      bookmarkId: bookmark.id,
      title: bookmark.title,
    })
  }

  onAction(callback) {
    if (typeof callback === 'function') {
      this._actionCallbacks.push(callback)
    }
  }

  // ==================== 标签管理 ====================

  addTag(tag) {
    if (!tag || typeof tag !== 'string') return false

    const normalized = tag.trim().toLowerCase()
    if (!normalized) return false

    if (this._tags.includes(normalized)) return false

    this._tags.push(normalized)
    emitAction(this._actionCallbacks, 'addTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    })
    return true
  }

  removeTag(tag) {
    if (!tag || typeof tag !== 'string') return false

    const normalized = tag.trim().toLowerCase()
    const index = this._tags.indexOf(normalized)
    if (index === -1) return false

    this._tags.splice(index, 1)
    emitAction(this._actionCallbacks, 'removeTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    })
    return true
  }

  getTagSuggestions(input) {
    if (!input || typeof input !== 'string') return []

    const q = input.trim().toLowerCase()
    if (!q) return []

    return this._allTags
      .filter(t => t.includes(q) && !this._tags.includes(t))
      .slice(0, 10)
  }

  setAllTags(tags) {
    this._allTags = Array.isArray(tags)
      ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean)
      : []
  }

  // ==================== 状态管理 ====================

  setStatus(status) {
    if (!VALID_STATUSES.includes(status)) return false
    if (this._status === status) return false

    const prevStatus = this._status
    this._status = status

    emitAction(this._actionCallbacks, 'changeStatus', {
      bookmarkId: this._bookmark?.id || null,
      status,
      prevStatus,
    })
    return true
  }

  getStatus() {
    return this._status
  }

  getValidStatuses() {
    return [...VALID_STATUSES]
  }

  // ==================== 相似书签 ====================

  updateSimilar(similarBookmarks) {
    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : []
  }

  switchToSimilar(bookmarkId) {
    if (!bookmarkId) return null

    const similar = this._similarBookmarks.find(s => s.id === String(bookmarkId))
    if (!similar) return null

    const bookmark = {
      id: similar.id,
      title: similar.title,
      url: similar.url,
      folderPath: [],
      dateAdded: 0,
      dateAddedISO: '',
    }

    emitAction(this._actionCallbacks, 'switchBookmark', {
      fromId: this._bookmark?.id || null,
      toId: bookmarkId,
    })

    return bookmark
  }

  // ==================== URL 操作 ====================

  openUrl() {
    if (!this._bookmark || !this._bookmark.url) return null

    const url = this._bookmark.url

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url })
    }

    emitAction(this._actionCallbacks, 'openUrl', {
      bookmarkId: this._bookmark.id,
      url,
    })

    return url
  }

  // ==================== 查询方法 ====================

  isVisible() {
    return this._visible
  }

  getPanelData() {
    if (!this._bookmark) return null

    return {
      bookmark: { ...this._bookmark },
      tags: [...this._tags],
      status: this._status,
      similarBookmarks: [...this._similarBookmarks],
      visible: this._visible,
      formattedDate: formatDate(this._bookmark.dateAdded),
      formattedFolderPath: formatFolderPath(this._bookmark.folderPath),
    }
  }

  getTags() {
    return [...this._tags]
  }
}
