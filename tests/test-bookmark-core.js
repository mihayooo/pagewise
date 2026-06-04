/**
 * 测试 lib/bookmark-core.js — 书签核心存储 + CRUD
 *
 * 测试范围:
 *   BookmarkCollector: collect / normalize / getStats / _walk
 *   BookmarkIndexer: buildIndex / search / addBookmark / removeBookmark / getSize
 *   BookmarkStatusManager: setStatus / getStatus / batchSetStatus / getByStatus / getStatusCounts / getRecentlyRead / markAllAsRead
 *   BookmarkContentPreview: extractUrlInfo / generateTextPreview / generateHtmlPreview / generateSnapshotPreview / _truncate / _escapeHtml
 *   辅助函数: _tokenize / _tokenizeUrl / _extractTokens / _computeIndexScore / _matchesFolder / _matchesTags
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  BookmarkCollector,
  BookmarkIndexer,
  BookmarkStatusManager,
  BookmarkContentPreview,
  VALID_STATUSES,
  DEFAULT_OPTIONS,
  STATUS_LABELS,
} = await import('../lib/bookmark-core.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 1000,
    status: 'unread',
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  createBookmark('2', 'Python Django Tutorial', 'https://djangoproject.com', ['后端', 'Python']),
  createBookmark('3', 'Docker 入门教程', 'https://docs.docker.com/get-started', ['DevOps']),
  createBookmark('4', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'CI']),
  createBookmark('5', 'TypeScript 进阶技巧', 'https://typescriptlang.org/docs', ['前端', 'TypeScript']),
];

// ==================== BookmarkCollector ====================

describe('BookmarkCollector', () => {
  it('collect() 无 chrome API 返回空数组', async () => {
    const collector = new BookmarkCollector();
    const result = await collector.collect();
    assert.deepEqual(result, []);
  });

  it('normalize() 正确提取字段', () => {
    const collector = new BookmarkCollector();
    const node = { id: '42', title: 'Test Page', url: 'https://example.com', dateAdded: 1700000000000 };
    const result = collector.normalize(node, ['Folder1', 'SubFolder']);
    assert.equal(result.id, '42');
    assert.equal(result.title, 'Test Page');
    assert.equal(result.url, 'https://example.com');
    assert.deepEqual(result.folderPath, ['Folder1', 'SubFolder']);
    assert.equal(result.dateAdded, 1700000000000);
    assert.ok(result.dateAddedISO.includes('2023'));
  });

  it('normalize() 无 url 返回 null', () => {
    const collector = new BookmarkCollector();
    assert.equal(collector.normalize({ id: '1', title: 'Folder' }), null);
    assert.equal(collector.normalize(null), null);
  });

  it('normalize() 空 title 和 dateAdded 使用默认值', () => {
    const collector = new BookmarkCollector();
    const result = collector.normalize({ id: '1', url: 'https://a.com' });
    assert.equal(result.title, '');
    assert.equal(result.dateAdded, 0);
    assert.equal(result.dateAddedISO, '');
  });

  it('getStats() 统计域名片段', () => {
    const collector = new BookmarkCollector();
    collector.bookmarks = [
      { url: 'https://react.dev/page1', folderPath: ['Tech'] },
      { url: 'https://react.dev/page2', folderPath: ['Tech'] },
      { url: 'https://github.com/repo', folderPath: ['Tools'] },
    ];
    const stats = collector.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.domainDistribution['react.dev'], 2);
    assert.equal(stats.domainDistribution['github.com'], 1);
  });

  it('getStats() 统计文件夹数', () => {
    const collector = new BookmarkCollector();
    collector.bookmarks = [
      { url: 'https://a.com', folderPath: ['Tech', 'Frontend'] },
      { url: 'https://b.com', folderPath: ['Tech', 'Backend'] },
      { url: 'https://c.com', folderPath: ['Tools'] },
    ];
    const stats = collector.getStats();
    assert.equal(stats.folders, 4); // Tech, Tech/Frontend, Tech/Backend, Tools (Tech deduped)
  });

  it('_walk() 递归遍历树结构', () => {
    const collector = new BookmarkCollector();
    const tree = {
      title: 'Root',
      children: [
        {
          title: 'Folder1',
          children: [
            { id: '1', title: 'Page1', url: 'https://a.com' },
            { id: '2', title: 'Page2', url: 'https://b.com' },
          ],
        },
        { id: '3', title: 'Page3', url: 'https://c.com' },
      ],
    };
    collector._walk(tree, []);
    assert.equal(collector.bookmarks.length, 3);
    // Root is also a folder node, so Folder1 is at index 1
    assert.equal(collector.bookmarks[0].folderPath[0], 'Root');
    assert.equal(collector.bookmarks[0].folderPath[1], 'Folder1');
    // Page3 is a direct child of Root
    assert.equal(collector.bookmarks[2].folderPath[0], 'Root');
  });

  it('_walk() null 节点安全处理', () => {
    const collector = new BookmarkCollector();
    collector._walk(null, []);
    assert.equal(collector.bookmarks.length, 0);
  });

  it('_walk() URL 索引去重', () => {
    const collector = new BookmarkCollector();
    const tree = {
      children: [
        { id: '1', title: 'A', url: 'https://dup.com' },
        { id: '2', title: 'B', url: 'https://dup.com' },
      ],
    };
    collector._walk(tree, []);
    assert.equal(collector.bookmarks.length, 2);
    assert.equal(collector._urlIndex.get('https://dup.com').length, 2);
  });
});

// ==================== BookmarkIndexer ====================

describe('BookmarkIndexer', () => {
  let indexer;

  beforeEach(() => {
    indexer = new BookmarkIndexer();
  });

  it('buildIndex() 构建索引', () => {
    indexer.buildIndex(sampleBookmarks);
    const size = indexer.getSize();
    assert.equal(size.bookmarks, 5);
    assert.ok(size.tokens > 0);
    assert.ok(size.folders > 0);
  });

  it('buildIndex() null 输入安全', () => {
    indexer.buildIndex(null);
    assert.equal(indexer.getSize().bookmarks, 0);
  });

  it('search() 中文查询', () => {
    indexer.buildIndex(sampleBookmarks);
    const results = indexer.search('React');
    assert.ok(results.length > 0);
    assert.ok(results[0].bookmark.title.includes('React'));
  });

  it('search() 英文查询', () => {
    indexer.buildIndex(sampleBookmarks);
    const results = indexer.search('Docker');
    assert.ok(results.length > 0);
    assert.ok(results[0].bookmark.title.includes('Docker'));
  });

  it('search() 空查询返回空', () => {
    indexer.buildIndex(sampleBookmarks);
    assert.deepEqual(indexer.search(''), []);
    assert.deepEqual(indexer.search(null), []);
  });

  it('search() 无匹配返回空', () => {
    indexer.buildIndex(sampleBookmarks);
    assert.deepEqual(indexer.search('xyznonexistent'), []);
  });

  it('search() AND 交集逻辑', () => {
    indexer.buildIndex(sampleBookmarks);
    // "TypeScript" 只在 bookmark 5 中
    const results = indexer.search('TypeScript 进阶');
    assert.ok(results.length > 0);
    assert.ok(results[0].bookmark.title.includes('TypeScript'));
  });

  it('search() folder 过滤', () => {
    indexer.buildIndex(sampleBookmarks);
    const results = indexer.search('文档', { folder: '前端' });
    assert.ok(results.length > 0);
    assert.ok(results[0].bookmark.folderPath.includes('前端'));
  });

  it('search() tags 过滤', () => {
    const bmWithTag = createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['js', 'react']);
    const bmWithout = createBookmark('2', 'React Native 教程', 'https://reactnative.dev', ['移动'], []);
    const idx = new BookmarkIndexer();
    idx.buildIndex([bmWithTag, bmWithout]);
    const results = idx.search('React', { tags: ['js'] });
    assert.ok(results.length > 0);
    assert.ok(results[0].bookmark.tags.includes('js'));
  });

  it('search() limit 限制', () => {
    indexer.buildIndex(sampleBookmarks);
    const results = indexer.search('教程', { limit: 1 });
    assert.ok(results.length <= 1);
  });

  it('addBookmark() 追加书签', () => {
    indexer.buildIndex(sampleBookmarks);
    const before = indexer.getSize().bookmarks;
    indexer.addBookmark({ id: '99', title: 'New Bookmark', url: 'https://new.com', folderPath: ['New'] });
    assert.equal(indexer.getSize().bookmarks, before + 1);
  });

  it('addBookmark() null 安全', () => {
    indexer.addBookmark(null);
    indexer.addBookmark({ title: 'no id' });
    assert.equal(indexer.getSize().bookmarks, 0);
  });

  it('removeBookmark() 删除后不可搜索', () => {
    indexer.buildIndex(sampleBookmarks);
    const removed = indexer.removeBookmark('1');
    assert.equal(removed, true);
    assert.equal(indexer.getSize().bookmarks, 4);
    // 该书签的 title token 应被清理
    const results = indexer.search('React');
    assert.equal(results.length, 0);
  });

  it('removeBookmark() 不存在的 id 返回 false', () => {
    assert.equal(indexer.removeBookmark('999'), false);
  });

  it('getSize() 返回正确统计', () => {
    indexer.buildIndex(sampleBookmarks);
    const size = indexer.getSize();
    assert.equal(typeof size.bookmarks, 'number');
    assert.equal(typeof size.tokens, 'number');
    assert.equal(typeof size.folders, 'number');
  });
});

// ==================== BookmarkStatusManager ====================

describe('BookmarkStatusManager', () => {
  let manager;

  beforeEach(() => {
    manager = new BookmarkStatusManager(sampleBookmarks);
  });

  it('constructor 非数组抛错', () => {
    assert.throws(() => new BookmarkStatusManager('not array'), TypeError);
  });

  it('默认状态为 unread', () => {
    assert.equal(manager.getStatus('1'), 'unread');
  });

  it('getStatus() 不存在的 id 返回 null', () => {
    assert.equal(manager.getStatus('999'), null);
  });

  it('setStatus() 有效状态', () => {
    assert.equal(manager.setStatus('1', 'reading'), true);
    assert.equal(manager.getStatus('1'), 'reading');
  });

  it('setStatus() 无效状态返回 false', () => {
    assert.equal(manager.setStatus('1', 'invalid'), false);
    assert.equal(manager.getStatus('1'), 'unread');
  });

  it('setStatus() 不存在的 id 返回 false', () => {
    assert.equal(manager.setStatus('999', 'read'), false);
  });

  it('batchSetStatus() 批量设置', () => {
    const count = manager.batchSetStatus(['1', '2', '3'], 'read');
    assert.equal(count, 3);
    assert.equal(manager.getStatus('1'), 'read');
    assert.equal(manager.getStatus('2'), 'read');
  });

  it('batchSetStatus() 非数组返回 0', () => {
    assert.equal(manager.batchSetStatus('not array', 'read'), 0);
  });

  it('batchSetStatus() 无效状态返回 0', () => {
    assert.equal(manager.batchSetStatus(['1', '2'], 'invalid'), 0);
  });

  it('getByStatus() 按状态筛选', () => {
    manager.setStatus('1', 'read');
    manager.setStatus('2', 'read');
    const readList = manager.getByStatus('read');
    assert.equal(readList.length, 2);
    assert.ok(readList.some(b => b.id === '1'));
  });

  it('getByStatus() 无效状态返回空', () => {
    assert.deepEqual(manager.getByStatus('invalid'), []);
  });

  it('getStatusCounts() 统计', () => {
    manager.setStatus('1', 'read');
    manager.setStatus('2', 'reading');
    const counts = manager.getStatusCounts();
    assert.equal(counts.read, 1);
    assert.equal(counts.reading, 1);
    assert.equal(counts.unread, 3);
  });

  it('markAllAsRead() 全部标记已读', () => {
    const count = manager.markAllAsRead(['1', '2', '3']);
    assert.equal(count, 3);
    assert.equal(manager.getStatus('1'), 'read');
  });

  it('getRecentlyRead() 按更新时间排序', () => {
    manager.setStatus('1', 'read');
    manager.setStatus('2', 'read');
    manager.setStatus('3', 'read');
    const recent = manager.getRecentlyRead(2);
    assert.equal(recent.length, 2);
    // 最后设置的排在前面
    assert.equal(recent[0].id, '3');
  });

  it('getRecentlyRead() 默认 limit=10', () => {
    for (let i = 1; i <= 5; i++) manager.setStatus(String(i), 'read');
    const recent = manager.getRecentlyRead();
    assert.equal(recent.length, 5);
  });
});

// ==================== BookmarkContentPreview ====================

describe('BookmarkContentPreview', () => {
  it('extractUrlInfo() 正常 URL', () => {
    const info = BookmarkContentPreview.extractUrlInfo('https://react.dev/docs');
    assert.equal(info.domain, 'react.dev');
    assert.equal(info.path, '/docs');
    assert.equal(info.protocol, 'https');
    assert.ok(info.favicon.includes('favicon.ico'));
  });

  it('extractUrlInfo() 无效 URL 返回空', () => {
    const info = BookmarkContentPreview.extractUrlInfo('not a url');
    assert.equal(info.domain, '');
    assert.equal(info.path, '');
  });

  it('generateTextPreview() 完整预览', () => {
    const bm = { title: 'Test', url: 'https://react.dev', folderPath: ['Tech'], tags: ['js'], status: 'read' };
    const text = BookmarkContentPreview.generateTextPreview(bm);
    assert.ok(text.includes('Test'));
    assert.ok(text.includes('react.dev'));
    assert.ok(text.includes('Tech'));
    assert.ok(text.includes('js'));
  });

  it('generateTextPreview() 空书签返回空', () => {
    assert.equal(BookmarkContentPreview.generateTextPreview(null), '');
    assert.equal(BookmarkContentPreview.generateTextPreview('string'), '');
  });

  it('generateTextPreview() 自定义选项', () => {
    const bm = { title: 'Test', url: 'https://a.com', folderPath: ['F'], tags: ['t'], status: 'read' };
    const text = BookmarkContentPreview.generateTextPreview(bm, { includeTags: false, includeFolder: false, includeStatus: false });
    assert.ok(!text.includes('F'));
    // Title 'Test' contains 't', so just check tags/folder/status excluded
    assert.ok(!text.includes('🏷'));
    assert.ok(!text.includes('📂'));
  });

  it('generateHtmlPreview() HTML 转义', () => {
    const bm = { title: '<script>alert(1)</script>', url: 'https://a.com' };
    const html = BookmarkContentPreview.generateHtmlPreview(bm);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('generateHtmlPreview() 空书签返回空', () => {
    assert.equal(BookmarkContentPreview.generateHtmlPreview(null), '');
  });

  it('generateSnapshotPreview() 含快照内容', () => {
    const bm = { title: 'Test', url: 'https://a.com' };
    const snap = BookmarkContentPreview.generateSnapshotPreview(bm, 'This is snapshot content for testing truncation behavior');
    assert.ok(snap.includes('Test'));
    assert.ok(snap.includes('snapshot'));
  });

  it('_truncate() 正常截断', () => {
    assert.equal(BookmarkContentPreview._truncate('hello world', 5), 'hello...');
    assert.equal(BookmarkContentPreview._truncate('short', 100), 'short');
  });

  it('_truncate() 不超长返回原样', () => {
    assert.equal(BookmarkContentPreview._truncate('hi', 100), 'hi');
  });

  it('_truncate() 边界值', () => {
    assert.equal(BookmarkContentPreview._truncate('', 10), '');
    assert.equal(BookmarkContentPreview._truncate('abc', 0), '');
    assert.equal(BookmarkContentPreview._truncate('abc', -1), '');
  });

  it('_escapeHtml() 全字符转义', () => {
    const escaped = BookmarkContentPreview._escapeHtml('<div class="a">&\'</div>');
    assert.ok(!escaped.includes('<'));
    assert.ok(!escaped.includes('>'));
    assert.ok(escaped.includes('&lt;'));
    assert.ok(escaped.includes('&gt;'));
    assert.ok(escaped.includes('&amp;'));
    assert.ok(escaped.includes('&quot;'));
    assert.ok(escaped.includes('&#39;'));
    // The raw <, >, & should be escaped; & appears in entities which is correct
    assert.ok(!escaped.includes('<div'));
  });

  it('_escapeHtml() 非字符串返回空', () => {
    assert.equal(BookmarkContentPreview._escapeHtml(null), '');
    assert.equal(BookmarkContentPreview._escapeHtml(123), '');
  });
});

// ==================== 导出常量 ====================

describe('导出常量', () => {
  it('VALID_STATUSES 包含三种状态', () => {
    assert.deepEqual(VALID_STATUSES, ['unread', 'reading', 'read']);
  });

  it('DEFAULT_OPTIONS 不可变', () => {
    assert.throws(() => { DEFAULT_OPTIONS.maxLength = 100; });
    assert.equal(DEFAULT_OPTIONS.maxLength, 200);
    assert.equal(DEFAULT_OPTIONS.includeTags, true);
  });

  it('STATUS_LABELS 代理对象', () => {
    // 代理应该返回字符串（即使 i18n 未初始化也回退到 key）
    assert.equal(typeof STATUS_LABELS.unread, 'string');
    assert.equal(typeof STATUS_LABELS.read, 'string');
  });
});
