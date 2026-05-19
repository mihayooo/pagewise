/**
 * Compilation Report — L2.4 知识编译报告
 *
 * 每次 ingest 后生成编译报告，汇总本次编译过程中的所有变化。
 *
 * 数据结构/报告生成/统计合并已拆分至 compilation-report-format.js
 *
 * 设计原则：
 *   - 纯 ES Module，不依赖 IndexedDB 或 Chrome API
 *   - 纯函数：输入数据 → 输出报告，无副作用
 *
 * @module compilation-report
 */

import {
  IngestStats as _IngestStats,
  buildIngestStats as _buildIngestStats,
  computeIngestDiff as _computeIngestDiff,
  generateReportMarkdown as _generateReportMarkdown,
  generateReportHtml as _generateReportHtml,
  mergeIngestStats as _mergeIngestStats,
  summarizeReport as _summarizeReport,
  formatReportSummary as _formatReportSummary,
} from './compilation-report-format.js'

// ==================== 常量 ====================

/** 报告级别枚举 */
export const REPORT_LEVEL = {
  SUMMARY: 'summary',
  BRIEF: 'brief',
  DETAILED: 'detailed',
}

// ==================== 向后兼容 re-export ====================

export const IngestStats = _IngestStats
export const buildIngestStats = _buildIngestStats
export const computeIngestDiff = _computeIngestDiff
export const generateReportMarkdown = _generateReportMarkdown
export const generateReportHtml = _generateReportHtml
export const mergeIngestStats = _mergeIngestStats
export const summarizeReport = _summarizeReport
export const formatReportSummary = _formatReportSummary
