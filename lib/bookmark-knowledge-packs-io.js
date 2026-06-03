/**
 * BookmarkKnowledgePacks — 知识包 I/O（导入、导出、持久化、增量更新）
 *
 * 从 bookmark-knowledge-packs.js 拆分而来 (R193)
 * 包含: importKnowledgePack、checkPackUpdate、exportToAnki、
 *       exportToBase64、exportData、importData
 *
 * @module lib/bookmark-knowledge-packs-io
 */

/* global Buffer */

import {
  BookmarkKnowledgePacks,
  ANKI_EXPORT_VERSION,
  compareVersions,
  DATA_VERSION,
} from './bookmark-knowledge-packs-core.js'

// ==================== 混入 I/O 方法到 BookmarkKnowledgePacks ====================

// 导入知识包
BookmarkKnowledgePacks.prototype.importKnowledgePack = function(data, options = {}) {
  const errors = []
  const mergeStrategy = options.mergeStrategy || 'keep-both'

  // ---- 解码 ----
  let jsonStr = data
  if (options.isBase64) {
    try {
      jsonStr = Buffer.from(String(data), 'base64').toString('utf-8')
    } catch (err) {
      return { success: false, pack: null, conflicts: {}, errors: [`Base64 解码失败: ${err.message}`], imported: 0, learningPaths: [] }
    }
  }

  // ---- 解析 JSON ----
  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    console.warn('[KnowledgePacksIO]', e?.message || e);
    return { success: false, pack: null, conflicts: {}, errors: ['JSON 解析失败：无效的 JSON 格式'], imported: 0, learningPaths: [] }
  }

  // ---- 格式校验 ----
  if (!parsed || parsed.format !== 'pwkp') {
    return { success: false, pack: null, conflicts: {}, errors: ['格式错误：缺少 format="pwkp" 标识'], imported: 0, learningPaths: [] }
  }

  if (!Array.isArray(parsed.bookmarks)) {
    return { success: false, pack: null, conflicts: {}, errors: ['格式错误：bookmarks 必须是数组'], imported: 0, learningPaths: [] }
  }

  // ---- 冲突检测 ----
  const conflicts = {
    duplicateUrls: [],
    tagConflicts: [],
  }

  const importedBookmarks = []
  let importCount = 0

  for (const bm of parsed.bookmarks) {
    const url = bm.url || ''
    const existingPacks = this._urlIndex.get(url)

    if (existingPacks && existingPacks.size > 0) {
      conflicts.duplicateUrls.push({
        url,
        title: bm.title,
        existingPackIds: [...existingPacks],
      })

      if (mergeStrategy === 'skip') {
        continue
      }
    }

    importedBookmarks.push(bm)

    if (!this._urlIndex.has(url)) {
      this._urlIndex.set(url, new Set())
    }
    this._urlIndex.get(url).add(parsed.packId)
    importCount++
  }

  // ---- 标签冲突检测 ----
  const existingTags = new Set()
  for (const [, pack] of this._installedPacks) {
    for (const tag of (pack.tags || [])) {
      existingTags.add(tag.name)
    }
  }

  for (const tag of (parsed.tags || [])) {
    if (existingTags.has(tag.name)) {
      conflicts.tagConflicts.push({
        name: tag.name,
        message: `标签 "${tag.name}" 在已安装包中已存在`,
      })
    }
  }

  // ---- 存储已导入包 ----
  this._installedPacks.set(parsed.packId, parsed)

  // ---- 更新社区索引 ----
  const existing = this._communityIndex.get(parsed.packId)
  this._communityIndex.set(parsed.packId, {
    packId: parsed.packId,
    name: parsed.name,
    description: parsed.description || '',
    author: parsed.author || 'Anonymous',
    version: parsed.version || '1.0.0',
    visibility: parsed.visibility || 'public',
    bookmarkCount: parsed.bookmarks.length,
    cardCount: (parsed.reviewCards || []).length,
    downloadCount: existing ? existing.downloadCount + 1 : 1,
    rating: existing ? existing.rating : 0,
    ratingCount: existing ? existing.ratingCount : 0,
    installedAt: existing ? existing.installedAt : new Date(this._nowFn()).toISOString(),
    updatedAt: new Date(this._nowFn()).toISOString(),
  })

  // ---- 学习路径继承 ----
  const learningPaths = parsed.learningPaths || []
  for (const lp of learningPaths) {
    for (const _stage of (lp.stages || [])) {
      // bookmarkIds 保持不变（包内 ID 体系自洽）
    }
  }

  return {
    success: true,
    pack: parsed,
    conflicts,
    errors,
    imported: importCount,
    learningPaths,
  }
}

// 检查包版本更新
BookmarkKnowledgePacks.prototype.checkPackUpdate = function(packId, latestPack) {
  const installed = this._installedPacks.get(packId)
  if (!installed) {
    return { hasUpdate: false, currentVersion: null, latestVersion: null, error: `包 ${packId} 未安装` }
  }

  if (!latestPack) {
    return { hasUpdate: false, currentVersion: installed.version, latestVersion: installed.version, error: null }
  }

  const currentVersion = installed.version || '1.0.0'
  const latestVersion = latestPack.version || '1.0.0'
  const cmp = compareVersions(latestVersion, currentVersion)

  return {
    hasUpdate: cmp > 0,
    currentVersion,
    latestVersion,
    error: null,
  }
}

// 导出为 Anki TSV
BookmarkKnowledgePacks.prototype.exportToAnki = function(pack) {
  const cards = pack.reviewCards || []

  if (cards.length === 0) {
    return { format: 'anki-tsv', version: ANKI_EXPORT_VERSION, content: '', cardCount: 0 }
  }

  const lines = cards.map(card => {
    const front = (card.front || '').replace(/\t/g, ' ').replace(/\n/g, '<br>')
    const back = (card.back || '').replace(/\t/g, ' ').replace(/\n/g, '<br>')
    const tags = (pack.tags || []).map(t => t.name || t).join(' ')
    return `${front}\t${back}\t${tags}`
  })

  return {
    format: 'anki-tsv',
    version: ANKI_EXPORT_VERSION,
    content: lines.join('\n'),
    cardCount: lines.length,
  }
}

// 导出为 Base64
BookmarkKnowledgePacks.prototype.exportToBase64 = function(pack) {
  const jsonStr = JSON.stringify(pack)
  return Buffer.from(jsonStr, 'utf-8').toString('base64')
}

// 导出所有数据
BookmarkKnowledgePacks.prototype.exportData = function() {
  const installedPacks = {}
  for (const [id, pack] of this._installedPacks) {
    installedPacks[id] = pack
  }

  const communityIndex = {}
  for (const [id, entry] of this._communityIndex) {
    communityIndex[id] = entry
  }

  return {
    version: DATA_VERSION,
    installedPacks,
    communityIndex,
  }
}

// 从导出数据恢复
BookmarkKnowledgePacks.prototype.importData = function(data) {
  if (!data || typeof data !== 'object') return

  if (data.installedPacks && typeof data.installedPacks === 'object') {
    for (const [id, pack] of Object.entries(data.installedPacks)) {
      this._installedPacks.set(id, pack)

      for (const bm of (pack.bookmarks || [])) {
        const url = bm.url || ''
        if (!this._urlIndex.has(url)) {
          this._urlIndex.set(url, new Set())
        }
        this._urlIndex.get(url).add(id)
      }
    }
  }

  if (data.communityIndex && typeof data.communityIndex === 'object') {
    for (const [id, entry] of Object.entries(data.communityIndex)) {
      this._communityIndex.set(id, entry)
    }
  }
}
