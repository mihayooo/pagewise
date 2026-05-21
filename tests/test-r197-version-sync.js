/**
 * R197: 版本号统一与 CHANGELOG 补全 VersionSyncAndChangelog
 * 单元测试 — 验证版本号一致性、CHANGELOG 格式、manifest.json 合法性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readJson(relPath) {
  const raw = readFileSync(resolve(ROOT, relPath), 'utf-8');
  return JSON.parse(raw);
}

function readFile(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

describe('R197: VersionSyncAndChangelog', () => {

  // ── AC-1: package.json 版本号更新为 3.2.0 ──
  describe('AC-1: package.json version', () => {
    it('package.json version should be "3.2.0"', () => {
      const pkg = readJson('package.json');
      assert.equal(pkg.version, '3.2.0');
    });

    it('package.json version should follow SemVer MAJOR.MINOR.PATCH', () => {
      const pkg = readJson('package.json');
      const parts = pkg.version.split('.');
      assert.equal(parts.length, 3, 'Should have 3 segments');
      parts.forEach(p => assert.match(p, /^\d+$/, `Segment "${p}" should be numeric`));
    });

    it('package.json MAJOR version should be 3 (aligned with manifest)', () => {
      const pkg = readJson('package.json');
      const major = pkg.version.split('.')[0];
      assert.equal(major, '3');
    });
  });

  // ── AC-2: CHANGELOG.md 补充 [3.1.0] 区段 ──
  describe('AC-2: CHANGELOG.md [3.1.0] section', () => {
    it('CHANGELOG.md should exist', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.length > 0);
    });

    it('CHANGELOG.md should contain [3.1.0] section header', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('## [3.1.0]'), 'Should contain ## [3.1.0] header');
    });

    it('CHANGELOG.md [3.1.0] should have date 2026-05-20', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[3.1.0] - 2026-05-20'), 'Should have date 2026-05-20');
    });

    it('CHANGELOG.md [3.1.0] should mention R193 module split', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('R193') || content.includes('模块拆分九期'),
        'Should reference R193 or module split phase 9');
    });

    it('CHANGELOG.md [3.1.0] should mention R192 coverage infra fix', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('R192') || content.includes('覆盖率基础设施'),
        'Should reference R192 or coverage infra fix');
    });

    it('CHANGELOG.md [3.1.0] should mention R190 test failure fix', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('R190') || content.includes('测试失败修复'),
        'Should reference R190 or test failure fix');
    });

    it('CHANGELOG.md [3.1.0] should mention ESLint cleanup', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('ESLint') || content.includes('lint'),
        'Should reference ESLint or lint cleanup');
    });

    it('CHANGELOG.md [3.1.0] section should appear before [3.0.0]', () => {
      const content = readFile('docs/CHANGELOG.md');
      const idx310 = content.indexOf('[3.1.0]');
      const idx300 = content.indexOf('[3.0.0]');
      // [3.0.0] might be referenced in the 3.1.0 text; find the section header
      const idx300Header = content.indexOf('## [3.0.0]');
      if (idx300Header >= 0) {
        assert.ok(idx310 < idx300Header, '[3.1.0] should appear before [3.0.0] header');
      }
    });

    it('CHANGELOG.md should follow Keep a Changelog format (has --- separator)', () => {
      const content = readFile('docs/CHANGELOG.md');
      // Keep a Changelog format typically uses ## headers with version and date
      assert.ok(content.includes('---'), 'Should have section separator');
    });
  });

  // ── AC-3: manifest.json 版本一致性 ──
  describe('AC-3: manifest.json version consistency', () => {
    it('manifest.json version should be "3.2.0"', () => {
      const manifest = readJson('manifest.json');
      assert.equal(manifest.version, '3.2.0');
    });

    it('manifest.json should be valid JSON', () => {
      const raw = readFile('manifest.json');
      assert.doesNotThrow(() => JSON.parse(raw), 'manifest.json should parse without error');
    });

    it('manifest.json manifest_version should be 3', () => {
      const manifest = readJson('manifest.json');
      assert.equal(manifest.manifest_version, 3);
    });

    it('package.json and manifest.json versions should match', () => {
      const pkg = readJson('package.json');
      const manifest = readJson('manifest.json');
      assert.equal(pkg.version, manifest.version,
        `package.json(${pkg.version}) should match manifest.json(${manifest.version})`);
    });

    it('manifest.json should have required fields', () => {
      const manifest = readJson('manifest.json');
      assert.ok(manifest.name, 'Should have name');
      assert.ok(manifest.version, 'Should have version');
      assert.ok(manifest.permissions, 'Should have permissions');
      assert.ok(manifest.background, 'Should have background');
    });
  });

  // ── AC-4: 迭代报告 ──
  describe('AC-4: iteration report', () => {
    it('docs/reports/2026-05-20-R39.md should exist', () => {
      const content = readFile('docs/reports/2026-05-20-R39.md');
      assert.ok(content.length > 0, 'Report file should not be empty');
    });

    it('iteration report should mention R197', () => {
      const content = readFile('docs/reports/2026-05-20-R39.md');
      assert.ok(content.includes('R197'), 'Should reference R197');
    });

    it('iteration report should mention R39 round', () => {
      const content = readFile('docs/reports/2026-05-20-R39.md');
      assert.ok(content.includes('R39') || content.includes('轮次'), 'Should reference round R39');
    });

    it('iteration report should mention version sync', () => {
      const content = readFile('docs/reports/2026-05-20-R39.md');
      assert.ok(
        content.includes('VersionSync') || content.includes('版本号') || content.includes('3.1.0'),
        'Should reference version sync'
      );
    });
  });

  // ── AC-5: 无功能回归 ──
  describe('AC-5: no functional regression', () => {
    it('version files should be consistent across all three files', () => {
      const pkg = readJson('package.json');
      const manifest = readJson('manifest.json');
      const changelog = readFile('docs/CHANGELOG.md');

      assert.equal(pkg.version, '3.2.0');
      assert.equal(manifest.version, '3.2.0');
      assert.ok(changelog.includes('[3.2.0]'));
    });

    it('CHANGELOG.md should still contain previous versions', () => {
      const content = readFile('docs/CHANGELOG.md');
      assert.ok(content.includes('[1.0.0]'), 'Should retain [1.0.0] history');
      assert.ok(content.includes('[1.1.0]') || content.includes('[1.1.1]'),
        'Should retain 1.1.x history');
    });
  });
});
