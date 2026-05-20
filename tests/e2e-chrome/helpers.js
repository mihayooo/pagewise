/**
 * E2E Chrome Test Helpers
 *
 * 使用 Playwright 在真实 Chrome 浏览器中加载扩展并执行端到端测试。
 *
 * 核心能力：
 *   - launchChromeWithExtension: 带扩展的 Chrome 实例管理
 *   - openSidePanel / waitForSelector / clickTab: 页面交互封装
 *   - measurePerformance / assertWithinBudget: 性能基准断言
 *   - generateBookmarkData: 测试用书签数据生成
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-r211');

/**
 * 启动带有 PageWise 扩展的 Chrome 实例
 *
 * @param {Object} [options]
 * @param {boolean} [options.headless] — 是否使用 headless 模式（默认 true）
 * @returns {Promise<{ context: BrowserContext, extensionId: string, cleanup: () => Promise<void> }>}
 */
export async function launchChromeWithExtension(options = {}) {
  const { headless = true } = options;

  // 确保 profile 目录存在
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(
    PROFILE_DIR,
    {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        ...(headless ? ['--headless=new'] : []),
      ],
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    }
  );

  // 等待 service worker 启动并获取 extensionId
  let extensionId = '';

  try {
    const sw = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 });
    const url = new URL(sw.url());
    extensionId = url.hostname;
  } catch {
    // fallback: scan service workers
    for (const sw of context.serviceWorkers()) {
      const url = new URL(sw.url());
      extensionId = url.hostname;
      break;
    }
  }

  async function cleanup() {
    try {
      await context.close();
    } catch { /* ignore */ }
  }

  return { context, extensionId, cleanup };
}

/**
 * 获取扩展的 sidePanel URL
 */
export function getSidePanelUrl(extensionId) {
  return `chrome-extension://${extensionId}/sidebar/sidebar.html`;
}

/**
 * 打开 SidePanel 并等待加载完成
 *
 * @param {BrowserContext} context
 * @param {string} extensionId
 * @returns {Promise<Page>} sidePanel page
 */
export async function openSidePanel(context, extensionId) {
  const page = await context.newPage();
  await page.goto(getSidePanelUrl(extensionId), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { timeout: 15000 });
  // 等待模块加载和渲染
  await page.waitForTimeout(500);
  return page;
}

/**
 * 打开指定 URL 的页面
 */
export async function openPage(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

/**
 * 等待并点击标签页按钮
 */
export async function clickTab(page, tabName) {
  await page.click(`button.tab[data-tab="${tabName}"]`);
  await page.waitForTimeout(300);
}

/**
 * 等待面板变为可见
 */
export async function waitForPanel(page, panelId) {
  await page.waitForSelector(`#${panelId}.active`, { timeout: 5000 });
}

/**
 * 测量异步操作耗时 (performance.now)
 */
export async function measurePerformance(fn) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/**
 * 断言耗时在预算内
 */
export function assertWithinBudget(actual, budget, label) {
  const msg = `${label}: ${actual.toFixed(1)}ms (预算: ${budget}ms)`;
  if (actual > budget * 2) {
    throw new Error(`严重超预算 — ${msg}`);
  }
  if (actual > budget) {
    console.warn(`⚠️  性能超预算 — ${msg}`);
  } else {
    console.log(`✅ 性能基准 — ${msg}`);
  }
}

/**
 * 生成测试用书签数据
 */
export function generateBookmarkData(count = 10) {
  const folders = ['技术文档', '前端框架', 'AI/ML', '工具集', '设计资源'];
  const domains = ['github.com', 'developer.mozilla.org', 'react.dev', 'vuejs.org',
    'docs.python.org', 'arxiv.org', 'huggingface.co', 'figma.com'];

  const bookmarks = [];
  for (let i = 0; i < count; i++) {
    const folderIdx = i % folders.length;
    const domain = domains[i % domains.length];
    bookmarks.push({
      id: String(i + 100),
      title: `Bookmark ${i + 1} ${folders[folderIdx]}`,
      url: `https://${domain}/page/${i + 1}`,
      parentId: String(10 + folderIdx),
      dateAdded: Date.now() - i * 86400000,
    });
  }

  return [{
    id: '0',
    title: '',
    children: [{
      id: '1',
      title: '书签栏',
      children: folders.map((folder, idx) => ({
        id: String(10 + idx),
        title: folder,
        children: bookmarks.filter(b => b.parentId === String(10 + idx)),
      })),
    }],
  }];
}

/**
 * 从 service worker 获取 extensionId
 */
export async function getExtensionId(context) {
  const sw = context.serviceWorkers()[0] ||
    await context.waitForEvent('serviceworker', { timeout: 15000 });
  const url = new URL(sw.url());
  return url.hostname;
}

/**
 * 在输入框输入文本并发送
 */
export async function typeAndSend(page, text) {
  await page.fill('#userInput', text);
  await page.click('#btnSend');
}

/**
 * 清理 chrome profile 目录
 */
export function cleanProfileDir() {
  try {
    if (fs.existsSync(PROFILE_DIR)) {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}
