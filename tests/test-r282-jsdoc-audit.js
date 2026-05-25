/**
 * test-r282-jsdoc-audit.js — R282 JSDoc 完整性审计测试
 *
 * 测试覆盖:
 *   - parseExports: 导出符号检测（function/class/const/let/async function/default/re-export）
 *   - calculateFileCoverage: 单文件覆盖率计算
 *   - calculateBatchCoverage: 批量覆盖率计算
 *   - generateReport / generateSummary: 报告生成
 *   - lib/ 实际模块 JSDoc 覆盖率 ≥ 80% 门禁
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  parseExports,
  calculateFileCoverage,
  calculateBatchCoverage,
  generateReport,
  generateSummary,
} from '../lib/jsdoc-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== parseExports ====================

describe('parseExports — 导出符号检测', () => {

  it('应检测 export function 声明', () => {
    const content = 'export function hello() { return 1; }';
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'hello');
    assert.equal(result[0].kind, 'function');
    assert.equal(result[0].hasJSDoc, false);
  });

  it('应检测 export async function 声明', () => {
    const content = '/** 异步函数 */\nexport async function fetchData() { return null; }';
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'fetchData');
    assert.equal(result[0].kind, 'function');
    assert.equal(result[0].hasJSDoc, true);
  });

  it('应检测 export class 声明', () => {
    const content = '/** 演示类 */\nexport class Demo { }';
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Demo');
    assert.equal(result[0].kind, 'class');
    assert.equal(result[0].hasJSDoc, true);
    assert.equal(result[0].jsdocSummary, '演示类');
  });

  it('应检测 export const/let/var 声明', () => {
    const content = 'export const X = 1;\n/** Y 常量 */\nexport let Y = 2;\nexport var Z = 3;';
    const result = parseExports(content);
    assert.equal(result.length, 3);
    assert.equal(result[0].name, 'X');
    assert.equal(result[0].kind, 'const');
    assert.equal(result[1].name, 'Y');
    assert.equal(result[1].hasJSDoc, true);
    assert.equal(result[2].name, 'Z');
    assert.equal(result[2].hasJSDoc, false);
  });

  it('应忽略 re-export（export { ... } from ...）', () => {
    const content = "export { foo, bar } from './other.js';\nexport function real() { }";
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'real');
  });

  it('应检测 export default 声明', () => {
    const content = '/** 默认导出 */\nexport default function main() { }';
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'main');
    assert.equal(result[0].kind, 'default');
    assert.equal(result[0].hasJSDoc, true);
  });

  it('应正确提取 JSDoc 摘要（多行 JSDoc）', () => {
    const content = '/**\n * 知识图谱 — 构建和可视化知识关联\n *\n * 支持力导向布局、节点聚类等\n */\nexport class KnowledgeGraph { }';
    const result = parseExports(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].hasJSDoc, true);
    assert.ok(result[0].jsdocSummary.includes('知识图谱'));
  });

  it('应处理空内容', () => {
    assert.deepEqual(parseExports(''), []);
    assert.deepEqual(parseExports(null), []);
    assert.deepEqual(parseExports(undefined), []);
    assert.deepEqual(parseExports(42), []);
  });

  it('应正确报告行号', () => {
    const content = '// 行 1\n// 行 2\n/**\n * 测试\n */\nexport function testFn() { }';
    const result = parseExports(content);
    assert.equal(result[0].line, 6);
  });

  it('应处理多 JSDoc 与 export 间有空行', () => {
    const content = '/**\n * 间隔后有空行\n */\n\nexport function spacedOut() { }';
    const result = parseExports(content);
    assert.equal(result[0].hasJSDoc, true);
  });
});

// ==================== calculateFileCoverage ====================

describe('calculateFileCoverage — 单文件覆盖率', () => {

  it('应计算正确覆盖率（全部有 JSDoc）', () => {
    const content = '/** A */\nexport function a() {}\n/** B */\nexport function b() {}';
    const result = calculateFileCoverage(content);
    assert.equal(result.total, 2);
    assert.equal(result.covered, 2);
    assert.equal(result.missing, 0);
    assert.equal(result.coverage, 100);
  });

  it('应计算正确覆盖率（部分缺失）', () => {
    const content = '/** A */\nexport function a() {}\nexport function b() {}';
    const result = calculateFileCoverage(content);
    assert.equal(result.total, 2);
    assert.equal(result.covered, 1);
    assert.equal(result.missing, 1);
    assert.equal(result.coverage, 50);
  });

  it('应计算正确覆盖率（全部缺失）', () => {
    const content = 'export function a() {}\nexport function b() {}\nexport function c() {}';
    const result = calculateFileCoverage(content);
    assert.equal(result.total, 3);
    assert.equal(result.covered, 0);
    assert.equal(result.missing, 3);
    assert.equal(result.coverage, 0);
  });

  it('无导出时覆盖率应为 100%', () => {
    const content = 'const x = 1;';
    const result = calculateFileCoverage(content);
    assert.equal(result.total, 0);
    assert.equal(result.coverage, 100);
  });

  it('空内容覆盖率应为 100%', () => {
    const result = calculateFileCoverage('');
    assert.equal(result.total, 0);
    assert.equal(result.coverage, 100);
  });
});

// ==================== calculateBatchCoverage ====================

describe('calculateBatchCoverage — 批量覆盖率', () => {

  it('应正确汇总多文件结果', () => {
    const files = [
      { name: 'a.js', content: '/** A */\nexport function a() {}' },
      { name: 'b.js', content: 'export function b() {}' },
    ];
    const result = calculateBatchCoverage(files);
    assert.equal(result.summary.totalFiles, 2);
    assert.equal(result.summary.filesWithMissing, 1);
    assert.equal(result.summary.totalExports, 2);
    assert.equal(result.summary.coveredExports, 1);
    assert.equal(result.summary.missingExports, 1);
    assert.equal(result.summary.overallCoverage, 50);
  });

  it('空数组应返回 100% 覆盖率', () => {
    const result = calculateBatchCoverage([]);
    assert.equal(result.summary.overallCoverage, 100);
    assert.equal(result.summary.totalFiles, 0);
  });

  it('null/undefined 输入应安全处理', () => {
    const result = calculateBatchCoverage(null);
    assert.equal(result.summary.overallCoverage, 100);
  });

  it('文件结果应按缺失数降序排列', () => {
    const files = [
      { name: 'good.js', content: '/** A */\nexport function a() {}\n/** B */\nexport function b() {}' },
      { name: 'bad.js', content: 'export function x() {}\nexport function y() {}\nexport function z() {}' },
      { name: 'ok.js', content: '/** C */\nexport function c() {}\nexport function d() {}' },
    ];
    const result = calculateBatchCoverage(files);
    assert.equal(result.files[0].name, 'bad.js');
    assert.equal(result.files[0].missing, 3);
  });
});

// ==================== generateReport / generateSummary ====================

describe('generateReport / generateSummary — 报告生成', () => {

  it('generateReport 应返回 Markdown 字符串', () => {
    const files = [
      { name: 'a.js', content: '/** A */\nexport function a() {}' },
      { name: 'b.js', content: 'export function b() {}' },
    ];
    const batchResult = calculateBatchCoverage(files);
    const report = generateReport(batchResult);
    assert.ok(report.includes('# JSDoc 完整性审计报告'));
    assert.ok(report.includes('总览'));
    assert.ok(report.includes('50%'));
  });

  it('generateSummary 应返回单行摘要', () => {
    const files = [
      { name: 'a.js', content: '/** A */\nexport function a() {}' },
      { name: 'b.js', content: 'export function b() {}' },
    ];
    const batchResult = calculateBatchCoverage(files);
    const summary = generateSummary(batchResult);
    assert.ok(summary.includes('50%'));
    assert.ok(summary.includes('1/2'));
  });

  it('全部覆盖时应显示 100%', () => {
    const files = [
      { name: 'a.js', content: '/** A */\nexport function a() {}' },
    ];
    const batchResult = calculateBatchCoverage(files);
    const summary = generateSummary(batchResult);
    assert.ok(summary.includes('100%'));
  });
});

// ==================== lib/ 实际模块 JSDoc 门禁 ====================

describe('lib/ 模块 JSDoc 覆盖率门禁', () => {

  it('lib/ 整体 JSDoc 覆盖率应 ≥ 80%', () => {
    const libDir = path.resolve(__dirname, '../lib');
    const files = fs.readdirSync(libDir)
      .filter(f => f.endsWith('.js'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(libDir, f), 'utf-8'),
      }));

    const result = calculateBatchCoverage(files);

    // 打印详细信息
    console.log('\n📊 JSDoc 覆盖率审计结果:');
    console.log('   文件总数: ' + result.summary.totalFiles);
    console.log('   有缺失的文件: ' + result.summary.filesWithMissing);
    console.log('   导出符号: ' + result.summary.coveredExports + '/' + result.summary.totalExports);
    console.log('   覆盖率: ' + result.summary.overallCoverage + '%');

    const worstFiles = result.files.filter(f => f.missing > 0).slice(0, 5);
    if (worstFiles.length > 0) {
      console.log('   缺失最多的文件:');
      for (const f of worstFiles) {
        console.log('     ' + f.name + ': ' + f.missing + ' 缺失 (覆盖 ' + f.coverage + '%)');
      }
    }

    assert.ok(
      result.summary.overallCoverage >= 80,
      'JSDoc 覆盖率 ' + result.summary.overallCoverage + '% 低于 80% 门禁'
    );
  });

  it('lib/ 缺失 JSDoc 的文件数应 ≤ 40', () => {
    const libDir = path.resolve(__dirname, '../lib');
    const files = fs.readdirSync(libDir)
      .filter(f => f.endsWith('.js'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(libDir, f), 'utf-8'),
      }));

    const result = calculateBatchCoverage(files);
    assert.ok(
      result.summary.filesWithMissing <= 40,
      result.summary.filesWithMissing + ' 个文件有缺失 JSDoc，超过 ≤40 门禁'
    );
  });

  it('lib/jsdoc-audit.js 自身应有完整 JSDoc', () => {
    const auditPath = path.resolve(__dirname, '../lib/jsdoc-audit.js');
    const content = fs.readFileSync(auditPath, 'utf-8');
    const result = calculateFileCoverage(content);
    assert.equal(result.missing, 0, 'jsdoc-audit.js 自身导出符号应全部有 JSDoc');
  });

  it('统计信息应打印缺失文件清单', () => {
    const libDir = path.resolve(__dirname, '../lib');
    const files = fs.readdirSync(libDir)
      .filter(f => f.endsWith('.js'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(libDir, f), 'utf-8'),
      }));

    const result = calculateBatchCoverage(files);
    const report = generateReport(result);
    assert.ok(report.includes('JSDoc 完整性审计报告'));
    assert.ok(report.includes('总览'));
  });
});

// ==================== 特定模块 JSDoc 验证 ====================

describe('已补全 JSDoc 的关键模块验证', () => {

  const keyModules = [
    'i18n.js',
    'stats.js',
    'bookmark-user-profile-io.js',
    'wiki-store-funcs.js',
    'bookmark-learning-progress-db.js',
    'compilation-report-format.js',
    'knowledge-graph-layout.js',
    'bookmark-notifier.js',
    'bookmark-spaced-repetition-methods.js',
    'bookmark-visualizer-physics.js',
    'skill-store-community.js',
    'bookmark-store-prep-checks.js',
    'plugin-system-utils.js',
    'bookmark-io-standalone.js',
    'bookmark-learning-coach-constants.js',
    'bookmark-dark-theme.js',
    'bookmark-core.js',
    'bookmark-final-polish.js',
    'bookmark-migration-runner.js',
    'bookmark-sync.js',
  ];

  for (const modName of keyModules) {
    it(modName + ' JSDoc 覆盖率应 ≥ 80%', () => {
      const filePath = path.resolve(__dirname, '../lib', modName);
      if (!fs.existsSync(filePath)) {
        return;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = calculateFileCoverage(content);
      const missingSymbols = result.symbols.filter(s => !s.hasJSDoc).map(s => s.name);
      assert.ok(
        result.coverage >= 80,
        modName + ' JSDoc 覆盖率 ' + result.coverage + '% < 80% (缺失: ' + missingSymbols.join(', ') + ')'
      );
    });
  }
});
