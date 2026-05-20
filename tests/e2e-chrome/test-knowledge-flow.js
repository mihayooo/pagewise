/**
 * R211 — E2E Chrome: 知识库流程验证
 *
 * 验证：知识库面板渲染 → 搜索功能 → 条目交互
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchChromeWithExtension,
  openSidePanel,
  clickTab,
  waitForPanel,
  cleanProfileDir,
} from './helpers.js';

let context, extensionId, cleanup;

describe('E2E Chrome: 知识库流程', () => {

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

  it('知识面板应包含搜索输入框', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      const searchInput = await page.$('#searchInput');
      assert.ok(searchInput, '#searchInput 搜索框应存在');

      const placeholder = await searchInput.getAttribute('placeholder');
      assert.ok(placeholder && placeholder.length > 0, '搜索框应有 placeholder');
    } finally {
      await page.close();
    }
  });

  it('知识面板应包含子标签页（条目/高亮/图谱/学习路径）', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      const subtabs = await page.$$('.knowledge-subtab');
      assert.ok(subtabs.length >= 3, `应至少有 3 个子标签页，实际 ${subtabs.length}`);

      // 验证 entries 子标签
      const entriesBtn = await page.$('button.knowledge-subtab[data-subtab="entries"]');
      assert.ok(entriesBtn, '知识条目子标签应存在');

      // 验证 graph 子标签
      const graphBtn = await page.$('button.knowledge-subtab[data-subtab="graph"]');
      assert.ok(graphBtn, '图谱子标签应存在');
    } finally {
      await page.close();
    }
  });

  it('知识面板应包含导入/导出按钮', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      const importBtn = await page.$('#btnImport');
      assert.ok(importBtn, '导入按钮 #btnImport 应存在');

      const exportMdBtn = await page.$('#btnExportMd');
      assert.ok(exportMdBtn, '导出 Markdown 按钮 #btnExportMd 应存在');

      const exportJsonBtn = await page.$('#btnExportJson');
      assert.ok(exportJsonBtn, '导出 JSON 按钮 #btnExportJson 应存在');
    } finally {
      await page.close();
    }
  });

  it('搜索模式切换（关键词/语义）', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      // 验证搜索模式按钮
      const kwBtn = await page.$('button.search-mode-btn[data-mode="keyword"]');
      assert.ok(kwBtn, '关键词搜索模式按钮应存在');

      const semBtn = await page.$('button.search-mode-btn[data-mode="semantic"]');
      assert.ok(semBtn, '语义搜索模式按钮应存在');

      // 切换到语义搜索
      await semBtn.click();
      await page.waitForTimeout(200);
      const semActive = await page.$eval('button.search-mode-btn[data-mode="semantic"]',
        el => el.classList.contains('active'));
      assert.ok(semActive, '语义搜索按钮应变为 active');
    } finally {
      await page.close();
    }
  });

  it('图谱面板应包含 Canvas 元素', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      // 切换到图谱子标签
      await page.click('button.knowledge-subtab[data-subtab="graph"]');
      await page.waitForTimeout(300);

      const canvas = await page.$('#knowledgeGraphCanvas');
      assert.ok(canvas, '图谱 Canvas #knowledgeGraphCanvas 应存在');

      // 验证图谱工具栏
      const graphSearch = await page.$('#graphSearchInput');
      assert.ok(graphSearch, '图谱搜索框 #graphSearchInput 应存在');
    } finally {
      await page.close();
    }
  });

  it('高亮面板应包含清空按钮', async () => {
    const page = await openSidePanel(context, extensionId);
    try {
      await clickTab(page, 'knowledge');
      await waitForPanel(page, 'panelKnowledge');

      // 切换到高亮子标签
      await page.click('button.knowledge-subtab[data-subtab="highlights"]');
      await page.waitForTimeout(300);

      const clearBtn = await page.$('#btnClearHighlights');
      assert.ok(clearBtn, '清空高亮按钮 #btnClearHighlights 应存在');
    } finally {
      await page.close();
    }
  });
});
