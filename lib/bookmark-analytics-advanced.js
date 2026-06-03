/**
 * BookmarkAnalyticsAdvanced — 高级分析方法 (R130 从 bookmark-analytics.js 拆分)
 *
 * 包含：
 *   - getVisitStats: 访问统计
 *   - getCollectionTrend: 收藏趋势
 *   - getDomainDistribution: 域名分布
 *   - getActivityHeatmap: 活跃度热力图
 *   - 内部工具: _extractDomain, _toPeriod, _monthToQuarter, _formatDate
 */

export class BookmarkAnalyticsAdvanced {

  static getVisitStats(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const result = {
      totalVisits: 0,
      bookmarksVisited: 0,
      unvisitedBookmarks: 0,
      avgVisits: 0,
      maxVisits: 0,
      topVisited: [],
      distribution: [
        { range: '0', count: 0 },
        { range: '1-5', count: 0 },
        { range: '6-10', count: 0 },
        { range: '11-50', count: 0 },
        { range: '50+', count: 0 },
      ],
    }

    if (list.length === 0) return result

    for (const bm of list) {
      const vc = typeof bm.visitCount === 'number' && bm.visitCount >= 0 ? bm.visitCount : 0
      result.totalVisits += vc
      if (vc > 0) {
        result.bookmarksVisited++
      } else {
        result.unvisitedBookmarks++
      }
      if (vc > result.maxVisits) result.maxVisits = vc

      if (vc === 0) result.distribution[0].count++
      else if (vc <= 5) result.distribution[1].count++
      else if (vc <= 10) result.distribution[2].count++
      else if (vc <= 50) result.distribution[3].count++
      else result.distribution[4].count++
    }

    result.avgVisits = +(result.totalVisits / list.length).toFixed(2)

    result.topVisited = [...list]
      .filter(bm => (bm.visitCount || 0) > 0)
      .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
      .slice(0, 10)
      .map(bm => ({
        id: bm.id,
        title: bm.title || '',
        url: bm.url || '',
        visitCount: bm.visitCount || 0,
      }))

    return result
  }

  static getCollectionTrend(bookmarks, days = 30) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const n = typeof days === 'number' && days > 0 ? Math.floor(days) : 30

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (n - 1))

    const dailyCounts = new Map()

    for (let i = 0; i < n; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = BookmarkAnalyticsAdvanced._formatDate(d)
      dailyCounts.set(key, 0)
    }

    for (const bm of list) {
      if (!bm.dateAdded) continue
      try {
        const d = new Date(bm.dateAdded)
        if (isNaN(d.getTime())) continue
        const key = BookmarkAnalyticsAdvanced._formatDate(d)
        if (dailyCounts.has(key)) {
          dailyCounts.set(key, dailyCounts.get(key) + 1)
        }
      } catch (e) {
        console.warn('[BookmarkAnalytics]', e?.message || e);
        // ignore parse errors
      }
    }

    const entries = [...dailyCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    const result = []
    let cumulative = 0

    for (const [date, count] of entries) {
      cumulative += count
      result.push({ date, count, cumulative })
    }

    return result
  }

  static getDomainDistribution(bookmarks, topN = 15) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const counts = new Map()
    let totalWithDomain = 0

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue
      const domain = BookmarkAnalyticsAdvanced._extractDomain(bm.url)
      if (!domain) continue
      counts.set(domain, (counts.get(domain) || 0) + 1)
      totalWithDomain++
    }

    if (totalWithDomain === 0) return []

    const colors = [
      '#4285F4', '#EA4335', '#FBBC05', '#34A853', '#FF6D01',
      '#46BDC6', '#7B1FA2', '#E91E63', '#009688', '#FF5722',
      '#607D8B', '#9C27B0', '#2196F3', '#CDDC39', '#795548',
    ]

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([domain, count], idx) => ({
        domain,
        count,
        percentage: +((count / totalWithDomain) * 100).toFixed(2),
        color: colors[idx % colors.length],
      }))
  }

  static getActivityHeatmap(bookmarks, weeks = 4) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const w = typeof weeks === 'number' && weeks > 0 ? Math.floor(weeks) : 4

    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0))
    let totalEntries = 0
    let maxValue = 0

    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - (w * 7))

    for (const bm of list) {
      if (!bm.dateAdded) continue
      try {
        const d = new Date(bm.dateAdded)
        if (isNaN(d.getTime())) continue
        if (d < cutoff) continue

        const dayIdx = (d.getUTCDay() + 6) % 7
        const hourIdx = d.getUTCHours()
        matrix[dayIdx][hourIdx]++
        totalEntries++

        if (matrix[dayIdx][hourIdx] > maxValue) {
          maxValue = matrix[dayIdx][hourIdx]
        }
      } catch (e) {
        console.warn('[BookmarkAnalytics]', e?.message || e);
        // ignore parse errors
      }
    }

    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
      matrix,
      maxValue,
      totalEntries,
    }
  }

  // ==================== Internal Helpers ====================

  static _extractDomain(url) {
    if (!url || typeof url !== 'string') return ''
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace(/^www\./i, '').toLowerCase()
    } catch (e) {
      console.warn('[BookmarkAnalytics]', e?.message || e);
      let cleaned = url.trim().replace(/^https?:\/\//i, '')
      const slash = cleaned.indexOf('/')
      if (slash !== -1) cleaned = cleaned.slice(0, slash)
      cleaned = cleaned.replace(/^www\./i, '').toLowerCase()
      return cleaned || ''
    }
  }

  static _toPeriod(dateStr, granularity) {
    if (!dateStr || typeof dateStr !== 'string') return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')

    if (granularity === 'daily') return `${year}-${month}-${day}`

    if (granularity === 'weekly') {
      const jan4 = new Date(year, 0, 4)
      const dayOfYear = Math.floor((d - jan4) / 86400000)
      const weekNum = Math.floor((dayOfYear + jan4.getDay()) / 7) + 1
      return `${year}-W${String(weekNum).padStart(2, '0')}`
    }

    return `${year}-${month}`
  }

  static _monthToQuarter(monthKey) {
    const parts = monthKey.split('-')
    if (parts.length < 2) return monthKey
    const year = parts[0]
    const m = parseInt(parts[1], 10)
    const q = Math.ceil(m / 3)
    return `${year}-Q${q}`
  }

  static _formatDate(d) {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
