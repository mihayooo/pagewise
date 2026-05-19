import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

// The global IIFE registers SelectionDetector on globalThis.
// It needs a minimal DOM-like environment but doesn't actually use DOM.
// Just load the module which will execute the IIFE.

before(async () => {
  // Ensure we can load the IIFE - it only uses globalThis
  await import('../lib/selection-detector-global.js')
})

describe('SelectionDetector (global)', () => {
  it('should be registered on globalThis', () => {
    assert.ok(typeof globalThis.SelectionDetector === 'function')
  })

  const detector = new globalThis.SelectionDetector()

  describe('detectType', () => {
    it('should return unknown for null/empty', () => {
      assert.deepEqual(detector.detectType(null), { type: 'unknown', confidence: 0 })
      assert.deepEqual(detector.detectType(''), { type: 'unknown', confidence: 0 })
      assert.deepEqual(detector.detectType('   '), { type: 'unknown', confidence: 0 })
    })

    it('should detect URLs', () => {
      const result = detector.detectType('https://example.com/path?q=1')
      assert.equal(result.type, 'url')
      assert.ok(result.confidence > 0.8)
    })

    it('should detect URLs starting with www', () => {
      const result = detector.detectType('www.example.com/path')
      assert.equal(result.type, 'url')
    })

    it('should detect errors', () => {
      const result = detector.detectType('TypeError: Cannot read property "x" of undefined')
      assert.equal(result.type, 'error')
      assert.ok(result.confidence > 0)
    })

    it('should detect Python traceback', () => {
      const text = 'Traceback (most recent call last):\n  File "main.py", line 10'
      const result = detector.detectType(text)
      assert.equal(result.type, 'error')
    })

    it('should detect code - JavaScript', () => {
      const text = 'const foo = (x) => {\n  return x + 1\n}'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'javascript')
    })

    it('should detect code - Python', () => {
      const text = 'def hello():\n    print("world")'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'python')
    })

    it('should detect code - Java', () => {
      const text = 'public static void main(String[] args) {\n  System.out.println("hello")\n}'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'java')
    })

    it('should detect code - SQL', () => {
      const text = 'SELECT * FROM users WHERE id = 1'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'sql')
    })

    it('should detect code - HTML', () => {
      const text = '<div class="test"><span>hello</span></div>'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'html')
    })

    it('should detect math expressions', () => {
      const result = detector.detectType('2 + 3 * 4')
      assert.equal(result.type, 'math')
    })

    it('should detect math functions', () => {
      const result = detector.detectType('sin(3.14) + cos(1.57)')
      assert.equal(result.type, 'math')
    })

    it('should detect English text', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a long enough English sentence for detection.'
      const result = detector.detectType(text)
      assert.equal(result.type, 'english')
    })

    it('should return unknown for short ambiguous text', () => {
      const result = detector.detectType('hi')
      assert.equal(result.type, 'unknown')
    })
  })

  describe('detectBatch', () => {
    it('should detect types for multiple texts', () => {
      const results = detector.detectBatch([
        'https://example.com',
        'const x = 1',
        'some unknown text',
      ])
      assert.equal(results.length, 3)
      assert.equal(results[0].type, 'url')
      assert.equal(results[1].type, 'code')
    })
  })

  describe('getSupportedTypes', () => {
    it('should return list of supported types', () => {
      const types = detector.getSupportedTypes()
      assert.ok(types.includes('code'))
      assert.ok(types.includes('url'))
      assert.ok(types.includes('error'))
      assert.ok(types.includes('math'))
      assert.ok(types.includes('english'))
      assert.ok(types.includes('unknown'))
    })
  })
})
