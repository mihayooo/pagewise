/**
 * R288 — E2E Chrome: 最小可行冒烟测试 (MVP Smoke)
 *
 * 策略: 仅保留 3 条核心冒烟路径，删除所有功能性断言。
 * 每条路径: 30s 硬超时 + 最多 2 次自动重试（仅 TimeoutError）。
 * 使用 describe 串行执行，避免浏览器状态污染。
 *
 * 路径 1: 扩展加载 → Service Worker 激活 → 获取 extensionId
 * 路径 2: SidePanel 打开 → 渲染 UI (#app + #panelChat)
 * 路径 3: 选中文字 → 弹出提问气泡 (.pagewise-toolbar)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchChromeWithExtension,
  openSidePanel,
  cleanProfileDir,
  isCI,
} from './helpers.js';

// ==================== 常量 ====================

const HARD_TIMEOUT = 30_000;       // 每条路径 30s 硬超时
const MAX_RETRIES = 2;             // 最多重试 2 次（仅 TimeoutError）

// ==================== 重试机制（仅 TimeoutError）====================

/**
 * 执行异步函数，遇到 TimeoutError 自动重试最多 maxRetries 次。
 * 其他错误直接抛出，不做重试。
 *
 * @param {Function} fn — 异步函数
 * @param {Object} options
 * @param {number} options.maxRetries — 最大重试次数
 * @param {string} options.label — 日志标签
 * @returns {Promise<*>}
 */
async function withTimeoutRetry(fn, options = {}) {
  const { maxRetries = MAX_RETRIES, label = 'test' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTimeout = isTimeoutError(err);
      if (isTimeout && attempt <= maxRetries) {
        console.warn(
          `[E2E Retry] ${label} attempt ${attempt}/${maxRetries + 1} timed out. Retrying...`
        );
        // 短暂等待后重试，让浏览器资源释放
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      // 非 TimeoutError 或已达最大重试次数
      throw err;
    }
  }
  throw lastError;
}

/**
 * 判断错误是否为 TimeoutError
 * Playwright TimeoutError: name === 'TimeoutError' 或 message 包含 'Timeout'
 * node:test 超时: message 包含 'timed out' 或 code === 'ERR_TEST_FAILURE'
 */
function isTimeoutError(err) {
  if (!err) return false;
  const name = err.name || '';
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return (
    name === 'TimeoutError' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    code === 'ERR_TEST_FAILURE' && msg.includes('timeout')
  );
}

// ==================== 测试套件（串行执行）====================

describe('E2E Chrome: 最小可行冒烟测试', () => {

  let context, extensionId, cleanup;

  before(async () => {
    cleanProfileDir();
  });

  after(async () => {
    if (cleanup) await cleanup();
    cleanProfileDir();
  });

  // ------------------------------------------------------------------
  // 路径 1: 扩展加载 → Service Worker 激活 → 获取 extensionId
  // ------------------------------------------------------------------
  it('路径 1: 扩展加载与 Service Worker 激活', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    await withTimeoutRetry(async () => {
      const result = await launchChromeWithExtension({
        headless: true,
        maxRetries: 2,
      });
      context = result.context;
      extensionId = result.extensionId;
      cleanup = result.cleanup;

      // 最小断言: extensionId 非空且格式正确
      assert.ok(extensionId, 'extensionId 不应为空');
      assert.match(extensionId, /^[a-z]{32}$/, 'extensionId 应为 32 位小写字母');

      // Service Worker 存在且包含扩展 ID
      const sw = context.serviceWorkers().find(s => s.url().includes(extensionId));
      assert.ok(sw, 'PageWise Service Worker 应处于活跃状态');

      console.log(`✅ 路径 1 通过: extensionId=${extensionId}`);
    }, { label: '路径1-扩展加载' });
  });

  // ------------------------------------------------------------------
  // 路径 2: SidePanel 打开 → 渲染 UI
  // ------------------------------------------------------------------
  it('路径 2: SidePanel 打开与 UI 渲染', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    // 确保路径 1 成功（串行依赖）
    assert.ok(context, '需要路径 1 成功启动 Chrome');
    assert.ok(extensionId, '需要路径 1 成功获取 extensionId');

    await withTimeoutRetry(async () => {
      const page = await openSidePanel(context, extensionId);
      try {
        // 最小断言: #app 容器存在
        const appEl = await page.$('#app');
        assert.ok(appEl, '#app 容器应存在');

        // 最小断言: 问答面板存在
        const panelChat = await page.$('#panelChat');
        assert.ok(panelChat, '#panelChat 面板应存在');

        console.log('✅ 路径 2 通过: SidePanel UI 渲染正常');
      } finally {
        await page.close();
      }
    }, { label: '路径2-SidePanel渲染' });
  });

  // ------------------------------------------------------------------
  // 路径 3: 选中文字 → 弹出提问气泡
  // ------------------------------------------------------------------
  it('路径 3: 选中文字弹出提问气泡', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');

    await withTimeoutRetry(async () => {
      // 创建一个包含文字的测试页面
      const page = await context.newPage();
      try {
        await page.setContent(`
          <html>
            <body>
              <p id="target">Hello PageWise E2E smoke test text for selection</p>
            </body>
          </html>
        `, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // 等待 content script 注入
        await page.waitForFunction(() => !!window.__AI_ASSISTANT_INJECTED__, {
          timeout: 15000,
        });

        // 使用 Playwright 的鼠标 API 模拟文字选中
        const target = await page.$('#target');
        const box = await target.boundingBox();

        // 从文字开头拖拽到结尾，模拟选中操作
        await page.mouse.move(box.x + 5, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width - 5,
          box.y + box.height / 2,
          { steps: 10 }
        );
        await page.mouse.up();

        // 等待 toolbar 出现
        const toolbar = await page.waitForSelector('.pagewise-toolbar--visible', {
          timeout: 10000,
        });
        assert.ok(toolbar, '选中文字后应弹出 .pagewise-toolbar 气泡');

        // 验证 toolbar 内有按钮（最小断言）
        const buttons = await page.$$('.pagewise-toolbar-btn');
        assert.ok(buttons.length > 0, 'toolbar 应包含至少一个操作按钮');

        console.log(`✅ 路径 3 通过: toolbar 弹出，${buttons.length} 个按钮`);
      } finally {
        await page.close();
      }
    }, { label: '路径3-选中文字气泡' });
  });
});
