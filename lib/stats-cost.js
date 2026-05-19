/**
 * Stats Cost — 费用追踪与定价计算
 *
 * 从 stats.js 拆分而来，负责:
 *   - 模型定价表
 *   - 费用估算（输入/输出 token → cents）
 *   - 费用记录（API 调用费用、缓存节省）
 *   - 预算管理
 *   - 费用汇总与趋势查询
 *
 * @module stats-cost
 */

// ==================== 模型定价（USD per 1M tokens） ====================

export const PRICING = {
  'gpt-4o':            { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'gpt-4':             { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':     { input: 0.50,  output: 1.50  },
  'claude-sonnet-4-6':    { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':      { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':     { input: 0.80,  output: 4.00  },
  'claude-3-5-sonnet':    { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku':     { input: 0.80,  output: 4.00  },
  'claude-3-opus':        { input: 15.00, output: 75.00 },
  'deepseek-chat':     { input: 0.27,  output: 1.10  },
  'deepseek-coder':    { input: 0.27,  output: 1.10  },
  'deepseek-reasoner': { input: 0.55,  output: 2.19  },
  'llama3':            { input: 0,     output: 0     },
  'codellama':         { input: 0,     output: 0     },
  'mistral':           { input: 0,     output: 0     },
  'qwen2':             { input: 0,     output: 0     },
};

const _DEFAULT_PRICING = { input: 3.00, output: 15.00 };

/**
 * 查找模型定价（支持前缀匹配）
 * @param {string} model
 * @returns {{ input: number, output: number }}
 */
export function findPricing(model) {
  if (!model) return _DEFAULT_PRICING;
  const id = model.toLowerCase().trim();
  if (PRICING[id]) return PRICING[id];
  const keys = Object.keys(PRICING).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (id.startsWith(key)) return PRICING[key];
  }
  return _DEFAULT_PRICING;
}

/**
 * 估算费用（返回 cents 整数）
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number}
 */
export function estimateCostCents(model, inputTokens, outputTokens) {
  const p = findPricing(model);
  const input = Math.max(0, inputTokens || 0);
  const output = Math.max(0, outputTokens || 0);
  const usd = (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
  return Math.round(usd * 100);
}

/**
 * 估算 input token 费用（返回 cents 整数）
 * @param {string} model
 * @param {number} tokens
 * @returns {number}
 */
export function estimateInputCostCents(model, tokens) {
  const p = findPricing(model);
  const t = Math.max(0, tokens || 0);
  const usd = (t / 1_000_000) * p.input;
  return Math.round(usd * 100);
}

// ==================== 费用记录操作（基于 getStats/saveStats） ====================

/**
 * 创建绑定到特定 getStats/saveStats 的费用操作函数集
 * @param {Function} getStats
 * @param {Function} saveStats
 * @returns {Object}
 */
export function createCostOperations(getStats, saveStats) {
  async function recordCost(model, inputTokens, outputTokens) {
    const costCents = estimateCostCents(model, inputTokens, outputTokens);
    const stats = await getStats();
    stats.totalEstimatedCost = (stats.totalEstimatedCost || 0) + costCents;
    if (!stats.modelUsage[model]) {
      stats.modelUsage[model] = { calls: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };
    }
    const mu = stats.modelUsage[model];
    mu.calls++;
    mu.inputTokens += inputTokens || 0;
    mu.outputTokens += outputTokens || 0;
    mu.costCents += costCents;
    const today = new Date().toISOString().split('T')[0];
    if (!stats.dailyUsage[today]) {
      stats.dailyUsage[today] = { questions: 0, tokens: 0, highlights: 0, cost: 0, cacheSavings: 0 };
    }
    stats.dailyUsage[today].cost = (stats.dailyUsage[today].cost || 0) + costCents;
    await saveStats(stats);
  }

  async function recordCacheSaving(model, cachedTokens, hitCount) {
    if (!cachedTokens || !hitCount || hitCount <= 1) return;
    const savedTokens = (hitCount - 1) * cachedTokens;
    const savedCents = estimateInputCostCents(model, savedTokens);
    const stats = await getStats();
    stats.cacheSavings = (stats.cacheSavings || 0) + savedCents;
    const today = new Date().toISOString().split('T')[0];
    if (!stats.dailyUsage[today]) {
      stats.dailyUsage[today] = { questions: 0, tokens: 0, highlights: 0, cost: 0, cacheSavings: 0 };
    }
    stats.dailyUsage[today].cacheSavings = (stats.dailyUsage[today].cacheSavings || 0) + savedCents;
    await saveStats(stats);
  }

  async function setBudget(budget) {
    const stats = await getStats();
    if (budget.dailyCents !== undefined) stats.dailyBudgetCents = budget.dailyCents;
    if (budget.monthlyCents !== undefined) stats.monthlyBudgetCents = budget.monthlyCents;
    await saveStats(stats);
  }

  async function getCostSummary() {
    const stats = await getStats();
    const today = new Date().toISOString().split('T')[0];
    const monthPrefix = today.slice(0, 7);
    const todayCost = stats.dailyUsage[today]?.cost || 0;
    let monthCost = 0;
    for (const [date, data] of Object.entries(stats.dailyUsage)) {
      if (date.startsWith(monthPrefix) && data.cost) {
        monthCost += data.cost;
      }
    }
    return {
      todayCost,
      monthCost,
      totalCost: stats.totalEstimatedCost || 0,
      cacheSavings: stats.cacheSavings || 0,
      dailyBudgetCents: stats.dailyBudgetCents || 0,
      monthlyBudgetCents: stats.monthlyBudgetCents || 0,
      modelUsage: stats.modelUsage || {},
    };
  }

  async function getCostTrend(days = 7) {
    const stats = await getStats();
    const trend = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = stats.dailyUsage[dateStr] || {};
      trend.push({ date: dateStr, cost: dayData.cost || 0, cacheSavings: dayData.cacheSavings || 0 });
    }
    return trend;
  }

  return { recordCost, recordCacheSaving, setBudget, getCostSummary, getCostTrend };
}
