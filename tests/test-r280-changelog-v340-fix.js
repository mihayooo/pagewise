/**
 * R280: CHANGELOG v3.4.0 补全与版本断言修复 ChangelogV340Fix
 *
 * 验收标准:
 * AC-1: docs/CHANGELOG.md 包含 [3.4.0] 区段
 * AC-2: [3.4.0] 区段包含 R275-R279 变更记录
 * AC-3: 版本号一致性 — package.json / manifest.json 均为 3.4.0
 * AC-4: CHANGELOG 中 [3.4.0] 位于 [3.2.0] 之前（版本降序）
 * AC-5: 测试文件中无硬编码 3.3.0 版本号断言
 * AC-6: CHANGELOG 仍保留历史版本（[3.1.0], [1.0.0], [1.1.0] 等）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

function readFile(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

describe('R280: ChangelogV340Fix', () => {

  // ── AC-1: CHANGELOG.md 包含 [3.4.0] 区段 ──
  describe('AC-1: CHANGELOG.md 包含 [3.4.0] 区段', () => {
    it('docs/CHANGELOG.md 应存在', () => {
      assert.ok(existsSync(resolve(ROOT, 'docs/CHANGELOG.md')),
        'docs/CHANGELOG.md should exist');
    });

    it('CHANGELOG.md 应包含 ## [3.4.0] 区段标题', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('## [3.4.0]'),
        'Should contain ## [3.4.0] header');
    });

    it('[3.4.0] 区段应包含日期 2026-05-25', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[3.4.0] - 2026-05-25'),
        'Should have [3.4.0] - 2026-05-25');
    });
  });

  // ── AC-2: [3.4.0] 区段包含 R275-R279 变更记录 ──
  describe('AC-2: [3.4.0] 区段包含 R275-R279 变更', () => {
    const changelogContent = readFile('docs/CHANGELOG.md');
    const idx340 = changelogContent.indexOf('## [3.4.0]');
    const idx320 = changelogContent.indexOf('## [3.2.0]');
    const section340 = (idx340 >= 0 && idx320 >= 0)
      ? changelogContent.slice(idx340, idx320)
      : '';

    it('应包含 R278 跨浏览器兼容层', () => {
      assert.ok(section340.includes('R278') || section340.includes('CrossBrowserCompat'),
        'Should reference R278 / CrossBrowserCompat');
    });

    it('应包含 R277 运行时性能优化', () => {
      assert.ok(section340.includes('R277') || section340.includes('RuntimePerfOpt'),
        'Should reference R277 / RuntimePerfOpt');
    });

    it('应包含 R275 WCAG 无障碍合规', () => {
      assert.ok(section340.includes('R275') || section340.includes('AccessibilityWCAG'),
        'Should reference R275 / AccessibilityWCAG');
    });

    it('[3.4.0] 区段应有实质内容（>200 字符）', () => {
      assert.ok(section340.length > 200,
        `[3.4.0] section should have substantial content, got ${section340.length} chars`);
    });
  });

  // ── AC-3: 版本号一致性 ──
  describe('AC-3: 版本号一致性 3.4.0', () => {
    it('package.json version 应为 3.4.0', () => {
      const pkg = readJson('package.json');
      assert.equal(pkg.version, '3.4.0');
    });

    it('manifest.json version 应为 3.4.0', () => {
      const manifest = readJson('manifest.json');
      assert.equal(manifest.version, '3.4.0');
    });

    it('package.json 和 manifest.json 版本应一致', () => {
      const pkg = readJson('package.json');
      const manifest = readJson('manifest.json');
      assert.equal(pkg.version, manifest.version,
        `Mismatch: package.json(${pkg.version}) vs manifest.json(${manifest.version})`);
    });

    it('CHANGELOG 应包含 [3.4.0]（修复 test-r197:174 失败）', () => {
      const changelog = readFile('docs/CHANGELOG.md');
      assert.ok(changelog.includes('[3.4.0]'),
        'CHANGELOG must contain [3.4.0] — fixes test-r197-version-sync.js:174');
    });
  });

  // ── AC-4: 版本区段降序排列 ──
  describe('AC-4: CHANGELOG 版本区段降序排列', () => {
    it('[3.4.0] 应位于 [3.2.0] 之前', () => {
      const content = readFile('docs/CHANGELOG.md');
      const idx340 = content.indexOf('## [3.4.0]');
      const idx320 = content.indexOf('## [3.2.0]');
      assert.ok(idx340 >= 0, '[3.4.0] should exist');
      assert.ok(idx320 >= 0, '[3.2.0] should exist');
      assert.ok(idx340 < idx320, '[3.4.0] should appear before [3.2.0]');
    });

    it('[3.2.0] 应位于 [3.1.0] 之前', () => {
      const content = readFile('docs/CHANGELOG.md');
      const idx320 = content.indexOf('## [3.2.0]');
      const idx310 = content.indexOf('## [3.1.0]');
      assert.ok(idx320 >= 0, '[3.2.0] should exist');
      assert.ok(idx310 >= 0, '[3.1.0] should exist');
      assert.ok(idx320 < idx310, '[3.2.0] should appear before [3.1.0]');
    });
  });

  // ── AC-5: 无硬编码 3.3.0 版本断言 ──
  describe('AC-5: 测试文件中无硬编码 3.3.0 断言', () => {
    it('test-r197-version-sync.js 不应断言 3.3.0', () => {
      const content = readFile('tests/test-r197-version-sync.js');
      assert.ok(!content.includes("assert.equal(pkg.version, '3.3.0')"),
        'Should not have hardcoded 3.3.0 pkg assertion');
      assert.ok(!content.includes('assert.equal(pkg.version, "3.3.0")'),
        'Should not have hardcoded 3.3.0 pkg assertion (double quotes)');
      assert.ok(!content.includes("assert.equal(manifest.version, '3.3.0')"),
        'Should not have hardcoded 3.3.0 manifest assertion');
    });

    it('test-r197 断言版本应为 3.4.0', () => {
      const content = readFile('tests/test-r197-version-sync.js');
      assert.ok(content.includes("assert.equal(pkg.version, '3.4.0')"),
        'Should assert pkg 3.4.0');
      assert.ok(content.includes("assert.equal(manifest.version, '3.4.0')"),
        'Should assert manifest 3.4.0');
    });

    it('test-r197 应断言 changelog 包含 [3.4.0]', () => {
      const content = readFile('tests/test-r197-version-sync.js');
      assert.ok(content.includes("changelog.includes('[3.4.0]')"),
        'Should check for [3.4.0] in changelog');
    });

    it('test-r244-release-v321.js 不应断言 3.3.0', () => {
      const content = readFile('tests/test-r244-release-v321.js');
      assert.ok(!content.includes("assert.equal(pkg.version, '3.3.0')"),
        'Should not have hardcoded 3.3.0');
      assert.ok(!content.includes("assert.equal(manifest.version, '3.3.0')"),
        'Should not have hardcoded 3.3.0 manifest');
    });

    it('test-r218-changelog-v310.js 不应断言 3.3.0', () => {
      const content = readFile('tests/test-r218-changelog-v310.js');
      assert.ok(!content.includes("assert.equal(pkg.version, '3.3.0')"),
        'Should not have hardcoded 3.3.0');
    });
  });

  // ── AC-6: 历史版本保留 ──
  describe('AC-6: CHANGELOG 保留历史版本', () => {
    it('应保留 [3.2.0]', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[3.2.0]'), 'Should retain [3.2.0]');
    });

    it('应保留 [3.1.0]', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[3.1.0]'), 'Should retain [3.1.0]');
    });

    it('应保留 [1.0.0]', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[1.0.0]'), 'Should retain [1.0.0]');
    });

    it('应保留 [1.1.0] 或 [1.1.1]', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[1.1.0]') || content.includes('[1.1.1]'),
        'Should retain 1.1.x history');
    });
  });
});
