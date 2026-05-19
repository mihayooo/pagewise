import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  URL_MATCH_WEIGHT,
  TITLE_SIMILARITY_WEIGHT,
  TAG_OVERLAP_WEIGHT,
  CORRELATION_THRESHOLD,
  SUGGESTION_THRESHOLD,
  normalizeUrl,
  normalizeTag,
  computeUrlMatch,
  computeTitleSimilarity,
  computeTagOverlap,
  computeCorrelation,
} from '../lib/bookmark-knowledge-link-scorer.js'

describe('BookmarkKnowledgeLinkScorer constants', () => {
  it('weights should sum to 1', () => {
    const total = URL_MATCH_WEIGHT + TITLE_SIMILARITY_WEIGHT + TAG_OVERLAP_WEIGHT
    assert.ok(Math.abs(total - 1.0) < 0.001)
  })

  it('CORRELATION_THRESHOLD should be less than SUGGESTION_THRESHOLD', () => {
    assert.ok(CORRELATION_THRESHOLD < SUGGESTION_THRESHOLD)
  })
})

describe('normalizeUrl', () => {
  it('should remove protocol and www', () => {
    assert.equal(normalizeUrl('https://www.example.com/path'), 'example.com/path')
  })

  it('should remove trailing slashes', () => {
    assert.equal(normalizeUrl('https://example.com/path/'), 'example.com/path')
  })

  it('should lowercase', () => {
    assert.equal(normalizeUrl('https://EXAMPLE.COM/Path'), 'example.com/path')
  })

  it('should handle empty/null', () => {
    assert.equal(normalizeUrl(''), '')
    assert.equal(normalizeUrl(null), '')
    assert.equal(normalizeUrl(undefined), '')
    assert.equal(normalizeUrl(123), '')
  })

  it('should handle invalid URL gracefully', () => {
    const result = normalizeUrl('not a url')
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
  })
})

describe('normalizeTag', () => {
  it('should lowercase and trim', () => {
    assert.equal(normalizeTag('  React  '), 'react')
  })

  it('should handle empty/null', () => {
    assert.equal(normalizeTag(''), '')
    assert.equal(normalizeTag(null), '')
    assert.equal(normalizeTag(undefined), '')
    assert.equal(normalizeTag(123), '')
  })
})

describe('computeUrlMatch', () => {
  it('should return 1 for exact match', () => {
    const result = computeUrlMatch(
      { url: 'https://example.com/page' },
      { sourceUrl: 'https://example.com/page' }
    )
    assert.equal(result, 1)
  })

  it('should return 0.7 for prefix match', () => {
    const result = computeUrlMatch(
      { url: 'https://example.com/page' },
      { sourceUrl: 'https://example.com' }
    )
    assert.equal(result, 0.7)
  })

  it('should return 0.3 for same domain', () => {
    const result = computeUrlMatch(
      { url: 'https://example.com/page1' },
      { sourceUrl: 'https://example.com/page2' }
    )
    assert.equal(result, 0.3)
  })

  it('should return 0 for different domains', () => {
    const result = computeUrlMatch(
      { url: 'https://a.com/page' },
      { sourceUrl: 'https://b.com/page' }
    )
    assert.equal(result, 0)
  })

  it('should return 0 for empty URLs', () => {
    assert.equal(computeUrlMatch({ url: '' }, { sourceUrl: 'https://a.com' }), 0)
    assert.equal(computeUrlMatch({ url: 'https://a.com' }, { sourceUrl: '' }), 0)
  })
})

describe('computeTitleSimilarity', () => {
  it('should return 0 for empty texts', () => {
    const engine = { generateVector: () => new Map(), cosineSimilarity: () => 0 }
    assert.equal(computeTitleSimilarity({ title: '' }, { title: '' }, engine), 0)
  })

  it('should compute similarity via embedding engine', () => {
    const engine = {
      generateVector: (text) => {
        const m = new Map()
        for (const w of text.split(/\s+/)) m.set(w.toLowerCase(), 1)
        return m
      },
      cosineSimilarity: () => 0.8,
    }
    const result = computeTitleSimilarity(
      { title: 'React Tutorial' },
      { title: 'React Guide' },
      engine
    )
    assert.equal(result, 0.8)
  })

  it('should return 0 on engine error', () => {
    const engine = {
      generateVector: () => { throw new Error('fail') },
      cosineSimilarity: () => 0,
    }
    assert.equal(computeTitleSimilarity({ title: 'A' }, { title: 'B' }, engine), 0)
  })

  it('should return 0 for empty vectors', () => {
    const engine = {
      generateVector: () => new Map(),
      cosineSimilarity: () => 0,
    }
    assert.equal(computeTitleSimilarity({ title: 'A B' }, { title: 'C D' }, engine), 0)
  })
})

describe('computeTagOverlap', () => {
  it('should return Jaccard coefficient', () => {
    const result = computeTagOverlap(
      { tags: ['react', 'javascript'] },
      { tags: ['react', 'python'] }
    )
    // intersection=1, union=3, Jaccard=1/3
    assert.ok(Math.abs(result - 1 / 3) < 0.01)
  })

  it('should return 1 for identical tags', () => {
    const result = computeTagOverlap(
      { tags: ['a', 'b'] },
      { tags: ['a', 'b'] }
    )
    assert.equal(result, 1)
  })

  it('should return 0 for disjoint tags', () => {
    const result = computeTagOverlap(
      { tags: ['a'] },
      { tags: ['b'] }
    )
    assert.equal(result, 0)
  })

  it('should return 0 when either has no tags', () => {
    assert.equal(computeTagOverlap({ tags: [] }, { tags: ['a'] }), 0)
    assert.equal(computeTagOverlap({ tags: ['a'] }, { tags: [] }), 0)
  })

  it('should normalize tags case-insensitively', () => {
    const result = computeTagOverlap(
      { tags: ['React'] },
      { tags: ['react'] }
    )
    assert.equal(result, 1)
  })
})

describe('computeCorrelation', () => {
  it('should compute weighted total', () => {
    const engine = {
      generateVector: (text) => {
        const m = new Map()
        for (const w of text.split(/\s+/)) m.set(w.toLowerCase(), 1)
        return m
      },
      cosineSimilarity: () => 1.0,
    }
    const result = computeCorrelation(
      { url: 'https://example.com/p', title: 'Test', tags: ['a'] },
      { sourceUrl: 'https://example.com/p', title: 'Test', tags: ['a'] },
      engine
    )
    assert.equal(result.urlMatch, 1)
    assert.equal(result.titleSimilarity, 1)
    assert.equal(result.tagOverlap, 1)
    assert.equal(result.total, 1)
  })

  it('should return zero-correlated result for mismatched', () => {
    const engine = { generateVector: () => new Map(), cosineSimilarity: () => 0 }
    const result = computeCorrelation(
      { url: 'https://a.com', title: '', tags: [] },
      { sourceUrl: 'https://b.com', title: '', tags: [] },
      engine
    )
    assert.equal(result.total, 0)
  })
})
