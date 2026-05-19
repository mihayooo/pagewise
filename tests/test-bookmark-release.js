/**
 * 测试 lib/bookmark-release.js — 版本发布管理
 *
 * 测试范围:
 *   validateRelease (发布验证) / generateReleaseNotes (发布说明) /
 *   checkDependencies (依赖检查) / getVersionInfo (版本信息) /
 *   isValidSemver / compareVersions / RELEASE_CHECKLIST
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  validateRelease,
  generateReleaseNotes,
  checkDependencies,
  getVersionInfo,
  isValidSemver,
  compareVersions,
  RELEASE_CHECKLIST,
} = await import('../lib/bookmark-release.js')

// ==================== 辅助: 构造 manifest / packageJson ====================

function createManifest(overrides = {}) {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    version: '2.4.0',
    default_locale: 'zh_CN',
    description: '智阅 PageWise 扩展',
    author: 'PageWise',
    permissions: ['storage', 'sidePanel', 'contextMenus', 'tabs', 'activeTab', 'bookmarks'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    background: {
      service_worker: 'background/service-worker.js',
      type: 'module',
    },
    ...overrides,
  }
}

function createPackageJson(overrides = {}) {
  return {
    name: 'pagewise',
    version: '2.4.0',
    private: true,
    type: 'module',
    description: '智阅 PageWise - Chrome 浏览器扩展',
    dependencies: {
      'openai': '^4.0.0',
    },
    devDependencies: {
      'eslint': '^8.0.0',
    },
    ...overrides,
  }
}

// ==================== 测试 ====================

describe('BookmarkRelease', () => {

  // ─── RELEASE_CHECKLIST ──────────────────────────────────────────────────────

  describe('RELEASE_CHECKLIST', () => {
    it('1. 发布检查清单应为非空数组', () => {
      assert.ok(Array.isArray(RELEASE_CHECKLIST), '应为数组')
      assert.ok(RELEASE_CHECKLIST.length >= 5, '清单至少 5 项')
    })

    it('2. 清单项应包含 id / label / category', () => {
      for (const item of RELEASE_CHECKLIST) {
        assert.ok(typeof item.id === 'string' && item.id.length > 0, `id 应为非空字符串: ${JSON.stringify(item)}`)
        assert.ok(typeof item.label === 'string' && item.label.length > 0, `label 应为非空字符串: ${JSON.stringify(item)}`)
        assert.ok(typeof item.category === 'string' && item.category.length > 0, `category 应为非空字符串: ${JSON.stringify(item)}`)
      }
    })

    it('3. 清单项 id 不应重复', () => {
      const ids = RELEASE_CHECKLIST.map(item => item.id)
      const unique = new Set(ids)
      assert.equal(ids.length, unique.size, '清单 id 应唯一')
    })
  })

  // ─── isValidSemver ──────────────────────────────────────────────────────────

  describe('isValidSemver', () => {
    it('4. 有效 semver 版本号', () => {
      assert.ok(isValidSemver('1.0.0'), '1.0.0 应有效')
      assert.ok(isValidSemver('0.0.1'), '0.0.1 应有效')
      assert.ok(isValidSemver('10.20.30'), '10.20.30 应有效')
      assert.ok(isValidSemver('1.0.0-alpha.1'), '1.0.0-alpha.1 应有效')
      assert.ok(isValidSemver('1.0.0+build.123'), '1.0.0+build.123 应有效')
    })

    it('5. 无效 semver 版本号', () => {
      assert.ok(!isValidSemver(''), '空字符串应无效')
      assert.ok(!isValidSemver(null), 'null 应无效')
      assert.ok(!isValidSemver(undefined), 'undefined 应无效')
      assert.ok(!isValidSemver('1.0'), '1.0 应无效 (缺少 patch)')
      assert.ok(!isValidSemver('v1.0.0'), 'v1.0.0 应无效 (含 v 前缀)')
      assert.ok(!isValidSemver('abc'), 'abc 应无效')
      assert.ok(!isValidSemver('1.0.0.0'), '1.0.0.0 应无效 (四段)')
    })
  })

  // ─── compareVersions ────────────────────────────────────────────────────────

  describe('compareVersions', () => {
    it('6. 版本比较: 大于/等于/小于', () => {
      assert.equal(compareVersions('1.0.0', '1.0.0'), 0, '相等应返回 0')
      assert.equal(compareVersions('2.0.0', '1.0.0'), 1, '大于应返回 1')
      assert.equal(compareVersions('1.0.0', '2.0.0'), -1, '小于应返回 -1')
      assert.equal(compareVersions('1.2.3', '1.2.2'), 1, 'patch 比较')
      assert.equal(compareVersions('1.2.2', '1.2.3'), -1, 'patch 比较')
      assert.equal(compareVersions('1.3.0', '1.2.9'), 1, 'minor 比较')
    })

    it('7. compareVersions 处理空值', () => {
      assert.equal(compareVersions(null, '1.0.0'), 0, 'null 应返回 0')
      assert.equal(compareVersions('1.0.0', null), 0, 'null 应返回 0')
      assert.equal(compareVersions(undefined, '1.0.0'), 0, 'undefined 应返回 0')
    })
  })

  // ─── validateRelease ────────────────────────────────────────────────────────

  describe('validateRelease', () => {
    it('8. 正常 manifest/package.json 应通过验证 (ready)', () => {
      const manifest = createManifest()
      const packageJson = createPackageJson()
      const result = validateRelease(manifest, packageJson)

      assert.ok(result.ready, '正常配置应 ready')
      assert.ok(Array.isArray(result.checks), 'checks 应为数组')
      assert.ok(result.checks.length >= 5, 'checks 至少 5 项')
      assert.ok(result.checks.every(c => c.passed), '所有检查应通过')
    })

    it('9. 缺少图标应不通过验证', () => {
      const manifest = createManifest({ icons: {} })
      const packageJson = createPackageJson()
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '缺少图标应不 ready')
      const iconCheck = result.checks.find(c => c.id === 'icons-present')
      assert.ok(iconCheck, '应有 icons-present 检查')
      assert.ok(!iconCheck.passed, '图标检查应失败')
      assert.ok(iconCheck.message.includes('缺少'), '消息应包含"缺少"')
    })

    it('10. 版本不一致应不通过验证', () => {
      const manifest = createManifest({ version: '2.4.0' })
      const packageJson = createPackageJson({ version: '2.5.0' })
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '版本不一致应不 ready')
      const versionCheck = result.checks.find(c => c.id === 'version-match')
      assert.ok(!versionCheck.passed, '版本匹配检查应失败')
    })

    it('11. 无效版本号应不通过验证', () => {
      const manifest = createManifest({ version: 'not-a-version' })
      const packageJson = createPackageJson({ version: 'not-a-version' })
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '无效版本号应不 ready')
      const semverCheck = result.checks.find(c => c.id === 'version-valid')
      assert.ok(!semverCheck.passed, 'semver 检查应失败')
    })

    it('12. null/无效输入处理', () => {
      const r1 = validateRelease(null, createPackageJson())
      assert.ok(!r1.ready, 'null manifest 应不 ready')

      const r2 = validateRelease(createManifest(), null)
      assert.ok(!r2.ready, 'null packageJson 应不 ready')

      const r3 = validateRelease(null, null)
      assert.ok(!r3.ready, '两者都 null 应不 ready')
    })

    it('13. 缺少 CSP 应不通过', () => {
      const manifest = createManifest({ content_security_policy: undefined })
      const result = validateRelease(manifest, createPackageJson())

      assert.ok(!result.ready, '缺 CSP 应不 ready')
      const cspCheck = result.checks.find(c => c.id === 'csp-configured')
      assert.ok(!cspCheck.passed, 'CSP 检查应失败')
    })

    it('14. 缺少权限应不通过', () => {
      const manifest = createManifest({ permissions: [] })
      const result = validateRelease(manifest, createPackageJson())

      assert.ok(!result.ready, '缺权限应不 ready')
      const permCheck = result.checks.find(c => c.id === 'permissions-valid')
      assert.ok(!permCheck.passed, '权限检查应失败')
    })
  })

  // ─── generateReleaseNotes ───────────────────────────────────────────────────

  describe('generateReleaseNotes', () => {
    it('15. 单个版本发布说明格式正确', () => {
      const changelog = {
        version: '2.5.0',
        date: '2026-05-13',
        added: ['BookmarkRelease 发布管理模块', '发布检查清单'],
        fixed: ['修复书签排序问题'],
      }
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('## 2.5.0 (2026-05-13)'), '应有版本标题')
      assert.ok(notes.includes('### ✅ 新增'), '应有新增部分')
      assert.ok(notes.includes('- BookmarkRelease 发布管理模块'), '应列出新增项')
      assert.ok(notes.includes('### 🐛 修复'), '应有修复部分')
      assert.ok(notes.includes('- 修复书签排序问题'), '应列出修复项')
    })

    it('16. 多个版本发布说明', () => {
      const changelog = [
        { version: '2.5.0', added: ['功能 A'] },
        { version: '2.4.1', fixed: ['Bug B'] },
      ]
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('## 2.5.0'), '应含 v2.5.0')
      assert.ok(notes.includes('## 2.4.1'), '应含 v2.4.1')
      assert.ok(notes.includes('功能 A'), '应含新增内容')
      assert.ok(notes.includes('Bug B'), '应含修复内容')
    })

    it('17. 空/无内容返回空字符串', () => {
      assert.equal(generateReleaseNotes(null), '', 'null 应返回空')
      assert.equal(generateReleaseNotes(undefined), '', 'undefined 应返回空')
      assert.equal(generateReleaseNotes([]), '', '空数组应返回空')
    })

    it('18. 无分类条目显示"暂无变更记录"', () => {
      const changelog = { version: '2.6.0' }
      const notes = generateReleaseNotes(changelog)
      assert.ok(notes.includes('暂无变更记录'), '应显示暂无记录')
    })

    it('19. 支持 added/changed/fixed/removed 所有分类', () => {
      const changelog = {
        version: '3.0.0',
        date: '2026-06-01',
        added: ['新功能 A'],
        changed: ['变更 B'],
        fixed: ['修复 C'],
        removed: ['移除 D'],
      }
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('### ✅ 新增'), '应有新增')
      assert.ok(notes.includes('### 🔄 变更'), '应有变更')
      assert.ok(notes.includes('### 🐛 修复'), '应有修复')
      assert.ok(notes.includes('### 🗑️ 移除'), '应有移除')
      assert.ok(notes.includes('- 新功能 A'), '新增内容')
      assert.ok(notes.includes('- 变更 B'), '变更内容')
      assert.ok(notes.includes('- 修复 C'), '修复内容')
      assert.ok(notes.includes('- 移除 D'), '移除内容')
    })
  })

  // ─── checkDependencies ──────────────────────────────────────────────────────

  describe('checkDependencies', () => {
    it('20. 有合法依赖应通过检查', () => {
      const packageJson = {
        dependencies: { 'openai': '^4.0.0' },
        devDependencies: { 'eslint': '^8.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(result.ok, '合法依赖应 ok')
      assert.deepEqual(result.missing, [], '无缺失依赖')
      assert.ok(result.declared.includes('openai'), '应列出 openai')
      assert.ok(result.declared.includes('eslint'), '应列出 eslint')
    })

    it('21. 空版本号依赖应标记为缺失', () => {
      const packageJson = {
        dependencies: { 'openai': '' },
        devDependencies: { 'eslint': '^8.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(!result.ok, '空版本号应不 ok')
      assert.ok(result.missing.includes('openai'), 'openai 应标记为缺失')
    })

    it('22. null/无效输入处理', () => {
      const r1 = checkDependencies(null)
      assert.ok(!r1.ok, 'null 应不 ok')
      assert.deepEqual(r1.declared, [], 'null 应返回空 declared')

      const r2 = checkDependencies(undefined)
      assert.ok(!r2.ok, 'undefined 应不 ok')

      const r3 = checkDependencies('not-object')
      assert.ok(!r3.ok, '字符串应不 ok')
    })

    it('23. 无依赖应正常返回', () => {
      const result = checkDependencies({ name: 'test' })
      assert.ok(result.ok, '无依赖应 ok')
      assert.deepEqual(result.declared, [], '无声明依赖')
      assert.deepEqual(result.missing, [], '无缺失依赖')
    })

    it('24. peerDependencies 和 optionalDependencies 也被检查', () => {
      const packageJson = {
        peerDependencies: { 'react': '>=17.0.0' },
        optionalDependencies: { 'fsevents': '^2.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(result.ok, '合法 peer/optional 应 ok')
      assert.ok(result.declared.includes('react'), '应列出 react')
      assert.ok(result.declared.includes('fsevents'), '应列出 fsevents')
    })
  })

  // ─── getVersionInfo ─────────────────────────────────────────────────────────

  describe('getVersionInfo', () => {
    it('25. 正常获取版本信息', () => {
      const manifest = createManifest()
      const packageJson = createPackageJson()
      const info = getVersionInfo(manifest, packageJson)

      assert.equal(info.manifestVersion, '2.4.0', 'manifest 版本')
      assert.equal(info.packageVersion, '2.4.0', 'package 版本')
      assert.ok(info.versionsMatch, '版本应一致')
      assert.ok(!info.isPreRelease, '不应为预发布')
      assert.equal(info.versionParts.major, 2, 'major')
      assert.equal(info.versionParts.minor, 4, 'minor')
      assert.equal(info.versionParts.patch, 0, 'patch')
      assert.ok(info.manifestVersion3, '应为 Manifest V3')
      assert.ok(info.name.length > 0, '应有名称')
      assert.ok(info.description.length > 0, '应有描述')
      assert.ok(info.author.length > 0, '应有作者')
    })

    it('26. 版本不一致时 versionsMatch 为 false', () => {
      const manifest = createManifest({ version: '2.4.0' })
      const packageJson = createPackageJson({ version: '1.0.0' })
      const info = getVersionInfo(manifest, packageJson)

      assert.ok(!info.versionsMatch, '版本不一致应为 false')
    })

    it('27. 预发布版本检测', () => {
      const manifest = createManifest({ version: '3.0.0-beta.1' })
      const packageJson = createPackageJson({ version: '3.0.0-beta.1' })
      const info = getVersionInfo(manifest, packageJson)

      assert.ok(info.isPreRelease, '含 - 的版本应为预发布')
    })

    it('28. null/空输入处理', () => {
      const info = getVersionInfo(null, null)

      assert.equal(info.manifestVersion, '', 'null manifest 版本应为空')
      assert.equal(info.packageVersion, '', 'null package 版本应为空')
      assert.ok(!info.versionsMatch, '两者为空应不匹配')
      assert.equal(info.versionParts.major, 0, 'major 应为 0')
      assert.equal(info.versionParts.minor, 0, 'minor 应为 0')
      assert.equal(info.versionParts.patch, 0, 'patch 应为 0')
    })

    it('29. 缺少字段的 manifest 处理', () => {
      const info = getVersionInfo({}, {})

      assert.equal(info.manifestVersion, '', '无 version 应为空')
      assert.ok(!info.manifestVersion3, '无 manifest_version 应非 V3')
      assert.equal(info.name, '', '无 name 应为空')
      assert.equal(info.description, '', '无 description 应为空')
      assert.equal(info.author, '', '无 author 应为空')
    })
  })
})

// ============================================================
// 测试合并自 test-bookmark-rc.js (R115 TestSuiteTrim)
// ============================================================

/**
 * tests/test-bookmark-rc.js — 15 bookmark integration tests
 *
 * Cross-module integration tests exercising how bookmark modules
 * cooperate on real-world data flows: import → dedup → stats → export,
 * backup → validate → restore, migration → validation, error handling
 * across boundaries, and manifest store-readiness checks.
 *
 * Modules under test:
 *   bookmark-io, bookmark-dedup, bookmark-stats, bookmark-migration,
 *   bookmark-backup, bookmark-exporter, bookmark-error-handler, bookmark-store-prep
 */

// R118: removed duplicate import statements (describe/it/beforeEach/assert), using top-level declarations

const { BookmarkImportExport } = await import('../lib/bookmark-io.js')
const { BookmarkDedup } = await import('../lib/bookmark-dedup.js')
const { BookmarkStatistics } = await import('../lib/bookmark-stats.js')
const {
  getMigrationVersion, migrateV1ToV2, validateMigration,
  runMigration, getMigrationPath, createMigrationReport,
  checkDataCompatibility, batchMigrate, VERSION_V1, VERSION_V2,
} = await import('../lib/bookmark-migration.js')
const {
  createBackup, validateBackup, restoreBackup, computeChecksum,
} = await import('../lib/bookmark-backup.js')
const {
  BookmarkExporter, exportToNetscape, exportToMarkdown,
  exportToCSV, importFromNetscape, importFromMarkdown,
} = await import('../lib/bookmark-exporter.js')
const {
  classifyError, handleBookmarkError, createErrorBoundary, logError,
  ERROR_CATEGORIES,
} = await import('../lib/bookmark-error-handler.js')
const {
  validateManifest, checkIcons, getStoreListing,
  validateContentSecurityPolicy, checkStoreSubmissionReadiness,
} = await import('../lib/bookmark-store-prep.js')

// ==================== Helpers ====================

function bm(id, title, url, folderPath = [], tags = [], status = 'unread', dateAdded = 0) {
  return { id: String(id), title, url, folderPath, tags, status, dateAdded }
}

const SAMPLE_BOOKMARKS = [
  bm('1', 'MDN Web Docs',    'https://developer.mozilla.org/en-US/',  ['Dev'],     ['docs', 'web']),
  bm('2', 'MDN JavaScript',  'https://developer.mozilla.org/en-US/docs/Web/JavaScript', ['Dev', 'JS'], ['docs', 'js']),
  bm('3', 'GitHub',          'https://github.com/',                   ['Dev'],     ['code']),
  bm('4', 'Hacker News',     'https://news.ycombinator.com/',         ['News'],    ['tech']),
  bm('5', 'HN duplicate',    'https://news.ycombinator.com/',         ['Reading'], ['tech']),      // dup of 4
  bm('6', 'MDN Docs (copy)', 'https://developer.mozilla.org/en-US/',  ['Misc'],    ['reference']), // dup of 1
  bm('7', 'Stack Overflow',  'https://stackoverflow.com/',            ['Dev'],     ['qa']),
]

function validManifest() {
  return {
    manifest_version: 3,
    name: 'PageWise',
    version: '1.0.0',
    description: 'AI-powered reading assistant with bookmark intelligence and knowledge graph.',
    icons: { '16': 'icons/16.png', '48': 'icons/48.png', '128': 'icons/128.png' },
    permissions: ['storage', 'sidePanel', 'tabs', 'bookmarks'],
    background: { service_worker: 'background.js' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    default_locale: 'en',
  }
}

function makeV1Data(bookmarks) {
  return {
    version: 1,
    exportedAt: '2025-01-01T00:00:00.000Z',
    bookmarks: bookmarks || SAMPLE_BOOKMARKS.slice(0, 3),
    clusters: [{ id: 'c1', label: 'Dev' }],
    tags: ['docs', 'web', 'js'],
    statuses: [{ bookmarkId: '1', status: 'read' }],
  }
}

// ==================== Tests ====================

describe('bookmark-rc: cross-module integration', () => {

  // ---- 1 ----
  it('import CSV → dedup → stats counts only unique bookmarks', () => {
    // Export to CSV then re-import via round-trip
    const csv = exportToCSV(SAMPLE_BOOKMARKS)
    const lines = csv.split('\n')
    // Header + 7 data rows
    assert.equal(lines.length, 8)
    assert.ok(lines[0].includes('title'))

    // Dedup on the full set
    const dedup = new BookmarkDedup(SAMPLE_BOOKMARKS)
    const urlGroups = dedup.findByExactUrl()
    // URLs: mdn (1,6), github (3), hn (4,5), stackoverflow (7) → 2 groups with dupes
    assert.equal(urlGroups.length, 2)

    // After batch removal of duplicates, run stats
    const ids = urlGroups.flatMap(g => g.slice(1).map(b => b.id))
    dedup.batchRemove(ids)
    assert.equal(dedup.bookmarks.length, 5)

    const stats = new BookmarkStatistics(dedup.bookmarks)
    const summary = stats.getSummary()
    assert.equal(summary.total, 5)
    assert.ok(summary.uniqueDomains >= 3)
  })

  // ---- 2 ----
  it('Netscape export → re-import preserves URL round-trip', () => {
    const subset = SAMPLE_BOOKMARKS.slice(0, 3)
    const html = exportToNetscape(subset)
    assert.ok(html.includes('<!DOCTYPE NETSCAPE'))

    const reimported = importFromNetscape(html)
    assert.equal(reimported.length, 3)

    const origUrls = new Set(subset.map(b => b.url))
    for (const rb of reimported) {
      assert.ok(origUrls.has(rb.url), `URL ${rb.url} should survive round-trip`)
    }
  })

  // ---- 3 ----
  it('Markdown export → re-import preserves folder hierarchy', () => {
    const subset = SAMPLE_BOOKMARKS.slice(0, 4)
    const md = exportToMarkdown(subset)
    assert.ok(md.startsWith('# Bookmarks'))

    const reimported = importFromMarkdown(md)
    assert.equal(reimported.length, 4)

    // Check folders are preserved
    const devBms = reimported.filter(b => b.folderPath.includes('Dev'))
    assert.ok(devBms.length >= 2, 'Dev folder should have 2+ bookmarks')
    const newsBms = reimported.filter(b => b.folderPath.includes('News'))
    assert.equal(newsBms.length, 1)
  })

  // ---- 4 ----
  it('backup create → validate → restore round-trip with dedup stats', () => {
    // Create backup from deduped data
    const dedup = new BookmarkDedup(SAMPLE_BOOKMARKS)
    const dupes = dedup.findDuplicates()
    const ids = dupes.flatMap(d => d.duplicates.map(x => x.id))
    dedup.batchRemove(ids)

    const result = createBackup(dedup.bookmarks, { description: 'deduped backup' })
    assert.ok(result.success)
    assert.equal(result.backup.bookmarkCount, dedup.bookmarks.length)
    assert.equal(result.backup.data.metadata.description, 'deduped backup')

    // Validate
    const valid = validateBackup(result.backup)
    assert.ok(valid.valid)
    assert.equal(valid.errors.length, 0)

    // Restore
    const restored = restoreBackup(result.backup)
    assert.ok(restored.success)
    assert.equal(restored.bookmarks.length, dedup.bookmarks.length)
    assert.equal(restored.metadata.description, 'deduped backup')

    // Stats on restored data should match
    const stats = new BookmarkStatistics(restored.bookmarks)
    assert.equal(stats.getSummary().total, dedup.bookmarks.length)
  })

  // ---- 5 ----
  it('v1 migration → validate → backup → restore preserves all data', () => {
    const v1 = makeV1Data()
    const migrated = runMigration(v1, VERSION_V2)
    assert.ok(migrated.success)
    assert.equal(migrated.data.version, VERSION_V2)
    assert.equal(migrated.data.bookmarks.length, v1.bookmarks.length)
    assert.ok(migrated.data.metadata)

    // Validate migration integrity
    const valid = validateMigration(v1, migrated.data)
    assert.ok(valid.valid, `Migration errors: ${valid.errors.join(', ')}`)
    assert.equal(valid.stats.oldBookmarkCount, valid.stats.newBookmarkCount)

    // Backup the migrated data
    const backupResult = createBackup(migrated.data.bookmarks)
    assert.ok(backupResult.success)

    // Restore and verify count
    const restored = restoreBackup(backupResult.backup)
    assert.ok(restored.success)
    assert.equal(restored.bookmarks.length, v1.bookmarks.length)
  })

  // ---- 6 ----
  it('IO import/export JSON round-trip with full graph data', () => {
    const data = {
      bookmarks: SAMPLE_BOOKMARKS.slice(0, 3),
      clusters: [{ id: 'c1' }],
      tags: ['docs'],
      statuses: [],
    }
    const io = new BookmarkImportExport(data)
    const jsonStr = io.exportJSON()
    assert.ok(jsonStr.includes('"version": 1'))

    const io2 = new BookmarkImportExport()
    const imported = io2.importFromJSON(jsonStr)
    assert.equal(imported.bookmarks.length, 3)
    assert.equal(imported.clusters.length, 1)
    assert.equal(imported.tags.length, 1)
  })

  // ---- 7 ----
  it('IO Chrome HTML import → export → dedup full pipeline', () => {
    const chromeHTML = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<DL><p>',
      '    <DT><H3>Dev</H3>',
      '    <DL><p>',
      '        <DT><A HREF="https://example.com/" ADD_DATE="1700000000">Example</A>',
      '        <DT><A HREF="https://example.com/" ADD_DATE="1700000100">Example Copy</A>',
      '    </DL><p>',
      '    <DT><A HREF="https://other.com/" ADD_DATE="1700000200">Other</A>',
      '</DL><p>',
    ].join('\n')

    const io = new BookmarkImportExport()
    const imported = io.importFromChromeHTML(chromeHTML)
    assert.equal(imported.length, 3)

    // Dedup: two bookmarks with same URL
    const dedup = new BookmarkDedup(imported)
    const urlGroups = dedup.findByExactUrl()
    assert.ok(urlGroups.length >= 1, 'Should detect duplicate URL group')

    // Stats on deduped
    dedup.batchRemove(urlGroups.flatMap(g => g.slice(1).map(b => b.id)))
    const stats = new BookmarkStatistics(dedup.bookmarks)
    assert.equal(stats.getSummary().total, 2)
  })

  // ---- 8 ----
  it('error handler wraps async dedup + stats pipeline with fallback', async () => {
    const handler = handleBookmarkError(
      new TypeError('invalid bookmark format'),
      { operation: 'dedup', component: 'BookmarkDedup' }
    )
    assert.equal(handler.category, ERROR_CATEGORIES.VALIDATION)
    assert.equal(handler.context.operation, 'dedup')
    assert.ok(handler.recovery.length > 0)

    // createErrorBoundary wraps a failing stats computation
    const failingStats = async () => { throw new Error('storage quota exceeded') }
    const fallback = (err) => {
      const classified = classifyError(err)
      return { category: classified, fallbackUsed: true }
    }

    const wrapped = createErrorBoundary(failingStats, fallback)
    const result = await wrapped()
    assert.equal(result.category, ERROR_CATEGORIES.STORAGE)
    assert.equal(result.fallbackUsed, true)
  })

  // ---- 9 ----
  it('classifyError correctly categorizes all ERROR_CATEGORIES', () => {
    assert.equal(classifyError(new Error('fetch failed')), ERROR_CATEGORIES.NETWORK)
    assert.equal(classifyError(new Error('permission denied')), ERROR_CATEGORIES.PERMISSION)
    assert.equal(classifyError(new Error('quota exceeded')), ERROR_CATEGORIES.STORAGE)
    assert.equal(classifyError(new TypeError('bad type')), ERROR_CATEGORIES.VALIDATION)
    assert.equal(classifyError(new Error('something random')), ERROR_CATEGORIES.UNKNOWN)
    assert.equal(classifyError(null), ERROR_CATEGORIES.UNKNOWN)

    // Explicit category field
    assert.equal(classifyError({ category: 'network' }), ERROR_CATEGORIES.NETWORK)

    // String error
    assert.equal(classifyError('storage full'), ERROR_CATEGORIES.STORAGE)

    // Name-based
    assert.equal(classifyError({ name: 'NetworkError' }), ERROR_CATEGORIES.NETWORK)
    assert.equal(classifyError({ name: 'QuotaExceededError' }), ERROR_CATEGORIES.STORAGE)
    assert.equal(classifyError({ name: 'SecurityError' }), ERROR_CATEGORIES.PERMISSION)
  })

  // ---- 10 ----
  it('logError produces structured log with category, stack, and context', () => {
    const err = new Error('indexeddb quota_exceeded write failed')
    err.stack = 'Error: indexeddb quota_exceeded write failed\n    at test.js:1:1'
    const log = logError(err, { operation: 'save', component: 'BookmarkStore' })

    assert.equal(log.level, 'ERROR')
    assert.equal(log.category, ERROR_CATEGORIES.STORAGE)
    assert.ok(log.message.includes('quota_exceeded'))
    assert.ok(log.stack.includes('test.js'))
    assert.equal(log.context.operation, 'save')
    assert.equal(log.context.component, 'BookmarkStore')
    assert.ok(log.timestamp)
  })

  // ---- 11 ----
  it('migration: getMigrationVersion + checkDataCompatibility + getMigrationPath', () => {
    const v1 = makeV1Data()
    assert.equal(getMigrationVersion(v1), VERSION_V1)

    const v2Result = migrateV1ToV2(v1)
    assert.equal(getMigrationVersion(v2Result.data), VERSION_V2)

    // Compatibility check
    const compatV1 = checkDataCompatibility(v1)
    assert.ok(compatV1.compatible)
    assert.equal(compatV1.version, VERSION_V1)

    const compatV2 = checkDataCompatibility(v2Result.data)
    assert.ok(compatV2.compatible)
    assert.equal(compatV2.version, VERSION_V2)

    // Migration path
    const path = getMigrationPath(VERSION_V1, VERSION_V2)
    assert.ok(path.possible)
    assert.equal(path.steps.length, 1)
    assert.equal(path.steps[0].from, VERSION_V1)
  })

  // ---- 12 ----
  it('createMigrationReport produces complete pre-migration analysis', () => {
    const v1 = makeV1Data(SAMPLE_BOOKMARKS)
    const { report, error } = createMigrationReport(v1, VERSION_V2)

    assert.equal(error, null)
    assert.equal(report.currentVersion, VERSION_V1)
    assert.equal(report.targetVersion, VERSION_V2)
    assert.ok(report.needsMigration)
    assert.ok(report.migrationPossible)
    assert.equal(report.dataOverview.bookmarkCount, SAMPLE_BOOKMARKS.length)
    assert.equal(report.dataOverview.clusterCount, 1)
    assert.ok(report.compatibility.compatible)
    assert.ok(report.expectedChanges.length >= 1)
  })

  // ---- 13 ----
  it('batchMigrate handles mixed v1 datasets and same-version skip', () => {
    const v1a = makeV1Data(SAMPLE_BOOKMARKS.slice(0, 2))
    const v1b = makeV1Data(SAMPLE_BOOKMARKS.slice(2, 4))

    // First migrate one to v2 to test skip
    const v2Data = runMigration(v1b, VERSION_V2).data

    const result = batchMigrate([v1a, v2Data], VERSION_V2)
    assert.equal(result.summary.total, 2)
    assert.equal(result.summary.succeeded, 1)
    assert.equal(result.summary.skipped, 1)
    assert.equal(result.summary.failed, 0)
  })

  // ---- 14 ----
  it('store-prep: validateManifest + checkStoreSubmissionReadiness on valid manifest', () => {
    const manifest = validManifest()
    const result = validateManifest(manifest)
    assert.ok(result.valid)
    assert.equal(result.errors.length, 0)

    const readiness = checkStoreSubmissionReadiness(manifest, {
      availableLocales: ['en', 'zh_CN'],
      messagesByLocale: {
        en: { extName: { message: 'PageWise' }, extDescription: { message: 'desc' } },
        zh_CN: { extName: { message: '智阅' }, extDescription: { message: '描述' } },
      },
    })
    assert.ok(readiness.ready)
    assert.ok(readiness.score >= 80)
    // All required checks should pass
    for (const check of readiness.checks) {
      assert.ok(check.passed, `Check "${check.label}" should pass: ${check.detail}`)
    }
  })

  // ---- 15 ----
  it('store-prep: broken manifest fails validation and readiness checks', () => {
    const broken = {
      manifest_version: 2,
      name: '',
      version: 'bad',
      description: 'x'.repeat(200),
      icons: { '16': 'a.png' },
      permissions: ['debugger', '<all_urls>'],
      background: {},
      content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" },
    }

    const result = validateManifest(broken)
    assert.ok(!result.valid)
    assert.ok(result.errors.length >= 3)

    const icons = checkIcons(broken)
    assert.ok(!icons.valid)
    assert.ok(icons.missing.includes('48'))
    assert.ok(icons.missing.includes('128'))

    const csp = validateContentSecurityPolicy(broken)
    assert.ok(!csp.valid)
    assert.ok(csp.errors.some(e => e.includes('unsafe-eval')))

    const listing = getStoreListing(broken)
    assert.ok(!listing.isValid)
    assert.ok(listing.errors.length >= 1)

    const readiness = checkStoreSubmissionReadiness(broken)
    assert.ok(!readiness.ready)
    assert.ok(readiness.score < 50)
  })
})
