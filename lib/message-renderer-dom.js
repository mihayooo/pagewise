/**
 * MessageRenderer — DOM 渲染与懒加载
 *
 * 从 message-renderer.js 拆分而来 (R193)
 * 包含: MAX_RENDERED、LOAD_BATCH、MessageRenderer 类
 *       constructor、懒渲染初始化、消息构建、消息管理
 *
 * @module lib/message-renderer-dom
 */

import { renderMarkdown } from './utils.js';

/** DOM 中最多同时渲染的消息数 */
export const MAX_RENDERED = 50;
/** 每次滚动到顶部加载的旧消息数 */
export const LOAD_BATCH = 20;

export class MessageRenderer {
  constructor({ chatArea, escapeHtml, scrollToBottom, evolution, currentTabId, saveToKnowledgeBase, handleBranch, runAllCodeBlocks, executeCodeSandbox }) {
    this.chatArea = chatArea;
    this.escapeHtml = escapeHtml;
    this.scrollToBottom = scrollToBottom;
    this.evolution = evolution;
    this.currentTabId = currentTabId;
    this._saveToKnowledgeBase = saveToKnowledgeBase;
    this._handleBranch = handleBranch;
    this._runAllCodeBlocks = runAllCodeBlocks;
    this._executeCodeSandbox = executeCodeSandbox;

    // ---- Lazy rendering state ----
    /** @type {Array<{type:string, data:string, extra?:string}>} */
    this._allMessages = [];
    /** Range of _allMessages currently rendered in DOM [start, end) */
    this._renderedRange = { start: 0, end: 0 };
    this._loadingOlder = false;
    this._initLazyRendering();
  }

  _initLazyRendering() {
    this._sentinel = document.createElement('div');
    this._sentinel.className = 'pw-lazy-sentinel';
    this._sentinel.style.height = '1px';
    this.chatArea.appendChild(this._sentinel);

    this._observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !this._loadingOlder) {
          this._loadingOlder = true;
          this._renderOlderMessages();
          this._observer?.disconnect();
          setTimeout(() => {
            if (this._sentinel && this.chatArea) {
              this._observer?.observe(this._sentinel);
            }
            this._loadingOlder = false;
          }, 100);
        }
      },
      { root: this.chatArea, threshold: 0 }
    );
    this._observer.observe(this._sentinel);
  }

  _renderOlderMessages() {
    const { start } = this._renderedRange;
    if (start <= 0) return;

    const newStart = Math.max(0, start - LOAD_BATCH);
    const fragment = document.createDocumentFragment();
    for (let i = newStart; i < start; i++) {
      const msg = this._allMessages[i];
      const el = this._createMessageElement(msg);
      fragment.appendChild(el);
    }
    const firstRendered = this.chatArea.querySelector('.pw-lazy-msg');
    if (firstRendered) {
      this.chatArea.insertBefore(fragment, firstRendered);
    } else {
      this.chatArea.insertBefore(fragment, this._sentinel);
    }
    this._renderedRange.start = newStart;
    this._trimRenderedMessages();
  }

  _trimRenderedMessages() {
    const rendered = this.chatArea.querySelectorAll('.pw-lazy-msg');
    const count = rendered.length;
    if (count <= MAX_RENDERED) return;

    const excess = count - MAX_RENDERED;
    for (let i = rendered.length - 1; i >= rendered.length - excess; i--) {
      rendered[i].remove();
    }
    this._renderedRange.end -= excess;
  }

  _createMessageElement(msg) {
    switch (msg.type) {
      case 'user': return this._buildUserElement(msg.data, msg.extra);
      case 'ai':   return this._buildAIElement(msg.data);
      case 'system': return this._buildSystemElement(msg.data);
      default: {
        const d = document.createElement('div');
        d.className = 'message pw-lazy-msg';
        d.textContent = msg.data;
        return d;
      }
    }
  }

  _buildUserElement(text, selection = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user pw-lazy-msg';
    messageDiv.innerHTML = `
      <div class="message-bubble">
        ${selection ? `<div class="selection-quote" style="font-size:11px;opacity:0.8;margin-bottom:4px;padding:4px 8px;background:rgba(255,255,255,0.15);border-radius:4px;border-left:2px solid rgba(255,255,255,0.4);">"${this.escapeHtml(selection.slice(0, 200))}"</div>` : ''}
        ${this.escapeHtml(text)}
      </div>
    `;
    return messageDiv;
  }

  _buildAIElement(content) {
    const hasRunnableCode = /```(?:html|javascript)\n[\s\S]*?```/i.test(content);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai pw-lazy-msg';
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-bubble">${renderMarkdown(content)}</div>
        <div class="message-actions">
          <button class="msg-action-btn" data-action="copy">复制</button>
          <button class="msg-action-btn" data-action="save">💾 保存</button>
          <button class="msg-action-btn" data-action="highlight">📌 高亮</button>
          <button class="msg-action-btn" data-action="branch">🔀 分支</button>
          ${hasRunnableCode ? '<button class="msg-action-btn msg-action-run" data-action="run">▶️ 运行</button>' : ''}
        </div>
      </div>
    `;
    messageDiv.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleMessageAction(btn.dataset.action, messageDiv));
    });
    if (hasRunnableCode) {
      this.injectCodeBlockRunButtons(messageDiv, content);
    }
    this._injectQuoteAttributes(messageDiv);
    return messageDiv;
  }

  _buildSystemElement(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message pw-lazy-msg';
    messageDiv.innerHTML = `
      <div style="text-align:center;font-size:12px;color:var(--text-muted);padding:4px 0;">
        ${this.escapeHtml(text)}
      </div>
    `;
    return messageDiv;
  }

  _appendNewMessage(messageDiv) {
    this.chatArea.insertBefore(messageDiv, this._sentinel);
    this._renderedRange.end = this._allMessages.length;

    const rendered = this.chatArea.querySelectorAll('.pw-lazy-msg');
    if (rendered.length > MAX_RENDERED) {
      const excess = rendered.length - MAX_RENDERED;
      for (let i = 0; i < excess; i++) {
        rendered[i].remove();
      }
      this._renderedRange.start += excess;
    }
  }

  addUserMessage(text, selection = '') {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    this._allMessages.push({ type: 'user', data: text, extra: selection });

    const messageDiv = this._buildUserElement(text, selection);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
  }

  addAIMessage(content) {
    this._allMessages.push({ type: 'ai', data: content });

    const messageDiv = this._buildAIElement(content);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  updateAIMessage(messageEl, content) {
    const bubble = messageEl.querySelector('.message-bubble');
    bubble.innerHTML = renderMarkdown(content);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    this._allMessages.push({ type: 'system', data: text });

    const messageDiv = this._buildSystemElement(text);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-ai';
    loadingDiv.innerHTML = `
      <div class="thinking-indicator">
        <div class="thinking-dots">
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
        </div>
        <span class="thinking-text">正在思考...</span>
      </div>
    `;
    this.chatArea.appendChild(loadingDiv);
    this.scrollToBottom();
    return loadingDiv;
  }

  reset() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    this.chatArea.innerHTML = '';

    this._allMessages = [];
    this._renderedRange = { start: 0, end: 0 };
    this._loadingOlder = false;

    this._sentinel = document.createElement('div');
    this._sentinel.className = 'pw-lazy-sentinel';
    this._sentinel.style.height = '1px';
    this.chatArea.appendChild(this._sentinel);

    this._observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !this._loadingOlder) {
          this._loadingOlder = true;
          this._renderOlderMessages();
          this._observer?.disconnect();
          setTimeout(() => {
            if (this._sentinel && this.chatArea) {
              this._observer?.observe(this._sentinel);
            }
            this._loadingOlder = false;
          }, 100);
        }
      },
      { root: this.chatArea, threshold: 0 }
    );
    this._observer.observe(this._sentinel);
  }

  getMessageCount() {
    return this._allMessages.length;
  }

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._sentinel && this._sentinel.parentNode) {
      this._sentinel.remove();
    }
    this._sentinel = null;
  }
}
