/**
 * test-bookmark-weekly-digest.js — 学习周报模块单元测试
 *
 * R165: WeeklyDigest — ≥25 用例
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WeeklyDigest,
  getWeekRange,
  getLastWeekRange,
  inferDomains,
  formatDate,
  formatDateRange,
  ONE_WEEK_MS,
  ONE_DAY_MS,
  DOMAIN_KEYWORDS,
} from '../lib/bookmark-weekly-digest.js';

// ==================== 工具函数 ====================

/** 创建指定星期几的 Date（周一=1 … 周日=7，便于测试） */
function makeDate(year, month, day, hour = 12, min = 0) {
  return new Date(year, month - 1, day, hour, min, 0, 0);
}

/** 辅助：计算该周的周一 00:00 */
function mondayOf(d) {
  const range = getWeekRange(d);
  return new Date(range.start);
}

// ==================== getWeekRange ====================

describe('getWeekRange', () => {
  it('周一输入应返回当天 00:00 作为起始', () => {
    // 2026-05-18 是周一
    const now = makeDate(2026, 5, 18, 15, 30);
    const range = getWeekRange(now);
    const start = new Date(range.start);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 4); // May = 4
    assert.equal(start.getDate(), 18);
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
  });

  it('周日输入应返回当周一作为起始', () => {
    // 2026-05-24 是周日
    const now = makeDate(2026, 5, 24, 10, 0);
    const range = getWeekRange(now);
    const start = new Date(range.start);
    assert.equal(start.getDate(), 18); // 周一是 18
  });

  it('周三输入应返回当周一作为起始', () => {
    // 2026-05-20 是周三
    const now = makeDate(2026, 5, 20, 9, 0);
    const range = getWeekRange(now);
    const start = new Date(range.start);
    assert.equal(start.getDate(), 18);
  });

  it('range 跨度应为 7 天 - 1 毫秒', () => {
    const now = makeDate(2026, 5, 20);
    const range = getWeekRange(now);
    assert.equal(range.end - range.start + 1, ONE_WEEK_MS);
  });

  it('startDate 和 endDate 应为 Date 实例', () => {
    const range = getWeekRange(new Date());
    assert.ok(range.startDate instanceof Date);
    assert.ok(range.endDate instanceof Date);
  });
});

describe('getLastWeekRange', () => {
  it('上周范围结束时间应等于本周起始 - 1ms', () => {
    const now = makeDate(2026, 5, 20);
    const thisWeek = getWeekRange(now);
    const lastWeek = getLastWeekRange(now);
    assert.equal(lastWeek.end, thisWeek.start - 1);
  });

  it('上周范围跨度应为 7 天', () => {
    const now = makeDate(2026, 5, 20);
    const lastWeek = getLastWeekRange(now);
    assert.equal(lastWeek.end - lastWeek.start + 1, ONE_WEEK_MS);
  });
});

// ==================== inferDomains ====================

describe('inferDomains', () => {
  it('React 标签应匹配到"前端"', () => {
    const bm = { title: 'React 入门', tags: ['react'] };
    const domains = inferDomains(bm);
    assert.ok(domains.includes('前端'));
  });

  it('Docker 标签应匹配到"DevOps"', () => {
    const bm = { title: 'Docker 教程', tags: ['docker'] };
    const domains = inferDomains(bm);
    assert.ok(domains.includes('DevOps'));
  });

  it('无标签无匹配应返回空数组', () => {
    const bm = { title: '随便看看' };
    const domains = inferDomains(bm);
    assert.equal(domains.length, 0);
  });

  it('多个匹配应返回多个领域', () => {
    const bm = { title: 'Next.js 全栈', tags: ['react', 'node'] };
    const domains = inferDomains(bm);
    assert.ok(domains.includes('前端'));
    assert.ok(domains.includes('后端'));
  });

  it('文件夹路径也能参与匹配', () => {
    const bm = { title: '入门', folderPath: ['技术', 'AI', '机器学习'] };
    const domains = inferDomains(bm);
    assert.ok(domains.includes('AI/ML'));
  });
});

// ==================== formatDate / formatDateRange ====================

describe('formatDate', () => {
  it('应返回 YYYY-MM-DD 格式', () => {
    const d = new Date(2026, 4, 19); // 2026-05-19
    assert.equal(formatDate(d), '2026-05-19');
  });

  it('支持时间戳输入', () => {
    const ts = new Date(2026, 0, 1).getTime();
    assert.equal(formatDate(ts), '2026-01-01');
  });
});

describe('formatDateRange', () => {
  it('应返回 "YYYY-MM-DD ~ YYYY-MM-DD"', () => {
    const range = {
      start: new Date(2026, 4, 18).getTime(),
      end: new Date(2026, 4, 24).getTime(),
    };
    assert.equal(formatDateRange(range), '2026-05-18 ~ 2026-05-24');
  });
});

// ==================== WeeklyDigest 核心统计 ====================

describe('WeeklyDigest — 统计方法', () => {
  // 测试时间为 2026-05-20 (周三)，本周 05-18 ~ 05-24
  const now = makeDate(2026, 5, 20, 12, 0);
  const thisMonday = new Date(2026, 4, 18, 0, 0, 0, 0).getTime();
  const thisTuesday = new Date(2026, 4, 19, 10, 0).getTime();
  const lastWednesday = new Date(2026, 4, 13, 10, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'BM1', url: 'https://a.com', dateAdded: thisMonday },
    { id: '2', title: 'BM2', url: 'https://b.com', dateAdded: thisTuesday },
    { id: '3', title: 'BM3', url: 'https://c.com', dateAdded: lastWednesday },
    { id: '4', title: 'BM4', url: 'https://d.com', dateAdded: thisMonday + 3600000 },
  ];

  const readingHistory = [
    { id: 'r1', bookmarkId: '1', completedAt: thisTuesday },
    { id: 'r2', bookmarkId: '2', completedAt: lastWednesday },
  ];

  const conversations = [
    { id: 'c1', timestamp: thisMonday + 1000 },
    { id: 'c2', timestamp: thisTuesday },
    { id: 'c3', timestamp: lastWednesday },
  ];

  const knowledgeEntries = [
    { id: 'k1', title: '知识1', createdAt: thisTuesday, tags: ['javascript'] },
    { id: 'k2', title: '知识2', createdAt: lastWednesday, tags: ['python'] },
  ];

  const digest = new WeeklyDigest({
    bookmarks,
    readingHistory,
    conversations,
    knowledgeEntries,
    now,
  });

  it('getNewBookmarksThisWeek 应返回本周添加的书签', () => {
    const result = digest.getNewBookmarksThisWeek();
    assert.equal(result.length, 3); // BM1, BM2, BM4
  });

  it('getNewBookmarksLastWeek 应返回上周添加的书签数', () => {
    const result = digest.getNewBookmarksLastWeek();
    assert.equal(result, 1); // BM3
  });

  it('getCompletedReadingsThisWeek 应返回本周完成的阅读', () => {
    const result = digest.getCompletedReadingsThisWeek();
    assert.equal(result.length, 1); // r1
  });

  it('getQuestionCountThisWeek 应返回本周提问数', () => {
    assert.equal(digest.getQuestionCountThisWeek(), 2); // c1, c2
  });

  it('getNewKnowledgeEntriesThisWeek 应返回本周新增知识条目', () => {
    assert.equal(digest.getNewKnowledgeEntriesThisWeek().length, 1); // k1
  });

  it('空数据应安全处理', () => {
    const empty = new WeeklyDigest({ now });
    assert.deepEqual(empty.getNewBookmarksThisWeek(), []);
    assert.equal(empty.getNewBookmarksLastWeek(), 0);
    assert.deepEqual(empty.getCompletedReadingsThisWeek(), []);
    assert.equal(empty.getQuestionCountThisWeek(), 0);
    assert.deepEqual(empty.getNewKnowledgeEntriesThisWeek(), []);
  });
});

// ==================== WeeklyDigest 领域分析 ====================

describe('WeeklyDigest — 领域分析', () => {
  const now = makeDate(2026, 5, 20);
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
    { id: '2', title: 'Vue 入门', tags: ['vue'], dateAdded: thisMonday + 1000 },
    { id: '3', title: 'Docker 实战', tags: ['docker'], dateAdded: thisMonday + 2000 },
  ];

  const digest = new WeeklyDigest({ bookmarks, now });

  it('getDomainDistribution 应返回按数量降序排列的领域分布', () => {
    const dist = digest.getDomainDistribution();
    assert.ok(dist.length > 0);
    // 前端应排第一（React + Vue）
    assert.equal(dist[0].domain, '前端');
    assert.equal(dist[0].count, 2);
  });

  it('getFocusDomains 应返回本周投入最多的领域', () => {
    const focus = digest.getFocusDomains(2);
    assert.equal(focus.length, 2);
    assert.equal(focus[0].domain, '前端');
  });

  it('getWeakDomains 应调用 GapDetector 返回弱项', () => {
    const weak = digest.getWeakDomains();
    assert.ok(Array.isArray(weak));
  });
});

// ==================== WeeklyDigest 推荐 ====================

describe('WeeklyDigest — 下周推荐', () => {
  const now = makeDate(2026, 5, 20);
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
  ];

  const knowledgeEntries = [
    { id: 'k1', title: 'JS 闭包', tags: ['javascript'], createdAt: thisMonday },
  ];

  const digest = new WeeklyDigest({ bookmarks, knowledgeEntries, now });

  it('getNextWeekRecommendations 应返回推荐列表', () => {
    const recs = digest.getNextWeekRecommendations();
    assert.ok(Array.isArray(recs));
    assert.ok(recs.length > 0);
    assert.ok(recs[0].domain);
    assert.ok(recs[0].reason);
  });

  it('推荐数量应受 limit 参数限制', () => {
    const recs = digest.getNextWeekRecommendations(2);
    assert.ok(recs.length <= 2);
  });
});

// ==================== WeeklyDigest 报告生成 ====================

describe('WeeklyDigest — generateReport', () => {
  const now = makeDate(2026, 5, 20);
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
  ];

  const digest = new WeeklyDigest({
    bookmarks,
    readingHistory: [{ id: 'r1', completedAt: thisMonday }],
    conversations: [{ id: 'c1', timestamp: thisMonday }],
    knowledgeEntries: [{ id: 'k1', createdAt: thisMonday }],
    now,
  });

  it('generateReport 应包含所有必要字段', () => {
    const report = digest.generateReport();
    assert.ok(report.weekRange);
    assert.ok(report.weekRange.label);
    assert.ok(report.stats);
    assert.ok(typeof report.stats.newBookmarks === 'number');
    assert.ok(typeof report.stats.completedReadings === 'number');
    assert.ok(typeof report.stats.questionCount === 'number');
    assert.ok(typeof report.stats.newKnowledgeEntries === 'number');
    assert.ok(typeof report.stats.bookmarkGrowth === 'number');
    assert.ok(Array.isArray(report.domainDistribution));
    assert.ok(Array.isArray(report.focusDomains));
    assert.ok(Array.isArray(report.weakDomains));
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(typeof report.generatedAt === 'number');
  });

  it('bookmarkGrowth 应正确计算（本周 - 上周）', () => {
    const report = digest.generateReport();
    // 本周 1 个书签，上周 0 个 → growth = 1
    assert.equal(report.stats.bookmarkGrowth, 1);
    assert.equal(report.stats.bookmarkGrowthDirection, 'up');
  });

  it('bookmarkGrowthDirection 为 flat 时应正确标记', () => {
    const lastWeekTime = new Date(2026, 4, 13, 12, 0).getTime();
    const digest2 = new WeeklyDigest({
      bookmarks: [
        { id: '1', title: 'BM', dateAdded: thisMonday },
        { id: '2', title: 'BM2', dateAdded: lastWeekTime },
      ],
      now,
    });
    const report = digest2.generateReport();
    assert.equal(report.stats.bookmarkGrowth, 0);
    assert.equal(report.stats.bookmarkGrowthDirection, 'flat');
  });
});

// ==================== Markdown 导出 ====================

describe('WeeklyDigest — toMarkdown', () => {
  const now = makeDate(2026, 5, 20);
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
    { id: '2', title: 'Docker 实战', tags: ['docker'], dateAdded: thisMonday + 1000 },
  ];

  const digest = new WeeklyDigest({ bookmarks, now });

  it('toMarkdown 应返回非空字符串', () => {
    const md = digest.toMarkdown();
    assert.ok(typeof md === 'string');
    assert.ok(md.length > 0);
  });

  it('Markdown 应包含标题', () => {
    const md = digest.toMarkdown();
    assert.ok(md.includes('学习周报'));
  });

  it('Markdown 应包含统计表格', () => {
    const md = digest.toMarkdown();
    assert.ok(md.includes('本周概览'));
    assert.ok(md.includes('新增书签'));
    assert.ok(md.includes('阅读完成'));
  });

  it('Markdown 应包含领域分布', () => {
    const md = digest.toMarkdown();
    assert.ok(md.includes('领域分布'));
  });

  it('Markdown 应包含生成时间', () => {
    const md = digest.toMarkdown();
    assert.ok(md.includes('PageWise'));
  });
});

// ==================== HTML 导出 ====================

describe('WeeklyDigest — toHTML', () => {
  const now = makeDate(2026, 5, 20);
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
  ];

  const digest = new WeeklyDigest({ bookmarks, now });

  it('toHTML 应返回包含 HTML 标签的字符串', () => {
    const html = digest.toHTML();
    assert.ok(html.includes('<div'));
    assert.ok(html.includes('</div>'));
  });

  it('toHTML 应包含统计卡片', () => {
    const html = digest.toHTML();
    assert.ok(html.includes('stat-card'));
    assert.ok(html.includes('stat-value'));
  });

  it('toHTML 应正确转义特殊字符', () => {
    const bmWithSpecial = new WeeklyDigest({
      bookmarks: [
        { id: '1', title: '<script>alert("xss")</script>', tags: ['react'], dateAdded: thisMonday },
      ],
      now,
    });
    const html = bmWithSpecial.toHTML();
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('自定义 escapeHtml 应被使用', () => {
    let called = false;
    const customEscape = (s) => { called = true; return s; };
    const html = digest.toHTML(customEscape);
    assert.ok(called);
  });
});

// ==================== 通知推送 ====================

describe('WeeklyDigest — 通知推送', () => {
  const now = makeDate(2026, 5, 18); // 2026-05-18 是周一
  const thisMonday = new Date(2026, 4, 18, 0, 0).getTime();

  const bookmarks = [
    { id: '1', title: 'React 教程', tags: ['react'], dateAdded: thisMonday },
  ];

  const digest = new WeeklyDigest({ bookmarks, now });

  it('sendWeeklyNotification 应调用 notifier.notify', () => {
    let notified = false;
    let message = '';
    const notifier = {
      notify: (msg, type) => {
        notified = true;
        message = msg;
        return { id: 'test', message: msg, type };
      },
    };
    const result = digest.sendWeeklyNotification(notifier);
    assert.ok(notified);
    assert.ok(message.includes('学习周报'));
    assert.ok(result);
  });

  it('sendWeeklyNotification 在 notifier 无效时应返回 null', () => {
    assert.equal(digest.sendWeeklyNotification(null), null);
    assert.equal(digest.sendWeeklyNotification({}), null);
  });

  it('isMonday 静态方法应正确判断', () => {
    assert.ok(WeeklyDigest.isMonday(makeDate(2026, 5, 18))); // 周一
    assert.ok(!WeeklyDigest.isMonday(makeDate(2026, 5, 19))); // 周二
  });

  it('notifyIfMonday 周一应推送', () => {
    let notified = false;
    const notifier = {
      notify: () => { notified = true; return {}; },
    };
    digest.notifyIfMonday(notifier);
    assert.ok(notified);
  });

  it('notifyIfMonday 非周一应不推送', () => {
    const notMonday = makeDate(2026, 5, 19); // 周二
    const digestTue = new WeeklyDigest({ bookmarks, now: notMonday });
    let notified = false;
    const notifier = {
      notify: () => { notified = true; return {}; },
    };
    const result = digestTue.notifyIfMonday(notifier);
    assert.ok(!notified);
    assert.equal(result, null);
  });
});

// ==================== 常量和导出 ====================

describe('模块导出', () => {
  it('应导出 WeeklyDigest 类', () => {
    assert.equal(typeof WeeklyDigest, 'function');
  });

  it('应导出工具函数', () => {
    assert.equal(typeof getWeekRange, 'function');
    assert.equal(typeof getLastWeekRange, 'function');
    assert.equal(typeof inferDomains, 'function');
    assert.equal(typeof formatDate, 'function');
    assert.equal(typeof formatDateRange, 'function');
  });

  it('应导出常量', () => {
    assert.equal(ONE_WEEK_MS, 7 * 24 * 60 * 60 * 1000);
    assert.equal(ONE_DAY_MS, 24 * 60 * 60 * 1000);
    assert.ok(DOMAIN_KEYWORDS);
    assert.ok(DOMAIN_KEYWORDS['前端']);
  });
});
