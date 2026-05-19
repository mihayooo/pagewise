/**
 * KnowledgePanel — 虚拟滚动方法
 *
 * R120 从 knowledge-panel.js 拆分:
 *   _cleanupVirtualScroll / _initVirtualScroll
 *   _renderVirtualItems / _renderItemAtIndex
 *   _handleItemClick
 *
 * @module knowledge-panel-virtual
 */

import { formatTime } from './utils.js';

// ==================== 虚拟滚动 ====================

/** 清理虚拟滚动资源 */
export function _cleanupVirtualScroll() {
  if (this._sentinelObserver) {
    this._sentinelObserver.disconnect();
    this._sentinelObserver = null;
  }
  if (this._scrollHandler && this.knowledgeList.parentElement) {
    this.knowledgeList.parentElement.removeEventListener('scroll', this._scrollHandler);
    this._scrollHandler = null;
  }
  this._spacerTop = null;
  this._spacerBottom = null;
  this._sentinel = null;
  this._renderedRange = { start: 0, end: 0 };
}

/**
 * 初始化虚拟滚动容器和监听
 */
export function _initVirtualScroll() {
  this._cleanupVirtualScroll();

  const container = this.knowledgeList.parentElement;
  this._containerHeight = container.clientHeight || 600;
  this._virtualScrollTop = 0;

  // Set up list container style
  this.knowledgeList.style.position = 'relative';
  this.knowledgeList.innerHTML = '';

  // Spacer elements for total height
  this._spacerTop = document.createElement('div');
  this._spacerTop.id = 'virtual-spacer-top';
  this._spacerTop.style.cssText = 'height:0px;flex-shrink:0;';

  this._spacerBottom = document.createElement('div');
  this._spacerBottom.id = 'virtual-spacer-bottom';
  this._spacerBottom.style.cssText = 'flex-shrink:0;';

  // Sentinel for triggering more renders
  this._sentinel = document.createElement('div');
  this._sentinel.id = 'virtual-sentinel';
  this._sentinel.style.cssText = 'height:1px;width:100%;';

  this.knowledgeList.appendChild(this._spacerTop);
  this.knowledgeList.appendChild(this._sentinel);
  this.knowledgeList.appendChild(this._spacerBottom);

  // Scroll handler to update visible range
  this._scrollHandler = () => {
    this._virtualScrollTop = container.scrollTop;
    this._renderVirtualItems();
  };
  container.addEventListener('scroll', this._scrollHandler, { passive: true });

  // IntersectionObserver on sentinel – when it enters viewport, expand rendered range
  this._sentinelObserver = new IntersectionObserver((observerEntries) => {
    for (const entry of observerEntries) {
      if (entry.isIntersecting) {
        this._renderedRange.end = Math.min(
          this._renderedRange.end + this._bufferSize * 2,
          this._allFilteredEntries.length
        );
        this._renderVirtualItems();
      }
    }
  }, { root: container, threshold: 0.1 });

  // Initial render
  this._renderedRange = { start: 0, end: Math.min(this._bufferSize * 2, this._allFilteredEntries.length) };
  this._renderVirtualItems();
}

/**
 * Render only items in the current visible range + buffer
 */
export function _renderVirtualItems() {
  const container = this.knowledgeList.parentElement;
  if (!container) return;

  const totalItems = this._allFilteredEntries.length;
  if (totalItems === 0) return;

  // Calculate visible range based on scroll position
  const scrollTop = this._virtualScrollTop;
  const viewHeight = this._containerHeight || container.clientHeight || 600;

  const firstVisible = Math.floor(scrollTop / this._itemHeight);
  const lastVisible = Math.ceil((scrollTop + viewHeight) / this._itemHeight);

  // Add buffer
  const start = Math.max(0, firstVisible - this._bufferSize);
  const end = Math.min(totalItems, lastVisible + this._bufferSize);

  // Update rendered range (expand sentinel-driven range if scroll shows items beyond it)
  this._renderedRange.start = Math.min(this._renderedRange.start, start);
  this._renderedRange.end = Math.max(this._renderedRange.end, end);

  // Clamp
  this._renderedRange.start = Math.max(0, this._renderedRange.start);
  this._renderedRange.end = Math.min(totalItems, this._renderedRange.end);

  // Compute spacer heights
  const topHeight = this._renderedRange.start * this._itemHeight;
  const bottomHeight = Math.max(0, (totalItems - this._renderedRange.end) * this._itemHeight);

  if (this._spacerTop) this._spacerTop.style.height = topHeight + 'px';
  if (this._spacerBottom) this._spacerBottom.style.height = bottomHeight + 'px';

  // Position sentinel after last rendered item
  if (this._sentinel && this._sentinel.parentElement === this.knowledgeList) {
    this.knowledgeList.removeChild(this._sentinel);
  }
  if (this._spacerBottom && this._spacerBottom.parentElement === this.knowledgeList) {
    this.knowledgeList.removeChild(this._spacerBottom);
  }

  // Rebuild rendered items: remove existing items
  const existingItems = this.knowledgeList.querySelectorAll('.knowledge-item');
  existingItems.forEach(el => el.remove());

  // Render items in range
  const isSemantic = this._searchMode === 'semantic' && this._allSemanticResults;
  const query = this._searchQuery || '';
  const fragment = document.createDocumentFragment();

  for (let i = this._renderedRange.start; i < this._renderedRange.end; i++) {
    const el = this._renderItemAtIndex(i, isSemantic, query);
    fragment.appendChild(el);
  }

  this.knowledgeList.appendChild(fragment);
  this.knowledgeList.appendChild(this._sentinel);
  this.knowledgeList.appendChild(this._spacerBottom);

  // Observe sentinel
  if (this._sentinelObserver && this._sentinel) {
    this._sentinelObserver.disconnect();
    if (this._renderedRange.end < totalItems) {
      this._sentinelObserver.observe(this._sentinel);
    }
  }

  // Bind click events on newly rendered items
  this.knowledgeList.querySelectorAll('.knowledge-item:not([data-bound])').forEach(item => {
    item.setAttribute('data-bound', '1');
    if (isSemantic) {
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    } else {
      item.addEventListener('click', (e) => this._handleItemClick(e, item));
    }
  });

  // Update currentEntries for batch operations
  this._currentEntries = this._allFilteredEntries.slice(0, this._renderedRange.end);
}

/**
 * Create a DOM element for an item at a given index
 */
export function _renderItemAtIndex(index, isSemantic, query) {
  if (isSemantic && this._allSemanticResults) {
    const result = this._allSemanticResults[index];
    if (!result) return document.createElement('div');
    const entry = result.entry;
    const percent = Math.round(result.score * 100);
    const matchType = result.matchType || 'semantic';
    const titleHtml = this.highlightText(entry.title || '', query);
    const summaryText = entry.summary || entry.question || '';
    const summaryHtml = this.highlightText(summaryText, query);

    const div = document.createElement('div');
    div.className = 'knowledge-item';
    div.dataset.id = entry.id;
    div.style.height = this._itemHeight + 'px';
    div.style.overflow = 'hidden';
    div.innerHTML = `
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
    `;
    return div;
  } else {
    const entry = this._allFilteredEntries[index];
    if (!entry) return document.createElement('div');
    const div = document.createElement('div');
    div.className = `knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}`;
    div.dataset.id = entry.id;
    div.style.height = this._itemHeight + 'px';
    div.style.overflow = 'hidden';
    div.innerHTML = `
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
    `;
    return div;
  }
}

/**
 * Handle click on a knowledge item (select mode vs detail mode)
 */
export function _handleItemClick(e, item) {
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
}
