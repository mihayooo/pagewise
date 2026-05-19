/**
 * sidebar-utils.js — 通用工具函数与页面上下文逻辑
 */
import { clearLogs as clearLogStore, recordMetric, clearMetrics } from '../lib/log-store.js';

export function setupUtils(SidebarApp) {

  // ==================== escapeHtml ====================
  SidebarApp.prototype.escapeHtml = function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
  SidebarApp.prototype._escapeHtml = SidebarApp.prototype.escapeHtml;

  // ==================== Toast 通知 ====================
  SidebarApp.prototype.showToast = function showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-message">${this.escapeHtml(message)}</span><button class="toast-close">&times;</button>`;
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    });
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  };

  // ==================== 屏幕阅读器公告 ====================
  SidebarApp.prototype._announceToScreenReader = function _announceToScreenReader(message) {
    if (!this.bookmarksLiveRegion) return;
    this.bookmarksLiveRegion.textContent = '';
    requestAnimationFrame(() => { this.bookmarksLiveRegion.textContent = message; });
  };

  // ==================== 文件下载 ====================
  SidebarApp.prototype.downloadFile = function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==================== Token 用量显示 ====================
  SidebarApp.prototype.updateTokenDisplay = function updateTokenDisplay() {
    if (!this.tokenDisplay) return;
    const count = this.conversationHistory.length;
    this.tokenDisplay.textContent = count > 0 ? `${count} 条消息` : '';
  };

  // ==================== 日志面板 ====================
  SidebarApp.prototype.initLogsPanel = function initLogsPanel() {
    document.getElementById('btnRefreshLogs')?.addEventListener('click', () => this.loadLogsList());
    document.getElementById('btnClearLogs')?.addEventListener('click', () => {
      clearLogStore(); clearMetrics(); this.loadLogsList();
      this.showToast('日志和性能指标已清除', 'success');
    });
    document.getElementById('btnExportLogs')?.addEventListener('click', () => this.exportLogsFile());
    document.getElementById('logLevelFilter')?.addEventListener('change', () => this.loadLogsList());
    document.getElementById('logModuleFilter')?.addEventListener('change', () => this.loadLogsList());
  };

  // ==================== 滚动 ====================
  SidebarApp.prototype.scrollToBottom = function scrollToBottom() {
    requestAnimationFrame(() => { this.chatArea.scrollTop = this.chatArea.scrollHeight; });
  };

  // ==================== getDomain ====================
  SidebarApp.prototype.getDomain = function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  };

  // ==================== 页面上下文 ====================
  SidebarApp.prototype.loadPageContext = async function loadPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.pageTitle.textContent = tab.title || '未知页面';
        this.currentTabId = tab.id;
        if (this.messageRenderer) this.messageRenderer.currentTabId = tab.id;
        this.currentTabUrl = tab.url;
        const isYouTube = tab.url?.includes('youtube.com/watch');
        this.isYouTubePage = isYouTube;
        if (this.settings.autoExtract) this.extractContent();
        if (isYouTube) this.showYouTubeQuickActions();
        this.detectAndShowApiDocActions(tab.id);
        this.detectAndShowGitHubRepoActions(tab.id);
        this.detectAndShowPdfActions(tab.id);
        const pageIcon = document.querySelector('.page-icon');
        if (pageIcon) {
          const isPdf = (tab.url || '').toLowerCase().endsWith('.pdf') || (tab.url || '').toLowerCase().includes('.pdf?');
          pageIcon.textContent = isPdf ? '📑' : isYouTube ? '📺' : '📄';
        }
      }
    } catch (_e) {
      this.pageTitle.textContent = '无法获取页面信息';
    }
  };

  // ==================== 消息重试 ====================
  SidebarApp.prototype._sendMessageWithRetry = async function _sendMessageWithRetry(tabId, message, maxRetries = 3) {
    const delays = [0, 500, 1000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (delays[attempt] > 0) await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      try { return await chrome.tabs.sendMessage(tabId, message); }
      catch (e) {
        if (attempt === maxRetries - 1) throw e;
        console.debug(`[PageWise] sendMessage 第 ${attempt + 1} 次失败，${delays[attempt + 1]}ms 后重试...`);
      }
    }
  };

  // ==================== 内容提取 ====================
  SidebarApp.prototype.extractContent = async function extractContent() {
    if (!this.currentTabId) { this.showToast('无法获取当前标签页', 'error'); return false; }
    const _extractStart = performance.now();
    try {
      const response = await this._sendMessageWithRetry(this.currentTabId, { action: 'extractContent' });
      if (response && response.content) {
        this.currentPageContent = response;
        this.addSystemMessage(`已提取页面内容：${response.content.length} 字，${response.codeBlocks?.length || 0} 个代码块`);
        const sense = this.pageSense.analyze(response);
        if (sense.types.length > 0) this.addSystemMessage(`页面类型：${sense.types.map(t => `${t.icon} ${t.label}`).join(' | ')}`);
        const suggestions = this.pageSense.suggestSkills(response, this.skills);
        if (suggestions.length > 0) this.showSkillSuggestions(suggestions);
        recordMetric('extraction', performance.now() - _extractStart, { contentLength: response.content.length, codeBlocks: response.codeBlocks?.length || 0 });
        return true;
      }
      const pageType = this.isYouTubePage ? 'youtube' : (this.currentTabUrl || '').toLowerCase().includes('.pdf') ? 'pdf' : 'general';
      this.showContentErrorMessage(_classifyContentError(null, pageType));
      return false;
    } catch (e) {
      console.error('[PageWise] extractContent failed:', e);
      const pageType = this.isYouTubePage ? 'youtube' : (this.currentTabUrl || '').toLowerCase().includes('.pdf') ? 'pdf' : 'general';
      this.showContentErrorMessage(_classifyContentError(e, pageType));
      return false;
    }
  };

  SidebarApp.prototype.showContentErrorMessage = function showContentErrorMessage(contentError) {
    if (!this.chatArea) return;
    let html = `<div class="content-error-msg">${this.escapeHtml(contentError.message)}`;
    if (contentError.fallback) html += `<div class="content-error-fallback">${this.escapeHtml(contentError.fallback)}</div>`;
    html += '</div>';
    const errDiv = document.createElement('div');
    errDiv.className = 'message message-system';
    errDiv.innerHTML = html;
    this.chatArea.appendChild(errDiv);
    const manualBtn = errDiv.querySelector('.btn-manual-input');
    if (manualBtn) manualBtn.addEventListener('click', () => { this.userInput.focus(); this.userInput.value = '请根据以下内容回答：\n'; });
    this.scrollToBottom();
  };

  // ==================== Vision / 截图 ====================
  SidebarApp.prototype.supportsVision = function supportsVision() {
    const model = (this.settings.model || '').toLowerCase();
    return ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'claude-sonnet', 'claude-opus', 'claude-haiku'].some(kw => model.includes(kw));
  };

  SidebarApp.prototype.captureScreenshot = async function captureScreenshot() {
    if (!this.supportsVision()) { this.showToast('⚠️ 当前模型不支持图片理解，请切换到支持 vision 的模型', 'warn'); return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { this.showToast('无法获取当前标签页', 'error'); return; }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      if (!dataUrl) { this.showToast('截图失败', 'error'); return; }
      this.screenshotDataUrl = dataUrl;
      if (this.screenshotPreview && this.screenshotThumb) { this.screenshotThumb.src = dataUrl; this.screenshotPreview.classList.remove('hidden'); }
      this.showToast('📸 截图已捕获，输入问题后发送即可', 'success');
    } catch (e) { this.showToast(`截图失败: ${e.message}`, 'error'); }
  };

  SidebarApp.prototype.clearScreenshot = function clearScreenshot() {
    this.screenshotDataUrl = null;
    if (this.screenshotPreview) this.screenshotPreview.classList.add('hidden');
    if (this.screenshotThumb) this.screenshotThumb.src = '';
  };

  // ==================== 内部工具 ====================
  function _classifyContentError(error, pageType) {
    if (!error) {
      if (pageType === 'youtube') return { message: 'YouTube 视频页面无法直接提取文本，请使用下方快捷按钮提取字幕', fallback: null };
      if (pageType === 'pdf') return { message: 'PDF 文档需要通过专用解析器提取内容', fallback: null };
      return { message: '页面内容为空，请尝试手动提取', fallback: null };
    }
    if (error.message?.includes('Receiving end does not exist')) return { message: '内容脚本未注入，请刷新页面后重试', fallback: '您可以手动复制页面文字粘贴到输入框' };
    return { message: `内容提取失败: ${error.message}`, fallback: '请刷新页面后重试' };
  }
}
