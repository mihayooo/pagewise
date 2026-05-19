import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  _timestampToDateUTC8,
  _getDateUTC8Offset,
  _calculateStreak,
  _getUniqueDays,
} from '../lib/bookmark-learning-progress-db.js'

/**
 * bookmark-learning-progress-db.js exports functions that use `this`.
 * We create a mock context and call them via .call(ctx, ...).
 * DB operations (_openDB, _addRecord, etc.) require IndexedDB which we
 * can't easily mock in Node, so we focus on the pure date/stat functions.
 */

function createContext() {
  return {
    _dbName: 'testDB',
    _dbVersion: 1,
    _db: null,
    _bookmarksMap: new Map(),
    _openDB: _openDB,
    _addRecord: _addRecord,
    _updateRecord: _updateRecord,
    _getRecordsByBookmark: _getRecordsByBookmark,
    _getAllRecords: _getAllRecords,
    getStats: getStats,
    getDailyStats: getDailyStats,
    exportData: exportData,
    importData: importData,
    _calculateStreak: _calculateStreak,
    _getUniqueDays: _getUniqueDays,
    _timestampToDateUTC8: _timestampToDateUTC8,
    _getDateUTC8Offset: _getDateUTC8Offset,
  }
}

// Re-import the DB functions to mount on context
import {
  _openDB,
  _addRecord,
  _updateRecord,
  _getRecordsByBookmark,
  _getAllRecords,
  getStats,
  getDailyStats,
  exportData,
  importData,
} from '../lib/bookmark-learning-progress-db.js'

describe('bookmark-learning-progress-db date utilities', () => {
  let ctx
  beforeEach(() => {
    ctx = createContext()
  })

  describe('_timestampToDateUTC8', () => {
    it('should convert timestamp to UTC+8 date string', () => {
      // 2023-01-01T00:00:00Z = 2023-01-01T08:00:00 UTC+8
      const ts = Date.UTC(2023, 0, 1, 0, 0, 0)
      const result = _timestampToDateUTC8.call(ctx, ts)
      assert.equal(result, '2023-01-01')
    })

    it('should handle date that shifts across day boundary in UTC+8', () => {
      // 2023-01-01T20:00:00Z = 2023-01-02T04:00:00 UTC+8
      const ts = Date.UTC(2023, 0, 1, 20, 0, 0)
      const result = _timestampToDateUTC8.call(ctx, ts)
      assert.equal(result, '2023-01-02')
    })

    it('should pad month and day with leading zeros', () => {
      const ts = Date.UTC(2023, 2, 5, 0, 0, 0) // March 5
      const result = _timestampToDateUTC8.call(ctx, ts)
      assert.equal(result, '2023-03-05')
    })
  })

  describe('_getDateUTC8Offset', () => {
    it('should return today UTC+8 with offset 0', () => {
      const today = _getDateUTC8Offset.call(ctx, 0)
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today))
    })

    it('should return yesterday with offset -1', () => {
      const today = _getDateUTC8Offset.call(ctx, 0)
      const yesterday = _getDateUTC8Offset.call(ctx, -1)
      assert.notEqual(today, yesterday)
    })

    it('should return tomorrow with offset +1', () => {
      const today = _getDateUTC8Offset.call(ctx, 0)
      const tomorrow = _getDateUTC8Offset.call(ctx, 1)
      assert.notEqual(today, tomorrow)
    })
  })

  describe('_getUniqueDays', () => {
    it('should return empty set for empty records', () => {
      const days = _getUniqueDays.call(ctx, [])
      assert.equal(days.size, 0)
    })

    it('should return unique dates from records', () => {
      const ts1 = Date.UTC(2023, 0, 1, 0, 0, 0)
      const ts2 = Date.UTC(2023, 0, 1, 12, 0, 0)
      const ts3 = Date.UTC(2023, 0, 2, 0, 0, 0)
      const records = [
        { endTime: ts1 },
        { endTime: ts2 },
        { endTime: ts3 },
      ]
      const days = _getUniqueDays.call(ctx, records)
      assert.equal(days.size, 2) // Jan 1 and Jan 2 in UTC+8
    })

    it('should skip records with null endTime', () => {
      const records = [
        { endTime: null },
        { endTime: Date.UTC(2023, 0, 1) },
      ]
      const days = _getUniqueDays.call(ctx, records)
      assert.equal(days.size, 1)
    })
  })

  describe('_calculateStreak', () => {
    it('should return 0 for empty records', () => {
      const streak = _calculateStreak.call(ctx, [])
      assert.equal(streak, 0)
    })

    it('should count consecutive days ending today', () => {
      const now = Date.now()
      const today = _timestampToDateUTC8.call(ctx, now)
      const yesterday = _timestampToDateUTC8.call(ctx, now - 86400000)

      const records = [
        { endTime: now },
        { endTime: now - 86400000 },
      ]
      const streak = _calculateStreak.call(ctx, records)
      assert.ok(streak >= 1) // at least today
    })

    it('should return 0 if no records match today/recent', () => {
      const oldTs = Date.UTC(2020, 0, 1)
      const records = [{ endTime: oldTs }]
      const streak = _calculateStreak.call(ctx, records)
      assert.equal(streak, 0)
    })
  })
})
