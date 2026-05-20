/**
 * PageSummarizer — 一键全文总结引擎
 *
 * 使用 Readability-like 算法提取正文，调用 AI 生成结构化摘要，
 * 支持流式输出和保存到知识库。
 * R203: HTML 提取辅助 → page-summarizer-extract.js
 */

'use strict';

import {
  NOISE_TAGS, CONTENT_TAGS, POSITIVE_SELECTORS, NEGATIVE_SELECTORS,
  parseHTML, basicParse, stripTags, extractTitle, extractTitleFromRegex,
  removeNoiseElements, tryHighConfidenceSelectors,
} from './page-summarizer-extract.js';

// Re-export for backward compatibility
export { NOISE_TAGS, CONTENT_TAGS, POSITIVE_SELECTORS, NEGATIVE_SELECTORS };

export class PageSummarizer {
  constructor(options = {}) {
    this.maxContentLength = options.maxContentLength || 8000;
    this.minParagraphLength = options.minParagraphLength || 30;
  }

  // ==================== 正文提取 ====================

  extractMainContent(html) {
    if (!html || typeof html !== 'string') {
      return { title: '', content: '', excerpt: '', charCount: 0 };
    }
    const doc = this._parseHTML(html);
    if (!doc) return { title: '', content: '', excerpt: '', charCount: 0 };
    const title = this._extractTitle(doc);
    this._removeNoiseElements(doc);
    let mainContent = this._tryHighConfidenceSelectors(doc);
    if (!mainContent || this._getTextLength(mainContent) < 200) {
      mainContent = this._scoreAndSelectBestCandidate(doc);
    }
    const paragraphs = this._collectParagraphs(mainContent || doc.body);
    let content = paragraphs.join('\n\n');
    if (content.length > this.maxContentLength) content = content.slice(0, this.maxContentLength - 20) + '\n\n[内容已截取…]';
    const excerpt = content.slice(0, 200).replace(/\n+/g, ' ').trim();
    return { title, content, excerpt, charCount: content.length };
  }

  // ==================== AI 摘要生成 ====================

  async generateSummary(content, options = {}) {
    if (!content || typeof content !== 'string') throw new Error('内容不能为空');
    const { length = 'brief', language = 'zh', aiClient, onChunk, signal } = options;
    if (!aiClient) throw new Error('需要提供 aiClient 实例');
    const prompt = this._buildPrompt(content, { length, language });
    const messages = [{ role: 'user', content: prompt }];
    const streamOpts = { systemPrompt: this._getSystemPrompt(language), signal, model: aiClient.model, maxTokens: aiClient.maxTokens || 4096 };
    let fullResponse = '';
    if (onChunk && typeof onChunk === 'function') {
      for await (const chunk of aiClient.chatStream(messages, streamOpts)) {
        if (signal?.aborted) break;
        fullResponse += chunk;
        onChunk(chunk);
      }
    } else {
      fullResponse = await aiClient.chat(messages, streamOpts);
    }
    return fullResponse;
  }

  // ==================== Prompt 构建 ====================

  _buildPrompt(content, options) {
    const { length, language } = options;
    const lengthGuide = length === 'detailed'
      ? '请生成详细摘要，每个要点可以展开说明（2-3 句），重要细节尽可能保留。'
      : '请生成简洁摘要，每个要点精炼到一句话。';
    if (language === 'en') {
      return `Please generate a structured summary of the following content:\n1. Core Topic (one sentence)\n2. Key Points (3-5 items)\n3. Important Details\n4. Action Suggestions\n\n${lengthGuide}\n\nContent:\n${content}`;
    }
    return `请对以下内容生成结构化摘要：\n1. 核心主题（一句话）\n2. 关键要点（3-5个）\n3. 重要细节\n4. 行动建议\n\n${lengthGuide}\n\n内容：\n${content}`;
  }

  _getSystemPrompt(language) {
    if (language === 'en') return 'You are a professional content summarizer. Generate clear, well-structured summaries in Markdown format. Use bullet points for key points and details.';
    return '你是一个专业的内容摘要助手。请用 Markdown 格式生成清晰、结构化的摘要。关键要点和细节使用列表格式。';
  }

  // ==================== 内部方法 — 委托 extract 模块 ====================

  _parseHTML(html) { return parseHTML(html); }
  _basicParse(html) { return basicParse(html); }
  _stripTags(html) { return stripTags(html); }
  _extractTitle(doc) { return extractTitle(doc); }
  _extractTitleFromRegex(html) { return extractTitleFromRegex(html); }
  _removeNoiseElements(doc) { return removeNoiseElements(doc); }
  _tryHighConfidenceSelectors(doc) { return tryHighConfidenceSelectors(doc, (el) => this._getTextLength(el)); }

  // ==================== 内部：评分算法 ====================

  _scoreAndSelectBestCandidate(doc) {
    const candidates = doc.body?.querySelectorAll?.('div, section') || [];
    if (!candidates.length) return doc.body;
    let bestCandidate = null, bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = this._scoreCandidate(candidate);
      if (score > bestScore) { bestScore = score; bestCandidate = candidate; }
    }
    return bestCandidate || doc.body;
  }

  _scoreCandidate(element) {
    const text = element.textContent || '';
    const textLen = text.replace(/\s+/g, '').length;
    if (textLen < 50) return -1000;
    let score = Math.log2(textLen + 1) * 2;
    const paragraphs = (element.innerHTML || '').match(/<p[\s>]/gi) || [];
    score += paragraphs.length * 3;
    const contentLen = this._getContentTextLength(element);
    score += (contentLen / (textLen || 1)) * 20;
    const links = element.querySelectorAll?.('a') || [];
    const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.textContent?.length || 0), 0);
    const linkDensity = textLen > 0 ? linkTextLen / textLen : 0;
    if (linkDensity > 0.5) score -= 50;
    if (linkDensity > 0.3) score -= 20;
    const inputs = element.querySelectorAll?.('input, textarea, select') || [];
    score -= inputs.length * 10;
    return score;
  }

  // ==================== 内部：段落收集 ====================

  _collectParagraphs(root) {
    if (!root) return [];
    const paragraphs = [];
    const walker = this._createTextWalker(root);
    if (walker) {
      let node;
      while ((node = walker.nextNode?.())) {
        const text = node.textContent?.trim();
        if (text && text.length >= this.minParagraphLength) {
          const tag = node.tagName?.toUpperCase();
          if (tag?.startsWith('H')) {
            paragraphs.push('#'.repeat(Math.min(parseInt(tag[1]) || 2, 4)) + ' ' + text);
          } else if (tag === 'LI') {
            paragraphs.push('- ' + text);
          } else if (tag === 'BLOCKQUOTE') {
            paragraphs.push('> ' + text);
          } else {
            paragraphs.push(text);
          }
        }
      }
    }
    return paragraphs;
  }

  _createTextWalker(root) {
    if (typeof document !== 'undefined' && document.createTreeWalker) {
      return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (NOISE_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
          if (CONTENT_TAGS.has(node.tagName)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
    }
    return this._simpleWalker(root);
  }

  _simpleWalker(root) {
    const items = [];
    const collect = (el) => {
      if (!el) return;
      if (el.tag && CONTENT_TAGS.has(el.tag)) items.push(el);
      for (const child of (el.children || el.childNodes || [])) collect(child);
    };
    collect(root);
    let idx = 0;
    return {
      nextNode() {
        if (idx >= items.length) return null;
        const node = items[idx++];
        node.tagName = node.tag || node.tagName || 'P';
        return node;
      }
    };
  }

  _getTextLength(el) { return (el.textContent || '').replace(/\s+/g, '').length; }

  _getContentTextLength(el) {
    if (!el.querySelectorAll) return this._getTextLength(el);
    let len = 0;
    for (const tag of CONTENT_TAGS) {
      const els = el.querySelectorAll(tag) || [];
      els.forEach?.(e => { len += (e.textContent || '').length; });
    }
    return len || this._getTextLength(el);
  }
}
