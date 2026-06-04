/**
 * MessageRenderer — 消息操作与交互
 *
 * 从 message-renderer.js 拆分而来 (R193)
 * 包含: handleMessageAction、_injectQuoteAttributes、_sendLocateAndHighlight、
 *       injectCodeBlockRunButtons、extractRunnableCodeBlocks
 *
 * @module lib/message-renderer-actions
 */

import { MessageRenderer } from './message-renderer-dom.js';

// ==================== 消息操作 ====================

MessageRenderer.prototype.handleMessageAction = async function(action, messageEl) {
  const bubble = messageEl.querySelector('.message-bubble');
  const text = bubble.textContent;

  const lastInteraction = this.evolution.interactions.slice(-1)[0];
  const interactionId = lastInteraction?.id;

  switch (action) {
    case 'copy':
      await navigator.clipboard.writeText(text);
      this.addSystemMessage('已复制到剪贴板');
      if (interactionId) this.evolution.recordSignal('copied', interactionId);
      break;
    case 'run':
      this._runAllCodeBlocks(messageEl);
      if (interactionId) this.evolution.recordSignal('code_executed', interactionId);
      break;
    case 'save':
      await this._saveToKnowledgeBase(text);
      if (interactionId) this.evolution.recordSignal('saved_to_kb', interactionId);
      break;
    case 'highlight': {
      let selectionInfo = null;
      try {
        selectionInfo = await chrome.tabs.sendMessage(this.currentTabId, { action: 'getSelectionInfo' });
      } catch (e) { console.debug('[PageWise] renderer-action: getSelectionInfo skipped', _e); }
        console.debug("[PageWise] message-renderer-actions failed", e);

      let textToHighlight = selectionInfo?.text || '';
      let xpath = selectionInfo?.xpath || '';
      let offset = selectionInfo?.offset || 0;

      if (!textToHighlight) {
        const codeMatch = text.match(/`([^`]+)`/);
        if (codeMatch) {
          textToHighlight = codeMatch[1];
          xpath = '';
          offset = 0;
        }
      }

      if (!textToHighlight) {
        this.addSystemMessage('请先在页面中选中文本');
        break;
      }

      try {
        const result = await chrome.tabs.sendMessage(this.currentTabId, {
          action: 'saveHighlight',
          highlight: { text: textToHighlight, xpath, offset }
        });
        if (result?.success) {
          this.addSystemMessage(result.duplicate ? '该文本已高亮 ✓' : '已高亮标注 📌');
          if (!result.duplicate) {
            try {
              const { incrementCounter } = await import('./stats.js');
              incrementCounter('totalHighlights');
            } catch (e) { console.debug('[PageWise] renderer-action: stats increment skipped', _e); }
              console.debug("[PageWise] message-renderer-actions:result failed", e);
          }
        } else {
          this.addSystemMessage(`高亮失败：${result?.error || '未知错误'}`);
        }
      } catch (e) {
        console.debug("[PageWise] message-renderer-actions failed", e);
        this.addSystemMessage('高亮失败：请刷新页面后重试');
      }
      if (interactionId) this.evolution.recordSignal('highlighted', interactionId);
      break;
    }
    case 'branch':
      this._handleBranch(messageEl);
      break;
  }
};

// ==================== 引用注入 ====================

MessageRenderer.prototype._injectQuoteAttributes = function(messageDiv) {
  const inlineCodes = messageDiv.querySelectorAll('code:not(pre code)');
  for (const code of inlineCodes) {
    const text = code.textContent.trim();
    if (!text) continue;
    code.setAttribute('data-quote', text);
    code.classList.add('pw-quote-link');
    code.addEventListener('click', (e) => {
      e.preventDefault();
      this._sendLocateAndHighlight(code.dataset.quote);
    });
  }

  const blockquotes = messageDiv.querySelectorAll('blockquote');
  for (const bq of blockquotes) {
    const fullText = bq.textContent.trim();
    if (!fullText) continue;
    const truncated = fullText.slice(0, 200);
    bq.setAttribute('data-quote', truncated);
    bq.classList.add('pw-quote-link');
    bq.addEventListener('click', (e) => {
      e.preventDefault();
      this._sendLocateAndHighlight(bq.dataset.quote);
    });
  }
};

MessageRenderer.prototype._sendLocateAndHighlight = async function(text) {
  if (!text) return;
  try {
    const result = await chrome.tabs.sendMessage(this.currentTabId, {
      action: 'locateAndHighlight',
      text
    });
    if (result && !result.success) {
      this.addSystemMessage('未在页面中找到该内容');
    }
  } catch (e) {
    console.debug("[PageWise] message-renderer-actions:result failed", e);
    this.addSystemMessage('请刷新页面后重试');
  }
};

// ==================== 代码块运行 ====================

MessageRenderer.prototype.injectCodeBlockRunButtons = function(messageEl, rawContent) {
  const blocks = this.extractRunnableCodeBlocks(rawContent);
  if (blocks.length === 0) return;

  const codeBlockWrappers = messageEl.querySelectorAll('.code-block-wrapper');
  let blockIndex = 0;

  codeBlockWrappers.forEach((wrapper) => {
    const codeEl = wrapper.querySelector('code');
    if (!codeEl) return;

    const langClass = codeEl.className || '';
    const isHtml = /lang-html/i.test(langClass);
    const isJs = /lang-javascript/i.test(langClass) || /lang-js/i.test(langClass);

    if (!isHtml && !isJs) return;

    const lang = isHtml ? 'html' : 'javascript';

    const codeData = blocks[blockIndex];
    blockIndex++;
    if (!codeData) return;

    const runBtn = document.createElement('button');
    runBtn.className = 'code-run-btn';
    runBtn.textContent = '▶️ 运行';
    runBtn.title = '运行代码';
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._executeCodeSandbox(codeData.code, lang, wrapper);
    });
    wrapper.appendChild(runBtn);
  });
};

MessageRenderer.prototype.extractRunnableCodeBlocks = function(markdownContent) {
  const blocks = [];
  const regex = /```(html|javascript)\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(markdownContent)) !== null) {
    blocks.push({ lang: match[1].toLowerCase(), code: match[2] });
  }
  return blocks;
};
