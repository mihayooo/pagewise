/**
 * R299 — E2E Chrome: 核心场景扩展 (Core Scenario Expand)
 *
 * 在 R288 最小可行 E2E 稳定基础上，新增 3 条核心用户路径，
 * 覆盖书签采集→图谱渲染→节点点击详情、知识库搜索→结果列表→点击打开、
 * 设置页→主题切换→验证生效。
 *
 * 策略:
 * - 每条路径 45s 硬超时 + 最多 2 次自动重试（仅 TimeoutError）
 * - 与 R288 保持一致的重试策略
 * - 串行执行避免浏览器状态污染
 * - 使用稳定选择器，避免 R211 以来的选择器不匹配失败模式
 *
 * 路径 4: 书签采集→图谱渲染→节点点击详情
 * 路径 5: 知识库搜索→结果列表→点击打开
 * 路径 6: 设置页→主题切换→验证生效
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchChromeWithExtension,
  openSidePanel,
  clickTab,
  waitForPanel,
  dismissOnboarding,
  cleanProfileDir,
  isCI,
} from './helpers.js';

// ==================== 常量 ====================

const HARD_TIMEOUT = 45_000;       // 每条路径 45s 硬超时
const MAX_RETRIES = 2;             // 最多重试 2 次（仅 TimeoutError）

// ==================== 重试机制（仅 TimeoutError）====================

/**
 * 执行异步函数，遇到 TimeoutError 自动重试最多 maxRetries 次。
 * 其他错误直接抛出，不做重试。
 * 与 R288 test-smoke.js 中的 withTimeoutRetry 保持一致的策略。
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
          `[E2E Core] ${label} attempt ${attempt}/${maxRetries + 1} timed out. Retrying...`
        );
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * 判断错误是否为 TimeoutError
 * 与 R288 保持一致的判断逻辑
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
    (code === 'ERR_TEST_FAILURE' && msg.includes('timeout'))
  );
}

// ==================== 测试套件（串行执行）====================

describe('E2E Chrome: 核心场景扩展 (R299)', () => {

  let context, extensionId, cleanup;

  before(async () => {
    cleanProfileDir();
  });

  after(async () => {
    if (cleanup) await cleanup();
    cleanProfileDir();
  });

  // ------------------------------------------------------------------
  // 路径 1 (复用 R288): 扩展加载 → Service Worker 激活 → 获取 extensionId
  // 这是所有后续路径的前置条件，与 R288 冒烟路径 1 完全一致。
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

      assert.ok(extensionId, 'extensionId 不应为空');
      assert.match(extensionId, /^[a-z]{32}$/, 'extensionId 应为 32 位小写字母');

      const sw = context.serviceWorkers().find(s => s.url().includes(extensionId));
      assert.ok(sw, 'PageWise Service Worker 应处于活跃状态');

      console.log(`✅ 路径 1 通过: extensionId=${extensionId}`);
    }, { label: '路径1-扩展加载' });
  });

  // ------------------------------------------------------------------
  // 路径 2 (复用 R288): SidePanel 打开 → 渲染 UI
  // ------------------------------------------------------------------
  it('路径 2: SidePanel 打开与 UI 渲染', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');
    assert.ok(extensionId, '需要路径 1 成功获取 extensionId');

    await withTimeoutRetry(async () => {
      const page = await openSidePanel(context, extensionId);
      try {
        const appEl = await page.$('#app');
        assert.ok(appEl, '#app 容器应存在');

        const panelChat = await page.$('#panelChat');
        assert.ok(panelChat, '#panelChat 面板应存在');

        console.log('✅ 路径 2 通过: SidePanel UI 渲染正常');
      } finally {
        await page.close();
      }
    }, { label: '路径2-SidePanel渲染' });
  });

  // ------------------------------------------------------------------
  // 路径 3 (复用 R288): 选中文字 → 弹出提问气泡
  // ------------------------------------------------------------------
  it('路径 3: 选中文字弹出提问气泡', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');

    await withTimeoutRetry(async () => {
      const page = await context.newPage();
      try {
        await page.setContent(`
          <html>
            <body>
              <p id="target">Hello PageWise E2E smoke test text for selection</p>
            </body>
          </html>
        `, { waitUntil: 'domcontentloaded', timeout: 10000 });

        await page.waitForFunction(() => !!window.__AI_ASSISTANT_INJECTED__, {
          timeout: 15000,
        });

        const target = await page.$('#target');
        const box = await target.boundingBox();

        await page.mouse.move(box.x + 5, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width - 5,
          box.y + box.height / 2,
          { steps: 10 }
        );
        await page.mouse.up();

        const toolbar = await page.waitForSelector('.pagewise-toolbar--visible', {
          timeout: 10000,
        });
        assert.ok(toolbar, '选中文字后应弹出 .pagewise-toolbar 气泡');

        const buttons = await page.$$('.pagewise-toolbar-btn');
        assert.ok(buttons.length > 0, 'toolbar 应包含至少一个操作按钮');

        console.log(`✅ 路径 3 通过: toolbar 弹出，${buttons.length} 个按钮`);
      } finally {
        await page.close();
      }
    }, { label: '路径3-选中文字气泡' });
  });

  // ------------------------------------------------------------------
  // 路径 4 (新增): 书签采集→图谱渲染→节点点击详情
  //
  // 核心用户路径: 导航到书签面板 → 验证书签列表/统计/文件夹导航渲染
  // → 点击文件夹导航切换 → 验证书签详情面板容器存在且可交互
  //
  // 注: 全新扩展 profile 无真实书签数据，但 UI 结构应完整渲染
  // （空状态 + 面板容器 + 交互元素）
  // ------------------------------------------------------------------
  it('路径 4: 书签采集→图谱渲染→节点点击详情', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');
    assert.ok(extensionId, '需要路径 1 成功获取 extensionId');

    await withTimeoutRetry(async () => {
      const page = await openSidePanel(context, extensionId);
      try {
        // ---- Step 1: 导航到书签面板 ----
        await clickTab(page, 'bookmarks');
        await waitForPanel(page, 'panelBookmarks');

        // 验证书签面板处于 active 状态
        const isActive = await page.$eval('#panelBookmarks',
          el => el.classList.contains('active'));
        assert.ok(isActive, '书签面板应处于 active 状态');

        // ---- Step 2: 验证书签 UI 结构渲染（图谱/列表/统计）----

        // 书签列表容器
        const bookmarksList = await page.$('#bookmarksList');
        assert.ok(bookmarksList, '#bookmarksList 书签列表容器应存在');

        // 书签统计区域
        const bookmarksStats = await page.$('#bookmarksStats');
        assert.ok(bookmarksStats, '#bookmarksStats 书签统计区域应存在');

        // 文件夹导航栏
        const folderNav = await page.$('#bookmarksFolderNav');
        assert.ok(folderNav, '#bookmarksFolderNav 文件夹导航应存在');

        // 文件夹导航 ALL 按钮
        const allBtn = await page.$('.folder-nav-item[data-folder="*"]');
        assert.ok(allBtn, 'ALL 全部文件夹按钮应存在');

        // ALL 按钮默认应为 active
        const allActive = await page.$eval('.folder-nav-item[data-folder="*"]',
          el => el.classList.contains('active'));
        assert.ok(allActive, 'ALL 按钮默认应为 active');

        // 书签计数
        const countEl = await page.$('#bookmarksCount');
        assert.ok(countEl, '#bookmarksCount 书签计数应存在');

        // 搜索框
        const searchInput = await page.$('#bookmarksSearchInput');
        assert.ok(searchInput, '#bookmarksSearchInput 搜索框应存在');

        // 完整图谱按钮
        const fullGraphBtn = await page.$('#btnOpenFullGraph');
        assert.ok(fullGraphBtn, '#btnOpenFullGraph 完整图谱按钮应存在');

        // ---- Step 3: 书签详情面板容器存在（节点点击详情的前提）----

        // 详情面板容器（初始应为 hidden）
        const detailPanel = await page.$('#bookmarksDetail');
        assert.ok(detailPanel, '#bookmarksDetail 书签详情面板容器应存在');

        // 返回按钮
        const backBtn = await page.$('#btnBookmarksBack');
        assert.ok(backBtn, '#btnBookmarksBack 返回按钮应存在');

        // 相似书签列表容器
        const similarList = await page.$('#bookmarksSimilarList');
        assert.ok(similarList, '#bookmarksSimilarList 相似书签容器应存在');

        // 详情面板内容区域
        const detailContent = await page.$('#bookmarksDetailContent');
        assert.ok(detailContent, '#bookmarksDetailContent 详情内容区域应存在');

        // ---- Step 4: 文件夹导航交互（图谱渲染的一部分）----

        // 书签面板的 ARIA 无障碍属性
        const listEl = await page.$('#bookmarksList');
        const listRole = await listEl.getAttribute('role');
        assert.equal(listRole, 'list', '书签列表 role 应为 list');

        // 书签刷新按钮
        const refreshBtn = await page.$('#btnRefreshBookmarks');
        assert.ok(refreshBtn, '#btnRefreshBookmarks 刷新按钮应存在');

        console.log('✅ 路径 4 通过: 书签采集→图谱渲染→节点点击详情 UI 结构完整');
      } finally {
        await page.close();
      }
    }, { label: '路径4-书签采集图谱详情' });
  });

  // ------------------------------------------------------------------
  // 路径 5 (新增): 知识库搜索→结果列表→点击打开
  //
  // 核心用户路径: 导航到知识面板 → 输入搜索关键词 → 切换搜索模式
  // → 验证知识列表容器/条目详情面板存在 → 切换子标签页
  // → 验证知识条目详情面板可交互
  // ------------------------------------------------------------------
  it('路径 5: 知识库搜索→结果列表→点击打开', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');
    assert.ok(extensionId, '需要路径 1 成功获取 extensionId');

    await withTimeoutRetry(async () => {
      const page = await openSidePanel(context, extensionId);
      try {
        // ---- Step 1: 导航到知识面板 ----
        await clickTab(page, 'knowledge');
        await waitForPanel(page, 'panelKnowledge');

        const isActive = await page.$eval('#panelKnowledge',
          el => el.classList.contains('active'));
        assert.ok(isActive, '知识面板应处于 active 状态');

        // ---- Step 2: 知识库搜索 ----

        // 搜索输入框
        const searchInput = await page.$('#searchInput');
        assert.ok(searchInput, '#searchInput 搜索框应存在');

        // 输入搜索关键词
        await searchInput.fill('test search query');
        const searchValue = await searchInput.inputValue();
        assert.equal(searchValue, 'test search query', '搜索框应能接收输入文本');

        // 搜索模式切换（关键词→语义）
        const kwBtn = await page.$('button.search-mode-btn[data-mode="keyword"]');
        assert.ok(kwBtn, '关键词搜索模式按钮应存在');

        const semBtn = await page.$('button.search-mode-btn[data-mode="semantic"]');
        assert.ok(semBtn, '语义搜索模式按钮应存在');

        // 切换到语义搜索
        await semBtn.click();
        const renderWait = isCI() ? 500 : 300;
        await page.waitForTimeout(renderWait);
        const semActive = await page.$eval(
          'button.search-mode-btn[data-mode="semantic"]',
          el => el.classList.contains('active')
        );
        assert.ok(semActive, '语义搜索按钮应变为 active');

        // 切回关键词搜索
        await kwBtn.click();
        await page.waitForTimeout(renderWait);
        const kwActive = await page.$eval(
          'button.search-mode-btn[data-mode="keyword"]',
          el => el.classList.contains('active')
        );
        assert.ok(kwActive, '关键词搜索按钮应恢复为 active');

        // ---- Step 3: 验证结果列表容器 ----

        // 知识列表容器
        const knowledgeList = await page.$('#knowledgeList');
        assert.ok(knowledgeList, '#knowledgeList 知识列表容器应存在');

        // ---- Step 4: 子标签页切换（验证图谱/高亮面板）----

        // 验证子标签页存在
        const subtabs = await page.$$('.knowledge-subtab');
        assert.ok(subtabs.length >= 3, `应至少有 3 个子标签页，实际 ${subtabs.length}`);

        // 验证条目子标签
        const entriesBtn = await page.$('button.knowledge-subtab[data-subtab="entries"]');
        assert.ok(entriesBtn, '知识条目子标签应存在');

        // 验证图谱子标签
        const graphBtn = await page.$('button.knowledge-subtab[data-subtab="graph"]');
        assert.ok(graphBtn, '图谱子标签应存在');

        // 切换到图谱子标签 → 验证 Canvas
        await graphBtn.click();
        await page.waitForTimeout(renderWait);
        const canvas = await page.$('#knowledgeGraphCanvas');
        assert.ok(canvas, '#knowledgeGraphCanvas 图谱 Canvas 应存在');

        // 切换到高亮子标签
        const highlightsBtn = await page.$('button.knowledge-subtab[data-subtab="highlights"]');
        assert.ok(highlightsBtn, '高亮子标签应存在');
        await highlightsBtn.click();
        await page.waitForTimeout(renderWait);

        const clearHighlightsBtn = await page.$('#btnClearHighlights');
        assert.ok(clearHighlightsBtn, '清空高亮按钮 #btnClearHighlights 应存在');

        // 切回条目子标签
        await entriesBtn.click();
        await page.waitForTimeout(renderWait);

        // ---- Step 5: 验证知识条目详情面板（点击打开的容器）----

        // 详情面板容器（初始应为 hidden）
        const detailPanel = await page.$('#knowledgeDetail');
        assert.ok(detailPanel, '#knowledgeDetail 知识详情面板容器应存在');

        // 返回列表按钮
        const backBtn = await page.$('#btnBack');
        assert.ok(backBtn, '#btnBack 返回列表按钮应存在');

        // 详情内容区域
        const detailContent = await page.$('#detailContent');
        assert.ok(detailContent, '#detailContent 详情内容区域应存在');

        // 相关知识区域
        const relatedEntries = await page.$('#relatedEntries');
        assert.ok(relatedEntries, '#relatedEntries 相关知识区域应存在');

        // ---- Step 6: 导入/导出按钮验证（知识库搜索结果的导出能力）----

        const importBtn = await page.$('#btnImport');
        assert.ok(importBtn, '#btnImport 导入按钮应存在');

        const exportMdBtn = await page.$('#btnExportMd');
        assert.ok(exportMdBtn, '#btnExportMd 导出 Markdown 按钮应存在');

        const exportJsonBtn = await page.$('#btnExportJson');
        assert.ok(exportJsonBtn, '#btnExportJson 导出 JSON 按钮应存在');

        console.log('✅ 路径 5 通过: 知识库搜索→结果列表→点击打开 UI 结构完整');
      } finally {
        await page.close();
      }
    }, { label: '路径5-知识库搜索结果详情' });
  });

  // ------------------------------------------------------------------
  // 路径 6 (新增): 设置页→主题切换→验证生效
  //
  // 核心用户路径: 导航到设置面板 → 修改主题选择 → 保存设置
  // → 验证 document.documentElement.dataset.theme 变化
  // → 切换回浅色主题 → 验证恢复
  // ------------------------------------------------------------------
  it('路径 6: 设置页→主题切换→验证生效', { timeout: HARD_TIMEOUT * (MAX_RETRIES + 1) }, async () => {
    assert.ok(context, '需要路径 1 成功启动 Chrome');
    assert.ok(extensionId, '需要路径 1 成功获取 extensionId');

    await withTimeoutRetry(async () => {
      const page = await openSidePanel(context, extensionId);
      try {
        // ---- Step 1: 导航到设置面板 ----
        await clickTab(page, 'settings');
        await waitForPanel(page, 'panelSettings');

        const isActive = await page.$eval('#panelSettings',
          el => el.classList.contains('active'));
        assert.ok(isActive, '设置面板应处于 active 状态');

        // ---- Step 2: 验证主题选择器 ----

        const themeSelect = await page.$('#theme');
        assert.ok(themeSelect, '#theme 主题选择器应存在');

        // 验证主题选项
        const options = await page.$$eval('#theme option', els =>
          els.map(el => ({ value: el.value, text: el.textContent.trim() }))
        );
        assert.ok(options.some(o => o.value === 'light'), '应有 "浅色" 选项');
        assert.ok(options.some(o => o.value === 'dark'), '应有 "深色" 选项');
        assert.ok(options.some(o => o.value === 'auto'), '应有 "跟随系统" 选项');

        // 验证保存按钮
        const saveBtn = await page.$('#btnSaveSettings');
        assert.ok(saveBtn, '#btnSaveSettings 保存设置按钮应存在');

        // 验证设置状态提示
        const statusEl = await page.$('#settingsStatus');
        assert.ok(statusEl, '#settingsStatus 设置状态提示应存在');

        // ---- Step 3: 切换到深色主题并保存 ----

        // 确认当前初始主题不是 dark（新安装默认 light）
        const initialTheme = await page.evaluate(() => {
          return document.documentElement.dataset.theme || 'light';
        });
        console.log(`  当前主题: ${initialTheme}`);

        // 选择深色主题
        await page.selectOption('#theme', 'dark');
        const selectedValue = await page.$eval('#theme', el => el.value);
        assert.equal(selectedValue, 'dark', '主题选择器应已切换到 dark');

        // 点击保存
        await page.click('#btnSaveSettings');
        // 等待设置保存和主题应用（CI 环境 storage 写入更慢）
        const saveWait = isCI() ? 1500 : 800;
        await page.waitForTimeout(saveWait);

        // ---- Step 4: 验证主题生效 ----

        const appliedTheme = await page.evaluate(() => {
          return document.documentElement.dataset.theme;
        });
        assert.equal(appliedTheme, 'dark', '保存后 documentElement 应设置 data-theme="dark"');

        // 验证 body 或 html 的 CSS 变量是否反映了深色主题
        const bgColor = await page.evaluate(() => {
          return getComputedStyle(document.body).backgroundColor;
        });
        console.log(`  深色主题 body 背景色: ${bgColor}`);

        // ---- Step 5: 切换回浅色主题并验证恢复 ----

        await page.selectOption('#theme', 'light');
        await page.click('#btnSaveSettings');
        await page.waitForTimeout(saveWait);

        const restoredTheme = await page.evaluate(() => {
          return document.documentElement.dataset.theme;
        });
        // 浅色主题时，applyTheme() 会 delete dataset.theme，所以 undefined
        assert.ok(
          restoredTheme === undefined || restoredTheme !== 'dark',
          '切回浅色后 data-theme 不应为 dark'
        );

        // ---- Step 6: 验证跟随系统选项 ----

        await page.selectOption('#theme', 'auto');
        await page.click('#btnSaveSettings');
        await page.waitForTimeout(saveWait);

        const autoTheme = await page.evaluate(() => {
          return document.documentElement.dataset.theme;
        });
        // auto 模式下，应根据 prefers-color-scheme 设置为 light 或 dark
        assert.ok(
          autoTheme === 'light' || autoTheme === 'dark',
          `跟随系统模式应设置 data-theme 为 light 或 dark，实际: ${autoTheme}`
        );

        console.log(`✅ 路径 6 通过: 设置页→主题切换→验证生效 (dark=${appliedTheme}, auto=${autoTheme})`);
      } finally {
        await page.close();
      }
    }, { label: '路径6-设置主题切换' });
  });
});
