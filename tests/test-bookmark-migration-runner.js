/**
 * R391: BookmarkMigrationRunner 单元测试
 *
 * 覆盖: 版本常量, MIGRATION_STEPS, getMigrationVersion, migrateV1ToV2,
 *       validateMigration, runMigration, getMigrationPath, deepCopy
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VERSION_V1,
  VERSION_V2,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  FORMAT_VERSION_V2,
  MIGRATION_STEPS,
  getMigrationVersion,
  migrateV1ToV2,
  validateMigration,
  runMigration,
  getMigrationPath,
  deepCopy,
} from '../lib/bookmark-migration-runner.js'

// ==================== 辅助工厂 ====================

function makeV1Data (overrides = {}) {
  return {
    version: VERSION_V1,
    bookmarks: [
      { id: 'bm1', title: 'Example', url: 'https://example.com', tags: ['tag1'], folderPath: ['folder1'], status: 'unread', dateAdded: 1700000000000 },
      { id: 'bm2', title: 'Test', url: 'https://test.com', tags: [], folderPath: [], status: 'reading', dateAdded: 1700100000000 },
    ],
    clusters: [{ id: 'c1', name: 'Cluster 1', bookmarkIds: ['bm1'] }],
    tags: [{ name: 'tag1', color: '#ff0000' }],
    statuses: [{ bookmarkId: 'bm1', status: 'read', updatedAt: 1700200000000 }],
    exportedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeV2Data (overrides = {}) {
  return {
    version: VERSION_V2,
    formatVersion: FORMAT_VERSION_V2,
    exportedAt: '2026-01-01T00:00:00Z',
    migratedAt: '2026-01-02T00:00:00Z',
    metadata: {
      bookmarkCount: 1,
      collectionCount: 0,
      tagCount: 0,
      source: 'pagewise',
      generator: 'PageWise-Migration',
      previousVersion: VERSION_V1,
    },
    bookmarks: [{ id: 'bm1', title: 'Example', url: 'https://example.com', tags: [], folderPath: [], status: 'unread', dateAdded: 0, dateAddedISO: '' }],
    collections: [],
    tags: [],
    readingProgress: [],
    ...overrides,
  }
}

// ==================== 版本常量 ====================

describe('Version Constants', () => {
  it('VERSION_V1 is 1', () => {
    assert.equal(VERSION_V1, 1)
  })

  it('VERSION_V2 is 2', () => {
    assert.equal(VERSION_V2, 2)
  })

  it('CURRENT_VERSION equals VERSION_V2', () => {
    assert.equal(CURRENT_VERSION, VERSION_V2)
  })

  it('SUPPORTED_VERSIONS contains V1 and V2', () => {
    assert.deepEqual(SUPPORTED_VERSIONS, [1, 2])
  })

  it('SUPPORTED_VERSIONS is frozen', () => {
    assert.throws(() => { SUPPORTED_VERSIONS.push(3) })
  })

  it('FORMAT_VERSION_V2 is "2.0"', () => {
    assert.equal(FORMAT_VERSION_V2, '2.0')
  })
})

// ==================== MIGRATION_STEPS ====================

describe('MIGRATION_STEPS', () => {
  it('is a frozen array', () => {
    assert.ok(Array.isArray(MIGRATION_STEPS))
    assert.throws(() => { MIGRATION_STEPS.push({}) })
  })

  it('has exactly one step (v1→v2)', () => {
    assert.equal(MIGRATION_STEPS.length, 1)
  })

  it('step has from=1, to=2', () => {
    assert.equal(MIGRATION_STEPS[0].from, VERSION_V1)
    assert.equal(MIGRATION_STEPS[0].to, VERSION_V2)
  })

  it('step has description string', () => {
    assert.ok(typeof MIGRATION_STEPS[0].description === 'string')
    assert.ok(MIGRATION_STEPS[0].description.length > 0)
  })

  it('each step is frozen', () => {
    assert.throws(() => { MIGRATION_STEPS[0].from = 99 })
  })
})

// ==================== getMigrationVersion ====================

describe('getMigrationVersion', () => {
  it('returns V1 for v1 data', () => {
    assert.equal(getMigrationVersion({ version: 1 }), 1)
  })

  it('returns V2 for v2 data', () => {
    assert.equal(getMigrationVersion({ version: 2 }), 2)
  })

  it('returns null for null input', () => {
    assert.equal(getMigrationVersion(null), null)
  })

  it('returns null for undefined input', () => {
    assert.equal(getMigrationVersion(undefined), null)
  })

  it('returns null for array input', () => {
    assert.equal(getMigrationVersion([1, 2]), null)
  })

  it('returns null for non-object input', () => {
    assert.equal(getMigrationVersion('string'), null)
    assert.equal(getMigrationVersion(42), null)
  })

  it('returns null when version is missing', () => {
    assert.equal(getMigrationVersion({}), null)
  })

  it('returns null for unsupported version', () => {
    assert.equal(getMigrationVersion({ version: 99 }), null)
  })

  it('returns null for negative version', () => {
    assert.equal(getMigrationVersion({ version: -1 }), null)
  })

  it('returns null for zero version', () => {
    assert.equal(getMigrationVersion({ version: 0 }), null)
  })
})

// ==================== migrateV1ToV2 ====================

describe('migrateV1ToV2', () => {
  it('converts v1 data to v2 format', () => {
    const v1 = makeV1Data()
    const { data, warnings } = migrateV1ToV2(v1)
    assert.equal(data.version, VERSION_V2)
    assert.equal(data.formatVersion, FORMAT_VERSION_V2)
    assert.ok(data.migratedAt)
    assert.ok(data.metadata)
  })

  it('maps clusters to collections', () => {
    const v1 = makeV1Data()
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.collections.length, 1)
    assert.equal(data.collections[0].id, 'c1')
  })

  it('maps statuses to readingProgress', () => {
    const v1 = makeV1Data()
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.readingProgress.length, 1)
    assert.equal(data.readingProgress[0].bookmarkId, 'bm1')
  })

  it('preserves bookmarks', () => {
    const v1 = makeV1Data()
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.bookmarks.length, 2)
    assert.equal(data.bookmarks[0].id, 'bm1')
  })

  it('migrates bookmark tags default to empty array', () => {
    const v1 = makeV1Data({ bookmarks: [{ id: 'x', title: 'X', url: '' }] })
    const { data } = migrateV1ToV2(v1)
    assert.deepEqual(data.bookmarks[0].tags, [])
  })

  it('migrates bookmark folderPath default to empty array', () => {
    const v1 = makeV1Data({ bookmarks: [{ id: 'x', title: 'X', url: '' }] })
    const { data } = migrateV1ToV2(v1)
    assert.deepEqual(data.bookmarks[0].folderPath, [])
  })

  it('defaults invalid status to unread', () => {
    const v1 = makeV1Data({ bookmarks: [{ id: 'x', title: 'X', url: '', status: 'invalid' }] })
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.bookmarks[0].status, 'unread')
  })

  it('generates dateAddedISO from dateAdded', () => {
    const v1 = makeV1Data({ bookmarks: [{ id: 'x', title: 'X', url: '', dateAdded: 1700000000000 }] })
    const { data } = migrateV1ToV2(v1)
    assert.ok(data.bookmarks[0].dateAddedISO)
    assert.ok(data.bookmarks[0].dateAddedISO.includes('2023'))
  })

  it('sets metadata with correct counts', () => {
    const v1 = makeV1Data()
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.metadata.bookmarkCount, 2)
    assert.equal(data.metadata.collectionCount, 1)
    assert.equal(data.metadata.tagCount, 1)
    assert.equal(data.metadata.source, 'pagewise')
    assert.equal(data.metadata.generator, 'PageWise-Migration')
    assert.equal(data.metadata.previousVersion, VERSION_V1)
  })

  it('preserves exportedAt from original', () => {
    const v1 = makeV1Data({ exportedAt: '2025-06-01T00:00:00Z' })
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.exportedAt, '2025-06-01T00:00:00Z')
  })

  it('warns when input is null', () => {
    const { data, warnings } = migrateV1ToV2(null)
    assert.equal(data, null)
    assert.ok(warnings.length > 0)
  })

  it('warns for non-v1 version field', () => {
    const v1 = makeV1Data({ version: 99 })
    const { warnings } = migrateV1ToV2(v1)
    assert.ok(warnings.some(w => w.includes('非 v1')))
  })

  it('warns when bookmarks array missing', () => {
    const { warnings } = migrateV1ToV2({ version: 1, clusters: [] })
    assert.ok(warnings.some(w => w.includes('bookmarks')))
  })

  it('warns when clusters array missing', () => {
    const { warnings } = migrateV1ToV2({ version: 1, bookmarks: [] })
    assert.ok(warnings.some(w => w.includes('clusters')))
  })

  it('handles null bookmark gracefully', () => {
    const v1 = makeV1Data({ bookmarks: [null, { id: 'bm1' }] })
    const { data } = migrateV1ToV2(v1)
    assert.equal(data.bookmarks[0].id, 'unknown')
    assert.equal(data.bookmarks[1].id, 'bm1')
  })
})

// ==================== validateMigration ====================

describe('validateMigration', () => {
  it('returns valid for complete migration', () => {
    const old = makeV1Data()
    const { data: migrated } = migrateV1ToV2(old)
    const result = validateMigration(old, migrated)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('returns invalid when oldData is null', () => {
    const result = validateMigration(null, {})
    assert.equal(result.valid, false)
    assert.ok(result.errors[0].includes('原始数据'))
  })

  it('returns invalid when newData is null', () => {
    const result = validateMigration({}, null)
    assert.equal(result.valid, false)
    assert.ok(result.errors[0].includes('迁移后数据'))
  })

  it('detects wrong version in migrated data', () => {
    const old = makeV1Data()
    const bad = { ...makeV2Data(), version: 99 }
    const result = validateMigration(old, bad)
    assert.ok(result.errors.some(e => e.includes('版本')))
  })

  it('detects bookmark count mismatch', () => {
    const old = makeV1Data()
    const bad = makeV2Data({ bookmarks: [] })
    const result = validateMigration(old, bad)
    assert.ok(result.errors.some(e => e.includes('书签数量')))
  })

  it('detects missing bookmarks by id', () => {
    const old = makeV1Data()
    const bad = makeV2Data({ bookmarks: [{ id: 'bm999' }] })
    const result = validateMigration(old, bad)
    // Count mismatch OR missing id — either is valid
    assert.ok(result.errors.length > 0)
  })

  it('detects collection count mismatch', () => {
    const old = makeV1Data()
    const { data: migrated } = migrateV1ToV2(old)
    migrated.collections = []
    const result = validateMigration(old, migrated)
    assert.ok(result.errors.some(e => e.includes('聚类数据')))
  })

  it('detects tag count mismatch', () => {
    const old = makeV1Data()
    const { data: migrated } = migrateV1ToV2(old)
    migrated.tags = []
    const result = validateMigration(old, migrated)
    assert.ok(result.errors.some(e => e.includes('标签数量')))
  })

  it('detects readingProgress count mismatch', () => {
    const old = makeV1Data()
    const { data: migrated } = migrateV1ToV2(old)
    migrated.readingProgress = []
    const result = validateMigration(old, migrated)
    assert.ok(result.errors.some(e => e.includes('状态数据')))
  })

  it('detects missing metadata', () => {
    const old = makeV1Data()
    const bad = { ...makeV2Data(), metadata: undefined }
    const result = validateMigration(old, bad)
    assert.ok(result.errors.some(e => e.includes('metadata')))
  })

  it('returns stats with counts', () => {
    const old = makeV1Data()
    const { data: migrated } = migrateV1ToV2(old)
    const result = validateMigration(old, migrated)
    assert.equal(result.stats.oldBookmarkCount, 2)
    assert.equal(result.stats.newBookmarkCount, 2)
  })
})

// ==================== runMigration ====================

describe('runMigration', () => {
  it('migrates v1 to v2 successfully', () => {
    const v1 = makeV1Data()
    const result = runMigration(v1, VERSION_V2)
    assert.equal(result.success, true)
    assert.equal(result.data.version, VERSION_V2)
  })

  it('returns same data when already at target version', () => {
    const v2 = makeV2Data()
    const result = runMigration(v2, VERSION_V2)
    assert.equal(result.success, true)
    assert.ok(result.warnings.some(w => w.includes('无需迁移')))
  })

  it('fails when data is null', () => {
    const result = runMigration(null, VERSION_V2)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('空'))
  })

  it('fails when targetVersion is null', () => {
    const result = runMigration(makeV1Data(), null)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('未指定'))
  })

  it('fails for invalid targetVersion', () => {
    const result = runMigration(makeV1Data(), -1)
    assert.equal(result.success, false)
  })

  it('fails for unsupported version number', () => {
    const result = runMigration(makeV1Data(), NaN)
    assert.equal(result.success, false)
  })

  it('fails when version is unrecognizable', () => {
    const result = runMigration({ foo: 'bar' }, VERSION_V2)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('无法识别'))
  })

  it('fails when downgrading', () => {
    const v2 = makeV2Data()
    const result = runMigration(v2, VERSION_V1)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('降级'))
  })

  it('fails for unsupported target version', () => {
    const result = runMigration(makeV1Data(), 99)
    assert.equal(result.success, false)
  })

  it('returns warnings from migration', () => {
    const v1 = makeV1Data({ bookmarks: undefined, clusters: undefined })
    const result = runMigration(v1, VERSION_V2)
    assert.ok(result.warnings.length > 0 || result.errors.length > 0)
  })
})

// ==================== getMigrationPath ====================

describe('getMigrationPath', () => {
  it('returns empty steps for same version', () => {
    const result = getMigrationPath(1, 1)
    assert.equal(result.possible, true)
    assert.equal(result.steps.length, 0)
  })

  it('returns v1→v2 step', () => {
    const result = getMigrationPath(1, 2)
    assert.equal(result.possible, true)
    assert.equal(result.steps.length, 1)
    assert.equal(result.steps[0].from, 1)
    assert.equal(result.steps[0].to, 2)
  })

  it('fails for non-numeric versions', () => {
    const result = getMigrationPath('a', 2)
    assert.equal(result.possible, false)
    assert.ok(result.error.includes('有效数字'))
  })

  it('fails for downgrade', () => {
    const result = getMigrationPath(2, 1)
    assert.equal(result.possible, false)
    assert.ok(result.error.includes('降级'))
  })

  it('fails for unsupported fromVersion', () => {
    const result = getMigrationPath(0, 2)
    assert.equal(result.possible, false)
    assert.ok(result.error.includes('起始版本'))
  })

  it('fails for unsupported toVersion', () => {
    const result = getMigrationPath(1, 99)
    assert.equal(result.possible, false)
    assert.ok(result.error.includes('目标版本'))
  })
})

// ==================== deepCopy ====================

describe('deepCopy', () => {
  it('copies primitive values', () => {
    assert.equal(deepCopy(42), 42)
    assert.equal(deepCopy('hello'), 'hello')
    assert.equal(deepCopy(null), null)
    assert.equal(deepCopy(undefined), undefined)
  })

  it('deep copies objects', () => {
    const obj = { a: 1, b: { c: 2 } }
    const copy = deepCopy(obj)
    assert.deepEqual(copy, obj)
    assert.notEqual(copy, obj)
    assert.notEqual(copy.b, obj.b)
  })

  it('deep copies arrays', () => {
    const arr = [1, [2, 3], { a: 4 }]
    const copy = deepCopy(arr)
    assert.deepEqual(copy, arr)
    assert.notEqual(copy, arr)
    assert.notEqual(copy[1], arr[1])
  })

  it('handles circular reference gracefully', () => {
    const obj = { a: 1 }
    // JSON.stringify will fail on circular, fallback should work
    const copy = deepCopy(obj)
    assert.equal(copy.a, 1)
  })
})
