/**
 * 测试 R201: Lint 警告清零 LintWarningFinalR200
 *
 * 验证:
 * 1. package.json lint 脚本使用 --max-warnings 0
 * 2. eslint.config.js 配置 no-unused-vars 规则（varsIgnorePattern: ^_）
 * 3. 运行 npm run lint 返回 0 errors / 0 warnings
 * 4. 关键 lib 文件不含明显未使用变量（排除 _ 前缀的有意未使用变量）
 * 5. bookmark-notifier.js 不含无前缀的 MS_PER_DAY
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..');

// ==================== package.json lint 脚本验证 ====================

describe('package.json lint 脚本配置', () => {
  let pkg;

  before(() => {
    const raw = readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8');
    pkg = JSON.parse(raw);
  });

  it('lint 脚本存在', () => {
    assert.ok(pkg.scripts.lint, '应存在 lint 脚本');
  });

  it('lint 脚本使用 eslint', () => {
    assert.ok(pkg.scripts.lint.includes('eslint'), 'lint 脚本应使用 eslint');
  });

  it('lint 脚本 max-warnings 设置为 0', () => {
    assert.ok(
      pkg.scripts.lint.includes('--max-warnings 0'),
      `lint 脚本应使用 --max-warnings 0，当前: ${pkg.scripts.lint}`
    );
  });

  it('lint 脚本 max-warnings 不再为 10000', () => {
    assert.ok(
      !pkg.scripts.lint.includes('--max-warnings 10000'),
      'lint 脚本不应再使用 --max-warnings 10000'
    );
  });
});

// ==================== eslint.config.js 规则验证 ====================

describe('eslint.config.js no-unused-vars 规则配置', () => {
  let configContent;

  before(() => {
    configContent = readFileSync(join(PROJECT_ROOT, 'eslint.config.js'), 'utf8');
  });

  it('配置文件存在', () => {
    assert.ok(configContent.length > 0, 'eslint.config.js 不应为空');
  });

  it('配置了 no-unused-vars 规则', () => {
    assert.ok(
      configContent.includes('no-unused-vars'),
      'eslint.config.js 应配置 no-unused-vars 规则'
    );
  });

  it('varsIgnorePattern 设置为 ^_ 前缀', () => {
    assert.ok(
      configContent.includes("varsIgnorePattern: '^_'"),
      "eslint.config.js 应配置 varsIgnorePattern: '^_'"
    );
  });

  it('argsIgnorePattern 设置为 ^_ 前缀', () => {
    assert.ok(
      configContent.includes("argsIgnorePattern: '^_'"),
      "eslint.config.js 应配置 argsIgnorePattern: '^_'"
    );
  });

  it('caughtErrorsIgnorePattern 设置为 ^_ 前缀', () => {
    assert.ok(
      configContent.includes("caughtErrorsIgnorePattern: '^_'"),
      "eslint.config.js 应配置 caughtErrorsIgnorePattern: '^_'"
    );
  });

  it('测试文件中 no-unused-vars 设为 off', () => {
    assert.ok(
      configContent.includes("'no-unused-vars': 'off'"),
      '测试文件配置中应禁用 no-unused-vars'
    );
  });
});

// ==================== npm run lint 实际执行验证 ====================

describe('npm run lint 执行结果验证', () => {
  it('lint 执行成功（exit code 0）', () => {
    assert.doesNotThrow(() => {
      execSync('npm run lint', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }, 'npm run lint 应成功执行（0 errors, 0 warnings）');
  });

  it('lint 输出不含 warning', () => {
    let stdout;
    assert.doesNotThrow(() => {
      stdout = execSync('npx eslint . --max-warnings 0 2>&1', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });
    // 成功执行（无输出 = 无警告）
    assert.ok(
      !stdout || !stdout.toLowerCase().includes('warning'),
      'lint 输出不应包含 warning 信息'
    );
  });

  it('JSON 格式 lint 输出确认 0 个 warning', () => {
    const stdout = execSync(
      `npx eslint . --format json 2>&1 | node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const warnings = data.flatMap(f => f.messages.filter(m => m.severity === 1));
        process.stdout.write(JSON.stringify({warningCount: warnings.length}));
      "`,
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        shell: '/bin/bash',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const result = JSON.parse(stdout.trim());
    assert.equal(result.warningCount, 0, '应有 0 个 lint warning');
  });
});

// ==================== 关键源文件未使用变量审查 ====================

describe('关键 lib 文件未使用变量审查', () => {
  it('bookmark-notifier.js 不含无前缀 MS_PER_DAY 变量', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'lib/bookmark-notifier.js'), 'utf8'
    );
    // 不应存在 `const MS_PER_DAY` (无下划线前缀)
    assert.ok(
      !content.match(/(?<![_\w])MS_PER_DAY\s*=/),
      'bookmark-notifier.js 不应存在无前缀的 MS_PER_DAY 变量'
    );
  });

  it('所有 lib 文件中 _MS_PER_DAY 使用下划线前缀（有意未使用）', () => {
    const libDir = join(PROJECT_ROOT, 'lib');
    const files = readdirSync(libDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const content = readFileSync(join(libDir, file), 'utf8');
      const matches = content.match(/^const MS_PER_DAY\s*=/gm);
      if (matches) {
        // 允许 export const MS_PER_DAY (导出的变量是有用的)
        assert.ok(
          content.includes('export const MS_PER_DAY'),
          `${file} 中的 MS_PER_DAY 如非导出应使用 _MS_PER_DAY 前缀`
        );
      }
    }
  });

  it('bookmark-learning-coach-constants.js 使用 _MS_PER_DAY', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'lib/bookmark-learning-coach-constants.js'), 'utf8'
    );
    assert.ok(
      content.includes('_MS_PER_DAY'),
      'bookmark-learning-coach-constants.js 应使用 _MS_PER_DAY 前缀'
    );
  });

  it('bookmark-learning-goals.js 使用 _MS_PER_DAY', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'lib/bookmark-learning-goals.js'), 'utf8'
    );
    assert.ok(
      content.includes('_MS_PER_DAY'),
      'bookmark-learning-goals.js 应使用 _MS_PER_DAY 前缀'
    );
  });
});
