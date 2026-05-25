/**
 * Wiki Query — L3.4 LLM Wiki 查询引擎（编排层）
 *
 * R280: 从原 387 行拆分为:
 *   - wiki-query-builder.js — 查询构建/过滤/排序（estimateTokens/extractKeywords/scorePage/selectRelevantPages/buildWikiContext）
 *   - wiki-query.js — WikiQueryEngine 类 + re-export（编排层）
 *   - wiki-query-prompts.js — Prompt 构建与引用提取
 *
 * @module wiki-query
 */

// 向后兼容 re-export: 从 builder 模块导出所有公共函数
export {
  DEFAULT_QUERY_OPTIONS,
  estimateTokens,
  extractKeywords,
  scorePage,
  selectRelevantPages,
  buildWikiContext,
} from './wiki-query-builder.js';

// 向后兼容 re-export: 从 prompts 模块导出
export {
  buildWikiSystemPrompt,
  buildWikiQuestionPrompt,
  extractPageReferences,
  isAnswerWorthArchiving,
  buildAnswerArchivePrompt,
} from './wiki-query-prompts.js';

import {
  DEFAULT_QUERY_OPTIONS,
  estimateTokens,
  selectRelevantPages,
  buildWikiContext,
} from './wiki-query-builder.js';

import { buildWikiSystemPrompt, buildWikiQuestionPrompt, extractPageReferences, isAnswerWorthArchiving, buildAnswerArchivePrompt } from './wiki-query-prompts.js';

// ==================== WikiQueryEngine 类 ====================

/**
 * Wiki 查询引擎
 *
 * 封装完整的 Wiki 查询流程：
 *   1. 加载页面
 *   2. 智能选择相关页面
 *   3. 构建上下文
 *   4. 构建 prompt
 *   5. 提取引用
 *   6. 归档
 */
export class WikiQueryEngine {
  constructor(options = {}) {
    /** @type {Object} 查询选项 */
    this.options = { ...DEFAULT_QUERY_OPTIONS, ...options };
  }

  /**
   * 准备 Wiki 查询
   *
   * @param {Array<Object>} pages - 所有 wiki 页面
   * @param {string} question - 用户问题
   * @returns {Object} 查询准备结果
   */
  prepareQuery(pages, question) {
    const selectedPages = selectRelevantPages(pages, question, this.options);
    const context = buildWikiContext(selectedPages, { maxTokens: this.options.maxTokens });
    const systemPrompt = buildWikiSystemPrompt();
    const userPrompt = buildWikiQuestionPrompt(context, question);

    return {
      selectedPages,
      context,
      systemPrompt,
      userPrompt,
      stats: {
        totalPages: Array.isArray(pages) ? pages.length : 0,
        selectedCount: selectedPages.length,
        contextTokens: estimateTokens(context),
      },
    };
  }

  /**
   * 从 AI 回答中提取引用
   *
   * @param {string} response - AI 回答
   * @param {Array<Object>} pages - 所有 wiki 页面
   * @returns {Array<Object>} 被引用的页面
   */
  extractReferences(response, pages) {
    const pageMap = new Map();
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (page && page.id) pageMap.set(page.id, page);
      }
    }
    return extractPageReferences(response, pageMap);
  }

  /**
   * 准备归档
   *
   * @param {string} question - 用户问题
   * @param {string} answer - AI 回答
   * @returns {Object|null} 归档信息，不值得归档时返回 null
   */
  prepareArchive(question, answer) {
    if (!isAnswerWorthArchiving(question, answer)) return null;

    return {
      worthArchiving: true,
      archivePrompt: buildAnswerArchivePrompt(question, answer),
    };
  }
}
