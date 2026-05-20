/**
 * BookmarkKnowledgePacks — 知识包分享与团队空间
 *
 * 实现用户间知识资产打包、分享、导入与管理：
 *   - createKnowledgePack(config)   — 将书签+标签+笔记+学习路径+复习卡片打包为 .pwkp JSON
 *   - sanitizePack(pack, visibility) — 按可见级别移除个人信息
 *   - importKnowledgePack(data, opts) — 导入 .pwkp 文件或 Base64 字符串
 *   - listCommunityPacks()          — 列出本地已导入的知识包索引
 *   - searchPacks(query)            — 按关键词搜索知识包
 *   - checkPackUpdate(packId, latestPack) — 检查包版本更新
 *   - exportToAnki(pack)            — 导出复习卡片为 Anki TSV 格式
 *   - exportToBase64(pack)          — 导出为 Base64 编码字符串
 *   - ratePack(packId, score)       — 为已安装包评分
 *   - exportData() / importData(data) — 序列化/反序列化全部数据
 *
 * .pwkp 格式:
 *   { format:'pwkp', formatVersion, packId, name, description, author,
 *     visibility, version, createdAt, updatedAt, checksum,
 *     bookmarks[], tags[], notes[], learningPaths[], reviewCards[],
 *     metadata:{ bookmarkCount, tagCount, noteCount, cardCount } }
 *
 * @module lib/bookmark-knowledge-packs
 */

/* global Buffer */

// ==================== 常量 ====================

/** .pwkp 格式版本 */
export const PACK_FORMAT_VERSION = '1.0'

/** 可见性级别 */
export const VISIBILITY_LEVELS = Object.freeze(['public', 'team', 'private'])

/** Anki 导出格式版本 */
export const ANKI_EXPORT_VERSION = '1.0'

/** 包索引持久化 key */
const _PACK_INDEX_STORAGE_KEY = 'pagewise_knowledge_pack_index'

/** 已安装包持久化 key */
const _INSTALLED_PACKS_STORAGE_KEY = 'pagewise_installed_packs'

/** 数据版本 */
const DATA_VERSION = 1

// ==================== 内部工具 ====================

/**
 * 计算字符串的简单校验和 (djb2 变体)
 * @param {string} str
 * @returns {string} 十六进制校验和
 * @private
 */
function computeChecksum(str) {
  if (typeof str !== 'string') return '0'
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

/**
 * 深拷贝可序列化数据
 * @param {*} data
 * @returns {*}
 * @private
 */
function deepCopy(data) {
  return JSON.parse(JSON.stringify(data))
}

/**
 * 生成唯一 pack ID
 * @param {Function} nowFn
 * @returns {string}
 * @private
 */
function generatePackId(nowFn) {
  const ts = nowFn()
  const rand = Math.random().toString(36).slice(2, 8)
  return `kp-${ts}-${rand}`
}

/**
 * 比较语义版本号 (semver-like)
 * @param {string} v1
 * @param {string} v2
 * @returns {number} 1 if v1>v2, -1 if v1<v2, 0 if equal
 * @private
 */
function compareVersions(v1, v2) {
  const parts1 = String(v1).split('.').map(Number)
  const parts2 = String(v2).split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

// ==================== BookmarkKnowledgePacks ====================

export class BookmarkKnowledgePacks {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.now]             — 自定义时间源（测试用）
   * @param {string}   [options.storageBackend]  — 存储后端标识 ('local'|'sync')
   */
  constructor(options = {}) {
    /** @type {Function} 时间源 */
    this._nowFn = options.now || (() => Date.now())

    /** @type {string} 存储后端 */
    this._storageBackend = options.storageBackend || 'local'

    /**
     * 已安装包索引 Map<packId, CommunityIndexEntry>
     * @type {Map<string, Object>}
     */
    this._communityIndex = new Map()

    /**
     * 已安装包的完整数据 Map<packId, pack>
     * @type {Map<string, Object>}
     */
    this._installedPacks = new Map()

    /**
     * URL 到 packId 的反向索引（用于冲突检测）
     * @type {Map<string, Set<string>>}
     */
    this._urlIndex = new Map()
  }

  // ================================================================
  //  创建知识包
  // ================================================================

  /**
   * 将书签集合+标签+笔记+学习路径+复习卡片打包为 .pwkp 格式
   *
   * @param {Object} config
   * @param {string}   config.name        — 知识包名称（必填）
   * @param {string}   [config.description] — 描述
   * @param {string}   [config.author]     — 作者
   * @param {string}   [config.version='1.0.0'] — 版本号
   * @param {Array}    config.bookmarks    — 书签数组（必填，至少 []）
   * @param {Array}    [config.tags=[]]    — 标签数组
   * @param {Array}    [config.notes=[]]   — 笔记数组
   * @param {Array}    [config.learningPaths=[]] — 学习路径数组
   * @param {Array}    [config.reviewCards=[]]   — 复习卡片数组
   * @param {string}   [config.visibility='public'] — 可见性级别
   * @returns {Object} .pwkp 格式知识包对象
   * @throws {Error} 缺少必填字段时抛出
   */
  createKnowledgePack(config) {
    if (!config || typeof config.name !== 'string' || config.name.trim() === '') {
      throw new Error('config.name 是必填字段')
    }
    if (!Array.isArray(config.bookmarks)) {
      throw new Error('config.bookmarks 必须是数组')
    }

    const visibility = config.visibility || 'public'
    if (!VISIBILITY_LEVELS.includes(visibility)) {
      throw new Error(`visibility 无效，必须是 ${VISIBILITY_LEVELS.join('|')}`)
    }

    const now = this._nowFn()
    const packId = generatePackId(this._nowFn)

    const bookmarks = deepCopy(config.bookmarks)
    const tags = deepCopy(config.tags || [])
    const notes = deepCopy(config.notes || [])
    const learningPaths = deepCopy(config.learningPaths || [])
    const reviewCards = deepCopy(config.reviewCards || [])

    // 构建 .pwkp 对象（不含 checksum，后面计算）
    const pack = {
      format: 'pwkp',
      formatVersion: PACK_FORMAT_VERSION,
      packId,
      name: config.name.trim(),
      description: (config.description || '').trim(),
      author: (config.author || 'Anonymous').trim(),
      visibility,
      version: config.version || '1.0.0',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      bookmarks,
      tags,
      notes,
      learningPaths,
      reviewCards,
      metadata: {
        bookmarkCount: bookmarks.length,
        tagCount: tags.length,
        noteCount: notes.length,
        cardCount: reviewCards.length,
      },
    }

    // 计算校验和（排除 checksum 字段本身）
    const dataForChecksum = JSON.stringify(pack)
    pack.checksum = computeChecksum(dataForChecksum)

    return pack
  }

  // ================================================================
  //  隐私脱敏
  // ================================================================

  /**
   * 按可见级别移除个人信息
   *
   * - public: 移除 dateAdded、folderPath、自定义 notes、私人笔记内容
   * - team:   保留标签和学习路径，移除私人笔记和浏览时间
   * - private: 保留所有数据
   *
   * @param {Object} pack — .pwkp 格式知识包
   * @param {string} visibility — 'public'|'team'|'private'
   * @returns {Object} 脱敏后的知识包（新对象，不修改原包）
   * @throws {Error} 无效 visibility 时抛出
   */
  sanitizePack(pack, visibility) {
    if (!VISIBILITY_LEVELS.includes(visibility)) {
      throw new Error(`visibility 无效，必须是 ${VISIBILITY_LEVELS.join('|')}`)
    }

    const sanitized = deepCopy(pack)
    sanitized.visibility = visibility

    if (visibility === 'private') {
      // 私有：保留所有数据
      return sanitized
    }

    // public 和 team 共同脱敏规则
    for (const bm of sanitized.bookmarks) {
      // 移除浏览时间
      delete bm.dateAdded
      // 移除私人笔记
      delete bm.notes
      // 移除文件夹路径（可能包含个人信息）
      delete bm.folderPath
    }

    // 脱敏笔记内容（移除私人笔记中可能含有的私密内容标记）
    for (const note of sanitized.notes) {
      if (note.content) {
        // 移除看起来像个人信息的内容（邮箱、URL中的查询参数等）
        note.content = note.content
          .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[redacted-email]')
          .replace(/password|密码|secret|密钥|token|api.?key/gi, '[redacted]')
      }
    }

    if (visibility === 'public') {
      // 公开模式更严格：移除所有笔记
      sanitized.notes = []
      // 移除私人标签（仅保留通用标签）
      sanitized.tags = sanitized.tags.filter(t => {
        const name = (t.name || '').toLowerCase()
        // 保留通用技术标签，移除看起来像私人的标签
        return !name.startsWith('my-') && !name.startsWith('个人') && !name.startsWith('private')
      })
    }

    return sanitized
  }

  // ================================================================
  //  导入知识包
  // ================================================================

  /**
   * 导入 .pwkp 文件（JSON 字符串或 Base64 编码）
   *
   * @param {string} data — JSON 字符串或 Base64 编码的 .pwkp 数据
   * @param {Object} [options={}]
   * @param {boolean} [options.isBase64=false] — 是否 Base64 编码
   * @param {string}  [options.mergeStrategy='keep-both'] — 冲突合并策略: 'skip'|'replace'|'keep-both'
   * @returns {{ success: boolean, pack: Object|null, conflicts: Object, errors: string[], imported: number, learningPaths: Array }}
   */
  importKnowledgePack(data, options = {}) {
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
    } catch {
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
          continue // 跳过重复
        }
        // 'replace' 和 'keep-both' 都继续导入
      }

      importedBookmarks.push(bm)

      // 更新 URL 索引
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
    // 将包内学习路径的书签 ID 映射到导入后的书签
    for (const lp of learningPaths) {
      for (const _stage of (lp.stages || [])) {
        // bookmarkIds 保持不变（包内 ID 体系自洽）
        // 导入时的 ID 映射由调用方处理
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

  // ================================================================
  //  社区包管理
  // ================================================================

  /**
   * 列出本地已导入的知识包索引
   *
   * @returns {Array<CommunityIndexEntry>}
   */
  listCommunityPacks() {
    const result = []
    for (const entry of this._communityIndex.values()) {
      result.push({ ...entry })
    }
    // 按下载量降序
    result.sort((a, b) => b.downloadCount - a.downloadCount)
    return result
  }

  /**
   * 按关键词搜索知识包
   *
   * 搜索范围: name, description, author
   *
   * @param {string} query — 搜索关键词
   * @returns {Array<CommunityIndexEntry>}
   */
  searchPacks(query) {
    if (!query || typeof query !== 'string') {
      return this.listCommunityPacks()
    }

    const q = query.toLowerCase().trim()
    if (q === '') return this.listCommunityPacks()

    const all = this.listCommunityPacks()
    return all.filter(entry => {
      const text = `${entry.name} ${entry.description} ${entry.author}`.toLowerCase()
      return text.includes(q)
    })
  }

  /**
   * 为已安装包评分 (1-5)
   *
   * @param {string} packId
   * @param {number} score — 1-5 整数
   * @returns {{ success: boolean, rating: number, ratingCount: number }}
   * @throws {Error} score 不在 1-5 范围时抛出
   */
  ratePack(packId, score) {
    const s = Math.round(Number(score))
    if (s < 1 || s > 5) {
      throw new Error('score 必须在 1-5 之间')
    }

    const entry = this._communityIndex.get(packId)
    if (!entry) {
      return { success: false, rating: 0, ratingCount: 0 }
    }

    const total = entry.rating * entry.ratingCount + s
    entry.ratingCount += 1
    entry.rating = Math.round((total / entry.ratingCount) * 10) / 10

    return { success: true, rating: entry.rating, ratingCount: entry.ratingCount }
  }

  // ================================================================
  //  增量更新
  // ================================================================

  /**
   * 检查包版本更新
   *
   * @param {string} packId — 已安装的包 ID
   * @param {Object} [latestPack] — 最新版本的包数据（可选，用于比较）
   * @returns {{ hasUpdate: boolean, currentVersion: string|null, latestVersion: string|null, error: string|null }}
   */
  checkPackUpdate(packId, latestPack) {
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

  // ================================================================
  //  Anki 导出
  // ================================================================

  /**
   * 导出复习卡片为 Anki 兼容的 TSV 格式
   *
   * Anki TSV 格式: front\tback\ttags
   *
   * @param {Object} pack — .pwkp 格式知识包
   * @returns {{ format: string, version: string, content: string, cardCount: number }}
   */
  exportToAnki(pack) {
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

  // ================================================================
  //  Base64 导出
  // ================================================================

  /**
   * 将知识包导出为 Base64 编码字符串
   *
   * @param {Object} pack — .pwkp 格式知识包
   * @returns {string} Base64 编码的 .pwkp 数据
   */
  exportToBase64(pack) {
    const jsonStr = JSON.stringify(pack)
    return Buffer.from(jsonStr, 'utf-8').toString('base64')
  }

  // ================================================================
  //  序列化/持久化
  // ================================================================

  /**
   * 导出所有数据（用于持久化到 chrome.storage）
   *
   * @returns {{ version: number, installedPacks: Object, communityIndex: Object }}
   */
  exportData() {
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

  /**
   * 从导出数据恢复（从 chrome.storage 读取后调用）
   *
   * @param {Object} data — exportData() 返回的结构
   */
  importData(data) {
    if (!data || typeof data !== 'object') return

    // 恢复已安装包
    if (data.installedPacks && typeof data.installedPacks === 'object') {
      for (const [id, pack] of Object.entries(data.installedPacks)) {
        this._installedPacks.set(id, pack)

        // 重建 URL 索引
        for (const bm of (pack.bookmarks || [])) {
          const url = bm.url || ''
          if (!this._urlIndex.has(url)) {
            this._urlIndex.set(url, new Set())
          }
          this._urlIndex.get(url).add(id)
        }
      }
    }

    // 恢复社区索引
    if (data.communityIndex && typeof data.communityIndex === 'object') {
      for (const [id, entry] of Object.entries(data.communityIndex)) {
        this._communityIndex.set(id, entry)
      }
    }
  }
}
