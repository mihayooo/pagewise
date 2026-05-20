import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  BookmarkCollector,
  BookmarkIndexer,
  BookmarkStatusManager,
  BookmarkContentPreview,
  VALID_STATUSES,
  DEFAULT_OPTIONS,
  STATUS_LABELS,
} from '../lib/bookmark-core.js'

describe('BookmarkCollector', () => {
  let collector
  beforeEach(() => { collector = new BookmarkCollector() })

  it('should initialize with empty bookmarks', () => {
    assert.deepEqual(collector.bookmarks, [])
  })

  it('collect should return empty array when chrome is undefined', async () => {
    const result = await collector.collect()
    assert.deepEqual(result, [])
  })

  it('normalize should return null for null/missing-url node', () => {
    assert.equal(collector.normalize(null), null)
    assert.equal(collector.normalize({}), null)
    assert.equal(collector.normalize({ id: '1' }), null)
  })

  it('normalize should extract fields from a valid node', () => {
    const node = { id: '42', title: 'Test', url: 'https://example.com', dateAdded: 1700000000000 }
    const result = collector.normalize(node, ['Folder1'])
    assert.equal(result.id, '42')
    assert.equal(result.title, 'Test')
    assert.equal(result.url, 'https://example.com')
    assert.deepEqual(result.folderPath, ['Folder1'])
    assert.ok(result.dateAddedISO.includes('2023'))
  })

  it('normalize should default empty title and dateAdded', () => {
    const node = { id: '1', url: 'https://x.com' }
    const result = collector.normalize(node)
    assert.equal(result.title, '')
    assert.equal(result.dateAdded, 0)
    assert.equal(result.dateAddedISO, '')
  })

  it('getStats should return zero for empty collector', () => {
    const stats = collector.getStats()
    assert.equal(stats.total, 0)
    assert.equal(stats.folders, 0)
    assert.deepEqual(stats.domainDistribution, {})
  })

  it('getStats should compute domain distribution and folder count', () => {
    collector.bookmarks = [
      { id: '1', title: 'A', url: 'https://example.com/a', folderPath: ['Folder1'], dateAdded: 0, dateAddedISO: '' },
      { id: '2', title: 'B', url: 'https://example.com/b', folderPath: ['Folder1', 'Sub'], dateAdded: 0, dateAddedISO: '' },
      { id: '3', title: 'C', url: 'https://other.com', folderPath: ['Folder2'], dateAdded: 0, dateAddedISO: '' },
    ]
    const stats = collector.getStats()
    assert.equal(stats.total, 3)
    assert.equal(stats.domainDistribution['example.com'], 2)
    assert.equal(stats.domainDistribution['other.com'], 1)
    assert.ok(stats.folders >= 3)
  })

  it('getStats should count unknown for invalid URLs', () => {
    collector.bookmarks = [
      { id: '1', title: 'A', url: 'not-a-url', folderPath: [], dateAdded: 0, dateAddedISO: '' },
    ]
    const stats = collector.getStats()
    assert.equal(stats.domainDistribution['unknown'], 1)
  })

  it('_walk should process folder nodes with children', () => {
    const node = {
      title: 'Root', children: [
        { id: '1', title: 'Link', url: 'https://a.com', dateAdded: 0 },
        { title: 'Sub', children: [
          { id: '2', title: 'Deep', url: 'https://b.com', dateAdded: 0 }
        ]}
      ]
    }
    collector._walk(node, [])
    assert.equal(collector.bookmarks.length, 2)
    assert.equal(collector.bookmarks[0].folderPath[0], 'Root')
    assert.equal(collector.bookmarks[1].folderPath[0], 'Root')
    assert.equal(collector.bookmarks[1].folderPath[1], 'Sub')
  })

  it('_walk should handle null node gracefully', () => {
    collector._walk(null, [])
    assert.equal(collector.bookmarks.length, 0)
  })

  it('_walk should build url index for duplicates', () => {
    const node = {
      children: [
        { id: '1', title: 'A', url: 'https://dup.com', dateAdded: 0 },
        { id: '2', title: 'B', url: 'https://dup.com', dateAdded: 0 },
      ]
    }
    collector._walk(node, [])
    assert.equal(collector.bookmarks.length, 2)
    const indexed = collector._urlIndex.get('https://dup.com')
    assert.equal(indexed.length, 2)
  })
})

describe('BookmarkIndexer', () => {
  let indexer
  beforeEach(() => {
    indexer = new BookmarkIndexer()
  })

  it('should initialize with empty stores', () => {
    const size = indexer.getSize()
    assert.equal(size.bookmarks, 0)
    assert.equal(size.tokens, 0)
    assert.equal(size.folders, 0)
  })

  it('buildIndex should handle non-array input', () => {
    indexer.buildIndex(null)
    assert.equal(indexer.getSize().bookmarks, 0)
  })

  it('addBookmark should index a bookmark', () => {
    indexer.addBookmark({ id: '1', title: 'React Docs', url: 'https://react.dev', folderPath: ['Dev'] })
    const size = indexer.getSize()
    assert.equal(size.bookmarks, 1)
    assert.ok(size.tokens > 0)
  })

  it('addBookmark should skip null/missing-id', () => {
    indexer.addBookmark(null)
    indexer.addBookmark({})
    assert.equal(indexer.getSize().bookmarks, 0)
  })

  it('search should find bookmarks by title token', () => {
    indexer.addBookmark({ id: '1', title: 'React Tutorial', url: 'https://react.dev', folderPath: ['Dev'] })
    indexer.addBookmark({ id: '2', title: 'Vue Guide', url: 'https://vuejs.org', folderPath: ['Dev'] })
    const results = indexer.search('react')
    assert.ok(results.length >= 1)
    assert.equal(results[0].bookmark.title, 'React Tutorial')
  })

  it('search should return empty for empty/invalid query', () => {
    assert.deepEqual(indexer.search(''), [])
    assert.deepEqual(indexer.search(null), [])
    assert.deepEqual(indexer.search(123), [])
  })

  it('search should intersect multiple tokens (AND logic)', () => {
    indexer.addBookmark({ id: '1', title: 'React Tutorial', url: 'https://react.dev' })
    indexer.addBookmark({ id: '2', title: 'Vue Tutorial', url: 'https://vuejs.org' })
    const results = indexer.search('react tutorial')
    assert.equal(results.length, 1)
    assert.equal(results[0].id, '1')
  })

  it('search should respect limit option', () => {
    for (let i = 0; i < 10; i++) {
      indexer.addBookmark({ id: String(i), title: `Test Item ${i}`, url: `https://x${i}.com` })
    }
    const results = indexer.search('test', { limit: 3 })
    assert.ok(results.length <= 3)
  })

  it('search should filter by folder', () => {
    indexer.addBookmark({ id: '1', title: 'Alpha', url: 'https://a.com', folderPath: ['Work'] })
    indexer.addBookmark({ id: '2', title: 'Alpha2', url: 'https://b.com', folderPath: ['Personal'] })
    const results = indexer.search('alpha', { folder: 'Work' })
    assert.equal(results.length, 1)
    assert.equal(results[0].id, '1')
  })

  it('search should filter by tags', () => {
    indexer.addBookmark({ id: '1', title: 'Test', url: 'https://a.com', tags: ['react'] })
    indexer.addBookmark({ id: '2', title: 'Test', url: 'https://b.com', tags: ['vue'] })
    const results = indexer.search('test', { tags: ['react'] })
    assert.equal(results.length, 1)
  })

  it('removeBookmark should remove and return true', () => {
    indexer.addBookmark({ id: '1', title: 'Test', url: 'https://a.com', folderPath: ['F'] })
    assert.equal(indexer.removeBookmark('1'), true)
    assert.equal(indexer.getSize().bookmarks, 0)
  })

  it('removeBookmark should return false for unknown id', () => {
    assert.equal(indexer.removeBookmark('999'), false)
  })

  it('buildIndex should clear and rebuild', () => {
    indexer.addBookmark({ id: '1', title: 'Old', url: 'https://old.com' })
    indexer.buildIndex([{ id: '2', title: 'New', url: 'https://new.com' }])
    assert.equal(indexer.getSize().bookmarks, 1)
    assert.deepEqual(indexer.search('old'), [])
    assert.ok(indexer.search('new').length > 0)
  })
})

describe('BookmarkStatusManager (core)', () => {
  let mgr
  const bms = [
    { id: '1', title: 'A', url: 'https://a.com' },
    { id: '2', title: 'B', url: 'https://b.com' },
    { id: '3', title: 'C', url: 'https://c.com' },
  ]

  beforeEach(() => { mgr = new BookmarkStatusManager(bms) })

  it('should throw for non-array constructor arg', () => {
    assert.throws(() => new BookmarkStatusManager('bad'), TypeError)
  })

  it('getStatus should default to unread', () => {
    assert.equal(mgr.getStatus('1'), 'unread')
  })

  it('getStatus should return null for unknown id', () => {
    assert.equal(mgr.getStatus('999'), null)
  })

  it('setStatus should return false for invalid status', () => {
    assert.equal(mgr.setStatus('1', 'invalid'), false)
  })

  it('setStatus should return false for unknown id', () => {
    assert.equal(mgr.setStatus('999', 'read'), false)
  })

  it('setStatus and getStatus should work for valid status', () => {
    assert.equal(mgr.setStatus('1', 'reading'), true)
    assert.equal(mgr.getStatus('1'), 'reading')
  })

  it('VALID_STATUSES should contain expected values', () => {
    assert.deepEqual(VALID_STATUSES, ['unread', 'reading', 'read'])
  })

  it('batchSetStatus should count successes', () => {
    const count = mgr.batchSetStatus(['1', '2', '999'], 'read')
    assert.equal(count, 2)
  })

  it('batchSetStatus should return 0 for non-array', () => {
    assert.equal(mgr.batchSetStatus('not-array', 'read'), 0)
  })

  it('batchSetStatus should return 0 for invalid status', () => {
    assert.equal(mgr.batchSetStatus(['1'], 'bad'), 0)
  })

  it('getByStatus should filter correctly', () => {
    mgr.setStatus('1', 'read')
    mgr.setStatus('2', 'reading')
    const reads = mgr.getByStatus('read')
    assert.equal(reads.length, 1)
    assert.equal(reads[0].id, '1')
  })

  it('getByStatus should return empty for invalid status', () => {
    assert.deepEqual(mgr.getByStatus('bad'), [])
  })

  it('getStatusCounts should return counts', () => {
    mgr.setStatus('1', 'read')
    mgr.setStatus('2', 'reading')
    const counts = mgr.getStatusCounts()
    assert.equal(counts.read, 1)
    assert.equal(counts.reading, 1)
    assert.equal(counts.unread, 1)
  })

  it('markAllAsRead should set all to read', () => {
    const count = mgr.markAllAsRead(['1', '2', '3'])
    assert.equal(count, 3)
    assert.equal(mgr.getStatus('1'), 'read')
    assert.equal(mgr.getStatus('2'), 'read')
    assert.equal(mgr.getStatus('3'), 'read')
  })

  it('getRecentlyRead should return sorted by recency', () => {
    mgr.setStatus('1', 'read')
    mgr.setStatus('2', 'read')
    const recent = mgr.getRecentlyRead(10)
    assert.equal(recent.length, 2)
    assert.equal(recent[0].id, '2') // most recently set first
  })

  it('getRecentlyRead should respect limit', () => {
    mgr.markAllAsRead(['1', '2', '3'])
    const recent = mgr.getRecentlyRead(2)
    assert.equal(recent.length, 2)
  })
})

describe('BookmarkContentPreview', () => {
  it('extractUrlInfo should parse a valid URL', () => {
    const info = BookmarkContentPreview.extractUrlInfo('https://example.com/path?q=1')
    assert.equal(info.domain, 'example.com')
    assert.equal(info.path, '/path')
    assert.equal(info.protocol, 'https')
    assert.ok(info.favicon.includes('favicon'))
  })

  it('extractUrlInfo should handle invalid URL', () => {
    const info = BookmarkContentPreview.extractUrlInfo('not-a-url')
    assert.equal(info.domain, '')
    assert.equal(info.path, '')
    assert.equal(info.protocol, '')
    assert.equal(info.favicon, '')
  })

  it('generateTextPreview should return empty for null', () => {
    assert.equal(BookmarkContentPreview.generateTextPreview(null), '')
  })

  it('generateTextPreview should include title, domain, folder, tags, status', () => {
    const bm = { title: 'Test', url: 'https://example.com', folderPath: ['A', 'B'], tags: ['t1', 't2'], status: 'read' }
    const text = BookmarkContentPreview.generateTextPreview(bm)
    assert.ok(text.includes('Test'))
    assert.ok(text.includes('example.com'))
    assert.ok(text.includes('📂'))
    assert.ok(text.includes('🏷'))
  })

  it('generateTextPreview should truncate long text', () => {
    const bm = { title: 'X'.repeat(500), url: 'https://e.com' }
    const text = BookmarkContentPreview.generateTextPreview(bm, { maxLength: 50 })
    assert.ok(text.length <= 55) // 50 + '...'
  })

  it('generateTextPreview should respect opts to disable parts', () => {
    const bm = { title: 'T', url: 'https://e.com', tags: ['a'], status: 'read', folderPath: ['F'] }
    const text = BookmarkContentPreview.generateTextPreview(bm, { includeTags: false, includeStatus: false, includeFolder: false })
    assert.ok(!text.includes('🏷'))
    assert.ok(!text.includes('📂'))
  })

  it('generateHtmlPreview should return empty for null', () => {
    assert.equal(BookmarkContentPreview.generateHtmlPreview(null), '')
  })

  it('generateHtmlPreview should produce HTML with class names', () => {
    const bm = { title: 'My <Title>', url: 'https://example.com', tags: ['a'], status: 'read', folderPath: ['F'] }
    const html = BookmarkContentPreview.generateHtmlPreview(bm)
    assert.ok(html.includes('bookmark-preview'))
    assert.ok(html.includes('preview-title'))
    assert.ok(html.includes('&lt;Title&gt;'))
    assert.ok(html.includes('preview-tag'))
    assert.ok(html.includes('preview-status'))
  })

  it('generateSnapshotPreview should return empty for null', () => {
    assert.equal(BookmarkContentPreview.generateSnapshotPreview(null), '')
  })

  it('generateSnapshotPreview should include snapshot content', () => {
    const bm = { title: 'Test', url: 'https://e.com' }
    const preview = BookmarkContentPreview.generateSnapshotPreview(bm, 'Some content here')
    assert.ok(preview.includes('Some content here'))
  })

  it('_truncate should handle edge cases', () => {
    assert.equal(BookmarkContentPreview._truncate('', 10), '')
    assert.equal(BookmarkContentPreview._truncate('abc', -1), '')
    assert.equal(BookmarkContentPreview._truncate(null, 10), '')
    assert.equal(BookmarkContentPreview._truncate('hello', 3), 'hel...')
  })

  it('_escapeHtml should escape special characters', () => {
    const escaped = BookmarkContentPreview._escapeHtml('<script>alert("xss")&</script>')
    assert.ok(escaped.includes('&lt;'))
    assert.ok(escaped.includes('&gt;'))
    assert.ok(escaped.includes('&amp;'))
    assert.ok(escaped.includes('&quot;'))
  })

  it('_escapeHtml should handle non-string input', () => {
    assert.equal(BookmarkContentPreview._escapeHtml(null), '')
    assert.equal(BookmarkContentPreview._escapeHtml(123), '')
  })

  it('DEFAULT_OPTIONS should be frozen', () => {
    assert.ok(Object.isFrozen(DEFAULT_OPTIONS))
    assert.equal(DEFAULT_OPTIONS.maxLength, 200)
  })

  it('STATUS_LABELS proxy should return key for unknown status', () => {
    const label = STATUS_LABELS['unread']
    assert.ok(typeof label === 'string')
  })
})

// ==================== R187 补充测试 ====================

describe('BookmarkIndexer (R187 补充)', () => {
  let indexer
  beforeEach(() => { indexer = new BookmarkIndexer() })

  it('search 应支持中文逐字分词搜索', () => {
    indexer.addBookmark({ id: '1', title: '前端开发教程', url: 'https://a.com' })
    indexer.addBookmark({ id: '2', title: '后端架构设计', url: 'https://b.com' })
    // 中文逐字分词: '前' 只匹配第一个
    const results = indexer.search('前')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, '1')
  })

  it('search 应通过 URL hostname 匹配', () => {
    indexer.addBookmark({ id: '1', title: 'Page A', url: 'https://react.dev/docs' })
    indexer.addBookmark({ id: '2', title: 'Page B', url: 'https://vuejs.org/guide' })
    const results = indexer.search('react')
    assert.ok(results.length >= 1, '应通过 URL 中的 react 匹配')
    assert.equal(results[0].id, '1')
  })

  it('search 应支持多标签 AND 过滤', () => {
    indexer.addBookmark({ id: '1', title: 'Test', url: 'https://a.com', tags: ['react', 'frontend'] })
    indexer.addBookmark({ id: '2', title: 'Test', url: 'https://b.com', tags: ['react', 'backend'] })
    // 两个标签都必须匹配
    const results = indexer.search('test', { tags: ['react', 'frontend'] })
    assert.equal(results.length, 1)
    assert.equal(results[0].id, '1')
  })

  it('search 应按匹配度排序 (标题匹配 > URL 匹配)', () => {
    indexer.addBookmark({ id: '1', title: 'React Tutorial', url: 'https://example.com' })
    indexer.addBookmark({ id: '2', title: 'Some Page', url: 'https://react.dev' })
    const results = indexer.search('react')
    assert.ok(results.length === 2)
    // 标题含 react 的应排在前面
    assert.equal(results[0].id, '1', '标题匹配应排第一')
  })

  it('addBookmark 应正确建立文件夹索引', () => {
    indexer.addBookmark({ id: '1', title: 'A', url: 'https://a.com', folderPath: ['Work', 'Projects'] })
    const size = indexer.getSize()
    assert.ok(size.folders >= 1, '应建立文件夹索引')
  })

  it('removeBookmark 应清理文件夹索引', () => {
    indexer.addBookmark({ id: '1', title: 'A', url: 'https://a.com', folderPath: ['Work'] })
    indexer.removeBookmark('1')
    const size = indexer.getSize()
    assert.equal(size.bookmarks, 0)
    assert.equal(size.folders, 0, '文件夹索引应被清理')
  })

  it('search 不存在的 token 应返回空', () => {
    indexer.addBookmark({ id: '1', title: 'Hello World', url: 'https://a.com' })
    assert.deepEqual(indexer.search('xyz'), [])
  })

  it('buildIndex 批量构建后应可搜索', () => {
    const bookmarks = [
      { id: '1', title: 'Alpha', url: 'https://a.com' },
      { id: '2', title: 'Beta', url: 'https://b.com' },
      { id: '3', title: 'Gamma', url: 'https://c.com' },
    ]
    indexer.buildIndex(bookmarks)
    assert.ok(indexer.search('alpha').length >= 1)
    assert.ok(indexer.search('beta').length >= 1)
    assert.ok(indexer.search('gamma').length >= 1)
    assert.equal(indexer.getSize().bookmarks, 3)
  })
})

describe('BookmarkCollector (R187 补充)', () => {
  let collector
  beforeEach(() => { collector = new BookmarkCollector() })

  it('_walk 应处理深层嵌套文件夹', () => {
    const node = {
      title: 'L1', children: [{
        title: 'L2', children: [{
          title: 'L3', children: [
            { id: '1', title: 'Deep Link', url: 'https://deep.com', dateAdded: 0 },
          ]
        }]
      }]
    }
    collector._walk(node, [])
    assert.equal(collector.bookmarks.length, 1)
    assert.deepEqual(collector.bookmarks[0].folderPath, ['L1', 'L2', 'L3'])
  })

  it('_walk 应处理无标题的文件夹节点', () => {
    const node = {
      children: [
        { id: '1', title: 'Link', url: 'https://a.com', dateAdded: 0 },
      ]
    }
    collector._walk(node, [])
    assert.equal(collector.bookmarks.length, 1)
    // 无标题文件夹不应添加到路径
    assert.deepEqual(collector.bookmarks[0].folderPath, [])
  })

  it('_walk 应忽略没有 url 的非文件夹节点', () => {
    const node = {
      children: [
        { id: '1' }, // 无 url 无 children
        { id: '2', title: 'Valid', url: 'https://a.com', dateAdded: 0 },
      ]
    }
    collector._walk(node, [])
    assert.equal(collector.bookmarks.length, 1)
    assert.equal(collector.bookmarks[0].id, '2')
  })

  it('getStats 应正确处理 www 子域名去除', () => {
    collector.bookmarks = [
      { id: '1', title: 'A', url: 'https://www.example.com', folderPath: [], dateAdded: 0, dateAddedISO: '' },
      { id: '2', title: 'B', url: 'https://example.com', folderPath: [], dateAdded: 0, dateAddedISO: '' },
    ]
    const stats = collector.getStats()
    // www.example.com 和 example.com 应合并为同一域名
    assert.equal(stats.domainDistribution['example.com'], 2)
  })

  it('normalize 应正确处理 dateAdded 为 0', () => {
    const node = { id: '1', title: 'T', url: 'https://x.com', dateAdded: 0 }
    const result = collector.normalize(node)
    assert.equal(result.dateAdded, 0)
    assert.equal(result.dateAddedISO, '')
  })
})

describe('BookmarkStatusManager (R187 补充)', () => {
  it('getRecentlyRead 无已读项应返回空', () => {
    const mgr = new BookmarkStatusManager([{ id: '1', title: 'A' }, { id: '2', title: 'B' }])
    const recent = mgr.getRecentlyRead(10)
    assert.deepEqual(recent, [])
  })

  it('setStatus 应支持从 reading 回到 unread', () => {
    const mgr = new BookmarkStatusManager([{ id: '1', title: 'A' }])
    mgr.setStatus('1', 'reading')
    assert.equal(mgr.getStatus('1'), 'reading')
    mgr.setStatus('1', 'unread')
    assert.equal(mgr.getStatus('1'), 'unread')
  })

  it('getStatusCounts 应返回三个状态的计数', () => {
    const mgr = new BookmarkStatusManager([
      { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' },
    ])
    mgr.setStatus('1', 'read')
    mgr.setStatus('2', 'read')
    mgr.setStatus('3', 'reading')
    const counts = mgr.getStatusCounts()
    assert.equal(counts.read, 2)
    assert.equal(counts.reading, 1)
    assert.equal(counts.unread, 2)
  })

  it('constructor 应忽略 null 元素', () => {
    const mgr = new BookmarkStatusManager([null, { id: '1', title: 'A' }, undefined])
    assert.equal(mgr.getStatus('1'), 'unread')
    assert.equal(mgr.getStatus(null), null)
  })

  it('batchSetStatus 空数组应返回 0', () => {
    const mgr = new BookmarkStatusManager([{ id: '1' }])
    assert.equal(mgr.batchSetStatus([], 'read'), 0)
  })
})

describe('BookmarkContentPreview (R187 补充)', () => {
  it('generateTextPreview 仅含 URL 时应显示域名', () => {
    const bm = { url: 'https://example.com/page' }
    const text = BookmarkContentPreview.generateTextPreview(bm)
    assert.ok(text.includes('example.com'))
  })

  it('generateTextPreview 空书签应返回空字符串', () => {
    assert.equal(BookmarkContentPreview.generateTextPreview({}), '')
    assert.equal(BookmarkContentPreview.generateTextPreview(''), '')
  })

  it('generateHtmlPreview 空标签数组不应显示 tag 区域', () => {
    const bm = { title: 'Test', url: 'https://e.com', tags: [] }
    const html = BookmarkContentPreview.generateHtmlPreview(bm)
    assert.ok(!html.includes('preview-tag'))
  })

  it('generateSnapshotPreview 无 snapshotContent 时应只含文本预览', () => {
    const bm = { title: 'Test', url: 'https://e.com' }
    const preview = BookmarkContentPreview.generateSnapshotPreview(bm, null)
    assert.ok(preview.includes('Test'))
    assert.ok(!preview.includes('---'))
  })

  it('_truncate 在 maxLen=Infinity 时应返回空字符串（非有限数视为无效）', () => {
    const text = 'hello world'
    assert.equal(BookmarkContentPreview._truncate(text, Infinity), '')
  })
})
