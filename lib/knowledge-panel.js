/**
 * KnowledgePanel — 知识库面板
 * 从 sidebar.js 提取的知识库列表、详情、搜索、批量操作等逻辑
 *
 * R120 拆分: 批量操作 → knowledge-panel-batch.js
 *           虚拟滚动 → knowledge-panel-virtual.js
 * R196 拆分: 搜索/标签/详情 → knowledge-panel-search.js
 */

import { formatTime } from './utils.js';
import {
  toggleSelectMode, toggleSelectAll, updateBatchCount,
  batchDelete, batchTag, batchExport,
  deleteEntry, exportMarkdown, exportJson,
} from './knowledge-panel-batch.js';
import {
  _cleanupVirtualScroll, _initVirtualScroll,
  _renderVirtualItems, _renderItemAtIndex, _handleItemClick,
} from './knowledge-panel-virtual.js';
import {
  searchKnowledge, renderNoResults, renderSemanticResults, highlightText,
  loadKnowledgeTags, renderTagFilter,
  showKnowledgeDetail, loadRelatedEntries,
} from './knowledge-panel-search.js';

export class KnowledgePanel {
  /**
   * @param {Object} deps - 依赖注入
   * @param {HTMLElement} deps.knowledgeList
   * @param {HTMLElement} deps.knowledgeDetail
   * @param {HTMLElement} deps.detailContent
   * @param {HTMLElement} deps.emptyKnowledge
   * @param {HTMLElement} deps.tagFilter
   * @param {HTMLElement} deps.searchInput
   * @param {HTMLElement} deps.batchToolbar
   * @param {HTMLElement} deps.batchFloatingBar
   * @param {HTMLElement} deps.batchCount
   * @param {HTMLElement} deps.batchFloatingCount
   * @param {HTMLElement} deps.batchSelectAll
   * @param {HTMLElement} deps.btnSelectMode
   * @param {HTMLElement} deps.btnBatchTag
   * @param {HTMLElement} deps.btnBatchDelete
   * @param {HTMLElement} deps.btnBatchExport
   * @param {HTMLElement} deps.btnBatchTagFloat
   * @param {HTMLElement} deps.btnBatchDeleteFloat
   * @param {HTMLElement} deps.btnBatchExportFloat
   * @param {HTMLElement} deps.btnBatchExit
   * @param {HTMLElement} deps.btnBack
   * @param {HTMLElement} deps.btnEdit
   * @param {HTMLElement} deps.btnDelete
   * @param {HTMLElement} deps.btnExportMd
   * @param {HTMLElement} deps.btnExportJson
   * @param {HTMLElement} deps.btnImport
   * @param {HTMLElement} deps.fileImport
   * @param {HTMLElement} deps.relatedEntries
   * @param {HTMLElement} deps.relatedList
   * @param {Object} deps.memory - MemorySystem 实例
   * @param {Function} deps.addSystemMessage
   * @param {Function} deps.showToast
   * @param {Function} deps.escapeHtml
   * @param {Function} deps.downloadFile
   * @param {Function} deps.getSearchMode - 获取当前搜索模式 ('keyword' | 'semantic')
   */
  constructor({
    knowledgeList, knowledgeDetail, detailContent, emptyKnowledge,
    tagFilter, searchInput,
    batchToolbar, batchFloatingBar, batchCount, batchFloatingCount,
    batchSelectAll, btnSelectMode,
    btnBatchTag, btnBatchDelete, btnBatchExport,
    btnBatchTagFloat, btnBatchDeleteFloat, btnBatchExportFloat, btnBatchExit,
    btnBack, btnEdit, btnDelete, btnExportMd, btnExportJson,
    btnImport, fileImport,
    relatedEntries, relatedList,
    memory, addSystemMessage, showToast, escapeHtml, downloadFile,
    getSearchMode
  }) {
    // DOM elements
    this.knowledgeList = knowledgeList;
    this.knowledgeDetail = knowledgeDetail;
    this.detailContent = detailContent;
    this.emptyKnowledge = emptyKnowledge;
    this.tagFilter = tagFilter;
    this.searchInput = searchInput;
    this.batchToolbar = batchToolbar;
    this.batchFloatingBar = batchFloatingBar;
    this.batchCount = batchCount;
    this.batchFloatingCount = batchFloatingCount;
    this.batchSelectAll = batchSelectAll;
    this.btnSelectMode = btnSelectMode;
    this.btnBatchTag = btnBatchTag;
    this.btnBatchDelete = btnBatchDelete;
    this.btnBatchExport = btnBatchExport;
    this.btnBatchTagFloat = btnBatchTagFloat;
    this.btnBatchDeleteFloat = btnBatchDeleteFloat;
    this.btnBatchExportFloat = btnBatchExportFloat;
    this.btnBatchExit = btnBatchExit;
    this.btnBack = btnBack;
    this.btnEdit = btnEdit;
    this.btnDelete = btnDelete;
    this.btnExportMd = btnExportMd;
    this.btnExportJson = btnExportJson;
    this.btnImport = btnImport;
    this.fileImport = fileImport;
    this.relatedEntries = relatedEntries;
    this.relatedList = relatedList;

    // Dependencies
    this.memory = memory;
    this.addSystemMessage = addSystemMessage;
    this.showToast = showToast;
    this.escapeHtml = escapeHtml;
    this.downloadFile = downloadFile;
    this._getSearchMode = getSearchMode;

    // State
    this.selectedEntryId = null;
    this.activeTag = null;
    this.activeLanguage = null;
    this.selectMode = false;
    this.selectedIds = new Set();

    // Virtual scroll state
    this._itemHeight = 80;
    this._bufferSize = 5;
    this._allFilteredEntries = [];
    this._currentEntries = [];
    this._virtualScrollTop = 0;
    this._containerHeight = 0;
    this._renderedRange = { start: 0, end: 0 };
    this._sentinelObserver = null;
    this._scrollHandler = null;
    this._spacerTop = null;
    this._spacerBottom = null;
    this._sentinel = null;
    this._searchMode = null;
    this._searchQuery = null;
    this._allSemanticResults = null;
  }

  // ==================== 知识库列表 ====================

  async loadKnowledgeList() {
    const entries = await this.memory.getAllEntries(10000);
    if (entries.length === 0) {
      this.emptyKnowledge.classList.remove('hidden');
      this.knowledgeList.innerHTML = '';
      this.knowledgeList.appendChild(this.emptyKnowledge);
      this._allFilteredEntries = [];
      this._currentEntries = [];
      this._cleanupVirtualScroll();
      return;
    }
    this.emptyKnowledge.classList.add('hidden');

    let filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    if (this.activeLanguage) {
      filtered = filtered.filter(e => (e.language || 'other') === this.activeLanguage);
    }

    this._allFilteredEntries = filtered;
    this._currentEntries = filtered;
    this._searchMode = null;

    this._initVirtualScroll();
  }

  showKnowledgeList() {
    this.knowledgeDetail.classList.add('hidden');
    this.knowledgeList.classList.remove('hidden');
    this.selectedEntryId = null;
    this.loadKnowledgeList();
  }

  // ==================== 渲染 ====================

  renderKnowledgeList(entries) {
    const filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    this._currentEntries = filtered;

    if (this.selectMode) {
      this.knowledgeList.classList.add('select-mode');
    } else {
      this.knowledgeList.classList.remove('select-mode');
    }

    this.knowledgeList.innerHTML = filtered.map(entry => `
      <div class="knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}" data-id="${entry.id}">
        <div class="knowledge-item-checkbox">
          <input type="checkbox" data-id="${entry.id}" ${this.selectedIds.has(entry.id) ? 'checked' : ''}>
        </div>
        <div class="knowledge-item-content">
          <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (this.selectMode) {
          const checkbox = item.querySelector('input[type="checkbox"]');
          const id = parseInt(item.dataset.id);
          if (e.target.type === 'checkbox') {
            if (e.target.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          } else {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          }
          item.classList.toggle('selected', this.selectedIds.has(id));
         this.updateBatchCount();
       } else {
         this.showKnowledgeDetail(parseInt(item.dataset.id));
       }
     });
   });
 }
}

// ==================== Mixin: 批量操作 & 虚拟滚动 & 搜索/标签/详情 ====================

Object.assign(KnowledgePanel.prototype, {
  // 批量操作 (knowledge-panel-batch.js)
  toggleSelectMode,
  toggleSelectAll,
  updateBatchCount,
  batchDelete,
  batchTag,
  batchExport,
  deleteEntry,
  exportMarkdown,
  exportJson,
  // 虚拟滚动 (knowledge-panel-virtual.js)
  _cleanupVirtualScroll,
  _initVirtualScroll,
  _renderVirtualItems,
  _renderItemAtIndex,
  _handleItemClick,
  // 搜索/标签/详情 (knowledge-panel-search.js)
  searchKnowledge,
  renderNoResults,
  renderSemanticResults,
  highlightText,
  loadKnowledgeTags,
  renderTagFilter,
  showKnowledgeDetail,
  loadRelatedEntries,
});
