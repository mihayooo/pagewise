/**
 * KnowledgeBase - 基于 IndexedDB 的本地知识库
 * 向后兼容门面模块 — 委托给拆分后的子模块
 * 拆分: core → crud → query → export
 */

// Re-export 子模块的类和工具函数
export { KnowledgeBaseExport as KnowledgeBase } from './knowledge-base-export.js';
export {
  bigrams,
  calculateSimilarity,
  getEntryCompareText,
  getSearchCompareText,
  semanticSearch,
  getSearchSuggestions,
  getMatchedFields,
} from './knowledge-base-text-utils.js';
