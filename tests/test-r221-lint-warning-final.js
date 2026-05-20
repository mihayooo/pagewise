/**
 * 测试 R221: Lint 警告清零 LintWarningFinalR220
 *
 * 验证:
 * 1. bookmark-security-audit.js 仅 import _generateSecurityReport（无多余局部绑定）
 * 2. bookmark-security-audit-csp.js 中 WILDCARD_HOST_PATTERNS 已加 _ 前缀
 * 3. re-export 行为不变（公共 API 完整）
 * 4. npm run lint 输出 0 errors / 0 warnings
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..');

// ==================== 源码结构验证 ====================

describe('R221: bookmark-security-audit.js import 结构', () => {
  let content;

  it('source file is readable', () => {
    content = readFileSync(
      join(PROJECT_ROOT, 'lib/bookmark-security-audit.js'), 'utf8'
    );
    assert.ok(content.length > 0);
  });

  it('仅 import generateSecurityReport（无多余局部绑定）', () => {
    // import 块应只包含 generateSecurityReport
    const importMatch = content.match(
      /import\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(importMatch, '应存在从 bookmark-security-audit-csp.js 的 import');

    const importedSymbols = importMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    assert.equal(importedSymbols.length, 1, '应只 import 1 个符号');
    assert.ok(
      importedSymbols[0].includes('generateSecurityReport'),
      '唯一 import 应为 generateSecurityReport'
    );
  });

  it('不 import auditContentScripts 局部绑定', () => {
    // import 块中不应有 auditContentScripts
    const importBlock = content.match(
      /import\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(importBlock);
    assert.ok(
      !importBlock[1].includes('auditContentScripts'),
      'import 块不应包含 auditContentScripts'
    );
  });

  it('不 import auditCSP 局部绑定', () => {
    const importBlock = content.match(
      /import\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(importBlock);
    assert.ok(
      !importBlock[1].includes('auditCSP'),
      'import 块不应包含 auditCSP'
    );
  });

  it('不 import UNSAFE_CSP_VALUES 局部绑定', () => {
    const importBlock = content.match(
      /import\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(importBlock);
    assert.ok(
      !importBlock[1].includes('UNSAFE_CSP_VALUES'),
      'import 块不应包含 UNSAFE_CSP_VALUES'
    );
  });

  it('不 import MINIMAL_CSP 局部绑定', () => {
    const importBlock = content.match(
      /import\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(importBlock);
    assert.ok(
      !importBlock[1].includes('MINIMAL_CSP'),
      'import 块不应包含 MINIMAL_CSP'
    );
  });

  it('re-export 块保留全部 4 个符号', () => {
    const reExportMatch = content.match(
      /export\s*\{([^}]+)\}\s*from\s*['"].*bookmark-security-audit-csp\.js['"]/
    );
    assert.ok(reExportMatch, '应存在 re-export 块');

    const reExported = reExportMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    assert.ok(reExported.includes('auditContentScripts'), 're-export 应包含 auditContentScripts');
    assert.ok(reExported.includes('auditCSP'), 're-export 应包含 auditCSP');
    assert.ok(reExported.includes('UNSAFE_CSP_VALUES'), 're-export 应包含 UNSAFE_CSP_VALUES');
    assert.ok(reExported.includes('MINIMAL_CSP'), 're-export 应包含 MINIMAL_CSP');
  });
});

// ==================== CSP 子模块验证 ====================

describe('R221: bookmark-security-audit-csp.js WILDCARD_HOST_PATTERNS', () => {
  let content;

  it('source file is readable', () => {
    content = readFileSync(
      join(PROJECT_ROOT, 'lib/bookmark-security-audit-csp.js'), 'utf8'
    );
    assert.ok(content.length > 0);
  });

  it('WILDCARD_HOST_PATTERNS 已添加 _ 前缀', () => {
    assert.ok(
      content.includes('_WILDCARD_HOST_PATTERNS'),
      '应存在 _WILDCARD_HOST_PATTERNS（带下划线前缀）'
    );
  });

  it('不再有无前缀的 WILDCARD_HOST_PATTERNS', () => {
    // 确保不存在 `const WILDCARD_HOST_PATTERNS`（无下划线）
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('const WILDCARD_HOST_PATTERNS')) {
        assert.fail(`发现无前缀的 WILDCARD_HOST_PATTERNS: ${trimmed}`);
      }
    }
    assert.ok(true, '无前缀的 WILDCARD_HOST_PATTERNS 已消除');
  });

  it('仍然导出 UNSAFE_CSP_VALUES 和 MINIMAL_CSP', () => {
    assert.ok(
      content.includes('export { UNSAFE_CSP_VALUES, MINIMAL_CSP }'),
      '应保留 UNSAFE_CSP_VALUES 和 MINIMAL_CSP 的导出'
    );
  });
});

// ==================== 公共 API 完整性验证 ====================

describe('R221: 公共 API 完整性', () => {
  it('主模块导出 auditPermissions', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.equal(typeof mod.auditPermissions, 'function');
  });

  it('主模块导出 generateSecurityReport', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.equal(typeof mod.generateSecurityReport, 'function');
  });

  it('主模块 re-export auditContentScripts', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.equal(typeof mod.auditContentScripts, 'function');
  });

  it('主模块 re-export auditCSP', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.equal(typeof mod.auditCSP, 'function');
  });

  it('主模块 re-export UNSAFE_CSP_VALUES', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.ok(Array.isArray(mod.UNSAFE_CSP_VALUES));
  });

  it('主模块 re-export MINIMAL_CSP', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.equal(typeof mod.MINIMAL_CSP, 'string');
  });

  it('主模块导出 WILDCARD_HOST_PATTERNS（本文件定义）', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.ok(Array.isArray(mod.WILDCARD_HOST_PATTERNS));
    assert.ok(mod.WILDCARD_HOST_PATTERNS.includes('<all_urls>'));
  });

  it('主模块导出 DANGEROUS_PERMISSIONS', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.ok(Array.isArray(mod.DANGEROUS_PERMISSIONS));
    assert.ok(Object.isFrozen(mod.DANGEROUS_PERMISSIONS));
  });

  it('主模块导出 BROAD_PERMISSIONS', async () => {
    const mod = await import('../lib/bookmark-security-audit.js');
    assert.ok(Array.isArray(mod.BROAD_PERMISSIONS));
  });
});

// ==================== Lint 执行验证 ====================

describe('R221: npm run lint 零警告验证', () => {
  it('lint 执行成功（exit code 0）', () => {
    assert.doesNotThrow(() => {
      execSync('npm run lint', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }, 'npm run lint 应成功执行（0 errors, 0 warnings）');
  });

  it('lint 输出不含 ESLint 警告计数行', () => {
    const stdout = execSync('npm run lint 2>&1', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // ESLint 警告格式: "X problems (Y errors, Z warnings)" 其中 Z > 0
    // 排除 npm 脚本回显中的 --max-warnings 参数名
    const hasLintWarning = /^\s*\d+\s+problems?\s*\(\s*\d+\s+errors?,\s*[1-9]\d*\s+warnings?\)/m.test(stdout);
    assert.ok(
      !hasLintWarning,
      'lint 输出不应包含 ESLint 警告计数行'
    );
  });

  it('bookmark-security-audit.js 不再触发 no-unused-vars', () => {
    // eslint 检查单个文件
    let hasWarning = false;
    try {
      const out = execSync(
        'npx eslint lib/bookmark-security-audit.js --format json 2>&1',
        {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      const results = JSON.parse(out);
      const warnings = results.flatMap(r =>
        r.messages.filter(m => m.severity === 1 && m.ruleId === 'no-unused-vars')
      );
      hasWarning = warnings.length > 0;
    } catch {
      hasWarning = true;
    }
    assert.ok(!hasWarning, 'bookmark-security-audit.js 不应有 no-unused-vars 警告');
  });

  it('bookmark-security-audit-csp.js 不再触发 no-unused-vars', () => {
    let hasWarning = false;
    try {
      const out = execSync(
        'npx eslint lib/bookmark-security-audit-csp.js --format json 2>&1',
        {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      const results = JSON.parse(out);
      const warnings = results.flatMap(r =>
        r.messages.filter(m => m.severity === 1 && m.ruleId === 'no-unused-vars')
      );
      hasWarning = warnings.length > 0;
    } catch {
      hasWarning = true;
    }
    assert.ok(!hasWarning, 'bookmark-security-audit-csp.js 不应有 no-unused-vars 警告');
  });
});

// ==================== 功能回归验证 ====================

describe('R221: 功能回归 — generateSecurityReport 正常工作', () => {
  it('安全 manifest 生成通过报告', async () => {
    const { generateSecurityReport } = await import('../lib/bookmark-security-audit.js');
    const manifest = {
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      permissions: ['storage'],
      content_scripts: [{ matches: ['https://example.com/*'], js: ['content.js'] }],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
      },
    };
    const result = generateSecurityReport(manifest);
    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
  });

  it('危险权限被正确检测', async () => {
    const { generateSecurityReport } = await import('../lib/bookmark-security-audit.js');
    const manifest = {
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      permissions: ['debugger'],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
      },
    };
    const result = generateSecurityReport(manifest);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(i => i.includes('debugger')));
  });
});
