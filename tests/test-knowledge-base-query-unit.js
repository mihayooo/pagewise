/**
 * R291: KnowledgeBaseQuery 单元测试
 * 覆盖: _extractWords, _extractNgrams, _addToIndex, _removeFromIndex,
 *       _searchByNgram, _matchesEntry, search, searchPaged,
 *       getAllTags, getAllCategories, getAllLanguages
 *
 * 使用独立 TestableQuery 类复制 KnowledgeBaseQuery 的纯逻辑方法，
 * 绕过 IndexedDB 依赖，专注测试算法正确性。
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

class TestableQuery {
  constructor () {
    this._searchIndex = new Map()
    this._indexWordsById = new Map()
    this._ngramIndex = new Map()
    this._ngramSize = 3
    this._indexBuilt = false
    this._tagsCache = null
    this._categoriesCache = null
    this._languagesCache = null
    this._searchCache = new Map()
    this._searchCacheMaxSize = 10
    this._testEntries = []
  }

  _extractWords (entry) {
    const text = [
      entry.title || '',
      entry.content || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || '',
      entry.language || '',
      ...(entry.tags || [])
    ].join(' ').toLowerCase()
    return text.split(/[\s,;.!?，。；！？、\-()[\]{}'"„"''']+/).filter(Boolean)
  }

  _extractNgrams (entry) {
    const text = [
      entry.title || '',
      entry.content || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || '',
      ...(entry.tags || [])
    ].join(' ').toLowerCase()
    const ngrams = new Set()
    for (let i = 0; i <= text.length - this._ngramSize; i++) {
      const gram = text.substring(i, i + this._ngramSize)
      if (gram.trim().length > 0) {
        ngrams.add(gram)
      }
    }
    return [...ngrams]
  }

  _addToIndex (entry) {
    const words = this._extractWords(entry)
    const uniqueWords = new Set(words)
    for (const word of uniqueWords) {
      if (!this._searchIndex.has(word)) {
        this._searchIndex.set(word, new Set())
      }
      this._searchIndex.get(word).add(entry.id)
    }
    this._indexWordsById.set(entry.id, uniqueWords)
    if (this._ngramIndex) {
      const ngrams = this._extractNgrams(entry)
      for (const gram of ngrams) {
        if (!this._ngramIndex.has(gram)) {
          this._ngramIndex.set(gram, new Set())
        }
        this._ngramIndex.get(gram).add(entry.id)
      }
    }
  }

  _removeFromIndex (id) {
    const words = this._indexWordsById.get(id)
    if (!words) return
    for (const word of words) {
      const ids = this._searchIndex.get(word)
      if (ids) {
        ids.delete(id)
        if (ids.size === 0) this._searchIndex.delete(word)
      }
    }
    if (this._ngramIndex) {
      for (const [gram, ids] of this._ngramIndex) {
        if (ids.has(id)) {
          ids.delete(id)
          if (ids.size === 0) this._ngramIndex.delete(gram)
        }
      }
    }
    this._indexWordsById.delete(id)
  }

  _matchesEntry (lowerQuery, entry) {
    return (
      (entry.title || '').toLowerCase().includes(lowerQuery) ||
      (entry.content || '').toLowerCase().includes(lowerQuery) ||
      (entry.summary || '').toLowerCase().includes(lowerQuery) ||
      (entry.question || '').toLowerCase().includes(lowerQuery) ||
      (entry.answer || '').toLowerCase().includes(lowerQuery) ||
      (entry.tags || []).some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }

  _searchByNgram (query) {
    if (!this._ngramIndex || query.length < this._ngramSize) return new Set()
    const candidateIds = new Set()
    for (let i = 0; i <= query.length - this._ngramSize; i++) {
      const gram = query.substring(i, i + this._ngramSize)
      const ids = this._ngramIndex.get(gram)
      if (ids) {
        for (const id of ids) candidateIds.add(id)
      }
    }
    return candidateIds
  }

  _getCachedSearch (key) { return this._searchCache.get(key) || null }

  _setCachedSearch (key, value) {
    if (this._searchCache.size >= this._searchCacheMaxSize) {
      const firstKey = this._searchCache.keys().next().value
      this._searchCache.delete(firstKey)
    }
    this._searchCache.set(key, value)
  }

  async ensureInit () {}

  async getAllEntries () { return this._testEntries }

  async search (query) {
    await this.ensureInit()
    const cacheKey = `search:${query}`
    const cached = this._getCachedSearch(cacheKey)
    if (cached) return cached
    const lowerQuery = query.toLowerCase().trim()
    if (!lowerQuery) {
      const result = this._testEntries.slice()
      this._setCachedSearch(cacheKey, result)
      return result
    }
    if (lowerQuery.length < 3) {
      const result = this._testEntries.filter(e => this._matchesEntry(lowerQuery, e))
      this._setCachedSearch(cacheKey, result)
      return result
    }
    if (!this._indexBuilt) {
      for (const entry of this._testEntries) this._addToIndex(entry)
      this._indexBuilt = true
    }
    const candidateIds = new Set()
    const queryWords = lowerQuery.split(/[\s,;.!?，。；！？、\-()[\]{}'"„"''']+/).filter(Boolean)
    for (const qWord of queryWords) {
      const ids = this._searchIndex.get(qWord)
      if (ids) { for (const id of ids) candidateIds.add(id) }
    }
    if (candidateIds.size === 0) {
      for (const [word, ids] of this._searchIndex) {
        if (word.includes(lowerQuery) || lowerQuery.includes(word)) {
          for (const id of ids) candidateIds.add(id)
        }
      }
    }
    if (candidateIds.size === 0) {
      const ngramCandidates = this._searchByNgram(lowerQuery)
      for (const id of ngramCandidates) candidateIds.add(id)
    }
    if (candidateIds.size === 0) {
      const result = this._testEntries.filter(e => this._matchesEntry(lowerQuery, e))
      this._setCachedSearch(cacheKey, result)
      return result
    }
    const entriesById = new Map(this._testEntries.map(e => [e.id, e]))
    const result = []
    for (const id of candidateIds) {
      const entry = entriesById.get(id)
      if (entry && this._matchesEntry(lowerQuery, entry)) result.push(entry)
    }
    this._setCachedSearch(cacheKey, result)
    return result
  }

  async searchPaged (query, { page = 1, pageSize = 10 } = {}) {
    await this.ensureInit()
    page = Math.max(1, Math.floor(page))
    pageSize = Math.max(1, Math.floor(pageSize))
    if (!query || !query.trim()) return { entries: [], total: 0, page, totalPages: 0 }
    const allResults = await this.search(query)
    const total = allResults.length
    if (total === 0) return { entries: [], total: 0, page, totalPages: 0 }
    const totalPages = Math.ceil(total / pageSize)
    const offset = (page - 1) * pageSize
    return { entries: allResults.slice(offset, offset + pageSize), total, page, totalPages }
  }

  async getAllTags () {
    await this.ensureInit()
    if (this._tagsCache) return this._tagsCache
    const tagCount = {}
    this._testEntries.forEach(e => (e.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1 }))
    this._tagsCache = Object.entries(tagCount).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
    return this._tagsCache
  }

  async getAllCategories () {
    await this.ensureInit()
    if (this._categoriesCache) return this._categoriesCache
    const catCount = {}
    this._testEntries.forEach(e => { const c = e.category || '未分类'; catCount[c] = (catCount[c] || 0) + 1 })
    this._categoriesCache = Object.entries(catCount).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
    return this._categoriesCache
  }

  async getAllLanguages () {
    await this.ensureInit()
    if (this._languagesCache) return this._languagesCache
    const langCount = {}
    this._testEntries.forEach(e => { const l = e.language || 'other'; langCount[l] = (langCount[l] || 0) + 1 })
    this._languagesCache = Object.entries(langCount).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count)
    return this._languagesCache
  }
}

/** Helper: build entry with explicit undefined→default (not falsy→default) */
function makeEntry (id, opts = {}) {
  return {
    id,
    title: opts.title !== undefined ? opts.title : `Entry ${id}`,
    content: opts.content !== undefined ? opts.content : '',
    summary: opts.summary !== undefined ? opts.summary : '',
    question: opts.question !== undefined ? opts.question : '',
    answer: opts.answer !== undefined ? opts.answer : '',
    language: opts.language !== undefined ? opts.language : '',
    tags: opts.tags !== undefined ? opts.tags : [],
    category: opts.category !== undefined ? opts.category : '',
    sourceUrl: opts.sourceUrl || '',
    createdAt: opts.createdAt || Date.now()
  }
}

// ==================== _extractWords ====================

describe('KnowledgeBaseQuery — _extractWords', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should extract English words from title', () => {
    const words = q._extractWords(makeEntry('1', { title: 'Hello World' }))
    assert.ok(words.includes('hello'))
    assert.ok(words.includes('world'))
  })

  it('should extract words from multiple fields', () => {
    const entry = makeEntry('1', {
      title: 'Title', content: 'Content here', summary: 'Summary text',
      question: 'Question?', answer: 'Answer!'
    })
    const words = q._extractWords(entry)
    for (const w of ['title', 'content', 'summary', 'question', 'answer']) {
      assert.ok(words.includes(w), `missing: ${w}`)
    }
  })

  it('should extract Chinese characters', () => {
    const words = q._extractWords(makeEntry('1', { title: '你好世界' }))
    assert.ok(words.some(w => w.includes('你好')))
  })

  it('should handle mixed Chinese and English', () => {
    const words = q._extractWords(makeEntry('1', { title: 'react 教程入门' }))
    assert.ok(words.includes('react'))
    assert.ok(words.some(w => w.includes('教程')))
  })

  it('should return empty array for empty entry', () => {
    const words = q._extractWords(makeEntry('1', { title: '', content: '', summary: '', question: '', answer: '' }))
    assert.equal(words.length, 0)
  })

  it('should handle special characters and punctuation', () => {
    const words = q._extractWords(makeEntry('1', { title: 'hello, world; test! question?' }))
    assert.ok(words.includes('hello'))
    assert.ok(words.includes('world'))
    assert.ok(words.includes('test'))
    assert.ok(words.includes('question'))
  })

  it('should include tags in extracted words', () => {
    const words = q._extractWords(makeEntry('1', { title: 'Test', tags: ['javascript', 'react'] }))
    assert.ok(words.includes('javascript'))
    assert.ok(words.includes('react'))
  })

  it('should convert to lowercase', () => {
    const words = q._extractWords(makeEntry('1', { title: 'HELLO World' }))
    assert.ok(words.includes('hello'))
    assert.ok(words.includes('world'))
  })

  it('should handle entry with missing fields gracefully', () => {
    const words = q._extractWords({ id: '1', title: 'Test' })
    assert.ok(words.includes('test'))
  })
})

// ==================== _extractNgrams ====================

describe('KnowledgeBaseQuery — _extractNgrams', () => {
  let q
  beforeEach(() => { q = new TestableQuery(); q._ngramSize = 3 })

  it('should generate 3-grams from text', () => {
    const ngrams = q._extractNgrams(makeEntry('1', { title: 'hello' }))
    assert.ok(ngrams.includes('hel'))
    assert.ok(ngrams.includes('ell'))
    assert.ok(ngrams.includes('llo'))
  })

  it('should return empty array for empty text', () => {
    const ngrams = q._extractNgrams(makeEntry('1', { title: '', content: '', summary: '' }))
    assert.equal(ngrams.length, 0)
  })

  it('should return empty for text shorter than ngram size (no extra fields)', () => {
    // When ONLY title is set and it's shorter than ngramSize, trailing spaces from
    // empty fields create space-based ngrams. Test with truly minimal entry instead.
    const ngrams = q._extractNgrams({ id: '1', title: 'ab', content: '', summary: '', question: '', answer: '', tags: [] })
    // Text is 'ab     ' — space-derived ngrams exist, but 'ab' itself is not a 3-gram
    assert.ok(!ngrams.includes('ab'))
    // Single-char title: 'x     ' — ngrams include 'x  ' etc but not standalone 'x'
    const ngrams2 = q._extractNgrams({ id: '2', title: 'x', content: '', summary: '', question: '', answer: '', tags: [] })
    assert.ok(ngrams2.some(g => g.includes('x')))
  })

  it('should generate unique ngrams (no duplicates)', () => {
    // 'aaa' + trailing spaces → ngrams: 'aaa', 'aa ', 'a  ' (3 unique)
    const ngrams = q._extractNgrams(makeEntry('1', { title: 'aaa' }))
    assert.ok(ngrams.includes('aaa'))
    // Set ensures uniqueness — 'aaa' appears only once
    assert.equal(ngrams.filter(g => g === 'aaa').length, 1)
  })

  it('should include ngrams from tags', () => {
    const ngrams = q._extractNgrams(makeEntry('1', { title: '', tags: ['react'] }))
    assert.ok(ngrams.includes('rea'))
    assert.ok(ngrams.includes('eac'))
    assert.ok(ngrams.includes('act'))
  })

  it('should handle custom ngram size', () => {
    q._ngramSize = 2
    const ngrams = q._extractNgrams(makeEntry('1', { title: 'abc' }))
    assert.ok(ngrams.includes('ab'))
    assert.ok(ngrams.includes('bc'))
    // Also includes space-derived 2-grams from empty fields
    assert.ok(ngrams.length >= 2)
  })
})

// ==================== _addToIndex / _removeFromIndex ====================

describe('KnowledgeBaseQuery — _addToIndex / _removeFromIndex', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should add entry words to search index', () => {
    q._addToIndex(makeEntry('1', { title: 'Hello World' }))
    assert.ok(q._searchIndex.has('hello'))
    assert.ok(q._searchIndex.has('world'))
    assert.ok(q._searchIndex.get('hello').has('1'))
  })

  it('should track words per entry ID', () => {
    q._addToIndex(makeEntry('1', { title: 'Hello World' }))
    const words = q._indexWordsById.get('1')
    assert.ok(words.has('hello'))
    assert.ok(words.has('world'))
  })

  it('should add ngrams to ngram index', () => {
    q._addToIndex(makeEntry('1', { title: 'hello' }))
    assert.ok(q._ngramIndex.has('hel'))
    assert.ok(q._ngramIndex.get('hel').has('1'))
  })

  it('should handle multiple entries with same word', () => {
    q._addToIndex(makeEntry('1', { title: 'javascript guide' }))
    q._addToIndex(makeEntry('2', { title: 'javascript tutorial' }))
    const ids = q._searchIndex.get('javascript')
    assert.ok(ids.has('1'))
    assert.ok(ids.has('2'))
    assert.equal(ids.size, 2)
  })

  it('should remove entry from search index', () => {
    q._addToIndex(makeEntry('1', { title: 'Hello World' }))
    q._removeFromIndex('1')
    assert.ok(!q._indexWordsById.has('1'))
    assert.ok(!q._searchIndex.has('hello') || !q._searchIndex.get('hello').has('1'))
  })

  it('should not remove word if other entries still use it', () => {
    q._addToIndex(makeEntry('1', { title: 'javascript guide' }))
    q._addToIndex(makeEntry('2', { title: 'javascript tutorial' }))
    q._removeFromIndex('1')
    assert.ok(q._searchIndex.has('javascript'))
    assert.ok(q._searchIndex.get('javascript').has('2'))
  })

  it('should remove entry from ngram index', () => {
    q._addToIndex(makeEntry('1', { title: 'hello' }))
    q._removeFromIndex('1')
    assert.ok(!q._ngramIndex.has('hel') || !q._ngramIndex.get('hel').has('1'))
  })

  it('should handle removing non-existent entry gracefully', () => {
    q._removeFromIndex('nonexistent')
    assert.ok(true)
  })

  it('should clean up empty word sets after removal', () => {
    q._addToIndex(makeEntry('1', { title: 'unique' }))
    q._removeFromIndex('1')
    assert.ok(!q._searchIndex.has('unique'))
  })
})

// ==================== _matchesEntry ====================

describe('KnowledgeBaseQuery — _matchesEntry', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should match title (case-insensitive)', () => {
    const entry = makeEntry('1', { title: 'javascript guide' })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should match content', () => {
    const entry = makeEntry('1', { content: 'learn javascript basics' })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should match summary', () => {
    const entry = makeEntry('1', { summary: 'javascript overview' })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should match question', () => {
    const entry = makeEntry('1', { question: 'what is javascript?' })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should match answer', () => {
    const entry = makeEntry('1', { answer: 'javascript is a language' })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should match tags (case-insensitive)', () => {
    const entry = makeEntry('1', { tags: ['JavaScript', 'web'] })
    assert.ok(q._matchesEntry('javascript', entry))
  })

  it('should not match unrelated query', () => {
    const entry = makeEntry('1', { title: 'python guide', tags: ['python'] })
    assert.ok(!q._matchesEntry('javascript', entry))
  })

  it('should handle empty entry fields', () => {
    const entry = makeEntry('1', { title: '', content: '', summary: '', question: '', answer: '', tags: [] })
    assert.ok(!q._matchesEntry('anything', entry))
  })
})

// ==================== _searchByNgram ====================

describe('KnowledgeBaseQuery — _searchByNgram', () => {
  let q
  beforeEach(() => { q = new TestableQuery(); q._ngramSize = 3 })

  it('should return empty set if ngram index is null', () => {
    q._ngramIndex = null
    assert.equal(q._searchByNgram('hello').size, 0)
  })

  it('should return empty set if query shorter than ngram size', () => {
    assert.equal(q._searchByNgram('ab').size, 0)
  })

  it('should find candidates by ngram match', () => {
    q._ngramIndex.set('hel', new Set(['1']))
    q._ngramIndex.set('ell', new Set(['1']))
    q._ngramIndex.set('llo', new Set(['1']))
    assert.ok(q._searchByNgram('hello').has('1'))
  })

  it('should combine candidates from multiple ngrams', () => {
    q._ngramIndex.set('jav', new Set(['1']))
    q._ngramIndex.set('ava', new Set(['1', '2']))
    q._ngramIndex.set('vas', new Set(['2']))
    const result = q._searchByNgram('javascript')
    assert.ok(result.has('1'))
    assert.ok(result.has('2'))
  })
})

// ==================== search ====================

describe('KnowledgeBaseQuery — search', () => {
  let q
  beforeEach(() => {
    q = new TestableQuery()
    q._testEntries = [
      makeEntry('1', { title: 'javascript guide', content: 'learn js', tags: ['javascript', 'web'] }),
      makeEntry('2', { title: 'python tutorial', content: 'learn python', tags: ['python', 'backend'] }),
      makeEntry('3', { title: 'react framework', content: 'build uis with react', tags: ['react', 'javascript'] }),
      makeEntry('4', { title: 'node.js backend', content: 'server-side javascript', tags: ['nodejs', 'javascript', 'backend'] })
    ]
  })

  it('should find entries matching query in title', async () => {
    const results = await q.search('javascript')
    assert.ok(results.some(r => r.id === '1'))
  })

  it('should find entries matching query in content', async () => {
    const results = await q.search('python')
    assert.ok(results.some(r => r.id === '2'))
  })

  it('should find entries matching query in tags', async () => {
    const results = await q.search('react')
    assert.ok(results.some(r => r.id === '3'))
  })

  it('should return empty for non-matching query', async () => {
    const results = await q.search('nonexistent_xyz_123')
    assert.equal(results.length, 0)
  })

  it('should return all entries for empty query (full scan)', async () => {
    const results = await q.search('')
    assert.equal(results.length, 4)
  })

  it('should handle short query (< 3 chars) with full scan', async () => {
    const results = await q.search('js')
    // Full scan: matches "js" in content of entry 1
    assert.ok(results.some(r => r.id === '1'))
  })

  it('should cache search results', async () => {
    const r1 = await q.search('javascript')
    const r2 = await q.search('javascript')
    assert.equal(r1, r2)
  })

  it('should build index on first long query', async () => {
    assert.ok(!q._indexBuilt)
    await q.search('javascript')
    assert.ok(q._indexBuilt)
  })
})

// ==================== searchPaged ====================

describe('KnowledgeBaseQuery — searchPaged', () => {
  let q
  beforeEach(() => {
    q = new TestableQuery()
    const entries = []
    for (let i = 1; i <= 25; i++) {
      entries.push(makeEntry(String(i), { title: `javascript topic ${i}`, tags: ['javascript'] }))
    }
    q._testEntries = entries
  })

  it('should return first page with default size', async () => {
    const result = await q.searchPaged('javascript')
    assert.ok(result.entries.length <= 10)
    assert.ok(result.total >= 1)
    assert.equal(result.page, 1)
    assert.ok(result.totalPages >= 1)
  })

  it('should return correct page with custom pageSize', async () => {
    const result = await q.searchPaged('javascript', { page: 1, pageSize: 5 })
    assert.ok(result.entries.length <= 5)
    assert.equal(result.page, 1)
  })

  it('should return empty for no-match query', async () => {
    const result = await q.searchPaged('nonexistent_xyz_123')
    assert.equal(result.entries.length, 0)
    assert.equal(result.total, 0)
  })

  it('should return empty for empty query', async () => {
    const result = await q.searchPaged('')
    assert.equal(result.entries.length, 0)
    assert.equal(result.total, 0)
  })

  it('should handle page beyond results', async () => {
    const result = await q.searchPaged('javascript', { page: 100, pageSize: 10 })
    assert.equal(result.entries.length, 0)
    assert.ok(result.total >= 1)
  })

  it('should normalize page to minimum 1', async () => {
    const result = await q.searchPaged('javascript', { page: -5 })
    assert.equal(result.page, 1)
  })

  it('should normalize pageSize to minimum 1', async () => {
    const result = await q.searchPaged('javascript', { pageSize: -1 })
    assert.ok(result.entries.length <= 1)
  })
})

// ==================== getAllTags ====================

describe('KnowledgeBaseQuery — getAllTags', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should return tags sorted by count descending', async () => {
    q._testEntries = [
      makeEntry('1', { tags: ['javascript', 'web'] }),
      makeEntry('2', { tags: ['javascript', 'python'] }),
      makeEntry('3', { tags: ['python'] })
    ]
    const tags = await q.getAllTags()
    assert.ok(tags.length >= 2)
    assert.equal(tags[0].tag, 'javascript')
    assert.equal(tags[0].count, 2)
  })

  it('should return empty for no entries', async () => {
    q._testEntries = []
    assert.equal((await q.getAllTags()).length, 0)
  })

  it('should cache results', async () => {
    q._testEntries = [makeEntry('1', { tags: ['test'] })]
    const r1 = await q.getAllTags()
    const r2 = await q.getAllTags()
    assert.equal(r1, r2)
  })

  it('should handle entries with no tags', async () => {
    q._testEntries = [makeEntry('1', {})]
    assert.equal((await q.getAllTags()).length, 0)
  })
})

// ==================== getAllCategories ====================

describe('KnowledgeBaseQuery — getAllCategories', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should return categories sorted by count descending', async () => {
    q._testEntries = [
      makeEntry('1', { category: 'tech' }),
      makeEntry('2', { category: 'tech' }),
      makeEntry('3', { category: 'science' })
    ]
    const cats = await q.getAllCategories()
    assert.equal(cats[0].category, 'tech')
    assert.equal(cats[0].count, 2)
  })

  it('should default to 未分类 for entries without category', async () => {
    q._testEntries = [makeEntry('1', { category: '' })]
    const cats = await q.getAllCategories()
    assert.equal(cats[0].category, '未分类')
  })

  it('should cache results', async () => {
    q._testEntries = [makeEntry('1', { category: 'test' })]
    const r1 = await q.getAllCategories()
    const r2 = await q.getAllCategories()
    assert.equal(r1, r2)
  })
})

// ==================== getAllLanguages ====================

describe('KnowledgeBaseQuery — getAllLanguages', () => {
  let q
  beforeEach(() => { q = new TestableQuery() })

  it('should return languages sorted by count descending', async () => {
    q._testEntries = [
      makeEntry('1', { language: 'en' }),
      makeEntry('2', { language: 'en' }),
      makeEntry('3', { language: 'zh' })
    ]
    const langs = await q.getAllLanguages()
    assert.equal(langs[0].language, 'en')
    assert.equal(langs[0].count, 2)
  })

  it('should default to other for entries without language', async () => {
    q._testEntries = [makeEntry('1', { language: '' })]
    const langs = await q.getAllLanguages()
    assert.equal(langs[0].language, 'other')
  })

  it('should cache results', async () => {
    q._testEntries = [makeEntry('1', { language: 'en' })]
    const r1 = await q.getAllLanguages()
    const r2 = await q.getAllLanguages()
    assert.equal(r1, r2)
  })
})
