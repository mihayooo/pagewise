/**
 * KnowledgeBaseCRUD — 知识库 CRUD 层（编排层）
 *
 * R280: 从原 383 行拆分为:
 *   - knowledge-base-crud.js — 单条 CRUD 操作 + 去重 + 分页（编排层）
 *   - knowledge-base-crud-batch.js — 批量操作 + 对话历史
 *
 * 继承链: Core ← CRUD ← Query ← Export
 */

import { classifyStorageError } from './error-handler.js';
import { KnowledgeBaseCore } from './knowledge-base-core.js';
import { withCursorPaging } from './knowledge-base-cursor.js';
import { withBatchOperations } from './knowledge-base-crud-batch.js';

// R277: 游标分页查询方法通过 mixin 注入
// R280: 批量操作方法通过 mixin 注入
export const KnowledgeBaseCRUD = withBatchOperations(withCursorPaging(class extends KnowledgeBaseCore {
  /**
   * 查找重复条目
   */
  async findDuplicate(entry) {
    const normTitle = (entry.title || '').trim().toLowerCase();
    const normQuestion = (entry.question || '').trim().toLowerCase();
    const normAnswer = (entry.answer || '').trim().toLowerCase();

    let candidates;
    if (this._indexBuilt) {
      const candidateIds = new Set();
      const words = this._extractWords(entry);
      for (const word of new Set(words)) {
        const ids = this._searchIndex.get(word);
        if (ids) {
          for (const id of ids) candidateIds.add(id);
        }
      }
      if (candidateIds.size > 0) {
        const entriesMap = await this._getEntriesByIds(candidateIds);
        candidates = [...entriesMap.values()];
      } else {
        candidates = await this.getAllEntries(10000);
      }
    } else {
      candidates = await this.getAllEntries(10000);
    }

    for (const existing of candidates) {
      const exTitle = (existing.title || '').trim().toLowerCase();
      const exQuestion = (existing.question || '').trim().toLowerCase();
      const exAnswer = (existing.answer || '').trim().toLowerCase();

      if (normTitle && normTitle === exTitle) return existing;
      if (normQuestion && normQuestion.length > 10 && normQuestion === exQuestion) return existing;
      if (normAnswer && normAnswer.length > 50 && normAnswer.slice(0, 200) === exAnswer.slice(0, 200)) return existing;
    }

    return null;
  }

  async saveEntry(entry) {
    await this.ensureInit();

    const duplicate = await this.findDuplicate(entry);
    if (duplicate) {
      return { duplicate: true, existing: duplicate };
    }

    const record = {
      title: entry.title || '未命名',
      content: entry.content || '',
      summary: entry.summary || '',
      sourceUrl: entry.sourceUrl || '',
      sourceTitle: entry.sourceTitle || '',
      tags: entry.tags || [],
      category: entry.category || '未分类',
      question: entry.question || '',
      answer: entry.answer || '',
      language: entry.language || 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.add(record);

      request.onsuccess = () => {
        const savedEntry = { ...record, id: request.result };
        if (this._indexBuilt) {
          this._addToIndex(savedEntry);
        }
        this._invalidateCaches();
        resolve(savedEntry);
      };
      request.onerror = () => {
        const err = new Error('保存失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async updateEntry(id, updates) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          reject(new Error('条目不存在'));
          return;
        }

        const updated = {
          ...record,
          ...updates,
          updatedAt: new Date().toISOString()
        };

        const putReq = store.put(updated);
        putReq.onsuccess = () => {
          if (this._indexBuilt) {
            this._removeFromIndex(record.id);
            this._addToIndex(updated);
          }
          this._invalidateCaches();
          resolve(updated);
        };
        putReq.onerror = () => {
          const err = new Error('更新失败');
          err.classified = classifyStorageError(err);
          reject(err);
        };
      };

      getReq.onerror = () => {
        const err = new Error('读取失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async deleteEntry(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.delete(id);

      request.onsuccess = () => {
        if (this._indexBuilt) {
          this._removeFromIndex(id);
        }
        this._invalidateCaches();
        resolve(true);
      };
      request.onerror = () => {
        const err = new Error('删除失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async getEntry(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        const err = new Error('读取失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async getAllEntries(limit = 100, offset = 0) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('createdAt');
      const results = [];

      const request = index.openCursor(null, 'prev');
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }

        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }

        results.push(cursor.value);
        cursor.continue();
      };

      request.onerror = () => {
        const err = new Error('查询失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async getTotalCount() {
    await this.ensureInit();

    if (this._entryCount !== null) return this._entryCount;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const request = store.count();

      request.onsuccess = () => {
        this._entryCount = request.result || 0;
        resolve(this._entryCount);
      };
      request.onerror = () => {
        const err = new Error('获取条目数量失败');
        err.classified = classifyStorageError(err);
        reject(err);
      };
    });
  }

  async getEntriesPaged({ page = 1, pageSize = 10 } = {}) {
    await this.ensureInit();

    page = Math.max(1, Math.floor(page));
    pageSize = Math.max(1, Math.floor(pageSize));

    const total = await this.getTotalCount();

    if (total === 0) {
      return { entries: [], total: 0, page, totalPages: 0 };
    }

    const totalPages = Math.ceil(total / pageSize);

    if (page > totalPages) {
      return { entries: [], total, page, totalPages };
    }

    const offset = (page - 1) * pageSize;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('createdAt');
      const results = [];

      const request = index.openCursor(null, 'prev');
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= pageSize) {
          resolve({ entries: results, total, page, totalPages });
          return;
        }

        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }

        results.push(cursor.value);
        cursor.continue();
      };

      request.onerror = () => reject(new Error('分页查询失败'));
    });
  }
}));
