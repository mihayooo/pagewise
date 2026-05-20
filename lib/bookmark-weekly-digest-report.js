/**
 * WeeklyDigest — 学习周报报告生成与通知
 *
 * 从 bookmark-weekly-digest.js 拆分而来 (R193)
 * 包含: generateReport、toMarkdown、toHTML、
 *       sendWeeklyNotification、isMonday、notifyIfMonday
 *
 * @module lib/bookmark-weekly-digest-report
 */

import { WeeklyDigest, formatDateRange, formatDate } from './bookmark-weekly-digest-stats.js';

// ==================== 报告生成 ====================

WeeklyDigest.prototype.generateReport = function() {
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
};

WeeklyDigest.prototype.toMarkdown = function() {
  const report = this.generateReport();
  const lines = [];

  lines.push(`# 📚 PageWise 学习周报`);
  lines.push(`> ${report.weekRange.label}`);
  lines.push('');

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

  if (report.domainDistribution.length > 0) {
    lines.push('## 🏷️ 领域分布');
    lines.push('');
    for (const d of report.domainDistribution) {
      const bar = '█'.repeat(Math.max(1, Math.round(d.percentage / 5)));
      lines.push(`- **${d.domain}**: ${d.count} 个 (${d.percentage}%) ${bar}`);
    }
    lines.push('');
  }

  if (report.focusDomains.length > 0) {
    lines.push('## 🎯 本周重点领域');
    lines.push('');
    for (const f of report.focusDomains) {
      lines.push(`- **${f.domain}** — ${f.count} 个新书签`);
    }
    lines.push('');
  }

  if (report.weakDomains.length > 0) {
    lines.push('## ⚠️ 薄弱领域');
    lines.push('');
    for (const w of report.weakDomains) {
      const level = w.count === 0 ? '🔴 盲区' : '🟡 不足';
      lines.push(`- ${level} **${w.domain}** (${w.count} 个书签)`);
    }
    lines.push('');
  }

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
};

WeeklyDigest.prototype.toHTML = function(escapeHtml) {
  const report = this.generateReport();
  const esc = escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  const parts = [];

  parts.push('<div class="weekly-digest">');
  parts.push(`<h1>📚 PageWise 学习周报</h1>`);
  parts.push(`<p class="week-range">${esc(report.weekRange.label)}</p>`);

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

  if (report.focusDomains.length > 0) {
    parts.push('<h2>🎯 本周重点领域</h2>');
    parts.push('<ul>');
    for (const f of report.focusDomains) {
      parts.push(`<li><strong>${esc(f.domain)}</strong> — ${f.count} 个新书签</li>`);
    }
    parts.push('</ul>');
  }

  if (report.weakDomains.length > 0) {
    parts.push('<h2>⚠️ 薄弱领域</h2>');
    parts.push('<ul>');
    for (const w of report.weakDomains) {
      const level = w.count === 0 ? '🔴 盲区' : '🟡 不足';
      parts.push(`<li>${level} <strong>${esc(w.domain)}</strong> (${w.count} 个书签)</li>`);
    }
    parts.push('</ul>');
  }

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
};

// ==================== 通知推送 ====================

WeeklyDigest.prototype.sendWeeklyNotification = function(notifier) {
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
};

WeeklyDigest.isMonday = function(now) {
  const d = now instanceof Date ? now : new Date();
  return d.getDay() === 1;
};

WeeklyDigest.prototype.notifyIfMonday = function(notifier) {
  if (!WeeklyDigest.isMonday(this.now)) return null;
  return this.sendWeeklyNotification(notifier);
};
