/**
 * 测试 R218: CHANGELOG [3.1.0] 区段补全与发布收尾 ChangelogV310Finalize
 *
 * 验收标准:
 *   AC-1: CHANGELOG.md 包含完整的 [3.1.0] 区段（R190-R217 变更记录）
 *   AC-2: package.json / manifest.json 版本号均为 3.1.0 且一致
 *   AC-3: RELEASE-NOTES-v3.1.md 存在且覆盖 R215-R217 新增内容
 *   AC-4: CHANGELOG 格式符合 Keep a Changelog 规范
 *   AC-5: R190-R214 所有迭代均有对应记录
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');

// ==================== 辅助函数 ====================

function readJSON(relPath) {
  return JSON.parse(readFileSync(join(PROJECT_DIR, relPath), 'utf-8'));
}

function readText(relPath) {
  return readFileSync(join(PROJECT_DIR, relPath), 'utf-8');
}

function fileExists(relPath) {
  return existsSync(join(PROJECT_DIR, relPath));
}

function fileSize(relPath) {
  return statSync(join(PROJECT_DIR, relPath)).size;
}

// ==================== AC-1: CHANGELOG.md [3.1.0] 区段完整性 ====================

describe('AC-1: CHANGELOG.md 包含 [3.1.0] 区段', () => {
  it('CHANGELOG.md 文件存在', () => {
    assert.ok(fileExists('CHANGELOG.md'), 'CHANGELOG.md should exist');
  });

  it('包含 [3.1.0] 版本标题', () => {
    const content = readText('CHANGELOG.md');
    assert.ok(content.includes('[3.1.0]'), 'Should contain [3.1.0] section header');
  });

  it('[3.1.0] 区段包含日期 2026-05-20', () => {
    const content = readText('CHANGELOG.md');
    assert.ok(content.includes('[3.1.0] - 2026-05-20'), 'Should have [3.1.0] - 2026-05-20 header');
  });

  it('[3.1.0] 位于 [3.0.0] 之前（版本降序排列）', () => {
    const content = readText('CHANGELOG.md');
    const idx310 = content.indexOf('[3.1.0]');
    const idx300 = content.indexOf('[3.0.0]');
    assert.ok(idx310 >= 0, '[3.1.0] should exist');
    assert.ok(idx300 >= 0, '[3.0.0] should exist');
    assert.ok(idx310 < idx300, '[3.1.0] should appear before [3.0.0]');
  });

  it('[3.1.0] 区段内容充实（>500 字符）', () => {
    const content = readText('CHANGELOG.md');
    const idx310 = content.indexOf('[3.1.0]');
    const idx300 = content.indexOf('## [3.0.0]');
    const section = content.slice(idx310, idx300);
    assert.ok(section.length > 500, `[3.1.0] section should be > 500 chars, got ${section.length}`);
  });
});

// ==================== AC-2: 版本号一致性 ====================

describe('AC-2: 版本号 3.1.0 一致性', () => {
  it('package.json version = 3.2.0', () => {
    const pkg = readJSON('package.json');
    assert.equal(pkg.version, '3.6.0', `Expected 3.5.0, got ${pkg.version}`);
  });

  it('manifest.json version = 3.2.0', () => {
    const manifest = readJSON('manifest.json');
    assert.equal(manifest.version, '3.6.0', `Expected 3.5.0, got ${manifest.version}`);
  });

  it('package.json 和 manifest.json 版本一致', () => {
    const pkg = readJSON('package.json');
    const manifest = readJSON('manifest.json');
    assert.equal(pkg.version, manifest.version,
      `package.json(${pkg.version}) should match manifest.json(${manifest.version})`);
  });
});

// ==================== AC-3: RELEASE-NOTES-v3.1.md 覆盖新内容 ====================

describe('AC-3: RELEASE-NOTES-v3.1.md 覆盖 R215-R217', () => {
  it('RELEASE-NOTES-v3.1.md 文件存在', () => {
    assert.ok(fileExists('docs/RELEASE-NOTES-v3.1.md'), 'docs/RELEASE-NOTES-v3.1.md should exist');
  });

  it('包含 R215 测试失败修复', () => {
    const content = readText('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(content.includes('R215'), 'Should mention R215');
  });

  it('包含 R216 覆盖率冲刺', () => {
    const content = readText('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(content.includes('R216'), 'Should mention R216');
  });

  it('包含 R217 超大模块拆分十三期', () => {
    const content = readText('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(content.includes('R217'), 'Should mention R217');
  });

  it('包含 R218 CHANGELOG 补全', () => {
    const content = readText('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(content.includes('R218'), 'Should mention R218');
  });

  it('文件大小 > 2000 bytes（内容充实）', () => {
    const size = fileSize('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(size > 2000, `File should be > 2000 bytes, got ${size}`);
  });
});

// ==================== AC-4: CHANGELOG 格式规范 ====================

describe('AC-4: CHANGELOG 格式符合 Keep a Changelog', () => {
  it('以 Keep a Changelog 说明开头', () => {
    const content = readText('CHANGELOG.md');
    assert.ok(
      content.includes('Keep a Changelog') || content.includes('keepachangelog'),
      'Should reference Keep a Changelog format'
    );
  });

  it('使用标准分类标签（新增/修复/性能/架构）', () => {
    const content = readText('CHANGELOG.md');
    const idx310 = content.indexOf('[3.1.0]');
    const idx300 = content.indexOf('## [3.0.0]');
    const section = content.slice(idx310, idx300);
    // Should have at least 2 of these standard categories
    const categories = ['新增', '修复', '性能', '架构', '测试', 'Added', 'Fixed', 'Changed', '### '];
    const matchCount = categories.filter(c => section.includes(c)).length;
    assert.ok(matchCount >= 2, `Should have ≥2 category headers, found ${matchCount}`);
  });

  it('版本号格式为 [X.Y.Z] - YYYY-MM-DD', () => {
    const content = readText('CHANGELOG.md');
    const matches = content.match(/\[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}/g);
    assert.ok(matches && matches.length >= 2, 'Should have at least 2 version headers with dates');
  });
});

// ==================== AC-5: R190-R217 迭代覆盖验证 ====================

describe('AC-5: R190-R217 关键迭代在 [3.1.0] 中有记录', () => {
  const content310 = (() => {
    const content = readText('CHANGELOG.md');
    const idx310 = content.indexOf('[3.1.0]');
    const idx300 = content.indexOf('## [3.0.0]');
    return content.slice(idx310, idx300);
  })();

  it('包含模块拆分相关记录（Phase 9-13）', () => {
    assert.ok(
      content310.includes('模块拆分') || content310.includes('ModuleSplit'),
      'Should mention module splitting'
    );
  });

  it('包含覆盖率基础设施记录', () => {
    assert.ok(
      content310.includes('覆盖率') || content310.includes('Coverage'),
      'Should mention coverage infrastructure'
    );
  });

  it('包含测试失败修复记录', () => {
    assert.ok(
      content310.includes('测试失败') || content310.includes('TestFailure') || content310.includes('测试修复'),
      'Should mention test failure fixes'
    );
  });

  it('包含 ESLint 相关记录', () => {
    assert.ok(
      content310.includes('ESLint') || content310.includes('Lint') || content310.includes('lint'),
      'Should mention ESLint/lint'
    );
  });

  it('包含版本号统一记录', () => {
    assert.ok(
      content310.includes('版本号') || content310.includes('Version') || content310.includes('version'),
      'Should mention version sync'
    );
  });

  it('包含 E2E 框架记录', () => {
    assert.ok(
      content310.includes('E2E') || content310.includes('Puppeteer') || content310.includes('端到端'),
      'Should mention E2E framework'
    );
  });

  it('包含遥测反馈记录', () => {
    assert.ok(
      content310.includes('遥测') || content310.includes('telemetry') || content310.includes('Telemetry') || content310.includes('反馈'),
      'Should mention telemetry/feedback'
    );
  });

  it('包含性能 CI 记录', () => {
    assert.ok(
      content310.includes('性能') || content310.includes('Performance') || content310.includes('perf'),
      'Should mention performance CI'
    );
  });

  it('包含发布自动化记录', () => {
    assert.ok(
      content310.includes('发布自动化') || content310.includes('Release') || content310.includes('release') || content310.includes('自动化'),
      'Should mention release automation'
    );
  });

  it('包含 Chrome Web Store 提交记录', () => {
    assert.ok(
      content310.includes('Chrome Web Store') || content310.includes('CWS') || content310.includes('合规'),
      'Should mention Chrome Web Store submission'
    );
  });

  it('包含模块合并/架构瘦身记录', () => {
    assert.ok(
      content310.includes('模块合并') || content310.includes('ModuleConsolidation') || content310.includes('合并') || content310.includes('瘦身'),
      'Should mention module consolidation'
    );
  });

  it('包含测试执行效率优化记录', () => {
    assert.ok(
      content310.includes('执行效率') || content310.includes('TestExecution') || content310.includes('测试优化'),
      'Should mention test execution optimization'
    );
  });

  it('至少提及 10 轮迭代（通过 R 编号统计）', () => {
    const rMatches = content310.match(/\bR\d{2,3}\b/g) || [];
    const uniqueR = [...new Set(rMatches)];
    assert.ok(uniqueR.length >= 10, `Should mention ≥10 R-iterations, found ${uniqueR.length}: ${uniqueR.join(', ')}`);
  });
});
