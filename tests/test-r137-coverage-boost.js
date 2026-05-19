/**
 * R137: 测试覆盖率提升 TestCoverageBoost
 *
 * 覆盖目标:
 *   - lib/bookmark-store-prep.js (79.4% → ≥80%)
 *   - lib/i18n.js (79.2% → ≥80%)
 *   - lib/stats.js (78.7% → ≥80%)
 *   - lib/bookmark-accessibility-navigator.js (77.6% → ≥80%)
 *   - lib/bookmark-folder-suggestions.js (75.8% → ≥80%)
 *   - lib/compilation-report-format.js (47.5% → ↑)
 *   - lib/bookmark-store-prep-checks.js (66.5% → ≥80%)
 *   - lib/knowledge-graph-utils.js (10.2% → ↑)
 *   - lib/knowledge-graph-wiki.js (10.9% → ↑)
 *   - lib/bookmark-tag-editor.js (10% → ↑)
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ==================== Chrome mock ====================

if (typeof globalThis.chrome === 'undefined') {
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
        clear: async () => {},
      },
      sync: {
        get: async () => ({}),
        set: async () => {},
      },
    },
    runtime: { lastError: null },
  };
}

// ==================== DOM Mock ====================

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.id = '';
    this._children = [];
    this._parent = null;
    this._listeners = {};
    this.attributes = {};
    this._activeElement = null;
    this.placeholder = '';
    this.title = '';
  }
  get activeElement() {
    return this._activeElement || this._children[0] || this;
  }
  set activeElement(v) { this._activeElement = v; }
  appendChild(child) {
    this._children.push(child);
    child._parent = this;
    return child;
  }
  removeChild(child) {
    const idx = this._children.indexOf(child);
    if (idx >= 0) this._children.splice(idx, 1);
    return child;
  }
  remove() {
    if (this._parent) this._parent.removeChild(this);
  }
  querySelector(sel) {
    for (const c of this._children) {
      if (!sel || c.className?.includes(sel.replace('.', ''))) return c;
      const found = c.querySelector?.(sel);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    for (const c of this._children) {
      if (!sel || c.className?.includes(sel.replace('.', ''))) results.push(c);
      if (c.querySelectorAll) results.push(...c.querySelectorAll(sel));
    }
    return results;
  }
  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  removeEventListener(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }
  }
  setAttribute(k, v) { this.attributes[k] = v; this.dataset[k.replace('data-', '')] = v; }
  getAttribute(k) { return this.attributes[k] || ''; }
  closest() { return null; }
  focus() {}
  click() {
    const handlers = this._listeners['click'];
    if (handlers) handlers.forEach(h => h({ target: this, type: 'click', preventDefault() {} }));
  }
  dispatchEvent(e) {
    const handlers = this._listeners[e.type];
    if (handlers) handlers.forEach(h => h(e));
  }
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: new MockElement('body'),
    documentElement: new MockElement('html'),
  };
}

// ==================== Modules ====================

const { BookmarkTagEditor } = await import('../lib/bookmark-tag-editor.js');
const {
  extractSubgraph, exportGraphToDataURL, importGraphData,
} = await import('../lib/knowledge-graph-utils.js');
const {
  NODE_SHAPES, EDGE_TYPES, classifyEdgeType, buildWikiGraphData,
} = await import('../lib/knowledge-graph-wiki.js');
const {
  IngestStats, buildIngestStats, computeIngestDiff,
  generateReportMarkdown, generateReportHtml,
  mergeIngestStats, summarizeReport, formatReportSummary, escapeHtml,
} = await import('../lib/compilation-report-format.js');
const {
  validateContentSecurityPolicy, generatePermissionJustification,
  detectLanguageSupport, suggestManifestImprovements, checkStoreSubmissionReadiness,
} = await import('../lib/bookmark-store-prep-checks.js');
const {
  validateManifest, checkIcons, getStoreListing, getScreenshotSpec,
} = await import('../lib/bookmark-store-prep.js');
const {
  _createStatsModule, calculateStreak, getTopTags, getWordFrequencies, getWeeklyGrowth,
} = await import('../lib/stats.js');
const i18n = await import('../lib/i18n.js');
const { FocusTrapFactory, AnnouncerFactory } = await import('../lib/bookmark-accessibility-navigator.js');

// ==================== BookmarkTagEditor edge cases ====================

describe('BookmarkTagEditor — 补充边界用例', () => {
  it('构造函数: 书签 tags 为 null 时安全处理', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: null }],
    });
    assert.deepEqual(editor.getTags('bm1'), []);
  });

  it('构造函数: 书签 tags 为 undefined 时安全处理', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: [{ id: 'bm1', title: 'T', url: '' }],
    });
    assert.deepEqual(editor.getTags('bm1'), []);
  });

  it('addTag: 非字符串标签返回 false', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: [] }] });
    assert.equal(editor.addTag('bm1', null), false);
    assert.equal(editor.addTag('bm1', 123), false);
    assert.equal(editor.addTag('bm1', undefined), false);
  });

  it('setTags: 空标签数组', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: ['a', 'b'] }] });
    editor.setTags('bm1', []);
    assert.deepEqual(editor.getTags('bm1'), []);
  });

  it('setTags: 过滤空标签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: [] }] });
    editor.setTags('bm1', ['valid', '', '  ', 'another']);
    const tags = editor.getTags('bm1');
    assert.ok(tags.includes('valid'));
    assert.ok(tags.includes('another'));
    assert.equal(tags.length, 2);
  });

  it('getAutocomplete: 匹配极限限制', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: ['abc', 'abcd', 'abcde'] }] });
    assert.equal(editor.getAutocomplete('abc', 1).length, 1);
  });

  it('removeTag: 大小写不敏感', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: ['JavaScript'] }] });
    assert.equal(editor.removeTag('bm1', 'JAVASCRIPT'), true);
    assert.deepEqual(editor.getTags('bm1'), []);
  });

  it('normalizeTag: 空字符串返回空', () => {
    assert.equal(BookmarkTagEditor.normalizeTag(''), '');
  });

  it('normalizeTag: 含 emoji 的标签', () => {
    const result = Emoji → emoji is removed
    const result2 = BookmarkTagEditor.normalizeTag('code\u{1F600}');
    assert.equal(result2, 'code');
  });

  it('getAllTags: 返回排序后的去重标签', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: [
        { id: 'bm1', title: 'T', url: '', tags: ['z-tag', 'a-tag'] },
        { id: 'bm2', title: 'T2', url: '', tags: ['m-tag', 'a-tag'] },
      ],
    });
    const tags = editor.getAllTags();
    assert.deepEqual(tags, tags.slice().sort());
  });

  it('batchAddTag: 混合有效无效书签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: [] }] });
    const count = editor.batchAddTag(['bm1', 'invalid', 'bm1'], 'new');
    assert.equal(count, 1); // bm1 already has 'new' on second pass
  });

  it('batchRemoveTag: 混合有效无效标签', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: [
        { id: 'bm1', title: 'T', url: '', tags: ['target'] },
        { id: 'bm2', title: 'T2', url: '', tags: [] },
      ],
    });
    const count = editor.batchRemoveTag(['bm1', 'bm2'], 'target');
    assert.equal(count, 1);
  });
});

