/**
 * 测试 lib/search-history.js — 搜索历史与 AI 高亮持久化
 *
 * 覆盖: 历史存储 / 去重 / 排序 / 建议匹配 / 导出 / 清理 / 隐私控制 / AI 高亮
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { installIndexedDBMock, resetIndexedDBMock, installChromeMock, resetChromeMock } from './helpers/setup.js'

// 安装 mock
installChromeMock()
installIndexedDBMock()

const {
  recordSearch,
  getSearchHistory,
  getRecentSearches,
  getSearchSuggestions,
  deleteSearchRecord,
  clearSearchHistory,
  saveAIHighlight,
  getAIHighlightsByPageUrl,
  getAllAIHighlights,
  deleteAIHighlight,
  clearAllAIHighlights,
  exportSearchHistory,
  exportSearchHistoryJSON,
  exportSearchHistoryMarkdown,
  isHistoryEnabled,
  setHistoryEnabled,
  _resetCacheForTest,
} = await import('../lib/search-history.js')

beforeEach(() => {
  _resetCacheForTest()
  resetChromeMock()
  installChromeMock()
  resetIndexedDBMock()
  installIndexedDBMock()
})

afterEach(() => {
  resetIndexedDBMock()
  resetChromeMock()
})

// ==================== 搜索历史存储 ====================

describe('recordSearch()', () => {
  it('保存搜索记录并返回含 id 和 timestamp 的记录', async () => {
    const result = await recordSearch('react hooks', 5, 'knowledge')
    assert.ok(result.id, '应有 id')
    assert.equal(result.query, 'react hooks')
    assert.equal(result.resultCount, 5)
    assert.equal(result.sourceTab, 'knowledge')
    assert.equal(result.count, 1)
    assert.ok(result.timestamp, '应有 timestamp')
  })

  it('归一化查询（trim、小写、合并空格）', async () => {
    const result = await recordSearch('  React   Hooks  ')
    assert.equal(result.query, 'react hooks')
  })

  it('相同归一化查询去重并累加 count', async () => {
    await recordSearch('react hooks')
    await recordSearch('React Hooks')
    const result = await recordSearch('REACT HOOKS')
    assert.equal(result.count, 3)
  })

  it('空/无效输入返回 null', async () => {
    assert.equal(await recordSearch(''), null)
    assert.equal(await recordSearch('   '), null)
    assert.equal(await recordSearch(null), null)
    assert.equal(await recordSearch(undefined), null)
    assert.equal(await recordSearch(123), null)
  })

  it('隐私关闭时返回 null 且不存储', async () => {
    await setHistoryEnabled(false)
    const result = await recordSearch('should not save')
    assert.equal(result, null)
    const history = await getSearchHistory()
    assert.equal(history.length, 0)
  })

  it('超过 200 条上限时淘汰最旧记录', async () => {
    // 先存满 200 条
    for (let i = 0; i < 200; i++) {
      await recordSearch(`query ${i}`)
    }
    // 再存 1 条，应触发淘汰
    await recordSearch('new query')

    const history = await getSearchHistory(300)
    assert.ok(history.length <= 200, `历史记录应 ≤200，实际 ${history.length}`)
    // 新记录应存在
    const found = history.find(r => r.query === 'new query')
    assert.ok(found, '新记录应存在')
  })
})

// ==================== 获取历史 ====================

describe('getSearchHistory()', () => {
  it('初始为空', async () => {
    const history = await getSearchHistory()
    assert.equal(history.length, 0)
  })

  it('按时间倒序返回', async () => {
    await recordSearch('first')
    await new Promise(r => setTimeout(r, 5))
    await recordSearch('second')
    await new Promise(r => setTimeout(r, 5))
    await recordSearch('third')
    const history = await getSearchHistory()
    assert.equal(history.length, 3)
    assert.equal(history[0].query, 'third')
    assert.equal(history[1].query, 'second')
    assert.equal(history[2].query, 'first')
  })

  it('支持 limit 参数', async () => {
    await recordSearch('a')
    await recordSearch('b')
    await recordSearch('c')
    const history = await getSearchHistory(2)
    assert.equal(history.length, 2)
  })

  it('按频率排序：count 高的在前', async () => {
    await recordSearch('once')
    await recordSearch('twice')
    await recordSearch('twice')
    await recordSearch('thrice')
    await recordSearch('thrice')
    await recordSearch('thrice')

    const history = await getSearchHistory(10, 'frequency')
    assert.equal(history[0].query, 'thrice')
    assert.equal(history[1].query, 'twice')
    assert.equal(history[2].query, 'once')
  })
})

// ==================== 最近搜索快捷标签 ====================

describe('getRecentSearches()', () => {
  it('返回最近 5 条（默认）', async () => {
    for (let i = 0; i < 10; i++) {
      await recordSearch(`query ${i}`)
      await new Promise(r => setTimeout(r, 5))
    }
    const recent = await getRecentSearches()
    assert.equal(recent.length, 5)
    assert.equal(recent[0].query, 'query 9')
  })

  it('支持自定义 limit', async () => {
    await recordSearch('a')
    await new Promise(r => setTimeout(r, 5))
    await recordSearch('b')
    const recent = await getRecentSearches(1)
    assert.equal(recent.length, 1)
    assert.equal(recent[0].query, 'b')
  })

  it('空历史返回空数组', async () => {
    const recent = await getRecentSearches()
    assert.equal(recent.length, 0)
  })
})

// ==================== 搜索建议 ====================

describe('getSearchSuggestions()', () => {
  it('输入 ≥2 字符匹配历史记录前缀', async () => {
    await recordSearch('react hooks')
    await recordSearch('react router')
    await recordSearch('vue guide')
    const suggestions = await getSearchSuggestions('re')
    assert.equal(suggestions.length, 2)
    assert.ok(suggestions.includes('react hooks'))
    assert.ok(suggestions.includes('react router'))
  })

  it('按频率加权排序', async () => {
    await recordSearch('test alpha')
    await recordSearch('test beta')
    await recordSearch('test beta')
    await recordSearch('test beta')
    const suggestions = await getSearchSuggestions('test')
    assert.equal(suggestions[0], 'test beta')
  })

  it('默认返回 Top-5', async () => {
    for (let i = 0; i < 8; i++) {
      await recordSearch(`search ${i}`)
    }
    const suggestions = await getSearchSuggestions('se')
    assert.ok(suggestions.length <= 5, `应 ≤5 条，实际 ${suggestions.length}`)
  })

  it('自定义 limit', async () => {
    await recordSearch('test a')
    await recordSearch('test b')
    await recordSearch('test c')
    const suggestions = await getSearchSuggestions('te', 2)
    assert.equal(suggestions.length, 2)
  })

  it('不匹配的前缀返回空', async () => {
    await recordSearch('react hooks')
    assert.deepEqual(await getSearchSuggestions('vu'), [])
  })

  it('输入 <2 字符返回空', async () => {
    await recordSearch('react')
    assert.deepEqual(await getSearchSuggestions('r'), [])
    assert.deepEqual(await getSearchSuggestions(''), [])
  })

  it('无效输入返回空', async () => {
    assert.deepEqual(await getSearchSuggestions(null), [])
    assert.deepEqual(await getSearchSuggestions(undefined), [])
  })

  it('建议去重', async () => {
    await recordSearch('react hooks')
    await recordSearch('React Hooks')
    const suggestions = await getSearchSuggestions('re')
    assert.equal(suggestions.length, 1)
  })
})

// ==================== 删除与清理 ====================

describe('deleteSearchRecord()', () => {
  it('删除指定记录', async () => {
    const r = await recordSearch('to delete')
    await recordSearch('to keep')
    await deleteSearchRecord(r.id)
    const history = await getSearchHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].query, 'to keep')
  })
})

describe('clearSearchHistory()', () => {
  it('清除全部历史', async () => {
    await recordSearch('a')
    await recordSearch('b')
    await recordSearch('c')
    await clearSearchHistory()
    const history = await getSearchHistory()
    assert.equal(history.length, 0)
  })

  it('清除后可继续正常存储', async () => {
    await recordSearch('before')
    await clearSearchHistory()
    await recordSearch('after')
    const history = await getSearchHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].query, 'after')
  })

  it('空历史时清除不报错', async () => {
    await clearSearchHistory()
    const history = await getSearchHistory()
    assert.equal(history.length, 0)
  })
})

// ==================== AI 高亮持久化 ====================

describe('saveAIHighlight()', () => {
  it('保存 AI 高亮并返回含 id 和 createdAt 的记录', async () => {
    const result = await saveAIHighlight({
      bookmarkId: 'bm_001',
      pageUrl: 'https://example.com/article',
      selectedText: '什么是 IndexedDB',
      aiAnswer: 'IndexedDB 是浏览器内置的 NoSQL 数据库...'
    })
    assert.ok(result.id, '应有 id')
    assert.equal(result.bookmarkId, 'bm_001')
    assert.equal(result.pageUrl, 'https://example.com/article')
    assert.equal(result.selectedText, '什么是 IndexedDB')
    assert.ok(result.createdAt)
  })

  it('缺少必填字段时抛出错误', async () => {
    await assert.rejects(
      () => saveAIHighlight({ pageUrl: '', selectedText: 'a', aiAnswer: 'b' }),
      /required/
    )
    await assert.rejects(
      () => saveAIHighlight({ pageUrl: 'a', selectedText: '', aiAnswer: 'b' }),
      /required/
    )
    await assert.rejects(
      () => saveAIHighlight({ pageUrl: 'a', selectedText: 'b', aiAnswer: '' }),
      /required/
    )
  })

  it('默认 bookmarkId 为空字符串', async () => {
    const result = await saveAIHighlight({
      pageUrl: 'https://example.com',
      selectedText: 'text',
      aiAnswer: 'answer'
    })
    assert.equal(result.bookmarkId, '')
  })
})

describe('getAIHighlightsByPageUrl()', () => {
  it('返回指定页面的 AI 高亮', async () => {
    await saveAIHighlight({
      pageUrl: 'https://example.com/page1',
      selectedText: 'text1',
      aiAnswer: 'answer1'
    })
    await saveAIHighlight({
      pageUrl: 'https://example.com/page2',
      selectedText: 'text2',
      aiAnswer: 'answer2'
    })
    await saveAIHighlight({
      pageUrl: 'https://example.com/page1',
      selectedText: 'text3',
      aiAnswer: 'answer3'
    })

    const highlights = await getAIHighlightsByPageUrl('https://example.com/page1')
    assert.equal(highlights.length, 2)
  })

  it('无匹配页面返回空数组', async () => {
    const highlights = await getAIHighlightsByPageUrl('https://nonexistent.com')
    assert.equal(highlights.length, 0)
  })

  it('空 URL 返回空数组', async () => {
    const highlights = await getAIHighlightsByPageUrl('')
    assert.equal(highlights.length, 0)
  })

  it('按 createdAt 倒序排列', async () => {
    await saveAIHighlight({
      pageUrl: 'https://example.com',
      selectedText: 'first',
      aiAnswer: 'answer1'
    })
    await new Promise(r => setTimeout(r, 5))
    await saveAIHighlight({
      pageUrl: 'https://example.com',
      selectedText: 'second',
      aiAnswer: 'answer2'
    })

    const highlights = await getAIHighlightsByPageUrl('https://example.com')
    assert.equal(highlights[0].selectedText, 'second')
    assert.equal(highlights[1].selectedText, 'first')
  })
})

describe('getAllAIHighlights()', () => {
  it('返回全部 AI 高亮', async () => {
    await saveAIHighlight({
      pageUrl: 'https://a.com',
      selectedText: 't1',
      aiAnswer: 'a1'
    })
    await saveAIHighlight({
      pageUrl: 'https://b.com',
      selectedText: 't2',
      aiAnswer: 'a2'
    })

    const all = await getAllAIHighlights()
    assert.equal(all.length, 2)
  })

  it('空时返回空数组', async () => {
    const all = await getAllAIHighlights()
    assert.equal(all.length, 0)
  })
})

describe('deleteAIHighlight()', () => {
  it('删除指定高亮', async () => {
    const h = await saveAIHighlight({
      pageUrl: 'https://example.com',
      selectedText: 'delete me',
      aiAnswer: 'ok'
    })
    await saveAIHighlight({
      pageUrl: 'https://example.com',
      selectedText: 'keep me',
      aiAnswer: 'ok'
    })

    await deleteAIHighlight(h.id)
    const all = await getAllAIHighlights()
    assert.equal(all.length, 1)
    assert.equal(all[0].selectedText, 'keep me')
  })
})

describe('clearAllAIHighlights()', () => {
  it('清除全部 AI 高亮', async () => {
    await saveAIHighlight({ pageUrl: 'https://a.com', selectedText: 't1', aiAnswer: 'a1' })
    await saveAIHighlight({ pageUrl: 'https://b.com', selectedText: 't2', aiAnswer: 'a2' })
    await clearAllAIHighlights()
    const all = await getAllAIHighlights()
    assert.equal(all.length, 0)
  })
})

// ==================== 搜索历史导出 ====================

describe('exportSearchHistory()', () => {
  it('JSON 格式导出包含 type 和 records', async () => {
    await recordSearch('react hooks', 5)
    await recordSearch('vue guide', 3)
    const json = await exportSearchHistoryJSON()
    const data = JSON.parse(json)
    assert.equal(data.type, 'PageWiseSearchHistory')
    assert.ok(data.exportTime)
    assert.equal(data.totalRecords, 2)
    assert.ok(Array.isArray(data.records))
    assert.equal(data.records.length, 2)
    const queries = data.records.map(r => r.query)
    assert.ok(queries.includes('react hooks'))
    assert.ok(queries.includes('vue guide'))
  })

  it('Markdown 格式导出包含标题和表格', async () => {
    await recordSearch('react hooks', 5)
    const md = await exportSearchHistoryMarkdown()
    assert.ok(md.includes('# 搜索历史导出'))
    assert.ok(md.includes('导出时间'))
    assert.ok(md.includes('react hooks'))
    assert.ok(md.includes('|'))
  })

  it('统一导出接口默认 JSON', async () => {
    await recordSearch('test')
    const result = await exportSearchHistory('json')
    const data = JSON.parse(result)
    assert.equal(data.type, 'PageWiseSearchHistory')
  })

  it('统一导出接口支持 markdown', async () => {
    await recordSearch('test')
    const result = await exportSearchHistory('markdown')
    assert.ok(result.includes('# 搜索历史导出'))
  })

  it('空历史 JSON 导出仍返回有效 JSON', async () => {
    const json = await exportSearchHistoryJSON()
    const data = JSON.parse(json)
    assert.equal(data.totalRecords, 0)
    assert.deepEqual(data.records, [])
  })

  it('空历史 Markdown 导出含暂无提示', async () => {
    const md = await exportSearchHistoryMarkdown()
    assert.ok(md.includes('暂无搜索记录'))
  })
})

// ==================== 隐私控制 ====================

describe('隐私控制', () => {
  it('默认历史记录启用', async () => {
    const enabled = await isHistoryEnabled()
    assert.equal(enabled, true)
  })

  it('关闭历史记录功能', async () => {
    await setHistoryEnabled(false)
    const enabled = await isHistoryEnabled()
    assert.equal(enabled, false)
  })

  it('重新启用历史记录', async () => {
    await setHistoryEnabled(false)
    await setHistoryEnabled(true)
    const enabled = await isHistoryEnabled()
    assert.equal(enabled, true)
  })

  it('关闭后 recordSearch 返回 null', async () => {
    await setHistoryEnabled(false)
    const result = await recordSearch('should not save')
    assert.equal(result, null)
  })

  it('关闭后清除历史再启用，之前的数据仍在', async () => {
    await recordSearch('before off')
    await setHistoryEnabled(false)
    await setHistoryEnabled(true)
    const history = await getSearchHistory()
    // 关闭期间不会存储新记录，但之前的还在
    assert.ok(history.length >= 1)
    assert.equal(history[0].query, 'before off')
  })
})
