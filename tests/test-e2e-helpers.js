/**
 * R257 — E2E Helper 单元测试
 *
 * 测试 helpers.js 中的纯函数（无需 Chrome 环境）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 动态导入 helpers（避免触发 Playwright 初始化）
const helpers = await import('./e2e-chrome/helpers.js');

describe('E2E Helpers: getSidePanelUrl', () => {
  it('应返回正确的 chrome-extension URL', () => {
    const url = helpers.getSidePanelUrl('abcdefghijklmnop');
    assert.equal(url, 'chrome-extension://abcdefghijklmnop/sidebar/sidebar.html');
  });

  it('应包含 sidebar.html 路径', () => {
    const url = helpers.getSidePanelUrl('testextensionid12345678901');
    assert.ok(url.includes('/sidebar/sidebar.html'), 'URL 应包含 sidebar.html');
  });

  it('应以 chrome-extension:// 开头', () => {
    const url = helpers.getSidePanelUrl('abc');
    assert.ok(url.startsWith('chrome-extension://'), '应以 chrome-extension:// 开头');
  });
});

describe('E2E Helpers: generateBookmarkData', () => {
  it('默认应生成 10 个书签', () => {
    const tree = helpers.generateBookmarkData();
    const all = tree[0].children[0].children;
    const bookmarks = all.flatMap(f => f.children || []);
    assert.equal(bookmarks.length, 10, '默认应生成 10 个书签');
  });

  it('应生成指定数量的书签', () => {
    const tree = helpers.generateBookmarkData(25);
    const all = tree[0].children[0].children;
    const bookmarks = all.flatMap(f => f.children || []);
    assert.equal(bookmarks.length, 25, '应生成 25 个书签');
  });

  it('书签应包含必要的属性', () => {
    const tree = helpers.generateBookmarkData(1);
    const bookmark = tree[0].children[0].children[0].children[0];
    assert.ok(bookmark.id, '书签应有 id');
    assert.ok(bookmark.title, '书签应有 title');
    assert.ok(bookmark.url, '书签应有 url');
    assert.ok(bookmark.parentId, '书签应有 parentId');
    assert.ok(bookmark.dateAdded > 0, '书签应有 dateAdded');
  });

  it('书签树应有正确的层级结构', () => {
    const tree = helpers.generateBookmarkData(5);
    assert.equal(tree.length, 1, '根节点应有 1 项');
    assert.equal(tree[0].title, '', '根节点标题应为空');
    assert.equal(tree[0].children[0].title, '书签栏', '第一层应为书签栏');
    assert.ok(tree[0].children[0].children.length > 0, '应有文件夹');
  });

  it('应生成 5 个文件夹', () => {
    const tree = helpers.generateBookmarkData(10);
    const folders = tree[0].children[0].children;
    assert.equal(folders.length, 5, '应有 5 个文件夹');
  });

  it('生成 0 个书签应返回空树', () => {
    const tree = helpers.generateBookmarkData(0);
    const folders = tree[0].children[0].children;
    const bookmarks = folders.flatMap(f => f.children || []);
    assert.equal(bookmarks.length, 0, '应生成 0 个书签');
  });
});

describe('E2E Helpers: assertWithinBudget', () => {
  it('耗时在预算内不应抛异常', () => {
    assert.doesNotThrow(() => {
      helpers.assertWithinBudget(100, 500, '测试');
    });
  });

  it('耗时严重超预算应抛异常', () => {
    assert.throws(() => {
      helpers.assertWithinBudget(2000, 500, '测试');
    }, /严重超预算/);
  });

  it('耗时轻微超预算应不抛异常（仅警告）', () => {
    assert.doesNotThrow(() => {
      helpers.assertWithinBudget(600, 500, '测试');
    });
  });
});

describe('E2E Helpers: cleanProfileDir', () => {
  it('清理不存在的目录应不抛异常', () => {
    assert.doesNotThrow(() => {
      helpers.cleanProfileDir();
    });
  });
});

describe('E2E Helpers: 导出函数完整性', () => {
  it('应导出所有必要的 helper 函数', () => {
    const requiredExports = [
      'launchChromeWithExtension',
      'getSidePanelUrl',
      'openSidePanel',
      'openPage',
      'clickTab',
      'waitForPanel',
      'measurePerformance',
      'assertWithinBudget',
      'generateBookmarkData',
      'getExtensionId',
      'typeAndSend',
      'cleanProfileDir',
    ];

    for (const name of requiredExports) {
      assert.equal(typeof helpers[name], 'function', `应导出函数 ${name}`);
    }
  });
});
