/**
 * WeeklyDigest — 学习周报生成
 *
 * 自动生成用户每周学习摘要：
 *   1) 统计本周新增书签、阅读完成数、提问次数、知识条目增长
 *   2) 按领域分布生成文字报告 + 数据摘要
 *   3) 识别本周学习重点领域和薄弱领域（复用 BookmarkGapDetector）
 *   4) 推荐下周学习方向（结合 learning-path.js 和 gap-detector.js）
 *   5) 通过 BookmarkNotifications 在每周一推送摘要
 *   6) 支持导出 Markdown/HTML 格式周报
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-weekly-digest
 */

import { BookmarkGapDetector } from './bookmark-gap-detector.js';
import { buildTopicStats } from './learning-path.js';

// ==================== 常量 ====================

/** 一周的毫秒数 */
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 一天的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 领域关键词映射 — 用于从标签/标题推断领域 */
const DOMAIN_KEYWORDS = {
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

// ==================== 核心类 ====================

class WeeklyDigest {
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

  /**
   * 统计本周新增书签
   * @returns {Object[]}
   */
  getNewBookmarksThisWeek() {
    return this.bookmarks.filter(bm => {
      const added = bm.dateAdded || bm.createdAt || bm.timestamp || 0;
      return added >= this._weekRange.start && added <= this._weekRange.end;
    });
  }

  /**
   * 统计上周新增书签数
   * @returns {number}
   */
  getNewBookmarksLastWeek() {
    return this.bookmarks.filter(bm => {
      const added = bm.dateAdded || bm.createdAt || bm.timestamp || 0;
      return added >= this._lastWeekRange.start && added <= this._lastWeekRange.end;
    }).length;
  }

  /**
   * 统计本周阅读完成数
   * @returns {Object[]}
   */
  getCompletedReadingsThisWeek() {
    return this.readingHistory.filter(r => {
      const completedAt = r.completedAt || r.readAt || r.timestamp || 0;
      return completedAt >= this._weekRange.start && completedAt <= this._weekRange.end;
    });
  }

  /**
   * 统计本周提问次数
   * @returns {number}
   */
  getQuestionCountThisWeek() {
    return this.conversations.filter(c => {
      const ts = c.timestamp || c.createdAt || 0;
      return ts >= this._weekRange.start && ts <= this._weekRange.end;
    }).length;
  }

  /**
   * 统计本周知识条目增长
   * @returns {Object[]}
   */
  getNewKnowledgeEntriesThisWeek() {
    return this.knowledgeEntries.filter(e => {
      const ts = e.createdAt || e.timestamp || 0;
      return ts >= this._weekRange.start && ts <= this._weekRange.end;
    });
  }

  // ==================== 领域分析 ====================

  /**
   * 按领域分布统计本周书签
   * @returns {{ domain: string, count: number, percentage: number }[]}
   */
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

  /**
   * 识别本周学习重点领域（新增书签最多的领域）
   * @param {number} [limit=3]
   * @returns {{ domain: string, count: number }[]}
   */
  getFocusDomains(limit = 3) {
    return this.getDomainDistribution().slice(0, limit).map(d => ({
      domain: d.domain,
      count: d.count,
    }));
  }

  /**
   * 识别薄弱领域 — 复用 BookmarkGapDetector
   * @returns {{ domain: string, count: number }[]}
   */
  getWeakDomains() {
    const detector = new BookmarkGapDetector({
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
    });
    return detector.getWeaknesses();
  }

  // ==================== 推荐方向 ====================

  /**
   * 推荐下周学习方向
   * 结合 GapDetector 的知识盲区和 LearningPath 的主题统计
   * @param {number} [limit=5]
   * @returns {{ domain: string, reason: string, suggestedTopics: string[] }[]}
   */
  getNextWeekRecommendations(limit = 5) {
    const detector = new BookmarkGapDetector({
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
    });

    const gapRecs = detector.getRecommendations(limit);

    // 基于本周学习主题推荐相关进阶方向
    const focusDomains = this.getFocusDomains(3);
    const topicStats = buildTopicStats(this.knowledgeEntries);

    // 合并推荐: 盲区推荐优先，然后是基于热门主题的进阶推荐
    const recMap = new Map();

    for (const rec of gapRecs) {
      recMap.set(rec.domain, rec);
    }

    // 从聚焦领域补充进阶建议
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

  // ==================== 报告生成 ====================

  /**
   * 生成完整的周报数据对象
   * @returns {Object}
   */
  generateReport() {
    const newBookmarks = this.getNewBookmarksThisWeek();
    const completedReadings = this.getCompletedReadingsThisWeek();
    const questionCount = this.getQuestionCountThisWeek();
    const newKnowledge = this.getNewKnowledgeEntriesThisWeek();
    const domainDistribution = this.getDomainDistribution();
    const focusDomains = this.getFocusDomains();
    const weakDomains = this.getWeakDomains();
    const recommendations = this.getNextWeekRecommendations();

    const newBookmarksLastWeek = this.getNewBookmarksLastWeek();
    const bookmarkGrowth = newBookmarks.length - newBookmarksLastWeek;

    return {
      weekRange: {
        start: this._weekRange.start,
        end: this._weekRange.end,
        label: formatDateRange(this._weekRange),
      },
      stats: {
        newBookmarks: newBookmarks.length,
        completedReadings: completedReadings.length,
        questionCount,
        newKnowledgeEntries: newKnowledge.length,
        bookmarkGrowth,
        bookmarkGrowthDirection: bookmarkGrowth > 0 ? 'up' : bookmarkGrowth < 0 ? 'down' : 'flat',
      },
      domainDistribution,
      focusDomains,
      weakDomains: weakDomains.slice(0, 5),
      recommendations,
      generatedAt: this.now.getTime(),
    };
  }

  /**
   * 导出 Markdown 格式周报
   * @returns {string}
   */
  toMarkdown() {
    const report = this.generateReport();
    const lines = [];

    lines.push(`# 📚 PageWise 学习周报`);
    lines.push(`> ${report.weekRange.label}`);
    lines.push('');

    // 统计概览
    lines.push('## 📊 本周概览');
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 新增书签 | ${report.stats.newBookmarks} |`);
    lines.push(`| 阅读完成 | ${report.stats.completedReadings} |`);
    lines.push(`| 提问次数 | ${report.stats.questionCount} |`);
    lines.push(`| 新增知识条目 | ${report.stats.newKnowledgeEntries} |`);
    lines.push(`| 书签增长 | ${report.stats.bookmarkGrowth >= 0 ? '+' : ''}${report.stats.bookmarkGrowth} |`);
    lines.push('');

    // 领域分布
    if (report.domainDistribution.length > 0) {
      lines.push('## 🏷️ 领域分布');
      lines.push('');
      for (const d of report.domainDistribution) {
        const bar = '█'.repeat(Math.max(1, Math.round(d.percentage / 5)));
        lines.push(`- **${d.domain}**: ${d.count} 个 (${d.percentage}%) ${bar}`);
      }
      lines.push('');
    }

    // 重点领域
    if (report.focusDomains.length > 0) {
      lines.push('## 🎯 本周重点领域');
      lines.push('');
      for (const f of report.focusDomains) {
        lines.push(`- **${f.domain}** — ${f.count} 个新书签`);
      }
      lines.push('');
    }

    // 薄弱领域
    if (report.weakDomains.length > 0) {
      lines.push('## ⚠️ 薄弱领域');
      lines.push('');
      for (const w of report.weakDomains) {
        const level = w.count === 0 ? '🔴 盲区' : '🟡 不足';
        lines.push(`- ${level} **${w.domain}** (${w.count} 个书签)`);
      }
      lines.push('');
    }

    // 下周推荐
    if (report.recommendations.length > 0) {
      lines.push('## 🚀 下周学习推荐');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`### ${rec.domain}`);
        lines.push(`> ${rec.reason}`);
        lines.push('');
        if (rec.suggestedTopics && rec.suggestedTopics.length > 0) {
          for (const t of rec.suggestedTopics) {
            lines.push(`- ${t}`);
          }
          lines.push('');
        }
      }
    }

    lines.push('---');
    lines.push(`*生成时间: ${formatDate(report.generatedAt)} | PageWise 智阅*`);

    return lines.join('\n');
  }

  /**
   * 导出 HTML 格式周报
   * @param {Function} [escapeHtml] — HTML 转义函数
   * @returns {string}
   */
  toHTML(escapeHtml) {
    const report = this.generateReport();
    const esc = escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

    const parts = [];

    parts.push('<div class="weekly-digest">');
    parts.push(`<h1>📚 PageWise 学习周报</h1>`);
    parts.push(`<p class="week-range">${esc(report.weekRange.label)}</p>`);

    // 统计概览
    parts.push('<div class="stats-grid">');
    const statItems = [
      { label: '新增书签', value: report.stats.newBookmarks, icon: '🔖' },
      { label: '阅读完成', value: report.stats.completedReadings, icon: '📖' },
      { label: '提问次数', value: report.stats.questionCount, icon: '💬' },
      { label: '新增知识条目', value: report.stats.newKnowledgeEntries, icon: '🧠' },
    ];
    for (const item of statItems) {
      parts.push(`<div class="stat-card">`);
      parts.push(`  <span class="stat-icon">${item.icon}</span>`);
      parts.push(`  <span class="stat-value">${item.value}</span>`);
      parts.push(`  <span class="stat-label">${esc(item.label)}</span>`);
      parts.push(`</div>`);
    }
    parts.push('</div>');

    // 领域分布
    if (report.domainDistribution.length > 0) {
      parts.push('<h2>🏷️ 领域分布</h2>');
      parts.push('<div class="domain-bars">');
      for (const d of report.domainDistribution) {
        parts.push(`<div class="domain-row">`);
        parts.push(`  <span class="domain-name">${esc(d.domain)}</span>`);
        parts.push(`  <div class="domain-bar" style="width: ${d.percentage}%"></div>`);
        parts.push(`  <span class="domain-count">${d.count} (${d.percentage}%)</span>`);
        parts.push(`</div>`);
      }
      parts.push('</div>');
    }

    // 重点领域
    if (report.focusDomains.length > 0) {
      parts.push('<h2>🎯 本周重点领域</h2>');
      parts.push('<ul>');
      for (const f of report.focusDomains) {
        parts.push(`<li><strong>${esc(f.domain)}</strong> — ${f.count} 个新书签</li>`);
      }
      parts.push('</ul>');
    }

    // 薄弱领域
    if (report.weakDomains.length > 0) {
      parts.push('<h2>⚠️ 薄弱领域</h2>');
      parts.push('<ul>');
      for (const w of report.weakDomains) {
        const level = w.count === 0 ? '🔴 盲区' : '🟡 不足';
        parts.push(`<li>${level} <strong>${esc(w.domain)}</strong> (${w.count} 个书签)</li>`);
      }
      parts.push('</ul>');
    }

    // 下周推荐
    if (report.recommendations.length > 0) {
      parts.push('<h2>🚀 下周学习推荐</h2>');
      for (const rec of report.recommendations) {
        parts.push(`<h3>${esc(rec.domain)}</h3>`);
        parts.push(`<blockquote>${esc(rec.reason)}</blockquote>`);
        if (rec.suggestedTopics && rec.suggestedTopics.length > 0) {
          parts.push('<ul>');
          for (const t of rec.suggestedTopics) {
            parts.push(`<li>${esc(t)}</li>`);
          }
          parts.push('</ul>');
        }
      }
    }

    parts.push(`<footer>生成时间: ${esc(formatDate(report.generatedAt))} | PageWise 智阅</footer>`);
    parts.push('</div>');

    return parts.join('\n');
  }

  // ==================== 通知推送 ====================

  /**
   * 通过 NotificationManager 推送周报摘要
   * @param {Object} notifier — NotificationManager 实例（需有 notify 方法）
   * @returns {Object|null} — 创建的通知对象，或 null
   */
  sendWeeklyNotification(notifier) {
    if (!notifier || typeof notifier.notify !== 'function') return null;

    const report = this.generateReport();
    const stats = report.stats;

    const message = [
      `📚 本周学习周报 (${report.weekRange.label})`,
      `新增书签: ${stats.newBookmarks} | 阅读完成: ${stats.completedReadings}`,
      `提问: ${stats.questionCount} | 知识增长: ${stats.newKnowledgeEntries}`,
      report.focusDomains.length > 0
        ? `重点领域: ${report.focusDomains.map(f => f.domain).join('、')}`
        : '本周暂无新书签',
      report.weakDomains.length > 0
        ? `薄弱领域: ${report.weakDomains.slice(0, 3).map(w => w.domain).join('、')}`
        : '',
    ].filter(Boolean).join('\n');

    return notifier.notify(message, 'info');
  }

  /**
   * 检查今天是否是周一（推送日）
   * @param {Date} [now]
   * @returns {boolean}
   */
  static isMonday(now) {
    const d = now instanceof Date ? now : new Date();
    return d.getDay() === 1;
  }

  /**
   * 如果今天是周一，推送周报通知
   * @param {Object} notifier — NotificationManager 实例
   * @returns {Object|null}
   */
  notifyIfMonday(notifier) {
    if (!WeeklyDigest.isMonday(this.now)) return null;
    return this.sendWeeklyNotification(notifier);
  }
}

// ==================== 导出 ====================

export {
  WeeklyDigest,
  ONE_WEEK_MS,
  ONE_DAY_MS,
  DOMAIN_KEYWORDS,
};
export default WeeklyDigest;
