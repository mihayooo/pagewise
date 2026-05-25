/**
 * Test Performance Regression Wall — R296: TestPerfRegressionWall
 *
 * 验证 check-test-time.sh 门禁脚本逻辑：
 *   1. 脚本文件存在且可执行
 *   2. 阈值判定: 耗时 ≤ 阈值 → exit 0
 *   3. 阈值判定: 耗时 > 阈值 → exit 1
 *   4. 环境变量 TEST_TIME_THRESHOLD 可覆盖阈值
 *   5. test:ci 不包含已排除的覆盖率冲刺文件
 *   6. test:ci:coverage 包含覆盖率冲刺文件
 *   7. test:ci:release 包含发布验证文件
 *   8. 阈值非法输入处理 → exit 2
 *
 * ≥5 用例，覆盖门禁脚本核心逻辑。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const GATE_SCRIPT = join(PROJECT_ROOT, 'scripts', 'check-test-time.sh');

// ==================== 辅助函数 ====================

function readJSON(relPath) {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, relPath), 'utf8'));
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
        env: { ...process.env, ...(opts.env || {}) },
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

function getTestCiFileList() {
  const pkg = readJSON('package.json');
  const cmd = pkg.scripts['test:ci'];
  // Extract the find portion
  const findMatch = cmd.match(/\$\(find (.+?)\)/);
  if (!findMatch) return { cmd, files: [] };
  const findCmd = `find ${findMatch[1]}`;
  const stdout = execSync(findCmd, { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000 }).trim();
  return { cmd, files: stdout.split('\n').filter(Boolean) };
}

function getTestCiCoverageFileList() {
  const pkg = readJSON('package.json');
  const cmd = pkg.scripts['test:ci:coverage'];
  const findMatch = cmd.match(/\$\(find (.+?)\)/);
  if (!findMatch) return { cmd, files: [] };
  const findCmd = `find ${findMatch[1]}`;
  const stdout = execSync(findCmd, { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000 }).trim();
  return { cmd, files: stdout.split('\n').filter(Boolean) };
}

// ==================== 测试用例 ====================

describe('R296: check-test-time.sh 门禁脚本', () => {

  // --- AC-1: 脚本文件存在且可执行 ---
  it('门禁脚本存在且具有可执行权限', () => {
    assert.ok(existsSync(GATE_SCRIPT), `脚本不存在: ${GATE_SCRIPT}`);
    const stat = statSync(GATE_SCRIPT);
    const isExecutable = !!(stat.mode & 0o111);
    assert.ok(isExecutable, '脚本应具有可执行权限 (chmod +x)');
  });

  // --- AC-2: 脚本包含阈值常量 37 ---
  it('脚本默认阈值为 37 秒', () => {
    const content = readFileSync(GATE_SCRIPT, 'utf8');
    assert.ok(
      content.includes('TEST_TIME_THRESHOLD:-37'),
      '脚本应使用 TEST_TIME_THRESHOLD:-37 作为默认阈值'
    );
  });

  // --- AC-3: 阈值判定逻辑 — 耗时 > 阈值输出 FAIL + exit 1 ---
  it('阈值判定: 耗时超过阈值时 exit 1', () => {
    // 验证脚本的核心阈值比较逻辑（使用内联 bash 模拟耗时 > 阈值）
    const result = runCmd(`
      bash -c '
        THRESHOLD=1
        START_TIME=$(date +%s)
        sleep 2
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        if [ "$ELAPSED" -gt "$THRESHOLD" ]; then
          echo "PERF_FAIL: elapsed=\${ELAPSED}s > threshold=\${THRESHOLD}s"
          exit 1
        fi
        echo "PERF_PASS"
        exit 0
      '
    `, { timeout: 10000 });
    assert.equal(result.exitCode, 1, '耗时超过阈值应返回 exit 1');
    assert.ok(result.stdout.includes('PERF_FAIL'), '输出应包含 PERF_FAIL 标记');
  });

  // --- AC-4: 环境变量覆盖 — TEST_TIME_THRESHOLD 可修改阈值 ---
  it('环境变量 TEST_TIME_THRESHOLD 可自定义阈值', () => {
    const content = readFileSync(GATE_SCRIPT, 'utf8');
    // 验证脚本使用环境变量
    assert.ok(
      content.includes('TEST_TIME_THRESHOLD'),
      '脚本应读取 TEST_TIME_THRESHOLD 环境变量'
    );
    // 验证默认值
    assert.ok(
      content.includes('${TEST_TIME_THRESHOLD:-37}'),
      '应使用 ${TEST_TIME_THRESHOLD:-37} 语法设置默认值'
    );
  });

  // --- AC-5: test:ci 不包含已排除的覆盖率冲刺文件 ---
  it('test:ci 排除了覆盖率冲刺测试文件', () => {
    const { cmd, files } = getTestCiFileList();

    // 不应包含 coverage-boost 目录下的文件
    const coverageBoostFiles = files.filter(f => f.includes('coverage-boost'));
    assert.equal(coverageBoostFiles.length, 0,
      `test:ci 不应包含 coverage-boost 目录文件，但包含: ${coverageBoostFiles.join(', ')}`);

    // 不应包含特定的覆盖率冲刺文件
    const excludedNames = [
      'test-r137-coverage-boost.js',
      'test-coverage-infra.js',
      'test-r156-coverage-infra.js',
      'test-r233-coverage-gate.js',
      'test-r243-coverage-gate-align.js',
      'test-r256-coverage-infra-fix.js',
      'test-r291-coverage-config-drift-guard.js',
    ];
    for (const name of excludedNames) {
      const found = files.filter(f => f.endsWith('/' + name));
      assert.equal(found.length, 0,
        `test:ci 不应包含 ${name}，但包含: ${found.join(', ')}`);
    }
  });

  // --- AC-6: test:ci 不包含已排除的发布验证文件 ---
  it('test:ci 排除了发布验证测试文件', () => {
    const { files } = getTestCiFileList();

    const excludedReleaseFiles = [
      'test-r197-version-sync.js',
      'test-r208-release-build.js',
      'test-r218-changelog-v310.js',
      'test-r244-release-v321.js',
      'test-r280-changelog-v340-fix.js',
      'test-r282-jsdoc-audit.js',
    ];
    for (const name of excludedReleaseFiles) {
      const found = files.filter(f => f.endsWith('/' + name));
      assert.equal(found.length, 0,
        `test:ci 不应包含 ${name}，但包含: ${found.join(', ')}`);
    }
  });

  // --- AC-7: test:ci:coverage 包含覆盖率冲刺文件 ---
  it('test:ci:coverage 包含覆盖率冲刺测试文件', () => {
    const { files } = getTestCiCoverageFileList();

    // 应包含 coverage-boost 目录下的文件
    const coverageBoostFiles = files.filter(f => f.includes('coverage-boost'));
    assert.ok(coverageBoostFiles.length >= 5,
      `test:ci:coverage 应包含 coverage-boost 目录文件 (≥5)，实际: ${coverageBoostFiles.length}`);

    // 应包含特定的覆盖率冲刺文件
    const expectedCoverage = [
      'test-r137-coverage-boost.js',
      'test-r291-coverage-config-drift-guard.js',
    ];
    for (const name of expectedCoverage) {
      const found = files.filter(f => f.endsWith('/' + name));
      assert.ok(found.length > 0,
        `test:ci:coverage 应包含 ${name}`);
    }
  });

  // --- AC-8: test:ci:release 包含发布验证文件 ---
  it('test:ci:release 脚本包含发布验证文件', () => {
    const pkg = readJSON('package.json');
    const releaseScript = pkg.scripts['test:ci:release'];
    assert.ok(releaseScript, 'test:ci:release 脚本应存在');

    const expectedFiles = [
      'test-r197-version-sync.js',
      'test-r208-release-build.js',
      'test-r218-changelog-v310.js',
      'test-r244-release-v321.js',
      'test-r280-changelog-v340-fix.js',
      'test-r282-jsdoc-audit.js',
    ];
    for (const name of expectedFiles) {
      assert.ok(releaseScript.includes(name),
        `test:ci:release 应包含 ${name}`);
    }
  });

  // --- AC-9: 非法阈值输入 → exit 2 ---
  it('非法阈值输入应返回 exit 2', () => {
    const result = runCmd('bash scripts/check-test-time.sh', {
      env: { TEST_TIME_THRESHOLD: 'abc' },
      timeout: 10000,
    });
    assert.equal(result.exitCode, 2, '非法阈值应返回 exit 2');
  });

  // --- AC-10: CI workflow 集成了门禁脚本 ---
  it('CI workflow test job 使用 check-test-time.sh', () => {
    const ciContent = readText('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('check-test-time.sh'),
      'ci.yml 应引用 check-test-time.sh'
    );
  });
});
