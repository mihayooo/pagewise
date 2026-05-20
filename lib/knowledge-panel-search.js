/**
 * knowledge-panel-search.js — KnowledgePanel 搜索与标签逻辑
 *
 * R196: 从 knowledge-panel.js 拆分
 * 包含: searchKnowledge/renderNoResults/loadKnowledgeTags/renderTagFilter
 *       showKnowledgeDetail/loadRelatedEntries/renderSemanticResults/highlightText
 */

import { renderMarkdown, formatTime } from './utils.js';

// ==================== 搜索方法 ====================

export const searchKnowledge = async function searchKnowledge() {
  const query = this.searchInput.value.trim();
  if (!query) {
    this._searchMode = null;
    this._searchQuery = null;
    this.loadKnowledgeList();
    return;
  }

  this._searchQuery = query;

  if (this._getSearchMode() === 'semantic') {
    const results = await this.memory.kb.combinedSearch(query, 1000);
    if (results.length === 0) {
      this._allFilteredEntries = [];
      this._currentEntries = [];
      this._allSemanticResults = null;
      this.renderNoResults(query);
    } else {
      this._searchMode = 'semantic';
      const filtered = this.activeTag
        ? results.filter(r => r.entry.tags?.includes(this.activeTag))
        : results;
      this._allFilteredEntries = filtered.map(r => r.entry);
      this._allSemanticResults = filtered;
      this._currentEntries = this._allFilteredEntries;
      this._initVirtualScroll();
    }
  } else {
    const results = await this.memory.kb.search(query);
    if (results.length === 0) {
      this._allFilteredEntries = [];
      this._currentEntries = [];
      this._allSemanticResults = null;
      this.renderNoResults(query);
    } else {
      this._searchMode = 'keyword';
      const filtered = this.activeTag
        ? results.filter(e => e.tags?.includes(this.activeTag))
        : results;
      this._allFilteredEntries = filtered;
      this._allSemanticResults = null;
      this._currentEntries = filtered;
      this._initVirtualScroll();
    }
  }
};

export const renderNoResults = async function renderNoResults(query) {
  const KB = this.memory.kb.constructor;
  const allEntries = await this.memory.kb.getAllEntries(500);
  const suggestions = KB.getSearchSuggestions(query, allEntries, 3);

  let html = `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>未找到匹配「${this.escapeHtml(query)}」的知识条目</p>
  `;

  if (suggestions.length > 0) {
    html += `<p class="search-suggestions-label">你是否想搜：</p>`;
    html += `<div class="search-suggestions">`;
    for (const suggestion of suggestions) {
      html += `<button class="search-suggestion-btn" data-query="${this.escapeHtml(suggestion)}">${this.escapeHtml(suggestion)}</button>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  this.knowledgeList.innerHTML = html;

  this.knowledgeList.querySelectorAll('.search-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      this.searchInput.value = btn.dataset.query;
      this.searchKnowledge();
    });
  });
};

// ==================== 语义搜索渲染 ====================

export const renderSemanticResults = function renderSemanticResults(results, query) {
  const filtered = this.activeTag
    ? results.filter(r => r.entry.tags?.includes(this.activeTag))
    : results;

  this.knowledgeList.innerHTML = filtered.map(result => {
    const entry = result.entry;
    const percent = Math.round(result.score * 100);
    const matchType = result.matchType || 'semantic';

    const titleHtml = this.highlightText(entry.title || '', query);
    const summaryText = entry.summary || entry.question || '';
    const summaryHtml = this.highlightText(summaryText, query);

    return `
      <div class="knowledge-item" data-id="${entry.id}">
        <div class="knowledge-item-header">
          <div class="knowledge-item-title">${titleHtml}</div>
          <div class="search-score-badge ${matchType}">${percent}%</div>
        </div>
        <div class="knowledge-item-summary">${summaryHtml}</div>
        <div class="knowledge-item-meta">
          <span>${formatTime(entry.createdAt)}</span>
          <span class="search-match-type">${matchType === 'keyword' ? '🔤 关键词' : '🧠 语义'}</span>
          <div class="knowledge-item-tags">
            ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
    item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
  });
};

export const highlightText = function highlightText(text, query) {
  if (!text || !query) return this.escapeHtml(text || '');
  const escaped = this.escapeHtml(text);
  const escapedQuery = this.escapeHtml(query);
  const regex = new RegExp(escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return escaped.replace(regex, '<mark class="search-highlight">$&</mark>');
};

// ==================== 标签 ====================

export const loadKnowledgeTags = async function loadKnowledgeTags() {
  const tags = await this.memory.getAllTags();
  const languages = await this.memory.kb.getAllLanguages();
  this.renderTagFilter(tags, languages);
};

export const renderTagFilter = function renderTagFilter(tags, languages = []) {
  const langFilterHtml = languages.length > 1 ? `
    <div class="language-filter" id="languageFilter">
      <span class="lang-chip ${!this.activeLanguage ? 'active' : ''}" data-lang="">全部语言</span>
      ${languages.map(l => {
        const langMap = { zh: '🇨🇳 中文', en: '🇬🇧 English', other: '🌐 Other' };
        return `<span class="lang-chip ${this.activeLanguage === l.language ? 'active' : ''}" data-lang="${l.language}">${langMap[l.language] || l.language} (${l.count})</span>`;
      }).join('')}
    </div>
  ` : '';

  if (tags.length === 0 && languages.length <= 1) {
    this.tagFilter.innerHTML = '';
    return;
  }
  this.tagFilter.innerHTML = `
    ${langFilterHtml}
    ${tags.length > 0 ? `
    <div class="tag-filter-tags">
      <span class="tag-chip ${!this.activeTag ? 'active' : ''}" data-tag="">全部</span>
      ${tags.slice(0, 15).map(t =>
        `<span class="tag-chip ${this.activeTag === t.tag ? 'active' : ''}" data-tag="${this.escapeHtml(t.tag)}">${this.escapeHtml(t.tag)} (${t.count})</span>`
      ).join('')}
    </div>
    ` : ''}
  `;

  this.tagFilter.querySelectorAll('.lang-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      this.activeLanguage = chip.dataset.lang || null;
      this.loadKnowledgeList();
      this.loadKnowledgeTags();
    });
  });

  this.tagFilter.querySelectorAll('.tag-filter-tags .tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      this.activeTag = chip.dataset.tag || null;
      this.loadKnowledgeList();
      this.loadKnowledgeTags();
    });
  });
};

// ==================== 详情 ====================

export const showKnowledgeDetail = async function showKnowledgeDetail(id) {
  const entry = await this.memory.getEntry(id);
  if (!entry) return;

  this.selectedEntryId = id;
  this.knowledgeList.classList.add('hidden');
  this.knowledgeDetail.classList.remove('hidden');

  this.detailContent.innerHTML = `
    <h2>${this.escapeHtml(entry.title)}</h2>
    <div class="meta">
      <div>来源：${this.escapeHtml(entry.sourceTitle || entry.sourceUrl)}</div>
      <div>时间：${formatTime(entry.createdAt)}</div>
      <div>标签：${(entry.tags || []).join(', ')}</div>
      <div>分类：${entry.category}</div>
    </div>
    ${entry.question ? `<div class="section"><div class="section-title">问题</div><div class="section-body">${this.escapeHtml(entry.question)}</div></div>` : ''}
    ${entry.answer ? `<div class="section"><div class="section-title">回答</div><div class="section-body">${renderMarkdown(entry.answer)}</div></div>` : ''}
    ${entry.summary ? `<div class="section"><div class="section-title">摘要</div><div class="section-body">${this.escapeHtml(entry.summary)}</div></div>` : ''}
    ${entry.content ? `<div class="section"><div class="section-title">原始内容</div><div class="section-body" style="max-height:200px;overflow-y:auto;font-size:12px;color:var(--text-secondary);">${this.escapeHtml(entry.content.slice(0, 2000))}</div></div>` : ''}
  `;

  this.loadRelatedEntries(id);
};

export const loadRelatedEntries = async function loadRelatedEntries(entryId) {
  if (!this.relatedEntries || !this.relatedList) return;

  try {
    const related = await this.memory.kb.findRelatedEntries(entryId, 5);

    if (related.length === 0) {
      this.relatedEntries.classList.add('hidden');
      return;
    }

    this.relatedEntries.classList.remove('hidden');
    this.relatedList.innerHTML = related.map(({ entry, score }) => {
      const percent = Math.round(score * 100);
      const summary = entry.summary
        ? this.escapeHtml(entry.summary.slice(0, 80)) + (entry.summary.length > 80 ? '...' : '')
        : '';
      return `
        <div class="related-card" data-id="${entry.id}">
          <div class="related-card-header">
            <span class="related-card-title">${this.escapeHtml(entry.title)}</span>
            <span class="related-card-score">${percent}%</span>
          </div>
          ${summary ? `<div class="related-card-summary">${summary}</div>` : ''}
        </div>
      `;
    }).join('');

    this.relatedList.querySelectorAll('.related-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        this.showKnowledgeDetail(id);
      });
    });
  } catch (_e) {
    this.relatedEntries.classList.add('hidden');
  }
};
