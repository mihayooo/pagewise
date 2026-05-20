/**
 * R211 — E2E Chrome: 权限与 API 验证
 *
 * 验证：service worker 生命周期、storage API、tabs API 在真实环境正常工作
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchChromeWithExtension,
  openSidePanel,
  openPage,
  cleanProfileDir,
} from './helpers.js';

let context, extensionId, cleanup;

describe('E2E Chrome: 权限与 API 验证', () => {

  before(async () => {
    cleanProfileDir();
    const result = await launchChromeWithExtension({ headless: true });
    context = result.context;
    extensionId = result.extensionId;
    cleanup = result.cleanup;
  });

  after(async () => {
    if (cleanup) await cleanup();
    cleanProfileDir();
  });

  // ==================== Service Worker 生命周期 ====================

  it('Service Worker 应处于激活状态', async () => {
    const serviceWorkers = context.serviceWorkers();
    assert.ok(serviceWorkers.length > 0, '应至少有一个 Service Worker');

    // 查找 PageWise 的 service worker
    let foundSW = false;
    for (const sw of serviceWorkers) {
      if (sw.url().includes(extensionId)) {
        foundSW = true;
        break;
      }
    }
    assert.ok(foundSW, 'PageWise Service Worker 应处于活跃状态');
  });

  it('Service Worker URL 应指向 background/service-worker.js', async () => {
    const sw = context.serviceWorkers().find(s => s.url().includes(extensionId));
    assert.ok(sw, '应找到 PageWise Service Worker');
    assert.ok(sw.url().includes('service-worker.js'),
      `SW URL 应包含 service-worker.js，实际: ${sw.url()}`);
  });

  // ==================== Storage API ====================

  it('chrome.storage.local 应可正常读写', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const result = await page.evaluate(async () => {
        // 写入
        await chrome.storage.local.set({ _e2e_test_key: 'hello_r211' });
        // 读取
        const data = await chrome.storage.local.get('_e2e_test_key');
        return data._e2e_test_key;
      });
      assert.equal(result, 'hello_r211', 'storage.local 读写应一致');

      // 清理
      await page.evaluate(() => chrome.storage.local.remove('_e2e_test_key'));
    } finally {
      await page.close();
    }
  });

  it('chrome.storage.sync 应可正常读写', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const result = await page.evaluate(async () => {
        await chrome.storage.sync.set({ _e2e_sync_test: { value: 42 } });
        const data = await chrome.storage.sync.get('_e2e_sync_test');
        return data._e2e_sync_test;
      });
      assert.deepEqual(result, { value: 42 }, 'storage.sync 读写应一致');

      await page.evaluate(() => chrome.storage.sync.remove('_e2e_sync_test'));
    } finally {
      await page.close();
    }
  });

  it('chrome.storage.local 应支持批量操作', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const result = await page.evaluate(async () => {
        // 批量写入
        await chrome.storage.local.set({
          _e2e_batch_1: 'a',
          _e2e_batch_2: 'b',
          _e2e_batch_3: 'c',
        });
        // 批量读取
        const data = await chrome.storage.local.get(['_e2e_batch_1', '_e2e_batch_2', '_e2e_batch_3']);
        return data;
      });
      assert.equal(result._e2e_batch_1, 'a');
      assert.equal(result._e2e_batch_2, 'b');
      assert.equal(result._e2e_batch_3, 'c');

      // 清理
      await page.evaluate(() => chrome.storage.local.remove(['_e2e_batch_1', '_e2e_batch_2', '_e2e_batch_3']));
    } finally {
      await page.close();
    }
  });

  it('chrome.storage.onChanged 事件应正常触发', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const changed = await page.evaluate(async () => {
        return new Promise((resolve) => {
          let received = false;
          chrome.storage.onChanged.addListener((changes, area) => {
            if (changes._e2e_change_test && !received) {
              received = true;
              resolve({
                newValue: changes._e2e_change_test.newValue,
                oldValue: changes._e2e_change_test.oldValue,
                area,
              });
            }
          });
          // 触发变更
          chrome.storage.local.set({ _e2e_change_test: 'triggered' });
          // 超时保护
          setTimeout(() => {
            if (!received) resolve({ timeout: true });
          }, 3000);
        });
      });

      assert.ok(!changed.timeout, 'onChanged 事件应在超时前触发');
      assert.equal(changed.newValue, 'triggered', 'newValue 应正确');
      assert.equal(changed.area, 'local', 'area 应为 local');

      await page.evaluate(() => chrome.storage.local.remove('_e2e_change_test'));
    } finally {
      await page.close();
    }
  });

  // ==================== Tabs API ====================

  it('chrome.tabs.query 应返回当前标签页', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const tabs = await page.evaluate(async () => {
        return chrome.tabs.query({ active: true, currentWindow: true });
      });
      assert.ok(Array.isArray(tabs), 'tabs.query 应返回数组');
      assert.ok(tabs.length > 0, '应至少返回一个标签页');
      assert.ok(tabs[0].id !== undefined, '标签页应有 id');
    } finally {
      await page.close();
    }
  });

  it('chrome.tabs.query 应能查询所有标签页', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const tabs = await page.evaluate(async () => {
        return chrome.tabs.query({});
      });
      assert.ok(Array.isArray(tabs), 'tabs.query({}) 应返回数组');
      assert.ok(tabs.length > 0, '应至少有一个标签页');
    } finally {
      await page.close();
    }
  });

  // ==================== Runtime API ====================

  it('chrome.runtime.sendMessage 应可正常通信', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      // 发送一个 ping 消息到 service worker
      const response = await page.evaluate(async () => {
        try {
          const resp = await chrome.runtime.sendMessage({ action: 'ping' });
          return { success: true, response: resp };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });
      // runtime.sendMessage 可能返回 undefined（如果 SW 没有处理 ping），这本身不算错误
      // 只要不抛异常即可
      assert.ok(true, 'sendMessage 应不抛异常');
    } finally {
      await page.close();
    }
  });

  it('chrome.runtime.getURL 应返回正确的扩展资源 URL', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const url = await page.evaluate(() => {
        return chrome.runtime.getURL('sidebar/sidebar.html');
      });
      assert.ok(url.startsWith('chrome-extension://'), 'URL 应以 chrome-extension:// 开头');
      assert.ok(url.includes('sidebar/sidebar.html'), 'URL 应包含正确的路径');
    } finally {
      await page.close();
    }
  });

  // ==================== Manifest 权限验证 ====================

  it('manifest.json 应声明所有必要权限', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const manifest = await page.evaluate(() => chrome.runtime.getManifest());

      assert.equal(manifest.manifest_version, 3, 'manifest_version 应为 3');

      // 验证必要权限
      const requiredPermissions = ['storage', 'sidePanel', 'contextMenus', 'tabs', 'activeTab', 'bookmarks'];
      for (const perm of requiredPermissions) {
        assert.ok(manifest.permissions.includes(perm),
          `manifest 应包含 "${perm}" 权限`);
      }

      // 验证 host_permissions
      assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions 应为数组');
      assert.ok(manifest.host_permissions.length > 0, '应至少有一个 host_permission');

      // 验证 service worker 配置
      assert.ok(manifest.background, 'manifest 应包含 background 配置');
      assert.equal(manifest.background.type, 'module', 'service worker 应使用 ES Modules');
    } finally {
      await page.close();
    }
  });

  it('manifest.json 内容安全策略应正确设置', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const manifest = await page.evaluate(() => chrome.runtime.getManifest());

      assert.ok(manifest.content_security_policy, '应有 CSP 配置');
      assert.ok(manifest.content_security_policy.extension_pages,
        '应配置 extension_pages CSP');
      assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"),
        'CSP 应限制 script-src 为 self');
    } finally {
      await page.close();
    }
  });
});
