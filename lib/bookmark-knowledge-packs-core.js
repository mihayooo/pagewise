/**
 * BookmarkKnowledgePacks — 知识包核心（创建、脱敏、社区管理）
 *
 * 从 bookmark-knowledge-packs.js 拆分而来 (R193)
 * 包含: 常量、工具函数、constructor、createKnowledgePack、
 *       sanitizePack、listCommunityPacks、searchPacks、ratePack
 *
 * @module lib/bookmark-knowledge-packs-core
 */

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
export function computeChecksum(str) {
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
export function deepCopy(data) {
  return JSON.parse(JSON.stringify(data))
}

/**
 * 生成唯一 pack ID
 * @param {Function} nowFn
 * @returns {string}
 * @private
 */
export function generatePackId(nowFn) {
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
export function compareVersions(v1, v2) {
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

/** 导出内部常量供 io 模块使用 */
export { DATA_VERSION, _PACK_INDEX_STORAGE_KEY, _INSTALLED_PACKS_STORAGE_KEY }

// ==================== BookmarkKnowledgePacks ====================

/** BookmarkKnowledgePacks 类 */
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
      return sanitized
    }

    for (const bm of sanitized.bookmarks) {
      delete bm.dateAdded
      delete bm.notes
      delete bm.folderPath
    }

    for (const note of sanitized.notes) {
      if (note.content) {
        note.content = note.content
          .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[redacted-email]')
          .replace(/password|密码|secret|密钥|token|api.?key/gi, '[redacted]')
      }
    }

    if (visibility === 'public') {
      sanitized.notes = []
      sanitized.tags = sanitized.tags.filter(t => {
        const name = (t.name || '').toLowerCase()
        return !name.startsWith('my-') && !name.startsWith('个人') && !name.startsWith('private')
      })
    }

    return sanitized
  }

  // ================================================================
  //  社区包管理
  // ================================================================

  /**
   * 列出本地已导入的知识包索引
   * @returns {Array<CommunityIndexEntry>}
   */
  listCommunityPacks() {
    const result = []
    for (const entry of this._communityIndex.values()) {
      result.push({ ...entry })
    }
    result.sort((a, b) => b.downloadCount - a.downloadCount)
    return result
  }

  /**
   * 按关键词搜索知识包
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
}
