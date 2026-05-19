/**
 * 测试 R109: 代码静态检查 ESLintSetup
 * — 验证 eslint 配置、package.json 脚本、CI 集成、规则正确性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = new URL('..', import.meta.url).pathname;

// ==================== package.json 验证 ====================

describe('package.json — ESLint 配置', async () => {
  const pkg = JSON.parse(await readFile(`${ROOT}/package.json`, 'utf-8'));

  it('eslint 在 devDependencies 中', () => {
    assert.ok(pkg.devDependencies, 'devDependencies 存在');
    assert.ok(pkg.devDependencies.eslint, 'eslint 存在');
    assert.match(pkg.devDependencies.eslint, /^\^?\d+\.\d+/, '版本号格式正确');
  });

  it('lint 脚本存在', () => {
    assert.ok(pkg.scripts['lint'], 'lint 脚本存在');
  });

  it('lint 脚本包含 eslint 调用', () => {
    const script = pkg.scripts['lint'];
    assert.ok(script.includes('eslint'), '脚本包含 eslint 命令');
  });

  it('原有 test 脚本不受影响', () => {
    assert.ok(pkg.scripts['test'], 'test 脚本存在');
    assert.ok(pkg.scripts['test:ci'], 'test:ci 脚本存在');
    assert.ok(pkg.scripts['test:all'], 'test:all 脚本存在');
    assert.ok(pkg.scripts['test:coverage'], 'test:coverage 脚本存在');
  });
});

// ==================== eslint.config.js 验证 ====================

describe('eslint.config.js — Flat Config', async () => {
  let configContent;
  let config;

  try {
    configContent = await readFile(`${ROOT}/eslint.config.js`, 'utf-8');
    config = (await import(`${ROOT}/eslint.config.js`)).default;
  } catch {
    configContent = null;
    config = null;
  }

  it('eslint.config.js 文件存在', () => {
    assert.ok(configContent !== null, 'eslint.config.js 应存在');
  });

  it('eslint.config.js 使用 ES Modules (export default)', () => {
    assert.ok(configContent.includes('export default'), '应使用 export default');
  });

  it('配置是数组格式 (flat config 要求)', () => {
    assert.ok(Array.isArray(config), '配置应为数组');
    assert.ok(config.length > 0, '配置不应为空');
  });

  it('包含全局忽略规则 (忽略 node_modules 等)', () => {
    const hasIgnores = config.some(item =>
      item.ignores && Array.isArray(item.ignores)
    );
    assert.ok(hasIgnores, '应包含 ignores 配置');
  });

  it('全局 ignores 包含 node_modules', () => {
    const ignoreEntry = config.find(item =>
      item.ignores && Array.isArray(item.ignores)
    );
    assert.ok(ignoreEntry, '应有 ignores 条目');
    assert.ok(
      ignoreEntry.ignores.some(p => p.includes('node_modules')),
      '应忽略 node_modules'
    );
  });

  it('全局 ignores 包含 coverage', () => {
    const ignoreEntry = config.find(item =>
      item.ignores && Array.isArray(item.ignores)
    );
    assert.ok(
      ignoreEntry.ignores.some(p => p.includes('coverage')),
      '应忽略 coverage 目录'
    );
  });

  it('全局 ignores 包含 docs/reference', () => {
    const ignoreEntry = config.find(item =>
      item.ignores && Array.isArray(item.ignores)
    );
    assert.ok(
      ignoreEntry.ignores.some(p => p.includes('reference')),
      '应忽略 docs/reference 目录'
    );
  });
});

// ==================== ESLint 规则验证 ====================

describe('ESLint 规则配置', async () => {
  let config;
  try {
    config = (await import(`${ROOT}/eslint.config.js`)).default;
  } catch {
    config = null;
  }

  // 查找包含 rules 的配置块（排除 ignores-only 块）
  const rulesBlock = config?.find(item => item.rules && Object.keys(item.rules).length > 0);

  it('存在包含 rules 的配置块', () => {
    assert.ok(rulesBlock, '应存在 rules 配置');
  });

  it('启用 no-unused-vars 规则', () => {
    assert.ok(rulesBlock.rules['no-unused-vars'], 'no-unused-vars 应已配置');
    const val = rulesBlock.rules['no-unused-vars'];
    // 可以是 'error', 'warn', ['error', ...], ['warn', ...], 等
    const level = Array.isArray(val) ? val[0] : val;
    assert.ok(level === 'error' || level === 'warn' || level === 2 || level === 1,
      'no-unused-vars 应设为 error 或 warn');
  });

  it('启用 no-undef 规则', () => {
    const val = rulesBlock.rules['no-undef'];
    assert.ok(val, 'no-undef 应已配置');
    const level = Array.isArray(val) ? val[0] : val;
    assert.ok(level === 'error' || level === 'warn' || level === 2 || level === 1,
      'no-undef 应设为 error 或 warn');
  });

  it('启用 eqeqeq 规则', () => {
    const val = rulesBlock.rules['eqeqeq'];
    assert.ok(val, 'eqeqeq 应已配置');
    const level = Array.isArray(val) ? val[0] : val;
    assert.ok(level === 'error' || level === 'warn' || level === 2 || level === 1,
      'eqeqeq 应设为 error 或 warn');
  });

  it('启用 no-implicit-globals 规则', () => {
    const val = rulesBlock.rules['no-implicit-globals'];
    assert.ok(val, 'no-implicit-globals 应已配置');
    const level = Array.isArray(val) ? val[0] : val;
    assert.ok(level === 'error' || level === 'warn' || level === 2 || level === 1,
      'no-implicit-globals 应设为 error 或 warn');
  });
});

// ==================== ESLint 环境配置验证 ====================

describe('ESLint 环境与语言选项', async () => {
  let config;
  try {
    config = (await import(`${ROOT}/eslint.config.js`)).default;
  } catch {
    config = null;
  }

  it('配置了 languageOptions', () => {
    const hasLangOpts = config?.some(item => item.languageOptions);
    assert.ok(hasLangOpts, '应存在 languageOptions 配置');
  });

  it('源码类型设为 module (ES Modules)', () => {
    const langBlock = config?.find(item => item.languageOptions?.sourceType);
    if (langBlock) {
      assert.equal(langBlock.languageOptions.sourceType, 'module',
        'sourceType 应为 module');
    }
    // 不强制要求，因为 flat config 默认就是 module
  });
});

// ==================== ESLint 可用性验证 ====================

describe('ESLint 工具可用性', () => {
  it('eslint 命令可执行', async () => {
    const { stdout } = await execFileAsync('npx', ['eslint', '--version'], {
      cwd: ROOT,
      timeout: 30000
    });
    assert.ok(stdout.trim().length > 0, 'eslint 版本输出不应为空');
  });

  it('eslint 版本 >= 9 (flat config 要求)', async () => {
    const { stdout } = await execFileAsync('npx', ['eslint', '--version'], {
      cwd: ROOT,
      timeout: 30000
    });
    const match = stdout.match(/v(\d+)\./);
    assert.ok(match, '应能解析版本号');
    const major = parseInt(match[1], 10);
    assert.ok(major >= 9, `ESLint 版本应 >= 9，实际: v${major}`);
  });
});

// ==================== CI 集成验证 ====================

describe('CI 集成', async () => {
  const ciContent = await readFile(`${ROOT}/.github/workflows/ci.yml`, 'utf-8');

  it('CI workflow 包含 lint 步骤或 job', () => {
    assert.ok(
      ciContent.includes('lint') || ciContent.includes('eslint'),
      'CI 应包含 lint 相关配置'
    );
  });

  it('lint job 包含 npm run lint 步骤', () => {
    assert.ok(
      ciContent.includes('npm run lint') || ciContent.includes('eslint'),
      'CI lint 步骤应调用 npm run lint 或 eslint'
    );
  });
});

// ==================== 设计文档验证 ====================

describe('设计文档验证', async () => {
  const designContent = await readFile(`${ROOT}/docs/DESIGN.md`, 'utf-8');

  it('TD 状态表包含 ESLint 相关记录或新增 lint 条目', () => {
    // R109 应该在设计文档中留有痕迹（可以是 TD 或新增设计决策）
    const hasLintMention = designContent.includes('lint') ||
                           designContent.includes('ESLint') ||
                           designContent.includes('eslint') ||
                           designContent.includes('TD004');
    assert.ok(hasLintMention, '设计文档应提及 lint/ESLint 相关内容');
  });
});
