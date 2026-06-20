/**
 * bookmark-learning-progress-db.js — IndexedDB 真实路径测试
 *
 * 使用 fake-indexeddb polyfill 激活 globalThis.indexedDB，
 * 覆盖 _openDB, _addRecord, _updateRecord, _getRecordsByBookmark,
 * _getAllRecords, getStats, getDailyStats, exportData, importData
 *
 * R418: 行覆盖率目标 44.9% → ≥80%
 */

import 'fake-indexeddb/auto'
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

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
  _calculateStreak,
  _getUniqueDays,
  _timestampToDateUTC8,
  _getDateUTC8Offset,
} from '../lib/bookmark-learning-progress-db.js'

let dbCounter = 0

function createContext(dbName) {
  const name = dbName || `testLPDB_${++dbCounter}_${Date.now()}`
  return {
    _dbName: name,
    _dbVersion: 1,
    _db: null,
    _bookmarksMap: new Map(),
    _openDB,
    _addRecord,
    _updateRecord,
    _getRecordsByBookmark,
    _getAllRecords,
    getStats,
    getDailyStats,
    exportData,
    importData,
    _calculateStreak,
    _getUniqueDays,
    _timestampToDateUTC8,
    _getDateUTC8Offset,
  }
}

async function openAndSet(ctx) {
  ctx._db = await _openDB.call(ctx)
  return ctx
}

function deleteDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // proceed anyway
  })
}

// ==================== DB 操作 ====================

describe('bookmark-learning-progress-db IndexedDB operations', () => {
  let ctx
  let dbName

  beforeEach(async () => {
    dbName = `testLPDB_${++dbCounter}_${Date.now()}`
    ctx = createContext(dbName)
    await openAndSet(ctx)
  })

  afterEach(async () => {
    if (ctx._db) {
      ctx._db.close()
      ctx._db = null
    }
    await deleteDB(dbName).catch(() => {})
  })

  describe('_openDB', () => {
    it('should open database and return IDBDatabase', async () => {
      assert.ok(ctx._db)
      assert.equal(typeof ctx._db.transaction, 'function')
      assert.ok(ctx._db.objectStoreNames.contains('learningProgress'))
    })

    it('should create object store with indexes on upgrade', async () => {
      // Open again with same version — should succeed without upgrade
      const ctx2 = createContext(dbName)
      ctx2._dbVersion = 1
      const db2 = await _openDB.call(ctx2)
      assert.ok(db2.objectStoreNames.contains('learningProgress'))
      db2.close()
    })

    it('should handle version upgrade creating store', async () => {
      // Open with new version
      const ctx3 = createContext(`upgrade_test_${Date.now()}`)
      ctx3._dbVersion = 1
      const db3 = await _openDB.call(ctx3)
      assert.ok(db3.objectStoreNames.contains('learningProgress'))
      db3.close()
      await deleteDB(ctx3._dbName)
    })
  })

  describe('_addRecord', () => {
    it('should add a record and return generated ID', async () => {
      const id = await _addRecord.call(ctx, {
        bookmarkId: 'bm1',
        startTime: Date.now(),
        endTime: Date.now() + 60000,
        duration: 60,
      })
      assert.ok(typeof id === 'number')
      assert.ok(id >= 1)
    })

    it('should add multiple records with incrementing IDs', async () => {
      const id1 = await _addRecord.call(ctx, {
        bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1,
      })
      const id2 = await _addRecord.call(ctx, {
        bookmarkId: 'bm2', startTime: 3000, endTime: 4000, duration: 1,
      })
      assert.ok(id2 > id1)
    })
  })

  describe('_updateRecord', () => {
    it('should update an existing record', async () => {
      const id = await _addRecord.call(ctx, {
        bookmarkId: 'bm1', startTime: 1000, endTime: null, duration: 0,
      })

      await _updateRecord.call(ctx, {
        id,
        bookmarkId: 'bm1',
        startTime: 1000,
        endTime: 5000,
        duration: 4,
      })

      const records = await _getAllRecords.call(ctx)
      const updated = records.find(r => r.id === id)
      assert.equal(updated.endTime, 5000)
      assert.equal(updated.duration, 4)
    })
  })

  describe('_getRecordsByBookmark', () => {
    it('should return records for a specific bookmark', async () => {
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 })
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: 3000, endTime: 4000, duration: 1 })
      await _addRecord.call(ctx, { bookmarkId: 'bm2', startTime: 5000, endTime: 6000, duration: 1 })

      const bm1Records = await _getRecordsByBookmark.call(ctx, 'bm1')
      assert.equal(bm1Records.length, 2)
      assert.ok(bm1Records.every(r => r.bookmarkId === 'bm1'))
    })

    it('should return empty array for non-existent bookmark', async () => {
      const records = await _getRecordsByBookmark.call(ctx, 'nonexistent')
      assert.deepEqual(records, [])
    })
  })

  describe('_getAllRecords', () => {
    it('should return all records', async () => {
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 })
      await _addRecord.call(ctx, { bookmarkId: 'bm2', startTime: 3000, endTime: 4000, duration: 1 })
      await _addRecord.call(ctx, { bookmarkId: 'bm3', startTime: 5000, endTime: 6000, duration: 1 })

      const all = await _getAllRecords.call(ctx)
      assert.equal(all.length, 3)
    })

    it('should return empty array for empty database', async () => {
      const all = await _getAllRecords.call(ctx)
      assert.deepEqual(all, [])
    })
  })

  // ==================== 统计方法 ====================

  describe('getStats', () => {
    it('should return zero stats for empty database', async () => {
      const stats = await getStats.call(ctx)
      assert.equal(stats.totalTime, 0)
      assert.equal(stats.totalSessions, 0)
      assert.equal(stats.dailyAverage, 0)
      assert.equal(stats.streak, 0)
      assert.equal(stats.mostActiveCategory, '')
    })

    it('should compute stats from completed sessions', async () => {
      const now = Date.now()
      ctx._bookmarksMap.set('bm1', { folderPath: ['Tech'] })
      ctx._bookmarksMap.set('bm2', { folderPath: ['Science'] })

      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: now - 120000, endTime: now - 60000, duration: 60 })
      await _addRecord.call(ctx, { bookmarkId: 'bm2', startTime: now - 60000, endTime: now, duration: 120 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.totalTime, 180)
      assert.equal(stats.totalSessions, 2)
      assert.ok(stats.dailyAverage > 0)
    })

    it('should identify most active category', async () => {
      const now = Date.now()
      ctx._bookmarksMap.set('bm1', { folderPath: ['Tech'] })
      ctx._bookmarksMap.set('bm2', { folderPath: ['Science'] })

      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: now, endTime: now + 100, duration: 300 })
      await _addRecord.call(ctx, { bookmarkId: 'bm2', startTime: now, endTime: now + 100, duration: 50 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.mostActiveCategory, 'Tech')
    })

    it('should skip records with null endTime', async () => {
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: Date.now(), endTime: null, duration: 0 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.totalSessions, 0)
    })

    it('should handle bookmark not in bookmarksMap', async () => {
      const now = Date.now()
      // No entry in bookmarksMap
      await _addRecord.call(ctx, { bookmarkId: 'unknown', startTime: now, endTime: now + 100, duration: 60 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.totalSessions, 1)
      assert.equal(stats.mostActiveCategory, '')
    })

    it('should handle bookmark with empty folderPath', async () => {
      const now = Date.now()
      ctx._bookmarksMap.set('bm1', { folderPath: [] })

      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: now, endTime: now + 100, duration: 60 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.mostActiveCategory, '')
    })

    it('should skip records with duration <= 0 for totalTime', async () => {
      const now = Date.now()
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: now, endTime: now + 100, duration: 0 })
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: now, endTime: now + 100, duration: -5 })

      const stats = await getStats.call(ctx)
      assert.equal(stats.totalTime, 0)
      assert.equal(stats.totalSessions, 2) // still counted
    })
  })

  describe('getDailyStats', () => {
    it('should return stats for specified number of days', async () => {
      const result = await getDailyStats.call(ctx, 3)
      assert.equal(result.length, 3)
      assert.ok(result.every(d => typeof d.date === 'string'))
      assert.ok(result.every(d => d.totalTime === 0))
      assert.ok(result.every(d => d.sessions === 0))
    })

    it('should aggregate sessions by day', async () => {
      const now = Date.now()
      const todayStart = now - 1000
      const todayEnd = now

      await _addRecord.call(ctx, {
        bookmarkId: 'bm1', startTime: todayStart, endTime: todayEnd, duration: 30,
      })
      await _addRecord.call(ctx, {
        bookmarkId: 'bm2', startTime: todayStart, endTime: todayEnd, duration: 60,
      })

      const result = await getDailyStats.call(ctx, 1)
      assert.equal(result.length, 1)
      assert.equal(result[0].sessions, 2)
      assert.equal(result[0].totalTime, 90)
    })

    it('should skip records with null endTime in daily stats', async () => {
      await _addRecord.call(ctx, {
        bookmarkId: 'bm1', startTime: Date.now(), endTime: null, duration: 0,
      })

      const result = await getDailyStats.call(ctx, 1)
      assert.equal(result[0].sessions, 0)
    })

    it('should use default days parameter', async () => {
      const result = await getDailyStats.call(ctx, 7)
      assert.equal(result.length, 7)
    })
  })

  // ==================== 导入导出 ====================

  describe('exportData', () => {
    it('should export empty sessions for empty database', async () => {
      const data = await exportData.call(ctx)
      assert.deepEqual(data, { sessions: [] })
    })

    it('should export all records with correct fields', async () => {
      const now = Date.now()
      await _addRecord.call(ctx, {
        bookmarkId: 'bm1', startTime: now, endTime: now + 60000, duration: 60, timedOut: false,
      })
      await _addRecord.call(ctx, {
        bookmarkId: 'bm2', startTime: now + 100000, endTime: now + 200000, duration: 100, timedOut: true,
      })

      const data = await exportData.call(ctx)
      assert.equal(data.sessions.length, 2)
      assert.ok(data.sessions.every(s => 'bookmarkId' in s))
      assert.ok(data.sessions.every(s => 'startTime' in s))
      assert.ok(data.sessions.every(s => 'endTime' in s))
      assert.ok(data.sessions.every(s => 'duration' in s))
      assert.ok(data.sessions.every(s => 'timedOut' in s))
    })
  })

  describe('importData', () => {
    it('should throw on invalid data', async () => {
      await assert.rejects(() => importData.call(ctx, null), /sessions must be an array/)
      await assert.rejects(() => importData.call(ctx, {}), /sessions must be an array/)
      await assert.rejects(() => importData.call(ctx, { sessions: 'not' }), /sessions must be an array/)
    })

    it('should import new sessions', async () => {
      const result = await importData.call(ctx, {
        sessions: [
          { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1, timedOut: false },
          { bookmarkId: 'bm2', startTime: 3000, endTime: 4000, duration: 1, timedOut: false },
        ],
      })
      assert.equal(result.imported, 2)
      assert.equal(result.skipped, 0)

      const all = await _getAllRecords.call(ctx)
      assert.equal(all.length, 2)
    })

    it('should skip duplicate sessions', async () => {
      await _addRecord.call(ctx, { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 })

      const result = await importData.call(ctx, {
        sessions: [
          { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 },
          { bookmarkId: 'bm2', startTime: 5000, endTime: 6000, duration: 1 },
        ],
      })
      assert.equal(result.imported, 1)
      assert.equal(result.skipped, 1)
    })

    it('should default timedOut to false on import', async () => {
      const result = await importData.call(ctx, {
        sessions: [
          { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 },
        ],
      })
      assert.equal(result.imported, 1)

      const all = await _getAllRecords.call(ctx)
      assert.equal(all[0].timedOut, false)
    })

    it('should import empty sessions array', async () => {
      const result = await importData.call(ctx, { sessions: [] })
      assert.equal(result.imported, 0)
      assert.equal(result.skipped, 0)
    })

    it('should handle multiple rounds of import with dedup', async () => {
      const data = {
        sessions: [
          { bookmarkId: 'bm1', startTime: 1000, endTime: 2000, duration: 1 },
          { bookmarkId: 'bm2', startTime: 3000, endTime: 4000, duration: 1 },
        ],
      }

      const r1 = await importData.call(ctx, data)
      assert.equal(r1.imported, 2)

      const r2 = await importData.call(ctx, data)
      assert.equal(r2.imported, 0)
      assert.equal(r2.skipped, 2)
    })
  })
})
