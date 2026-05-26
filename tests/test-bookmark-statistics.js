/**
 * 测试 lib/bookmark-statistics.js — BookmarkDashboard 书签统计仪表盘
 *
 * 测试范围:
 *   书签全景统计 (getBookmarkOverview)
 *   域名分布 Top-10 (getDomainDistribution)
 *   文件夹分布 (getFolderDistribution)
 *   收藏时间趋势 (getCollectionTrend)
 *   死链率 (getDeadLinkRate)
 *   标签覆盖率 (getTagCoverage)
 *   状态分布 (getStatusDistribution)
 *   知识图谱统计 (getGraphStats)
 *   使用行为统计 (getBehaviorStats)
 *   健康度评分 (getHealthScore)
 *   统计数据导出 (exportJSON / exportMarkdown)
 *   综合仪表盘数据 (getDashboard)
 *   边界条件（空书签库 / 超大书签库 / 无标签 / 无图谱）
 *
 * ≥30 用例
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkDashboard } = await import('../lib/bookmark-statistics.js');

// ==================== 辅助: 构造书签 ====================

function bm(id, { title = `Bookmark ${id}`, url = '', folderPath, tags, dateAdded, status, dead } = {}) {
  return {
    id: String(id),
    title,
    url,
    ...(folderPath ? { folderPath } : {}),
    ...(tags ? { tags } : {}),
    ...(dateAdded ? { dateAdded } : {}),
    ...(status ? { status } : {}),
    ...(dead !== undefined ? { dead } : {}),
  };
}

function makeGraphData(nodeCount, edgeCount) {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: String(i), label: `Node ${i}` });
  }
  // create a chain graph: 0-1-2-...-(edgeCount)
  for (let i = 0; i < Math.min(edgeCount, nodeCount - 1); i++) {
    edges.push({ source: String(i), target: String(i + 1) });
  }
  return { nodes, edges };
}

function makeTelemetryData(overrides = {}) {
  return {
    features: {
      ask_ai: 100,
      bookmark: 50,
      knowledge_search: 30,
      text_select: 200,
      ...overrides.features,
    },
    metrics: {
      ...overrides.metrics,
    },
    errors: {
      ...overrides.errors,
    },
  };
}

// ==================== 样本数据 ====================

const sampleBookmarks = [
  bm(1, { url: 'https://react.dev/hooks', folderPath: ['Frontend', 'React'], tags: ['react', 'hooks'], dateAdded: 1700000000000, status: 'read' }),
  bm(2, { url: 'https://nodejs.org/docs', folderPath: ['Backend', 'Node'], tags: ['node'], dateAdded: 1700100000000, status: 'reading' }),
  bm(3, { url: 'https://python.org/ml', folderPath: ['AI', 'ML'], tags: ['python', 'ml'], dateAdded: 1700200000000, status: 'unread' }),
  bm(4, { url: 'https://css-tricks.com/grid', folderPath: ['Frontend', 'CSS'], tags: ['css'], dateAdded: 1700300000000, status: 'read' }),
  bm(5, { url: 'https://docker.com/arch', folderPath: ['DevOps'], tags: ['docker'], dateAdded: 1700400000000 }),
  bm(6, { url: 'https://react.dev/learn', folderPath: ['Frontend', 'React'], tags: ['react'], dateAdded: 1700500000000, status: 'read', dead: false }),
  bm(7, { url: 'https://broken.link/404', folderPath: ['Misc'], tags: [], dateAdded: 1700600000000, dead: true }),
  bm(8, { url: 'https://react.dev/advanced', folderPath: ['Frontend', 'React'], tags: ['react'], dateAdded: 1700700000000, dead: true }),
  bm(9, { url: 'https://go.dev/doc', folderPath: ['Backend', 'Go'], tags: ['go'], dateAdded: 1700800000000, status: 'read' }),
  bm(10, { url: 'https://rust-lang.org', folderPath: ['Backend', 'Rust'], tags: ['rust', 'systems'], dateAdded: 1700900000000 }),
];

// ==================== 测试 ====================

describe('BookmarkDashboard', () => {

  // --- 构造函数 ---

  describe('constructor', () => {
    it('1. 默认空书签库', () => {
      const dash = new BookmarkDashboard();
      assert.equal(dash.bookmarks.length, 0);
    });

    it('2. 接受书签数组和选项', () => {
      const dash = new BookmarkDashboard(sampleBookmarks, { linkCheckerResults: [], telemetryData: null, graphData: null });
      assert.equal(dash.bookmarks.length, 10);
    });
  });

  // --- getBookmarkOverview ---

  describe('getBookmarkOverview', () => {
    it('3. 空书签库返回全零', () => {
      const dash = new BookmarkDashboard([]);
      const ov = dash.getBookmarkOverview();
      assert.equal(ov.total, 0);
      assert.equal(ov.totalDomains, 0);
      assert.equal(ov.totalFolders, 0);
      assert.equal(ov.totalTags, 0);
      assert.equal(ov.tagCoverageRate, 0);
    });

    it('4. 样本数据正确统计', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const ov = dash.getBookmarkOverview();
      assert.equal(ov.total, 10);
      assert.ok(ov.totalDomains > 0);
      assert.ok(ov.totalFolders > 0);
      assert.ok(ov.totalTags > 0);
      // tags coverage: 9 out of 10 have tags (bm7 has no tags)
      assert.equal(ov.tagCoverageRate, 90);
    });
  });

  // --- getDomainDistribution ---

  describe('getDomainDistribution', () => {
    it('5. 空书签库返回空数组', () => {
      const dash = new BookmarkDashboard([]);
      assert.deepEqual(dash.getDomainDistribution(), []);
    });

    it('6. Top-10 排序正确，react.dev 出现 3 次', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const dist = dash.getDomainDistribution();
      assert.ok(dist.length > 0);
      assert.ok(dist.length <= 10);
      // First should be react.dev (3 bookmarks)
      assert.equal(dist[0].domain, 'react.dev');
      assert.equal(dist[0].count, 3);
      // Sorted descending
      for (let i = 1; i < dist.length; i++) {
        assert.ok(dist[i].count <= dist[i - 1].count);
      }
    });

    it('7. 百分比计算正确', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const dist = dash.getDomainDistribution();
      const totalCounted = dist.reduce((s, d) => s + d.count, 0);
      assert.equal(totalCounted, 10);
      const totalPct = dist.reduce((s, d) => s + d.percentage, 0);
      assert.ok(Math.abs(totalPct - 100) < 1);
    });
  });

  // --- getFolderDistribution ---

  describe('getFolderDistribution', () => {
    it('8. 空书签库返回空数组', () => {
      const dash = new BookmarkDashboard([]);
      assert.deepEqual(dash.getFolderDistribution(), []);
    });

    it('9. 按第一级文件夹分组', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const dist = dash.getFolderDistribution();
      assert.ok(dist.length > 0);
      // Frontend has 4 bookmarks (1,4,6,8)
      const frontend = dist.find(d => d.folder === 'Frontend');
      assert.ok(frontend);
      assert.equal(frontend.count, 4);
    });
  });

  // --- getCollectionTrend ---

  describe('getCollectionTrend', () => {
    it('10. 空书签库返回空数组', () => {
      const dash = new BookmarkDashboard([]);
      assert.deepEqual(dash.getCollectionTrend('month'), []);
    });

    it('11. 按月聚合趋势', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const trend = dash.getCollectionTrend('month');
      assert.ok(trend.length > 0);
      const total = trend.reduce((s, e) => s + e.count, 0);
      assert.equal(total, 10);
    });
  });

  // --- getDeadLinkRate ---

  describe('getDeadLinkRate', () => {
    it('12. 空书签库返回 0%', () => {
      const dash = new BookmarkDashboard([]);
      const r = dash.getDeadLinkRate();
      assert.equal(r.rate, 0);
      assert.equal(r.total, 0);
    });

    it('13. 基于 dead 标记统计死链率', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const r = dash.getDeadLinkRate();
      // bm7 and bm8 have dead=true -> 2 out of 10 = 20%
      assert.equal(r.dead, 2);
      assert.equal(r.rate, 20);
    });

    it('14. 基于 linkCheckerResults 统计死链率', () => {
      const results = [
        { status: 'alive' },
        { status: 'dead' },
        { status: 'dead' },
        { status: 'alive' },
        { status: 'unknown' },
      ];
      const bookmarks = [bm(1), bm(2), bm(3), bm(4), bm(5)];
      const dash = new BookmarkDashboard(bookmarks, { linkCheckerResults: results });
      const r = dash.getDeadLinkRate();
      assert.equal(r.total, 5);
      assert.equal(r.dead, 2);
      assert.equal(r.rate, 40);
    });
  });

  // --- getTagCoverage ---

  describe('getTagCoverage', () => {
    it('15. 空书签库返回 0%', () => {
      const dash = new BookmarkDashboard([]);
      const tc = dash.getTagCoverage();
      assert.equal(tc.rate, 0);
    });

    it('16. 样本数据覆盖率 90%', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const tc = dash.getTagCoverage();
      assert.equal(tc.total, 10);
      assert.equal(tc.withTags, 9);
      assert.equal(tc.rate, 90);
    });
  });

  // --- getStatusDistribution ---

  describe('getStatusDistribution', () => {
    it('17. 空书签库返回全零', () => {
      const dash = new BookmarkDashboard([]);
      const sd = dash.getStatusDistribution();
      assert.equal(sd.unread, 0);
      assert.equal(sd.reading, 0);
      assert.equal(sd.read, 0);
    });

    it('18. 样本数据状态分布正确', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const sd = dash.getStatusDistribution();
      // read: 1,4,6,9 = 4; reading: 2 = 1; unread: 3 = 1; no status: 5,7,8,10 = 4 (default unread)
      assert.equal(sd.read, 4);
      assert.equal(sd.reading, 1);
      assert.equal(sd.unread, 5);
    });
  });

  // --- getGraphStats ---

  describe('getGraphStats', () => {
    it('19. 无图谱数据返回零值', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const gs = dash.getGraphStats();
      assert.equal(gs.nodes, 0);
      assert.equal(gs.edges, 0);
      assert.equal(gs.avgDegree, 0);
    });

    it('20. 图谱统计计算正确 — 链式图', () => {
      const graph = makeGraphData(5, 4);
      const dash = new BookmarkDashboard(sampleBookmarks, { graphData: graph });
      const gs = dash.getGraphStats();
      assert.equal(gs.nodes, 5);
      assert.equal(gs.edges, 4);
      // Total degree = 2*edges = 8, avgDegree = 8/5 = 1.6
      assert.equal(gs.avgDegree, 1.6);
      assert.equal(gs.isolatedNodes, 0);
      assert.equal(gs.largestComponentSize, 5);
    });

    it('21. 孤立节点检测', () => {
      const graph = { nodes: [{ id: '0' }, { id: '1' }, { id: '2' }], edges: [{ source: '0', target: '1' }] };
      const dash = new BookmarkDashboard(sampleBookmarks, { graphData: graph });
      const gs = dash.getGraphStats();
      assert.equal(gs.isolatedNodes, 1);
      assert.equal(gs.largestComponentSize, 2);
    });

    it('22. 聚类系数 — 三角形图应为 1.0', () => {
      const graph = {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }],
        edges: [
          { source: '0', target: '1' },
          { source: '1', target: '2' },
          { source: '2', target: '0' },
        ],
      };
      const dash = new BookmarkDashboard([], { graphData: graph });
      const gs = dash.getGraphStats();
      assert.equal(gs.clusteringCoefficient, 1);
    });
  });

  // --- getBehaviorStats ---

  describe('getBehaviorStats', () => {
    it('23. 无遥测数据返回全零', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const bs = dash.getBehaviorStats();
      assert.equal(bs.dailyAsks, 0);
      assert.equal(bs.bookmarkFrequency, 0);
      assert.equal(bs.searchFrequency, 0);
    });

    it('24. 遥测数据正确计算', () => {
      const telemetry = makeTelemetryData();
      const dash = new BookmarkDashboard(sampleBookmarks, { telemetryData: telemetry });
      const bs = dash.getBehaviorStats();
      assert.equal(bs.totalAsks, 100);
      assert.equal(bs.totalBookmarks, 50);
      assert.equal(bs.totalSearches, 30);
      assert.ok(bs.dailyAsks > 0);
    });
  });

  // --- getHealthScore ---

  describe('getHealthScore', () => {
    it('25. 空书签库返回 0', () => {
      const dash = new BookmarkDashboard([]);
      const hs = dash.getHealthScore();
      assert.equal(hs.score, 0);
      assert.ok(Array.isArray(hs.breakdown));
    });

    it('26. 健康书签库得分 >= 50', () => {
      const healthyBookmarks = [];
      for (let i = 0; i < 20; i++) {
        healthyBookmarks.push(bm(i, {
          url: `https://example${i}.com/page`,
          folderPath: [`Folder${i % 5}`],
          tags: ['tag' + (i % 4)],
          dateAdded: Date.now() - i * 86400000,
          status: 'read',
          dead: false,
        }));
      }
      const dash = new BookmarkDashboard(healthyBookmarks);
      const hs = dash.getHealthScore();
      assert.ok(hs.score >= 50, `Expected score >= 50, got ${hs.score}`);
    });

    it('27. 死链率高导致分数降低', () => {
      const bookmarks = [];
      for (let i = 0; i < 10; i++) {
        bookmarks.push(bm(i, {
          url: `https://site${i}.com`,
          dead: i < 8,
        }));
      }
      const dash = new BookmarkDashboard(bookmarks);
      const hs = dash.getHealthScore();
      assert.ok(hs.score < 50, `Expected score < 50 for 80% dead, got ${hs.score}`);
    });

    it('28. 分数范围 0-100', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const hs = dash.getHealthScore();
      assert.ok(hs.score >= 0 && hs.score <= 100, `Score ${hs.score} out of range`);
    });
  });

  // --- exportJSON ---

  describe('exportJSON', () => {
    it('29. 导出 JSON 包含所有维度', () => {
      const dash = new BookmarkDashboard(sampleBookmarks, {
        graphData: makeGraphData(5, 3),
        telemetryData: makeTelemetryData(),
      });
      const json = dash.exportJSON();
      assert.ok(json.generatedAt);
      assert.ok(json.overview);
      assert.ok(json.domainDistribution);
      assert.ok(json.folderDistribution);
      assert.ok(json.collectionTrend);
      assert.ok(json.deadLinkRate);
      assert.ok(json.tagCoverage);
      assert.ok(json.statusDistribution);
      assert.ok(json.graphStats);
      assert.ok(json.behaviorStats);
      assert.ok(json.healthScore);
    });

    it('30. JSON 可序列化', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const json = dash.exportJSON();
      const str = JSON.stringify(json);
      const parsed = JSON.parse(str);
      assert.equal(parsed.overview.total, 10);
    });
  });

  // --- exportMarkdown ---

  describe('exportMarkdown', () => {
    it('31. 导出 Markdown 包含标题和摘要', () => {
      const dash = new BookmarkDashboard(sampleBookmarks);
      const md = dash.exportMarkdown();
      assert.ok(typeof md === 'string');
      assert.ok(md.includes('#'));
      assert.ok(md.includes('10'));
    });

    it('32. 空书签库也能导出 Markdown', () => {
      const dash = new BookmarkDashboard([]);
      const md = dash.exportMarkdown();
      assert.ok(typeof md === 'string');
      assert.ok(md.includes('0'));
    });
  });

  // --- getDashboard (综合) ---

  describe('getDashboard', () => {
    it('33. 返回所有维度的综合数据', () => {
      const dash = new BookmarkDashboard(sampleBookmarks, {
        graphData: makeGraphData(5, 3),
        telemetryData: makeTelemetryData(),
      });
      const d = dash.getDashboard();
      assert.ok(d.overview);
      assert.ok(d.domainDistribution);
      assert.ok(d.folderDistribution);
      assert.ok(d.collectionTrend);
      assert.ok(d.deadLinkRate);
      assert.ok(d.tagCoverage);
      assert.ok(d.statusDistribution);
      assert.ok(d.graphStats);
      assert.ok(d.behaviorStats);
      assert.ok(d.healthScore);
    });
  });

  // --- 边界条件 ---

  describe('边界条件', () => {
    it('34. 超大书签库不报错', () => {
      const largeBookmarks = [];
      for (let i = 0; i < 5000; i++) {
        largeBookmarks.push(bm(i, {
          url: `https://domain${i % 100}.com/page${i}`,
          folderPath: [`Folder${i % 20}`],
          tags: i % 3 === 0 ? ['tag'] : [],
          dateAdded: 1700000000000 + i * 60000,
        }));
      }
      const dash = new BookmarkDashboard(largeBookmarks);
      const ov = dash.getBookmarkOverview();
      assert.equal(ov.total, 5000);
      const d = dash.getDashboard();
      assert.ok(d.healthScore.score >= 0);
    });

    it('35. 无 URL 的书签不报错', () => {
      const bookmarks = [bm(1, { url: '' }), bm(2, { title: 'No URL' })];
      const dash = new BookmarkDashboard(bookmarks);
      const ov = dash.getBookmarkOverview();
      assert.equal(ov.total, 2);
    });

    it('36. 无效 graphData 边界', () => {
      const dash = new BookmarkDashboard(sampleBookmarks, { graphData: { nodes: null, edges: null } });
      const gs = dash.getGraphStats();
      assert.equal(gs.nodes, 0);
    });
  });
});
