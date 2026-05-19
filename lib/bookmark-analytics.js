/**
 * BookmarkAnalytics — 书签分析仪表盘 (R130 拆分)
 *
 * 高级分析方法和内部工具迁移至 bookmark-analytics-advanced.js。
 * 此文件保留核心方法并 re-export BookmarkAnalyticsAdvanced 的方法以保持向后兼容。
 *
 * @module lib/bookmark-analytics
 */

import { BookmarkAnalyticsAdvanced } from './bookmark-analytics-advanced.js'

// Re-export for direct access
export { BookmarkAnalyticsAdvanced } from './bookmark-analytics-advanced.js'

class BookmarkAnalytics {

  // ==================== Core Methods ====================

  static getOverview(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : []

    const folders = new Set()
    const tags = new Set()
    const domains = new Set()
    let bookmarksWithTags = 0
    let bookmarksWithFolders = 0
    let bookmarksWithoutUrl = 0
    let totalTagCount = 0

    for (const bm of list) {
      if (Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
        bookmarksWithFolders++
        for (let i = 1; i <= bm.folderPath.length; i++) {
          folders.add(bm.folderPath.slice(0, i).join('/'))
        }
      }

      if (Array.isArray(bm.tags) && bm.tags.length > 0) {
        bookmarksWithTags++
        totalTagCount += bm.tags.length
        for (const tag of bm.tags) {
          if (typeof tag === 'string' && tag.trim()) {
            tags.add(tag.trim().toLowerCase())
          }
        }
      }

      if (bm.url && typeof bm.url === 'string') {
        const domain = BookmarkAnalytics._extractDomain(bm.url)
        if (domain) domains.add(domain)
      } else {
        bookmarksWithoutUrl++
      }
    }

    return {
      totalBookmarks: list.length,
      totalFolders: folders.size,
      totalTags: tags.size,
      totalDomains: domains.size,
      bookmarksWithTags,
      bookmarksWithFolders,
      bookmarksWithoutUrl,
      avgTagsPerBookmark: list.length === 0
        ? 0
        : +(totalTagCount / list.length).toFixed(2),
    }
  }

  static getTimeline(bookmarks, granularity = 'daily') {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const counts = new Map()

    for (const bm of list) {
      if (!bm.dateAdded) continue
      const key = BookmarkAnalytics._toPeriod(bm.dateAdded, granularity)
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }))
  }

  static getDomainStats(bookmarks, topN = 20) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const counts = new Map()
    let withDomain = 0

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue
      const domain = BookmarkAnalytics._extractDomain(bm.url)
      if (!domain) continue
      counts.set(domain, (counts.get(domain) || 0) + 1)
      withDomain++
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: withDomain === 0 ? 0 : +((count / withDomain) * 100).toFixed(2),
      }))
  }

  static getTagStats(bookmarks, topN = 20) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const counts = new Map()
    let totalTagUsages = 0

    for (const bm of list) {
      if (!Array.isArray(bm.tags)) continue
      for (const tag of bm.tags) {
        if (typeof tag !== 'string' || !tag.trim()) continue
        const normalized = tag.trim().toLowerCase()
        counts.set(normalized, (counts.get(normalized) || 0) + 1)
        totalTagUsages++
      }
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: totalTagUsages === 0 ? 0 : +((count / totalTagUsages) * 100).toFixed(2),
      }))
  }

  static getFolderDepth(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const depthCounts = new Map()

    for (const bm of list) {
      const depth = Array.isArray(bm.folderPath) ? bm.folderPath.length : 0
      depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1)
    }

    const total = list.length

    return [...depthCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, count]) => ({
        depth,
        count,
        percentage: total === 0 ? 0 : +((count / total) * 100).toFixed(2),
      }))
  }

  static getGrowthRate(bookmarks, granularity = 'monthly') {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const monthlyCounts = new Map()

    for (const bm of list) {
      if (!bm.dateAdded) continue
      const month = BookmarkAnalytics._toPeriod(bm.dateAdded, 'monthly')
      if (!month) continue
      monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1)
    }

    const periodCounts = new Map()

    if (granularity === 'quarterly') {
      for (const [month, count] of monthlyCounts.entries()) {
        const quarter = BookmarkAnalytics._monthToQuarter(month)
        periodCounts.set(quarter, (periodCounts.get(quarter) || 0) + count)
      }
    } else {
      for (const [month, count] of monthlyCounts.entries()) {
        periodCounts.set(month, count)
      }
    }

    const sorted = [...periodCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    const result = []
    let cumulative = 0
    let prevCount = 0

    for (const [period, count] of sorted) {
      cumulative += count
      const growthRate = prevCount === 0 ? null : +(((count - prevCount) / prevCount) * 100).toFixed(2)
      result.push({ period, count, cumulative, growthRate })
      prevCount = count
    }

    return result
  }

  // ==================== Advanced Methods (delegated) ====================

  static getVisitStats(bookmarks) {
    return BookmarkAnalyticsAdvanced.getVisitStats(bookmarks)
  }

  static getCollectionTrend(bookmarks, days = 30) {
    return BookmarkAnalyticsAdvanced.getCollectionTrend(bookmarks, days)
  }

  static getDomainDistribution(bookmarks, topN = 15) {
    return BookmarkAnalyticsAdvanced.getDomainDistribution(bookmarks, topN)
  }

  static getActivityHeatmap(bookmarks, weeks = 4) {
    return BookmarkAnalyticsAdvanced.getActivityHeatmap(bookmarks, weeks)
  }

  // ==================== Internal Helpers (delegated) ====================

  static _extractDomain(url) {
    return BookmarkAnalyticsAdvanced._extractDomain(url)
  }

  static _toPeriod(dateStr, granularity) {
    return BookmarkAnalyticsAdvanced._toPeriod(dateStr, granularity)
  }

  static _monthToQuarter(monthKey) {
    return BookmarkAnalyticsAdvanced._monthToQuarter(monthKey)
  }

  static _formatDate(d) {
    return BookmarkAnalyticsAdvanced._formatDate(d)
  }
}

export { BookmarkAnalytics }
export default BookmarkAnalytics
