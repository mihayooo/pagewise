/**
 * KnowledgePanel — 批量操作与导出方法
 *
 * R120 从 knowledge-panel.js 拆分:
 *   toggleSelectMode / toggleSelectAll / updateBatchCount
 *   batchDelete / batchTag / batchExport
 *   deleteEntry / exportMarkdown / exportJson
 *
 * @module knowledge-panel-batch
 */

// ==================== 批量操作 ====================

/**
 * 进入/退出选择模式
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export function toggleSelectMode() {
  this.selectMode = !this.selectMode;
  this.selectedIds.clear();

  // 切换工具栏显示
  this.batchToolbar.classList.toggle('hidden', !this.selectMode);
  this.batchFloatingBar.classList.toggle('hidden', !this.selectMode);

  // 更新按钮文本
  if (this.btnSelectMode) {
    this.btnSelectMode.textContent = this.selectMode ? '✖️ 取消选择' : '☑️ 选择模式';
  }

  // 重置全选复选框
  if (this.batchSelectAll) {
    this.batchSelectAll.checked = false;
  }

  // 更新计数
  this.updateBatchCount();

  // 重新渲染列表
  this.loadKnowledgeList();
}

/**
 * 全选/取消全选
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export function toggleSelectAll() {
  const isChecked = this.batchSelectAll.checked;
  const items = this.knowledgeList.querySelectorAll('.knowledge-item');

  items.forEach(item => {
    const id = parseInt(item.dataset.id);
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (isChecked) {
      this.selectedIds.add(id);
      if (checkbox) checkbox.checked = true;
      item.classList.add('selected');
    } else {
      this.selectedIds.delete(id);
      if (checkbox) checkbox.checked = false;
      item.classList.remove('selected');
    }
  });

  this.updateBatchCount();
}

/**
 * 更新批量操作选中计数
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export function updateBatchCount() {
  const count = this.selectedIds.size;
  const text = `已选 ${count} 条`;
  if (this.batchCount) this.batchCount.textContent = text;
  if (this.batchFloatingCount) this.batchFloatingCount.textContent = text;
}

/**
 * 批量删除
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export async function batchDelete() {
  if (this.selectedIds.size === 0) {
    this.showToast('请先选择要删除的条目', 'warning');
    return;
  }

  const count = this.selectedIds.size;
  if (!confirm(`确定要删除选中的 ${count} 条知识条目吗？此操作不可撤销。`)) {
    return;
  }

  try {
    const ids = Array.from(this.selectedIds);
    const deleted = await this.memory.kb.batchDelete(ids);
    this.showToast(`成功删除 ${deleted} 条知识条目`);
    this.toggleSelectMode();
    this.loadKnowledgeTags();
  } catch (error) {
    this.showToast(`批量删除失败：${error.message}`, 'error');
  }
}

/**
 * 批量打标签
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export async function batchTag() {
  if (this.selectedIds.size === 0) {
    this.showToast('请先选择要打标签的条目', 'warning');
    return;
  }

  const tag = prompt('请输入要添加的标签：');
  if (!tag || !tag.trim()) return;

  try {
    const ids = Array.from(this.selectedIds);
    const updated = await this.memory.kb.batchAddTag(ids, tag.trim());
    this.showToast(`成功为 ${updated} 条知识添加标签「${tag.trim()}」`);
    this.toggleSelectMode();
    this.loadKnowledgeTags();
  } catch (error) {
    this.showToast(`批量打标签失败：${error.message}`, 'error');
  }
}

/**
 * 批量导出
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export function batchExport() {
  if (this.selectedIds.size === 0) {
    this.showToast('请先选择要导出的条目', 'warning');
    return;
  }

  // 从当前渲染的条目中过滤选中的
  const entries = (this._currentEntries || []).filter(e => this.selectedIds.has(e.id));
  if (entries.length === 0) {
    this.showToast('没有找到选中的条目', 'warning');
    return;
  }

  const json = JSON.stringify(entries, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pagewise-batch-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  this.showToast(`已导出 ${entries.length} 条知识条目`);
}

// ==================== 删除 ====================

/**
 * 删除当前选中的知识条目
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export async function deleteEntry() {
  if (!this.selectedEntryId) return;
  if (!confirm('确定删除这条知识？')) return;
  await this.memory.deleteEntry(this.selectedEntryId);
  this.addSystemMessage('已删除');
  this.loadKnowledgeList();
  this.loadKnowledgeTags();
}

// ==================== 导出 ====================

/**
 * 导出 Markdown
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export async function exportMarkdown() {
  const md = await this.memory.exportMarkdown();
  this.downloadFile(md, 'knowledge-base.md', 'text/markdown');
}

/**
 * 导出 JSON
 * @this {import('./knowledge-panel.js').KnowledgePanel}
 */
export async function exportJson() {
  const json = await this.memory.exportJSON();
  this.downloadFile(json, 'knowledge-base.json', 'application/json');
}
