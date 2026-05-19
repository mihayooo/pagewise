/**
 * 测试 lib/bookmark-store-prep-checks.js — Chrome Web Store 发布检查
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/setup.js';

installChromeMock();

const {
  validateContentSecurityPolicy,
  generatePermissionJustification,
  detectLanguageSupport,
  suggestManifestImprovements,
  checkStoreSubmissionReadiness,
} = await import('../lib/bookmark-store-prep-checks.js');

function validManifest() {
  return {
    manifest_version: 3,
    name: 'Test Extension',
    version: '1.0.0',
    description: 'A test extension for Chrome Web Store',
    icons: { '16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    },
    default_locale: 'en',
    permissions: ['storage', 'tabs'],
    background: { service_worker: 'background.js' },
    action: { default_popup: 'popup.html' },
    author: 'Test Author',
    minimum_chrome_version: '100',
  };
}

// ==================== validateContentSecurityPolicy ====================

describe('validateContentSecurityPolicy()', () => {
  it('有效 CSP 通过', () => {
    const manifest = validManifest();
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.policy);
  });

  it('null manifest 返回无效', () => {
    const result = validateContentSecurityPolicy(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('缺少 CSP 返回无效', () => {
    const manifest = { name: 'test' };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('字符串 CSP 正常', () => {
    const manifest = { content_security_policy: "script-src 'self'" };
    const result = validateContentSecurityPolicy(manifest);
    assert.ok(result.policy);
  });

  it('unsafe-eval 报错', () => {
    const manifest = { content_security_policy: "script-src 'self' 'unsafe-eval'" };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('unsafe-eval')));
  });

  it('unsafe-inline 报错', () => {
    const manifest = { content_security_policy: "script-src 'self' 'unsafe-inline'" };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('data: 报错', () => {
    const manifest = { content_security_policy: "script-src 'self' data:" };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('http: 报错', () => {
    const manifest = { content_security_policy: "script-src 'self' http:" };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('https: 报错', () => {
    const manifest = { content_security_policy: "script-src 'self' https:" };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('无效 CSP 格式', () => {
    const manifest = { content_security_policy: 123 };
    const result = validateContentSecurityPolicy(manifest);
    assert.equal(result.valid, false);
  });

  it('sandbox CSP 警告', () => {
    const manifest = {
      content_security_policy: {
        extension_pages: "script-src 'self'",
        sandbox: "sandbox allow-scripts",
      },
    };
    const result = validateContentSecurityPolicy(manifest);
    assert.ok(result.warnings.some(w => w.includes('sandbox')));
  });

  it('缺少 script-src 警告', () => {
    const manifest = { content_security_policy: "object-src 'self'" };
    const result = validateContentSecurityPolicy(manifest);
    assert.ok(result.warnings.some(w => w.includes('script-src')));
  });
});

// ==================== generatePermissionJustification ====================

describe('generatePermissionJustification()', () => {
  it('null manifest 返回空', () => {
    const result = generatePermissionJustification(null);
    assert.deepEqual(result.permissions, []);
  });

  it('无权限', () => {
    const result = generatePermissionJustification({});
    assert.deepEqual(result.permissions, []);
  });

  it('已知权限有模板', () => {
    const manifest = { permissions: ['storage', 'tabs', 'sidePanel'] };
    const result = generatePermissionJustification(manifest);
    assert.equal(result.permissions.length, 3);
    assert.ok(result.permissions.every(p => p.hasTemplate));
  });

  it('未知权限有通用理由', () => {
    const manifest = { permissions: ['unknownPermission'] };
    const result = generatePermissionJustification(manifest);
    assert.equal(result.permissions.length, 1);
    assert.equal(result.permissions[0].hasTemplate, false);
    assert.ok(result.permissions[0].justification.includes('unknownPermission'));
  });
});

// ==================== detectLanguageSupport ====================

describe('detectLanguageSupport()', () => {
  it('null manifest 报错', () => {
    const result = detectLanguageSupport(null);
    assert.ok(result.warnings.length > 0);
  });

  it('无 default_locale 警告', () => {
    const result = detectLanguageSupport({});
    assert.ok(result.warnings.some(w => w.includes('default_locale')));
  });

  it('有默认语言', () => {
    const result = detectLanguageSupport({ default_locale: 'en' });
    assert.equal(result.defaultLocale, 'en');
  });

  it('多语言检测', () => {
    const result = detectLanguageSupport(
      { default_locale: 'en' },
      { availableLocales: ['en', 'zh_CN'] }
    );
    assert.equal(result.isIntl, true);
  });

  it('单语言', () => {
    const result = detectLanguageSupport(
      { default_locale: 'en' },
      { availableLocales: ['en'] }
    );
    assert.equal(result.isIntl, false);
  });

  it('无 locale 文件警告', () => {
    const result = detectLanguageSupport({ default_locale: 'en' });
    assert.ok(result.warnings.some(w => w.includes('no locale files')));
  });

  it('locale 缺少必要键', () => {
    const result = detectLanguageSupport(
      { default_locale: 'en' },
      {
        availableLocales: ['en', 'zh_CN'],
        messagesByLocale: {
          en: { extName: 'Test' },
          zh_CN: {},
        },
      }
    );
    assert.ok(result.warnings.some(w => w.includes('extDescription')));
    assert.ok(result.warnings.some(w => w.includes('extName')));
  });

  it('locale 无 messages 警告', () => {
    const result = detectLanguageSupport(
      { default_locale: 'en' },
      {
        availableLocales: ['en'],
        messagesByLocale: { en: null },
      }
    );
    assert.ok(result.warnings.some(w => w.includes('no messages')));
  });
});

// ==================== suggestManifestImprovements ====================

describe('suggestManifestImprovements()', () => {
  it('null manifest 返回 0 分', () => {
    const result = suggestManifestImprovements(null);
    assert.equal(result.score, 0);
  });

  it('完整 manifest 高分', () => {
    const result = suggestManifestImprovements(validManifest());
    assert.ok(result.score >= 70);
  });

  it('缺少 name 扣分', () => {
    const manifest = validManifest();
    delete manifest.name;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('name')));
  });

  it('缺少 version 扣分', () => {
    const manifest = validManifest();
    delete manifest.version;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('version')));
  });

  it('缺少 description 扣分', () => {
    const manifest = validManifest();
    delete manifest.description;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('description')));
  });

  it('缺少 icons 扣分', () => {
    const manifest = validManifest();
    delete manifest.icons;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('icons')));
  });

  it('缺少 CSP 扣分', () => {
    const manifest = validManifest();
    delete manifest.content_security_policy;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('content_security_policy')));
  });

  it('缺少 default_locale 警告', () => {
    const manifest = validManifest();
    delete manifest.default_locale;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('default_locale')));
  });

  it('非 V3 manifest 扣分', () => {
    const manifest = validManifest();
    manifest.manifest_version = 2;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('Manifest V3')));
  });

  it('content_scripts 使用 all_urls 警告', () => {
    const manifest = validManifest();
    manifest.content_scripts = [{ matches: ['<all_urls>'] }];
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('<all_urls>')));
  });

  it('host_permissions 宽泛模式警告', () => {
    const manifest = validManifest();
    manifest.host_permissions = ['<all_urls>'];
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('broad patterns')));
  });

  it('无 author 建议', () => {
    const manifest = validManifest();
    delete manifest.author;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('author')));
  });

  it('无 options_page 建议', () => {
    const manifest = validManifest();
    delete manifest.options_page;
    const manifest2 = { ...manifest };
    delete manifest2.options_ui;
    const result = suggestManifestImprovements(manifest2);
    assert.ok(result.suggestions.some(s => s.message.includes('options')));
  });

  it('无 action 建议', () => {
    const manifest = validManifest();
    delete manifest.action;
    const result = suggestManifestImprovements(manifest);
    assert.ok(result.suggestions.some(s => s.message.includes('action')));
  });
});

// ==================== checkStoreSubmissionReadiness ====================

describe('checkStoreSubmissionReadiness()', () => {
  it('null manifest 返回未就绪', () => {
    const result = checkStoreSubmissionReadiness(null);
    assert.equal(result.ready, false);
    assert.equal(result.score, 0);
  });

  it('完整 manifest 就绪', () => {
    const result = checkStoreSubmissionReadiness(validManifest(), {
      availableLocales: ['en', 'zh_CN'],
      messagesByLocale: {
        en: { extName: 'Test', extDescription: 'Desc' },
        zh_CN: { extName: '测试', extDescription: '描述' },
      },
    });
    assert.equal(result.ready, true);
    assert.ok(result.score >= 70);
    assert.ok(result.checks.length > 0);
  });

  it('缺少必要字段未就绪', () => {
    const manifest = validManifest();
    delete manifest.content_security_policy;
    const result = checkStoreSubmissionReadiness(manifest);
    assert.equal(result.ready, false);
  });

  it('危险权限检查', () => {
    const manifest = validManifest();
    manifest.permissions.push('debugger');
    const result = checkStoreSubmissionReadiness(manifest);
    const permCheck = result.checks.find(c => c.id === 'permissions-safe');
    assert.equal(permCheck.passed, false);
  });

  it('描述过长', () => {
    const manifest = validManifest();
    manifest.description = 'x'.repeat(200);
    const result = checkStoreSubmissionReadiness(manifest);
    const descCheck = result.checks.find(c => c.id === 'description-valid');
    assert.equal(descCheck.passed, false);
  });

  it('i18n 描述通过', () => {
    const manifest = validManifest();
    manifest.description = '__MSG_extDescription__';
    const result = checkStoreSubmissionReadiness(manifest);
    const descCheck = result.checks.find(c => c.id === 'description-valid');
    assert.equal(descCheck.passed, true);
  });

  it('content_scripts all_urls 检查', () => {
    const manifest = validManifest();
    manifest.content_scripts = [{ matches: ['<all_urls>'] }];
    const result = checkStoreSubmissionReadiness(manifest);
    const csCheck = result.checks.find(c => c.id === 'content-scripts-safe');
    assert.equal(csCheck.passed, false);
  });

  it('无 service_worker 检查', () => {
    const manifest = validManifest();
    delete manifest.background;
    const result = checkStoreSubmissionReadiness(manifest);
    const swCheck = result.checks.find(c => c.id === 'service-worker');
    assert.equal(swCheck.passed, false);
  });

  it('有 service_worker 通过', () => {
    const result = checkStoreSubmissionReadiness(validManifest());
    const swCheck = result.checks.find(c => c.id === 'service-worker');
    assert.equal(swCheck.passed, true);
  });
});
