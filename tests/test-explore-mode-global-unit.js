import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// Mock DOM + chrome APIs before loading the IIFE

class MockElement {
  constructor() {
    this.className = ''
    this.textContent = ''
    this._attrs = {}
    this._listeners = {}
    this.parentNode = null
    this.children = []
  }
  setAttribute(k, v) { this._attrs[k] = v }
  getAttribute(k) { return this._attrs[k] }
  addEventListener(ev, fn, opts) {
    if (!this._listeners[ev]) this._listeners[ev] = []
    this._listeners[ev].push({ fn, opts })
  }
  removeEventListener(ev, fn) {
    if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(l => l.fn !== fn)
  }
  appendChild(el) { el.parentNode = this; this.children.push(el) }
  removeChild(el) { el.parentNode = null; this.children = this.children.filter(c => c !== el) }
  classList = {
    _classes: new Set(),
    add: (c) => { this.classList._classes.add(c) },
    remove: (c) => { this.classList._classes.delete(c) },
    has: (c) => this.classList._classes.has(c),
  }
}

const mockBody = new MockElement()
mockBody.appendChild = (el) => { el.parentNode = mockBody }
mockBody.removeChild = (el) => { el.parentNode = null }

const sentMessages = []
const eventListeners = {}

globalThis.document = {
  createElement: () => new MockElement(),
  body: mockBody,
  addEventListener: (ev, fn, opts) => {
    if (!eventListeners[ev]) eventListeners[ev] = []
    eventListeners[ev].push(fn)
  },
  removeEventListener: (ev, fn) => {
    if (eventListeners[ev]) eventListeners[ev] = eventListeners[ev].filter(f => f !== fn)
  },
}

globalThis.chrome = {
  runtime: {
    sendMessage: (msg) => sentMessages.push(msg),
  },
}

globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)

before(async () => {
  await import('../lib/explore-mode-global.js')
})

describe('ExploreMode (global)', () => {
  it('should be registered on globalThis', () => {
    assert.ok(typeof globalThis.ExploreMode === 'function')
  })

  describe('constructor', () => {
    it('should initialize with defaults', () => {
      const em = new globalThis.ExploreMode()
      assert.equal(em.isActive(), false)
      assert.equal(em._debounceMs, 300)
      assert.equal(em._minSelectionLength, 2)
    })

    it('should accept custom options', () => {
      const em = new globalThis.ExploreMode({ debounceMs: 500, minSelectionLength: 5, indicatorText: 'Custom' })
      assert.equal(em._debounceMs, 500)
      assert.equal(em._minSelectionLength, 5)
      assert.equal(em._indicatorText, 'Custom')
    })
  })

  describe('enable / disable / toggle', () => {
    it('should enable and set active', () => {
      sentMessages.length = 0
      const em = new globalThis.ExploreMode()
      em.enable()
      assert.equal(em.isActive(), true)
      // Should emit state change
      const stateMsg = sentMessages.find(m => m.action === 'exploreModeStateChange')
      assert.ok(stateMsg)
      assert.equal(stateMsg.active, true)
    })

    it('should not double-enable', () => {
      const em = new globalThis.ExploreMode()
      em.enable()
      sentMessages.length = 0
      em.enable() // should be no-op
      assert.equal(sentMessages.filter(m => m.action === 'exploreModeStateChange').length, 0)
    })

    it('should disable and set inactive', () => {
      sentMessages.length = 0
      const em = new globalThis.ExploreMode()
      em.enable()
      em.disable()
      assert.equal(em.isActive(), false)
      const stateMsg = sentMessages.find(m => m.action === 'exploreModeStateChange' && m.active === false)
      assert.ok(stateMsg)
    })

    it('should not double-disable', () => {
      const em = new globalThis.ExploreMode()
      em.disable() // should be no-op
      assert.equal(em.isActive(), false)
    })

    it('toggle should switch state', () => {
      const em = new globalThis.ExploreMode()
      em.toggle()
      assert.equal(em.isActive(), true)
      em.toggle()
      assert.equal(em.isActive(), false)
    })
  })

  describe('destroy', () => {
    it('should disable and cleanup', () => {
      const em = new globalThis.ExploreMode()
      em.enable()
      em.destroy()
      assert.equal(em.isActive(), false)
      assert.equal(em._indicatorEl, null)
    })
  })

  describe('_autoExplain', () => {
    it('should send chrome message', () => {
      sentMessages.length = 0
      const em = new globalThis.ExploreMode()
      em._autoExplain('selected text')
      const msg = sentMessages.find(m => m.action === 'exploreExplain')
      assert.ok(msg)
      assert.equal(msg.selection, 'selected text')
      assert.equal(msg.source, 'exploreMode')
    })

    it('should not send for empty text', () => {
      sentMessages.length = 0
      const em = new globalThis.ExploreMode()
      em._autoExplain('')
      assert.equal(sentMessages.filter(m => m.action === 'exploreExplain').length, 0)
    })
  })

  describe('_createIndicator / _removeIndicator', () => {
    it('should create indicator element', () => {
      const em = new globalThis.ExploreMode()
      em._createIndicator()
      assert.ok(em._indicatorEl)
      assert.equal(em._indicatorEl.textContent, '🔍 探索模式')
    })

    it('should not double-create', () => {
      const em = new globalThis.ExploreMode()
      em._createIndicator()
      const first = em._indicatorEl
      em._createIndicator()
      assert.equal(em._indicatorEl, first)
    })

    it('should handle removeIndicator with no indicator', () => {
      const em = new globalThis.ExploreMode()
      em._removeIndicator() // should not throw
    })
  })

  describe('_handleKeyDown', () => {
    it('Escape should disable', () => {
      const em = new globalThis.ExploreMode()
      em.enable()
      em._handleKeyDown({ key: 'Escape', preventDefault: () => {} })
      assert.equal(em.isActive(), false)
    })
  })
})
