/**
 * BookmarkKnowledgeIntegration — 书签-知识库联动
 *
 * 拆分为 core（生命周期/查询）和 context（导航/摘要/增强/仪表盘）。
 *
 * @module lib/bookmark-knowledge-integration
 * @see bookmark-knowledge-integration-core.js
 * @see bookmark-knowledge-integration-context.js
 */

export { BookmarkKnowledgeIntegration } from './bookmark-knowledge-integration-core.js';

// 导入 context — 副作用：为 BookmarkKnowledgeIntegration 原型混入
// buildNavigationLinks / buildEntryNavLinks / getBookmarkKnowledgeSummary /
// getEntryKnowledgeSummary / enrichBookmark / enrichEntry / getIntegrationStats / getDashboard
import './bookmark-knowledge-integration-context.js';
