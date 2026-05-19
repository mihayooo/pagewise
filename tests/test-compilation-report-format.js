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
  it('混合特殊字符', () => assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
  it('空字符串', () => assert.equal(escapeHtml(''), ''));
  it('无特殊字符原样返回', () => assert.equal(escapeHtml('hello world'), 'hello world'));
});

// ==================== R141 补充: generateReportMarkdown 边界补充 ====================

describe('generateReportMarkdown() — 边界补充', () => {
  it('无 generatedAt 使用默认', () => {
    const stats = { newPageCount: 1, updatedPageCount: 0, newEntities: [], newConcepts: [], newCrossRefs: [], contradictions: [] };
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('知识编译报告'));
  });

  it('medium 严重级别', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'medium', description: '中等冲突' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('中等'));
    assert.ok(md.includes('中等冲突'));
  });

  it('low 严重级别', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'low', description: '轻微冲突' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('轻微'));
  });

  it('实体无 description 使用默认', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'Webpack', type: 'tool' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('Webpack'));
    assert.ok(md.includes('工具'));
    assert.ok(md.includes('无描述'));
  });

  it('概念无 description 使用默认', () => {
    const stats = new IngestStats({
      newConcepts: [{ name: 'SPA' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('SPA'));
    assert.ok(md.includes('无描述'));
  });

  it('交叉引用无 relation 使用默认', () => {
    const stats = new IngestStats({
      newCrossRefs: [{ fromId: 5, toId: 8 }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('关联'));
  });

  it('矛盾无 description 使用默认', () => {
    const stats = new IngestStats({
      contradictions: [{ severity: 'high' }],
    });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('未描述'));
  });
});

// ==================== R141 补充: computeIngestDiff 边界 ====================

describe('computeIngestDiff() — 边界情况', () => {
  it('两个 null id 条目都被视为新增', () => {
    const diff = computeIngestDiff([{ id: null }, { id: null }], []);
    assert.equal(diff.added.length, 2);
    assert.equal(diff.updated.length, 0);
  });

  it('旧条目有 null id 不影响新条目匹配', () => {
    const diff = computeIngestDiff([{ id: 1 }], [{ id: null }, { id: 1 }]);
    assert.equal(diff.updated.length, 1); // id=1 匹配到旧条目
    // null id: entry.id === null → removed.push (null 也算 removed)
    assert.equal(diff.removed.length, 1);
  });

  it('单条混合操作', () => {
    const diff = computeIngestDiff(
      [{ id: 2 }, { id: 3 }],
      [{ id: 1 }, { id: 2 }]
    );
    assert.equal(diff.added.length, 1); // id 3
    assert.equal(diff.updated.length, 1); // id 2
    assert.equal(diff.removed.length, 1); // id 1
  });

  it('全部为空数组', () => {
    const diff = computeIngestDiff([], []);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.updated.length, 0);
    assert.equal(diff.removed.length, 0);
  });
});

// ==================== R141 补充: generateReportHtml 边界 ====================

describe('generateReportHtml() — 边界情况', () => {
  it('无 generatedAt 时使用默认时间', () => {
    const stats = { newPageCount: 0, updatedPageCount: 0 };
    const html = generateReportHtml(stats);
    assert.ok(html.includes('pw-compilation-report'));
  });

  it('实体无 type 使用默认标签', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'UnknownThing' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('UnknownThing'));
  });

  it('概念无 description 不报错', () => {
    const stats = new IngestStats({
      newConcepts: [{ name: 'ConceptA' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('ConceptA'));
  });

  it('实体带 description 渲染', () => {
    const stats = new IngestStats({
      newEntities: [{ name: 'Node.js', type: 'platform', description: '服务端运行时' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('Node.js'));
    assert.ok(html.includes('服务端运行时'));
    assert.ok(html.includes('平台'));
  });
});

// ==================== R141 补充: buildIngestStats 边界 ====================

describe('buildIngestStats() — 边界情况', () => {
  it('实体名大小写不敏感去重', () => {
    const stats = buildIngestStats({
      newEntities: [{ name: 'React' }, { name: 'REACT' }, { name: 'Vue' }],
      oldEntities: [{ name: 'react' }],
    });
    assert.equal(stats.newEntities.length, 1); // 只有 Vue 是新的
    assert.equal(stats.newEntities[0].name, 'Vue');
  });

  it('概念名空白修剪', () => {
    const stats = buildIngestStats({
      newConcepts: [{ name: '  MVC  ' }],
      oldConcepts: [{ name: 'mvc' }],
    });
    assert.equal(stats.newConcepts.length, 0);
  });

  it('实体名为 null 不崩溃', () => {
    const stats = buildIngestStats({
      newEntities: [{ name: null }, { name: '' }],
      oldEntities: [],
    });
    // 空白名不会被计入
    assert.ok(stats.newEntities.length >= 0);
  });
});

// ==================== R141 补充: mergeIngestStats 边界 ====================

describe('mergeIngestStats() — 边界情况', () => {
  it('单个统计', () => {
    const s = new IngestStats({ newPageCount: 5 });
    const merged = mergeIngestStats(s);
    assert.equal(merged.newPageCount, 5);
  });

  it('空统计列表', () => {
    const merged = mergeIngestStats();
    assert.equal(merged.newPageCount, 0);
    assert.equal(merged.generatedAt, '');
  });

  it('多个统计跨引用和矛盾全部收集', () => {
    const s1 = new IngestStats({ newCrossRefs: [{ fromId: 1 }] });
    const s2 = new IngestStats({ newCrossRefs: [{ fromId: 2 }] });
    const s3 = new IngestStats({ contradictions: [{ severity: 'high' }] });
    const merged = mergeIngestStats(s1, s2, s3);
    assert.equal(merged.newCrossRefs.length, 2);
    assert.equal(merged.contradictions.length, 1);
  });

  it('generatedAt 空字符串不覆盖', () => {
    const s1 = new IngestStats({ generatedAt: '2024-06-01' });
    const s2 = new IngestStats({ generatedAt: '' });
    const merged = mergeIngestStats(s1, s2);
    assert.equal(merged.generatedAt, '2024-06-01');
  });
});

// ==================== R141 补充: formatReportSummary 边界 ====================

describe('formatReportSummary() — 边界情况', () => {
  it('仅更新页面', () => {
    const stats = new IngestStats({ newPageCount: 0, updatedPageCount: 3 });
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.includes('更新 3'));
  });

  it('有交叉引用', () => {
    const stats = new IngestStats({ newCrossRefs: [{}, {}, {}] });
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.includes('3 新交叉引用'));
  });

  it('无实体无概念时不显示知识组件行', () => {
    const stats = new IngestStats({ newPageCount: 1 });
    const formatted = formatReportSummary(stats);
    assert.ok(!formatted.includes('新实体'));
    assert.ok(!formatted.includes('新概念'));
  });
});
