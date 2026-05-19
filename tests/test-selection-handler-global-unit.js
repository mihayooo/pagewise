import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

// Mock chrome.runtime for the IIFE
globalThis.chrome = globalThis.chrome || {}
globalThis.chrome.runtime = globalThis.chrome.runtime || { sendMessage: () => {} }

before(async () => {
  await import('../lib/selection-handler-global.js')
})

describe('SelectionHandler (global)', () => {
  it('should be registered on globalThis', () => {
    assert.ok(typeof globalThis.SelectionHandler === 'function')
  })

  describe('handleSelection', () => {
    it('should return noop for empty text', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('', 'code')
      assert.equal(result.action, 'noop')
      assert.ok(result.payload.error)
    })

    it('should return noop for null text', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection(null, 'code')
      assert.equal(result.action, 'noop')
    })

    it('should delegate to explainCode for code type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('const x = 1', 'code')
      assert.equal(result.action, 'explainCode')
      assert.equal(result.type, 'code')
      assert.ok(result.payload.prompt.includes('代码'))
    })

    it('should delegate to previewURL for url type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('https://example.com', 'url')
      assert.equal(result.action, 'previewURL')
      assert.equal(result.payload.domain, 'example.com')
    })

    it('should delegate to searchError for error type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('TypeError: cannot read', 'error')
      assert.equal(result.action, 'searchError')
      assert.ok(result.payload.errorType)
    })

    it('should delegate to calculateMath for math type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('2 + 3', 'math')
      assert.equal(result.action, 'calculateMath')
      assert.equal(result.payload.result, 5)
    })

    it('should delegate to translateEnglish for english type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('Hello World', 'english')
      assert.equal(result.action, 'translateEnglish')
      assert.equal(result.payload.targetLang, 'zh-CN')
      assert.ok(result.payload.wordCount >= 2)
    })

    it('should handle unknown type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('something random', 'unknown')
      assert.equal(result.action, 'generalQuery')
    })

    it('should handle missing type (falls to unknown)', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.handleSelection('text', 'nonexistent')
      assert.equal(result.action, 'generalQuery')
    })
  })

  describe('explainCode', () => {
    it('should detect language from meta', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('x = 1', { language: 'python' })
      assert.equal(result.payload.language, 'python')
    })

    it('should guess language if not in meta', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('console.log("hi")', {})
      assert.equal(result.payload.language, 'javascript')
    })

    it('should guess python', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('def hello(): pass', {})
      assert.equal(result.payload.language, 'python')
    })

    it('should guess java', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('public static void main() {}', {})
      assert.equal(result.payload.language, 'java')
    })

    it('should guess go', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('func main() { fmt.Println("hi") }', {})
      assert.equal(result.payload.language, 'go')
    })

    it('should guess sql', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('SELECT * FROM users', {})
      assert.equal(result.payload.language, 'sql')
    })

    it('should guess html', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('<div><span>hi</span></div>', {})
      assert.equal(result.payload.language, 'html')
    })

    it('should guess json', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('{"key": "value"}', {})
      assert.equal(result.payload.language, 'json')
    })

    it('should return unknown for unrecognized code', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.explainCode('xyz abc 123', {})
      assert.equal(result.payload.language, 'unknown')
    })
  })

  describe('previewURL', () => {
    it('should normalize www URLs', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.previewURL('www.example.com')
      assert.equal(result.payload.url, 'https://www.example.com')
    })

    it('should extract domain', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.previewURL('https://example.com/path')
      assert.equal(result.payload.domain, 'example.com')
    })

    it('should handle invalid URL domain extraction', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.previewURL('not a url at all')
      assert.equal(result.payload.domain, '')
    })
  })

  describe('searchError', () => {
    it('should extract error type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.searchError('TypeError: something failed')
      assert.equal(result.payload.errorType, 'TypeError')
    })

    it('should extract exception type', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.searchError('NullPointerException at line 42')
      assert.equal(result.payload.errorType, 'NullPointerException')
    })

    it('should return UnknownError when no type found', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.searchError('something went wrong')
      assert.equal(result.payload.errorType, 'UnknownError')
    })
  })

  describe('calculateMath', () => {
    it('should evaluate simple arithmetic', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.calculateMath('10 + 20')
      assert.equal(result.payload.result, 30)
    })

    it('should handle exponent (^)', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.calculateMath('2 ^ 3')
      assert.equal(result.payload.result, 8)
    })

    it('should return N/A for non-numeric expression', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.calculateMath('hello world')
      assert.equal(result.payload.result, 'N/A')
    })

    it('should return N/A for division by zero', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.calculateMath('1 / 0')
      assert.equal(result.payload.result, 'N/A')
    })
  })

  describe('translateEnglish', () => {
    it('should count words correctly', () => {
      const handler = new globalThis.SelectionHandler()
      const result = handler.translateEnglish('Hello World How Are You')
      assert.equal(result.payload.wordCount, 5)
    })
  })

  describe('_emit', () => {
    it('should call onAction callback', () => {
      let calledAction = null
      let calledPayload = null
      const handler = new globalThis.SelectionHandler({
        onAction: (action, payload) => { calledAction = action; calledPayload = payload }
      })
      handler._emit('testAction', { data: 1 })
      assert.equal(calledAction, 'testAction')
      assert.equal(calledPayload.data, 1)
    })

    it('should call onMessage callback', () => {
      let msg = null
      const handler = new globalThis.SelectionHandler({
        onMessage: (m) => { msg = m }
      })
      handler._emit('testAction', { data: 1 })
      assert.equal(msg.action, 'testAction')
      assert.equal(msg.source, 'selectionHandler')
      assert.ok(typeof msg.timestamp === 'number')
    })
  })
})
