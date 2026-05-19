/**
 * BookmarkAIRecommendations — 收藏画像分析子模块
 *
 * 从 bookmark-ai-recommender.js 拆分，负责:
 *   - ProfileAnalyzer — 用户收藏画像分析
 *   - _inferCategory / _judgeDifficulty / _extractDomain — 内部工具
 *
 * @module lib/bookmark-ai-recommender-profile
 */

/** 最近收藏时间窗口: 30 天 */
const RECENT_DAYS = 30
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000

/** 难度关键词规则 */
const DIFFICULTY_RULES = [
  {
    level: 'beginner',
    keywords: [
      'tutorial', 'getting started', 'introduction', 'beginner', 'basics',
      'quick start', 'first steps', 'hello world', 'starter',
      '入门', '教程', '快速上手', '基础', '初学', '新手',
    ],
  },
  {
    level: 'intermediate',
    keywords: [
      'advanced', 'deep dive', 'best practices', 'patterns', 'practical',
      'hands-on', 'cookbook', 'in practice', 'tips', 'tricks',
      '进阶', '最佳实践', '实战', '实践', '技巧',
    ],
  },
  {
    level: 'advanced',
    keywords: [
      'architecture', 'internals', 'performance', 'optimization', 'source code',
      'under the hood', 'scaling', 'benchmark', 'profiling', 'production-ready',
      '源码', '架构', '性能优化', '深入理解', '底层', '原理',
    ],
  },
]

/**
 * ProfileAnalyzer — 收藏画像分析器
 *
 * 从 BookmarkAIRecommendations 类提取的纯分析逻辑。
 * 不依赖 AIClient，可独立使用。
 */
export class ProfileAnalyzer {
  /**
   * 分析用户收藏模式，生成结构化画像。
   *
   * @param {Array}  bookmarks — 全量书签数组
   * @param {Object} [context] — 可选上下文 { clusters, gapResult, progressSummary }
   * @returns {Object} 用户画像
   */
  analyzeProfile(bookmarks, context = {}) {
    if (!Array.isArray(bookmarks)) {
      throw new Error('bookmarks must be an array')
    }

    // 1. 高频域名 Top-5
    const domainMap = new Map()
    for (const bm of bookmarks) {
      const domain = this._extractDomain(bm.url || '')
      if (domain) {
        domainMap.set(domain, (domainMap.get(domain) || 0) + 1)
      }
    }
    const total = bookmarks.length || 1
    const topDomains = [...domainMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({
        domain,
        count,
        ratio: Math.round((count / total) * 100) / 100,
      }))

    // 2. 领域分布 Top-5
    const categoryMap = new Map()
    for (const bm of bookmarks) {
      const category = this._inferCategory(bm)
      if (category) {
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1)
      }
    }
    const topCategories = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({
        category,
        count,
        ratio: Math.round((count / total) * 100) / 100,
      }))

    // 3. 知识强项与盲区
    let strengths = []
    let gaps = []

    if (context.clusters && context.clusters instanceof Map) {
      for (const [cat, bms] of context.clusters) {
        const count = bms.length
        if (count >= 10) strengths.push(cat)
        else if (count <= 2) gaps.push(cat)
      }
    } else if (context.gapResult) {
      strengths = context.gapResult.strengths || []
      gaps = context.gapResult.gaps || []
    } else {
      for (const [cat, count] of categoryMap) {
        if (count >= 10) strengths.push(cat)
        else if (count <= 2) gaps.push(cat)
      }
    }

    // 4. 近 30 天收藏焦点
    const now = Date.now()
    const recentCutoff = now - RECENT_MS
    const recentCategoryMap = new Map()
    for (const bm of bookmarks) {
      const ts = bm.dateAdded || 0
      if (ts >= recentCutoff) {
        const category = this._inferCategory(bm)
        if (category) {
          recentCategoryMap.set(category, (recentCategoryMap.get(category) || 0) + 1)
        }
      }
    }
    const recentFocus = [...recentCategoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }))

    // 5. 阅读概况
    let readCount = 0
    let readingCount = 0
    let unreadCount = 0
    for (const bm of bookmarks) {
      const status = bm.status || 'unread'
      if (status === 'read') readCount++
      else if (status === 'reading') readingCount++
      else unreadCount++
    }
    const readingProgress = {
      read: readCount,
      reading: readingCount,
      unread: unreadCount,
      readRatio: total > 0 ? Math.round((readCount / total) * 100) / 100 : 0,
    }

    // 6. 难度分布
    const difficultyDistribution = { beginner: 0, intermediate: 0, advanced: 0 }
    for (const bm of bookmarks) {
      const diff = this._judgeDifficulty(bm)
      difficultyDistribution[diff] = (difficultyDistribution[diff] || 0) + 1
    }

    return {
      totalBookmarks: bookmarks.length,
      topDomains,
      topCategories,
      strengths,
      gaps,
      recentFocus,
      readingProgress,
      difficultyDistribution,
    }
  }

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string}
   */
  _extractDomain(url) {
    if (!url || typeof url !== 'string') return ''
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return ''
    }
  }

  /**
   * 推断书签所属领域
   * @param {Object} bookmark
   * @returns {string}
   */
  _inferCategory(bookmark) {
    if (bookmark.folderPath && bookmark.folderPath.length > 0) {
      return bookmark.folderPath[0]
    }
    if (bookmark.tags && bookmark.tags.length > 0) {
      return bookmark.tags[0]
    }
    return '其他'
  }

  /**
   * 判断书签难度等级
   * @param {Object} bookmark
   * @returns {'beginner'|'intermediate'|'advanced'}
   */
  _judgeDifficulty(bookmark) {
    const text = [
      bookmark.title || '',
      (bookmark.tags || []).join(' '),
      (bookmark.folderPath || []).join(' '),
    ].join(' ').toLowerCase()

    for (const rule of DIFFICULTY_RULES) {
      for (const kw of rule.keywords) {
        if (text.includes(kw.toLowerCase())) {
          return rule.level
        }
      }
    }
    return 'intermediate'
  }
}
