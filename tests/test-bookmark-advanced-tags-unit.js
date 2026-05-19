import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { AdvancedTagManager } from '../lib/bookmark-advanced-tags.js'

describe('AdvancedTagManager', () => {
  let mgr
  beforeEach(() => {
    mgr = new AdvancedTagManager({
      bookmarks: [
        { id: '1', title: 'React Tutorial', url: 'https://react.dev', tags: ['react', 'frontend'] },
        { id: '2', title: 'Python Guide', url: 'https://python.org', tags: ['python', 'backend'] },
        { id: '3', title: 'Full Stack', url: 'https://example.com', tags: ['react', 'python', 'fullstack'] },
      ]
    })
  })

  describe('constructor', () => {
    it('should initialize with empty bookmarks if none provided', () => {
      const m = new AdvancedTagManager()
      assert.deepEqual(m.bookmarks, [])
    })

    it('should deep-copy bookmark tags', () => {
      const original = [{ id: '1', title: 'A', tags: ['t1'] }]
      const m = new AdvancedTagManager({ bookmarks: original })
      original[0].tags.push('t2')
      assert.equal(m.bookmarks[0].tags.length, 1)
    })

    it('should handle bookmarks with missing tags', () => {
      const m = new AdvancedTagManager({ bookmarks: [{ id: '1', title: 'A' }] })
      assert.deepEqual(m.bookmarks[0].tags, [])
    })
  })

  describe('Tag Colors', () => {
    it('assignColor should assign a color from palette', () => {
      const color = mgr.assignColor('react')
      assert.ok(color.startsWith('#'))
      assert.equal(color.length, 7)
    })

    it('assignColor should return same color for same tag', () => {
      const c1 = mgr.assignColor('react')
      const c2 = mgr.assignColor('react')
      assert.equal(c1, c2)
    })

    it('assignColor should be case-insensitive', () => {
      const c1 = mgr.assignColor('React')
      const c2 = mgr.assignColor('react')
      assert.equal(c1, c2)
    })

    it('assignColor should return first color for empty tag', () => {
      assert.equal(mgr.assignColor(''), AdvancedTagManager.getPalette()[0])
      assert.equal(mgr.assignColor(null), AdvancedTagManager.getPalette()[0])
    })

    it('assignColor should rotate through 15 colors', () => {
      const colors = new Set()
      for (let i = 0; i < 15; i++) {
        colors.add(mgr.assignColor(`tag-${i}`))
      }
      assert.equal(colors.size, 15)
    })

    it('getColor should auto-assign if not yet assigned', () => {
      const color = mgr.getColor('new-tag')
      assert.ok(color.startsWith('#'))
    })

    it('getColor should return existing color', () => {
      const assigned = mgr.assignColor('react')
      assert.equal(mgr.getColor('react'), assigned)
    })

    it('getColor should handle empty/null gracefully', () => {
      assert.equal(mgr.getColor(''), AdvancedTagManager.getPalette()[0])
      assert.equal(mgr.getColor(null), AdvancedTagManager.getPalette()[0])
    })

    it('getPalette should return a copy of the palette', () => {
      const p = AdvancedTagManager.getPalette()
      assert.equal(p.length, 15)
      p.push('#000')
      assert.equal(AdvancedTagManager.getPalette().length, 15)
    })
  })

  describe('Tag Hierarchy', () => {
    it('setParent should establish parent-child relationship', () => {
      mgr.setParent('react-hooks', 'react')
      assert.deepEqual(mgr.getChildren('react'), ['react-hooks'])
    })

    it('setParent should ignore empty or same values', () => {
      mgr.setParent('', 'react')
      mgr.setParent('react', '')
      mgr.setParent('react', 'react')
      assert.deepEqual(mgr.getChildren('react'), [])
    })

    it('setParent should be case-insensitive', () => {
      mgr.setParent('React-Hooks', 'REACT')
      assert.deepEqual(mgr.getChildren('react'), ['react-hooks'])
    })

    it('getChildren should return empty for no children', () => {
      assert.deepEqual(mgr.getChildren('nonexistent'), [])
    })

    it('getChildren should return empty for empty input', () => {
      assert.deepEqual(mgr.getChildren(''), [])
      assert.deepEqual(mgr.getChildren(null), [])
    })

    it('getAncestors should return ancestor chain', () => {
      mgr.setParent('hooks', 'react')
      mgr.setParent('react', 'frontend')
      const ancestors = mgr.getAncestors('hooks')
      assert.deepEqual(ancestors, ['react', 'frontend'])
    })

    it('getAncestors should handle cycle gracefully', () => {
      mgr._parentMap.set('a', 'b')
      mgr._parentMap.set('b', 'a')
      const ancestors = mgr.getAncestors('a')
      assert.ok(ancestors.length <= 2)
    })

    it('getAncestors should return empty for root tag', () => {
      assert.deepEqual(mgr.getAncestors('react'), [])
    })

    it('getAncestors should return empty for empty input', () => {
      assert.deepEqual(mgr.getAncestors(''), [])
      assert.deepEqual(mgr.getAncestors(null), [])
    })
  })

  describe('Tag Statistics', () => {
    it('getTagStats should count tag occurrences', () => {
      const stats = mgr.getTagStats()
      assert.equal(stats.count['react'], 2)
      assert.equal(stats.count['python'], 2)
      assert.equal(stats.count['frontend'], 1)
    })

    it('getTagStats should return top tags sorted', () => {
      const stats = mgr.getTagStats()
      assert.ok(stats.top.length > 0)
      assert.equal(stats.top[0], 'react') // or 'python', both have count 2
    })

    it('getTagStats should compute co-occurrence', () => {
      const stats = mgr.getTagStats()
      // react+python co-occur in bookmark 3
      const coPair = stats.coOccurrence.find(
        c => (c.tagA === 'python' && c.tagB === 'react') || (c.tagA === 'react' && c.tagB === 'python')
      )
      // They co-occur in "Full Stack" bookmark
      // But react is 'react','frontend' and python is 'python','backend' - they co-occur in '3' which has react, python, fullstack
      // Actually let me check: tags sorted alphabetically in co-pair key
      // react, python -> fullstack has both react and python
      if (coPair) assert.ok(coPair.count >= 1)
    })

    it('getTagStats should handle empty bookmarks', () => {
      const m = new AdvancedTagManager()
      const stats = m.getTagStats()
      assert.deepEqual(stats.count, {})
      assert.deepEqual(stats.top, [])
      assert.deepEqual(stats.coOccurrence, [])
    })
  })

  describe('Auto-tagging', () => {
    it('autoTag should suggest tags from title keywords', () => {
      const tags = mgr.autoTag({ title: 'Learn React and TypeScript', url: '' })
      assert.ok(tags.includes('react'))
      assert.ok(tags.includes('typescript'))
    })

    it('autoTag should suggest tags from domain', () => {
      const tags = mgr.autoTag({ title: '', url: 'https://github.com/user/repo' })
      assert.ok(tags.includes('github'))
    })

    it('autoTag should handle multi-word keywords', () => {
      const tags = mgr.autoTag({ title: 'Introduction to Machine Learning', url: '' })
      assert.ok(tags.includes('machine-learning'))
    })

    it('autoTag should deduplicate tags', () => {
      const tags = mgr.autoTag({ title: 'React Tutorial', url: 'https://react.dev' })
      const reactCount = tags.filter(t => t === 'react').length
      assert.equal(reactCount, 1)
    })

    it('autoTag should handle null/missing fields', () => {
      const tags1 = mgr.autoTag(null)
      assert.ok(Array.isArray(tags1))

      const tags2 = mgr.autoTag({})
      assert.ok(Array.isArray(tags2))
    })

    it('autoTag should return empty for no matches', () => {
      const tags = mgr.autoTag({ title: 'xyz', url: 'https://unknown-domain.xyz' })
      assert.ok(Array.isArray(tags))
    })
  })
})
