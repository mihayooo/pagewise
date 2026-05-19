/**
 * 测试 R134: 超大模块拆分三期 ModuleSplitPhase3
 *
 * 验证:
 *   1. 拆分后所有 14 个目标文件 ≤400 行
 *   2. API 向后兼容（所有原有导出仍可用）
 *   3. 新拆分文件独立可用
 *   4. 优先拆分的 8 个文件（>570 行）均 ≤400 行
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const libDir = resolve(__dirname, '../lib')

function countLines(file) {
  const content = readFileSync(resolve(libDir, file), 'utf-8')
  return content.split('\n').length
}

// ==================== 文件行数检查 ====================

describe('R134 — 文件行数 ≤ 400', () => {
  const files = [
    // 原始 8 个（已在前期迭代拆分，验证仍 ≤400）
    'bookmark-visualizer.js',
    'bookmark-knowledge-link.js',
    'bookmark-accessibility.js',
    'bookmark-migration.js',
    'ai-client.js',
    'bookmark-exporter.js',
    'contradiction-detector.js',
    'bookmark-semantic-search.js',
    // 剩余 6 个中需拆分的 4 个（本次重点）
    'bookmark-sync.js',
    'bookmark-ai-recommender.js',
    'bookmark-final-polish.js',
    'compilation-report.js',
    // 新拆分子模块文件
    'bookmark-sync-conflict.js',
    'bookmark-ai-recommender-profile.js',
    'bookmark-final-polish-interactions.js',
    'compilation-report-format.js',
    // 其他 ≤400 行的文件
    'skill-validator.js',
    'git-repo.js',
  ]

  for (const file of files) {
    it(`${file} 应 ≤ 400 行`, () => {
      const lines = countLines(file)
      assert.ok(lines <= 400, `${file} 有 ${lines} 行，超过 400 行限制`)
    })
  }
})

// ==================== bookmark-sync.js 向后兼容 ====================

describe('R134 — bookmark-sync.js 向后兼容 re-export', () => {
  const expectedExports = [
    'SYNC_STATUS_IDLE', 'SYNC_STATUS_SYNCING', 'SYNC_STATUS_SUCCESS',
    'SYNC_STATUS_ERROR', 'SYNC_STATUS_QUOTA_EXCEEDED', 'SYNC_STATUS_NETWORK_ERROR',
    'SYNC_STATUS_CONFLICT',
    'CONFLICT_STRATEGY_LOCAL', 'CONFLICT_STRATEGY_REMOTE', 'CONFLICT_STRATEGY_MERGE',
    'SYNC_KEY', 'SYNC_TIME_KEY', 'SYNC_FORMAT_VERSION',
    'SYNC_ITEM_MAX_BYTES', 'SYNC_TOTAL_MAX_BYTES',
    'initSync', 'getSyncStatus', 'getLastError', 'resetSync',
    'estimateBytes',
    'syncToCloud', 'syncFromCloud',
    'resolveConflict', 'splitBookmarks',
    'getLastSyncTime',
  ]

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/bookmark-sync.js')
      assert.ok(name in mod, `${name} 未从 bookmark-sync.js 导出`)
    })
  }
})

describe('R134 — bookmark-sync.js 功能正确性', () => {
  it('initSync + getSyncStatus 正常工作', async () => {
    const { initSync, getSyncStatus, resetSync } = await import('../lib/bookmark-sync.js')
    const mockStorage = { get: () => {}, set: () => {}, remove: () => {} }
    resetSync()
    const result = initSync(mockStorage)
    assert.ok(result.success)
    assert.equal(getSyncStatus(), 'idle')
    resetSync()
  })

  it('resolveConflict 合并策略正确', async () => {
    const { resolveConflict } = await import('../lib/bookmark-sync.js')
    const local = [{ id: '1', url: 'a.com', updatedAt: '2026-01-01' }]
    const remote = [{ id: '2', url: 'b.com' }]
    const result = resolveConflict(local, remote)
    assert.ok(result.success)
    assert.equal(result.bookmarks.length, 2)
  })

  it('splitBookmarks 正确分片', async () => {
    const { splitBookmarks } = await import('../lib/bookmark-sync.js')
    const bms = [{ id: '1', title: 'test' }, { id: '2', title: 'test2' }]
    const chunks = splitBookmarks(bms, 1000)
    assert.ok(chunks.length >= 1)
  })
})

// ==================== bookmark-sync-conflict.js 独立可用 ====================

describe('R134 — bookmark-sync-conflict.js 独立可用', () => {
  it('应导出 CONFLICT_STRATEGY_LOCAL', async () => {
    const mod = await import('../lib/bookmark-sync-conflict.js')
    assert.ok('CONFLICT_STRATEGY_LOCAL' in mod)
  })

  it('resolveConflict 可独立调用', async () => {
    const { resolveConflict, CONFLICT_STRATEGY_LOCAL } = await import('../lib/bookmark-sync-conflict.js')
    const result = resolveConflict([{ id: '1' }], [{ id: '2' }], CONFLICT_STRATEGY_LOCAL)
    assert.ok(result.success)
    assert.equal(result.bookmarks.length, 1)
  })

  it('splitBookmarks 可独立调用', async () => {
    const { splitBookmarks } = await import('../lib/bookmark-sync-conflict.js')
    const chunks = splitBookmarks([{ id: '1' }], 10000)
    assert.ok(chunks.length >= 1)
  })

  it('classifyError 可独立调用', async () => {
    const { classifyError } = await import('../lib/bookmark-sync-conflict.js')
    const result = classifyError(new Error('QUOTA_BYTES exceeded'))
    assert.equal(result.status, 'quota_exceeded')
  })
})

// ==================== bookmark-ai-recommender.js 向后兼容 ====================

describe('R134 — bookmark-ai-recommender.js 向后兼容 re-export', () => {
  it('应导出 BookmarkAIRecommendations 类', async () => {
    const mod = await import('../lib/bookmark-ai-recommender.js')
    assert.ok('BookmarkAIRecommendations' in mod)
    assert.equal(typeof mod.BookmarkAIRecommendations, 'function')
  })

  it('BookmarkAIRecommendations 可正常实例化', async () => {
    const { BookmarkAIRecommendations } = await import('../lib/bookmark-ai-recommender.js')
    const mockAI = { chat: async () => ({ content: '{}' }) }
    const instance = new BookmarkAIRecommendations({ aiClient: mockAI })
    assert.ok(instance)
    assert.equal(typeof instance.analyzeProfile, 'function')
    assert.equal(typeof instance.getRecommendations, 'function')
    assert.equal(typeof instance.clearCache, 'function')
    assert.equal(typeof instance.getLastSource, 'function')
  })

  it('analyzeProfile 正确返回画像', async () => {
    const { BookmarkAIRecommendations } = await import('../lib/bookmark-ai-recommender.js')
    const mockAI = { chat: async () => ({ content: '{}' }) }
    const instance = new BookmarkAIRecommendations({ aiClient: mockAI })
    const profile = instance.analyzeProfile([
      { id: '1', url: 'https://example.com', title: 'Test', tags: ['js'] },
    ])
    assert.ok(profile.topDomains)
    assert.ok(profile.topCategories)
    assert.ok(profile.readingProgress)
    assert.ok(profile.difficultyDistribution)
  })
})

// ==================== bookmark-ai-recommender-profile.js 独立可用 ====================

describe('R134 — bookmark-ai-recommender-profile.js 独立可用', () => {
  it('应导出 ProfileAnalyzer 类', async () => {
    const mod = await import('../lib/bookmark-ai-recommender-profile.js')
    assert.ok('ProfileAnalyzer' in mod)
  })

  it('ProfileAnalyzer.analyzeProfile 可独立调用', async () => {
    const { ProfileAnalyzer } = await import('../lib/bookmark-ai-recommender-profile.js')
    const analyzer = new ProfileAnalyzer()
    const profile = analyzer.analyzeProfile([
      { id: '1', url: 'https://example.com/a', title: 'Test', tags: ['js'], folderPath: ['dev'] },
      { id: '2', url: 'https://example.com/b', title: 'Test2', tags: ['python'], folderPath: ['data'] },
    ])
    assert.equal(profile.totalBookmarks, 2)
    assert.ok(profile.topDomains.length > 0)
  })
})

// ==================== bookmark-final-polish.js 向后兼容 ====================

describe('R134 — bookmark-final-polish.js 向后兼容 re-export', () => {
  const expectedExports = [
    'NODE_ENTRY_DURATION', 'NODE_ENTRY_EASING',
    'EDGE_DRAW_DURATION', 'DASH_SEGMENT_LENGTH',
    'GRID_SNAP_SIZE', 'RIPPLE_DURATION', 'TOOLTIP_OFFSET',
    'SCROLL_DURATION', 'BREAKPOINTS', 'GRID_COLUMNS',
    'animateNodeEntry', 'animateEdgeDraw', 'optimizeLayout',
    'enhanceDragDrop', 'addRippleEffect', 'showTooltip', 'smoothScrollTo',
    'easeInOutCubic', 'easeOutQuad', 'snapToGrid',
  ]

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/bookmark-final-polish.js')
      assert.ok(name in mod, `${name} 未从 bookmark-final-polish.js 导出`)
    })
  }
})

// ==================== bookmark-final-polish-interactions.js 独立可用 ====================

describe('R134 — bookmark-final-polish-interactions.js 独立可用', () => {
  it('应导出 enhanceDragDrop', async () => {
    const mod = await import('../lib/bookmark-final-polish-interactions.js')
    assert.ok('enhanceDragDrop' in mod)
  })

  it('enhanceDragDrop 可独立调用', async () => {
    const { enhanceDragDrop } = await import('../lib/bookmark-final-polish-interactions.js')
    const el = { style: {}, setAttribute: () => {}, id: 'test' }
    const result = enhanceDragDrop(el)
    assert.ok(result.enabled)
  })

  it('showTooltip 可独立调用', async () => {
    const { showTooltip } = await import('../lib/bookmark-final-polish-interactions.js')
    const el = { getBoundingClientRect: () => ({ left: 100, top: 100, width: 50, height: 50, right: 150, bottom: 150 }) }
    const result = showTooltip(el, 'test', 'top', { width: 1280, height: 720 })
    assert.ok(result.shown)
  })
})

// ==================== compilation-report.js 向后兼容 ====================

describe('R134 — compilation-report.js 向后兼容 re-export', () => {
  const expectedExports = [
    'REPORT_LEVEL', 'IngestStats',
    'buildIngestStats', 'computeIngestDiff',
    'generateReportMarkdown', 'generateReportHtml',
    'mergeIngestStats', 'summarizeReport', 'formatReportSummary',
  ]

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/compilation-report.js')
      assert.ok(name in mod, `${name} 未从 compilation-report.js 导出`)
    })
  }

  it('IngestStats 可正常实例化', async () => {
    const { IngestStats } = await import('../lib/compilation-report.js')
    const stats = new IngestStats({ newPageCount: 5, updatedPageCount: 2 })
    assert.equal(stats.newPageCount, 5)
    assert.equal(stats.updatedPageCount, 2)
  })

  it('generateReportMarkdown 生成正确格式', async () => {
    const { generateReportMarkdown, IngestStats } = await import('../lib/compilation-report.js')
    const stats = new IngestStats({ newPageCount: 3 })
    const md = generateReportMarkdown(stats)
    assert.ok(md.includes('知识编译报告'))
    assert.ok(md.includes('新增页面'))
  })

  it('summarizeReport 生成摘要', async () => {
    const { summarizeReport, IngestStats } = await import('../lib/compilation-report.js')
    const stats = new IngestStats({ newPageCount: 5, updatedPageCount: 2 })
    const summary = summarizeReport(stats)
    assert.ok(summary.includes('新增 5 页'))
    assert.ok(summary.includes('更新 2 页'))
  })
})

// ==================== compilation-report-format.js 独立可用 ====================

describe('R134 — compilation-report-format.js 独立可用', () => {
  it('应导出 generateReportMarkdown', async () => {
    const mod = await import('../lib/compilation-report-format.js')
    assert.ok('generateReportMarkdown' in mod)
  })

  it('应导出 generateReportHtml', async () => {
    const mod = await import('../lib/compilation-report-format.js')
    assert.ok('generateReportHtml' in mod)
  })

  it('应导出 escapeHtml', async () => {
    const mod = await import('../lib/compilation-report-format.js')
    assert.ok('escapeHtml' in mod)
    assert.equal(mod.escapeHtml('<script>'), '&lt;script&gt;')
  })

  it('generateReportMarkdown 可独立调用', async () => {
    const { generateReportMarkdown } = await import('../lib/compilation-report-format.js')
    const md = generateReportMarkdown({ newPageCount: 1, updatedPageCount: 0 })
    assert.ok(md.includes('知识编译报告'))
  })

  it('generateReportHtml 可独立调用', async () => {
    const { generateReportHtml } = await import('../lib/compilation-report-format.js')
    const html = generateReportHtml({ newPageCount: 1, updatedPageCount: 0 })
    assert.ok(html.includes('pw-compilation-report'))
  })
})

// ==================== 前期拆分文件仍 ≤400 行 ====================

describe('R134 — 前期已拆分子模块仍 ≤400 行', () => {
  const subFiles = [
    'bookmark-visualizer-physics.js',
    'bookmark-visualizer-renderer.js',
    'bookmark-knowledge-link-scorer.js',
    'bookmark-accessibility-contrast.js',
    'bookmark-accessibility-navigator.js',
    'bookmark-migration-runner.js',
    'ai-client-tokens.js',
    'ai-client-stream.js',
    'ai-client-request.js',
    'ai-client-prompts.js',
    'bookmark-exporter-import.js',
    'bookmark-semantic-search-hybrid.js',
    'contradiction-detector-prompt.js',
    'contradiction-detector-ui.js',
    'skill-validator-security.js',
    'git-repo-objects.js',
  ]

  for (const file of subFiles) {
    it(`${file} 应存在且 ≤ 400 行`, () => {
      const lines = countLines(file)
      assert.ok(lines <= 400, `${file} 有 ${lines} 行，超过 400 行限制`)
    })
  }
})
