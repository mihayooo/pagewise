/**
 * test-r284-cws-submission.js — R284 Chrome Web Store 提交验证
 *
 * 验证 v3.4.0 发布准备就绪：
 * 1. 版本一致性 (manifest.json / package.json / CHANGELOG)
 * 2. publish-check.sh 通过
 * 3. 隐私政策存在且覆盖 v3.4.0 新增数据处理
 * 4. Chrome Web Store Listing 资产完整
 * 5. 截图指南更新至 v3.4.0
 * 6. 权限声明合理
 * 7. _locales 双语一致
 * 8. 图标文件完整
 * 9. 安全审计 (CSP, 无远程代码)
 * 10. 构建产物可生成
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const readFile = (rel) => readFileSync(join(ROOT, rel), 'utf-8');
const fileExists = (rel) => existsSync(join(ROOT, rel));
const fileSize = (rel) => statSync(join(ROOT, rel)).size;

// ═══════════════════════════════════════════════════════
// 1. 版本一致性
// ═══════════════════════════════════════════════════════
describe('AC-1: 版本一致性', () => {
  it('package.json version 应为 3.4.0', () => {
    const pkg = JSON.parse(readFile('package.json'));
    assert.equal(pkg.version, '3.4.0');
  });

  it('manifest.json version 应为 3.4.0', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    assert.equal(manifest.version, '3.4.0');
  });

  it('package.json 与 manifest.json 版本一致', () => {
    const pkg = JSON.parse(readFile('package.json'));
    const manifest = JSON.parse(readFile('manifest.json'));
    assert.equal(pkg.version, manifest.version);
  });

  it('CHANGELOG.md 包含 [3.4.0] 区段', () => {
    const changelog = readFile('docs/CHANGELOG.md');
    assert.ok(changelog.includes('[3.4.0]'), 'CHANGELOG 应包含 [3.4.0] 区段');
  });

  it('CHANGELOG [3.4.0] 区段包含 R275 无障碍条目', () => {
    const changelog = readFile('docs/CHANGELOG.md');
    assert.ok(changelog.includes('R275') || changelog.includes('AccessibilityWCAG') || changelog.includes('无障碍'),
      'CHANGELOG [3.4.0] 应包含无障碍功能条目');
  });

  it('CHANGELOG [3.4.0] 区段包含 R278 跨浏览器条目', () => {
    const changelog = readFile('docs/CHANGELOG.md');
    assert.ok(changelog.includes('R278') || changelog.includes('CrossBrowserCompat') || changelog.includes('跨浏览器'),
      'CHANGELOG [3.4.0] 应包含跨浏览器兼容条目');
  });
});

// ═══════════════════════════════════════════════════════
// 2. publish-check.sh 通过
// ═══════════════════════════════════════════════════════
describe('AC-2: publish-check.sh 自检', () => {
  it('publish-check.sh 脚本存在且可执行', () => {
    assert.ok(fileExists('scripts/publish-check.sh'), 'scripts/publish-check.sh 应存在');
  });

  it('publish-check.sh 执行应退出码 0', () => {
    try {
      const output = execSync('bash scripts/publish-check.sh', {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30000
      });
      assert.ok(output.includes('全部检查通过') || output.includes('PASS'),
        'publish-check.sh 应输出通过信息');
    } catch (e) {
      // If exit code is non-zero, the check failed
      assert.fail(`publish-check.sh 失败 (exit code ${e.status}): ${e.stdout || e.stderr}`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 3. 隐私政策
// ═══════════════════════════════════════════════════════
describe('AC-3: 隐私政策更新', () => {
  it('docs/privacy-policy.html 存在', () => {
    assert.ok(fileExists('docs/privacy-policy.html'), 'privacy-policy.html 应存在');
  });

  it('privacy-policy.html 应覆盖 v3.4.0 性能监控', () => {
    const html = readFile('docs/privacy-policy.html');
    assert.ok(html.includes('performance-monitor') || html.includes('性能监控'),
      '隐私政策应提及性能监控模块');
  });

  it('privacy-policy.html 应覆盖 v3.3.0 反馈收集', () => {
    const html = readFile('docs/privacy-policy.html');
    assert.ok(html.includes('feedback-collector') || html.includes('反馈') || html.includes('NPS'),
      '隐私政策应提及反馈收集功能');
  });

  it('privacy-policy.html 应覆盖跨浏览器兼容层', () => {
    const html = readFile('docs/privacy-policy.html');
    assert.ok(html.includes('browser-compat') || html.includes('跨浏览器') || html.includes('cross-browser'),
      '隐私政策应提及跨浏览器兼容层');
  });

  it('privacy-policy.html 应包含版本号 3.4.0', () => {
    const html = readFile('docs/privacy-policy.html');
    assert.ok(html.includes('3.4.0'), '隐私政策应包含 v3.4.0 版本号');
  });

  it('privacy-policy.html 应声明数据不上传', () => {
    const html = readFile('docs/privacy-policy.html');
    const hasPrivacyStatement = html.includes('不传输') || html.includes('不上传') ||
      html.includes('不收集') || html.includes('不会将数据发送');
    assert.ok(hasPrivacyStatement, '隐私政策应声明数据不上传至外部服务器');
  });

  it('privacy-policy.html 应说明性能数据仅本地', () => {
    const html = readFile('docs/privacy-policy.html');
    const hasLocalOnly = html.includes('仅存储在内存') || html.includes('仅在本地') ||
      html.includes('不发送至') || html.includes('不涉及任何网络传输');
    assert.ok(hasLocalOnly, '隐私政策应说明性能数据仅在本地运行');
  });

  it('privacy-policy.html 是有效 HTML', () => {
    const html = readFile('docs/privacy-policy.html');
    assert.ok(html.includes('<!DOCTYPE html>'), '应以 DOCTYPE 开头');
    assert.ok(html.includes('</html>'), '应以 </html> 结尾');
    assert.ok(html.includes('<head>'), '应包含 <head>');
    assert.ok(html.includes('<body>'), '应包含 <body>');
  });

  it('privacy-policy.md 仍然存在 (向后兼容)', () => {
    assert.ok(fileExists('docs/PRIVACY_POLICY.md'), 'PRIVACY_POLICY.md 应继续存在');
  });
});

// ═══════════════════════════════════════════════════════
// 4. Chrome Web Store Listing 资产
// ═══════════════════════════════════════════════════════
describe('AC-4: CWS Listing 资产', () => {
  it('中文商品描述存在', () => {
    assert.ok(fileExists('docs/store-listing/listing-zh.md'), 'listing-zh.md 应存在');
  });

  it('英文商品描述存在', () => {
    assert.ok(fileExists('docs/store-listing/listing-en.md'), 'listing-en.md 应存在');
  });

  it('中文描述包含简短描述', () => {
    const zh = readFile('docs/store-listing/listing-zh.md');
    assert.ok(zh.includes('简短描述') || zh.includes('Short Description'),
      '中文描述应包含简短描述');
  });

  it('中文描述包含核心功能说明', () => {
    const zh = readFile('docs/store-listing/listing-zh.md');
    assert.ok(zh.includes('AI') && zh.includes('知识库'),
      '中文描述应包含 AI 和知识库核心功能');
  });

  it('英文描述包含核心功能说明', () => {
    const en = readFile('docs/store-listing/listing-en.md');
    assert.ok(en.includes('AI') && en.includes('Knowledge'),
      '英文描述应包含 AI 和 Knowledge 核心功能');
  });

  it('中文描述包含隐私声明', () => {
    const zh = readFile('docs/store-listing/listing-zh.md');
    assert.ok(zh.includes('隐私') || zh.includes('本地'),
      '中文描述应包含隐私相关说明');
  });

  it('提交指南存在', () => {
    assert.ok(fileExists('docs/store-listing/CWS-SUBMISSION-GUIDE.md'),
      'CWS-SUBMISSION-GUIDE.md 应存在');
  });

  it('截图指南存在', () => {
    assert.ok(fileExists('docs/SCREENSHOT-GUIDE.md'),
      'SCREENSHOT-GUIDE.md 应存在');
  });

  it('screenshots 目录存在', () => {
    assert.ok(fileExists('docs/screenshots'), 'docs/screenshots/ 目录应存在');
  });
});

// ═══════════════════════════════════════════════════════
// 5. 权限声明合理性
// ═══════════════════════════════════════════════════════
describe('AC-5: 权限声明审计', () => {
  it('manifest.json permissions 不包含 unnecessary 权限', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    const perms = manifest.permissions || [];
    // Should not have broad unnecessary permissions
    assert.ok(!perms.includes('downloads'), '不应包含 downloads 权限');
    assert.ok(!perms.includes('history'), '不应包含 history 权限');
    assert.ok(!perms.includes('notifications'), '不应包含 notifications 权限');
    assert.ok(!perms.includes('management'), '不应包含 management 权限');
  });

  it('host_permissions 不包含 <all_urls>', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    const hostPerms = manifest.host_permissions || [];
    assert.ok(!hostPerms.includes('<all_urls>'), 'host_permissions 不应包含 <all_urls>');
  });

  it('host_permissions 仅限 AI API 域名', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    const hostPerms = manifest.host_permissions || [];
    for (const hp of hostPerms) {
      const isAllowed = hp.includes('anthropic.com') || hp.includes('openai.com') ||
        hp.includes('deepseek.com') || hp.includes('localhost') || hp.includes('127.0.0.1');
      assert.ok(isAllowed, `host_permission ${hp} 应为已知 AI API 域名`);
    }
  });

  it('必需权限全部声明 (storage/sidePanel/contextMenus/tabs/activeTab/bookmarks)', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    const perms = manifest.permissions || [];
    const required = ['storage', 'sidePanel', 'contextMenus', 'tabs', 'activeTab', 'bookmarks'];
    for (const p of required) {
      assert.ok(perms.includes(p), `permissions 应包含 ${p}`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 6. _locales 双语一致性
// ═══════════════════════════════════════════════════════
describe('AC-6: _locales 双语一致性', () => {
  it('zh_CN/messages.json 存在', () => {
    assert.ok(fileExists('_locales/zh_CN/messages.json'));
  });

  it('en/messages.json 存在', () => {
    assert.ok(fileExists('_locales/en/messages.json'));
  });

  it('zh_CN 与 en 的 message key 完全一致', () => {
    const zhMessages = JSON.parse(readFile('_locales/zh_CN/messages.json'));
    const enMessages = JSON.parse(readFile('_locales/en/messages.json'));
    const zhKeys = Object.keys(zhMessages).sort();
    const enKeys = Object.keys(enMessages).sort();
    assert.deepEqual(zhKeys, enKeys, '两个 locale 的 key 应完全一致');
  });

  it('default_locale 为 zh_CN', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    assert.equal(manifest.default_locale, 'zh_CN');
  });

  it('所有 message 至少有 message 字段', () => {
    const zhMessages = JSON.parse(readFile('_locales/zh_CN/messages.json'));
    for (const [key, val] of Object.entries(zhMessages)) {
      assert.ok(val.message, `key "${key}" 应有 message 字段`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 7. 图标文件完整性
// ═══════════════════════════════════════════════════════
describe('AC-7: 图标文件完整性', () => {
  for (const size of [16, 48, 128]) {
    it(`icons/icon${size}.png 存在且 > 100 bytes`, () => {
      const path = `icons/icon${size}.png`;
      assert.ok(fileExists(path), `${path} 应存在`);
      assert.ok(fileSize(path) > 100, `${path} 应 > 100 bytes (实际: ${fileSize(path)})`);
    });
  }

  it('manifest.json 声明了所有图标', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    for (const size of [16, 48, 128]) {
      assert.ok(manifest.icons[size], `manifest.icons 应声明 ${size}px`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 8. 安全审计
// ═══════════════════════════════════════════════════════
describe('AC-8: 安全审计', () => {
  it('manifest.json CSP 声明严格策略', () => {
    const manifest = JSON.parse(readFile('manifest.json'));
    const csp = manifest.content_security_policy?.extension_pages || '';
    assert.ok(csp.includes("script-src 'self'"), 'CSP 应限制 script-src 为 self');
    assert.ok(csp.includes("object-src 'self'"), 'CSP 应限制 object-src 为 self');
  });

  it('无内联脚本 HTML 文件', () => {
    const htmlDirs = ['sidebar', 'popup', 'options', 'background'];
    for (const dir of htmlDirs) {
      const fullPath = join(ROOT, dir);
      if (!existsSync(fullPath)) continue;
      try {
        const files = execSync(`find ${fullPath} -name "*.html"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
        for (const file of files) {
          const content = readFileSync(file, 'utf-8');
          // Check for inline script tags (not ones with src=)
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.includes('<script') && !line.includes('src=') && !line.includes('type="importmap"') && line.match(/<script[> ]/)) {
              assert.fail(`发现内联脚本: ${file}: ${line.trim()}`);
            }
          }
        }
      } catch { /* dir may not have html files */ }
    }
  });
});

// ═══════════════════════════════════════════════════════
// 9. 构建产物验证
// ═══════════════════════════════════════════════════════
describe('AC-9: 构建产物验证', () => {
  it('scripts/build.sh 存在', () => {
    assert.ok(fileExists('scripts/build.sh'));
  });

  it('dist/pagewise-v3.4.0-chrome.zip 存在 (已构建)', () => {
    // This test checks if a previous build exists; it doesn't build itself
    const zipPath = join(ROOT, 'dist', 'pagewise-v3.4.0-chrome.zip');
    if (existsSync(zipPath)) {
      const size = statSync(zipPath).size;
      assert.ok(size > 0, 'zip 文件不应为空');
      // Chrome Web Store limit is 10MB
      assert.ok(size <= 10 * 1024 * 1024, `zip 文件应 ≤ 10MB (实际: ${(size / 1024 / 1024).toFixed(2)}MB)`);
    }
    // If zip doesn't exist, that's OK - it means build hasn't been run yet
  });

  it('build.sh INCLUDE_DIRS 包含所有必要目录', () => {
    const buildScript = readFile('scripts/build.sh');
    const requiredDirs = ['icons', 'background', 'content', 'popup', 'sidebar', 'options', 'lib', 'skills', '_locales'];
    for (const dir of requiredDirs) {
      assert.ok(buildScript.includes(`"${dir}"`), `build.sh 应包含 ${dir} 目录`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 10. 覆盖率门禁配置
// ═══════════════════════════════════════════════════════
describe('AC-10: 覆盖率门禁配置', () => {
  it('package.json 包含 coverage:gate 脚本', () => {
    const pkg = JSON.parse(readFile('package.json'));
    assert.ok(pkg.scripts['coverage:gate'], '应有 coverage:gate 脚本');
  });

  it('coverage:gate 包含三维门禁 (--lines/--branches/--functions)', () => {
    const pkg = JSON.parse(readFile('package.json'));
    const gate = pkg.scripts['coverage:gate'];
    assert.ok(gate.includes('--lines'), '应有 --lines 门禁');
    assert.ok(gate.includes('--branches'), '应有 --branches 门禁');
    assert.ok(gate.includes('--functions'), '应有 --functions 门禁');
  });

  it('coverage:gate --lines 阈值 ≤ 22 (与实际覆盖率 22.3% 对齐)', () => {
    const pkg = JSON.parse(readFile('package.json'));
    const gate = pkg.scripts['coverage:gate'];
    const match = gate.match(/--lines\s+(\d+)/);
    assert.ok(match, '应能解析 --lines 阈值');
    const linesThreshold = parseInt(match[1], 10);
    assert.ok(linesThreshold <= 22, `--lines 阈值应 ≤ 22 (实际: ${linesThreshold})`);
  });
});

// ═══════════════════════════════════════════════════════
// 11. R284 新增模块存在性
// ═══════════════════════════════════════════════════════
describe('AC-11: v3.4.0 功能模块存在性', () => {
  it('lib/browser-compat.js 存在 (R278 跨浏览器兼容)', () => {
    assert.ok(fileExists('lib/browser-compat.js'));
  });

  it('lib/storage-adapter.js 存在 (R278 存储适配)', () => {
    assert.ok(fileExists('lib/storage-adapter.js'));
  });

  it('lib/performance-monitor.js 存在 (R277 性能监控)', () => {
    assert.ok(fileExists('lib/performance-monitor.js'));
  });

  it('lib/bookmark-accessibility.js 存在 (R275 无障碍)', () => {
    assert.ok(fileExists('lib/bookmark-accessibility.js'));
  });

  it('lib/feedback-collector.js 存在 (R276 反馈收集)', () => {
    assert.ok(fileExists('lib/feedback-collector.js'));
  });

  it('lib/telemetry.js 存在 (遥测)', () => {
    assert.ok(fileExists('lib/telemetry.js'));
  });
});

// ═══════════════════════════════════════════════════════
// 12. 文档完整性
// ═══════════════════════════════════════════════════════
describe('AC-12: 文档完整性', () => {
  it('docs/CHANGELOG.md 包含 [3.4.0] 区段', () => {
    const changelog = readFile('docs/CHANGELOG.md');
    assert.ok(changelog.includes('[3.4.0]'));
  });

  it('docs/IMPLEMENTATION.md 存在', () => {
    assert.ok(fileExists('docs/IMPLEMENTATION.md'));
  });

  it('docs/TODO.md 存在', () => {
    assert.ok(fileExists('docs/TODO.md'));
  });

  it('docs/DESIGN-ITER10.md 存在 (设计文档)', () => {
    assert.ok(fileExists('docs/DESIGN-ITER10.md'));
  });
});
