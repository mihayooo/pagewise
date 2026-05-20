/**
 * 测试 lib/bookmark-store-prep-checks.js — Chrome Web Store 发布检查
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateContentSecurityPolicy,
  generatePermissionJustification,
  detectLanguageSupport,
  suggestManifestImprovements,
  checkStoreSubmissionReadiness,
} from '../lib/bookmark-store-prep-checks.js';

// ==================== validateContentSecurityPolicy ====================

describe('validateContentSecurityPolicy', () => {
  it('null manifest 返回无效', () => {
    const r = validateContentSecurityPolicy(null);
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes('manifest'));
  });

  it('缺少 CSP 返回无效', () => {
    const r = validateContentSecurityPolicy({});
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes('missing'));
  });

  it('有效 CSP 字符串', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: "script-src 'self'; object-src 'self'",
    });
    assert.equal(r.valid, true);
    assert.equal(r.policy, "script-src 'self'; object-src 'self'");
  });

  it('CSP 对象格式 (extension_pages)', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: { extension_pages: "script-src 'self'" },
    });
    assert.equal(r.valid, true);
  });

  it('CSP 包含 unsafe-eval 报错', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: "script-src 'self' 'unsafe-eval'",
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('unsafe-eval')));
  });

  it('CSP 包含 unsafe-inline 报错', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: "script-src 'self' 'unsafe-inline'",
    });
    assert.equal(r.valid, false);
  });

  it('CSP 包含 data: 报错', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: "script-src 'self' data:",
    });
    assert.equal(r.valid, false);
  });

  it('CSP 对象无 extension_pages 报错', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: { sandbox: {} },
    });
    assert.equal(r.valid, false);
  });

  it('CSP 含 sandbox 产生 warning', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: {
        extension_pages: "script-src 'self'",
        sandbox: {},
      },
    });
    assert.ok(r.warnings.some(w => w.includes('sandbox')));
  });

  it('缺少推荐指令产生 warning', () => {
    const r = validateContentSecurityPolicy({
      content_security_policy: "default-src 'self'",
    });
    assert.ok(r.warnings.some(w => w.includes('script-src')));
  });
});

// ==================== generatePermissionJustification ====================

describe('generatePermissionJustification', () => {
  it('null manifest 返回空', () => {
    const r = generatePermissionJustification(null);
    assert.deepEqual(r.permissions, []);
  });

  it('已知权限返回模板', () => {
    const r = generatePermissionJustification({ permissions: ['storage', 'tabs'] });
    assert.equal(r.permissions.length, 2);
    assert.ok(r.permissions[0].hasTemplate);
    assert.ok(r.permissions[1].hasTemplate);
  });

  it('未知权限返回通用文案', () => {
    const r = generatePermissionJustification({ permissions: ['unknownPerm'] });
    assert.equal(r.permissions[0].hasTemplate, false);
    assert.ok(r.permissions[0].justification.includes('unknownPerm'));
  });

  it('无 permissions 字段', () => {
    const r = generatePermissionJustification({});
    assert.deepEqual(r.permissions, []);
  });
});

// ==================== detectLanguageSupport ====================

describe('detectLanguageSupport', () => {
  it('null manifest 返回警告', () => {
    const r = detectLanguageSupport(null);
    assert.ok(r.warnings.length > 0);
    assert.equal(r.isIntl, false);
  });

  it('无 default_locale 产生警告', () => {
    const r = detectLanguageSupport({});
    assert.ok(r.warnings.some(w => w.includes('default_locale')));
  });

  it('有多个 locale 为国际化', () => {
    const r = detectLanguageSupport(
      { default_locale: 'en' },
      { availableLocales: ['en', 'zh_CN'] }
    );
    assert.equal(r.isIntl, true);
    assert.equal(r.availableLocales.length, 2);
  });

  it('单个 locale 不是国际化', () => {
    const r = detectLanguageSupport(
      { default_locale: 'en' },
      { availableLocales: ['en'] }
    );
    assert.equal(r.isIntl, false);
  });

  it('无 locale 文件产生警告', () => {
    const r = detectLanguageSupport({ default_locale: 'en' });
    assert.ok(r.warnings.some(w => w.includes('no locale files')));
  });

  it('locale 缺少 extName 产生警告', () => {
    const r = detectLanguageSupport(
      { default_locale: 'en' },
      {
        availableLocales: ['en'],
        messagesByLocale: { en: { extDescription: 'desc' } },
      }
    );
    assert.ok(r.warnings.some(w => w.includes('extName')));
  });

  it('locale 缺少 extDescription 产生警告', () => {
    const r = detectLanguageSupport(
      { default_locale: 'en' },
      {
        availableLocales: ['en'],
        messagesByLocale: { en: { extName: 'name' } },
      }
    );
    assert.ok(r.warnings.some(w => w.includes('extDescription')));
  });

  it('locale messages 非对象产生警告', () => {
    const r = detectLanguageSupport(
      { default_locale: 'en' },
      {
        availableLocales: ['en'],
        messagesByLocale: { en: null },
      }
    );
    assert.ok(r.warnings.some(w => w.includes('no messages')));
  });
});

// ==================== suggestManifestImprovements ====================

describe('suggestManifestImprovements', () => {
  const goodManifest = {
    name: 'PageWise',
    version: '1.0.0',
    description: 'AI sidebar extension',
    manifest_version: 3,
    icons: { '16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png' },
    content_security_policy: { extension_pages: "script-src 'self'" },
    default_locale: 'en',
    minimum_chrome_version: '110',
    author: 'PageWise Team',
    options_page: 'options.html',
    action: { default_popup: 'popup.html' },
  };

  it('优秀 manifest 得分 100', () => {
    const r = suggestManifestImprovements(goodManifest);
    assert.equal(r.score, 100);
    assert.equal(r.suggestions.length, 0);
  });

  it('null manifest 返回 0 分', () => {
    const r = suggestManifestImprovements(null);
    assert.equal(r.score, 0);
    assert.ok(r.suggestions[0].severity === 'error');
  });

  it('缺少 name 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, name: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('name')));
    assert.equal(r.score, 80);
  });

  it('缺少 version 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, version: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('version')));
  });

  it('缺少 description 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, description: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('description')));
  });

  it('缺少 icons 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, icons: {} });
    assert.ok(r.suggestions.some(s => s.message.includes('icons')));
  });

  it('缺少 CSP 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, content_security_policy: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('content_security_policy')));
  });

  it('manifest_version 不为 3 扣 20 分', () => {
    const r = suggestManifestImprovements({ ...goodManifest, manifest_version: 2 });
    assert.ok(r.suggestions.some(s => s.message.includes('Manifest V3')));
  });

  it('content_scripts 使用 <all_urls> 产生警告', () => {
    const r = suggestManifestImprovements({
      ...goodManifest,
      content_scripts: [{ matches: ['<all_urls>'] }],
    });
    assert.ok(r.suggestions.some(s => s.message.includes('<all_urls>')));
  });

  it('host_permissions 宽泛模式产生警告', () => {
    const r = suggestManifestImprovements({
      ...goodManifest,
      host_permissions: ['<all_urls>'],
    });
    assert.ok(r.suggestions.some(s => s.message.includes('broad patterns')));
  });

  it('缺少 default_locale 产生警告', () => {
    const r = suggestManifestImprovements({ ...goodManifest, default_locale: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('default_locale')));
  });

  it('缺少 minimum_chrome_version 产生警告', () => {
    const r = suggestManifestImprovements({ ...goodManifest, minimum_chrome_version: undefined });
    assert.ok(r.suggestions.some(s => s.message.includes('minimum_chrome_version')));
  });

  it('缺少 author 产生 info', () => {
    const r = suggestManifestImprovements({ ...goodManifest, author: undefined });
    assert.ok(r.suggestions.some(s => s.severity === 'info' && s.message.includes('author')));
  });

  it('缺少 options_page 产生 info', () => {
    const r = suggestManifestImprovements({ ...goodManifest, options_page: undefined });
    assert.ok(r.suggestions.some(s => s.severity === 'info' && s.message.includes('options')));
  });

  it('缺少 action 产生 info', () => {
    const r = suggestManifestImprovements({ ...goodManifest, action: undefined });
    assert.ok(r.suggestions.some(s => s.severity === 'info' && s.message.includes('action')));
  });

  it('得分不低于 0', () => {
    const r = suggestManifestImprovements({});
    assert.ok(r.score >= 0);
  });
});

// ==================== checkStoreSubmissionReadiness ====================

describe('checkStoreSubmissionReadiness', () => {
  const readyManifest = {
    manifest_version: 3,
    name: 'PageWise',
    version: '1.0.0',
    description: 'AI reading assistant',
    icons: { '16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    permissions: ['storage', 'tabs', 'sidePanel'],
    default_locale: 'en',
    background: { service_worker: 'background.js' },
  };

  it('null manifest 返回不就绪', () => {
    const r = checkStoreSubmissionReadiness(null);
    assert.equal(r.ready, false);
    assert.equal(r.score, 0);
  });

  it('完整 manifest 返回就绪', () => {
    const r = checkStoreSubmissionReadiness(readyManifest, {
      availableLocales: ['en', 'zh_CN'],
      messagesByLocale: {
        en: { extName: 'PageWise', extDescription: 'AI' },
        zh_CN: { extName: '智阅', extDescription: 'AI' },
      },
    });
    assert.equal(r.ready, true);
    assert.ok(r.score >= 70);
  });

  it('包含高危权限不就绪', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      permissions: ['debugger'],
    });
    const permCheck = r.checks.find(c => c.id === 'permissions-safe');
    assert.equal(permCheck.passed, false);
  });

  it('无 service_worker 不通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      background: undefined,
    });
    const swCheck = r.checks.find(c => c.id === 'service-worker');
    assert.equal(swCheck.passed, false);
  });

  it('content_scripts 使用 <all_urls> 不通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      content_scripts: [{ matches: ['<all_urls>'] }],
    });
    const csCheck = r.checks.find(c => c.id === 'content-scripts-safe');
    assert.equal(csCheck.passed, false);
  });

  it('描述过长不通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      description: 'x'.repeat(200),
    });
    const descCheck = r.checks.find(c => c.id === 'description-valid');
    assert.equal(descCheck.passed, false);
  });

  it('i18n 占位符描述通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      description: '__MSG_extDescription__',
    });
    const descCheck = r.checks.find(c => c.id === 'description-valid');
    assert.equal(descCheck.passed, true);
  });

  it('无 icons 不通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      icons: {},
    });
    const iconCheck = r.checks.find(c => c.id === 'icons-complete');
    assert.equal(iconCheck.passed, false);
  });

  it('无 CSP 不通过', () => {
    const r = checkStoreSubmissionReadiness({
      ...readyManifest,
      content_security_policy: undefined,
    });
    const cspCheck = r.checks.find(c => c.id === 'csp-configured');
    assert.equal(cspCheck.passed, false);
  });
});
