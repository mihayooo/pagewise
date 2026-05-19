/**
 * 测试 R125: 超大模块拆分收尾 ModuleSplitFinish
 *
 * 验证:
 *   1. 拆分后所有文件 ≤400 行
 *   2. API 向后兼容（所有原有导出仍可用）
 *   3. 拆分模块的功能正确性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(__dirname, '../lib');

function countLines(file) {
  const content = readFileSync(resolve(libDir, file), 'utf-8');
  return content.split('\n').length;
}

// ==================== 文件行数检查 ====================

describe('R125 — 文件行数 ≤ 400', () => {
  const files = [
    'bookmark-organize.js',
    'auto-classifier.js',
    'stats.js',
    'bookmark-clusterer.js',
    'bookmark-folder-analyzer.js',
    'auto-classifier-store.js',
    'stats-cost.js',
    'bookmark-folder-suggestions.js',
  ];

  for (const file of files) {
    it(`${file} 应 ≤ 400 行`, () => {
      const lines = countLines(file);
      assert.ok(lines <= 400, `${file} 有 ${lines} 行，超过 400 行限制`);
    });
  }
});

// ==================== bookmark-organize.js 向后兼容 ====================

describe('R125 — bookmark-organize.js 向后兼容 re-export', () => {
  it('应导出 BookmarkClusterer', async () => {
    const { BookmarkClusterer } = await import('../lib/bookmark-organize.js');
    assert.ok(typeof BookmarkClusterer === 'function', 'BookmarkClusterer 应是构造函数');
  });

  it('应导出 BookmarkFolderAnalyzer', async () => {
    const { BookmarkFolderAnalyzer } = await import('../lib/bookmark-organize.js');
    assert.ok(typeof BookmarkFolderAnalyzer === 'function', 'BookmarkFolderAnalyzer 应是构造函数');
  });

  it('应导出 BookmarkDedup', async () => {
    const { BookmarkDedup } = await import('../lib/bookmark-organize.js');
    assert.ok(typeof BookmarkDedup === 'function', 'BookmarkDedup 应是构造函数');
  });

  it('应导出 BookmarkTagEditor', async () => {
    const { BookmarkTagEditor } = await import('../lib/bookmark-organize.js');
    assert.ok(typeof BookmarkTagEditor === 'function', 'BookmarkTagEditor 应是构造函数');
  });

  it('应导出 QUALITY_THRESHOLDS', async () => {
    const { QUALITY_THRESHOLDS } = await import('../lib/bookmark-organize.js');
    assert.ok(QUALITY_THRESHOLDS, 'QUALITY_THRESHOLDS 应存在');
    assert.ok(typeof QUALITY_THRESHOLDS.EXCELLENT_MIN === 'number');
  });

  it('BookmarkClusterer 可正常实例化', async () => {
    const { BookmarkClusterer } = await import('../lib/bookmark-organize.js');
    const c = new BookmarkClusterer([
      { id: '1', title: 'React 教程', url: 'https://react.dev' },
    ]);
    assert.ok(c.cluster() instanceof Map);
  });

  it('BookmarkFolderAnalyzer 可正常实例化', async () => {
    const { BookmarkFolderAnalyzer } = await import('../lib/bookmark-organize.js');
    const a = new BookmarkFolderAnalyzer([
      { id: '1', title: 'test', url: 'https://example.com', folderPath: ['A'] },
    ]);
    assert.ok(Array.isArray(a.analyzeFolders()));
  });

  it('BookmarkDedup 可正常实例化', async () => {
    const { BookmarkDedup } = await import('../lib/bookmark-organize.js');
    const d = new BookmarkDedup([
      { id: '1', title: 'test', url: 'https://example.com' },
    ]);
    assert.ok(Array.isArray(d.findDuplicates()));
  });
});

// ==================== auto-classifier-store.js 独立导出 ====================

describe('R125 — auto-classifier-store.js', () => {
  it('应导出 AutoClassifierStore', async () => {
    const { AutoClassifierStore } = await import('../lib/auto-classifier-store.js');
    assert.ok(typeof AutoClassifierStore === 'function');
  });

  it('应导出 CLASSIFICATION_STATUS', async () => {
    const { CLASSIFICATION_STATUS } = await import('../lib/auto-classifier-store.js');
    assert.ok(CLASSIFICATION_STATUS.UNCLASSIFIED);
    assert.ok(CLASSIFICATION_STATUS.CLASSIFIED);
  });
});

// ==================== auto-classifier.js 向后兼容 ====================

describe('R125 — auto-classifier.js 向后兼容', () => {
  it('应导出 AutoClassifier', async () => {
    const { AutoClassifier } = await import('../lib/auto-classifier.js');
    assert.ok(typeof AutoClassifier === 'function');
  });

  it('应导出 CLASSIFICATION_STATUS', async () => {
    const { CLASSIFICATION_STATUS } = await import('../lib/auto-classifier.js');
    assert.ok(CLASSIFICATION_STATUS.UNCLASSIFIED);
  });

  it('AutoClassifier 保留分类提示词构建', async () => {
    const { AutoClassifier } = await import('../lib/auto-classifier.js');
    const c = new AutoClassifier({ chat: async () => ({}) });
    const prompt = c._buildClassificationPrompt({
      title: 'Test', question: 'What is X?', answer: 'X is Y',
    });
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.includes('Test'));
  });

  it('AutoClassifier 保留响应解析', async () => {
    const { AutoClassifier } = await import('../lib/auto-classifier.js');
    const c = new AutoClassifier({ chat: async () => ({}) });
    const result = c._parseClassificationResponse(JSON.stringify({
      entities: [{ name: 'Docker', type: 'tool', description: '容器平台' }],
      concepts: [{ name: '容器化', description: '打包技术' }],
    }));
    assert.equal(result.entities.length, 1);
    assert.equal(result.concepts.length, 1);
  });
});

// ==================== stats-cost.js 独立导出 ====================

describe('R125 — stats-cost.js', () => {
  it('应导出费用估算函数', async () => {
    const mod = await import('../lib/stats-cost.js');
    assert.ok(typeof mod.estimateCostCents === 'function');
    assert.ok(typeof mod.estimateInputCostCents === 'function');
    assert.ok(typeof mod.findPricing === 'function');
    assert.ok(typeof mod.PRICING === 'object');
  });

  it('estimateCostCents 正确计算 GPT-4o 费用', async () => {
    const { estimateCostCents } = await import('../lib/stats-cost.js');
    // gpt-4o: input $2.50/M, output $10.00/M
    // 1M input + 1M output = $12.50 = 1250 cents
    const cost = estimateCostCents('gpt-4o', 1_000_000, 1_000_000);
    assert.equal(cost, 1250);
  });

  it('estimateInputCostCents 正确计算', async () => {
    const { estimateInputCostCents } = await import('../lib/stats-cost.js');
    const cost = estimateInputCostCents('gpt-4o', 1_000_000);
    assert.equal(cost, 250);
  });
});

// ==================== stats.js 向后兼容 ====================

describe('R125 — stats.js 向后兼容', () => {
  it('应导出 _createStatsModule', async () => {
    const { _createStatsModule } = await import('../lib/stats.js');
    assert.ok(typeof _createStatsModule === 'function');
  });

  it('应导出纯函数', async () => {
    const mod = await import('../lib/stats.js');
    assert.ok(typeof mod.calculateStreak === 'function');
    assert.ok(typeof mod.getTopTags === 'function');
    assert.ok(typeof mod.getWordFrequencies === 'function');
    assert.ok(typeof mod.getWeeklyGrowth === 'function');
  });

  it('应导出费用相关函数', async () => {
    const mod = await import('../lib/stats.js');
    assert.ok(typeof mod.recordCost === 'function');
    assert.ok(typeof mod.recordCacheSaving === 'function');
    assert.ok(typeof mod.setBudget === 'function');
    assert.ok(typeof mod.getCostSummary === 'function');
    assert.ok(typeof mod.getCostTrend === 'function');
  });

  it('应导出测试辅助函数', async () => {
    const mod = await import('../lib/stats.js');
    assert.ok(typeof mod._setTestStorage === 'function');
    assert.ok(typeof mod._getChromeRef === 'function');
  });
});

// ==================== bookmark-clusterer.js 导出 BUILTIN_CATEGORIES ====================

describe('R125 — bookmark-clusterer.js 导出 BUILTIN_CATEGORIES', () => {
  it('应导出 BUILTIN_CATEGORIES', async () => {
    const { BUILTIN_CATEGORIES } = await import('../lib/bookmark-clusterer.js');
    assert.ok(Array.isArray(BUILTIN_CATEGORIES));
    assert.ok(BUILTIN_CATEGORIES.length > 10, '应有 10+ 分类');
  });

  it('BUILTIN_CATEGORIES 每项有 name/keywords/domains', async () => {
    const { BUILTIN_CATEGORIES } = await import('../lib/bookmark-clusterer.js');
    for (const cat of BUILTIN_CATEGORIES) {
      assert.ok(typeof cat.name === 'string');
      assert.ok(Array.isArray(cat.keywords));
      assert.ok(Array.isArray(cat.domains));
    }
  });
});

// ==================== bookmark-folder-suggestions.js ====================

describe('R125 — bookmark-folder-suggestions.js', () => {
  it('应导出 suggestOrganization', async () => {
    const { suggestOrganization } = await import('../lib/bookmark-folder-suggestions.js');
    assert.ok(typeof suggestOrganization === 'function');
  });

  it('应导出 exportFolderTree', async () => {
    const { exportFolderTree } = await import('../lib/bookmark-folder-suggestions.js');
    assert.ok(typeof exportFolderTree === 'function');
  });
});
