/**
 * R211 — E2E Chrome: 书签流程验证
 *
 * 验证：书签面板渲染 → 搜索 → 详情面板 → 标签编辑
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

describe('E2E Chrome: 书签流程', () => {

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

  it('书签面板应包含所有关键 UI 元素', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      // 搜索框
      const searchInput = await page.$('#bookmarksSearchInput');
      assert.ok(searchInput, '书签搜索框 #bookmarksSearchInput 应存在');

      // 刷新按钮
      const refreshBtn = await page.$('#btnRefreshBookmarks');
      assert.ok(refreshBtn, '刷新按钮 #btnRefreshBookmarks 应存在');

      // 完整图谱按钮
      const fullGraphBtn = await page.$('#btnOpenFullGraph');
      assert.ok(fullGraphBtn, '完整图谱按钮 #btnOpenFullGraph 应存在');

      // 书签计数
      const countEl = await page.$('#bookmarksCount');
      assert.ok(countEl, '书签计数 #bookmarksCount 应存在');

      // 文件夹导航
      const folderNav = await page.$('#bookmarksFolderNav');
      assert.ok(folderNav, '文件夹导航 #bookmarksFolderNav 应存在');

      // 统计概览
      const statsEl = await page.$('#bookmarksStats');
      assert.ok(statsEl, '统计概览 #bookmarksStats 应存在');
    } finally {
      await page.close();
    }
  });

  it('书签面板应包含详情面板容器', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      // 详情面板
      const detailPanel = await page.$('#bookmarksDetail');
      assert.ok(detailPanel, '书签详情面板 #bookmarksDetail 应存在');

      // 相似书签列表
      const similarList = await page.$('#bookmarksSimilarList');
      assert.ok(similarList, '相似书签列表 #bookmarksSimilarList 应存在');

      // 返回按钮
      const backBtn = await page.$('#btnBookmarksBack');
      assert.ok(backBtn, '返回按钮 #btnBookmarksBack 应存在');
    } finally {
      await page.close();
    }
  });

  it('书签搜索框应能接收输入', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      const searchInput = await page.$('#bookmarksSearchInput');
      await searchInput.fill('test query');
      const value = await searchInput.inputValue();
      assert.equal(value, 'test query', '搜索框应能接收输入文本');
    } finally {
      await page.close();
    }
  });

  it('文件夹导航应包含 ALL 全部按钮', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      const allBtn = await page.$('.folder-nav-item[data-folder="*"]');
      assert.ok(allBtn, 'ALL 全部文件夹按钮应存在');

      const isActive = await page.$eval('.folder-nav-item[data-folder="*"]',
        el => el.classList.contains('active'));
      assert.ok(isActive, 'ALL 按钮默认应为 active');
    } finally {
      await page.close();
    }
  });

  it('书签面板应具有无障碍 Live Region', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      const liveRegion = await page.$('#bookmarksLiveRegion');
      assert.ok(liveRegion, '无障碍 Live Region #bookmarksLiveRegion 应存在');

      const ariaLive = await liveRegion.getAttribute('aria-live');
      assert.equal(ariaLive, 'polite', 'aria-live 应为 polite');

      const role = await liveRegion.getAttribute('role');
      assert.equal(role, 'status', 'role 应为 status');
    } finally {
      await page.close();
    }
  });

  it('书签面板容器应有正确的 ARIA 属性', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');

      // 书签列表 role
      const listEl = await page.$('#bookmarksList');
      assert.ok(listEl, '书签列表 #bookmarksList 应存在');
      const listRole = await listEl.getAttribute('role');
      assert.equal(listRole, 'list', '书签列表 role 应为 list');

      // 搜索 role
      const searchBox = await page.$('.bookmarks-search-box');
      assert.ok(searchBox, '搜索框容器应存在');
      const searchRole = await searchBox.getAttribute('role');
      assert.equal(searchRole, 'search', '搜索框容器 role 应为 search');
    } finally {
      await page.close();
    }
  });

  it('书签面板渲染耗时应在合理范围内', async () => {
    const renderTime = await measurePerformance(async () => {
      const page = await openSidePanel(context, extensionId);
      await clickTab(page, 'bookmarks');
      await waitForPanel(page, 'panelBookmarks');
      await page.close();
    });
    assertWithinBudget(renderTime, 5000, '书签面板完整渲染');
  });
});
