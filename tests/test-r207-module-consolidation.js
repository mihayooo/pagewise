/**
 * 测试 R207: 重叠模块合并与架构瘦身 ModuleConsolidation
 *
 * 验收标准:
 *   AC-1: BookmarkDuplicateDetector 包含 BookmarkDedup 的所有方法
 *   AC-2: BookmarkDedup 仍可通过 bookmark-dedup.js 导入（向后兼容）
 *   AC-3: bookmark-import-export.js re-export 功能完整
 *   AC-4: bookmark-import-export-io.js re-export 功能完整
 *   AC-5: bookmark-io.js 包含所有独立函数
 *   AC-6: 合并后模块文件行数 ≤50（wrapper）
 *   AC-7: 合并后 lib/ 模块数减少 ≥3
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = join(__dirname, '..', 'lib');

const { BookmarkDuplicateDetector } = await import('../lib/bookmark-duplicate-detector.js');
const { BookmarkDedup } = await import('../lib/bookmark-dedup.js');

// ==================== 辅助 ====================

function bm(id, title, url, extra = {}) {
  return { id: String(id), title, url, folderPath: [], tags: [], ...extra };
}

// ==================== AC-1: BookmarkDuplicateDetector 包含所有 BookmarkDedup 方法 ====================

describe('AC-1: BookmarkDuplicateDetector 包含 BookmarkDedup 所有方法', () => {
  it('应有静态方法 titleSimilarity', () => {
    assert.equal(typeof BookmarkDuplicateDetector.titleSimilarity, 'function');
    assert.equal(
      BookmarkDuplicateDetector.titleSimilarity('Hello World', 'Hello World'),
      1
    );
  });

  it('应有实例方法 findByExactUrl', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A copy', 'https://www.example.com/page/'),
    ]);
    assert.equal(typeof detector.findByExactUrl, 'function');
    const groups = detector.findByExactUrl();
    assert.ok(groups.length >= 1, '应找到 URL 重复组');
  });

  it('应有实例方法 findBySimilarTitle', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'The Complete JavaScript Guide For Beginners', 'https://a.com'),
      bm(2, 'The Complete JavaScript Guide For Developers', 'https://b.com'),
    ]);
    assert.equal(typeof detector.findBySimilarTitle, 'function');
    const groups = detector.findBySimilarTitle();
    assert.ok(groups.length >= 1, '应找到相似标题组');
  });

  it('应有实例方法 findDuplicates', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A copy', 'https://example.com/page'),
    ]);
    assert.equal(typeof detector.findDuplicates, 'function');
    const results = detector.findDuplicates();
    assert.ok(results.length >= 1, '应找到重复');
    assert.ok(results[0].original, '应有 original');
    assert.ok(Array.isArray(results[0].duplicates), '应有 duplicates 数组');
  });

  it('应有实例方法 suggestCleanup', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A copy', 'https://example.com/page'),
    ]);
    assert.equal(typeof detector.suggestCleanup, 'function');
    const suggestions = detector.suggestCleanup();
    assert.ok(suggestions.length >= 1, '应有清理建议');
    assert.equal(suggestions[0].action, 'remove');
  });

  it('应有实例方法 batchRemove', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
      bm(3, 'C', 'https://c.com'),
    ]);
    assert.equal(typeof detector.batchRemove, 'function');
    const removed = detector.batchRemove(['1', '3']);
    assert.equal(removed, 2);
    assert.equal(detector.bookmarks.length, 1);
  });

  it('应同时保留原有检测方法', () => {
    assert.equal(typeof BookmarkDuplicateDetector.prototype.findExactDuplicates, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.prototype.findFuzzyDuplicates, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.prototype.findTitleDuplicates, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.prototype.mergeDuplicates, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.prototype.getDuplicateStats, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.prototype.cleanDuplicates, 'function');
    assert.equal(typeof BookmarkDuplicateDetector.normalizeUrl, 'function');
    assert.equal(typeof BookmarkDuplicateDetector._scoreBookmark, 'function');
  });
});

// ==================== AC-2: BookmarkDedup 向后兼容 ====================

describe('AC-2: BookmarkDedup 仍可通过 bookmark-dedup.js 导入', () => {
  it('BookmarkDedup 应可构造', () => {
    const dedup = new BookmarkDedup([bm(1, 'A', 'https://a.com')]);
    assert.ok(dedup);
    assert.equal(dedup.bookmarks.length, 1);
  });

  it('BookmarkDedup 应可调用 normalizeUrl', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('https://www.example.com/page/'),
      'example.com/page'
    );
  });

  it('BookmarkDedup 应可调用 titleSimilarity', () => {
    assert.equal(
      BookmarkDedup.titleSimilarity('Hello', 'Hello'),
      1
    );
  });

  it('BookmarkDedup 应可调用 findByExactUrl', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'B', 'http://www.example.com/page/'),
    ]);
    const groups = dedup.findByExactUrl();
    assert.equal(groups.length, 1);
  });

  it('BookmarkDedup 应可调用 findDuplicates', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A copy', 'https://example.com/page'),
    ]);
    const results = dedup.findDuplicates();
    assert.ok(results.length >= 1);
  });

  it('BookmarkDedup 应可调用 suggestCleanup', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A copy', 'https://example.com/page'),
    ]);
    const suggestions = dedup.suggestCleanup();
    assert.ok(suggestions.length >= 1);
    assert.equal(suggestions[0].action, 'remove');
  });

  it('BookmarkDedup 应可调用 batchRemove', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ]);
    const removed = dedup.batchRemove(['1']);
    assert.equal(removed, 1);
    assert.equal(dedup.bookmarks.length, 1);
  });

  it('BookmarkDedup 应是 BookmarkDuplicateDetector 的子类', () => {
    assert.ok(new BookmarkDedup() instanceof BookmarkDuplicateDetector);
  });
});

// ==================== AC-3: bookmark-import-export.js re-export 完整 ====================

describe('AC-3: bookmark-import-export.js re-export 完整', () => {
  it('应可导入 BookmarkImportExport 类', async () => {
    const { BookmarkImportExport } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof BookmarkImportExport, 'function');
    const io = new BookmarkImportExport({ bookmarks: [{ id: '1', title: 'A', url: 'https://a.com' }] });
    assert.equal(typeof io.exportJSON, 'function');
  });

  it('应可导入独立函数 exportToHTML', async () => {
    const { exportToHTML } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof exportToHTML, 'function');
    const html = exportToHTML([{ id: '1', title: 'Test', url: 'https://test.com' }]);
    assert.ok(html.includes('<!DOCTYPE'));
  });

  it('应可导入独立函数 exportToJSON', async () => {
    const { exportToJSON } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof exportToJSON, 'function');
    const json = exportToJSON([{ id: '1', title: 'Test', url: 'https://test.com' }]);
    const parsed = JSON.parse(json);
    assert.equal(parsed.length, 1);
  });

  it('应可导入独立函数 exportToCSV', async () => {
    const { exportToCSV } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof exportToCSV, 'function');
  });

  it('应可导入独立函数 importFromHTML', async () => {
    const { importFromHTML } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof importFromHTML, 'function');
  });

  it('应可导入独立函数 importFromJSON', async () => {
    const { importFromJSON } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof importFromJSON, 'function');
  });

  it('应可导入 validateImportData', async () => {
    const { validateImportData } = await import('../lib/bookmark-import-export.js');
    assert.equal(typeof validateImportData, 'function');
    const result = validateImportData([{ title: 'A', url: 'https://a.com' }]);
    assert.equal(result.valid, true);
  });
});

// ==================== AC-4: bookmark-import-export-io.js re-export 完整 ====================

describe('AC-4: bookmark-import-export-io.js re-export 完整', () => {
  it('应可导入 exportToHTML', async () => {
    const { exportToHTML } = await import('../lib/bookmark-import-export-io.js');
    assert.equal(typeof exportToHTML, 'function');
  });

  it('应可导入 exportToJSON', async () => {
    const { exportToJSON } = await import('../lib/bookmark-import-export-io.js');
    assert.equal(typeof exportToJSON, 'function');
  });

  it('应可导入 exportToCSV', async () => {
    const { exportToCSV } = await import('../lib/bookmark-import-export-io.js');
    assert.equal(typeof exportToCSV, 'function');
  });

  it('应可导入 importFromHTML', async () => {
    const { importFromHTML } = await import('../lib/bookmark-import-export-io.js');
    assert.equal(typeof importFromHTML, 'function');
  });

  it('应可导入 importFromJSON', async () => {
    const { importFromJSON } = await import('../lib/bookmark-import-export-io.js');
    assert.equal(typeof importFromJSON, 'function');
  });
});

// ==================== AC-5: bookmark-io.js 包含所有独立函数 ====================

describe('AC-5: bookmark-io.js 包含所有独立函数和类', () => {
  it('应可导入 BookmarkImportExport 类', async () => {
    const { BookmarkImportExport } = await import('../lib/bookmark-io.js');
    assert.equal(typeof BookmarkImportExport, 'function');
  });

  it('应可导入 exportToHTML', async () => {
    const { exportToHTML } = await import('../lib/bookmark-io.js');
    const html = exportToHTML([{ id: '1', title: 'Test', url: 'https://test.com' }]);
    assert.ok(html.includes('<!DOCTYPE'));
  });

  it('应可导入 exportToJSON', async () => {
    const { exportToJSON } = await import('../lib/bookmark-io.js');
    const json = exportToJSON([{ id: '1', title: 'Test', url: 'https://test.com' }]);
    const parsed = JSON.parse(json);
    assert.equal(parsed[0].title, 'Test');
  });

  it('应可导入 exportToCSV', async () => {
    const { exportToCSV } = await import('../lib/bookmark-io.js');
    assert.equal(typeof exportToCSV, 'function');
  });

  it('应可导入 importFromHTML', async () => {
    const { importFromHTML } = await import('../lib/bookmark-io.js');
    const html = '<DL><p><DT><A HREF="https://test.com" ADD_DATE="0">Test</A></DL><p>';
    const bookmarks = importFromHTML(html);
    assert.equal(bookmarks.length, 1);
    assert.equal(bookmarks[0].title, 'Test');
  });

  it('应可导入 importFromJSON', async () => {
    const { importFromJSON } = await import('../lib/bookmark-io.js');
    const bookmarks = importFromJSON('[{"title":"X","url":"https://x.com"}]');
    assert.equal(bookmarks.length, 1);
  });

  it('应可导入 validateImportData', async () => {
    const { validateImportData } = await import('../lib/bookmark-io.js');
    assert.equal(typeof validateImportData, 'function');
    const result = validateImportData(null);
    assert.equal(result.valid, false);
  });
});

// ==================== AC-6: wrapper 文件行数 ≤50 ====================

describe('AC-6: wrapper 文件行数', () => {
  it('bookmark-dedup.js 应为 wrapper（≤50 行）', () => {
    const content = readFileSync(join(libDir, 'bookmark-dedup.js'), 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 50, `bookmark-dedup.js 有 ${lines} 行，应 ≤50`);
  });

  it('bookmark-import-export-io.js 应为 wrapper（≤30 行）', () => {
    const content = readFileSync(join(libDir, 'bookmark-import-export-io.js'), 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 30, `bookmark-import-export-io.js 有 ${lines} 行，应 ≤30`);
  });

  it('bookmark-import-export.js 应为 wrapper（≤30 行）', () => {
    const content = readFileSync(join(libDir, 'bookmark-import-export.js'), 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 30, `bookmark-import-export.js 有 ${lines} 行，应 ≤30`);
  });
});

// ==================== AC-7: 合并后模块数变化统计 ====================

describe('AC-7: 合并后模块数变化', () => {
  it('三个模块已从实现变为 re-export wrapper', () => {
    const dedupContent = readFileSync(join(libDir, 'bookmark-dedup.js'), 'utf8');
    const ioContent = readFileSync(join(libDir, 'bookmark-import-export-io.js'), 'utf8');
    const importExportContent = readFileSync(join(libDir, 'bookmark-import-export.js'), 'utf8');

    const dedupLines = dedupContent.split('\n').length;
    const ioLines = ioContent.split('\n').length;
    const importExportLines = importExportContent.split('\n').length;
    const totalWrapperLines = dedupLines + ioLines + importExportLines;

    // 三个模块变为 wrapper: 应显著少于原始实现 (~705 行)
    assert.ok(totalWrapperLines <= 100,
      `三个 wrapper 共 ${totalWrapperLines} 行，应 ≤100 (原始 ~705 行)`);

    // 验证包含 re-export 关键词
    assert.ok(dedupContent.includes('BookmarkDuplicateDetector'),
      'bookmark-dedup.js 应 re-export BookmarkDuplicateDetector');
    assert.ok(ioContent.includes('bookmark-io.js'),
      'bookmark-import-export-io.js 应 re-export from bookmark-io.js');
    assert.ok(importExportContent.includes('bookmark-io.js'),
      'bookmark-import-export.js 应 re-export from bookmark-io.js');
  });
});
