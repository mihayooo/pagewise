/**
 * KnowledgeBaseCore — 知识库核心层
 * 职责: 构造器、初始化、缓存管理、索引预热
 * 继承链: Core ← CRUD ← Query ← Export
 */

import { classifyStorageError } from './error-handler.js';

export class KnowledgeBaseCore {
  constructor() {
    this.dbName = 'AIAssistantKnowledgeBase';
    this.dbVersion = 2;
    this.db = null;
    // 性能优化：LRU 搜索缓存（最多 10 条）
    this._searchCache = new Map();
    this._searchCacheMaxSize = 10;
    // 标签/分类/语言统计缓存
    this._tagsCache = null;
    this._categoriesCache = null;
    this._languagesCache = null;
    // 倒排索引（惰性构建）
    this._searchIndex = null;
    this._indexBuilt = false;
    this._indexWordsById = new Map();
    // N-gram 索引（惰性构建，优化子串搜索）
    this._ngramIndex = null;
    this._ngramSize = 3;
    // 条目总数缓存
    this._entryCount = null;
    // 聚合统计缓存
    this._aggregationsCache = null;
    // 查询结果缓存层（带 TTL 的通用 LRU 缓存，R105）
    this._queryCache = new Map();
    this._queryCacheMaxSize = 50;
    this._queryCacheTTL = 60_000;
  }

  /**
   * 初始化数据库
   */
  async init() {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      throw new Error('存储不可用，请检查浏览器设置');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('sourceUrl', 'sourceUrl', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('tags', 'tags', { multiEntry: true });
          store.createIndex('category', 'category', { unique: false });
        }

        if (oldVersion < 2 && db.objectStoreNames.contains('entries')) {
          const tx = event.target.transaction;
          const store = tx.objectStore('entries');
          const existingIndexes = store.indexNames;

          if (!existingIndexes.contains('title_createdAt')) {
            store.createIndex('title_createdAt', ['title', 'createdAt'], { unique: false });
          }
          if (!existingIndexes.contains('category_createdAt')) {
            store.createIndex('category_createdAt', ['category', 'createdAt'], { unique: false });
          }
          if (!existingIndexes.contains('tags_createdAt')) {
            store.createIndex('tags_createdAt', ['tags', 'createdAt'], { unique: false });
          }
        }

        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', {
            keyPath: 'id',
            autoIncrement: true
          });
          convStore.createIndex('sourceUrl', 'sourceUrl', { unique: false });
          convStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        const err = event.target.error;
        let errorMsg;
        if (err && err.name === 'QuotaExceededError') {
          errorMsg = '存储空间不足';
        } else {
          errorMsg = `存储不可用，请检查浏览器设置: ${err}`;
        }
        const storageError = new Error(errorMsg);
        storageError.classified = classifyStorageError(storageError);
        reject(storageError);
      };
    });
  }

  async ensureInit() {
    if (!this.db) await this.init();
  }

  async warmUpIndex() {
    await this.ensureInit();
    if (!this._indexBuilt) {
      await this._buildIndex();
    }
  }

  _invalidateCaches() {
    this._searchCache.clear();
    this._tagsCache = null;
    this._categoriesCache = null;
    this._languagesCache = null;
    this._entryCount = null;
    this._aggregationsCache = null;
    this._clearQueryCache();
  }

  _getCachedSearch(key) {
    if (!this._searchCache.has(key)) return undefined;
    const value = this._searchCache.get(key);
    this._searchCache.delete(key);
    this._searchCache.set(key, value);
    return value;
  }

  _setCachedSearch(key, value) {
    if (this._searchCache.has(key)) {
      this._searchCache.delete(key);
    } else if (this._searchCache.size >= this._searchCacheMaxSize) {
      const oldest = this._searchCache.keys().next().value;
      this._searchCache.delete(oldest);
    }
    this._searchCache.set(key, value);
  }

  _getQueryCache(key) {
    if (!this._queryCache.has(key)) return undefined;
    const entry = this._queryCache.get(key);
    if (Date.now() > entry.expiresAt) {
      this._queryCache.delete(key);
      return undefined;
    }
    this._queryCache.delete(key);
    this._queryCache.set(key, entry);
    return entry.value;
  }

  _setQueryCache(key, value, ttl) {
    const expiresAt = Date.now() + (ttl || this._queryCacheTTL);
    if (this._queryCache.has(key)) {
      this._queryCache.delete(key);
    } else if (this._queryCache.size >= this._queryCacheMaxSize) {
      const oldest = this._queryCache.keys().next().value;
      this._queryCache.delete(oldest);
    }
    this._queryCache.set(key, { value, expiresAt });
  }

  _clearQueryCache() {
    this._queryCache.clear();
  }

  getQueryCacheStats() {
    return {
      size: this._queryCache.size,
      maxSize: this._queryCacheMaxSize,
      ttl: this._queryCacheTTL,
    };
  }
}
