/**
 * R211 — E2E Chrome: 核心侧边栏流程验证
 *
 * 验证：扩展加载 → SidePanel 打开 → 标签切换 → 输入框交互 → 面板渲染
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
  typeAndSend,
  cleanProfileDir,
} from './helpers.js';

let context, extensionId, cleanup;

describe('E2E Chrome: SidePanel 核心流程', () => {

  before(async () => {
    cleanProfileDir();
    const result = await launchChromeWithExtension({ headless: true });
    context = result.context;
    extensionId = result.extensionId;
    cleanup = result.cleanup;
    assert.ok(extensionId, '扩展应成功加载并获取 extensionId');
  });

  after(async () => {
    if (cleanup) await cleanup();
    cleanProfileDir();
  });

  it('扩展加载后应获取有效 extensionId', () => {
    assert.ok(extensionId, 'extensionId 不应为空');
    assert.match(extensionId, /^[a-z]{32}$/, 'extensionId 应为 32 位小写字母');
  });

  it('SidePanel 页面应可正常打开', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      // 验证 #app 容器存在
      const appEl = await page.$('#app');
      assert.ok(appEl, '#app 容器应存在');

      // 验证标题
      const title = await page.title();
      assert.ok(title.includes('PageWise') || title.includes('智阅') || title.length > 0,
        `页面标题应有效，实际: "${title}"`);
    } finally {
      await page.close();
    }
  });

  it('SidePanel 首屏渲染应 < 3000ms', async () => {
    const renderTime = await measurePerformance(async () => {
      const page = await openSidePanel(context, extensionId);
      // 等待面板完全渲染
      await page.waitForSelector('#panelChat.active', { timeout: 5000 });
      await page.close();
    });
    assertWithinBudget(renderTime, 3000, 'SidePanel 首屏渲染');
  });

  it('应包含所有主要标签页按钮', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const tabs = ['chat', 'skills', 'knowledge', 'wiki', 'page', 'settings', 'bookmarks', 'logs'];
      for (const tab of tabs) {
        const btn = await page.$(`button.tab[data-tab="${tab}"]`);
        assert.ok(btn, `标签页 "${tab}" 按钮应存在`);
      }
    } finally {
      await page.close();
    }
  });

  it('应能切换到知识面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      const isActive = await page.$eval('#panelKnowledge', el => el.classList.contains('active'));
      assert.ok(isActive, '知识面板应处于 active 状态');

      const chatActive = await page.$eval('#panelChat', el => el.classList.contains('active'));
      assert.ok(!chatActive, '问答面板应不再 active');
    } finally {
      await page.close();
    }
  });

  it('应能切换到设置面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'settings');
      await waitForPanel(page, 'panelSettings');

      const isActive = await page.$eval('#panelSettings', el => el.classList.contains('active'));
      assert.ok(isActive, '设置面板应处于 active 状态');

      // 验证设置面板中包含保存按钮
      const saveBtn = await page.$('#btnSaveSettings');
      assert.ok(saveBtn, '保存设置按钮应存在');
    } finally {
      await page.close();
    }
  });

  it('应能切换到书签面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      const isActive = await page.$eval('#panelBookmarks', el => el.classList.contains('active'));
      assert.ok(isActive, '书签面板应处于 active 状态');

      // 验证书签面板关键元素
      const searchInput = await page.$('#bookmarksSearchInput');
      assert.ok(searchInput, '书签搜索框应存在');
    } finally {
      await page.close();
    }
  });

  it('问答面板应包含输入框和发送按钮', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      const input = await page.$('#userInput');
      assert.ok(input, '用户输入框 #userInput 应存在');

      const sendBtn = await page.$('#btnSend');
      assert.ok(sendBtn, '发送按钮 #btnSend 应存在');

      // 验证输入框可交互
      await input.fill('测试输入');
      const value = await input.inputValue();
      assert.equal(value, '测试输入', '输入框应能接收文本');
    } finally {
      await page.close();
    }
  });

  it('应能切换到技能面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'skills');
      await waitForPanel(page, 'panelSkills');

      const isActive = await page.$eval('#panelSkills', el => el.classList.contains('active'));
      assert.ok(isActive, '技能面板应处于 active 状态');
    } finally {
      await page.close();
    }
  });

  it('应能切换到 Wiki 面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'wiki');
      await waitForPanel(page, 'panelWiki');

      const isActive = await page.$eval('#panelWiki', el => el.classList.contains('active'));
      assert.ok(isActive, 'Wiki 面板应处于 active 状态');
    } finally {
      await page.close();
    }
  });

  it('应能切换到日志面板', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'logs');
      await waitForPanel(page, 'panelLogs');

      const isActive = await page.$eval('#panelLogs', el => el.classList.contains('active'));
      assert.ok(isActive, '日志面板应处于 active 状态');
    } finally {
      await page.close();
    }
  });
});
