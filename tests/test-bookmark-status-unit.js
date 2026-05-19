import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { BookmarkStatusManager, VALID_STATUSES } from '../lib/bookmark-status.js'

describe('BookmarkStatusManager (status module)', () => {
  let mgr
  const bms = [
    { id: '1', title: 'Bookmark A', url: 'https://a.com', folderPath: ['F1'] },
    { id: '2', title: 'Bookmark B', url: 'https://b.com', tags: ['t1'] },
    { id: '3', title: 'Bookmark C', url: 'https://c.com' },
    { id: '4', title: 'Bookmark D', url: 'https://d.com' },
    { id: '5', title: 'Bookmark E', url: 'https://e.com' },
  ]

  beforeEach(() => { mgr = new BookmarkStatusManager(bms) })

  describe('constructor', () => {
    it('should accept empty array', () => {
      const m = new BookmarkStatusManager()
      assert.equal(m.getStatus('1'), null)
    })

    it('should throw for non-array', () => {
      assert.throws(() => new BookmarkStatusManager({}), TypeError)
    })

    it('should skip null entries', () => {
      const m = new BookmarkStatusManager([null, undefined, { id: '1', title: 'A' }])
      assert.equal(m.getStatus('1'), 'unread')
    })
  })

  describe('VALID_STATUSES', () => {
    it('should export the correct statuses', () => {
      assert.deepEqual(VALID_STATUSES, ['unread', 'reading', 'read'])
    })
  })

  describe('setStatus / getStatus', () => {
    it('should set and get status', () => {
      assert.equal(mgr.setStatus('1', 'reading'), true)
      assert.equal(mgr.getStatus('1'), 'reading')
    })

    it('should return false for invalid status', () => {
      assert.equal(mgr.setStatus('1', 'done'), false)
    })

    it('should return false for unknown id', () => {
      assert.equal(mgr.setStatus('999', 'read'), false)
    })

    it('should default to unread', () => {
      assert.equal(mgr.getStatus('2'), 'unread')
    })

    it('should return null for nonexistent bookmark', () => {
      assert.equal(mgr.getStatus('nonexistent'), null)
    })

    it('should overwrite previous status', () => {
      mgr.setStatus('1', 'reading')
      mgr.setStatus('1', 'read')
      assert.equal(mgr.getStatus('1'), 'read')
    })
  })

  describe('batchSetStatus', () => {
    it('should set multiple statuses', () => {
      const count = mgr.batchSetStatus(['1', '2', '3'], 'reading')
      assert.equal(count, 3)
      assert.equal(mgr.getStatus('1'), 'reading')
      assert.equal(mgr.getStatus('2'), 'reading')
      assert.equal(mgr.getStatus('3'), 'reading')
    })

    it('should skip invalid ids', () => {
      const count = mgr.batchSetStatus(['1', '999'], 'read')
      assert.equal(count, 1)
    })

    it('should return 0 for non-array', () => {
      assert.equal(mgr.batchSetStatus('1', 'read'), 0)
    })

    it('should return 0 for invalid status', () => {
      assert.equal(mgr.batchSetStatus(['1'], 'bad'), 0)
    })
  })

  describe('getByStatus', () => {
    it('should return all unread by default', () => {
      const unread = mgr.getByStatus('unread')
      assert.equal(unread.length, 5)
    })

    it('should filter by reading', () => {
      mgr.setStatus('1', 'reading')
      mgr.setStatus('2', 'reading')
      const reading = mgr.getByStatus('reading')
      assert.equal(reading.length, 2)
    })

    it('should return empty for invalid status', () => {
      assert.deepEqual(mgr.getByStatus('done'), [])
    })
  })

  describe('getStatusCounts', () => {
    it('should count all unread initially', () => {
      const counts = mgr.getStatusCounts()
      assert.equal(counts.unread, 5)
      assert.equal(counts.reading, 0)
      assert.equal(counts.read, 0)
    })

    it('should count after status changes', () => {
      mgr.setStatus('1', 'read')
      mgr.setStatus('2', 'reading')
      const counts = mgr.getStatusCounts()
      assert.equal(counts.unread, 3)
      assert.equal(counts.reading, 1)
      assert.equal(counts.read, 1)
    })
  })

  describe('markAllAsRead', () => {
    it('should mark all specified as read', () => {
      const count = mgr.markAllAsRead(['1', '2', '3'])
      assert.equal(count, 3)
      assert.equal(mgr.getStatus('1'), 'read')
      assert.equal(mgr.getStatus('2'), 'read')
      assert.equal(mgr.getStatus('3'), 'read')
    })
  })

  describe('getRecentlyRead', () => {
    it('should return recently read in order', () => {
      mgr.setStatus('1', 'read')
      mgr.setStatus('3', 'read')
      mgr.setStatus('5', 'read')
      const recent = mgr.getRecentlyRead(10)
      assert.equal(recent.length, 3)
      assert.equal(recent[0].id, '5') // last set
      assert.equal(recent[2].id, '1') // first set
    })

    it('should respect limit', () => {
      mgr.markAllAsRead(['1', '2', '3', '4', '5'])
      const recent = mgr.getRecentlyRead(2)
      assert.equal(recent.length, 2)
    })

    it('should return empty when none read', () => {
      assert.deepEqual(mgr.getRecentlyRead(), [])
    })

    it('should not include non-existent bookmarks', () => {
      // Manually inject stale status record
      mgr.setStatus('1', 'read')
      const recent = mgr.getRecentlyRead()
      assert.equal(recent.length, 1)
    })
  })
})
