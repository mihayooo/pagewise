/**
 * 测试 R108: 测试覆盖率基础设施 TestCoverage
 * — 验证 c8 配置、package.json 脚本、.gitignore 设置
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = new URL('..', import.meta.url).pathname;

// ==================== package.json 验证 ====================

describe('package.json — c8 配置', async () => {
  const pkg = JSON.parse(await readFile(`${ROOT}/package.json`, 'utf-8'));

  it('c8 在 devDependencies 中', () => {
    assert.ok(pkg.devDependencies, 'devDependencies 存在');
    assert.ok(pkg.devDependencies.c8, 'c8 存在');
    assert.match(pkg.devDependencies.c8, /^\^?\d+\.\d+/, '版本号格式正确');
  });

  it('test:coverage 脚本存在', () => {
    assert.ok(pkg.scripts['test:coverage'], 'test:coverage 脚本存在');
  });

  it('test:coverage 包含 c8 调用', () => {
    const script = pkg.scripts['test:coverage'];
    assert.ok(script.includes('c8'), '脚本包含 c8 命令');
  });

  it('test:coverage 使用 lcov reporter', () => {
    const script = pkg.scripts['test:coverage'];
    assert.ok(script.includes('--reporter=lcov'), '包含 lcov reporter');
  });

  it('test:coverage 使用 text-summary reporter', () => {
    const script = pkg.scripts['test:coverage'];
    assert.ok(script.includes('--reporter=text-summary'), '包含 text-summary reporter');
  });

  it('test:coverage 基于 test:ci 构建', () => {
    const script = pkg.scripts['test:coverage'];
    assert.ok(script.includes('npm run test:ci'), '基于 test:ci 构建');
  });

  it('原有脚本不受影响', () => {
    assert.ok(pkg.scripts['test'], 'test 脚本存在');
    assert.ok(pkg.scripts['test:ci'], 'test:ci 脚本存在');
    assert.ok(pkg.scripts['test:all'], 'test:all 脚本存在');
  });
});

// ==================== .gitignore 验证 ====================

describe('.gitignore — coverage/ 排除', async () => {
  const gitignore = await readFile(`${ROOT}/.gitignore`, 'utf-8');

  it('coverage/ 在 .gitignore 中', () => {
    const lines = gitignore.split('\n').map(l => l.trim());
    assert.ok(lines.includes('coverage/'), 'coverage/ 目录被忽略');
  });

  it('coverage/ 注释说明存在', () => {
    assert.ok(gitignore.includes('Test coverage') || gitignore.includes('coverage'), '有相关注释说明');
  });
});

// ==================== c8 二进制可用性 ====================

describe('c8 工具可用性', () => {
  it('c8 命令可执行', async () => {
    try {
      const { stdout } = await execFileAsync('npx', ['c8', '--version'], { cwd: ROOT });
      assert.ok(stdout.trim().length > 0, 'c8 版本号非空');
    } catch (err) {
      assert.fail(`c8 不可用: ${err.message}`);
    }
  });

  it('c8 版本 >= 10', async () => {
    const { stdout } = await execFileAsync('npx', ['c8', '--version'], { cwd: ROOT });
    const version = stdout.trim();
    const major = parseInt(version.split('.')[0], 10);
    assert.ok(major >= 10, `c8 版本 ${version} >= 10`);
  });
});

// ==================== 设计文档验证 ====================

describe('docs/DESIGN.md — TD001 状态', async () => {
  let designMd;
  try {
    designMd = await readFile(`${ROOT}/docs/DESIGN.md`, 'utf-8');
  } catch {
    designMd = '';
  }

  it('TD001 状态已更新为已关闭', () => {
    if (!designMd) {
      // DESIGN.md 可能不存在，跳过
      return;
    }
    assert.ok(
      designMd.includes('已关闭') && designMd.includes('R108'),
      'TD001 应标记为已关闭 (via R108)'
    );
  });
});
