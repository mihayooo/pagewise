/**
 * BookmarkDashboard — 书签统计仪表盘
 *
 * 提供书签库全景统计、域名分布、文件夹分布、收藏时间趋势、
 * 死链率、标签覆盖率、状态分布、知识图谱统计、使用行为统计、
 * 健康度评分，以及 JSON/Markdown 导出功能。
 *
 * @module lib/bookmark-statistics
 */

/**
 * 书签统计仪表盘
 */
export class BookmarkDashboard {
  /**
   * @param {Array} bookmarks - 书签数组
   * @param {Object} [options] - 附加数据
   * @param {Array}  [options.linkCheckerResults] - 链接检查结果
   * @param {Object} [options.telemetryData] - 使用遥测数据
   * @param {Object} [options.graphData] - 知识图谱数据 { nodes, edges }
   */
  constructor(bookmarks = [], options = {}) {
    this.bookmarks = bookmarks;
    this.linkCheckerResults = options.linkCheckerResults || null;
    this.telemetryData = options.telemetryData || null;
    this.graphData = options.graphData || null;
  }

  // ---- 辅助 ----

  /** 从 URL 提取域名 */
  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  // ---- 全景统计 ----

  getBookmarkOverview() {
    const domains = new Set();
    const folders = new Set();
    const allTags = new Set();
    let tagged = 0;

    for (const b of this.bookmarks) {
      const d = this._extractDomain(b.url);
      if (d) domains.add(d);
      if (b.folderPath && b.folderPath.length > 0) {
        folders.add(b.folderPath[0]);
      }
      if (b.tags && b.tags.length > 0) {
        tagged++;
        for (const t of b.tags) allTags.add(t);
      }
    }

    return {
      total: this.bookmarks.length,
      totalDomains: domains.size,
      totalFolders: folders.size,
      totalTags: allTags.size,
      tagCoverageRate: this.bookmarks.length ? Math.round((tagged / this.bookmarks.length) * 100) : 0,
    };
  }

  // ---- 域名分布 Top-10 ----

  getDomainDistribution() {
    const map = new Map();
    for (const b of this.bookmarks) {
      const d = this._extractDomain(b.url);
      if (d) map.set(d, (map.get(d) || 0) + 1);
    }
    const total = this.bookmarks.length || 1;
    return [...map.entries()]
      .map(([domain, count]) => ({ domain, count, percentage: Math.round((count / total) * 100 * 10) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ---- 文件夹分布 ----

  getFolderDistribution() {
    const map = new Map();
    for (const b of this.bookmarks) {
      if (b.folderPath && b.folderPath.length > 0) {
        const f = b.folderPath[0];
        map.set(f, (map.get(f) || 0) + 1);
      }
    }
    return [...map.entries()].map(([folder, count]) => ({ folder, count }));
  }

  // ---- 收藏时间趋势 ----

  getCollectionTrend(granularity = 'month') {
    const map = new Map();
    for (const b of this.bookmarks) {
      if (!b.dateAdded) continue;
      const d = new Date(b.dateAdded);
      let key;
      if (granularity === 'day') {
        key = d.toISOString().slice(0, 10);
      } else if (granularity === 'week') {
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  }

  // ---- 死链率 ----

  getDeadLinkRate() {
    const total = this.bookmarks.length;

    if (this.linkCheckerResults && this.linkCheckerResults.length > 0) {
      const dead = this.linkCheckerResults.filter(r => r.status === 'dead').length;
      return { total: this.linkCheckerResults.length, dead, rate: Math.round((dead / this.linkCheckerResults.length) * 100) };
    }

    const dead = this.bookmarks.filter(b => b.dead === true).length;
    return { total, dead, rate: total ? Math.round((dead / total) * 100) : 0 };
  }

  // ---- 标签覆盖率 ----

  getTagCoverage() {
    const total = this.bookmarks.length;
    const withTags = this.bookmarks.filter(b => b.tags && b.tags.length > 0).length;
    return { total, withTags, rate: total ? Math.round((withTags / total) * 100) : 0 };
  }

  // ---- 状态分布 ----

  getStatusDistribution() {
    let read = 0, reading = 0, unread = 0;
    for (const b of this.bookmarks) {
      const s = b.status || 'unread';
      if (s === 'read') read++;
      else if (s === 'reading') reading++;
      else unread++;
    }
    return { read, reading, unread };
  }

  // ---- 知识图谱统计 ----

  getGraphStats() {
    if (!this.graphData) {
      return { nodes: 0, edges: 0, avgDegree: 0, isolatedNodes: 0, largestComponentSize: 0, clusteringCoefficient: 0 };
    }

    const nodes = Array.isArray(this.graphData.nodes) ? this.graphData.nodes : [];
    const edges = Array.isArray(this.graphData.edges) ? this.graphData.edges : [];
    const nodeCount = nodes.length;

    // degree map
    const degree = new Map();
    const adj = new Map();
    for (const n of nodes) {
      degree.set(n.id, 0);
      adj.set(n.id, new Set());
    }
    for (const e of edges) {
      if (degree.has(e.source) && degree.has(e.target)) {
        degree.set(e.source, degree.get(e.source) + 1);
        degree.set(e.target, degree.get(e.target) + 1);
        adj.get(e.source).add(e.target);
        adj.get(e.target).add(e.source);
      }
    }

    let totalDegree = 0;
    for (const v of degree.values()) totalDegree += v;
    const avgDegree = nodeCount ? Math.round((totalDegree / nodeCount) * 10) / 10 : 0;

    // isolated
    let isolatedNodes = 0;
    for (const v of degree.values()) { if (v === 0) isolatedNodes++; }

    // connected components (BFS)
    const visited = new Set();
    let largestComponentSize = 0;
    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      const queue = [n.id];
      visited.add(n.id);
      let size = 0;
      while (queue.length) {
        const cur = queue.shift();
        size++;
        for (const nb of adj.get(cur) || []) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      if (size > largestComponentSize) largestComponentSize = size;
    }

    // clustering coefficient (average local)
    let coeffSum = 0;
    let coeffCount = 0;
    for (const n of nodes) {
      const neighbors = [...(adj.get(n.id) || [])];
      if (neighbors.length < 2) continue;
      let triangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (adj.get(neighbors[i]) && adj.get(neighbors[i]).has(neighbors[j])) triangles++;
        }
      }
      const possible = (neighbors.length * (neighbors.length - 1)) / 2;
      coeffSum += triangles / possible;
      coeffCount++;
    }

    return {
      nodes: nodeCount,
      edges: edges.length,
      avgDegree,
      isolatedNodes,
      largestComponentSize,
      clusteringCoefficient: coeffCount ? coeffSum / coeffCount : 0,
    };
  }

  // ---- 使用行为统计 ----

  getBehaviorStats() {
    if (!this.telemetryData || !this.telemetryData.features) {
      return { dailyAsks: 0, bookmarkFrequency: 0, searchFrequency: 0, totalAsks: 0, totalBookmarks: 0, totalSearches: 0 };
    }

    const feats = this.telemetryData.features;
    const totalAsks = feats.ask_ai || 0;
    const totalBookmarks = feats.bookmark || 0;
    const totalSearches = feats.knowledge_search || 0;

    // span in days
    const dates = this.bookmarks.map(b => b.dateAdded).filter(Boolean);
    let span = 30;
    if (dates.length > 1) {
      const minD = Math.min(...dates);
      const maxD = Math.max(...dates);
      span = Math.max(1, Math.ceil((maxD - minD) / 86400000));
    }

    return {
      totalAsks,
      totalBookmarks,
      totalSearches,
      dailyAsks: Math.round((totalAsks / span) * 100) / 100,
      bookmarkFrequency: Math.round((totalBookmarks / span) * 100) / 100,
      searchFrequency: Math.round((totalSearches / span) * 100) / 100,
    };
  }

  // ---- 健康度评分 ----

  getHealthScore() {
    const n = this.bookmarks.length;
    if (n === 0) return { score: 0, breakdown: [] };

    const breakdown = [];

    // dead link factor (0=perfect, 100=all dead) — weight 40%
    const deadRate = n ? this.bookmarks.filter(b => b.dead === true).length / n : 0;
    const deadScore = (1 - deadRate) * 100;
    breakdown.push({ factor: 'deadLinkRate', value: Math.round(deadRate * 100), weight: 40, points: deadScore });

    // tag coverage factor (0=none tagged, 100=all tagged) — weight 20%
    const tagRate = n ? this.bookmarks.filter(b => b.tags && b.tags.length > 0).length / n : 0;
    const tagScore = tagRate * 100;
    breakdown.push({ factor: 'tagCoverage', value: Math.round(tagRate * 100), weight: 20, points: tagScore });

    // folder uniformity factor — weight 20%
    const folders = new Set();
    for (const b of this.bookmarks) { if (b.folderPath && b.folderPath[0]) folders.add(b.folderPath[0]); }
    const uniformity = Math.min(1, folders.size / n);
    const uniScore = uniformity * 100;
    breakdown.push({ factor: 'uniformity', value: Math.round(uniformity * 100), weight: 20, points: uniScore });

    // activity factor — based on bookmarks added in last 30 days — weight 20%
    const now = Date.now();
    const recentDays = 30 * 86400000;
    const recent = this.bookmarks.filter(b => b.dateAdded && (now - b.dateAdded) < recentDays).length;
    const activity = Math.min(1, recent / n);
    const actScore = activity * 100;
    breakdown.push({ factor: 'activity', value: Math.round(activity * 100), weight: 20, points: actScore });

    // weighted average: deadLinkRate 40%, tagCoverage 20%, uniformity 20%, activity 20%
    const raw = (deadScore * 40 + tagScore * 20 + uniScore * 20 + actScore * 20) / 100;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    return { score, breakdown };
  }

  // ---- 导出 JSON ----

  exportJSON() {
    return {
      generatedAt: new Date().toISOString(),
      overview: this.getBookmarkOverview(),
      domainDistribution: this.getDomainDistribution(),
      folderDistribution: this.getFolderDistribution(),
      collectionTrend: this.getCollectionTrend(),
      deadLinkRate: this.getDeadLinkRate(),
      tagCoverage: this.getTagCoverage(),
      statusDistribution: this.getStatusDistribution(),
      graphStats: this.getGraphStats(),
      behaviorStats: this.getBehaviorStats(),
      healthScore: this.getHealthScore(),
    };
  }

  // ---- 导出 Markdown ----

  exportMarkdown() {
    const ov = this.getBookmarkOverview();
    const dist = this.getDomainDistribution();
    const folders = this.getFolderDistribution();
    const trend = this.getCollectionTrend();
    const dlr = this.getDeadLinkRate();
    const tc = this.getTagCoverage();
    const sd = this.getStatusDistribution();
    const gs = this.getGraphStats();

    let md = `# 书签统计仪表盘\n\n`;
    md += `> 总计: ${ov.total} 书签 | 域名: ${ov.totalDomains} | 文件夹: ${ov.totalFolders} | 标签: ${ov.totalTags}\n\n`;

    if (dist.length) {
      md += `## 域名分布\n\n| 域名 | 数量 | 占比 |\n|------|------|------|\n`;
      for (const d of dist) md += `| ${d.domain} | ${d.count} | ${d.percentage}% |\n`;
      md += '\n';
    }

    if (folders.length) {
      md += `## 文件夹分布\n\n| 文件夹 | 数量 |\n|--------|------|\n`;
      for (const f of folders) md += `| ${f.folder} | ${f.count} |\n`;
      md += '\n';
    }

    if (trend.length) {
      md += `## 收藏趋势\n\n| 时间 | 数量 |\n|------|------|\n`;
      for (const t of trend) md += `| ${t.date} | ${t.count} |\n`;
      md += '\n';
    }

    md += `## 死链率: ${dlr.dead}/${dlr.total} (${dlr.rate}%)\n\n`;
    md += `## 标签覆盖率: ${tc.withTags}/${tc.total} (${tc.rate}%)\n\n`;
    md += `## 状态分布: 已读 ${sd.read} | 阅读中 ${sd.reading} | 未读 ${sd.unread}\n\n`;

    if (gs.nodes > 0) {
      md += `## 知识图谱: ${gs.nodes} 节点, ${gs.edges} 边, 平均度 ${gs.avgDegree}\n\n`;
    }

    return md;
  }

  // ---- 综合仪表盘 ----

  getDashboard() {
    return {
      overview: this.getBookmarkOverview(),
      domainDistribution: this.getDomainDistribution(),
      folderDistribution: this.getFolderDistribution(),
      collectionTrend: this.getCollectionTrend(),
      deadLinkRate: this.getDeadLinkRate(),
      tagCoverage: this.getTagCoverage(),
      statusDistribution: this.getStatusDistribution(),
      graphStats: this.getGraphStats(),
      behaviorStats: this.getBehaviorStats(),
      healthScore: this.getHealthScore(),
    };
  }
}
