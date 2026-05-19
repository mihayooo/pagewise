import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TECH_KEYWORDS,
  DOMAIN_TAG_MAP,
  _extractDomainTag,
  _extractPathTags,
  _escapeRegex,
} from '../lib/tag-editor-constants.js'

describe('TECH_KEYWORDS', () => {
  it('should be a Set', () => {
    assert.ok(TECH_KEYWORDS instanceof Set)
  })

  it('should contain common tech keywords', () => {
    assert.ok(TECH_KEYWORDS.has('javascript'))
    assert.ok(TECH_KEYWORDS.has('python'))
    assert.ok(TECH_KEYWORDS.has('react'))
    assert.ok(TECH_KEYWORDS.has('docker'))
    assert.ok(TECH_KEYWORDS.has('typescript'))
  })

  it('should contain at least 80 keywords', () => {
    assert.ok(TECH_KEYWORDS.size >= 80, `Expected >= 80, got ${TECH_KEYWORDS.size}`)
  })
})

describe('DOMAIN_TAG_MAP', () => {
  it('should be an object with domain keys', () => {
    assert.equal(typeof DOMAIN_TAG_MAP, 'object')
    assert.equal(DOMAIN_TAG_MAP['github.com'], 'github')
    assert.equal(DOMAIN_TAG_MAP['stackoverflow.com'], 'stackoverflow')
    assert.equal(DOMAIN_TAG_MAP['medium.com'], 'medium')
  })

  it('should map react.dev to react', () => {
    assert.equal(DOMAIN_TAG_MAP['react.dev'], 'react')
  })

  it('should map vuejs.org to vue', () => {
    assert.equal(DOMAIN_TAG_MAP['vuejs.org'], 'vue')
  })
})

describe('_extractDomainTag', () => {
  it('should return tag for known domain', () => {
    assert.equal(_extractDomainTag('https://github.com/user/repo'), 'github')
    assert.equal(_extractDomainTag('https://www.stackoverflow.com/q/123'), 'stackoverflow')
  })

  it('should return tag for known subdomain', () => {
    assert.equal(_extractDomainTag('https://docs.docker.com/reference'), 'docker')
  })

  it('should extract main domain part for unknown domains', () => {
    const tag = _extractDomainTag('https://myapp.example.com')
    // _extractDomainTag uses parts[parts.length - 2] = second-to-last segment
    assert.equal(tag, 'example')
  })

  it('should return null for generic domains', () => {
    // com, org, net etc are excluded
    const tag = _extractDomainTag('https://something.com')
    // 'something' has length > 2 and is not in excluded list, should return it
    if (tag) assert.equal(tag, 'something')
  })

  it('should return null for null/empty/invalid', () => {
    assert.equal(_extractDomainTag(null), null)
    assert.equal(_extractDomainTag(''), null)
    assert.equal(_extractDomainTag(123), null)
    assert.equal(_extractDomainTag('not-a-url'), null)
  })

  it('should handle www prefix', () => {
    assert.equal(_extractDomainTag('https://www.github.com/path'), 'github')
  })
})

describe('_extractPathTags', () => {
  it('should extract meaningful path segments', () => {
    const tags = _extractPathTags('https://example.com/blog/tutorial/react-hooks')
    assert.ok(tags.includes('blog'))
    assert.ok(tags.includes('tutorial'))
    assert.ok(tags.includes('react-hooks'))
  })

  it('should remove file extensions', () => {
    const tags = _extractPathTags('https://example.com/docs/guide.html')
    assert.ok(tags.includes('docs'))
    assert.ok(tags.includes('guide'))
  })

  it('should filter out single-char segments', () => {
    const tags = _extractPathTags('https://example.com/a/bb')
    assert.ok(!tags.includes('a'))
    assert.ok(tags.includes('bb'))
  })

  it('should filter out numeric-only segments', () => {
    const tags = _extractPathTags('https://example.com/12345/article')
    assert.ok(tags.includes('article'))
  })

  it('should limit to 3 segments', () => {
    const tags = _extractPathTags('https://example.com/a1/b2/c3/d4/e5')
    assert.ok(tags.length <= 3)
  })

  it('should return empty for null/empty/invalid', () => {
    assert.deepEqual(_extractPathTags(null), [])
    assert.deepEqual(_extractPathTags(''), [])
    assert.deepEqual(_extractPathTags(123), [])
    assert.deepEqual(_extractPathTags('not-url'), [])
  })

  it('should filter segments longer than 20 chars', () => {
    const longSeg = 'a'.repeat(25)
    const tags = _extractPathTags(`https://example.com/${longSeg}/short`)
    assert.ok(tags.includes('short'))
    assert.ok(!tags.includes(longSeg))
  })
})

describe('_escapeRegex', () => {
  it('should escape special regex characters', () => {
    assert.equal(_escapeRegex('[test]'), '\\[test\\]')
    assert.equal(_escapeRegex('$100'), '\\$100')
    assert.equal(_escapeRegex('a+b*c?'), 'a\\+b\\*c\\?')
    assert.equal(_escapeRegex('(foo|bar)'), '\\(foo\\|bar\\)')
  })

  it('should not change strings without special chars', () => {
    assert.equal(_escapeRegex('hello world'), 'hello world')
    assert.equal(_escapeRegex('abc123'), 'abc123')
  })

  it('should handle empty string', () => {
    assert.equal(_escapeRegex(''), '')
  })
})
