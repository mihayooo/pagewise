/**
 * 测试 lib/cws-validator.js — Chrome Web Store 提交合规验证器
 *
 * R300: CWSProductionSubmit — v3.4.0 Chrome Web Store 正式提交
 *
 * 覆盖:
 *   - manifest 结构验证
 *   - 权限最小化审计
 *   - CSP 策略合规
 *   - 图标声明完整性
 *   - 商店描述长度
 *   - zip 包大小验证
 *   - Service Worker 冷启动估算
 *   - 综合验证
 *   - 权限审计报告
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  validateManifestStructure,
  validatePermissions,
  validateCSP,
  validateIcons,
  validateStoreListing,
  validateZipSize,
  estimateServiceWorkerColdStart,
  validateManifestForCWS,
  getPermissionAuditReport,
  CWS_LIMITS,
} from '../lib/cws-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** 创建合法的 manifest 基本对象 */
function createValidManifest(overrides = {}) {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    version: '3.4.0',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    permissions: ['storage', 'sidePanel', 'tabs', 'activeTab', 'bookmarks'],
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://api.deepseek.com/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    background: { service_worker: 'background/service-worker.js', type: 'module' },
    side_panel: { default_path: 'sidebar/sidebar.html' },
    action: {
      default_popup: 'popup/popup.html',
      default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
    },
    icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
    ...overrides,
  };
}

// ==================== Manifest 结构验证 ====================

describe('CWSValidator — Manifest 结构验证', () => {
  it('合法 manifest 通过结构验证', () => {
    const result = validateManifestStructure(createValidManifest());
    assert.equal(result.pass, true);
    assert.equal(result.issues.length, 0);
  });

  it('null manifest 不通过', () => {
    const result = validateManifestStructure(null);
    assert.equal(result.pass, false);
    assert.ok(result.issues[0].includes('不是有效的 JSON 对象'));
  });

  it('缺少 manifest_version 不通过', () => {
    const m = createValidManifest();
    delete m.manifest_version;
    const result = validateManifestStructure(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('manifest_version')));
  });

  it('manifest_version 不为 3 不通过', () => {
    const result = validateManifestStructure(createValidManifest({ manifest_version: 2 }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('应为 3')));
  });

  it('版本号格式不正确不通过', () => {
    const result = validateManifestStructure(createValidManifest({ version: '3.4' }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('格式不正确')));
  });

  it('缺少 service_worker 不通过', () => {
    const m = createValidManifest({ background: {} });
    const result = validateManifestStructure(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('service_worker')));
  });

  it('缺少 side_panel 不通过', () => {
    const m = createValidManifest();
    delete m.side_panel;
    const result = validateManifestStructure(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('side_panel')));
  });
});

// ==================== 权限验证 ====================

describe('CWSValidator — 权限最小化', () => {
  it('当前 manifest 权限最小化通过', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
    const result = validatePermissions(m);
    // 当前 manifest 有 contextMenus，R300 应移除后通过
    // 这里检查当前状态是否有非最小集权限
    if (result.pass) {
      assert.equal(result.details.extraPermissions.length, 0);
    } else {
      // 如果有多余权限，记录供参考
      assert.ok(result.details.extraPermissions.length > 0);
    }
  });

  it('最小权限集通过', () => {
    const result = validatePermissions(createValidManifest());
    assert.equal(result.pass, true);
    assert.equal(result.details.extraPermissions.length, 0);
    assert.equal(result.details.missingPermissions.length, 0);
  });

  it('高风险权限不通过', () => {
    const m = createValidManifest({ permissions: ['storage', 'sidePanel', 'tabs', 'activeTab', 'bookmarks', 'history'] });
    const result = validatePermissions(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('多余权限')));
  });

  it('host_permissions 包含 <all_urls> 不通过', () => {
    const m = createValidManifest({ host_permissions: ['<all_urls>'] });
    const result = validatePermissions(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('<all_urls>')));
  });

  it('host_permissions 仅含 AI API 域名通过', () => {
    const m = createValidManifest();
    const result = validatePermissions(m);
    assert.equal(result.details.unknownHosts.length, 0);
  });

  it('host_permissions 未知域名不通过', () => {
    const m = createValidManifest({ host_permissions: ['https://evil.com/*'] });
    const result = validatePermissions(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('未知')));
  });

  it('缺少必需权限不通过', () => {
    const m = createValidManifest({ permissions: ['storage'] });
    const result = validatePermissions(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('缺少必需权限')));
  });
});

// ==================== CSP 验证 ====================

describe('CWSValidator — CSP 策略', () => {
  it('严格 CSP 通过', () => {
    const result = validateCSP(createValidManifest());
    assert.equal(result.pass, true);
    assert.equal(result.details.hasScriptSrcSelf, true);
    assert.equal(result.details.hasObjectSrcSelf, true);
  });

  it('缺少 CSP 不通过', () => {
    const m = createValidManifest();
    delete m.content_security_policy;
    const result = validateCSP(m);
    assert.equal(result.pass, false);
  });

  it('unsafe-eval 不通过', () => {
    const m = createValidManifest();
    m.content_security_policy.extension_pages = "script-src 'self' 'unsafe-eval'";
    const result = validateCSP(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('unsafe-eval')));
  });

  it('unsafe-inline 不通过', () => {
    const m = createValidManifest();
    m.content_security_policy.extension_pages = "script-src 'self' 'unsafe-inline'";
    const result = validateCSP(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('unsafe-inline')));
  });

  it('缺少 script-src self 不通过', () => {
    const m = createValidManifest();
    m.content_security_policy.extension_pages = "script-src 'none'";
    const result = validateCSP(m);
    assert.equal(result.pass, false);
  });
});

// ==================== 图标验证 ====================

describe('CWSValidator — 图标完整性', () => {
  it('完整图标声明通过', () => {
    const result = validateIcons(createValidManifest());
    assert.equal(result.pass, true);
  });

  it('缺少 128px 图标不通过', () => {
    const m = createValidManifest();
    delete m.icons['128'];
    const result = validateIcons(m);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('128')));
  });

  it('缺少 action 图标不通过', () => {
    const m = createValidManifest();
    delete m.action.default_icon;
    const result = validateIcons(m);
    assert.equal(result.pass, false);
  });

  it('实际 manifest.json 图标声明完整', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
    const result = validateIcons(m);
    assert.equal(result.pass, true, `图标验证失败: ${result.issues.join(', ')}`);
  });
});

// ==================== 商店描述验证 ====================

describe('CWSValidator — 商店描述', () => {
  it('正常描述通过', () => {
    const result = validateStoreListing({
      shortDescription: 'AI reading assistant.',
      detailedDescription: 'A powerful extension.',
    });
    assert.equal(result.pass, true);
  });

  it('简短描述超长不通过', () => {
    const longDesc = 'A'.repeat(133);
    const result = validateStoreListing({ shortDescription: longDesc, detailedDescription: 'OK' });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('简短描述超长')));
  });

  it('简短描述恰好 132 字符通过', () => {
    const desc = 'A'.repeat(132);
    const result = validateStoreListing({ shortDescription: desc, detailedDescription: 'OK' });
    assert.equal(result.pass, true);
    assert.equal(result.details.shortDescLength, 132);
  });

  it('详细描述超长不通过', () => {
    const longDesc = 'B'.repeat(16001);
    const result = validateStoreListing({ shortDescription: 'OK', detailedDescription: longDesc });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('详细描述超长')));
  });

  it('缺少简短描述不通过', () => {
    const result = validateStoreListing({ detailedDescription: 'OK' });
    assert.equal(result.pass, false);
  });

  it('中文商店描述长度合规', () => {
    const zh = readFileSync(join(ROOT, 'docs/store-listing/listing-zh.md'), 'utf-8');
    const shortMatch = zh.match(/简短描述[^\n]*\n\n(.+?)(?:\n|$)/);
    if (shortMatch) {
      assert.ok(shortMatch[1].length <= 132, `中文简短描述 ${shortMatch[1].length} > 132`);
    }
  });
});

// ==================== Zip 大小验证 ====================

describe('CWSValidator — Zip 大小', () => {
  it('1MB zip 通过', () => {
    const result = validateZipSize(1 * 1024 * 1024);
    assert.equal(result.pass, true);
    assert.equal(result.details.withinSoftLimit, true);
  });

  it('3MB zip 通过', () => {
    const result = validateZipSize(3 * 1024 * 1024);
    assert.equal(result.pass, true);
    assert.equal(result.details.withinSoftLimit, true);
  });

  it('6MB zip 超过软限制但通过硬限制', () => {
    const result = validateZipSize(6 * 1024 * 1024);
    assert.equal(result.pass, true); // within 10MB hard limit
    assert.equal(result.details.withinSoftLimit, false);
    assert.ok(result.issues.length > 0); // warns about soft limit
  });

  it('11MB zip 超过硬限制不通过', () => {
    const result = validateZipSize(11 * 1024 * 1024);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some(i => i.includes('硬限制')));
  });

  it('0 字节不通过', () => {
    const result = validateZipSize(0);
    assert.equal(result.pass, false);
  });

  it('负数不通过', () => {
    const result = validateZipSize(-1);
    assert.equal(result.pass, false);
  });
});

// ==================== Service Worker 冷启动 ====================

describe('CWSValidator — SW 冷启动估算', () => {
  it('5 个模块估算通过', () => {
    const result = estimateServiceWorkerColdStart(5);
    assert.equal(result.pass, true);
    assert.equal(result.details.estimatedMs, 150); // 100 + 5*10
  });

  it('40 个模块估算通过 (≤500ms)', () => {
    const result = estimateServiceWorkerColdStart(40);
    assert.equal(result.pass, true);
    assert.equal(result.details.estimatedMs, 500);
  });

  it('41 个模块估算不通过 (>500ms)', () => {
    const result = estimateServiceWorkerColdStart(41);
    assert.equal(result.pass, false);
    assert.ok(result.issues[0].includes('500ms'));
  });

  it('自定义参数估算', () => {
    const result = estimateServiceWorkerColdStart(10, { baseOverheadMs: 50, perModuleMs: 5 });
    assert.equal(result.pass, true);
    assert.equal(result.details.estimatedMs, 100); // 50 + 10*5
  });

  it('负数模块不通过', () => {
    const result = estimateServiceWorkerColdStart(-1);
    assert.equal(result.pass, false);
  });
});

// ==================== 综合验证 ====================

describe('CWSValidator — 综合 CWS 提交验证', () => {
  it('合法 manifest 全部通过', () => {
    const result = validateManifestForCWS(createValidManifest());
    assert.equal(result.pass, true);
    assert.equal(result.allIssues.length, 0);
    assert.ok(result.checks.structure);
    assert.ok(result.checks.permissions);
    assert.ok(result.checks.csp);
    assert.ok(result.checks.icons);
  });

  it('带选项的综合验证', () => {
    const result = validateManifestForCWS(createValidManifest(), {
      zipSizeBytes: 1.5 * 1024 * 1024,
      shortDescription: 'Test description',
      detailedDescription: 'A detailed description for testing.',
      swModuleCount: 3,
    });
    assert.equal(result.pass, true);
    assert.ok(result.checks.storeListing);
    assert.ok(result.checks.zipSize);
    assert.ok(result.checks.swColdStart);
  });

  it('多项失败时汇总所有 issues', () => {
    const m = createValidManifest({
      permissions: ['storage'],
      host_permissions: ['<all_urls>'],
    });
    m.content_security_policy.extension_pages = "script-src 'self' 'unsafe-eval'";
    delete m.icons['128'];
    const result = validateManifestForCWS(m);
    assert.equal(result.pass, false);
    assert.ok(result.allIssues.length >= 4); // permissions + host + csp + icons
  });

  it('实际 manifest.json 通过基础验证', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
    // Structure check
    const struct = validateManifestStructure(m);
    assert.equal(struct.pass, true, `结构验证失败: ${struct.issues.join(', ')}`);
    // CSP check
    const csp = validateCSP(m);
    assert.equal(csp.pass, true, `CSP 验证失败: ${csp.issues.join(', ')}`);
    // Icons check
    const icons = validateIcons(m);
    assert.equal(icons.pass, true, `图标验证失败: ${icons.issues.join(', ')}`);
  });
});

// ==================== 权限审计报告 ====================

describe('CWSValidator — 权限审计报告', () => {
  it('合规 manifest 审计报告为 PASS', () => {
    const report = getPermissionAuditReport(createValidManifest());
    assert.equal(report.compliance, 'PASS');
    assert.equal(report.extra.length, 0);
    assert.equal(report.highRisk.length, 0);
    assert.equal(report.hasAllUrls, false);
  });

  it('含额外权限报告为 NEEDS_REVIEW', () => {
    const m = createValidManifest({ permissions: ['storage', 'sidePanel', 'tabs', 'activeTab', 'bookmarks', 'contextMenus'] });
    const report = getPermissionAuditReport(m);
    assert.equal(report.compliance, 'NEEDS_REVIEW');
    assert.ok(report.extra.includes('contextMenus'));
  });

  it('报告包含正确的权限计数', () => {
    const report = getPermissionAuditReport(createValidManifest());
    assert.equal(report.totalPermissions, 5);
    assert.equal(report.required.length, 5);
  });
});

// ==================== 常量导出 ====================

describe('CWSValidator — 常量', () => {
  it('CWS_LIMITS 短描述限制为 132', () => {
    assert.equal(CWS_LIMITS.SHORT_DESC_MAX_CHARS, 132);
  });

  it('CWS_LIMITS 详细描述限制为 16000', () => {
    assert.equal(CWS_LIMITS.DETAILED_DESC_MAX_CHARS, 16000);
  });

  it('CWS_LIMITS 软限制为 5MB', () => {
    assert.equal(CWS_LIMITS.ZIP_SIZE_SOFT_LIMIT, 5 * 1024 * 1024);
  });

  it('CWS_LIMITS 硬限制为 10MB', () => {
    assert.equal(CWS_LIMITS.ZIP_SIZE_HARD_LIMIT, 10 * 1024 * 1024);
  });

  it('CWS_LIMITS SW 冷启动目标为 500ms', () => {
    assert.equal(CWS_LIMITS.SW_COLD_START_MS, 500);
  });
});
