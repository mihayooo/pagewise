/**
 * BookmarkMigration — 数据迁移框架
 *
 * 负责在不同版本的书签数据格式之间进行安全迁移。
 *
 * 迁移核心逻辑已拆分至 bookmark-migration-runner.js
 * 本文件保留: 迁移报告、兼容性检查、批量迁移
 */

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
} from './bookmark-migration-runner.js'

// ==================== Migration Report ====================

/**
 * 生成迁移报告（不执行迁移）
 */
export function createMigrationReport(data, targetVersion) {
  if (!data || typeof data !== 'object') {
    return { report: null, error: '输入数据为空或非对象' }
  }

  const currentVersion = getMigrationVersion(data)
  if (currentVersion === null) {
    return { report: null, error: '无法识别数据版本' }
  }

  if (!Number.isFinite(targetVersion) || targetVersion < 1) {
    return { report: null, error: `无效的目标版本: ${targetVersion}` }
  }

  const path = getMigrationPath(currentVersion, targetVersion)

  const dataOverview = {
    bookmarkCount: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0,
    clusterCount: Array.isArray(data.clusters) ? data.clusters.length : 0,
    collectionCount: Array.isArray(data.collections) ? data.collections.length : 0,
    tagCount: Array.isArray(data.tags) ? data.tags.length : 0,
    statusCount: Array.isArray(data.statuses) ? data.statuses.length : 0,
    readingProgressCount: Array.isArray(data.readingProgress) ? data.readingProgress.length : 0,
  }

  const compatibility = checkDataCompatibility(data)

  const expectedChanges = []
  if (currentVersion < targetVersion) {
    for (const step of path.steps) {
      expectedChanges.push({
        step: `${step.from}→${step.to}`,
        description: step.description,
      })
    }
  }

  const report = {
    currentVersion,
    targetVersion,
    needsMigration: currentVersion !== targetVersion,
    migrationPossible: path.possible,
    migrationPath: path.steps.map(s => `${s.from}→${s.to}`),
    expectedChanges,
    dataOverview,
    compatibility,
    generatedAt: new Date().toISOString(),
  }

  if (path.error) {
    report.error = path.error
  }

  return { report, error: null }
}

// ==================== Data Compatibility Check ====================

/**
 * 检查数据格式兼容性
 */
export function checkDataCompatibility(data) {
  const issues = []
  const warnings = []

  if (!data || typeof data !== 'object') {
    return { compatible: false, version: null, issues: ['数据为空或非对象'], warnings }
  }

  if (Array.isArray(data)) {
    return { compatible: false, version: null, issues: ['数据为数组而非对象'], warnings }
  }

  const version = getMigrationVersion(data)
  if (version === null) {
    if (data.bookmarks && !data.version) {
      issues.push('数据缺少 version 字段')
    } else {
      issues.push('无法识别数据版本')
    }
    return { compatible: false, version: null, issues, warnings }
  }

  if (version === VERSION_V1) {
    if (!Array.isArray(data.bookmarks)) {
      issues.push('v1 数据缺少 bookmarks 数组')
    } else {
      for (let i = 0; i < data.bookmarks.length; i++) {
        const bm = data.bookmarks[i]
        if (!bm.id && bm.id !== 0) {
          issues.push(`书签 #${i} 缺少 id 字段`)
        }
        if (!bm.url && !bm.title) {
          warnings.push(`书签 #${i} 缺少 url 和 title`)
        }
      }
    }
    if (!Array.isArray(data.clusters)) {
      warnings.push('v1 数据缺少 clusters 数组')
    }
    if (!Array.isArray(data.tags)) {
      warnings.push('v1 数据缺少 tags 数组')
    }
    if (!Array.isArray(data.statuses)) {
      warnings.push('v1 数据缺少 statuses 数组')
    }
  }

  if (version === VERSION_V2) {
    if (!data.formatVersion) {
      warnings.push('v2 数据缺少 formatVersion 字段')
    }
    if (!Array.isArray(data.bookmarks)) {
      issues.push('v2 数据缺少 bookmarks 数组')
    }
    if (!Array.isArray(data.collections)) {
      warnings.push('v2 数据缺少 collections 数组')
    }
    if (!Array.isArray(data.readingProgress)) {
      warnings.push('v2 数据缺少 readingProgress 数组')
    }
    if (!data.metadata) {
      warnings.push('v2 数据缺少 metadata 字段')
    }
  }

  return {
    compatible: issues.length === 0,
    version,
    issues,
    warnings,
  }
}

// ==================== Batch Migration ====================

/**
 * 批量迁移多个数据集
 */
export function batchMigrate(dataArray, targetVersion) {
  if (!Array.isArray(dataArray)) {
    return {
      results: [],
      summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
    }
  }

  const results = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < dataArray.length; i++) {
    const item = dataArray[i]
    const result = runMigration(item, targetVersion)

    if (result.success) {
      const currentVersion = getMigrationVersion(item)
      if (currentVersion === targetVersion) {
        skipped++
      } else {
        succeeded++
      }
    } else {
      failed++
    }

    results.push({ index: i, ...result })
  }

  return {
    results,
    summary: {
      total: dataArray.length,
      succeeded,
      failed,
      skipped,
    },
  }
}

// ==================== 向后兼容 re-export ====================

export {
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
}
