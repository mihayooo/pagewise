/**
 * 测试 lib/cost-estimator.js — API 费用估算
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  USD_TO_CNY,
  MODEL_PRICING,
  findClosestModel,
  getModelPricing,
  getAllModelPricing,
  estimateCost,
  estimateMessagesCost,
  estimateSavingsFromCache,
  formatCost,
  formatCostCNY,
  usdToCents,
  centsToUsd,
} from '../lib/cost-estimator.js';

// ==================== findClosestModel ====================

describe('findClosestModel', () => {
  it('精确匹配', () => {
    assert.equal(findClosestModel('gpt-4o'), 'gpt-4o');
    assert.equal(findClosestModel('claude-sonnet-4-6'), 'claude-sonnet-4-6');
  });

  it('大小写不敏感', () => {
    assert.equal(findClosestModel('GPT-4O'), 'gpt-4o');
  });

  it('前缀匹配 (日期后缀)', () => {
    assert.equal(findClosestModel('gpt-4o-2024-08-06'), 'gpt-4o');
  });

  it('子串匹配', () => {
    assert.equal(findClosestModel('my-gpt-4o-custom'), 'gpt-4o');
  });

  it('未知模型返回 null', () => {
    assert.equal(findClosestModel('unknown-model-xyz'), null);
  });

  it('null/空字符串返回 null', () => {
    assert.equal(findClosestModel(null), null);
    assert.equal(findClosestModel(''), null);
    assert.equal(findClosestModel(undefined), null);
  });

  it('非字符串返回 null', () => {
    assert.equal(findClosestModel(123), null);
  });

  it('Ollama 模型匹配', () => {
    assert.equal(findClosestModel('llama3'), 'llama3');
  });
});

// ==================== getModelPricing ====================

describe('getModelPricing', () => {
  it('已知模型返回正确价格', () => {
    const p = getModelPricing('gpt-4o');
    assert.equal(p.input, 2.50);
    assert.equal(p.output, 10.00);
    assert.equal(p.family, 'openai');
    assert.equal(p.modelName, 'gpt-4o');
  });

  it('未知模型返回默认价格', () => {
    const p = getModelPricing('unknown-model');
    assert.equal(p.input, 3.00);
    assert.equal(p.output, 15.00);
    assert.equal(p.family, 'unknown');
    assert.equal(p.modelName, 'unknown-model');
  });

  it('null 返回默认价格', () => {
    const p = getModelPricing(null);
    assert.equal(p.modelName, 'unknown');
  });
});

// ==================== getAllModelPricing ====================

describe('getAllModelPricing', () => {
  it('返回数组', () => {
    const all = getAllModelPricing();
    assert.ok(Array.isArray(all));
    assert.ok(all.length > 0);
  });

  '按 input 价格升序排列',
  () => {
    const all = getAllModelPricing();
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i].input >= all[i - 1].input);
    }
  };

  it('每项包含 model, input, output, family', () => {
    const all = getAllModelPricing();
    for (const item of all) {
      assert.ok(item.model);
      assert.equal(typeof item.input, 'number');
      assert.equal(typeof item.output, 'number');
      assert.ok(item.family);
    }
  });
});

// ==================== estimateCost ====================

describe('estimateCost', () => {
  it('计算已知模型费用', () => {
    const cost = estimateCost('gpt-4o', 1_000_000, 1_000_000);
    assert.equal(cost.inputUsd, 2.50);
    assert.equal(cost.outputUsd, 10.00);
    assert.equal(cost.usd, 12.50);
    assert.equal(cost.cny, 12.50 * USD_TO_CNY);
  });

  it('0 tokens 费用为 0', () => {
    const cost = estimateCost('gpt-4o', 0, 0);
    assert.equal(cost.usd, 0);
  });

  it('null tokens 当作 0', () => {
    const cost = estimateCost('gpt-4o', null, null);
    assert.equal(cost.usd, 0);
  });

  it('Ollama 模型免费', () => {
    const cost = estimateCost('llama3', 1_000_000, 1_000_000);
    assert.equal(cost.usd, 0);
  });
});

// ==================== estimateMessagesCost ====================

describe('estimateMessagesCost', () => {
  it('估算消息数组费用', () => {
    const messages = [
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am fine, thanks!' },
    ];
    const cost = estimateMessagesCost('gpt-4o', messages, 1000);
    assert.ok(cost.inputTokens > 0);
    assert.equal(cost.outputTokens, 1000);
    assert.ok(cost.total > 0);
  });

  it('空消息数组', () => {
    const cost = estimateMessagesCost('gpt-4o', [], 100);
    assert.ok(cost.inputTokens > 0); // 系统 prompt 开销
    assert.equal(cost.outputTokens, 100);
  });

  it('null messages', () => {
    const cost = estimateMessagesCost('gpt-4o', null, 100);
    assert.ok(cost.inputTokens > 0);
  });

  it('默认 maxTokens 4096', () => {
    const cost = estimateMessagesCost('gpt-4o', []);
    assert.equal(cost.outputTokens, 4096);
  });
});

// ==================== estimateSavingsFromCache ====================

describe('estimateSavingsFromCache', () => {
  it('无命中次数节省为 0', () => {
    const s = estimateSavingsFromCache('gpt-4o', 1000, 1);
    assert.equal(s.usd, 0);
  });

  it('命中 5 次有节省', () => {
    const s = estimateSavingsFromCache('gpt-4o', 1_000_000, 5);
    assert.equal(s.usd, 4 * 2.50); // (5-1) * 1M tokens * $2.50/1M
  });

  it('null 参数返回 0', () => {
    assert.equal(estimateSavingsFromCache(null, null, null).usd, 0);
  });
});

// ==================== formatCost ====================

describe('formatCost', () => {
  it('正常金额', () => assert.equal(formatCost(1.23), '$1.23'));
  it('零', () => assert.equal(formatCost(0), '$0.00'));
  it('NaN', () => assert.equal(formatCost(NaN), '$0.00'));
  it('null', () => assert.equal(formatCost(null), '$0.00'));
  it('极小金额', () => assert.equal(formatCost(0.001), '<$0.01'));
});

// ==================== formatCostCNY ====================

describe('formatCostCNY', () => {
  it('正常金额', () => {
    assert.equal(formatCostCNY(1), `¥${(1 * USD_TO_CNY).toFixed(2)}`);
  });
  it('零', () => assert.equal(formatCostCNY(0), '¥0.00'));
  it('NaN', () => assert.equal(formatCostCNY(NaN), '¥0.00'));
  it('极小金额', () => assert.equal(formatCostCNY(0.0001), '<¥0.01'));
});

// ==================== usdToCents / centsToUsd ====================

describe('usdToCents & centsToUsd', () => {
  it('usdToCents 正常转换', () => assert.equal(usdToCents(1.23), 123));
  it('usdToCents 零', () => assert.equal(usdToCents(0), 0));
  it('usdToCents NaN', () => assert.equal(usdToCents(NaN), 0));
  it('centsToUsd 正常转换', () => assert.equal(centsToUsd(123), 1.23));
  it('centsToUsd 零', () => assert.equal(centsToUsd(0), 0));
  it('centsToUsd NaN', () => assert.equal(centsToUsd(NaN), 0));
  it('往返一致性', () => {
    assert.equal(centsToUsd(usdToCents(5.67)), 5.67);
  });
});
