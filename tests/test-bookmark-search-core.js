/**
 * 测试 lib/bookmark-search-core.js — 核心搜索逻辑
 *
 * 测试范围:
 *   search (综合搜索) / searchByFilter (条件过滤)
 *   _expandWithGraph / _mergeResults / _sortResults
 *   排序 / 过滤 / 图谱扩展 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  search,
  searchByFilter,
  _expandWithGraph,
  _mergeResults,
  _sortResults,
} from '../lib/bookmark-search-core.js'

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status: status || 'unread',
    dateAdded: 1700000000000 + Number(id) * 86400000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 86400000).toISOString(),
  }
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend']),
  createBookmark('4', 'Python Machine Learning', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml']),
  createBookmark('5', 'GitHub 开源项目推荐', 'https://github.com/trending', ['工具'], ['github']),
  createBookmark('6', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS'], ['javascript', 'frontend'], 'read'),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端'], ['typescript', 'frontend'], 'reading'),
  createBookmark('8', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS'], ['css', 'grid']),
  createBookmark('9', 'React Hooks 深入', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'read'),
  createBookmark('10', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd']),
]

// ==================== Mock Context ====================
// search / searchByFilter 使用 this 上下文, 需要构造模拟对象

function _tokenize(text) {
  if (!text || typeof text !== 'string') return []
  const tokens = []
  const segments = text.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || []
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) { for (const char of seg) tokens.push(char) }
    else if (/[a-zA-Z]/.test(seg)) tokens.push(seg.toLowerCase())
    else tokens.push(seg)
  }
  return tokens
}

function _matchesFolder(bookmark, folder) {
  if (!bookmark.folderPath || !Array.isArray(bookmark.folderPath)) return false
  const folderLower = folder.toLowerCase()
  return bookmark.folderPath.some(f => f.toLowerCase().includes(folderLower))
}

function _matchesTags(bookmark, tags) {
  if (!bookmark.tags || !Array.isArray(bookmark.tags)) return false
  const bmTags = new Set(bookmark.tags.map(t => t.toLowerCase()))
  return tags.every(t => bmTags.has(t.toLowerCase()))
}

function _matchesDomain(bookmark, domain) {
  if (!bookmark.url) return false
  try {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./, '').toLowerCase()
    return hostname.includes(domain.toLowerCase())
  } catch { return false }
}

function _computeHighlights(bookmark, queryTokens) {
  const highlights = []
  const title = (bookmark.title || '').toLowerCase()
  for (const token of queryTokens) {
    if (title.includes(token)) highlights.push(token)
  }
  return highlights
}

/** 构造模拟 indexer */
function createMockIndexer(bookmarks) {
  // 简单的倒排索引实现
  const store = new Map()
  const index = new Map()

  for (const bm of bookmarks) {
    store.set(String(bm.id), bm)
    const tokens = _tokenize(bm.title || '')
    for (const t of tokens) {
      if (!index.has(t)) index.set(t, new Set())
      index.get(t).add(String(bm.id))
    }
  }

  return {
    search(query, opts = {}) {
      const tokens = _tokenize(query.trim())
      if (tokens.length === 0) return []
      let candidateIds = null
      for (const token of tokens) {
        const matchedIds = index.get(token)
        if (!matchedIds) return []
        if (candidateIds === null) { candidateIds = new Set(matchedIds) }
        else {
          const intersection = new Set()
          for (const id of candidateIds) { if (matchedIds.has(id)) intersection.add(id) }
          candidateIds = intersection
        }
        if (candidateIds.size === 0) return []
      }
      if (candidateIds === null) return []
      const results = []
      for (const id of candidateIds) {
        const bm = store.get(id)
        if (!bm) continue
        if (opts.folder && !_matchesFolder(bm, opts.folder)) continue
        if (opts.tags && opts.tags.length > 0 && !_matchesTags(bm, opts.tags)) continue
        // 简单评分
        let score = 10
        for (const qt of tokens) { if ((bm.title || '').toLowerCase().includes(qt)) score += 5 }
        results.push({ id, score, bookmark: bm })
      }
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, opts.limit || 50)
    },
  }
}

/** 构造模拟 graphEngine */
function createMockGraphEngine(bookmarks) {
  return {
    getGraphData() {
      return {
        nodes: bookmarks.map(bm => ({ id: bm.id, data: bm })),
        edges: [],
      }
    },
    getSimilar(bookmarkId, topK = 5) {
      const sourceBm = bookmarks.find(b => String(b.id) === String(bookmarkId))
      if (!sourceBm) return []
      const scored = bookmarks
        .filter(b => String(b.id) !== String(bookmarkId))
        .map(b => ({ id: String(b.id), score: 0.3, bookmark: b }))
      return scored.slice(0, topK)
    },
  }
}

/** 创建完整 mock context (模拟 BookmarkSearch 实例) */
function createMockContext(bookmarks) {
  const indexer = createMockIndexer(bookmarks)
  const graphEngine = createMockGraphEngine(bookmarks)

  return {
    _indexer: indexer,
    _graphEngine: graphEngine,
    _recordSearch: () => {},
    _tokenize,
    _matchesFolder,
    _matchesTags,
    _matchesDomain,
    _computeHighlights,
    _expandWithGraph,
    _mergeResults,
    _sortResults,
    search,
    searchByFilter,
  }
}

// ==================== 测试 ====================

describe('bookmark-search-core: search', () => {
  let ctx

  beforeEach(() => {
    ctx = createMockContext(sampleBookmarks)
  })

  it('1. 空查询返回空数组', () => {
    assert.deepEqual(ctx.search(''), [])
    assert.deepEqual(ctx.search('   '), [])
    assert.deepEqual(ctx.search(null), [])
    assert.deepEqual(ctx.search(undefined), [])
  })

  it('2. 单关键词搜索返回匹配结果', () => {
    const results = ctx.search('React')
    assert.ok(results.length >= 2, `应至少匹配 React 相关书签, 实际 ${results.length}`)
    // 直接索引命中的结果应含 react（图谱扩展可能添加相关但不含 react 的书签）
    const directHits = results.filter(r => r.bookmark.title.toLowerCase().includes('react'))
    assert.ok(directHits.length >= 2, '应至少 2 条直接命中含 react')
  })

  it('3. 多关键词 AND 逻辑搜索', () => {
    const results = ctx.search('React Hooks')
    assert.ok(results.length >= 1, '应匹配 React Hooks')
    // 索引 AND 逻辑: 直接命中的结果应同时含 react 和 hooks
    const directHits = results.filter(r => {
      const lower = r.bookmark.title.toLowerCase()
      return lower.includes('react') && lower.includes('hooks')
    })
    assert.ok(directHits.length >= 1, '应至少 1 条直接命中含 react 和 hooks')
    // 第一个结果应是直接命中的 (高分)
    const firstTitle = results[0].bookmark.title.toLowerCase()
    assert.ok(firstTitle.includes('react'), `第一个结果应含 react: ${results[0].bookmark.title}`)
  })

  it('4. folder 过滤', () => {
    const results = ctx.search('Tutorial', { folder: '后端' })
    for (const r of results) {
      assert.ok(
        r.bookmark.folderPath.some(f => f.includes('后端')),
        `folderPath 应含 '后端': ${JSON.stringify(r.bookmark.folderPath)}`,
      )
    }
  })

  it('5. tags 过滤', () => {
    const results = ctx.search('教程', { tags: ['frontend'] })
    // 如果有结果, 验证标签匹配
    for (const r of results) {
      assert.ok(
        r.bookmark.tags.some(t => t.toLowerCase() === 'frontend'),
        `tags 应含 'frontend': ${JSON.stringify(r.bookmark.tags)}`,
      )
    }
  })

  it('6. status 过滤', () => {
    const results = ctx.search('React', { status: 'read' })
    for (const r of results) {
      assert.equal(r.bookmark.status, 'read', `status 应为 'read': ${r.bookmark.status}`)
    }
  })

  it('7. limit 限制返回数量', () => {
    const r1 = ctx.search('React', { limit: 1 })
    const r5 = ctx.search('React', { limit: 5 })
    assert.ok(r1.length <= 1, 'limit=1 最多返回 1 个')
    assert.ok(r5.length <= 5, 'limit=5 最多返回 5 个')
    if (r1.length > 0 && r5.length > 0) {
      assert.equal(r1[0].id, r5[0].id, 'limit=1 的结果应与 limit=5 的第一个相同')
    }
  })

  it('8. 结果包含 highlights 字段', () => {
    const results = ctx.search('React')
    for (const r of results) {
      assert.ok(Array.isArray(r.highlights), 'highlights 应为数组')
    }
  })

  it('9. 结果按分数降序排列', () => {
    const results = ctx.search('React')
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `结果应按分数降序: ${results[i - 1].score} >= ${results[i].score}`,
      )
    }
  })

  it('10. 搜索无匹配关键词返回空', () => {
    const results = ctx.search('xyznonexistent')
    assert.deepEqual(results, [])
  })
})

describe('bookmark-search-core: searchByFilter', () => {
  let ctx

  beforeEach(() => {
    ctx = createMockContext(sampleBookmarks)
  })

  it('11. 空过滤器返回所有书签', () => {
    const results = ctx.searchByFilter({})
    assert.equal(results.length, sampleBookmarks.length, '应返回全部书签')
  })

  it('12. folder 过滤', () => {
    const results = ctx.searchByFilter({ folder: '后端' })
    for (const r of results) {
      assert.ok(
        r.bookmark.folderPath.some(f => f.includes('后端')),
        `应只含后端文件夹书签: ${JSON.stringify(r.bookmark.folderPath)}`,
      )
    }
    assert.ok(results.length >= 1, '应有后端书签')
    assert.ok(results.length < sampleBookmarks.length, '应少于全部书签')
  })

  it('13. domain 过滤', () => {
    const results = ctx.searchByFilter({ domain: 'github.com' })
    for (const r of results) {
      assert.ok(r.bookmark.url.includes('github.com'), `应只含 github.com 域名: ${r.bookmark.url}`)
    }
    assert.ok(results.length >= 1, '应有 github.com 书签')
  })

  it('14. status 过滤', () => {
    const results = ctx.searchByFilter({ status: 'reading' })
    for (const r of results) {
      assert.equal(r.bookmark.status, 'reading')
    }
    assert.equal(results.length, 1, '应只有 1 个 reading 书签')
  })

  it('15. limit 限制', () => {
    const results = ctx.searchByFilter({ limit: 3 })
    assert.ok(results.length <= 3, '应限制为 3 个')
  })

  it('16. sortBy=title 按标题字母序', () => {
    const results = ctx.searchByFilter({ sortBy: 'title' })
    for (let i = 1; i < results.length; i++) {
      const a = (results[i - 1].bookmark.title || '').toLowerCase()
      const b = (results[i].bookmark.title || '').toLowerCase()
      assert.ok(a.localeCompare(b) <= 0, `应按标题排序: "${a}" <= "${b}"`)
    }
  })

  it('17. tags 过滤', () => {
    const results = ctx.searchByFilter({ tags: ['frontend'] })
    for (const r of results) {
      assert.ok(
        r.bookmark.tags.some(t => t.toLowerCase() === 'frontend'),
        `应含 frontend 标签: ${JSON.stringify(r.bookmark.tags)}`,
      )
    }
    assert.ok(results.length >= 1, '应有 frontend 书签')
  })
})

describe('bookmark-search-core: _mergeResults', () => {
  it('18. 两个空数组合并返回空', () => {
    const result = _mergeResults([], [])
    assert.deepEqual(result, [])
  })

  it('19. 非重叠结果简单合并', () => {
    const index = [{ id: '1', score: 10, bookmark: { id: '1' } }]
    const graph = [{ id: '2', score: 5, bookmark: { id: '2' } }]
    const result = _mergeResults(index, graph)
    assert.equal(result.length, 2)
    assert.ok(result.some(r => r.id === '1'))
    assert.ok(result.some(r => r.id === '2'))
  })

  it('20. 重叠结果加分去重', () => {
    const index = [{ id: '1', score: 10, bookmark: { id: '1' } }]
    const graph = [{ id: '1', score: 5, bookmark: { id: '1' } }]
    const result = _mergeResults(index, graph)
    assert.equal(result.length, 1, '应去重为 1 条')
    assert.ok(result[0].score > 10, `重叠时应加分: ${result[0].score}`)
  })

  it('21. 索引结果保留高分', () => {
    const index = [
      { id: '1', score: 100, bookmark: { id: '1' } },
      { id: '2', score: 50, bookmark: { id: '2' } },
    ]
    const graph = [{ id: '1', score: 20, bookmark: { id: '1' } }]
    const result = _mergeResults(index, graph)
    const item1 = result.find(r => r.id === '1')
    assert.ok(item1.score >= 100, '重叠加分应以索引分数为基础')
  })

  it('22. 纯图谱扩展结果也能合并', () => {
    const graph = [
      { id: '10', score: 3, bookmark: { id: '10' } },
      { id: '20', score: 2, bookmark: { id: '20' } },
    ]
    const result = _mergeResults([], graph)
    assert.equal(result.length, 2)
  })
})

describe('bookmark-search-core: _sortResults', () => {
  const makeResults = (items) => items.map(([id, score, dateAdded]) => ({
    id,
    score,
    bookmark: { id, title: `Title ${id}`, dateAdded },
  }))

  it('23. sortBy=relevance 按分数降序', () => {
    const results = makeResults([['1', 5, 0], ['2', 10, 0], ['3', 7, 0]])
    _sortResults(results, 'relevance', [])
    assert.equal(results[0].score, 10)
    assert.equal(results[1].score, 7)
    assert.equal(results[2].score, 5)
  })

  it('24. sortBy=date 按日期降序', () => {
    const results = makeResults([['1', 0, 1000], ['2', 0, 3000], ['3', 0, 2000]])
    _sortResults(results, 'date', [])
    assert.equal(results[0].bookmark.dateAdded, 3000)
    assert.equal(results[1].bookmark.dateAdded, 2000)
    assert.equal(results[2].bookmark.dateAdded, 1000)
  })

  it('25. sortBy=title 按标题字母序', () => {
    const results = [
      { id: '1', score: 0, bookmark: { id: '1', title: 'Banana', dateAdded: 0 } },
      { id: '2', score: 0, bookmark: { id: '2', title: 'Apple', dateAdded: 0 } },
      { id: '3', score: 0, bookmark: { id: '3', title: 'Cherry', dateAdded: 0 } },
    ]
    _sortResults(results, 'title', [])
    assert.equal(results[0].bookmark.title, 'Apple')
    assert.equal(results[1].bookmark.title, 'Banana')
    assert.equal(results[2].bookmark.title, 'Cherry')
  })

  it('26. 默认排序 (未知 sortBy) 按分数降序', () => {
    const results = makeResults([['1', 1, 0], ['2', 99, 0]])
    _sortResults(results, 'unknown', [])
    assert.equal(results[0].score, 99)
  })
})

describe('bookmark-search-core: _expandWithGraph', () => {
  let ctx

  beforeEach(() => {
    ctx = createMockContext(sampleBookmarks)
  })

  it('27. 空索引结果返回空扩展', () => {
    const expanded = _expandWithGraph.call(ctx, [], 5)
    assert.deepEqual(expanded, [])
  })

  it('28. 扩展结果不与索引结果重复', () => {
    const indexResults = sampleBookmarks.slice(0, 3).map(bm => ({
      id: bm.id,
      score: 10,
      bookmark: bm,
    }))
    const expanded = _expandWithGraph.call(ctx, indexResults, 3)
    const indexIds = new Set(indexResults.map(r => r.id))
    for (const r of expanded) {
      assert.ok(!indexIds.has(r.id), `扩展结果不应与索引重复: ${r.id}`)
    }
  })

  it('29. 扩展结果分数为原始分数的 0.5 倍', () => {
    const indexResults = [{ id: '1', score: 10, bookmark: sampleBookmarks[0] }]
    const expanded = _expandWithGraph.call(ctx, indexResults, 1)
    for (const r of expanded) {
      assert.ok(r.score > 0, '扩展结果分数应 > 0')
      assert.ok(r.score <= 5, `分数应为原 score * 0.5: ${r.score}`)
    }
  })

  it('30. topN 限制扩展源数量', () => {
    const indexResults = sampleBookmarks.map(bm => ({ id: bm.id, score: 10, bookmark: bm }))
    const expanded1 = _expandWithGraph.call(ctx, indexResults, 1)
    const expandedAll = _expandWithGraph.call(ctx, indexResults, indexResults.length)
    // topN=1 只用第一个做扩展
    assert.ok(expanded1.length <= expandedAll.length, 'topN=1 应产生更少的扩展')
  })
})
