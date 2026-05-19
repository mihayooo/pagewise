/**
 * 测试 R130: 超大模块拆分二期 ModuleSplitPhase2
 *
 * 验证:
 *   1. 拆分后所有目标文件 ≤400 行
 *   2. API 向后兼容（所有原有导出仍可用）
 *   3. 新拆分文件独立可用
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(__dirname, '../lib');

function countLines(file) {
  const content = readFileSync(resolve(libDir, file), 'utf-8');
  return content.split('\n').length;
}

// ==================== 文件行数检查 ====================

describe('R130 — 文件行数 ≤ 400', () => {
  const files = [
    // 原始文件（应已拆分到 ≤400 行）
    'wiki-store.js',
    'skill-store.js',
    'plugin-system.js',
    'bookmark-store-prep.js',
    'bookmark-analytics.js',
    // 新拆分文件
    'wiki-store-funcs.js',
    'skill-store-community.js',
    'plugin-system-utils.js',
    'bookmark-store-prep-checks.js',
    'bookmark-analytics-advanced.js',
  ];

  for (const file of files) {
    it(`${file} 应 ≤ 400 行`, () => {
      const lines = countLines(file);
      assert.ok(lines <= 400, `${file} 有 ${lines} 行，超过 400 行限制`);
    });
  }
});

// ==================== wiki-store.js 向后兼容 ====================

describe('R130 — wiki-store.js 向后兼容 re-export', () => {
  const expectedExports = [
    'WIKI_PAGE_TYPE', 'PAGE_TYPE_LABELS', 'PAGE_TYPE_ICONS',
    'buildPageId', 'parsePageId',
    'entityToWikiPage', 'conceptToWikiPage', 'entryToWikiPage',
    'extractWikilinks', 'renderWikilinks',
    'buildBacklinkIndex', 'buildPageMap', 'getOutlinks',
    'searchPages', 'filterByType', 'filterByTags', 'paginate',
    'WikiStore',
  ];

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/wiki-store.js');
      assert.ok(name in mod, `${name} 未从 wiki-store.js 导出`);
    });
  }

  it('WikiStore 可正常实例化并使用', async () => {
    const { WikiStore, WIKI_PAGE_TYPE } = await import('../lib/wiki-store.js');
    const store = new WikiStore();
    store.loadAll([], [], [{ id: 1, question: 'Q', answer: 'A' }]);
    const pages = store.getAllPages();
    assert.equal(pages.length, 1);
    assert.equal(pages[0].type, WIKI_PAGE_TYPE.QA);
  });
});

// ==================== wiki-store-funcs.js 独立可用 ====================

describe('R130 — wiki-store-funcs.js 独立导出', () => {
  it('应导出纯函数 buildPageId', async () => {
    const { buildPageId } = await import('../lib/wiki-store-funcs.js');
    assert.equal(buildPageId('entity', 'react'), 'entity:react');
  });

  it('应导出 searchPages', async () => {
    const { searchPages } = await import('../lib/wiki-store-funcs.js');
    const pages = [{ title: 'React', content: 'UI library', tags: ['js'] }];
    const result = searchPages(pages, 'react');
    assert.equal(result.length, 1);
  });
});

// ==================== skill-store.js 向后兼容 ====================

describe('R130 — skill-store.js 向后兼容 re-export', () => {
  const expectedExports = [
    'SkillStore', 'SkillPackageManager',
    'SkillCommunityHub', 'SkillCommunityReviews',
    'parseVersion', 'compareVersions', 'isNewerVersion', 'isVersionCompatible',
  ];

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/skill-store.js');
      assert.ok(name in mod, `${name} 未从 skill-store.js 导出`);
    });
  }
});

// ==================== skill-store-community.js 独立可用 ====================

describe('R130 — skill-store-community.js 独立导出', () => {
  it('应导出 SkillCommunityHub', async () => {
    const { SkillCommunityHub } = await import('../lib/skill-store-community.js');
    assert.equal(typeof SkillCommunityHub, 'function');
  });

  it('应导出 SkillCommunityReviews', async () => {
    const { SkillCommunityReviews } = await import('../lib/skill-store-community.js');
    assert.equal(typeof SkillCommunityReviews, 'function');
  });

  it('应导出 parseVersion', async () => {
    const { parseVersion } = await import('../lib/skill-store-community.js');
    const v = parseVersion('1.2.3');
    assert.equal(v.major, 1);
  });

  it('应导出 isNewerVersion', async () => {
    const { isNewerVersion } = await import('../lib/skill-store-community.js');
    assert.equal(isNewerVersion('2.0.0', '1.0.0'), true);
    assert.equal(isNewerVersion('1.0.0', '2.0.0'), false);
  });
});

// ==================== plugin-system.js 向后兼容 ====================

describe('R130 — plugin-system.js 向后兼容 re-export', () => {
  const expectedExports = [
    'parseVersion', 'compareVersions', 'satisfiesVersion',
    'validatePlugin', 'PluginRegistry', 'PluginManager',
  ];

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/plugin-system.js');
      assert.ok(name in mod, `${name} 未从 plugin-system.js 导出`);
    });
  }

  it('PluginManager 可正常实例化', async () => {
    const { PluginManager } = await import('../lib/plugin-system.js');
    const m = new PluginManager();
    assert.ok(m.registry);
  });
});

// ==================== plugin-system-utils.js 独立可用 ====================

describe('R130 — plugin-system-utils.js 独立导出', () => {
  it('应导出 PluginRegistry', async () => {
    const { PluginRegistry } = await import('../lib/plugin-system-utils.js');
    assert.equal(typeof PluginRegistry, 'function');
  });

  it('应导出 parseVersion', async () => {
    const { parseVersion } = await import('../lib/plugin-system-utils.js');
    const v = parseVersion('3.0.0');
    assert.equal(v.major, 3);
    assert.equal(v.prerelease, '');
  });

  it('应导出 compareVersions', async () => {
    const { compareVersions } = await import('../lib/plugin-system-utils.js');
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
  });
});

// ==================== bookmark-store-prep.js 向后兼容 ====================

describe('R130 — bookmark-store-prep.js 向后兼容 re-export', () => {
  const expectedExports = [
    'validateManifest', 'checkIcons', 'getStoreListing',
    'validateContentSecurityPolicy', 'generatePermissionJustification',
    'getScreenshotSpec', 'detectLanguageSupport',
    'suggestManifestImprovements', 'checkStoreSubmissionReadiness',
  ];

  for (const name of expectedExports) {
    it(`应导出 ${name}`, async () => {
      const mod = await import('../lib/bookmark-store-prep.js');
      assert.ok(name in mod, `${name} 未从 bookmark-store-prep.js 导出`);
    });
  }

  it('validateManifest 功能正确', async () => {
    const { validateManifest } = await import('../lib/bookmark-store-prep.js');
    const result = validateManifest({
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      description: 'A test extension',
      icons: { '16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png' },
    });
    assert.equal(result.valid, true);
  });
});

// ==================== bookmark-store-prep-checks.js 独立可用 ====================

describe('R130 — bookmark-store-prep-checks.js 独立导出', () => {
  it('应导出 validateContentSecurityPolicy', async () => {
    const { validateContentSecurityPolicy } = await import('../lib/bookmark-store-prep-checks.js');
    assert.equal(typeof validateContentSecurityPolicy, 'function');
  });

  it('应导出 checkStoreSubmissionReadiness', async () => {
    const { checkStoreSubmissionReadiness } = await import('../lib/bookmark-store-prep-checks.js');
    const result = checkStoreSubmissionReadiness(null);
    assert.equal(result.ready, false);
    assert.equal(result.score, 0);
  });
});

// ==================== bookmark-analytics.js 向后兼容 ====================

describe('R130 — bookmark-analytics.js 向后兼容 re-export', () => {
  it('应导出 BookmarkAnalytics (named)', async () => {
    const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');
    assert.equal(typeof BookmarkAnalytics, 'function');
  });

  it('应导出 BookmarkAnalytics (default)', async () => {
    const mod = await import('../lib/bookmark-analytics.js');
    assert.equal(typeof mod.default, 'function');
  });

  it('核心方法 getOverview 可用', async () => {
    const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');
    const ov = BookmarkAnalytics.getOverview([]);
    assert.equal(ov.totalBookmarks, 0);
  });

  it('高级方法 getVisitStats 可用', async () => {
    const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');
    const vs = BookmarkAnalytics.getVisitStats([]);
    assert.equal(vs.totalVisits, 0);
  });

  it('高级方法 getActivityHeatmap 可用', async () => {
    const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');
    const hm = BookmarkAnalytics.getActivityHeatmap([]);
    assert.equal(hm.labels.length, 7);
  });

  it('内部工具 _extractDomain 可用', async () => {
    const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');
    assert.equal(BookmarkAnalytics._extractDomain('https://example.com'), 'example.com');
  });
});

// ==================== bookmark-analytics-advanced.js 独立可用 ====================

describe('R130 — bookmark-analytics-advanced.js 独立导出', () => {
  it('应导出 BookmarkAnalyticsAdvanced', async () => {
    const { BookmarkAnalyticsAdvanced } = await import('../lib/bookmark-analytics-advanced.js');
    assert.equal(typeof BookmarkAnalyticsAdvanced, 'function');
  });

  it('应有 getVisitStats 方法', async () => {
    const { BookmarkAnalyticsAdvanced } = await import('../lib/bookmark-analytics-advanced.js');
    assert.equal(typeof BookmarkAnalyticsAdvanced.getVisitStats, 'function');
  });

  it('应有 getActivityHeatmap 方法', async () => {
    const { BookmarkAnalyticsAdvanced } = await import('../lib/bookmark-analytics-advanced.js');
    assert.equal(typeof BookmarkAnalyticsAdvanced.getActivityHeatmap, 'function');
  });

  it('应有 _extractDomain 静态方法', async () => {
    const { BookmarkAnalyticsAdvanced } = await import('../lib/bookmark-analytics-advanced.js');
    assert.equal(typeof BookmarkAnalyticsAdvanced._extractDomain, 'function');
    assert.equal(BookmarkAnalyticsAdvanced._extractDomain('https://test.com'), 'test.com');
  });
});