/**
 * BookmarkSmartCollections — 智能集合引擎
 *
 * 基于规则的动态集合，自动将符合规则的书签归入集合。
 * R203: 规则匹配 → bookmark-smart-collections-matchers.js
 *
 * 纯数据模块，不依赖 DOM 或 Chrome API。
 */

import { BOOKMARK_I18N_KEYS, bookmarkZhCN, bookmarkEnUS } from './bookmark-i18n.js'
import { t as i18nT, registerLocale } from './i18n.js'
import { evaluateRules, bookmarkMatchesRules, matchesRule } from './bookmark-smart-collections-matchers.js'

// Re-export matchers for backward compatibility
export { evaluateRules, bookmarkMatchesRules, matchesRule }

/** @type {string[]} 合法规则类型 */
export const VALID_RULE_TYPES = ['tags', 'domain', 'folder', 'status', 'dateRange', 'category'];

/** @type {string[]} 合法状态值 */
export const VALID_STATUSES = ['unread', 'reading', 'read'];

class BookmarkSmartCollections {
  /** @type {Map<string, Object>} id → bookmark */
  #bookmarkMap = new Map();

  /** @type {Map<string, Object>} collectionId → collection */
  #collections = new Map();

  /** @type {number} 自增 ID */
  #nextId = 1;

  constructor(bookmarks = [], savedCollections = []) {
    if (!Array.isArray(bookmarks)) throw new TypeError('bookmarks must be an array');
    for (const bm of bookmarks) {
      if (bm && bm.id) this.#bookmarkMap.set(String(bm.id), bm);
    }
    for (const bc of BUILTIN_COLLECTIONS) {
      this.#collections.set(bc.id, { ...bc });
    }
    if (Array.isArray(savedCollections)) {
      for (const sc of savedCollections) {
        if (sc && sc.id && sc.name && Array.isArray(sc.rules)) {
          this.#collections.set(sc.id, { ...sc, builtin: false, createdAt: sc.createdAt || Date.now() });
          const numPart = parseInt(sc.id.replace('custom-', ''), 10);
          if (!isNaN(numPart) && numPart >= this.#nextId) this.#nextId = numPart + 1;
        }
      }
    }
  }

  // ==================== 集合管理 ====================

  createCollection(name, rules) {
    if (!name || typeof name !== 'string') throw new Error('name must be a non-empty string');
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('rules must be a non-empty array');
    for (const rule of rules) this.#validateRule(rule);
    const id = `custom-${this.#nextId++}`;
    const collection = { id, name: name.trim(), rules, builtin: false, createdAt: Date.now() };
    this.#collections.set(id, collection);
    return { ...collection };
  }

  deleteCollection(collectionId) {
    const col = this.#collections.get(collectionId);
    if (!col) return false;
    if (col.builtin) return false;
    this.#collections.delete(collectionId);
    return true;
  }

  updateCollection(collectionId, updates) {
    const col = this.#collections.get(collectionId);
    if (!col || col.builtin) return null;
    if (updates.name) col.name = updates.name.trim();
    if (updates.rules) {
      for (const rule of updates.rules) this.#validateRule(rule);
      col.rules = updates.rules;
    }
    return { ...col };
  }

  getCollection(collectionId) {
    const col = this.#collections.get(collectionId);
    return col ? { ...col } : null;
  }

  listCollections() {
    return [...this.#collections.values()].map(c => ({ ...c }));
  }

  // ==================== 查询匹配 ====================

  getCollectionBookmarks(collectionId) {
    const col = this.#collections.get(collectionId);
    if (!col) return [];
    return evaluateRules(this.#bookmarkMap, col.rules);
  }

  getBookmarkCollections(bookmarkId) {
    const bm = this.#bookmarkMap.get(String(bookmarkId));
    if (!bm) return [];
    const result = [];
    for (const col of this.#collections.values()) {
      if (bookmarkMatchesRules(bm, col.rules)) result.push({ ...col });
    }
    return result;
  }

  getCollectionStats() {
    const result = [];
    for (const col of this.#collections.values()) {
      const bookmarks = evaluateRules(this.#bookmarkMap, col.rules);
      result.push({ collection: { ...col }, count: bookmarks.length });
    }
    return result;
  }

  // ==================== 书签更新 ====================

  addBookmark(bookmark) {
    if (bookmark && bookmark.id) this.#bookmarkMap.set(String(bookmark.id), bookmark);
  }

  removeBookmark(bookmarkId) {
    return this.#bookmarkMap.delete(String(bookmarkId));
  }

  setBookmarks(bookmarks) {
    this.#bookmarkMap.clear();
    for (const bm of bookmarks) {
      if (bm && bm.id) this.#bookmarkMap.set(String(bm.id), bm);
    }
  }

  // ==================== 序列化 ====================

  exportCollections() {
    return [...this.#collections.values()].filter(c => !c.builtin).map(c => ({ ...c }));
  }

  // ==================== 内部方法 ====================

  #validateRule(rule) {
    if (!rule || typeof rule !== 'object') throw new Error('rule must be an object');
    if (!VALID_RULE_TYPES.includes(rule.type)) throw new Error(`invalid rule type: ${rule.type}. Must be one of: ${VALID_RULE_TYPES.join(', ')}`);
    if (rule.value === undefined || rule.value === null) throw new Error('rule.value is required');
    if (rule.type === 'status' && !VALID_STATUSES.includes(rule.value)) throw new Error(`invalid status: ${rule.value}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    if ((rule.type === 'tags' || rule.type === 'folder') && !Array.isArray(rule.value)) throw new Error(`${rule.type} rule value must be an array`);
    if (rule.type === 'dateRange') {
      if (typeof rule.value !== 'object' || (rule.value.start === null && rule.value.end === null)) throw new Error('dateRange rule must have start and/or end timestamp');
    }
  }
}

// ==================== 内置集合定义 ====================

const NOW = Date.now();
const ONE_DAY = 86400000;
const ONE_WEEK = 7 * ONE_DAY;

let _bookmarkLocaleRegistered = false
function _ensureLocale() {
  if (!_bookmarkLocaleRegistered) {
    registerLocale('zh-CN', bookmarkZhCN)
    registerLocale('en-US', bookmarkEnUS)
    _bookmarkLocaleRegistered = true
  }
}

function bt(key) {
  _ensureLocale()
  const i18nKey = BOOKMARK_I18N_KEYS[key]
  return i18nKey ? i18nT(i18nKey) : key
}

export const BUILTIN_COLLECTIONS = [
  { id: 'builtin-unread', name: bt('collection.unread'), rules: [{ type: 'status', value: 'unread' }], builtin: true, createdAt: NOW },
  { id: 'builtin-reading', name: bt('collection.reading'), rules: [{ type: 'status', value: 'reading' }], builtin: true, createdAt: NOW },
  { id: 'builtin-recent', name: bt('collection.recent'), rules: [{ type: 'dateRange', value: { start: NOW - ONE_WEEK } }], builtin: true, createdAt: NOW },
];

export { BookmarkSmartCollections };
