import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  recordSearch,
  getSearchHistory,
  getPopularSearches,
  getSuggestions,
  clearHistory,
} from '../lib/bookmark-search-history.js'

describe('BookmarkSearchHistory', () => {
  beforeEach(() => {
    clearHistory()
  })

  describe('recordSearch', () => {
    it('should record a search query', () => {
      const entry = recordSearch('react hooks')
      assert.ok(entry)
      assert.equal(entry.query, 'react hooks')
      assert.equal(entry.count, 1)
      assert.ok(entry.id.startsWith('sh_'))
      assert.ok(typeof entry.timestamp === 'number')
    })

    it('should normalize query (trim, lowercase, collapse spaces)', () => {
      const entry = recordSearch('  React   Hooks  ')
      assert.equal(entry.query, 'react hooks')
    })

    it('should increment count for duplicate queries', () => {
      recordSearch('react')
      const entry = recordSearch('react')
      assert.equal(entry.count, 2)
    })

    it('should return null for empty/invalid input', () => {
      assert.equal(recordSearch(''), null)
      assert.equal(recordSearch('   '), null)
      assert.equal(recordSearch(null), null)
      assert.equal(recordSearch(undefined), null)
      assert.equal(recordSearch(123), null)
    })

    it('should move duplicate to front of history', () => {
      recordSearch('first')
      recordSearch('second')
      recordSearch('first') // bump to front
      const history = getSearchHistory()
      assert.equal(history[0].query, 'first')
    })
  })

  describe('getSearchHistory', () => {
    it('should return empty history initially', () => {
      assert.deepEqual(getSearchHistory(), [])
    })

    it('should return searches in reverse chronological order', () => {
      recordSearch('first')
      recordSearch('second')
      recordSearch('third')
      const history = getSearchHistory()
      assert.equal(history.length, 3)
      assert.equal(history[0].query, 'third')
      assert.equal(history[1].query, 'second')
      assert.equal(history[2].query, 'first')
    })

    it('should respect limit', () => {
      recordSearch('a')
      recordSearch('b')
      recordSearch('c')
      const history = getSearchHistory(2)
      assert.equal(history.length, 2)
    })

    it('should default limit to 20', () => {
      for (let i = 0; i < 25; i++) recordSearch(`q${i}`)
      const history = getSearchHistory()
      assert.equal(history.length, 20)
    })

    it('should handle limit of 0', () => {
      recordSearch('test')
      assert.deepEqual(getSearchHistory(0), [])
    })
  })

  describe('getPopularSearches', () => {
    it('should return searches sorted by count', () => {
      recordSearch('once')
      recordSearch('twice')
      recordSearch('twice')
      recordSearch('thrice')
      recordSearch('thrice')
      recordSearch('thrice')
      const popular = getPopularSearches()
      assert.equal(popular[0].query, 'thrice')
      assert.equal(popular[1].query, 'twice')
      assert.equal(popular[2].query, 'once')
    })

    it('should respect limit', () => {
      recordSearch('a')
      recordSearch('b')
      const popular = getPopularSearches(1)
      assert.equal(popular.length, 1)
    })

    it('should default limit to 10', () => {
      for (let i = 0; i < 15; i++) recordSearch(`q${i}`)
      const popular = getPopularSearches()
      assert.equal(popular.length, 10)
    })
  })

  describe('getSuggestions', () => {
    it('should return prefix-matching suggestions', () => {
      recordSearch('react hooks')
      recordSearch('react router')
      recordSearch('vue guide')
      const suggestions = getSuggestions('react')
      assert.equal(suggestions.length, 2)
      assert.ok(suggestions.includes('react hooks'))
      assert.ok(suggestions.includes('react router'))
    })

    it('should sort by count descending', () => {
      recordSearch('test a')
      recordSearch('test b')
      recordSearch('test b')
      const suggestions = getSuggestions('test')
      assert.equal(suggestions[0], 'test b')
    })

    it('should return empty for non-matching prefix', () => {
      recordSearch('react')
      assert.deepEqual(getSuggestions('vue'), [])
    })

    it('should return empty for empty/invalid input', () => {
      assert.deepEqual(getSuggestions(''), [])
      assert.deepEqual(getSuggestions(null), [])
      assert.deepEqual(getSuggestions(undefined), [])
    })

    it('should normalize partial input', () => {
      recordSearch('react hooks')
      const suggestions = getSuggestions('  REACT  ')
      assert.equal(suggestions.length, 1)
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', () => {
      recordSearch('a')
      recordSearch('b')
      clearHistory()
      assert.deepEqual(getSearchHistory(), [])
      assert.deepEqual(getPopularSearches(), [])
      assert.deepEqual(getSuggestions('a'), [])
    })

    it('should be safe to call multiple times', () => {
      clearHistory()
      clearHistory()
      assert.deepEqual(getSearchHistory(), [])
    })
  })
})
