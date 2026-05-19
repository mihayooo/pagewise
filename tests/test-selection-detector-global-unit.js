import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

// The global IIFE registers SelectionDetector on globalThis.
// It needs a minimal DOM-like environment but doesn't actually use DOM.
// Just load the module which will execute the IIFE.

let SelectionDetector

before(async () => {
  // Ensure we can load the IIFE - it only uses globalThis
  await import('../lib/selection-detector-global.js')
  SelectionDetector = globalThis.SelectionDetector
})

describe('SelectionDetector (global)', () => {
  it('should be registered on globalThis', () => {
    assert.ok(typeof SelectionDetector === 'function')
  })

  describe('detectType', () => {
    it('should return unknown for null/empty', () => {
      const detector = new SelectionDetector()
      assert.deepEqual(detector.detectType(null), { type: 'unknown', confidence: 0 })
      assert.deepEqual(detector.detectType(''), { type: 'unknown', confidence: 0 })
      assert.deepEqual(detector.detectType('   '), { type: 'unknown', confidence: 0 })
    })

    it('should detect URLs', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('https://example.com/path?q=1')
      assert.equal(result.type, 'url')
      assert.ok(result.confidence > 0.8)
    })

    it('should detect URLs starting with www', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('www.example.com/path')
      assert.equal(result.type, 'url')
    })

    it('should detect errors', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('TypeError: Cannot read property "x" of undefined')
      assert.equal(result.type, 'error')
      assert.ok(result.confidence > 0)
    })

    it('should detect Python traceback', () => {
      const detector = new SelectionDetector()
      const text = 'Traceback (most recent call last):\n  File "main.py", line 10'
      const result = detector.detectType(text)
      assert.equal(result.type, 'error')
    })

    it('should detect code with arrow function', () => {
      const detector = new SelectionDetector()
      const text = 'const processItem = (x) => {\n  return x.value + 1\n}'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
    })

    it('should detect code with function declaration', () => {
      const detector = new SelectionDetector()
      const text = 'function calculateTotal(items) {\n  return items.reduce((sum, i) => sum + i.price, 0)\n}'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
    })

    it('should detect code with import/export', () => {
      const detector = new SelectionDetector()
      const text = 'import { useState, useEffect } from "react"\nexport default function App() {}'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
    })

    it('should detect SQL', () => {
      const detector = new SelectionDetector()
      const text = 'SELECT u.name, u.email FROM users u WHERE u.id = 1'
      const result = detector.detectType(text)
      assert.equal(result.type, 'code')
      assert.equal(result.language, 'sql')
    })

    it('should detect math expressions', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('2 + 3 * 4')
      assert.equal(result.type, 'math')
    })

    it('should detect math functions', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('sin(3.14) + cos(1.57)')
      assert.equal(result.type, 'math')
    })

    it('should detect English text', () => {
      const detector = new SelectionDetector()
      const text = 'The quick brown fox jumps over the lazy dog. This is a long enough English sentence for detection.'
      const result = detector.detectType(text)
      assert.equal(result.type, 'english')
    })

    it('should return unknown for short ambiguous text', () => {
      const detector = new SelectionDetector()
      const result = detector.detectType('hi')
      assert.equal(result.type, 'unknown')
    })
  })

  describe('detectBatch', () => {
    it('should detect types for multiple texts', () => {
      const detector = new SelectionDetector()
      const results = detector.detectBatch([
        'https://example.com',
        'TypeError: cannot read property',
        'some unknown text',
      ])
      assert.equal(results.length, 3)
      assert.equal(results[0].type, 'url')
      assert.equal(results[1].type, 'error')
    })
  })

  describe('getSupportedTypes', () => {
    it('should return list of supported types', () => {
      const detector = new SelectionDetector()
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
