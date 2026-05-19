/**
 * sidebar-settings.js — 设置/配置、提供商、Profile、备份、日志详情、页面预览
 */
import { AIClient } from '../lib/ai-client.js';
import { storageGet, storageSet } from '../lib/storage-adapter.js';
import { getSettings, saveSettings, saveProfiles, loadProfiles } from '../lib/utils.js';
import { getShortcuts, matchShortcut } from '../lib/shortcuts.js';
import { getLogs, clearLogs as clearLogStore, exportLogs, recordMetric, getRecentMetrics, getPerformanceStats, clearMetrics } from '../lib/log-store.js';

/** 提供商预设 */
export const PROVIDERS = {
  openai: { name: 'OpenAI', icon: '🟢', protocol: 'openai', baseUrl: 'https://api.openai.com', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  claude: { name: 'Claude', icon: '🟣', protocol: 'claude', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] },
  deepseek: { name: 'DeepSeek', icon: '🔵', protocol: 'openai', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'] },
  ollama: { name: 'Ollama', icon: '🟠', protocol: 'openai', baseUrl: 'http://localhost:11434', models: ['llama3', 'codellama', 'mistral', 'qwen2'] },
  custom: { name: '自定义', icon: '⚙️', protocol: 'openai', baseUrl: '', models: [] }
};

export function setupSettings(SidebarApp) {

  // ==================== 设置加载/保存 ====================
  SidebarApp.prototype.loadSettings = async function loadSettings() {
    this.settings = await getSettings();
    console.log('[PageWise] loadSettings:', { hasApiKey: !!this.settings.apiKey, baseUrl: this.settings.apiBaseUrl, model: this.settings.model });
    if (this.settings.apiKey) {
      this.aiClient = new AIClient({ apiKey: this.settings.apiKey, baseUrl: this.settings.apiBaseUrl, model: this.settings.model, maxTokens: this.settings.maxTokens, protocol: this.settings.apiProtocol });
    }
  };

  SidebarApp.prototype.loadShortcuts = async function loadShortcuts() {
    this.shortcuts = await getShortcuts();
    console.log('[PageWise] loadShortcuts:', this.shortcuts);
  };

  SidebarApp.prototype.loadSettingsForm = function loadSettingsForm() {
    const provider = this.settings.apiProvider || 'openai';
    this.selectProvider(provider);
    this.apiBaseUrlInput.value = this.settings.apiBaseUrl || '';
    this.apiKeyInput.value = this.settings.apiKey || '';
    this.modelInput.value = this.settings.model || '';
    this.maxTokensInput.value = this.settings.maxTokens || 4096;
    this.autoExtractCheckbox.checked = this.settings.autoExtract || false;
    this.themeSelect.value = this.settings.theme || 'light';
  };

  SidebarApp.prototype.saveSettingsForm = async function saveSettingsForm() {
    const newSettings = {
      apiProvider: this.selectedProvider,
      apiProtocol: PROVIDERS[this.selectedProvider]?.protocol || 'openai',
      apiBaseUrl: this.apiBaseUrlInput.value.trim().replace(/\/+$/, ''),
      apiKey: this.apiKeyInput.value.trim(),
      model: this.modelInput.value.trim(),
      maxTokens: parseInt(this.maxTokensInput.value),
      autoExtract: this.autoExtractCheckbox.checked,
      theme: this.themeSelect.value
    };
    await saveSettings(newSettings);
    this.settings = newSettings;
    if (newSettings.apiKey) {
      this.aiClient = new AIClient({ apiKey: newSettings.apiKey, baseUrl: newSettings.apiBaseUrl, model: newSettings.model, maxTokens: newSettings.maxTokens, protocol: newSettings.apiProtocol });
    }
    this.applyTheme();
    this.showToast('设置已保存', 'success');
  };

  // ==================== 测试连接 ====================
  SidebarApp.prototype.testConnection = async function testConnection() {
    const protocol = PROVIDERS[this.selectedProvider]?.protocol || 'openai';
    const baseUrl = this.apiBaseUrlInput.value.trim().replace(/\/+$/, '');
    const apiKey = this.apiKeyInput.value.trim();
    const model = this.modelInput.value.trim();
    if (!apiKey) { this.showTestResult(false, '请先填写 API Key'); return; }
    if (!baseUrl) { this.showTestResult(false, '请先填写 API 地址'); return; }
    this.btnTestConnection.disabled = true;
    this.btnTestConnection.textContent = '测试中...';
    this.testResult.classList.add('hidden');
    const client = new AIClient({ apiKey, baseUrl, model: model || 'gpt-4o', protocol });
    const result = await client.testConnection();
    this.btnTestConnection.disabled = false;
    this.btnTestConnection.textContent = '测试连接';
    if (result.success) this.showTestResult(true, `${result.protocol} | 模型: ${result.model} | ✓`);
    else this.showTestResult(false, `${result.protocol} | ${result.error}`);
  };

  SidebarApp.prototype.showTestResult = function showTestResult(success, message) {
    this.testResult.classList.remove('hidden', 'success', 'error');
    this.testResult.classList.add(success ? 'success' : 'error');
    this.testResult.textContent = message;
  };

  // ==================== 主题 ====================
  SidebarApp.prototype.applyTheme = function applyTheme() {
    const theme = this.settings?.theme || 'light';
    if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
    else if (theme === 'auto') document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    else delete document.documentElement.dataset.theme;
  };

  // ==================== 数据备份 ====================
  SidebarApp.prototype.exportBackup = async function exportBackup() {
    try {
      const settings = await storageGet(null);
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      await kb.init();
      const entries = await kb.getAllEntries(100000);
      const backup = { version: 1, exportedAt: new Date().toISOString(), settings, knowledge: entries };
      const json = JSON.stringify(backup, null, 2);
      const filename = `pagewise-backup-${new Date().toISOString().slice(0, 10)}.json`;
      this.downloadFile(json, filename, 'application/json;charset=utf-8');
      this.showToast(`已导出 ${entries.length} 条知识和设置`, 'success');
    } catch (err) { this.showToast('导出备份失败: ' + err.message, 'error'); }
  };

  SidebarApp.prototype.importBackup = async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file, 'utf-8');
      });
      const data = JSON.parse(text);
      if (!data.version || !data.settings || !Array.isArray(data.knowledge)) { this.showToast('备份文件格式无效', 'error'); return; }
      const confirmed = confirm(`确认导入备份？\n\n导出时间: ${data.exportedAt || '未知'}\n知识条目: ${data.knowledge.length} 条\n\n导入将覆盖当前设置，知识条目会跳过重复项。`);
      if (!confirmed) return;
      await storageSet(data.settings);
      this.settings = data.settings;
      this.loadSettingsForm();
      this.applyTheme();
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      await kb.init();
      let imported = 0, skipped = 0;
      for (const entry of data.knowledge) {
        const result = await kb.saveEntry(entry);
        if (result && result.duplicate) skipped++; else imported++;
      }
      this.showToast(`导入完成：${imported} 条新增，${skipped} 条跳过（重复）`, 'success');
    } catch (err) { this.showToast('导入备份失败: ' + err.message, 'error'); }
  };

  // ==================== 提供商 / Profile / 模型发现 ====================
  SidebarApp.prototype.renderProviderCards = function renderProviderCards() {
    if (!this.providerCards) return;
    this.providerCards.innerHTML = Object.entries(PROVIDERS).map(([key, p]) =>
      `<div class="provider-card ${key === this.selectedProvider ? 'active' : ''}" data-provider="${key}">
        <span class="provider-icon">${p.icon}</span>
        <span class="provider-name">${p.name}</span>
      </div>`
    ).join('');
    this.providerCards.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => this.selectProvider(card.dataset.provider));
    });
  };

  SidebarApp.prototype.selectProvider = function selectProvider(key) {
    if (!PROVIDERS[key]) return;
    this.selectedProvider = key;
    const p = PROVIDERS[key];
    this.providerCards?.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('active', card.dataset.provider === key);
    });
    if (!this.apiBaseUrlInput.value || Object.values(PROVIDERS).some(v => v.baseUrl === this.apiBaseUrlInput.value))
      this.apiBaseUrlInput.value = p.baseUrl;
    if (!this.modelInput.value || Object.values(PROVIDERS).some(v => v.models.includes(this.modelInput.value)))
      this.modelInput.value = p.models[0] || '';
    this.updateModelSelect(p.models);
  };

  SidebarApp.prototype.updateModelSelect = function updateModelSelect(models) {
    if (!this.modelSelect) return;
    if (models && models.length > 0) {
      this.modelSelect.classList.remove('hidden');
      this.modelSelect.innerHTML = '<option value="">选择模型...</option>' +
        models.map(m => `<option value="${m}" ${m === this.modelInput.value ? 'selected' : ''}>${m}</option>`).join('');
    } else { this.modelSelect.classList.add('hidden'); }
  };

  SidebarApp.prototype.fetchModels = async function fetchModels() {
    const baseUrl = this.apiBaseUrlInput.value.trim().replace(/\/+$/, '');
    const apiKey = this.apiKeyInput.value.trim();
    const protocol = PROVIDERS[this.selectedProvider]?.protocol || 'openai';
    if (!apiKey) { this.showToast('请先填写 API Key', 'warning'); return; }
    if (!baseUrl) { this.showToast('请先填写 API 地址', 'warning'); return; }
    this.btnFetchModels.disabled = true;
    this.btnFetchModels.textContent = '获取中...';
    try {
      const client = new AIClient({ apiKey, baseUrl, protocol });
      const models = await client.listModels();
      if (models.length > 0) { this.updateModelSelect(models); this.showToast(`发现 ${models.length} 个模型`, 'success'); }
      else this.showToast('未发现可用模型', 'warning');
    } catch (e) { this.showToast(`获取失败: ${e.message}`, 'error'); }
    finally { this.btnFetchModels.disabled = false; this.btnFetchModels.textContent = '获取模型'; }
  };

  SidebarApp.prototype.loadProfileList = async function loadProfileList() {
    this.profiles = await loadProfiles();
    this.profileSelect.innerHTML = '<option value="default">默认配置</option>' +
      this.profiles.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');
    if (this.settings.activeProfileId && this.settings.activeProfileId !== 'default') {
      this.profileSelect.value = this.settings.activeProfileId;
      this.switchProfile(this.settings.activeProfileId);
    }
  };

  SidebarApp.prototype.switchProfile = function switchProfile(id) {
    this.activeProfileId = id;
    if (id === 'default') return;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    this.selectProvider(profile.provider || 'custom');
    this.apiBaseUrlInput.value = profile.baseUrl || '';
    this.apiKeyInput.value = profile.apiKey || '';
    this.modelInput.value = profile.model || '';
    this.maxTokensInput.value = profile.maxTokens || 4096;
  };

  SidebarApp.prototype.saveProfile = async function saveProfile() {
    const name = prompt('配置名称：', PROVIDERS[this.selectedProvider]?.name || '自定义');
    if (!name) return;
    const profile = { id: 'profile_' + Date.now(), name, provider: this.selectedProvider, baseUrl: this.apiBaseUrlInput.value.trim(), apiKey: this.apiKeyInput.value.trim(), model: this.modelInput.value.trim(), maxTokens: parseInt(this.maxTokensInput.value) || 4096 };
    this.profiles.push(profile);
    await saveProfiles(this.profiles);
    await this.loadProfileList();
    this.profileSelect.value = profile.id;
    this.showToast(`配置 "${name}" 已保存`, 'success');
  };

  SidebarApp.prototype.deleteProfile = async function deleteProfile() {
    const id = this.profileSelect.value;
    if (id === 'default') { this.showToast('不能删除默认配置', 'warning'); return; }
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    if (!confirm(`确定删除配置 "${profile.name}"？`)) return;
    this.profiles = this.profiles.filter(p => p.id !== id);
    await saveProfiles(this.profiles);
    await this.loadProfileList();
    this.showToast('配置已删除', 'info');
  };

  // ==================== 日志详情 ====================
  SidebarApp.prototype.loadLogsList = function loadLogsList() {
    const list = document.getElementById('logsList');
    if (!list) return;
    const levelFilter = document.getElementById('logLevelFilter')?.value || 'all';
    const moduleFilter = document.getElementById('logModuleFilter')?.value || 'all';
    const moduleSelect = document.getElementById('logModuleFilter');
    if (moduleSelect && moduleSelect.options.length <= 1) {
      ['sidebar', 'ai-client', 'knowledge-base', 'skill-engine', 'memory', 'evolution', 'storage'].forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.textContent = m; moduleSelect.appendChild(opt);
      });
    }
    let logs = getLogs();
    if (levelFilter !== 'all') logs = logs.filter(l => l.level === levelFilter);
    if (moduleFilter !== 'all') logs = logs.filter(l => l.module === moduleFilter);
    if (logs.length === 0) { list.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">📋</div><p>暂无日志</p></div>'; return; }
    const levelIcons = { info: 'ℹ️', warn: '⚠️', error: '❌', debug: '🔍' };
    list.innerHTML = logs.slice(-200).reverse().map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<div class="log-entry log-${log.level}"><span class="log-time">${time}</span><span class="log-icon">${levelIcons[log.level] || '📝'}</span><span class="log-module">[${this.escapeHtml(log.module)}]</span><span class="log-message">${this.escapeHtml(log.message)}</span></div>`;
    }).join('');
    const perfSection = document.getElementById('logPerformance');
    if (perfSection) perfSection.innerHTML = this._buildPerformanceSection();
  };

  SidebarApp.prototype._buildPerformanceSection = function _buildPerformanceSection() {
    const stats = getPerformanceStats();
    const recentApi = getRecentMetrics('api', 10);
    let html = '<div class="perf-grid">';
    for (const [key, data] of Object.entries(stats)) {
      html += `<div class="perf-card"><div class="perf-label">${this.escapeHtml(key)}</div><div class="perf-value">${data.avg?.toFixed(0) || 0}ms</div><div class="perf-sub">min: ${data.min?.toFixed(0) || 0}ms · max: ${data.max?.toFixed(0) || 0}ms</div></div>`;
    }
    html += '</div>';
    if (recentApi.length > 0) {
      html += '<div class="perf-recent"><h4>最近 API 调用</h4>';
      html += recentApi.map(m => {
        const time = new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `<div class="perf-api-entry"><span class="perf-api-time">${time}</span><span class="perf-api-value">${m.value?.toFixed(0) || 0}ms</span><span class="perf-api-model">${this.escapeHtml(m.details?.model || '')}</span></div>`;
      }).join('');
      html += '</div>';
    }
    return html;
  };

  SidebarApp.prototype.exportLogsFile = function exportLogsFile() {
    const text = exportLogs();
    if (!text) { this.showToast('暂无可导出的日志', 'warning'); return; }
    const filename = `pagewise-logs-${new Date().toISOString().slice(0, 10)}.json`;
    this.downloadFile(text, filename, 'application/json');
    this.showToast('日志已导出', 'success');
  };

  // ==================== 页面预览 ====================
  SidebarApp.prototype.loadPagePreview = async function loadPagePreview() {
    if (!this.currentPageContent) {
      this.previewTitle.textContent = this.pageTitle?.textContent || '-';
      this.previewMeta.textContent = '正在提取页面内容...';
      this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>正在提取...</p></div>';
      this.previewCode.innerHTML = '';
      await this.extractContent();
    }
    if (!this.currentPageContent) {
      this.previewTitle.textContent = this.pageTitle?.textContent || '-';
      this.previewMeta.textContent = '';
      this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>无法提取页面内容</p></div>';
      this.previewCode.innerHTML = '';
      return;
    }
    const { url, title, content, codeBlocks } = this.currentPageContent;
    this.previewTitle.textContent = title || '-';
    const charCount = content ? content.length : 0;
    const metaParts = [];
    if (url) metaParts.push(this.escapeHtml(url));
    metaParts.push(`${charCount} 字`);
    if (codeBlocks && codeBlocks.length > 0) metaParts.push(`${codeBlocks.length} 个代码块`);
    this.previewMeta.innerHTML = metaParts.join(' · ');
    const MAX_CHARS = 2000;
    if (content && content.length > 0) {
      const displayText = content.slice(0, MAX_CHARS);
      let html = `<pre class="page-preview-text">${this.escapeHtml(displayText)}</pre>`;
      if (content.length > MAX_CHARS) html += `<div class="page-preview-truncated">⚠️ 内容已截取，仅显示前 2000 字符（共 ${charCount} 字）</div>`;
      this.previewContent.innerHTML = html;
    } else { this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>未提取到文本内容</p></div>'; }
    if (codeBlocks && codeBlocks.length > 0) {
      let codeHtml = '<div class="page-preview-code-header">代码块</div>';
      codeBlocks.forEach(block => {
        const lang = block.lang || 'text';
        const preview = block.code.slice(0, 500);
        codeHtml += `<div class="page-preview-code-block"><div class="page-preview-code-lang">${this.escapeHtml(lang)}</div><pre><code>${this.escapeHtml(preview)}${block.code.length > 500 ? '\n... (已截取)' : ''}</code></pre></div>`;
      });
      this.previewCode.innerHTML = codeHtml;
    } else { this.previewCode.innerHTML = ''; }
  };

  SidebarApp.prototype.loadPageImages = async function loadPageImages() {
    if (!this.previewImages) return;
    this.previewImages.innerHTML = '';
    try {
      if (!this.currentTabId) return;
      const response = await chrome.tabs.sendMessage(this.currentTabId, { action: 'extractPageImages' });
      if (!response || !response.images || response.images.length === 0) return;
      this.pageImages = response.images;
      let html = '<div class="page-preview-images-header">🖼️ 页面图片（点击提问）</div><div class="image-grid">';
      response.images.forEach((img, i) => {
        const alt = img.alt ? this.escapeHtml(img.alt) : '';
        html += `<div class="image-grid-item" data-index="${i}" data-src="${this.escapeHtml(img.src)}" title="${alt || img.src}"><img src="${this.escapeHtml(img.src)}" alt="${alt}" loading="lazy" />${alt ? `<span class="image-alt">${alt}</span>` : ''}<span class="image-ask-badge">🔍 问AI</span></div>`;
      });
      html += '</div>';
      this.previewImages.innerHTML = html;
      this.previewImages.querySelectorAll('.image-grid-item').forEach(item => {
        item.addEventListener('click', () => {
          const src = item.dataset.src;
          const wasSelected = item.classList.contains('selected');
          this.previewImages.querySelectorAll('.image-grid-item').forEach(el => el.classList.remove('selected'));
          if (wasSelected) { this.selectedImageUrl = null; }
          else { item.classList.add('selected'); this.selectedImageUrl = src; this.userInput.value = '请解释这张图片的内容'; this.switchTab('chat'); }
        });
      });
    } catch (_e) { /* content script 可能未注入 */ }
  };
}
