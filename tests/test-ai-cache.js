/**
 * Tests for lib/ai-cache.js — AI Response Cache (LRU)
 *
 * Covers: fnv1aHash, hash32, extractTextContent, hasImageContent,
 *         generateCacheKey, AICache class (get/set/delete/has/clear/size/evictExpired/stats)
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateCacheKey, AICache } from '../lib/ai-cache.js'

describe('AI Cache', () => {
  describe('generateCacheKey', () => {
    it('returns a 32-char hex string for text messages', () => {
      const key = generateCacheKey({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'You are helpful',
        model: 'gpt-4o',
        maxTokens: 4096,
        protocol: 'openai'
      })
      assert.ok(key, 'should return a key')
      assert.equal(key.length, 32, 'key should be 32 chars')
      assert.match(key, /^[0-9a-f]{32}$/, 'key should be hex')
    })

    it('returns null for messages with image content', () => {
      const key = generateCacheKey({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', url: 'data:image/png;base64,abc' }
          ]
        }],
        systemPrompt: '',
        model: 'gpt-4o'
      })
      assert.equal(key, null, 'image messages should not be cached')
    })

    it('returns null for image type content', () => {
      const key = generateCacheKey({
        messages: [{
          role: 'user',
          content: [{ type: 'image', source: { data: 'abc' } }]
        }],
        systemPrompt: '',
        model: 'claude-3'
      })
      assert.equal(key, null)
    })

    it('produces different keys for different inputs', () => {
      const key1 = generateCacheKey({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o'
      })
      const key2 = generateCacheKey({
        messages: [{ role: 'user', content: 'Goodbye' }],
        model: 'gpt-4o'
      })
      assert.notEqual(key1, key2, 'different content should produce different keys')
    })

    it('produces different keys for different models', () => {
      const key1 = generateCacheKey({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o'
      })
      const key2 = generateCacheKey({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-3'
      })
      assert.notEqual(key1, key2)
    })

    it('handles empty messages array', () => {
      const key = generateCacheKey({ messages: [], model: 'gpt-4o' })
      assert.ok(key)
      assert.equal(key.length, 32)
    })

    it('handles undefined options gracefully', () => {
      const key = generateCacheKey({})
      assert.ok(key)
      assert.equal(key.length, 32)
    })

    it('handles array content with text parts', () => {
      const key = generateCacheKey({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' }
          ]
        }],
        model: 'gpt-4o'
      })
      assert.ok(key)
      assert.equal(key.length, 32)
    })
  })

  describe('AICache', () => {
    let cache

    beforeEach(() => {
      cache = new AICache({ maxSize: 3, ttlMs: 1000 })
    })

    it('constructs with default options', () => {
      const c = new AICache()
      assert.equal(c.maxSize, 50)
      assert.equal(c.ttlMs, 30 * 60 * 1000)
    })

    it('constructs with custom options', () => {
      assert.equal(cache.maxSize, 3)
      assert.equal(cache.ttlMs, 1000)
    })

    describe('set and get', () => {
      it('stores and retrieves a value', () => {
        cache.set('k1', { content: 'hello' })
        const result = cache.get('k1')
        assert.ok(result)
        assert.equal(result.content, 'hello')
        assert.ok(result.cachedAt)
      })

      it('returns null for missing key', () => {
        assert.equal(cache.get('missing'), null)
      })

      it('returns null for expired entry', async () => {
        const shortCache = new AICache({ ttlMs: 50 })
        shortCache.set('k1', { content: 'hello' })
        await new Promise(r => setTimeout(r, 80))
        assert.equal(shortCache.get('k1'), null)
      })

      it('updates existing key (no duplicate)', () => {
        cache.set('k1', { content: 'first' })
        cache.set('k1', { content: 'second' })
        assert.equal(cache.size(), 1)
        assert.equal(cache.get('k1').content, 'second')
      })

      it('LRU eviction removes oldest entry', () => {
        cache.set('k1', { content: 'a' })
        cache.set('k2', { content: 'b' })
        cache.set('k3', { content: 'c' })
        cache.set('k4', { content: 'd' }) // should evict k1
        assert.equal(cache.size(), 3)
        assert.equal(cache.get('k1'), null)
        assert.ok(cache.get('k2'))
      })

      it('LRU refresh on get moves entry to end', () => {
        cache.set('k1', { content: 'a' })
        cache.set('k2', { content: 'b' })
        cache.set('k3', { content: 'c' })
        cache.get('k1') // refresh k1
        cache.set('k4', { content: 'd' }) // should evict k2 (oldest after refresh)
        assert.ok(cache.get('k1'))
        assert.equal(cache.get('k2'), null)
      })

      it('maxSize=0 does not cache', () => {
        const noCache = new AICache({ maxSize: 0 })
        noCache.set('k1', { content: 'hello' })
        assert.equal(noCache.get('k1'), null)
        assert.equal(noCache.stats().evictions, 1)
      })
    })

    describe('delete', () => {
      it('deletes an existing key', () => {
        cache.set('k1', { content: 'hello' })
        assert.equal(cache.delete('k1'), true)
        assert.equal(cache.get('k1'), null)
      })

      it('returns false for non-existent key', () => {
        assert.equal(cache.delete('missing'), false)
      })
    })

    describe('has', () => {
      it('returns true for existing non-expired key', () => {
        cache.set('k1', { content: 'hello' })
        assert.equal(cache.has('k1'), true)
      })

      it('returns false for missing key', () => {
        assert.equal(cache.has('missing'), false)
      })

      it('returns false and cleans up expired key', async () => {
        const shortCache = new AICache({ ttlMs: 50 })
        shortCache.set('k1', { content: 'hello' })
        await new Promise(r => setTimeout(r, 80))
        assert.equal(shortCache.has('k1'), false)
        assert.equal(shortCache.size(), 0, 'expired entry should be cleaned up')
      })
    })

    describe('clear', () => {
      it('removes all entries', () => {
        cache.set('k1', { content: 'a' })
        cache.set('k2', { content: 'b' })
        cache.clear()
        assert.equal(cache.size(), 0)
      })
    })

    describe('size', () => {
      it('returns current entry count', () => {
        assert.equal(cache.size(), 0)
        cache.set('k1', { content: 'a' })
        assert.equal(cache.size(), 1)
        cache.set('k2', { content: 'b' })
        assert.equal(cache.size(), 2)
      })
    })

    describe('evictExpired', () => {
      it('removes expired entries and returns count', async () => {
        const shortCache = new AICache({ ttlMs: 50 })
        shortCache.set('k1', { content: 'a' })
        shortCache.set('k2', { content: 'b' })
        await new Promise(r => setTimeout(r, 80))
        const evicted = shortCache.evictExpired()
        assert.equal(evicted, 2)
        assert.equal(shortCache.size(), 0)
      })

      it('returns 0 when nothing expired', () => {
        cache.set('k1', { content: 'a' })
        assert.equal(cache.evictExpired(), 0)
      })
    })

    describe('stats', () => {
      it('tracks hits, misses, evictions, size', () => {
        cache.set('k1', { content: 'a' })
        cache.get('k1') // hit
        cache.get('missing') // miss
        cache.set('k2', { content: 'b' })
        cache.set('k3', { content: 'c' })
        cache.set('k4', { content: 'd' }) // evicts k1

        const s = cache.stats()
        assert.equal(s.hits, 1)
        assert.equal(s.misses, 1)
        assert.ok(s.evictions >= 1)
        assert.equal(s.size, 3)
      })
    })
  })
})
