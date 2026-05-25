/**
 * E2E Chrome Test Helpers
 *
 * 使用 Playwright 在真实 Chrome 浏览器中加载扩展并执行端到端测试。
 *
 * 核心能力：
 *   - launchChromeWithExtension: 带扩展的 Chrome 实例管理（含重试）
 *   - openSidePanel / waitForSelector / clickTab: 页面交互封装
 *   - measurePerformance / assertWithinBudget: 性能基准断言
 *   - generateBookmarkData: 测试用书签数据生成
 *   - CI 环境自适应超时与重试机制 (R283)
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-r211');

// ==================== CI 环境检测与自适应超时 (R283) ====================

/**
 * 检测是否在 CI 环境中运行
 * @returns {boolean}
 */
export function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.JENKINS_URL ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI
  );
}

/**
 * 获取环境自适应超时值
 * CI 环境资源有限，Chrome 启动和渲染均显著慢于本地开发环境。
 *
 * @param {string} name — 超时场景名称
 * @returns {number} 超时毫秒数
 */
export function getTimeout(name) {
  const ci = isCI();
  const timeouts = {
    serviceWorker:    ci ? 30000 : 15000,   // SW 等待
    selector:         ci ? 15000 : 8000,    // 元素等待
    sidePanelLoad:    ci ? 20000 : 10000,   // SidePanel 完整加载
    interaction:      ci ? 8000  : 3000,    // 交互操作
    navigation:       ci ? 10000 : 5000,    // Tab 切换
    onboarding:       ci ? 5000  : 2000,    // Onboarding 遮罩
    testOverall:      ci ? 60000 : 30000,   // 单个测试总超时
    performanceBudget:ci ? 8000  : 3000,    // 性能基准（CI 4x 余量）
  };
  return timeouts[name] || (ci ? 15000 : 8000);
}

/**
 * 带重试的异步操作执行器
 *
 * 在 CI 环境中，Chrome 启动、Service Worker 注册等操作可能因资源竞争
 * 而间歇性失败。通过指数退避重试提高稳定性。
 *
 * @param {Function} fn — 要执行的异步函数
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3] — 最大重试次数
 * @param {number} [options.baseDelay=1000] — 基础延迟 (ms)
 * @param {string} [options.label='operation'] — 日志标签
 * @returns {Promise<*>} fn 的返回值
 */
export async function withRetry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, label = 'operation' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`[E2E Retry] ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`[E2E Retry] ${label} failed after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * 启动带有 PageWise 扩展的 Chrome 实例
 *
 * R283 增强: 使用 withRetry 包装 Chrome 启动和 SW 等待，
 * CI 环境中 Chrome 启动可能因资源竞争间歇性失败。
 *
 * @param {Object} [options]
 * @param {boolean} [options.headless] — 是否使用 headless 模式（默认 true）
 * @param {number} [options.maxRetries] — 最大重试次数（默认 3）
 * @returns {Promise<{ context: BrowserContext, extensionId: string, cleanup: () => Promise<void> }>}
 */
export async function launchChromeWithExtension(options = {}) {
  const { headless = true, maxRetries = 3 } = options;
  const swTimeout = getTimeout('serviceWorker');

  // R283: 带重试的 Chrome 启动
  const result = await withRetry(async () => {
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
          '--disable-extensions-http-throttling',
          '--disable-renderer-backgrounding',
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
        await context.waitForEvent('serviceworker', { timeout: swTimeout });
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

    if (!extensionId) {
      // cleanup before retry
      try { await context.close(); } catch { /* ignore */ }
      throw new Error('Failed to get extensionId from Service Worker');
    }

    return { context, extensionId };
  }, {
    maxRetries,
    baseDelay: 2000,
    label: 'Chrome launch + SW registration',
  });

  const { context, extensionId } = result;

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
 * R283: 使用自适应超时，CI 环境等待更长时间
 *
 * @param {BrowserContext} context
 * @param {string} extensionId
 * @returns {Promise<Page>} sidePanel page
 */
export async function openSidePanel(context, extensionId) {
  const page = await context.newPage();
  const sidePanelTimeout = getTimeout('sidePanelLoad');
  const selectorTimeout = getTimeout('selector');

  await page.goto(getSidePanelUrl(extensionId), {
    waitUntil: 'domcontentloaded',
    timeout: sidePanelTimeout,
  });
  await page.waitForSelector('#app', { timeout: selectorTimeout });
  // 等待模块加载和渲染（CI 环境更慢）
  const renderDelay = isCI() ? 1000 : 500;
  await page.waitForTimeout(renderDelay);
  // 首次安装时会弹出新手引导遮罩层，阻塞所有交互，必须先关闭
  await dismissOnboarding(page);
  return page;
}

/**
 * 关闭新手引导遮罩层（如果存在）
 *
 * 首次安装扩展会弹出 onboarding overlay，其 backdrop 会拦截所有
 * pointer events，导致 clickTab 等操作超时。E2E 测试需要在交互前关闭它。
 *
 * R283: 使用自适应超时，添加更可靠的隐藏机制
 *
 * @param {Page} page
 */
export async function dismissOnboarding(page) {
  const onboardingTimeout = getTimeout('onboarding');
  const interactionTimeout = getTimeout('interaction');

  try {
    // 等待引导遮罩层出现（自适应超时），可能异步渲染
    const overlay = await page.waitForSelector(
      '#onboardingOverlay:not(.hidden)',
      { timeout: onboardingTimeout }
    ).catch(() => null);

    if (!overlay) return; // 没有引导层，直接返回

    // 点击"跳过"按钮关闭引导
    // R288: 改用 page.click() 以使 timeout 参数生效（ElementHandle.click() 不支持 timeout）
    const skipBtn = await page.$('#onboardingSkip');
    if (skipBtn) {
      await page.click('#onboardingSkip', { timeout: interactionTimeout });
      // 等待遮罩层关闭动画
      await page.waitForSelector('#onboardingOverlay.hidden', { timeout: interactionTimeout })
        .catch(() => {});
    } else {
      // 备选：直接隐藏遮罩层
      await page.evaluate(() => {
        const el = document.getElementById('onboardingOverlay');
        if (el) el.classList.add('hidden');
      });
    }
  } catch {
    // 最终兜底：直接隐藏所有可能的遮罩层
    try {
      await page.evaluate(() => {
        // R283: 更彻底的遮罩层清理
        // R288: 移除 '.modal-backdrop' 幽灵选择器（整个代码库中不存在此选择器）
        const selectors = [
          '#onboardingOverlay',
          '.onboarding-overlay',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) el.classList.add('hidden');
        }
      });
    } catch { /* ignore */ }
  }
}

/**
 * 打开指定 URL 的页面
 *
 * R283: 使用自适应超时
 */
export async function openPage(context, url) {
  const page = await context.newPage();
  const timeout = getTimeout('navigation');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  return page;
}

/**
 * 等待并点击标签页按钮
 *
 * R283: 使用自适应超时
 */
export async function clickTab(page, tabName) {
  const selectorTimeout = getTimeout('selector');
  await page.click(`button.tab[data-tab="${tabName}"]`, { timeout: selectorTimeout });
  // R283: CI 环境面板切换动画/渲染需要更多时间
  const waitTime = isCI() ? 500 : 300;
  await page.waitForTimeout(waitTime);
}

/**
 * 等待面板变为可见
 *
 * R283: 使用自适应超时
 */
export async function waitForPanel(page, panelId) {
  const navTimeout = getTimeout('navigation');
  await page.waitForSelector(`#${panelId}.active`, { timeout: navTimeout });
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
 *
 * R283: CI 环境自动放宽预算 (4x)
 */
export function assertWithinBudget(actual, budget, label) {
  // CI 环境使用更宽松的预算
  const effectiveBudget = isCI() ? budget * 4 : budget;
  const envLabel = isCI() ? `${label} [CI]` : label;
  const msg = `${envLabel}: ${actual.toFixed(1)}ms (预算: ${effectiveBudget}ms)`;
  // R288: CI 严重超预算阈值从 effectiveBudget*4 (即原始预算 16x) 收紧至 effectiveBudget*2 (即 8x)
  if (actual >= effectiveBudget * 2) {
    throw new Error(`严重超预算 — ${msg}`);
  }
  if (actual > effectiveBudget) {
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
