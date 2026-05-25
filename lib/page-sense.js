/**
 * Page Sense - 页面感知引擎（编排层）
 *
 * R280: 从原 400 行拆分为:
 *   - page-sense-context.js — ContextExtractor（上下文提取/页面分析）
 *   - page-sense-dom.js — PageSenseDom（分析器注册/核心分析逻辑）
 *   - page-sense.js — 薄编排层（向后兼容入口）
 *   - page-sense-html.js — HTML 提取方法
 *
 * 自动识别页面类型、提取结构化数据、发现可操作元素
 * 让 AI "理解" 当前在看什么
 */

import {
  extractContent as _htmlExtractContent,
  extractImages as _htmlExtractImages,
  extractMetadata as _htmlExtractMetadata,
  extractHeadings as _htmlExtractHeadings,
} from './page-sense-html.js';

import { PageSenseDom } from './page-sense-dom.js';

/**
 * 页面感知引擎 — 向后兼容入口类
 * 继承 PageSenseDom → ContextExtractor，完整功能不变
 */
export class PageSense extends PageSenseDom {
  // ==================== HTML 提取方法 (delegated to page-sense-html.js) ====================

  /** @see page-sense-html.js#extractContent */
  extractContent(html) {
    return _htmlExtractContent(html);
  }

  /** @see page-sense-html.js#extractImages */
  extractImages(html) {
    return _htmlExtractImages(html);
  }

  /** @see page-sense-html.js#extractMetadata */
  extractMetadata(html) {
    return _htmlExtractMetadata(html);
  }

  /** @see page-sense-html.js#extractHeadings */
  extractHeadings(html) {
    return _htmlExtractHeadings(html);
  }
}

// 向后兼容 re-export
export { PageSenseDom } from './page-sense-dom.js';
export { ContextExtractor } from './page-sense-context.js';
export { extractContent, extractImages, extractMetadata, extractHeadings } from './page-sense-html.js';
