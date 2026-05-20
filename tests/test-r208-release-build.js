/**
 * 测试 R208: Chrome Web Store 发布产物构建 ReleaseBuildPipeline
 *
 * 验收标准:
 *   AC-1: build.sh 生成发布级 .zip 产物（正确包含/排除）
 *   AC-2: publish-check.sh 自检脚本（版本一致性、权限、图标、_locales）
 *   AC-3: SCREENSHOT-GUIDE.md 存在且内容完整
 *   AC-4: RELEASE-NOTES-v3.1.md 存在且内容完整
 *   AC-5: 端到端验证（构建+自检通过）
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');

// ==================== 辅助函数 ====================

function readJSON(relPath) {
  return JSON.parse(readFileSync(join(PROJECT_DIR, relPath), 'utf-8'));
}

function fileExists(relPath) {
  return existsSync(join(PROJECT_DIR, relPath));
}

function fileSize(relPath) {
  const st = statSync(join(PROJECT_DIR, relPath));
  return st.size;
}

function runScript(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts
    });
  } catch (err) {
    // Still return stdout/stderr from failed command
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      status: err.status,
      failed: true
    };
  }
}

// ==================== AC-1: build.sh 结构验证 ====================

describe('AC-1: scripts/build.sh 存在且可执行', () => {
  it('build.sh 文件存在', () => {
    assert.ok(fileExists('scripts/build.sh'), 'scripts/build.sh should exist');
  });

  it('build.sh 是可执行的 bash 脚本', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    assert.ok(content.startsWith('#!/bin/bash'), 'Should start with shebang');
  });

  it('build.sh 包含正确的目录排除规则', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    // 应排除 tests, docs, coverage, scripts
    assert.ok(content.includes('icons'), 'Should include icons/');
    assert.ok(content.includes('background'), 'Should include background/');
    assert.ok(content.includes('content'), 'Should include content/');
    assert.ok(content.includes('popup'), 'Should include popup/');
    assert.ok(content.includes('sidebar'), 'Should include sidebar/');
    assert.ok(content.includes('options'), 'Should include options/');
    assert.ok(content.includes('lib'), 'Should include lib/');
    assert.ok(content.includes('_locales'), 'Should include _locales/');
  });

  it('build.sh 包含 skills 目录', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    assert.ok(content.includes('skills'), 'Should include skills/ directory');
  });

  it('build.sh 支持 chrome/firefox/edge 参数', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    assert.ok(content.includes('chrome'), 'Should support chrome');
    assert.ok(content.includes('firefox'), 'Should support firefox');
    assert.ok(content.includes('edge'), 'Should support edge');
  });

  it('build.sh 生成 .zip 产物', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    assert.ok(content.includes('.zip'), 'Should produce .zip file');
    assert.ok(content.includes('zip -r'), 'Should use zip command');
  });

  it('build.sh 清理非必要文件（.DS_Store, Thumbs.db）', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/build.sh'), 'utf-8');
    assert.ok(content.includes('.DS_Store'), 'Should exclude .DS_Store');
    assert.ok(content.includes('Thumbs.db'), 'Should exclude Thumbs.db');
  });
});

// ==================== AC-2: publish-check.sh 验证 ====================

describe('AC-2: scripts/publish-check.sh 存在且功能完整', () => {
  it('publish-check.sh 文件存在', () => {
    assert.ok(fileExists('scripts/publish-check.sh'), 'scripts/publish-check.sh should exist');
  });

  it('publish-check.sh 是可执行的 bash 脚本', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(content.startsWith('#!/bin/bash'), 'Should start with shebang');
  });

  it('publish-check.sh 包含 manifest 版本一致性检查', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('version') && content.includes('manifest.json') && content.includes('package.json'),
      'Should check version consistency between manifest.json and package.json'
    );
  });

  it('publish-check.sh 包含权限审计检查', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('permissions') || content.includes('permission'),
      'Should audit permissions'
    );
  });

  it('publish-check.sh 包含图标存在性检查', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('icon16') && content.includes('icon48') && content.includes('icon128'),
      'Should check all required icon sizes'
    );
  });

  it('publish-check.sh 包含 _locales 完整性检查', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('_locales') && (content.includes('zh_CN') || content.includes('zh-CN')),
      'Should verify _locales completeness'
    );
  });

  it('publish-check.sh 包含 default_locale 存在性检查', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('default_locale'),
      'Should check default_locale directory exists'
    );
  });

  it('publish-check.sh 包含安全审计（eval/内联脚本/HTTPS）', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(
      content.includes('eval') || content.includes('inline') || content.includes('https'),
      'Should include security audit checks'
    );
  });

  it('publish-check.sh 输出彩色报告（PASS/FAIL/WARN）', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    assert.ok(content.includes('PASS') || content.includes('OK'), 'Should output PASS/OK');
    assert.ok(content.includes('FAIL'), 'Should output FAIL');
    assert.ok(content.includes('WARN'), 'Should output WARN');
  });

  it('publish-check.sh 支持独立运行（不依赖 build.sh）', () => {
    const content = readFileSync(join(PROJECT_DIR, 'scripts/publish-check.sh'), 'utf-8');
    // 不应依赖 dist/ 目录
    assert.ok(!content.includes('dist/pagewise'), 'Should not depend on build output');
  });
});

// ==================== AC-3: SCREENSHOT-GUIDE.md 验证 ====================

describe('AC-3: docs/SCREENSHOT-GUIDE.md 截图指引', () => {
  it('SCREENSHOT-GUIDE.md 文件存在', () => {
    assert.ok(fileExists('docs/SCREENSHOT-GUIDE.md'), 'docs/SCREENSHOT-GUIDE.md should exist');
  });

  it('包含 Chrome Web Store 截图尺寸要求', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/SCREENSHOT-GUIDE.md'), 'utf-8');
    assert.ok(
      content.includes('1280') || content.includes('640'),
      'Should mention required screenshot dimensions'
    );
  });

  it('包含推荐截图场景（至少 3 个）', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/SCREENSHOT-GUIDE.md'), 'utf-8');
    // Should mention sidebar, popup, options, graph, knowledge base etc.
    const keywords = ['侧边栏', 'sidebar', 'popup', '选项', 'options', '图谱', 'graph', '知识', 'knowledge'];
    const matchCount = keywords.filter(k => content.toLowerCase().includes(k.toLowerCase())).length;
    assert.ok(matchCount >= 3, `Should recommend at least 3 screenshot scenarios, found ${matchCount}`);
  });

  it('包含文件命名规范', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/SCREENSHOT-GUIDE.md'), 'utf-8');
    assert.ok(
      content.includes('命名') || content.includes('naming') || content.includes('.png'),
      'Should include naming conventions'
    );
  });

  it('文件大小 > 500 bytes（内容充实）', () => {
    const size = fileSize('docs/SCREENSHOT-GUIDE.md');
    assert.ok(size > 500, `File should be > 500 bytes, got ${size}`);
  });
});

// ==================== AC-4: RELEASE-NOTES-v3.1.md 验证 ====================

describe('AC-4: docs/RELEASE-NOTES-v3.1.md 发布说明', () => {
  it('RELEASE-NOTES-v3.1.md 文件存在', () => {
    assert.ok(fileExists('docs/RELEASE-NOTES-v3.1.md'), 'docs/RELEASE-NOTES-v3.1.md should exist');
  });

  it('包含版本号 3.1.0', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/RELEASE-NOTES-v3.1.md'), 'utf-8');
    assert.ok(content.includes('3.1.0'), 'Should mention version 3.1.0');
  });

  it('包含 v3.0.0 → v3.1.0 的变更摘要', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/RELEASE-NOTES-v3.1.md'), 'utf-8');
    assert.ok(
      content.includes('3.0.0') || content.includes('v3.0'),
      'Should reference previous version 3.0.0'
    );
  });

  it('包含 R203-R208 迭代摘要', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/RELEASE-NOTES-v3.1.md'), 'utf-8');
    // At least mention some of the iterations
    const hasIterations = content.includes('R203') || content.includes('R205') ||
                          content.includes('R207') || content.includes('R208') ||
                          content.includes('模块拆分') || content.includes('覆盖率') ||
                          content.includes('ModuleSplit') || content.includes('Coverage');
    assert.ok(hasIterations, 'Should mention iteration summaries');
  });

  it('包含安装/升级说明', () => {
    const content = readFileSync(join(PROJECT_DIR, 'docs/RELEASE-NOTES-v3.1.md'), 'utf-8');
    assert.ok(
      content.includes('安装') || content.includes('install') || content.includes('升级') || content.includes('upgrade') || content.includes('Chrome Web Store'),
      'Should include installation/upgrade instructions'
    );
  });

  it('文件大小 > 1000 bytes（内容充实）', () => {
    const size = fileSize('docs/RELEASE-NOTES-v3.1.md');
    assert.ok(size > 1000, `File should be > 1000 bytes, got ${size}`);
  });
});

// ==================== AC-5: 端到端验证 ====================

describe('AC-5: 端到端 — 构建产物验证', () => {
  let buildOutput;
  let zipPath;

  before(() => {
    // Run build.sh chrome
    buildOutput = runScript('bash scripts/build.sh chrome');
    const version = readJSON('manifest.json').version;
    zipPath = join(PROJECT_DIR, `dist/pagewise-v${version}-chrome.zip`);
  });

  after(() => {
    // Clean up dist
    try {
      rmSync(join(PROJECT_DIR, 'dist'), { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  it('build.sh 执行成功', () => {
    assert.ok(!buildOutput.failed, `build.sh should succeed. stderr: ${buildOutput.stderr || ''}`);
  });

  it('生成 .zip 产物文件', () => {
    assert.ok(existsSync(zipPath), `Zip file should exist at ${zipPath}`);
  });

  it('.zip 产物体积 ≤ 10MB', () => {
    const size = statSync(zipPath).size;
    assert.ok(size <= 10 * 1024 * 1024, `Zip size should be ≤ 10MB, got ${size} bytes`);
  });

  it('.zip 内包含 manifest.json', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    assert.ok(listing.includes('manifest.json'), 'Zip should contain manifest.json');
  });

  it('.zip 内包含核心目录', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    const requiredDirs = ['background/', 'content/', 'popup/', 'options/', 'sidebar/', 'lib/', 'icons/', '_locales/', 'skills/'];
    for (const dir of requiredDirs) {
      assert.ok(listing.includes(dir), `Zip should contain ${dir}`);
    }
  });

  it('.zip 内不包含排除目录', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    const excludedDirs = ['tests/', 'docs/', 'coverage/', 'scripts/', 'node_modules/'];
    for (const dir of excludedDirs) {
      assert.ok(!listing.includes(` ${dir}`), `Zip should NOT contain ${dir}`);
    }
  });

  it('.zip 内不包含开发配置文件', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    const excludedFiles = ['package.json', 'CLAUDE.md', 'CHANGELOG.md', 'README.md', 'ROADMAP.md', 'PRIVACY.md', 'eslint.config.js'];
    for (const f of excludedFiles) {
      // Check as standalone files (not in subdirs)
      const regex = new RegExp(`\\s${f.replace('.', '\\.')}$`, 'm');
      assert.ok(!regex.test(listing), `Zip should NOT contain root-level ${f}`);
    }
  });

  it('.zip 内不包含旧版 locales/ 目录', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    // locales/ (without _) is the old format, should not be included
    assert.ok(!listing.match(/\slocales\//), 'Zip should NOT contain old locales/ directory');
  });

  it('.zip 内不包含多浏览器 manifest', () => {
    const listing = execSync(`unzip -l "${zipPath}"`, { cwd: PROJECT_DIR, encoding: 'utf-8' });
    assert.ok(!listing.includes('manifest.firefox.json'), 'Should NOT contain manifest.firefox.json');
    assert.ok(!listing.includes('manifest.edge.json'), 'Should NOT contain manifest.edge.json');
  });
});

// ==================== 版本一致性（源码级检查） ====================

describe('版本一致性检查', () => {
  it('manifest.json 版本 = package.json 版本', () => {
    const manifest = readJSON('manifest.json');
    const pkg = readJSON('package.json');
    assert.equal(manifest.version, pkg.version,
      `manifest.json(${manifest.version}) should match package.json(${pkg.version})`);
  });

  it('manifest.json version 格式为 semver', () => {
    const version = readJSON('manifest.json').version;
    assert.ok(/^\d+\.\d+\.\d+$/.test(version), `Version should be semver, got: ${version}`);
  });

  it('manifest.json manifest_version = 3', () => {
    const manifest = readJSON('manifest.json');
    assert.equal(manifest.manifest_version, 3, 'Should be Manifest V3');
  });
});

// ==================== manifest.json 完整性 ====================

describe('manifest.json 完整性', () => {
  it('包含所有必需字段', () => {
    const manifest = readJSON('manifest.json');
    const required = ['manifest_version', 'name', 'version', 'description', 'permissions', 'background', 'icons'];
    for (const field of required) {
      assert.ok(field in manifest, `manifest.json should have field: ${field}`);
    }
  });

  it('包含默认 locale 配置', () => {
    const manifest = readJSON('manifest.json');
    assert.ok(manifest.default_locale, 'Should have default_locale');
    assert.ok(fileExists(`_locales/${manifest.default_locale}/messages.json`),
      `default_locale directory should exist: _locales/${manifest.default_locale}/`);
  });

  it('必需图标文件存在且 > 100 bytes', () => {
    const icons = [16, 48, 128].map(s => `icons/icon${s}.png`);
    for (const icon of icons) {
      assert.ok(fileExists(icon), `${icon} should exist`);
      assert.ok(fileSize(icon) > 100, `${icon} should be > 100 bytes`);
    }
  });
});

// ==================== _locales 完整性 ====================

describe('_locales 完整性', () => {
  it('zh_CN 和 en 的 messages.json 存在', () => {
    assert.ok(fileExists('_locales/zh_CN/messages.json'), 'zh_CN/messages.json should exist');
    assert.ok(fileExists('_locales/en/messages.json'), 'en/messages.json should exist');
  });

  it('zh_CN 和 en 的 message key 一致', () => {
    const zhCN = readJSON('_locales/zh_CN/messages.json');
    const en = readJSON('_locales/en/messages.json');
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    assert.deepEqual(zhKeys, enKeys, 'zh_CN and en should have identical message keys');
  });

  it('extName 在两个 locale 中都存在', () => {
    const zhCN = readJSON('_locales/zh_CN/messages.json');
    const en = readJSON('_locales/en/messages.json');
    assert.ok('extName' in zhCN, 'zh_CN should have extName');
    assert.ok('extName' in en, 'en should have extName');
    assert.ok(zhCN.extName.message, 'zh_CN extName should have message');
    assert.ok(en.extName.message, 'en extName should have message');
  });

  it('extDescription 在两个 locale 中都存在', () => {
    const zhCN = readJSON('_locales/zh_CN/messages.json');
    const en = readJSON('_locales/en/messages.json');
    assert.ok('extDescription' in zhCN, 'zh_CN should have extDescription');
    assert.ok('extDescription' in en, 'en should have extDescription');
  });
});
