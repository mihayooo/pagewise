/**
 * WeeklyDigest — 学习周报统计模块
 *
 * 从 bookmark-weekly-digest.js 拆分而来 (R193)
 * 包含: 常量、工具函数、WeeklyDigest 类（统计方法 + 领域分析 + 推荐方向）
 *
 * @module lib/bookmark-weekly-digest-stats
 */

import { BookmarkGapDetector } from './bookmark-gap-detector.js';
import { buildTopicStats } from './learning-path.js';

// ==================== 常量 ====================

/** 一周的毫秒数 */
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 一天的毫秒数 */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 领域关键词映射 — 用于从标签/标题推断领域 */
export const DOMAIN_KEYWORDS = {
  '前端': ['html', 'css', 'javascript', 'react', 'vue', 'angular', 'frontend', '前端', 'dom', 'sass', 'less', 'webpack', 'vite', 'next.js', 'nuxt'],
  '后端': ['node', 'express', 'python', 'django', 'flask', 'java', 'spring', 'go', 'rust', 'backend', '后端', 'api', 'rest', 'graphql'],
  '数据库': ['mysql', 'postgres', 'mongodb', 'redis', 'sql', 'database', '数据库', 'sqlite', 'elasticsearch', 'neo4j'],
  'DevOps': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'jenkins', 'nginx', 'linux', 'devops', 'terraform', 'ansible'],
  'AI/ML': ['ai', 'ml', 'machine learning', 'deep learning', 'llm', 'gpt', 'chatgpt', 'tensorflow', 'pytorch', '人工智能', '机器学习', '模型', 'transformer'],
  '移动开发': ['flutter', 'react native', 'ios', 'android', 'swift', 'kotlin', 'mobile', '移动', 'app开发'],
  '安全': ['security', '安全', 'oauth', 'jwt', 'https', 'ssl', 'xss', 'csrf', 'encryption', '加密'],
  '云服务': ['aws', 'azure', 'gcp', 'serverless', 'lambda', 'cloud', '云', 'cdn', 's3'],
  '数据': ['pandas', 'data', 'etl', 'spark', 'hadoop', '数据分析', '数据处理', 'dataframe', '可视化'],
  '测试': ['test', 'jest', 'mocha', 'playwright', 'cypress', '测试', 'tdd', 'e2e', 'unit test', '单元测试'],
  '设计': ['figma', 'design', 'ui', 'ux', '设计', '设计系统', '交互', '色彩', '排版'],
  '工具': ['git', 'vscode', 'npm', 'markdown', '工具', 'cli', 'editor', '编辑器', 'monorepo'],
  '架构': ['architecture', '架构', '设计模式', 'microservice', '微服务', 'ddd', 'event-driven', 'cqrs'],
  '性能': ['performance', '性能', 'core web vitals', 'lighthouse', '缓存', '优化', 'benchmark'],
};

// ==================== 工具函数 ====================

/**
 * 获取本周的起止时间（周一 00:00 → 周日 23:59:59）
 * @param {Date} [now] — 当前时间（可注入用于测试）
 * @returns {{ start: number, end: number, startDate: Date, endDate: Date }}
 */
export function getWeekRange(now) {
  const d = now instanceof Date ? new Date(now.getTime()) : new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...6=Sat
  const diffToMon = day === 0 ? 6 : day - 1; // 距周一的天数
  const startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon, 0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + ONE_WEEK_MS - 1);
  return {
    start: startDate.getTime(),
    end: endDate.getTime(),
    startDate,
    endDate,
  };
}

/**
 * 获取上一周的起止时间
 * @param {Date} [now]
 * @returns {{ start: number, end: number }}
 */
export function getLastWeekRange(now) {
  const d = now instanceof Date ? new Date(now.getTime()) : new Date();
  const thisWeek = getWeekRange(d);
  return {
    start: thisWeek.start - ONE_WEEK_MS,
    end: thisWeek.start - 1,
  };
}

/**
 * 根据标签/标题推断所属领域
 * @param {Object} bookmark
 * @returns {string[]} — 匹配到的领域列表
 */
export function inferDomains(bookmark) {
  const domains = [];
  const searchText = [
    ...(bookmark.tags || []),
    bookmark.title || '',
    ...(bookmark.folderPath || []),
  ].join(' ').toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        domains.push(domain);
        break;
      }
    }
  }

  return domains;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {number|Date} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化日期范围
 * @param {{ start: number, end: number }} range
 * @returns {string}
 */
export function formatDateRange(range) {
  return `${formatDate(range.start)} ~ ${formatDate(range.end)}`;
}

// ==================== WeeklyDigest 核心类 ====================

export class WeeklyDigest {
  /**
   * @param {Object} options
   * @param {Object[]}      options.bookmarks        — 全量书签列表
   * @param {Object[]}      [options.knowledgeEntries] — 知识库条目
   * @param {Object[]}      [options.conversations]    — 对话记录（含提问次数）
   * @param {Object[]}      [options.readingHistory]   — 阅读历史（完成记录）
   * @param {Date}          [options.now]              — 当前时间（测试注入）
   * @param {Map}           [options.clusters]         — 聚类结果
   * @param {Map}           [options.tags]             — 标签频率
   */
  constructor(options = {}) {
    this.bookmarks = Array.isArray(options.bookmarks) ? options.bookmarks : [];
    this.knowledgeEntries = Array.isArray(options.knowledgeEntries) ? options.knowledgeEntries : [];
    this.conversations = Array.isArray(options.conversations) ? options.conversations : [];
    this.readingHistory = Array.isArray(options.readingHistory) ? options.readingHistory : [];
    this.now = options.now instanceof Date ? options.now : new Date();
    this.clusters = options.clusters || new Map();
    this.tags = options.tags || new Map();

    this._weekRange = getWeekRange(this.now);
    this._lastWeekRange = getLastWeekRange(this.now);
  }

  // ==================== 统计方法 ====================

  getNewBookmarksThisWeek() {
    return this.bookmarks.filter(bm => {
      const added = bm.dateAdded || bm.createdAt || bm.timestamp || 0;
      return added >= this._weekRange.start && added <= this._weekRange.end;
    });
  }

  getNewBookmarksLastWeek() {
    return this.bookmarks.filter(bm => {
      const added = bm.dateAdded || bm.createdAt || bm.timestamp || 0;
      return added >= this._lastWeekRange.start && added <= this._lastWeekRange.end;
    }).length;
  }

  getCompletedReadingsThisWeek() {
    return this.readingHistory.filter(r => {
      const completedAt = r.completedAt || r.readAt || r.timestamp || 0;
      return completedAt >= this._weekRange.start && completedAt <= this._weekRange.end;
    });
  }

  getQuestionCountThisWeek() {
    return this.conversations.filter(c => {
      const ts = c.timestamp || c.createdAt || 0;
      return ts >= this._weekRange.start && ts <= this._weekRange.end;
    }).length;
  }

  getNewKnowledgeEntriesThisWeek() {
    return this.knowledgeEntries.filter(e => {
      const ts = e.createdAt || e.timestamp || 0;
      return ts >= this._weekRange.start && ts <= this._weekRange.end;
    });
  }

  // ==================== 领域分析 ====================

  getDomainDistribution() {
    const newBookmarks = this.getNewBookmarksThisWeek();
    const domainCount = {};

    for (const bm of newBookmarks) {
      const domains = inferDomains(bm);
      if (domains.length === 0) {
        domainCount['未分类'] = (domainCount['未分类'] || 0) + 1;
      } else {
        for (const d of domains) {
          domainCount[d] = (domainCount[d] || 0) + 1;
        }
      }
    }

    const total = Object.values(domainCount).reduce((s, c) => s + c, 0) || 1;
    return Object.entries(domainCount)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }

  getFocusDomains(limit = 3) {
    return this.getDomainDistribution().slice(0, limit).map(d => ({
      domain: d.domain,
      count: d.count,
    }));
  }

  getWeakDomains() {
    const detector = new BookmarkGapDetector({
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
    });
    return detector.getWeaknesses();
  }

  // ==================== 推荐方向 ====================

  getNextWeekRecommendations(limit = 5) {
    const detector = new BookmarkGapDetector({
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
    });

    const gapRecs = detector.getRecommendations(limit);

    const focusDomains = this.getFocusDomains(3);
    const topicStats = buildTopicStats(this.knowledgeEntries);

    const recMap = new Map();

    for (const rec of gapRecs) {
      recMap.set(rec.domain, rec);
    }

    for (const focus of focusDomains) {
      if (!recMap.has(focus.domain)) {
        const domainTopics = topicStats.topics
          .filter(t => t.count > 0)
          .slice(0, 2)
          .map(t => t.name);

        recMap.set(focus.domain, {
          domain: focus.domain,
          reason: `本周在 ${focus.domain} 领域投入较多（${focus.count} 个新书签），建议深入学习`,
          suggestedTopics: domainTopics.length > 0 ? domainTopics : [`深入学习 ${focus.domain}`],
        });
      }
    }

    return Array.from(recMap.values()).slice(0, limit);
  }
}
