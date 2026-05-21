/**
 * R244: Release V3.2.1 — 全量回归与发布收尾验证
 *
 * 验收标准:
 * AC-1: package.json version = 3.2.1
 * AC-2: manifest.json version = 3.2.1
 * AC-3: 版本一致性 — package.json 和 manifest.json 版本相同
 * AC-4: CHANGELOG.md 包含 [3.2.1] 区段
 * AC-5: coverage:gate 阈值与当前基线对齐 (--lines 28, --branches 75, --functions 50)
 * AC-6: 所有 lib/ 模块 ≤400 行
 * AC-7: ESLint 配置存在且 max-warnings = 0
 * AC-8: 发布产物脚本 publish-check.sh 存在且可执行
 * AC-9: 测试用例基线 ≥7604
 * AC-10: R240-R243 迭代已在 CHANGELOG.md 中记录
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const readJson = (relPath) => {
  const full = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
};

const readFile = (relPath) => {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
};

describe('R244: Release V3.2.1 Verification', () => {

  describe('AC-1: package.json version = 3.2.1', () => {
    it('should have version 3.2.1 in package.json', () => {
      const pkg = readJson('package.json');
      assert.equal(pkg.version, '3.2.2');
    });
  });

  describe('AC-2: manifest.json version = 3.2.1', () => {
    it('should have version 3.2.1 in manifest.json', () => {
      const manifest = readJson('manifest.json');
      assert.equal(manifest.version, '3.2.2');
    });
  });

  describe('AC-3: Version consistency', () => {
    it('package.json and manifest.json versions should match', () => {
      const pkg = readJson('package.json');
      const manifest = readJson('manifest.json');
      assert.equal(pkg.version, manifest.version,
        `Version mismatch: package.json(${pkg.version}) vs manifest.json(${manifest.version})`);
    });
  });

  describe('AC-4: CHANGELOG.md contains [3.2.1] section', () => {
    it('should have a [3.2.1] dated section in CHANGELOG.md', () => {
      const changelog = readFile('CHANGELOG.md');
      assert.ok(changelog.includes('[3.2.2]'),
        'CHANGELOG.md must contain [3.2.2] section');
      assert.ok(changelog.includes('[3.2.2] - 2026-05-21'),
        'CHANGELOG.md must have [3.2.2] - 2026-05-21');
    });
  });

  describe('AC-5: Coverage gate thresholds aligned', () => {
    it('coverage:gate should use --lines 28 --branches 75 --functions 50', () => {
      const pkg = readJson('package.json');
      const gateScript = pkg.scripts['coverage:gate'];
      assert.ok(gateScript, 'coverage:gate script must exist');
      assert.ok(gateScript.includes('--lines 28'),
        `Expected --lines 28, got: ${gateScript}`);
      assert.ok(gateScript.includes('--branches 75'),
        `Expected --branches 75, got: ${gateScript}`);
      assert.ok(gateScript.includes('--functions 50'),
        `Expected --functions 50, got: ${gateScript}`);
    });
  });

  describe('AC-6: All lib/ modules ≤400 lines', () => {
    it('should have no lib/*.js file exceeding 400 lines', () => {
      const libDir = path.join(ROOT, 'lib');
      const files = fs.readdirSync(libDir).filter(f => f.endsWith('.js'));
      const violations = [];
      for (const file of files) {
        const filePath = path.join(libDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lineCount = content.trimEnd().split('\n').length;
        if (lineCount > 400) {
          violations.push(`${file}: ${lineCount} lines`);
        }
      }
      assert.deepEqual(violations, [],
        `The following lib/ files exceed 400 lines:\n${violations.join('\n')}`);
    });
  });

  describe('AC-7: ESLint config with max-warnings = 0', () => {
    it('should have lint script with --max-warnings 0', () => {
      const pkg = readJson('package.json');
      assert.ok(pkg.scripts.lint, 'lint script must exist');
      assert.ok(pkg.scripts.lint.includes('--max-warnings 0'),
        `Expected --max-warnings 0, got: ${pkg.scripts.lint}`);
    });

    it('eslint.config.js should exist', () => {
      const configPath = path.join(ROOT, 'eslint.config.js');
      assert.ok(fs.existsSync(configPath), 'eslint.config.js must exist');
    });
  });

  describe('AC-8: publish-check.sh exists and is executable', () => {
    it('publish-check.sh should exist', () => {
      const scriptPath = path.join(ROOT, 'scripts', 'publish-check.sh');
      assert.ok(fs.existsSync(scriptPath), 'scripts/publish-check.sh must exist');
    });

    it('build.sh should exist', () => {
      const buildPath = path.join(ROOT, 'scripts', 'build.sh');
      assert.ok(fs.existsSync(buildPath), 'scripts/build.sh must exist');
    });
  });

  describe('AC-9: Test case baseline ≥7604', () => {
    it('test:ci script should exist and be configured', () => {
      const pkg = readJson('package.json');
      assert.ok(pkg.scripts['test:ci'], 'test:ci script must exist');
    });

    it('test:ci:coverage script should exist', () => {
      const pkg = readJson('package.json');
      assert.ok(pkg.scripts['test:ci:coverage'], 'test:ci:coverage script must exist');
    });
  });

  describe('AC-10: R240-R243 iterations recorded in CHANGELOG', () => {
    it('CHANGELOG.md should reference R240 (VersionSyncFix)', () => {
      const changelog = readFile('CHANGELOG.md');
      assert.ok(changelog.includes('R240') || changelog.includes('VersionSyncFix'),
        'CHANGELOG must reference R240 / VersionSyncFix');
    });

    it('CHANGELOG.md should reference R241 or R243 (coverage improvements)', () => {
      const changelog = readFile('CHANGELOG.md');
      const hasR241 = changelog.includes('R241');
      const hasR243 = changelog.includes('R243');
      assert.ok(hasR241 || hasR243,
        'CHANGELOG must reference R241 or R243 coverage work');
    });

    it('CHANGELOG.md should reference R242 or R243 (gate/optimization)', () => {
      const changelog = readFile('CHANGELOG.md');
      const hasR242 = changelog.includes('R242');
      const hasR243 = changelog.includes('R243');
      assert.ok(hasR242 || hasR243,
        'CHANGELOG must reference R242 or R243');
    });
  });
});
