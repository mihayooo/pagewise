/**
 * BookmarkKnowledgeIntegration — 书签-知识库联动上下文模块
 *
 * 从 bookmark-knowledge-integration.js 拆分而来 (R193)
 * 包含: 导航链接、知识摘要、知识增强、统计、仪表盘
 *
 * @module lib/bookmark-knowledge-integration-context
 */

import { BookmarkKnowledgeIntegration, DASHBOARD_TOP_N } from './bookmark-knowledge-integration-core.js';

// ==================== 导航链接构建 ====================

BookmarkKnowledgeIntegration.prototype.buildNavigationLinks = function(bookmarkId) {
  if (!this._ready) return null;
  const bmId = String(bookmarkId);
  const bookmark = this._bookmarkMap.get(bmId);
  if (!bookmark) return null;
  const related = this.getKnowledgeForBookmark(bmId);
  const knowledgeLinks = related.map(r => ({
    entryId: r.entry.id,
    entryTitle: r.entry.title || r.entry.question || '未命名',
    entrySummary: r.entry.summary || '',
    score: r.score,
    matchTypes: r.matchTypes,
    navigationHint: r.navigationHint,
  }));
  return { bookmark, knowledgeLinks, totalLinks: knowledgeLinks.length };
};

BookmarkKnowledgeIntegration.prototype.buildEntryNavLinks = function(entryId) {
  if (!this._ready) return null;
  const eId = Number(entryId);
  const entry = this._entryMap.get(eId);
  if (!entry) return null;
  const related = this.getBookmarksForEntry(eId);
  const bookmarkLinks = related.map(r => ({
    bookmarkId: r.bookmark.id,
    bookmarkTitle: r.bookmark.title || '未命名',
    bookmarkUrl: r.bookmark.url || '',
    score: r.score,
    matchTypes: r.matchTypes,
    navigationHint: r.navigationHint,
  }));
  return { entry, bookmarkLinks, totalLinks: bookmarkLinks.length };
};

// ==================== 知识摘要 ====================

BookmarkKnowledgeIntegration.prototype.getBookmarkKnowledgeSummary = function(bookmarkId) {
  if (!this._ready) return null;
  const bmId = String(bookmarkId);
  const bookmark = this._bookmarkMap.get(bmId);
  if (!bookmark) return null;
  const related = this.getKnowledgeForBookmark(bmId);
  const avgScore = related.length > 0
    ? Math.round(related.reduce((s, r) => s + r.score, 0) / related.length * 1000) / 1000
    : 0;
  const typeCount = { url: 0, title: 0, tag: 0 };
  for (const r of related) {
    for (const t of r.matchTypes) {
      if (t in typeCount) typeCount[t]++;
    }
  }
  return {
    bookmark,
    totalRelatedEntries: related.length,
    avgCorrelationScore: avgScore,
    topEntries: related.slice(0, DASHBOARD_TOP_N).map(r => ({
      entry: r.entry,
      score: r.score,
      matchTypes: r.matchTypes,
    })),
    matchTypeDistribution: Object.entries(typeCount)
      .map(([type, count]) => ({ type, count })),
  };
};

BookmarkKnowledgeIntegration.prototype.getEntryKnowledgeSummary = function(entryId) {
  if (!this._ready) return null;
  const eId = Number(entryId);
  const entry = this._entryMap.get(eId);
  if (!entry) return null;
  const related = this.getBookmarksForEntry(eId);
  const avgScore = related.length > 0
    ? Math.round(related.reduce((s, r) => s + r.score, 0) / related.length * 1000) / 1000
    : 0;
  return {
    entry,
    totalRelatedBookmarks: related.length,
    avgCorrelationScore: avgScore,
    topBookmarks: related.slice(0, DASHBOARD_TOP_N).map(r => ({
      bookmark: r.bookmark,
      score: r.score,
      matchTypes: r.matchTypes,
    })),
  };
};

// ==================== 知识增强 ====================

BookmarkKnowledgeIntegration.prototype.enrichBookmark = function(bookmarkId) {
  if (!this._ready) return null;
  const bmId = String(bookmarkId);
  const bookmark = this._bookmarkMap.get(bmId);
  if (!bookmark) return null;
  const related = this.getKnowledgeForBookmark(bmId);
  const knowledgeContext = related.map(r => ({
    entryId: r.entry.id,
    title: r.entry.title || r.entry.question || '',
    summary: r.entry.summary || '',
    category: r.entry.category || '未分类',
    tags: r.entry.tags || [],
    score: r.score,
    matchTypes: r.matchTypes,
  }));
  const enrichmentScore = related.length > 0
    ? Math.min(1, Math.round(related.reduce((s, r) => s + r.score, 0) / Math.max(related.length, 1) * 100) / 100)
    : 0;
  return { bookmark, knowledgeContext, knowledgeCount: knowledgeContext.length, enrichmentScore };
};

BookmarkKnowledgeIntegration.prototype.enrichEntry = function(entryId) {
  if (!this._ready) return null;
  const eId = Number(entryId);
  const entry = this._entryMap.get(eId);
  if (!entry) return null;
  const related = this.getBookmarksForEntry(eId);
  const bookmarkContext = related.map(r => ({
    bookmarkId: r.bookmark.id,
    title: r.bookmark.title || '',
    url: r.bookmark.url || '',
    folderPath: r.bookmark.folderPath || [],
    tags: r.bookmark.tags || [],
    status: r.bookmark.status || 'unread',
    score: r.score,
    matchTypes: r.matchTypes,
  }));
  const enrichmentScore = related.length > 0
    ? Math.min(1, Math.round(related.reduce((s, r) => s + r.score, 0) / Math.max(related.length, 1) * 100) / 100)
    : 0;
  return { entry, bookmarkContext, bookmarkCount: bookmarkContext.length, enrichmentScore };
};

// ==================== 统计与仪表盘 ====================

BookmarkKnowledgeIntegration.prototype.getIntegrationStats = function() {
  if (!this._ready) {
    return {
      totalBookmarks: 0,
      totalEntries: 0,
      totalCorrelations: 0,
      associatedBookmarks: 0,
      associatedEntries: 0,
      avgCorrelationsPerBookmark: 0,
      coverageRate: 0,
      syncedAt: null,
    };
  }
  const base = this._correlationEngine.getStats();
  const coverageRate = base.totalBookmarks > 0
    ? Math.round((base.associatedBookmarks / base.totalBookmarks) * 1000) / 1000
    : 0;
  return { ...base, coverageRate, syncedAt: this._syncedAt };
};

BookmarkKnowledgeIntegration.prototype.getDashboard = function() {
  const stats = this.getIntegrationStats();
  if (!this._ready) {
    return {
      stats,
      topCorrelatedBookmarks: [],
      suggestions: [],
      orphanBookmarks: [],
      orphanEntries: [],
    };
  }

  const bookmarkCorrelationCounts = [];
  for (const [bmId] of this._bookmarkMap) {
    const related = this._correlationEngine.getRelatedEntries(bmId, { limit: 100 });
    if (related.length > 0) {
      const avgScore = related.reduce((s, r) => s + r.score, 0) / related.length;
      bookmarkCorrelationCounts.push({
        bookmark: this._bookmarkMap.get(bmId),
        correlationCount: related.length,
        avgScore: Math.round(avgScore * 1000) / 1000,
      });
    }
  }
  bookmarkCorrelationCounts.sort((a, b) => b.correlationCount - a.correlationCount);

  const orphanBookmarks = [];
  for (const [bmId, bookmark] of this._bookmarkMap) {
    const related = this._correlationEngine.getRelatedEntries(bmId, { limit: 1 });
    if (related.length === 0) {
      orphanBookmarks.push(bookmark);
    }
  }

  const orphanEntries = [];
  for (const [entryId, entry] of this._entryMap) {
    const related = this._correlationEngine.getRelatedBookmarks(entryId, { limit: 1 });
    if (related.length === 0) {
      orphanEntries.push(entry);
    }
  }

  const suggestions = this._correlationEngine.suggestCorrelations({ limit: DASHBOARD_TOP_N });

  return {
    stats,
    topCorrelatedBookmarks: bookmarkCorrelationCounts.slice(0, DASHBOARD_TOP_N),
    suggestions,
    orphanBookmarks,
    orphanEntries,
  };
};
