/**
 * R211 — E2E Chrome: 性能基准验证
 *
 * 验证：SidePanel 首屏渲染 <500ms、各面板切换 <300ms、内存使用合理
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchChromeWithExtension,
  openSidePanel,
  clickTab,
  waitForPanel,
  measurePerformance,
  assertWithinBudget,
  cleanProfileDir,
} from './helpers.js';

let context, extensionId, cleanup;

describe('E2E Chrome: 性能基准', () => {

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

  // ==================== 首屏渲染 ====================

  it('SidePanel 首屏渲染 (冷启动) 应 < 500ms', async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t = await measurePerformance(async () => {
        const page = await openSidePanel(context, extensionId);
        await page.waitForSelector('#panelChat.active', { timeout: 5000 });
        await page.close();
      });
      times.push(t);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    assertWithinBudget(avg, 500, `SidePanel 首屏渲染 (3次平均, times=[${times.map(t => t.toFixed(0)).join(',')}])`);
  });

  // ==================== 面板切换性能 ====================

  it('面板切换应 < 300ms', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const panels = ['knowledge', 'settings', 'bookmarks', 'skills', 'wiki', 'page', 'logs', 'chat'];
      const times = [];

      for (const panel of panels) {
        const t = await measurePerformance(async () => {
          await clickTab(page, panel);
          await waitForPanel(page, `panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
        });
        times.push({ panel, time: t });
      }

      for (const { panel, time } of times) {
        assertWithinBudget(time, 300, `切换到 ${panel} 面板`);
      }
    } finally {
      await page.close();
    }
  });

  // ==================== DOM 复杂度 ====================

  it('SidePanel 总 DOM 节点数应合理 (< 5000)', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const nodeCount = await page.evaluate(() => {
        return document.querySelectorAll('*').length;
      });
      console.log(`📊 DOM 节点数: ${nodeCount}`);
      assert.ok(nodeCount > 0, 'DOM 应有节点');
      assert.ok(nodeCount < 5000, `DOM 节点数应 < 5000，实际: ${nodeCount}`);
    } finally {
      await page.close();
    }
  });

  // ==================== 资源加载 ====================

  it('SidePanel 应不加载外部字体失败（降级处理）', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      // 检查是否有网络请求错误（字体加载等）
      const errors = [];
      page.on('requestfailed', request => {
        if (request.url().includes('fonts.googleapis') ||
            request.url().includes('fonts.gstatic')) {
          errors.push(request.url());
        }
      });

      // 重新加载页面
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // 字体加载失败不应导致页面崩溃
      const appEl = await page.$('#app');
      assert.ok(appEl, '即使字体加载失败，#app 仍应存在');

      console.log(`📊 字体加载失败数: ${errors.length} (不影响功能)`);
    } finally {
      await page.close();
    }
  });

  // ==================== 多面板循环切换 ====================

  it('10 次完整面板循环切换总耗时应 < 5s', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const allTabs = ['chat', 'skills', 'knowledge', 'wiki', 'page', 'settings', 'bookmarks', 'logs'];
      const totalTime = await measurePerformance(async () => {
        for (let round = 0; round < 10; round++) {
          for (const tab of allTabs) {
            await clickTab(page, tab);
          }
        }
      });
      assertWithinBudget(totalTime, 5000, '10 次面板循环切换 (80 次切换)');
    } finally {
      await page.close();
    }
  });

  // ==================== 内存使用 ====================

  it('页面 JS 堆大小应合理 (< 50MB)', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const heapSize = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize;
        }
        return 0;
      });

      if (heapSize > 0) {
        const heapMB = heapSize / 1024 / 1024;
        console.log(`📊 JS 堆大小: ${heapMB.toFixed(1)} MB`);
        assert.ok(heapMB < 50, `JS 堆应 < 50 MB，实际: ${heapMB.toFixed(1)} MB`);
      } else {
        console.log('📊 performance.memory 不可用，跳过堆大小检查');
      }
    } finally {
      await page.close();
    }
  });
});
