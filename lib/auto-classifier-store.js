/**
 * AutoClassifierStore — IndexedDB 持久化存储层
 *
 * 从 auto-classifier.js 拆分而来，负责:
 *   - IndexedDB 初始化与连接管理
 *   - 实体/概念的 CRUD 操作
 *   - 分类状态跟踪
 *   - 查询: 按条目/实体/概念的关联查询
 *   - 全量清除
 *
 * @module auto-classifier-store
 */

import { ENTITY_TYPES } from './entity-extractor.js';

/** 分类状态枚举 */
export const CLASSIFICATION_STATUS = {
  UNCLASSIFIED: 'unclassified',
  CLASSIFIED: 'classified',
};

/** 默认 IndexedDB 数据库名 */
const DB_NAME = 'PageWiseAutoClassifier';
/** 数据库版本 */
const DB_VERSION = 1;

/**
 * AutoClassifierStore — 管理分类结果的 IndexedDB 存储
 */
export class AutoClassifierStore {
  constructor() {
    this.db = null;
    this._initPromise = null;
  }

  // ==================== 初始化 ====================

  /** @returns {Promise<void>} */
  async ensureInit() {
    if (this.db) return;
    if (this._initPromise) { await this._initPromise; return; }
    this._initPromise = this._initDB();
    await this._initPromise;
    this._initPromise = null;
  }

  /** @private */
  async _initDB() {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      throw new Error('IndexedDB 不可用');
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('entities')) {
          const s = db.createObjectStore('entities', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name', { unique: true });
          s.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('concepts')) {
          const s = db.createObjectStore('concepts', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name', { unique: true });
        }
        if (!db.objectStoreNames.contains('classification_status')) {
          const s = db.createObjectStore('classification_status', { keyPath: 'entryId' });
          s.createIndex('status', 'status', { unique: false });
        }
      };
      request.onsuccess = (event) => { this.db = event.target.result; resolve(); };
      request.onerror = (event) => { reject(new Error(`打开数据库失败: ${event.target.error}`)); };
    });
  }

  // ==================== 写入操作 ====================

  /**
   * 查找或创建实体（同名自动合并 entryIds）
   * @param {string} name
   * @param {string} type
   * @param {string} description
   * @param {number} entryId
   * @returns {Promise<Object>}
   */
  async findOrCreateEntity(name, type, description, entryId) {
    await this.ensureInit();
    const normalizedName = name.toLowerCase().trim();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readwrite');
      const store = tx.objectStore('entities');
      const index = store.index('name');
      const request = index.get(normalizedName);
      request.onsuccess = () => {
        const existing = request.result;
        if (existing) {
          const entryIds = new Set(existing.entryIds || []);
          entryIds.add(entryId);
          const updated = { ...existing, entryIds: [...entryIds], description: description || existing.description, updatedAt: new Date().toISOString() };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(new Error('更新实体失败'));
        } else {
          const record = { name: normalizedName, displayName: name, type: type || ENTITY_TYPES.OTHER, description: description || '', entryIds: [entryId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          const addReq = store.add(record);
          addReq.onsuccess = () => resolve({ ...record, id: addReq.result });
          addReq.onerror = () => reject(new Error('创建实体失败'));
        }
      };
      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  /**
   * 查找或创建概念（同名自动合并 entryIds）
   */
  async findOrCreateConcept(name, description, entryId) {
    await this.ensureInit();
    const normalizedName = name.toLowerCase().trim();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readwrite');
      const store = tx.objectStore('concepts');
      const index = store.index('name');
      const request = index.get(normalizedName);
      request.onsuccess = () => {
        const existing = request.result;
        if (existing) {
          const entryIds = new Set(existing.entryIds || []);
          entryIds.add(entryId);
          const updated = { ...existing, entryIds: [...entryIds], description: description || existing.description, updatedAt: new Date().toISOString() };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(new Error('更新概念失败'));
        } else {
          const record = { name: normalizedName, displayName: name, description: description || '', entryIds: [entryId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          const addReq = store.add(record);
          addReq.onsuccess = () => resolve({ ...record, id: addReq.result });
          addReq.onerror = () => reject(new Error('创建概念失败'));
        }
      };
      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  /**
   * 更新条目的分类状态
   */
  async updateClassificationStatus(entryId, status) {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('classification_status', 'readwrite');
      const store = tx.objectStore('classification_status');
      const record = { entryId, status, classifiedAt: new Date().toISOString() };
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('更新分类状态失败'));
    });
  }

  // ==================== 查询操作 ====================

  async getEntitiesByEntry(entryId) {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const request = store.getAll();
      request.onsuccess = () => {
        const matching = (request.result || []).filter(e => e.entryIds && e.entryIds.includes(entryId));
        resolve(matching);
      };
      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  async getConceptsByEntry(entryId) {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const request = store.getAll();
      request.onsuccess = () => {
        const matching = (request.result || []).filter(c => c.entryIds && c.entryIds.includes(entryId));
        resolve(matching);
      };
      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  async getEntriesByEntity(entityName) {
    await this.ensureInit();
    const normalized = entityName.toLowerCase().trim();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const index = store.index('name');
      const request = index.get(normalized);
      request.onsuccess = () => {
        const entity = request.result;
        resolve(entity ? [...(entity.entryIds || [])] : []);
      };
      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  async getEntriesByConcept(conceptName) {
    await this.ensureInit();
    const normalized = conceptName.toLowerCase().trim();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const index = store.index('name');
      const request = index.get(normalized);
      request.onsuccess = () => {
        const concept = request.result;
        resolve(concept ? [...(concept.entryIds || [])] : []);
      };
      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  async getAllEntities() {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('获取实体列表失败'));
    });
  }

  async getAllConcepts() {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('获取概念列表失败'));
    });
  }

  async getClassificationStatus(entryId) {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('classification_status', 'readonly');
      const store = tx.objectStore('classification_status');
      const request = store.get(entryId);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.status : CLASSIFICATION_STATUS.UNCLASSIFIED);
      };
      request.onerror = () => reject(new Error('查询分类状态失败'));
    });
  }

  // ==================== 批量操作 ====================

  async clearAll() {
    await this.ensureInit();
    for (const storeName of ['entities', 'concepts', 'classification_status']) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`清除 ${storeName} 失败`));
      });
    }
  }
}
