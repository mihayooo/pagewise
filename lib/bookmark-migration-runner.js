/**
 * BookmarkMigration — 迁移执行与兼容性检查子模块
 *
 * 从 bookmark-migration.js 拆分，负责:
 *   - 版本检测
 *   - v1→v2 迁移逻辑
 *   - 迁移验证
 *   - 迁移路径规划
 *   - 迁移报告
 *   - 数据兼容性检查
 *
 * @module lib/bookmark-migration-runner
 */

// ==================== Version Constants ====================

/**
 * 数据格式 v1 版本标识
 */
export const VERSION_V1 = 1
/**
 * 数据格式 v2 版本标识
 */
export const VERSION_V2 = 2
/**
 * 当前数据格式版本
 */
export const CURRENT_VERSION = VERSION_V2

/**
 * 已支持的版本列表
 */
export const SUPPORTED_VERSIONS = Object.freeze([VERSION_V1, VERSION_V2])

/**
 * v2 格式标识字符串
 */
export const FORMAT_VERSION_V2 = '2.0'

// ==================== Migration Steps Registry ====================

/**
 * 迁移步骤注册表（冻结）
 */
export const MIGRATION_STEPS = Object.freeze([
  Object.freeze({
    from: VERSION_V1,
    to: VERSION_V2,
    description: 'v1→v2: clusters→collections, statuses→readingProgress, 新增 metadata',
  }),
])

// ==================== Version Detection ====================

/**
 * 检测数据当前的版本号
 * @param {object} data
 * @returns {number|null}
 */
export function getMigrationVersion(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) return null

  const v = data.version
  if (v === undefined || v === null) return null
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    if (SUPPORTED_VERSIONS.includes(v)) return v
  }
  return null
}

// ==================== v1 → v2 Migration ====================

/**
 * 将 v1 格式数据迁移为 v2 格式
 * @param {object} data
 * @returns {{ data: object, warnings: string[] }}
 */
export function migrateV1ToV2(data) {
  const warnings = []

  if (!data || typeof data !== 'object') {
    return { data: null, warnings: ['输入数据为空或非对象'] }
  }

  if (data.version !== VERSION_V1) {
    warnings.push(`数据版本为 ${data.version}，非 v1 格式`)
  }

  const bookmarks = Array.isArray(data.bookmarks)
    ? data.bookmarks.map(bm => migrateBookmarkV1ToV2(bm))
    : []
  const collections = Array.isArray(data.clusters) ? deepCopy(data.clusters) : []
  const tags = Array.isArray(data.tags) ? deepCopy(data.tags) : []
  const readingProgress = Array.isArray(data.statuses) ? deepCopy(data.statuses) : []

  if (!Array.isArray(data.bookmarks)) {
    warnings.push('原始数据缺少 bookmarks 数组')
  }
  if (!Array.isArray(data.clusters)) {
    warnings.push('原始数据缺少 clusters 数组')
  }

  const migratedAt = new Date().toISOString()

  const newData = {
    version: VERSION_V2,
    formatVersion: FORMAT_VERSION_V2,
    exportedAt: data.exportedAt || migratedAt,
    migratedAt,
    metadata: {
      bookmarkCount: bookmarks.length,
      collectionCount: collections.length,
      tagCount: tags.length,
      source: 'pagewise',
      generator: 'PageWise-Migration',
      previousVersion: VERSION_V1,
    },
    bookmarks,
    collections,
    tags,
    readingProgress,
  }

  return { data: newData, warnings }
}

function migrateBookmarkV1ToV2(bm) {
  if (!bm || typeof bm !== 'object') {
    return { id: 'unknown', title: '', url: '', folderPath: [], tags: [], status: 'unread', dateAdded: 0, dateAddedISO: '' }
  }

  const migrated = { ...bm }

  if (!Array.isArray(migrated.tags)) {
    migrated.tags = []
  }

  if (!Array.isArray(migrated.folderPath)) {
    migrated.folderPath = []
  }

  if (!['unread', 'reading', 'read'].includes(migrated.status)) {
    migrated.status = 'unread'
  }

  if (!migrated.dateAddedISO && migrated.dateAdded) {
    try {
      migrated.dateAddedISO = new Date(migrated.dateAdded).toISOString()
    } catch (e) {
      console.warn('[MigrationRunner]', e?.message || e);
      migrated.dateAddedISO = ''
    }
  }

  return migrated
}

// ==================== Migration Validation ====================

/**
 * 验证迁移是否完整保留了所有数据
 */
export function validateMigration(oldData, newData) {
  const errors = []
  const stats = {}

  if (!oldData || typeof oldData !== 'object') {
    return { valid: false, errors: ['原始数据为空或非对象'], stats }
  }
  if (!newData || typeof newData !== 'object') {
    return { valid: false, errors: ['迁移后数据为空或非对象'], stats }
  }

  if (newData.version !== VERSION_V2) {
    errors.push(`迁移后版本应为 ${VERSION_V2}，实际为 ${newData.version}`)
  }

  const oldBookmarks = Array.isArray(oldData.bookmarks) ? oldData.bookmarks : []
  const newBookmarks = Array.isArray(newData.bookmarks) ? newData.bookmarks : []
  stats.oldBookmarkCount = oldBookmarks.length
  stats.newBookmarkCount = newBookmarks.length
  if (oldBookmarks.length !== newBookmarks.length) {
    errors.push(`书签数量不一致: 原始 ${oldBookmarks.length}，迁移后 ${newBookmarks.length}`)
  }

  const oldIds = new Set(oldBookmarks.map(bm => bm?.id))
  const newIds = new Set(newBookmarks.map(bm => bm?.id))
  for (const id of oldIds) {
    if (!newIds.has(id)) errors.push(`书签 ${id} 在迁移后丢失`)
  }

  const oldUrls = new Set(oldBookmarks.map(bm => bm?.url).filter(Boolean))
  const newUrls = new Set(newBookmarks.map(bm => bm?.url).filter(Boolean))
  for (const url of oldUrls) {
    if (!newUrls.has(url)) errors.push(`URL ${url} 在迁移后丢失`)
  }

  const oldClusters = Array.isArray(oldData.clusters) ? oldData.clusters.length : 0
  const newCollections = Array.isArray(newData.collections) ? newData.collections.length : 0
  stats.oldClusterCount = oldClusters
  stats.newCollectionCount = newCollections
  if (oldClusters !== newCollections) {
    errors.push(`聚类数据数量不一致: 原始 ${oldClusters}，迁移后 ${newCollections}`)
  }

  const oldTags = Array.isArray(oldData.tags) ? oldData.tags.length : 0
  const newTags = Array.isArray(newData.tags) ? newData.tags.length : 0
  stats.oldTagCount = oldTags
  stats.newTagCount = newTags
  if (oldTags !== newTags) {
    errors.push(`标签数量不一致: 原始 ${oldTags}，迁移后 ${newTags}`)
  }

  const oldStatuses = Array.isArray(oldData.statuses) ? oldData.statuses.length : 0
  const newReadingProgress = Array.isArray(newData.readingProgress) ? newData.readingProgress.length : 0
  stats.oldStatusCount = oldStatuses
  stats.newReadingProgressCount = newReadingProgress
  if (oldStatuses !== newReadingProgress) {
    errors.push(`状态数据数量不一致: 原始 ${oldStatuses}，迁移后 ${newReadingProgress}`)
  }

  if (!newData.metadata) {
    errors.push('迁移后数据缺少 metadata')
  }

  return { valid: errors.length === 0, errors, stats }
}

// ==================== Migration Runner ====================

/**
 * 根据当前版本和目标版本运行迁移路径
 */
export function runMigration(data, targetVersion) {
  const warnings = []
  const errors = []

  if (!data || typeof data !== 'object') {
    return { success: false, data: null, warnings, errors: ['输入数据为空或非对象'] }
  }

  if (targetVersion === undefined || targetVersion === null) {
    return { success: false, data: null, warnings, errors: ['未指定目标版本'] }
  }

  if (!Number.isFinite(targetVersion) || targetVersion < 1) {
    return { success: false, data: null, warnings, errors: [`无效的目标版本: ${targetVersion}`] }
  }

  const currentVersion = getMigrationVersion(data)
  if (currentVersion === null) {
    return { success: false, data: null, warnings, errors: ['无法识别数据版本'] }
  }

  if (currentVersion === targetVersion) {
    warnings.push(`数据已经是目标版本 v${targetVersion}，无需迁移`)
    return { success: true, data: deepCopy(data), warnings, errors }
  }

  if (currentVersion > targetVersion) {
    return {
      success: false, data: null, warnings,
      errors: [`不支持从 v${currentVersion} 降级到 v${targetVersion}`],
    }
  }

  if (!SUPPORTED_VERSIONS.includes(targetVersion)) {
    return {
      success: false, data: null, warnings,
      errors: [`不支持的目标版本: v${targetVersion}`],
    }
  }

  let currentData = deepCopy(data)
  const migrationWarnings = []

  if (currentVersion === VERSION_V1 && targetVersion >= VERSION_V2) {
    const result = migrateV1ToV2(currentData)
    if (!result.data) {
      return { success: false, data: null, warnings, errors: ['v1→v2 迁移失败'] }
    }
    currentData = result.data
    migrationWarnings.push(...result.warnings)
  }

  return {
    success: true,
    data: currentData,
    warnings: [...warnings, ...migrationWarnings],
    errors,
  }
}

// ==================== Migration Path ====================

/**
 * 获取从 fromVersion 到 toVersion 所需的迁移步骤列表
 */
export function getMigrationPath(fromVersion, toVersion) {
  if (!Number.isFinite(fromVersion) || !Number.isFinite(toVersion)) {
    return { possible: false, steps: [], error: '版本号必须是有效数字' }
  }

  if (fromVersion === toVersion) {
    return { possible: true, steps: [], error: null }
  }

  if (fromVersion > toVersion) {
    return { possible: false, steps: [], error: `不支持从 v${fromVersion} 降级到 v${toVersion}` }
  }

  if (!SUPPORTED_VERSIONS.includes(fromVersion)) {
    return { possible: false, steps: [], error: `不支持的起始版本: v${fromVersion}` }
  }
  if (!SUPPORTED_VERSIONS.includes(toVersion)) {
    return { possible: false, steps: [], error: `不支持的目标版本: v${toVersion}` }
  }

  const steps = []
  for (const step of MIGRATION_STEPS) {
    if (step.from >= fromVersion && step.to <= toVersion) {
      steps.push(step)
    }
  }

  if (steps.length === 0) {
    return { possible: false, steps: [], error: `找不到从 v${fromVersion} 到 v${toVersion} 的迁移路径` }
  }

  return { possible: true, steps, error: null }
}

// ==================== Utility ====================

/**
 * @param {*} obj - 深拷贝对象
 * * @returns {*} 深拷贝后的对象
 */
export function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e) {
    console.warn('[MigrationRunner]', e?.message || e);
    if (Array.isArray(obj)) return obj.map(item => deepCopy(item))
    const copy = {}
    for (const key of Object.keys(obj)) copy[key] = deepCopy(obj[key])
    return copy
  }
}
