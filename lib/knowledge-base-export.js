/**
 * KnowledgeBaseExport — 知识库导出与高级查询层
 * 职责: 导出、统计、关联查询、聚合查询、复合索引查询
 * 继承链: Core ← CRUD ← Query ← Export
 */

import { KnowledgeBaseQuery } from './knowledge-base-query.js';
import {
  bigrams as _bigrams,
  calculateSimilarity as _calcSim,
  getEntryCompareText as _getECT,
  getSearchCompareText as _getSCT,
  semanticSearch as _semanticSearch,
  getSearchSuggestions as _getSuggestions,
  getMatchedFields as _getMatched,
} from './knowledge-base-text-utils.js';

export class KnowledgeBaseExport extends KnowledgeBaseQuery {

  // ==================== 静态方法（向后兼容） ====================

  static bigrams(text) { return _bigrams(text); }
  static calculateSimilarity(t1, t2) { return _calcSim(t1, t2); }
  static getEntryCompareText(entry) { return _getECT(entry); }
  static getSearchCompareText(entry) { return _getSCT(entry); }
  static semanticSearch(query, entries, limit) { return _semanticSearch(query, entries, limit); }
  static getSearchSuggestions(query, entries, limit) { return _getSuggestions(query, entries, limit); }
  static getMatchedFields(query, entry) { return _getMatched(query, entry); }

  // ==================== 聚合统计 ====================

  async getAggregations() {
    await this.ensureInit();
    if (this._aggregationsCache) return this._aggregationsCache;
    const allEntries = this._indexBuilt ? await this._getAllEntriesFromIndex() : await this.getAllEntries(10000);
    const tagCount = {}, catCount = {}, langCount = {};
    allEntries.forEach(entry => {
      (entry.tags || []).forEach(tag => { tagCount[tag] = (tagCount[tag] || 0) + 1; });
      catCount[entry.category || '未分类'] = (catCount[entry.category || '未分类'] || 0) + 1;
      langCount[entry.language || 'other'] = (langCount[entry.language || 'other'] || 0) + 1;
    });
    const sort = (obj) => Object.entries(obj).map(([k, c]) => ({ [k === 'tag' ? 'tag' : Object.keys({k})[0]]: k, count: c })).sort((a, b) => b.count - a.count);
    const tags = Object.entries(tagCount).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    const categories = Object.entries(catCount).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
    const languages = Object.entries(langCount).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count);
    const result = { tags, categories, languages };
    this._aggregationsCache = result;
    return result;
  }

  // ==================== 高效分页 ====================

  async getEntriesPagedByKey({ pageSize = 10, lastCreatedAt = null, lastId = null } = {}) {
    await this.ensureInit();
    pageSize = Math.max(1, Math.floor(pageSize));
    const total = await this.getTotalCount();
    if (total === 0) return { entries: [], total: 0, hasMore: false };
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const index = tx.objectStore('entries').index('createdAt');
      const results = [];
      const request = lastCreatedAt ? index.openCursor(IDBKeyRange.upperBound(lastCreatedAt, false), 'prev') : index.openCursor(null, 'prev');
      let skipped = false;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= pageSize) { resolve({ entries: results, total, hasMore: results.length >= pageSize }); return; }
        if (lastCreatedAt && lastId && !skipped) {
          if (cursor.value.createdAt === lastCreatedAt && cursor.value.id === lastId) { cursor.continue(); return; }
          skipped = true;
        }
        results.push(cursor.value); cursor.continue();
      };
      request.onerror = () => reject(new Error('键游标分页查询失败'));
    });
  }

  async getEntriesPagedByKeyFiltered({ pageSize = 10, tag = null, language = null, lastCreatedAt = null, lastId = null } = {}) {
    await this.ensureInit();
    pageSize = Math.max(1, Math.floor(pageSize));
    const total = await this.getTotalCount();
    if (total === 0) return { entries: [], total: 0, hasMore: false };

    if (tag) {
      return new Promise((resolve, reject) => {
        const request = this.db.transaction('entries', 'readonly').objectStore('entries').index('tags').getAll(tag);
        request.onsuccess = () => {
          let entries = (request.result || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          if (language) entries = entries.filter(e => (e.language || 'other') === language);
          let startIndex = 0;
          if (lastCreatedAt && lastId) {
            for (let i = 0; i < entries.length; i++) {
              if (entries[i].createdAt === lastCreatedAt && entries[i].id === lastId) { startIndex = i + 1; break; }
            }
          }
          const paged = entries.slice(startIndex, startIndex + pageSize);
          resolve({ entries: paged, total: entries.length, hasMore: startIndex + pageSize < entries.length });
        };
        request.onerror = () => reject(new Error('标签分页查询失败'));
      });
    }

    if (language) {
      const allEntries = await this.getAllEntries(10000);
      let entries = allEntries.filter(e => (e.language || 'other') === language);
      let startIndex = 0;
      if (lastCreatedAt && lastId) {
        for (let i = 0; i < entries.length; i++) {
          if (entries[i].createdAt === lastCreatedAt && entries[i].id === lastId) { startIndex = i + 1; break; }
        }
      }
      const paged = entries.slice(startIndex, startIndex + pageSize);
      return { entries: paged, total: entries.length, hasMore: startIndex + pageSize < entries.length };
    }
    return this.getEntriesPagedByKey({ pageSize, lastCreatedAt, lastId });
  }

  // ==================== 复合索引查询 (R105) ====================

  async getEntriesByCategory(category, limit = 100) {
    const cacheKey = `category:${category}:${limit}`;
    const cached = this._getQueryCache(cacheKey);
    if (cached) return cached;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      let index;
      try { index = store.index('category_createdAt'); } catch (e) { index = store.index('category'); }
      const results = [];
      if (index.name === 'category_createdAt') {
        const request = index.openCursor(IDBKeyRange.bound([category, ''], [category, '￿'], false, false), 'prev');
        request.onsuccess = (e) => { const c = e.target.result; if (!c || results.length >= limit) { this._setQueryCache(cacheKey, results); resolve(results); return; } results.push(c.value); c.continue(); };
        request.onerror = () => reject(new Error('复合索引查询失败'));
      } else {
        const request = index.getAll(category);
        request.onsuccess = () => { const all = (request.result || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const sliced = all.slice(0, limit); this._setQueryCache(cacheKey, sliced); resolve(sliced); };
        request.onerror = () => reject(new Error('分类查询失败'));
      }
    });
  }

  async getEntriesByTitlePrefix(titlePrefix, limit = 100) {
    const cacheKey = `titlePrefix:${titlePrefix}:${limit}`;
    const cached = this._getQueryCache(cacheKey);
    if (cached) return cached;
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      let index;
      try { index = store.index('title_createdAt'); } catch (e) {
        const results = [];
        const lp = titlePrefix.toLowerCase();
        const req = store.index('createdAt').openCursor(null, 'prev');
        req.onsuccess = (ev) => { const c = ev.target.result; if (!c || results.length >= limit) { this._setQueryCache(cacheKey, results); resolve(results); return; } if ((c.value.title || '').toLowerCase().startsWith(lp)) results.push(c.value); c.continue(); };
        req.onerror = () => reject(new Error('标题前缀查询失败'));
        return;
      }
      const results = [];
      const request = index.openCursor(IDBKeyRange.bound([titlePrefix, ''], [titlePrefix + '￿', '￿'], false, false), 'prev');
      request.onsuccess = (e) => { const c = e.target.result; if (!c || results.length >= limit) { this._setQueryCache(cacheKey, results); resolve(results); return; } results.push(c.value); c.continue(); };
      request.onerror = () => reject(new Error('标题前缀复合索引查询失败'));
    });
  }

  async getEntriesByCategoryAndDateRange(category, startDate, endDate, limit = 100) {
    const cacheKey = `catDate:${category}:${startDate}:${endDate}:${limit}`;
    const cached = this._getQueryCache(cacheKey);
    if (cached) return cached;
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      let index;
      try { index = store.index('category_createdAt'); } catch (e) { index = store.index('category'); }
      const results = [];
      if (index.name === 'category_createdAt') {
        const request = index.openCursor(IDBKeyRange.bound([category, startDate], [category, endDate + '￿'], false, false), 'prev');
        request.onsuccess = (e) => { const c = e.target.result; if (!c || results.length >= limit) { this._setQueryCache(cacheKey, results); resolve(results); return; } results.push(c.value); c.continue(); };
        request.onerror = () => reject(new Error('复合索引日期范围查询失败'));
      } else {
        const request = index.getAll(category);
        request.onsuccess = () => { const all = (request.result || []).filter(e => e.createdAt >= startDate && e.createdAt <= endDate + '￿').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const sliced = all.slice(0, limit); this._setQueryCache(cacheKey, sliced); resolve(sliced); };
        request.onerror = () => reject(new Error('分类日期范围查询失败'));
      }
    });
  }

  // ==================== 统计与导出 ====================

  async getStats() {
    await this.ensureInit();
    const totalEntries = await this.getTotalCount();
    const tags = await this.getAllTags();
    const categories = await this.getAllCategories();
    const recentEntries = await this.getAllEntries(5);
    return { totalEntries, totalTags: tags.length, recentEntries, topTags: tags.slice(0, 10), categories };
  }

  async exportJSON() {
    return JSON.stringify(await this.getAllEntries(100000), null, 2);
  }

  async exportMarkdown() {
    const entries = await this.getAllEntries(100000);
    let md = '# AI 知识库导出\n\n';
    md += `导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;
    entries.forEach((entry) => {
      md += `## ${entry.title}\n\n`;
      md += `**来源：** [${entry.sourceTitle || entry.sourceUrl}](${entry.sourceUrl})\n`;
      md += `**标签：** ${entry.tags.join(', ')}\n**分类：** ${entry.category}\n`;
      if (entry.language) md += `**语言：** ${entry.language}\n`;
      md += `**时间：** ${new Date(entry.createdAt).toLocaleString('zh-CN')}\n\n`;
      if (entry.question) md += `### 问题\n${entry.question}\n\n`;
      if (entry.answer) md += `### 回答\n${entry.answer}\n\n`;
      if (entry.summary) md += `### 摘要\n${entry.summary}\n\n`;
      md += '---\n\n';
    });
    return md;
  }

  // ==================== 知识关联引擎 ====================

  async findRelatedEntries(entryId, limit = 5) {
    await this.ensureInit();
    const targetEntry = await this.getEntry(entryId);
    if (!targetEntry) return [];

    let candidates;
    if (this._indexBuilt) {
      const candidateIds = new Set();
      for (const word of new Set(this._extractWords(targetEntry))) {
        const ids = this._searchIndex.get(word);
        if (ids) { for (const id of ids) { if (id !== entryId) candidateIds.add(id); } }
      }
      if (candidateIds.size > 0) {
        candidates = [...(await this._getEntriesByIds(candidateIds)).values()];
      } else {
        candidates = (await this.getAllEntries(10000)).filter(e => e.id !== entryId);
      }
    } else {
      candidates = (await this.getAllEntries(10000)).filter(e => e.id !== entryId);
    }

    const targetText = _getECT(targetEntry);
    const scored = [];
    for (const entry of candidates) {
      const score = _calcSim(targetText, _getECT(entry));
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ==================== 综合搜索 ====================

  async combinedSearch(query, limit = 20) {
    await this.ensureInit();
    if (!query) return [];
    const cacheKey = `combined:${query}:${limit}`;
    const cached = this._getCachedSearch(cacheKey);
    if (cached) return cached;
    if (!this._indexBuilt) await this._buildIndex();

    const keywordResults = await this.search(query);
    const keywordItems = keywordResults.map(entry => ({ entry, score: 1, matchType: 'keyword' }));
    const keywordIds = new Set(keywordResults.map(e => e.id));
    const allEntries = await this._getAllEntriesFromIndex();
    const semanticResults = _semanticSearch(query, allEntries, limit);

    const combined = [...keywordItems];
    for (const item of semanticResults) {
      if (!keywordIds.has(item.entry.id)) combined.push({ ...item, matchType: 'semantic' });
    }
    combined.sort((a, b) => b.score - a.score);
    const result = combined.slice(0, limit);
    this._setCachedSearch(cacheKey, result);
    return result;
  }
}
