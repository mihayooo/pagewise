import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  BookmarkNotifier,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LEVELS,
  DEFAULT_LEVELS,
  DEFAULT_CHANNEL,
  MAX_HISTORY,
  MERGE_INTERVAL,
} from '../lib/bookmark-notifier.js'

describe('BookmarkNotifier', () => {
  let dispatched
  let now
  let notifier

  beforeEach(() => {
    dispatched = []
    now = 1000000
    notifier = new BookmarkNotifier({
      dispatch: (n) => dispatched.push(n),
      now: () => now,
    })
  })

  describe('constructor', () => {
    it('should create with default options', () => {
      const n = new BookmarkNotifier()
      assert.ok(n)
      const prefs = n.getNotificationPrefs()
      assert.equal(prefs.enabled, true)
      assert.deepEqual(prefs.channels, ['browser'])
    })

    it('should accept custom dispatch and now', () => {
      const custom = new BookmarkNotifier({ dispatch: () => {}, now: () => 42 })
      assert.ok(custom)
    })
  })

  describe('notifyDeadLinks', () => {
    it('should send notification for dead links', () => {
      const links = [
        { url: 'https://a.com', title: 'A', status: 404 },
        { url: 'https://b.com', title: 'B', status: 500 },
      ]
      const result = notifier.notifyDeadLinks(links)
      assert.equal(result.sent, true)
      assert.ok(result.notification.title.includes('2'))
      assert.equal(result.notification.type, 'dead-links')
      assert.equal(result.notification.data.count, 2)
    })

    it('should return not sent for empty array', () => {
      const result = notifier.notifyDeadLinks([])
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'no-dead-links')
    })

    it('should throw for non-array input', () => {
      assert.throws(() => notifier.notifyDeadLinks('bad'))
    })

    it('should use error level for >10 dead links', () => {
      const links = Array.from({ length: 11 }, (_, i) => ({ url: `https://${i}.com` }))
      const result = notifier.notifyDeadLinks(links)
      assert.equal(result.notification.level, 'error')
    })
  })

  describe('notifyNewBookmarks', () => {
    it('should send notification for new bookmarks', () => {
      const result = notifier.notifyNewBookmarks(5)
      assert.equal(result.sent, true)
      assert.ok(result.notification.title.includes('5'))
      assert.equal(result.notification.type, 'new-bookmarks')
    })

    it('should return not sent for zero count', () => {
      const result = notifier.notifyNewBookmarks(0)
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'zero-count')
    })

    it('should throw for negative count', () => {
      assert.throws(() => notifier.notifyNewBookmarks(-1))
    })

    it('should throw for non-number', () => {
      assert.throws(() => notifier.notifyNewBookmarks('bad'))
    })

    it('should throw for Infinity', () => {
      assert.throws(() => notifier.notifyNewBookmarks(Infinity))
    })
  })

  describe('notifyDuplicates', () => {
    it('should send notification for duplicates', () => {
      const result = notifier.notifyDuplicates(3)
      assert.equal(result.sent, true)
      assert.ok(result.notification.title.includes('3'))
      assert.equal(result.notification.type, 'duplicates')
    })

    it('should return not sent for zero', () => {
      assert.equal(notifier.notifyDuplicates(0).sent, false)
    })

    it('should throw for non-number', () => {
      assert.throws(() => notifier.notifyDuplicates('bad'))
    })
  })

  describe('notifyBackupComplete', () => {
    it('should send notification for backup', () => {
      const result = notifier.notifyBackupComplete('/backups/2024-01.zip')
      assert.equal(result.sent, true)
      assert.ok(result.notification.title.includes('备份'))
      assert.equal(result.notification.type, 'backup-complete')
    })

    it('should throw for empty path', () => {
      assert.throws(() => notifier.notifyBackupComplete(''))
      assert.throws(() => notifier.notifyBackupComplete('  '))
    })

    it('should throw for non-string', () => {
      assert.throws(() => notifier.notifyBackupComplete(123))
    })
  })

  describe('setNotificationPrefs', () => {
    it('should update enabled', () => {
      const prefs = notifier.setNotificationPrefs({ enabled: false })
      assert.equal(prefs.enabled, false)
    })

    it('should update channels', () => {
      const prefs = notifier.setNotificationPrefs({ channels: ['browser', 'badge'] })
      assert.deepEqual(prefs.channels, ['browser', 'badge'])
    })

    it('should reject invalid channels', () => {
      assert.throws(() => notifier.setNotificationPrefs({ channels: ['invalid'] }))
    })

    it('should update levels', () => {
      const prefs = notifier.setNotificationPrefs({ levels: { 'dead-links': 'error' } })
      assert.equal(prefs.levels['dead-links'], 'error')
    })

    it('should reject invalid levels', () => {
      assert.throws(() => notifier.setNotificationPrefs({ levels: { 'dead-links': 'critical' } }))
    })

    it('should update types', () => {
      const prefs = notifier.setNotificationPrefs({ types: { 'dead-links': false } })
      assert.equal(prefs.types['dead-links'], false)
    })

    it('should reject non-boolean type value', () => {
      assert.throws(() => notifier.setNotificationPrefs({ types: { 'dead-links': 'yes' } }))
    })

    it('should update sound', () => {
      const prefs = notifier.setNotificationPrefs({ sound: true })
      assert.equal(prefs.sound, true)
    })

    it('should reject non-boolean sound', () => {
      assert.throws(() => notifier.setNotificationPrefs({ sound: 'yes' }))
    })

    it('should update mergeInterval', () => {
      const prefs = notifier.setNotificationPrefs({ mergeInterval: 10000 })
      assert.equal(prefs.mergeInterval, 10000)
    })

    it('should reject negative mergeInterval', () => {
      assert.throws(() => notifier.setNotificationPrefs({ mergeInterval: -1 }))
    })

    it('should reject non-object prefs', () => {
      assert.throws(() => notifier.setNotificationPrefs(null))
      assert.throws(() => notifier.setNotificationPrefs('bad'))
    })

    it('should reject non-boolean enabled', () => {
      assert.throws(() => notifier.setNotificationPrefs({ enabled: 'yes' }))
    })

    it('should reject non-array channels', () => {
      assert.throws(() => notifier.setNotificationPrefs({ channels: 'browser' }))
    })

    it('should reject non-object levels', () => {
      assert.throws(() => notifier.setNotificationPrefs({ levels: 'bad' }))
    })

    it('should reject non-object types', () => {
      assert.throws(() => notifier.setNotificationPrefs({ types: 'bad' }))
    })

    it('should reject non-number mergeInterval', () => {
      assert.throws(() => notifier.setNotificationPrefs({ mergeInterval: 'bad' }))
    })

    it('should reject NaN mergeInterval', () => {
      assert.throws(() => notifier.setNotificationPrefs({ mergeInterval: NaN }))
    })
  })

  describe('getNotificationPrefs', () => {
    it('should return a copy', () => {
      const prefs1 = notifier.getNotificationPrefs()
      const prefs2 = notifier.getNotificationPrefs()
      assert.deepEqual(prefs1, prefs2)
      assert.notEqual(prefs1, prefs2)
      assert.notEqual(prefs1.channels, prefs2.channels)
    })
  })

  describe('dispatch behavior', () => {
    it('should not send when disabled', () => {
      notifier.setNotificationPrefs({ enabled: false })
      const result = notifier.notifyNewBookmarks(5)
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'disabled')
    })

    it('should not send when type is disabled', () => {
      notifier.setNotificationPrefs({ types: { 'new-bookmarks': false } })
      const result = notifier.notifyNewBookmarks(5)
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'type-disabled')
    })

    it('should merge notifications within merge interval', () => {
      notifier.notifyNewBookmarks(5)
      now += 1000 // within MERGE_INTERVAL
      const result = notifier.notifyNewBookmarks(3)
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'merged')
    })

    it('should not merge after merge interval expires', () => {
      notifier.notifyNewBookmarks(5)
      now += MERGE_INTERVAL + 1
      const result = notifier.notifyNewBookmarks(3)
      assert.equal(result.sent, true)
    })
  })

  describe('getNotificationHistory', () => {
    it('should return history', () => {
      notifier.notifyNewBookmarks(5)
      notifier.notifyDuplicates(3)
      const history = notifier.getNotificationHistory()
      assert.equal(history.length, 2)
    })

    it('should filter by type', () => {
      notifier.notifyNewBookmarks(5)
      notifier.notifyDuplicates(3)
      const history = notifier.getNotificationHistory({ type: 'new-bookmarks' })
      assert.equal(history.length, 1)
    })

    it('should filter by since', () => {
      notifier.notifyNewBookmarks(5)
      now += 10000
      notifier.notifyDuplicates(3)
      const history = notifier.getNotificationHistory({ since: now - 5000 })
      assert.equal(history.length, 1)
    })

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        now += MERGE_INTERVAL + 1
        notifier.notifyNewBookmarks(i + 1)
      }
      const history = notifier.getNotificationHistory({ limit: 2 })
      assert.equal(history.length, 2)
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', () => {
      notifier.notifyNewBookmarks(5)
      notifier.clearHistory()
      assert.equal(notifier.getNotificationHistory().length, 0)
    })
  })

  describe('getStats', () => {
    it('should return correct stats', () => {
      notifier.notifyNewBookmarks(5)
      notifier.notifyDuplicates(3)
      const stats = notifier.getStats()
      assert.equal(stats.totalSent, 2)
      assert.equal(stats.historySize, 2)
      assert.equal(stats.byType['new-bookmarks'], 1)
      assert.equal(stats.byType['duplicates'], 1)
    })
  })

  describe('dispatch error handling', () => {
    it('should handle dispatch function errors gracefully', () => {
      const errorNotifier = new BookmarkNotifier({
        dispatch: () => { throw new Error('dispatch failed') },
        now: () => now,
      })
      const result = errorNotifier.notifyNewBookmarks(5)
      assert.equal(result.sent, true)
    })
  })

  describe('merge logic for dead-links', () => {
    it('should merge dead-link notifications', () => {
      notifier.notifyDeadLinks([{ url: 'https://a.com' }])
      now += 1000
      const result = notifier.notifyDeadLinks([{ url: 'https://b.com' }])
      assert.equal(result.sent, false)
      assert.equal(result.reason, 'merged')
    })

    it('should combine dead link data after merge interval', () => {
      notifier.notifyDeadLinks([{ url: 'https://a.com' }])
      now += 1000 // within merge interval (pending)
      notifier.notifyDeadLinks([{ url: 'https://b.com' }]) // merged
      now += MERGE_INTERVAL + 1 // past interval
      const result = notifier.notifyDeadLinks([{ url: 'https://c.com' }])
      assert.equal(result.sent, true)
    })
  })

  describe('history trimming', () => {
    it('should trim history beyond MAX_HISTORY', () => {
      // Trigger history trimming by sending many notifications
      for (let i = 0; i < MAX_HISTORY + 10; i++) {
        now += MERGE_INTERVAL + 1
        notifier.notifyNewBookmarks(1)
      }
      const stats = notifier.getStats()
      assert.ok(stats.historySize <= MAX_HISTORY)
    })
  })

  describe('exports', () => {
    it('should export constants', () => {
      assert.ok(Array.isArray(NOTIFICATION_TYPES))
      assert.ok(NOTIFICATION_TYPES.includes('dead-links'))
      assert.ok(Array.isArray(NOTIFICATION_CHANNELS))
      assert.ok(NOTIFICATION_CHANNELS.includes('browser'))
      assert.ok(Array.isArray(NOTIFICATION_LEVELS))
      assert.ok(NOTIFICATION_LEVELS.includes('info'))
      assert.ok(DEFAULT_LEVELS['dead-links'] === 'warning')
      assert.equal(DEFAULT_CHANNEL, 'browser')
      assert.equal(MAX_HISTORY, 500)
      assert.equal(MERGE_INTERVAL, 5000)
    })
  })
})
