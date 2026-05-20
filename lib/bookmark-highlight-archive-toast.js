/**
 * SmartHighlightArchive — Toast 渲染与统计
 *
 * 从 bookmark-highlight-archive.js 拆分而来 (R193)
 * 包含: buildToastMessage、buildBatchToastMessage、extractContext、
 *       getStats、getRecentArchives、cleanupUndoBuffer
 *
 * @module lib/bookmark-highlight-archive-toast
 */

import { SmartHighlightArchive, CONTEXT_CHARS } from './bookmark-highlight-archive-core.js';

// ==================== Toast 渲染 ====================

SmartHighlightArchive.prototype.buildToastMessage = function(archiveResult) {
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
};

SmartHighlightArchive.prototype.buildBatchToastMessage = function(batchResult) {
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
};

// ==================== 上下文提取 ====================

SmartHighlightArchive.prototype.extractContext = function(selectedText, pageContent) {
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
};

// ==================== 统计 ====================

SmartHighlightArchive.prototype.getStats = function() {
  return {
    totalArchived: this._stats.totalArchived,
    totalUndone: this._stats.totalUndone,
    currentBuffer: this._undoBuffer.size,
  };
};

SmartHighlightArchive.prototype.getRecentArchives = function(limit = 10) {
  return this._recentArchives.slice(0, limit);
};

SmartHighlightArchive.prototype.cleanupUndoBuffer = function() {
  const now = Date.now();
  let cleaned = 0;
  for (const [undoId, record] of this._undoBuffer) {
    if (now - record.archivedAt > this._undoWindowMs) {
      this._undoBuffer.delete(undoId);
      cleaned++;
    }
  }
  return cleaned;
};
