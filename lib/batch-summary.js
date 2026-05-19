/**
 * Batch Summary — 批量摘要引擎（迭代 #13）
 *
 * 向后兼容门面模块 — 委托给拆分后的子模块:
 *   - batch-summary-split.js — 分段逻辑
 *   - batch-summary-parse.js — 压缩、Prompt、解析、阅读时间、完整流程
 *
 * R161 拆分: 原 482 行 → 门面 + 2 子模块
 */

export { splitIntoSections } from './batch-summary-split.js';
export {
  compressSections,
  buildBatchSummaryPrompt,
  parseBatchSummaryResponse,
  estimateReadingTime,
  summarizeContent,
} from './batch-summary-parse.js';
