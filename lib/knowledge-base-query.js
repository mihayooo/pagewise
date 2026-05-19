/**
 * KnowledgeBaseQuery — 知识库查询层
 * 职责: 倒排索引、N-gram 索引、全文搜索、标签/分类/语言查询
 * 继承链: Core ← CRUD ← Query ← Export
 */

import { KnowledgeBaseCRUD } from './knowledge-base-crud.js';

export class KnowledgeBaseQuery extends KnowledgeBaseCRUD {

  // ==================== 倒排索引 ====================

  _extractWords(entry) {
    const text = [
      entry.title || '',
      entry.content || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || '',
      entry.language || '',
      ...(entry.tags || [])
    ].join(' ').toLowerCase();
    return text.split(/[\s,;.!?，。；！？、\-()[\]{}"'""'']+/).filter(Boolean);
  }

  _extractNgrams(entry) {
    const text = [
      entry.title || '',
      entry.content || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || '',
      ...(entry.tags || [])
    ].join(' ').toLowerCase();

    const ngrams = new Set();
    for (let i = 0; i <= text.length - this._ngramSize; i++) {
      const gram = text.substring(i, i + this._ngramSize);
      if (gram.trim().length > 0) {
        ngrams.add(gram);
      }
    }
    return [...ngrams];
  }

  async _buildIndex() {
    const allEntries = await this.getAllEntries(10000);
    this._searchIndex = new Map();
    this._indexWordsById = new Map();
    this._ngramIndex = new Map();
    for (const entry of allEntries) {
      this._addToIndex(entry);
    }
    this._indexBuilt = true;
  }

  _addToIndex(entry) {
    const words = this._extractWords(entry);
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      if (!this._searchIndex.has(word)) {
        this._searchIndex.set(word, new Set());
      }
      this._searchIndex.get(word).add(entry.id);
    }
    this._indexWordsById.set(entry.id, uniqueWords);

    if (this._ngramIndex) {
      const ngrams = this._extractNgrams(entry);
      for (const gram of ngrams) {
        if (!this._ngramIndex.has(gram)) {
          this._ngramIndex.set(gram, new Set());
        }
        this._ngramIndex.get(gram).add(entry.id);
      }
    }
  }

  _removeFromIndex(id) {
    const words = this._indexWordsById.get(id);
    if (!words) return;

    for (const word of words) {
      const ids = this._searchIndex.get(word);
      if (ids) {
        ids.delete(id);
        if (ids.size === 0) {
          this._searchIndex.delete(word);
        }
      }
    }

    if (this._ngramIndex) {
      for (const [gram, ids] of this._ngramIndex) {
        if (ids.has(id)) {
          ids.delete(id);
          if (ids.size === 0) {
            this._ngramIndex.delete(gram);
          }
        }
      }
    }

    this._indexWordsById.delete(id);
  }

  // ==================== ID-only 索引辅助 ====================

  async _getEntriesByIds(ids) {
    if (!ids || ids.size === 0) return new Map();
    await this.ensureInit();

    const result = new Map();
    const idArray = [...ids];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      let completed = 0;
      let hasError = false;

      for (const id of idArray) {
        const request = store.get(id);
        request.onsuccess = (event) => {
          const entry = event.target.result;
          if (entry) {
            result.set(id, entry);
          }
          completed++;
          if (completed === idArray.length) {
            if (!hasError) resolve(result);
          }
        };
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(new Error('批量读取失败'));
          }
        };
      }
    });
  }

  async _getAllEntriesFromIndex() {
    const ids = new Set(this._indexWordsById.keys());
    if (ids.size === 0) return [];
    const entriesMap = await this._getEntriesByIds(ids);
    return [...entriesMap.values()];
  }

  // ==================== 搜索核心 ====================

  _matchesEntry(lowerQuery, entry) {
    return (
      entry.title.toLowerCase().includes(lowerQuery) ||
      entry.content.toLowerCase().includes(lowerQuery) ||
      entry.summary.toLowerCase().includes(lowerQuery) ||
      entry.question.toLowerCase().includes(lowerQuery) ||
      entry.answer.toLowerCase().includes(lowerQuery) ||
      entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  async _fullScanSearch(query, cacheKey) {
    const allEntries = await this.getAllEntries(1000);
    const lowerQuery = query.toLowerCase();
    const result = allEntries.filter(entry => this._matchesEntry(lowerQuery, entry));
    if (cacheKey) this._setCachedSearch(cacheKey, result);
    return result;
  }

  async searchByTag(tag) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('tags');
      const request = index.getAll(tag);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        const err = new Error('搜索失败');
        reject(err);
      };
    });
  }

  async searchByUrl(url) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('sourceUrl');
      const request = index.getAll(url);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        const err = new Error('搜索失败');
        reject(err);
      };
    });
  }

  _searchByNgram(query) {
    if (!this._ngramIndex || query.length < this._ngramSize) return new Set();

    const candidateIds = new Set();
    for (let i = 0; i <= query.length - this._ngramSize; i++) {
      const gram = query.substring(i, i + this._ngramSize);
      const ids = this._ngramIndex.get(gram);
      if (ids) {
        for (const id of ids) candidateIds.add(id);
      }
    }
    return candidateIds;
  }

  async search(query) {
    await this.ensureInit();

    const cacheKey = `search:${query}`;
    const cached = this._getCachedSearch(cacheKey);
    if (cached) return cached;

    const lowerQuery = query.toLowerCase().trim();

    if (lowerQuery.length < 3) {
      return this._fullScanSearch(query, cacheKey);
    }

    if (!this._indexBuilt) {
      await this._buildIndex();
    }

    const candidateIds = new Set();

    const queryWords = lowerQuery.split(/[\s,;.!?，。；！？、\-()[\]{}"'""'']+/).filter(Boolean);
    for (const qWord of queryWords) {
      const ids = this._searchIndex.get(qWord);
      if (ids) {
        for (const id of ids) candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) {
      for (const [word, ids] of this._searchIndex) {
        if (word.includes(lowerQuery) || lowerQuery.includes(word)) {
          for (const id of ids) candidateIds.add(id);
        }
      }
    }

    if (candidateIds.size === 0) {
      const ngramCandidates = this._searchByNgram(lowerQuery);
      if (ngramCandidates.size > 0) {
        for (const id of ngramCandidates) candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) {
      return this._fullScanSearch(query, cacheKey);
    }

    const entriesMap = await this._getEntriesByIds(candidateIds);
    const result = [];
    for (const id of candidateIds) {
      const entry = entriesMap.get(id);
      if (entry && this._matchesEntry(lowerQuery, entry)) {
        result.push(entry);
      }
    }

    this._setCachedSearch(cacheKey, result);
    return result;
  }

  async searchPaged(query, { page = 1, pageSize = 10 } = {}) {
    await this.ensureInit();

    page = Math.max(1, Math.floor(page));
    pageSize = Math.max(1, Math.floor(pageSize));

    if (!query || !query.trim()) {
      return { entries: [], total: 0, page, totalPages: 0 };
    }

    const allResults = await this.search(query);
    const total = allResults.length;

    if (total === 0) {
      return { entries: [], total: 0, page, totalPages: 0 };
    }

    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const entries = allResults.slice(offset, offset + pageSize);

    return { entries, total, page, totalPages };
  }

  // ==================== 统计查询 ====================

  async getAllTags() {
    await this.ensureInit();

    if (this._tagsCache) return this._tagsCache;

    const allEntries = this._indexBuilt
      ? await this._getAllEntriesFromIndex()
      : await this.getAllEntries(10000);
    const tagCount = {};

    allEntries.forEach(entry => {
      (entry.tags || []).forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    const result = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    this._tagsCache = result;
    return result;
  }

  async getAllCategories() {
    await this.ensureInit();

    if (this._categoriesCache) return this._categoriesCache;

    const allEntries = this._indexBuilt
      ? await this._getAllEntriesFromIndex()
      : await this.getAllEntries(10000);
    const catCount = {};

    allEntries.forEach(entry => {
      const cat = entry.category || '未分类';
      catCount[cat] = (catCount[cat] || 0) + 1;
    });

    const result = Object.entries(catCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    this._categoriesCache = result;
    return result;
  }

  async getAllLanguages() {
    await this.ensureInit();

    if (this._languagesCache) return this._languagesCache;

    const allEntries = this._indexBuilt
      ? await this._getAllEntriesFromIndex()
      : await this.getAllEntries(10000);
    const langCount = {};

    allEntries.forEach(entry => {
      const lang = entry.language || 'other';
      langCount[lang] = (langCount[lang] || 0) + 1;
    });

    const result = Object.entries(langCount)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);
    this._languagesCache = result;
    return result;
  }
}
