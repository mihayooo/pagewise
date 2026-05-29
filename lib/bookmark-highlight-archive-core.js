/**
 * SmartHighlightArchive — 智能摘录归档核心模块
 *
 * 从 bookmark-highlight-archive.js 拆分而来 (R193)
 * 包含: 常量、constructor、核心归档 API、撤销、内部方法
 *
 * @module lib/bookmark-highlight-archive-core
 */

import { getAllHighlights, getHighlightsByUrl } from './highlight-store.js';
import { BookmarkTagger } from './bookmark-tagger.js';

// ==================== 常量 ====================

/** 默认撤销窗口时长 (毫秒) */
export const DEFAULT_UNDO_WINDOW_MS = 5000;

/** 上下文前后截取字符数 */
export const CONTEXT_CHARS = 100;

// ==================== SmartHighlightArchive ====================

/** SmartHighlightArchive 类 */
export class SmartHighlightArchive {
  /**
   * @param {Object} [options]
   * @param {AIClient}           [options.aiClient]         — AI 客户端
   * @param {BookmarkTagger}     [options.tagger]           — 标签生成器
   * @param {KnowledgeBaseCRUD}  [options.knowledgeBase]    — 知识库 CRUD 实例
   * @param {BookmarkKnowledgeCorrelation} [options.correlation] — 书签-知识关联引擎
   * @param {Object}             [options.storage]           — chrome.storage.local 接口
   * @param {number}             [options.undoWindowMs]      — 撤销窗口时长 (默认 5000ms)
   */
  constructor(options = {}) {
    this._aiClient = options.aiClient || null;
    this._tagger = options.tagger || new BookmarkTagger([]);
    this._knowledgeBase = options.knowledgeBase || null;
    this._correlation = options.correlation || null;
    this._storage = options.storage || (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
    this._undoWindowMs = options.undoWindowMs || DEFAULT_UNDO_WINDOW_MS;

    /** @type {Map<string, Object>} 撤销缓冲 */
    this._undoBuffer = new Map();

    /** 最近归档记录 */
    this._recentArchives = [];

    /** 统计 */
    this._stats = {
      totalArchived: 0,
      totalUndone: 0,
    };
  }

  // ==================== 核心 API ====================

  async archiveHighlight(highlightId, pageContext = {}) {
    const highlight = await this._findHighlight(highlightId);
    if (!highlight) {
      throw new Error(`高亮不存在: ${highlightId}`);
    }
    return this._doArchive(highlight, pageContext);
  }

  async archiveHighlightData(highlight, pageContext = {}) {
    if (!highlight || !highlight.text) {
      throw new Error('高亮数据无效: 缺少 text');
    }
    return this._doArchive(highlight, pageContext);
  }

  async archiveHighlightsByUrl(url, pageContext = {}) {
    if (!url) throw new Error('url 不能为空');
    const highlights = await getHighlightsByUrl(url);
    if (!highlights || highlights.length === 0) {
      return { results: [], failures: [], undoIds: [] };
    }
    return this.archiveHighlightsBatch(highlights, { ...pageContext, url });
  }

  async archiveHighlightsBatch(highlights, pageContext = {}) {
    if (!Array.isArray(highlights) || highlights.length === 0) {
      return { results: [], failures: [], undoIds: [] };
    }
    const results = [];
    const failures = [];
    const undoIds = [];
    for (const highlight of highlights) {
      try {
        const result = await this._doArchive(highlight, pageContext);
        results.push(result);
        undoIds.push(result.undoId);
      } catch (err) {
        failures.push({ highlightId: highlight.id, error: err.message });
      }
    }
    return { results, failures, undoIds };
  }

  // ==================== 撤销 ====================

  async undoArchive(undoId) {
    if (!undoId) return false;
    const record = this._undoBuffer.get(undoId);
    if (!record) return false;

    const elapsed = Date.now() - record.archivedAt;
    if (elapsed > this._undoWindowMs) {
      this._undoBuffer.delete(undoId);
      return false;
    }

    try {
      if (this._knowledgeBase && record.entry && record.entry.id !== null && record.entry.id !== undefined) {
        await this._knowledgeBase.deleteEntry(record.entry.id);
      }
      if (this._correlation && record.entry && record.entry.id !== null && record.entry.id !== undefined) {
        this._correlation.removeEntry(record.entry.id);
      }
      this._undoBuffer.delete(undoId);
      this._recentArchives = this._recentArchives.filter(a => a.undoId !== undoId);
      this._stats.totalUndone++;
      return true;
    } catch (_err) {
      return false;
    }
  }

  async undoBatch(undoIds) {
    if (!Array.isArray(undoIds) || undoIds.length === 0) return 0;
    let undone = 0;
    for (const undoId of undoIds) {
      const success = await this.undoArchive(undoId);
      if (success) undone++;
    }
    return undone;
  }

  getUndoableArchives() {
    const now = Date.now();
    const result = [];
    for (const [undoId, record] of this._undoBuffer) {
      const elapsed = now - record.archivedAt;
      if (elapsed <= this._undoWindowMs) {
        result.push({
          undoId,
          highlightText: record.highlightText || '',
          archivedAt: record.archivedAt,
          remainingMs: Math.max(0, this._undoWindowMs - elapsed),
        });
      }
    }
    return result.sort((a, b) => b.archivedAt - a.archivedAt);
  }

  // ==================== 内部方法 ====================

  async _findHighlight(highlightId) {
    if (!highlightId) return null;
    const allHighlights = await getAllHighlights();
    for (const urlHighlights of Object.values(allHighlights)) {
      for (const h of urlHighlights) {
        if (h.id === highlightId) return h;
      }
    }
    return null;
  }

  async _doArchive(highlight, pageContext = {}) {
    const text = highlight.text || '';
    if (!text.trim()) {
      throw new Error('高亮文本为空');
    }

    const { context } = this.extractContext(text, pageContext.content);

    const { summary, tags } = await this._generateSummaryAndTags(text, context, highlight, pageContext);

    const entry = {
      title: this._buildTitle(text, pageContext),
      content: context || text,
      summary,
      tags,
      sourceUrl: highlight.url || pageContext.url || '',
      sourceTitle: pageContext.title || '',
      category: '摘录归档',
      question: '',
      answer: '',
      language: this._detectLanguage(text),
      highlightId: highlight.id || null,
    };

    let savedEntry = entry;
    if (this._knowledgeBase) {
      const result = await this._knowledgeBase.saveEntry(entry);
      if (result && result.duplicate) {
        const undoId = this._generateUndoId();
        this._undoBuffer.set(undoId, {
          entry: result.existing,
          archivedAt: Date.now(),
          highlightText: text,
          isDuplicate: true,
        });
        return { entry: result.existing, undoId, highlightText: text, isDuplicate: true };
      }
      savedEntry = result;
    }

    if (this._correlation && savedEntry) {
      this._correlation.addEntry(savedEntry);
    }

    const undoId = this._generateUndoId();
    this._undoBuffer.set(undoId, {
      entry: savedEntry,
      archivedAt: Date.now(),
      highlightText: text,
      url: highlight.url || pageContext.url || '',
    });

    this._recentArchives.unshift({
      undoId,
      highlightText: text,
      entryId: savedEntry.id,
      tags: savedEntry.tags,
      archivedAt: Date.now(),
    });

    this._stats.totalArchived++;

    return { entry: savedEntry, undoId, highlightText: text };
  }

  async _generateSummaryAndTags(text, context, highlight, pageContext) {
    let summary = '';
    let tags = [];

    if (this._aiClient) {
      try {
        const aiResult = await this._aiClient.generateSummaryAndTags(context || text);
        summary = aiResult.summary || '';
        tags = aiResult.tags || [];
      } catch (_e) { console.debug('[PageWise] highlight-archive: AI summary skip', _e); }
    }

    const taggerTags = this._tagger.generateTags({
      id: highlight.id || 'temp',
      title: pageContext.title || text.slice(0, 50),
      url: highlight.url || pageContext.url || '',
      folderPath: [],
    });

    const allTags = [...new Set([...tags, ...taggerTags])];
    tags = allTags.slice(0, 5);

    if (tags.length === 0) {
      tags = taggerTags.length > 0 ? taggerTags : ['摘录'];
    }

    if (!summary) {
      summary = text.length > 100 ? text.slice(0, 100) + '...' : text;
    }

    return { summary, tags };
  }

  _buildTitle(text, pageContext) {
    const pageTitle = pageContext.title || '';
    const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
    if (pageTitle) {
      return `摘录 - ${pageTitle}: ${truncated}`;
    }
    return `摘录 - ${truncated}`;
  }

  _detectLanguage(text) {
    if (!text) return 'other';
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const total = chineseChars + englishChars;
    if (total === 0) return 'other';
    const chineseRatio = chineseChars / total;
    if (chineseRatio > 0.7) return 'zh';
    if (chineseRatio < 0.3) return 'en';
    return 'mixed';
  }

  _generateUndoId() {
    return 'undo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
}
