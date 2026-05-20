/**
 * SmartHighlightArchive — 智能摘录归档
 *
 * 迭代 R168: 打通"选中文字→一键归档知识条目"的最短路径
 *
 * 设计决策:
 *   - 复用 highlight-store.js 作为选区数据源
 *   - 复用 BookmarkTagger 自动生成 3-5 个标签
 *   - 复用 KnowledgeBaseCRUD 一键存入知识库
 *   - 复用 BookmarkKnowledgeCorrelation 自动关联当前页面书签
 *   - 依赖注入: AI 客户端、标签器、知识库 CRUD、关联引擎均为可选注入
 *   - 撤销缓冲: 内存 Map 存储最近归档条目，5s 窗口期内可撤销
 *   - 批量归档: 支持对同一页面多个高亮一次性归档
 *   - 纯 ES Module，不直接依赖 DOM/Chrome API
 *
 * 复用关系:
 *   highlight-store.js  → getAllHighlights, getHighlightsByUrl
 *   bookmark-tagger.js  → BookmarkTagger.generateTags
 *   knowledge-base-crud.js → KnowledgeBaseCRUD.saveEntry
 *   bookmark-knowledge-link.js → BookmarkKnowledgeCorrelation.addEntry
 *   ai-client.js → AIClient.generateSummaryAndTags
 */

import { getAllHighlights, getHighlightsByUrl } from './highlight-store.js';
import { BookmarkTagger } from './bookmark-tagger.js';

// ==================== 常量 ====================

/** 默认撤销窗口时长 (毫秒) */
const DEFAULT_UNDO_WINDOW_MS = 5000;

/** 上下文前后截取字符数 */
const CONTEXT_CHARS = 100;

// ==================== SmartHighlightArchive ====================

export class SmartHighlightArchive {
  /**
   * @param {Object} [options]
   * @param {AIClient}           [options.aiClient]         — AI 客户端（用于生成摘要+标签）
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

    /**
     * 撤销缓冲: archiveId → { entry, archivedAt, url }
     * @type {Map<string, Object>}
     */
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

  /**
   * 归档单个高亮到知识库
   * @param {string} highlightId — 高亮 ID
   * @param {Object} [pageContext] — 页面上下文
   * @param {string} [pageContext.url]    — 页面 URL
   * @param {string} [pageContext.title]  — 页面标题
   * @param {string} [pageContext.content] — 页面全文（用于提取上下文）
   * @param {string} [pageContext.bookmarkId] — 关联的书签 ID
   * @returns {Promise<Object>} { entry, undoId }
   */
  async archiveHighlight(highlightId, pageContext = {}) {
    const highlight = await this._findHighlight(highlightId);
    if (!highlight) {
      throw new Error(`高亮不存在: ${highlightId}`);
    }

    return this._doArchive(highlight, pageContext);
  }

  /**
   * 通过高亮数据对象直接归档（不依赖 highlight-store 查询）
   * @param {Object} highlight — 高亮数据 { id, url, text, ... }
   * @param {Object} [pageContext] — 页面上下文
   * @returns {Promise<Object>} { entry, undoId }
   */
  async archiveHighlightData(highlight, pageContext = {}) {
    if (!highlight || !highlight.text) {
      throw new Error('高亮数据无效: 缺少 text');
    }
    return this._doArchive(highlight, pageContext);
  }

  /**
   * 批量归档: 对同一页面的多个高亮一次性归档
   * @param {string} url — 页面 URL
   * @param {Object} [pageContext] — 页面上下文
   * @returns {Promise<Object>} { results: [...], failures: [...], undoIds: [...] }
   */
  async archiveHighlightsByUrl(url, pageContext = {}) {
    if (!url) throw new Error('url 不能为空');

    const highlights = await getHighlightsByUrl(url);
    if (!highlights || highlights.length === 0) {
      return { results: [], failures: [], undoIds: [] };
    }

    return this.archiveHighlightsBatch(highlights, { ...pageContext, url });
  }

  /**
   * 批量归档指定的高亮数组
   * @param {Array} highlights — 高亮数组
   * @param {Object} [pageContext] — 页面上下文
   * @returns {Promise<Object>} { results, failures, undoIds }
   */
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

  /**
   * 撤销最近一次归档
   * @param {string} undoId — 归档时返回的 undoId
   * @returns {Promise<boolean>} 是否撤销成功
   */
  async undoArchive(undoId) {
    if (!undoId) return false;

    const record = this._undoBuffer.get(undoId);
    if (!record) return false;

    // 检查是否还在撤销窗口期
    const elapsed = Date.now() - record.archivedAt;
    if (elapsed > this._undoWindowMs) {
      this._undoBuffer.delete(undoId);
      return false;
    }

    try {
      // 从知识库中删除条目
      if (this._knowledgeBase && record.entry && record.entry.id != null) {
        await this._knowledgeBase.deleteEntry(record.entry.id);
      }

      // 从关联引擎中移除
      if (this._correlation && record.entry && record.entry.id != null) {
        this._correlation.removeEntry(record.entry.id);
      }

      // 清除撤销缓冲
      this._undoBuffer.delete(undoId);

      // 更新最近归档记录
      this._recentArchives = this._recentArchives.filter(a => a.undoId !== undoId);

      this._stats.totalUndone++;
      return true;
    } catch (_err) {
      return false;
    }
  }

  /**
   * 撤销最近一批归档（同一批次的归档一起撤销）
   * @param {string[]} undoIds — 一批 undoId
   * @returns {Promise<number>} 成功撤销的数量
   */
  async undoBatch(undoIds) {
    if (!Array.isArray(undoIds) || undoIds.length === 0) return 0;

    let undone = 0;
    for (const undoId of undoIds) {
      const success = await this.undoArchive(undoId);
      if (success) undone++;
    }
    return undone;
  }

  /**
   * 获取可撤销的归档列表
   * @returns {Object[]} [{ undoId, highlightText, archivedAt, remainingMs }]
   */
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

  // ==================== Toast 渲染 ====================

  /**
   * 构建 Toast 确认消息（包含撤销按钮描述）
   * @param {Object} archiveResult — _doArchive 的返回值
   * @returns {Object} { message, undoId, undoable, duration }
   */
  buildToastMessage(archiveResult) {
    if (!archiveResult || !archiveResult.undoId) {
      return { message: '归档失败', undoId: null, undoable: false, duration: 0 };
    }

    const text = archiveResult.highlightText || '';
    const truncated = text.length > 30 ? text.slice(0, 30) + '...' : text;
    const tagCount = (archiveResult.entry && archiveResult.entry.tags) ? archiveResult.entry.tags.length : 0;
    const tagInfo = tagCount > 0 ? `，已标记 ${tagCount} 个标签` : '';

    return {
      message: `已归档摘录「${truncated}」${tagInfo}`,
      undoId: archiveResult.undoId,
      undoable: true,
      duration: this._undoWindowMs,
    };
  }

  /**
   * 构建批量归档 Toast 消息
   * @param {Object} batchResult — archiveHighlightsBatch 的返回值
   * @returns {Object} { message, undoIds, undoable, successCount, failCount }
   */
  buildBatchToastMessage(batchResult) {
    if (!batchResult) {
      return { message: '归档失败', undoIds: [], undoable: false, successCount: 0, failCount: 0 };
    }

    const successCount = batchResult.results ? batchResult.results.length : 0;
    const failCount = batchResult.failures ? batchResult.failures.length : 0;
    const undoIds = batchResult.undoIds || [];

    let message = `已批量归档 ${successCount} 条摘录`;
    if (failCount > 0) {
      message += `（${failCount} 条失败）`;
    }

    return {
      message,
      undoIds,
      undoable: undoIds.length > 0,
      successCount,
      failCount,
      duration: this._undoWindowMs,
    };
  }

  // ==================== 上下文提取 ====================

  /**
   * 从页面内容中提取选中文字的上下文
   * @param {string} selectedText — 选中的文字
   * @param {string} [pageContent] — 页面全文
   * @returns {{ before: string, after: string, context: string }}
   */
  extractContext(selectedText, pageContent) {
    if (!selectedText || !pageContent) {
      return { before: '', after: '', context: selectedText || '' };
    }

    const idx = pageContent.indexOf(selectedText);
    if (idx === -1) {
      return { before: '', after: '', context: selectedText };
    }

    const before = pageContent.slice(Math.max(0, idx - CONTEXT_CHARS), idx);
    const afterStart = idx + selectedText.length;
    const after = pageContent.slice(afterStart, afterStart + CONTEXT_CHARS);
    const context = before + selectedText + after;

    return { before, after, context };
  }

  // ==================== 统计 ====================

  /**
   * 获取归档统计
   * @returns {{ totalArchived: number, totalUndone: number, currentBuffer: number }}
   */
  getStats() {
    return {
      totalArchived: this._stats.totalArchived,
      totalUndone: this._stats.totalUndone,
      currentBuffer: this._undoBuffer.size,
    };
  }

  /**
   * 获取最近归档记录
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  getRecentArchives(limit = 10) {
    return this._recentArchives.slice(0, limit);
  }

  /**
   * 清理过期的撤销缓冲
   * @returns {number} 清理的条目数
   */
  cleanupUndoBuffer() {
    const now = Date.now();
    let cleaned = 0;

    for (const [undoId, record] of this._undoBuffer) {
      if (now - record.archivedAt > this._undoWindowMs) {
        this._undoBuffer.delete(undoId);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ==================== 内部方法 ====================

  /**
   * 查找高亮（全局搜索所有 URL）
   * @param {string} highlightId
   * @returns {Promise<Object|null>}
   */
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

  /**
   * 核心归档逻辑
   * @param {Object} highlight
   * @param {Object} pageContext
   * @returns {Promise<Object>} { entry, undoId, highlightText }
   */
  async _doArchive(highlight, pageContext = {}) {
    const text = highlight.text || '';
    if (!text.trim()) {
      throw new Error('高亮文本为空');
    }

    // 1. 提取上下文
    const { context } = this.extractContext(text, pageContext.content);

    // 2. 生成摘要和标签
    const { summary, tags } = await this._generateSummaryAndTags(text, context, highlight, pageContext);

    // 3. 构造知识条目
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

    // 4. 存入知识库
    let savedEntry = entry;
    if (this._knowledgeBase) {
      const result = await this._knowledgeBase.saveEntry(entry);
      if (result && result.duplicate) {
        // 重复条目 — 返回已有条目
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

    // 5. 关联书签
    if (this._correlation && savedEntry) {
      this._correlation.addEntry(savedEntry);
    }

    // 6. 生成撤销 ID 并存入缓冲
    const undoId = this._generateUndoId();
    this._undoBuffer.set(undoId, {
      entry: savedEntry,
      archivedAt: Date.now(),
      highlightText: text,
      url: highlight.url || pageContext.url || '',
    });

    // 7. 记录最近归档
    this._recentArchives.unshift({
      undoId,
      highlightText: text,
      entryId: savedEntry.id,
      tags: savedEntry.tags,
      archivedAt: Date.now(),
    });

    // 统计
    this._stats.totalArchived++;

    return { entry: savedEntry, undoId, highlightText: text };
  }

  /**
   * 生成摘要 + 标签
   * @param {string} text — 选中文字
   * @param {string} context — 上下文
   * @param {Object} highlight — 高亮数据
   * @param {Object} pageContext — 页面上下文
   * @returns {Promise<{summary: string, tags: string[]}>}
   */
  async _generateSummaryAndTags(text, context, highlight, pageContext) {
    let summary = '';
    let tags = [];

    // 优先使用 AI 生成
    if (this._aiClient) {
      try {
        const aiResult = await this._aiClient.generateSummaryAndTags(context || text);
        summary = aiResult.summary || '';
        tags = aiResult.tags || [];
      } catch (_e) {
        // AI 调用失败，使用本地回退
      }
    }

    // 标签补充: 使用 BookmarkTagger
    const taggerTags = this._tagger.generateTags({
      id: highlight.id || 'temp',
      title: pageContext.title || text.slice(0, 50),
      url: highlight.url || pageContext.url || '',
      folderPath: [],
    });

    // 合并标签: AI 标签 + Tagger 标签，去重后取 3-5 个
    const allTags = [...new Set([...tags, ...taggerTags])];
    tags = allTags.slice(0, 5);

    // 确保至少有 tagger 的标签
    if (tags.length === 0) {
      tags = taggerTags.length > 0 ? taggerTags : ['摘录'];
    }

    // 摘要回退: 如果 AI 未生成摘要，使用文本前 100 字
    if (!summary) {
      summary = text.length > 100 ? text.slice(0, 100) + '...' : text;
    }

    return { summary, tags };
  }

  /**
   * 构建条目标题
   * @param {string} text
   * @param {Object} pageContext
   * @returns {string}
   */
  _buildTitle(text, pageContext) {
    const pageTitle = pageContext.title || '';
    const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;

    if (pageTitle) {
      return `摘录 - ${pageTitle}: ${truncated}`;
    }
    return `摘录 - ${truncated}`;
  }

  /**
   * 检测文本语言
   * @param {string} text
   * @returns {string} 'zh' | 'en' | 'mixed' | 'other'
   */
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

  /**
   * 生成撤销 ID
   * @returns {string}
   */
  _generateUndoId() {
    return 'undo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
}

// ==================== 常量导出 ====================

export { DEFAULT_UNDO_WINDOW_MS, CONTEXT_CHARS };
