/**
 * 测试 lib/compilation-report-format.js — 报告格式化
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  IngestStats, buildIngestStats, computeIngestDiff,
  generateReportMarkdown, generateReportHtml,
  mergeIngestStats, summarizeReport, formatReportSummary, escapeHtml
} = await import('../lib/compilation-report-format.js');

// ==================== IngestStats ====================

describe('IngestStats', () => {
  it('默认构造', () => {
    const stats = new IngestStats();
    assert.equal(stats.newPageCount, 0);
    assert.equal(stats.updatedPageCount, 0);
    assert.deepEqual(stats.newEntities, []);
    assert.deepEqual(stats.newConcepts, []);
    assert.deepEqual(stats.newCrossRefs, []);
    assert.deepEqual(stats.contradictions, []);
    assert.ok(stats.generatedAt);
  });

  it('带数据构造', () => {
    const stats = new IngestStats({
      newPageCount: 5,
      updatedPageCount: 2,
      newEntities: [{ name: 'React' }],
      newConcepts: [{ name: 'MVC' }],
      newCrossRefs: [{ fromId: 1, toId: 2 }],
      contradictions: [{ severity: 'high', description: '冲突' }],
      generatedAt: '2024-01-01',
    });
    assert.equal(stats.newPageCount, 5);
    assert.equal(stats.updatedPageCount, 2);
    assert.equal(stats.newEntities.length, 1);
    assert.equal(stats.generatedAt, '2024-01-01');
  });

  it('深拷贝数组', () => {
    const entities = [{ name: 'A' }];
    const stats = new IngestStats({ newEntities: entities });
    entities.push({ name: 'B' });
    assert.equal(stats.newEntities.length, 1);
  });
});

// ==================== computeIngestDiff ====================

describe('computeIngestDiff()', () => {
  it('全部新增', () => {
    const diff = computeIngestDiff([{ id: 1 }, { id: 2 }], []);
    assert.equal(diff.added.length, 2);
    assert.equal(diff.updated.length, 0);
    assert.equal(diff.removed.length, 0);
  });

  it('全部更新', () => {
    const diff = computeIngestDiff([{ id: 1 }], [{ id: 1 }]);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.updated.length, 1);
    assert.equal(diff.removed.length, 0);
  });

  it('全部删除', () => {
    const diff = computeIngestDiff([], [{ id: 1 }, { id: 2 }]);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.removed.length, 2);
  });

  it('混合', () => {
    const diff = computeIngestDiff(
      [{ id: 1 }, { id: 3 }],
      [{ id: 1 }, { id: 2 }]
    );
    assert.equal(diff.added.length, 1);
    assert.equal(diff.updated.length, 1);
    assert.equal(diff.removed.length, 1);
  });

  it('null id 视为新增', () => {
    const diff = computeIngestDiff([{ id: null }], []);
    assert.equal(diff.added.length, 1);
  });

  it('空输入', () => {
    const diff = computeIngestDiff(null, null);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.removed.length, 0);
  });
});

// ==================== buildIngestStats ====================

describe('buildIngestStats()', () => {
  it('构建完整统计', () => {
    const stats = buildIngestStats({
      newEntries: [{ id: 1 }],
      oldEntries: [],
      newEntities: [{ name: 'React' }],
      oldEntities: [],
      newConcepts: [{ name: 'Hooks' }],
      oldConcepts: [],
      crossRefs: [{ fromId: 1, toId: 2 }],
      contradictions: [{ severity: 'low' }],
    });
    assert.equal(stats.newPageCount, 1);
    assert.equal(stats.newEntities.length, 1);
    assert.equal(stats.newConcepts.length, 1);
    assert.equal(stats.newCrossRefs.length, 1);
  });

  it('实体去重 - 已存在的不计为新增', () => {
    const stats = buildIngestStats({
      newEntries: [],
      oldEntries: [],
      newEntities: [{ name: 'React' }],
      oldEntities: [{ name: 'react' }],
      newConcepts: [],
      oldConcepts: [],
    });
    assert.equal(stats.newEntities.length, 0);
  });

  it('概念去重', () => {
    const stats = buildIngestStats({
      newEntries: [],
      oldEntries: [],
      newEntities: [],
      oldEntities: [],
      newConcepts: [{ name: 'MVC' }],
      oldConcepts: [{ name: 'mvc' }],
    });
    assert.equal(stats.newConcepts.length, 0);
  });

  it('空参数', () => {
    const stats = buildIngestStats({});
    assert.equal(stats.newPageCount, 0);
  });
});

// ==================== generateReportMarkdown ====================

describe('generateReportMarkdown()', () => {
  it('生成基本报告', () => {
    const stats = new IngestStats({ newPageCount: 5 });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('知识编译报告'));
    assert.ok(md.includes('新增页面'));
    assert.ok(md.includes('5'));
  });

  it('包含实体', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'React', type: 'framework', description: 'UI 库' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('React'));
    assert.ok(md.includes('框架'));
    assert.ok(md.includes('UI 库'));
  });

  it('包含概念', () => {
    const stats = new IngestStats({
      newConcepts: [{ name: 'Hooks', description: 'React 特性' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('Hooks'));
  });

  it('包含交叉引用', () => {
    const stats = new IngestStats({
      newCrossRefs: [{ fromId: 1, toId: 2, relation: '相关' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('条目 #1'));
    assert.ok(md.includes('相关'));
  });

  it('超过 10 个交叉引用时截断', () => {
    const refs = Array.from({ length: 15 }, (_, i) => ({ fromId: i, toId: i + 1 }));
    const stats = new IngestStats({ newCrossRefs: refs });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('等共 15 条'));
  });

  it('包含矛盾', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'high', description: '严重冲突' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('严重'));
    assert.ok(md.includes('严重冲突'));
  });

  it('未知严重级别', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'unknown', description: '未知' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('未知'));
  });

  it('实体类型未知', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'X', type: 'unknown_type' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('X'));
  });
});

// ==================== generateReportHtml ====================

describe('generateReportHtml()', () => {
  it('生成 HTML 包含 pw-compilation-report', () => {
    const stats = new IngestStats();
    const html = generateReportHtml(stats);
    assert.ok(html.includes('pw-compilation-report'));
    assert.ok(html.includes('pw-report-header'));
  });

  it('包含实体列表', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'React', type: 'framework' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('React'));
    assert.ok(html.includes('pw-report-entity'));
  });

  it('包含概念列表', () => {
    const stats = new IngestStats({
      newConcepts: [{ name: 'Hooks', description: '特性' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('Hooks'));
  });

  it('包含交叉引用', () => {
    const stats = new IngestStats({
      newCrossRefs: [{ fromId: 1, toId: 2, relation: '关联' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('#1'));
    assert.ok(html.includes('关联'));
  });

  it('超过 10 个交叉引用截断', () => {
    const refs = Array.from({ length: 15 }, (_, i) => ({ fromId: i, toId: i + 1 }));
    const stats = new IngestStats({ newCrossRefs: refs });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('15'));
  });

  it('包含矛盾', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'medium', description: '冲突' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('矛盾'));
  });

  it('实体描述可选', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'X', type: 'tool' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('X'));
  });
});

// ==================== mergeIngestStats ====================

describe('mergeIngestStats()', () => {
  it('合并多个统计', () => {
    const s1 = new IngestStats({ newPageCount: 3, updatedPageCount: 1 });
    const s2 = new IngestStats({ newPageCount: 2, updatedPageCount: 0 });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.newPageCount, 5);
    assert.equal(merged.updatedPageCount, 1);
  });

  it('实体去重', () => {
    const s1 = new IngestStats({ newEntities: [{ name: 'React' }] });
    const s2 = new IngestStats({ newEntities: [{ name: 'react' }] });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.newEntities.length, 1);
  });

  it('概念去重', () => {
    const s1 = new IngestStats({ newConcepts: [{ name: 'MVC' }] });
    const s2 = new IngestStats({ newConcepts: [{ name: 'mvc' }] });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.newConcepts.length, 1);
  });

  it('合并交叉引用和矛盾', () => {
    const s1 = new IngestStats({ newCrossRefs: [{ fromId: 1 }], contradictions: [{ severity: 'high' }] });
    const s2 = new IngestStats({ newCrossRefs: [{ fromId: 2 }], contradictions: [{ severity: 'low' }] });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.newCrossRefs.length, 2);
    assert.equal(merged.contradictions.length, 2);
  });

  it('generatedAt 取最新', () => {
    const s1 = new IngestStats({ generatedAt: '2024-01-01' });
    const s2 = new IngestStats({ generatedAt: '2024-06-01' });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.generatedAt, '2024-06-01');
  });
});

// ==================== summarizeReport / formatReportSummary ====================

describe('summarizeReport()', () => {
  it('基本摘要', () => {
    const stats = new IngestStats({ newPageCount: 5 });
    const summary = summarizeReport(stats);
    assert.ok(summary.includes('新增 5 页'));
  });

  it('包含所有指标', () => {
    const stats = new IngestStats({
      newPageCount: 10,
      updatedPageCount: 3,
      newEntities: [{ name: 'A' }, { name: 'B' }],
      newConcepts: [{ name: 'C' }],
      newCrossRefs: [{ fromId: 1 }],
      contradictions: [{ severity: 'high' }],
    });
    const summary = summarizeReport(stats);
    assert.ok(summary.includes('更新 3 页'));
    assert.ok(summary.includes('2 新实体'));
    assert.ok(summary.includes('1 新概念'));
    assert.ok(summary.includes('1 引用'));
    assert.ok(summary.includes('1 矛盾'));
  });
});

describe('formatReportSummary()', () => {
  it('格式化摘要', () => {
    const stats = new IngestStats({ newPageCount: 5 });
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.includes('编译报告'));
    assert.ok(formatted.includes('新增 5'));
  });

  it('包含实体和概念', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'A' }],
      newConcepts: [{ name: 'B' }],
    });
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.includes('新实体'));
    assert.ok(formatted.includes('新概念'));
  });

  it('包含矛盾', () => {
    const stats = new IngestStats({ contradictions: [{}, {}, {}] });
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.includes('3 条矛盾'));
  });
});

// ==================== escapeHtml ====================

describe('escapeHtml()', () => {
  it('转义 &', () => assert.equal(escapeHtml('a&b'), 'a&amp;b'));
  it('转义 <', () => assert.equal(escapeHtml('a<b'), 'a&lt;b'));
  it('转义 >', () => assert.equal(escapeHtml('a>b'), 'a&gt;b'));
  it('转义 "', () => assert.equal(escapeHtml('a"b'), 'a&quot;b'));
  it("转义 '", () => assert.equal(escapeHtml("a'b"), "a&#39;b"));
  it('null 返回空', () => assert.equal(escapeHtml(null), ''));
  it('undefined 返回空', () => assert.equal(escapeHtml(undefined), ''));
  it('数字转字符串', () => assert.equal(escapeHtml(42), '42'));
});
