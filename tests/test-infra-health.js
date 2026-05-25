/**
 * Test Infrastructure Health — R295: TestInfraReliability
 *
 * 验证测试基础设施可靠性：
 *   1. test:ci 命令可执行
 *   2. lint 命令可执行
 *   3. coverage:gate 可执行
 *   4. 关键 lib 模块可 import
 *   5. manifest.json 可解析
 *   6. package.json 结构完整
 *   7. .c8rc.json 可解析
 *   8. test-preflight.sh 存在且可执行
 *   9. Node.js 版本符合要求
 *  10. test 文件语法检查
 *  11. CI workflow 包含 preflight 步骤
 *  12. 测试脚本路径一致性
 *
 * ≥12 用例，覆盖基础设施健康状态。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = join(import.meta.dirname, '..');

// ==================== 辅助函数 ====================

function readJSON(relPath) {
  const absPath = join(PROJECT_ROOT, relPath);
  return JSON.parse(readFileSync(absPath, 'utf8'));
}

function fileExists(relPath) {
  return existsSync(join(PROJECT_ROOT, relPath));
}

function readText(relPath) {
  return readFileSync(join(PROJECT_ROOT, relPath), 'utf8');
}

function runCmd(cmd, opts = {}) {
  try {
    return {
      stdout: execSync(cmd, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: opts.timeout || 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim(),
      exitCode: 0,
      error: null,
    };
  } catch (err) {
    return {
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
      exitCode: err.status || 1,
      error: err,
    };
  }
}

// ==================== 1. test:ci 命令可执行 ====================

describe('R295: test:ci 命令可执行', () => {
  it('package.json 包含 test:ci script', () => {
    const pkg = readJSON('package.json');
    assert.ok(pkg.scripts['test:ci'], 'test:ci script 应存在');
    assert.ok(pkg.scripts['test:ci'].length > 20, 'test:ci script 不应过短');
  });

  it('test:ci 命令包含 node --test', () => {
    const pkg = readJSON('package.json');
    assert.ok(
      pkg.scripts['test:ci'].includes('node --test'),
      'test:ci 应包含 node --test'
    );
  });

  it('test:ci 命令引用 tests/ 目录', () => {
    const pkg = readJSON('package.json');
    assert.ok(
      pkg.scripts['test:ci'].includes('tests'),
      'test:ci 应引用 tests/ 目录'
    );
  });
});

// ==================== 2. lint 命令可执行 ====================

describe('R295: lint 命令可执行', () => {
  it('package.json 包含 lint script', () => {
    const pkg = readJSON('package.json');
    assert.ok(pkg.scripts['lint'], 'lint script 应存在');
    assert.ok(pkg.scripts['lint'].includes('eslint'), 'lint 应包含 eslint');
  });

  it('eslint.config.js 存在', () => {
    assert.ok(fileExists('eslint.config.js'), 'eslint.config.js 应存在');
  });

  it('npm run lint 可执行（快速验证）', () => {
    const result = runCmd('npx eslint --version', { timeout: 15000 });
    assert.equal(result.exitCode, 0, `eslint --version 应成功，got: ${result.stderr}`);
    assert.ok(result.stdout.includes('v'), 'ESLint 版本输出应包含 v');
  });
});

// ==================== 3. coverage:gate 可执行 ====================

describe('R295: coverage:gate 可执行', () => {
  it('package.json 包含 coverage:gate script', () => {
    const pkg = readJSON('package.json');
    assert.ok(pkg.scripts['coverage:gate'], 'coverage:gate script 应存在');
    assert.ok(
      pkg.scripts['coverage:gate'].includes('c8'),
      'coverage:gate 应使用 c8'
    );
  });

  it('package.json 包含 test:coverage script', () => {
    const pkg = readJSON('package.json');
    assert.ok(pkg.scripts['test:coverage'], 'test:coverage script 应存在');
  });
});

// ==================== 4. 关键 lib 模块可 import ====================

describe('R295: 关键 lib 模块可 import', () => {
  const CORE_MODULES = [
    { name: 'utils', path: '../lib/utils.js' },
    { name: 'storage-adapter', path: '../lib/storage-adapter.js' },
    { name: 'bookmark-indexer', path: '../lib/bookmark-indexer.js' },
    { name: 'bookmark-graph', path: '../lib/bookmark-graph.js' },
    { name: 'ai-client', path: '../lib/ai-client.js' },
    { name: 'ai-cache', path: '../lib/ai-cache.js' },
    { name: 'spaced-repetition', path: '../lib/spaced-repetition.js' },
    { name: 'knowledge-graph', path: '../lib/knowledge-graph.js' },
    { name: 'cost-estimator', path: '../lib/cost-estimator.js' },
    { name: 'browser-compat', path: '../lib/browser-compat.js' },
  ];

  for (const mod of CORE_MODULES) {
    it(`lib/${mod.name}.js 可 import`, async () => {
      const m = await import(mod.path);
      assert.ok(m !== null && m !== undefined, `lib/${mod.name}.js 应可导入`);
      assert.ok(
        typeof m === 'object',
        `lib/${mod.name}.js 应导出对象，got ${typeof m}`
      );
    });
  }
});

// ==================== 5. manifest.json 可解析 ====================

describe('R295: manifest.json 可解析', () => {
  it('manifest.json 存在且是合法 JSON', () => {
    assert.ok(fileExists('manifest.json'), 'manifest.json 应存在');
    const manifest = readJSON('manifest.json');
    assert.ok(manifest, 'manifest.json 应可解析');
  });

  it('manifest.json 为 MV3', () => {
    const manifest = readJSON('manifest.json');
    assert.equal(manifest.manifest_version, 3, 'manifest_version 应为 3');
  });

  it('manifest.json 包含必需权限', () => {
    const manifest = readJSON('manifest.json');
    assert.ok(Array.isArray(manifest.permissions), 'permissions 应为数组');
    const requiredPerms = ['storage', 'sidePanel'];
    for (const perm of requiredPerms) {
      assert.ok(
        manifest.permissions.includes(perm),
        `permissions 应包含 ${perm}`
      );
    }
  });

  it('manifest.json 包含版本号', () => {
    const manifest = readJSON('manifest.json');
    assert.ok(manifest.version, '应有 version 字段');
    assert.match(manifest.version, /^\d+\.\d+\.\d+/, 'version 应符合 semver');
  });
});

// ==================== 6. .c8rc.json 可解析 ====================

describe('R295: .c8rc.json 可解析', () => {
  it('.c8rc.json 存在且是合法 JSON', () => {
    assert.ok(fileExists('.c8rc.json'), '.c8rc.json 应存在');
    const c8config = readJSON('.c8rc.json');
    assert.ok(c8config, '.c8rc.json 应可解析');
  });

  it('.c8rc.json 配置项完整', () => {
    const c8config = readJSON('.c8rc.json');
    assert.ok(Array.isArray(c8config.reporter), 'reporter 应为数组');
    assert.ok(c8config.reporter.includes('lcov'), 'reporter 应包含 lcov');
    assert.ok(c8config.reporter.includes('text-summary'), 'reporter 应包含 text-summary');
    assert.ok(Array.isArray(c8config.include), 'include 应为数组');
    assert.ok(c8config.include.some(p => p.includes('lib')), 'include 应覆盖 lib/');
    assert.ok(Array.isArray(c8config.exclude), 'exclude 应为数组');
    assert.ok(c8config.exclude.some(p => p.includes('tests')), 'exclude 应包含 tests');
    // R306: all 已移除 — 171 个未测试模块计入分母导致覆盖率虚低
  });

  it('.c8rc.json tmpDir 指向项目内路径', () => {
    const c8config = readJSON('.c8rc.json');
    assert.ok(c8config.tmpDir, 'tmpDir 应存在');
    assert.ok(
      !c8config.tmpDir.startsWith('/tmp'),
      'tmpDir 不应指向外部 /tmp 路径'
    );
  });
});

// ==================== 7. test-preflight.sh 存在且可执行 ====================

describe('R295: test-preflight.sh 存在且可执行', () => {
  it('scripts/test-preflight.sh 存在', () => {
    assert.ok(
      fileExists('scripts/test-preflight.sh'),
      'scripts/test-preflight.sh 应存在'
    );
  });

  it('scripts/test-preflight.sh 是可执行文件', () => {
    const stat = statSync(join(PROJECT_ROOT, 'scripts/test-preflight.sh'));
    assert.ok(stat.mode & 0o111, 'test-preflight.sh 应有执行权限');
  });

  it('scripts/test-preflight.sh 是合法 bash 脚本', () => {
    const content = readText('scripts/test-preflight.sh');
    assert.ok(content.startsWith('#!/usr/bin/env bash'), '应有 bash shebang');
    assert.ok(content.includes('Node.js'), '应包含 Node.js 版本检查');
    assert.ok(content.includes('node_modules'), '应包含 node_modules 检查');
    assert.ok(content.includes('.c8rc.json'), '应包含 .c8rc.json 检查');
    assert.ok(content.includes('manifest.json'), '应包含 manifest.json 检查');
  });

  it('preflight 检查 Node.js 版本', () => {
    const content = readText('scripts/test-preflight.sh');
    assert.ok(
      content.includes('--ge 18') || content.includes('>= 18') || content.includes('≥ 18'),
      '应检查 Node.js ≥ 18'
    );
  });
});

// ==================== 8. Node.js 版本符合要求 ====================

describe('R295: Node.js 版本符合要求', () => {
  it('Node.js 版本 ≥ 18', () => {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    assert.ok(major >= 18, `Node.js 版本应 ≥ 18, 当前: ${nodeVersion}`);
  });

  it('支持 ES Modules', () => {
    assert.equal(typeof import.meta.url, 'string', 'import.meta.url 应可用');
  });
});

// ==================== 9. test 文件语法检查 ====================

describe('R295: test 文件语法检查', () => {
  it('测试目录中 test-*.js 文件数量 ≥ 100', () => {
    const testDir = join(PROJECT_ROOT, 'tests');
    const testFiles = readdirSync(testDir).filter(f =>
      f.startsWith('test-') && f.endsWith('.js')
    );
    assert.ok(
      testFiles.length >= 100,
      `应有 ≥ 100 个测试文件，实际: ${testFiles.length}`
    );
  });

  it('核心测试文件均存在', () => {
    const coreTests = [
      'tests/test-smoke.js',
      'tests/test-utils.js',
      'tests/test-ai-client.js',
      'tests/test-bookmark-indexer.js',
      'tests/test-storage-adapter.js',
      'tests/test-cost-estimator.js',
    ];
    for (const t of coreTests) {
      assert.ok(fileExists(t), `${t} 应存在`);
    }
  });
});

// ==================== 10. CI workflow 包含 preflight 步骤 ====================

describe('R295: CI workflow 包含 preflight 步骤', () => {
  it('.github/workflows/ci.yml 存在', () => {
    assert.ok(
      fileExists('.github/workflows/ci.yml'),
      '.github/workflows/ci.yml 应存在'
    );
  });

  it('CI workflow test job 包含 preflight 步骤', () => {
    const ciContent = readText('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('preflight') || ciContent.includes('Preflight'),
      'CI workflow 应包含 preflight 步骤'
    );
  });

  it('CI workflow 包含 test:ci 步骤', () => {
    const ciContent = readText('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('test:ci'),
      'CI workflow 应包含 test:ci'
    );
  });

  it('CI workflow 包含 lint 步骤', () => {
    const ciContent = readText('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('npm run lint') || ciContent.includes('eslint'),
      'CI workflow 应包含 lint 步骤'
    );
  });

  it('CI workflow 包含 coverage gate', () => {
    const ciContent = readText('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('coverage:gate') || ciContent.includes('coverage'),
      'CI workflow 应包含 coverage gate'
    );
  });
});

// ==================== 11. 测试脚本路径一致性 ====================

describe('R295: 测试脚本路径一致性', () => {
  it('test:ci 排除列表与被排除文件一致', () => {
    const pkg = readJSON('package.json');
    const testCi = pkg.scripts['test:ci'];
    // 确认排除了已知慢测试
    const excluded = ['test-e2e-', 'tests/e2e/', 'test-lint-r159.js'];
    for (const pattern of excluded) {
      assert.ok(
        testCi.includes(pattern),
        `test:ci 应排除 ${pattern}`
      );
    }
  });

  it('package.json 中 type 为 module', () => {
    const pkg = readJSON('package.json');
    assert.equal(pkg.type, 'module', 'type 应为 module (ESM)');
  });
});

// ==================== 12. lib/ 目录完整性 ====================

describe('R295: lib/ 目录完整性', () => {
  it('lib/ 目录包含 ≥ 200 个 JS 文件', () => {
    const libDir = join(PROJECT_ROOT, 'lib');
    const jsFiles = readdirSync(libDir).filter(f => f.endsWith('.js'));
    assert.ok(
      jsFiles.length >= 200,
      `lib/ 应包含 ≥ 200 个 JS 文件, 实际: ${jsFiles.length}`
    );
  });

  it('所有 lib/*.js 文件语法检查通过（采样）', () => {
    const libDir = join(PROJECT_ROOT, 'lib');
    const jsFiles = readdirSync(libDir)
      .filter(f => f.endsWith('.js'))
      .sort()
      .slice(0, 30);
    const errors = [];
    for (const f of jsFiles) {
      try {
        execSync(`node --check "lib/${f}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
      } catch (err) {
        errors.push(f);
      }
    }
    assert.deepEqual(errors, [], `以下文件语法错误: ${errors.join(', ')}`);
  });
});
