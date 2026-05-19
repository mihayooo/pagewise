/**
 * 测试 lib/agent-loop.js — AgentLoop 自主规划执行引擎
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/setup.js';

installChromeMock();

const { AgentLoop } = await import('../lib/agent-loop.js');

/** 创建 mock 依赖 */
function createMocks() {
  const aiResponses = [];
  const skillResults = new Map();
  const memories = [];

  const aiClient = {
    chat: async (messages, options) => {
      if (aiResponses.length > 0) return aiResponses.shift();
      return { content: '{"analysis":"测试","steps":[{"id":1,"action":"直接回答","type":"analyze","optional":false}]}' };
    },
    _responses: aiResponses,
  };

  const skillEngine = {
    toPrompt: () => '可用技能: test-skill',
    get: (id) => skillResults.has(id) ? { id } : null,
    execute: async (id, params, ctx) => skillResults.get(id) || 'skill result',
    _results: skillResults,
  };

  const pageSense = {};

  const memory = {
    recall: async (query) => memories,
    _memories: memories,
  };

  const stepEvents = [];
  const messages = [];

  return {
    aiClient,
    skillEngine,
    pageSense,
    memory,
    onStep: (event) => stepEvents.push(event),
    onMessage: (msg) => messages.push(msg),
    stepEvents,
    messages,
  };
}

// ==================== 构造函数 ====================

describe('AgentLoop 构造函数', () => {
  it('默认 maxSteps = 10', () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    assert.equal(agent.maxSteps, 10);
    assert.equal(agent.running, false);
  });

  it('使用自定义回调', () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    assert.equal(typeof agent.onStep, 'function');
    assert.equal(typeof agent.onMessage, 'function');
  });

  it('无回调时使用空函数', () => {
    const agent = new AgentLoop({
      aiClient: { chat: async () => ({ content: '{}' }) },
      skillEngine: { toPrompt: () => '', get: () => null },
      pageSense: {},
      memory: null,
    });
    assert.doesNotThrow(() => agent.onStep({}));
    assert.doesNotThrow(() => agent.onMessage({}));
  });
});

// ==================== stop() ====================

describe('AgentLoop.stop()', () => {
  it('设置 running = false', () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    agent.running = true;
    agent.stop();
    assert.equal(agent.running, false);
  });
});

// ==================== plan() ====================

describe('AgentLoop.plan()', () => {
  it('解析 AI 返回的 JSON 计划', async () => {
    const m = createMocks();
    m.aiClient._responses.push({
      content: '{"analysis":"分析任务","steps":[{"id":1,"action":"步骤1","type":"analyze","optional":false}]}'
    });
    const agent = new AgentLoop(m);
    const plan = await agent.plan('测试目标', { title: 'Test', url: 'http://test.com' });
    assert.equal(plan.analysis, '分析任务');
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].action, '步骤1');
  });

  it('JSON 解析失败时回退到简单计划', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '这不是 JSON' });
    const agent = new AgentLoop(m);
    const plan = await agent.plan('测试', {});
    assert.equal(plan.analysis, '直接回答');
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].type, 'analyze');
  });

  it('AI 返回包含 JSON 嵌套在文本中时仍能解析', async () => {
    const m = createMocks();
    m.aiClient._responses.push({
      content: '好的，这是计划：\n{"analysis":"ok","steps":[{"id":1,"action":"test","type":"output","optional":false}]}\n完成'
    });
    const agent = new AgentLoop(m);
    const plan = await agent.plan('test', {});
    assert.equal(plan.analysis, 'ok');
  });

  it('使用记忆提示', async () => {
    const m = createMocks();
    m.memory._memories.push({ content: '历史记忆1' }, { content: '历史记忆2' });
    m.aiClient._responses.push({
      content: '{"analysis":"带记忆","steps":[]}'
    });
    const agent = new AgentLoop(m);
    const plan = await agent.plan('测试', {});
    assert.equal(plan.analysis, '带记忆');
  });

  it('无页面上下文时正常规划', async () => {
    const m = createMocks();
    m.aiClient._responses.push({
      content: '{"analysis":"无上下文","steps":[]}'
    });
    const agent = new AgentLoop(m);
    const plan = await agent.plan('测试', undefined);
    assert.equal(plan.analysis, '无上下文');
  });
});

// ==================== executeStep() ====================

describe('AgentLoop.executeStep()', () => {
  it('执行 skill 步骤', async () => {
    const m = createMocks();
    m.skillEngine._results.set('test-skill', '技能结果');
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'skill', skillId: 'test-skill', params: {} },
      {},
      []
    );
    assert.equal(result.skillId, 'test-skill');
    assert.equal(result.content, '技能结果');
  });

  it('skill 步骤中技能不存在时返回错误', async () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'skill', skillId: 'nonexistent', params: {} },
      {},
      []
    );
    assert.ok(result.error);
    assert.match(result.error, /不存在/);
  });

  it('执行 query 步骤', async () => {
    const m = createMocks();
    m.memory._memories.push({ content: '查询结果1' });
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'query', action: '搜索关键词' },
      {},
      []
    );
    assert.ok(result.content.includes('查询结果1'));
  });

  it('query 步骤无记忆时返回无相关记录', async () => {
    const m = createMocks();
    m.memory._memories.length = 0;
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'query', action: '搜索' },
      {},
      []
    );
    assert.equal(result.content, '无相关记录');
  });

  it('执行 analyze 步骤', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '分析结果' });
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'analyze', action: '分析页面' },
      { content: '页面内容' },
      [{ result: { content: '前置结果' } }]
    );
    assert.equal(result.content, '分析结果');
  });

  it('analyze 步骤无前置结果时正常执行', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '无前置分析' });
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'analyze', action: '分析' },
      { content: '页面' },
      []
    );
    assert.equal(result.content, '无前置分析');
  });

  it('执行 output 步骤返回固定内容', async () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'output', action: '输出' },
      {},
      []
    );
    assert.equal(result.content, '准备输出');
  });

  it('未知步骤类型返回提示', async () => {
    const m = createMocks();
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'unknown_type', action: '未知' },
      {},
      []
    );
    assert.ok(result.content.includes('未知步骤类型'));
  });

  it('步骤执行异常时返回 error', async () => {
    const m = createMocks();
    m.aiClient.chat = async () => { throw new Error('AI 出错'); };
    const agent = new AgentLoop(m);
    const result = await agent.executeStep(
      { type: 'analyze', action: '会失败' },
      {},
      []
    );
    assert.ok(result.error);
    assert.ok(result.error.includes('AI 出错'));
  });
});

// ==================== run() ====================

describe('AgentLoop.run()', () => {
  it('成功执行完整流程', async () => {
    const m = createMocks();
    m.aiClient._responses.push(
      { content: '{"analysis":"任务","steps":[{"id":1,"action":"分析","type":"output","optional":false}]}' },
      { content: '最终总结' }
    );
    const agent = new AgentLoop(m);
    const result = await agent.run('测试目标', { title: 'Test Page' });
    assert.equal(result.success, true);
    assert.equal(result.goal, '测试目标');
    assert.equal(result.summary, '最终总结');
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].status, 'done');
    assert.ok(result.duration >= 0);
    assert.equal(agent.running, false);
  });

  it('步骤失败时中断（非 optional）', async () => {
    const m = createMocks();
    m.aiClient._responses.push(
      { content: '{"analysis":"测试","steps":[{"id":1,"action":"失败步骤","type":"skill","skillId":"nonexistent","optional":false}]}' },
      { content: '总结' }
    );
    const agent = new AgentLoop(m);
    const result = await agent.run('test', {});
    assert.equal(result.success, true);
    assert.equal(result.steps.length, 1);
    assert.ok(result.steps[0].result.error);
  });

  it('optional 步骤失败时继续执行', async () => {
    const m = createMocks();
    m.aiClient._responses.push(
      { content: '{"analysis":"测试","steps":[{"id":1,"action":"可选步骤","type":"skill","skillId":"nonexistent","optional":true},{"id":2,"action":"下一步","type":"output","optional":false}]}' },
      { content: '总结' }
    );
    const agent = new AgentLoop(m);
    const result = await agent.run('test', {});
    assert.equal(result.success, true);
    assert.equal(result.steps.length, 2);
  });

  it('run 中断时停止执行', async () => {
    const m = createMocks();
    m.aiClient._responses.push(
      { content: '{"analysis":"多步骤","steps":[{"id":1,"action":"步骤1","type":"output","optional":false},{"id":2,"action":"步骤2","type":"output","optional":false}]}' },
      { content: '总结' }
    );
    const agent = new AgentLoop(m);
    const origExecuteStep = agent.executeStep.bind(agent);
    let callCount = 0;
    agent.executeStep = async (step, ctx, prev) => {
      callCount++;
      if (callCount >= 1) agent.stop();
      return origExecuteStep(step, ctx, prev);
    };
    const result = await agent.run('test', {});
    assert.equal(result.steps.length, 1);
  });

  it('plan 异常时返回失败结果', async () => {
    const m = createMocks();
    m.aiClient.chat = async () => { throw new Error('网络错误'); };
    const agent = new AgentLoop(m);
    const result = await agent.run('test', {});
    assert.equal(result.success, false);
    assert.ok(result.error.includes('网络错误'));
    assert.equal(agent.running, false);
  });

  it('步骤数超过 maxSteps 时截断', async () => {
    const m = createMocks();
    const manySteps = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1, action: `步骤${i + 1}`, type: 'output', optional: false
    }));
    m.aiClient._responses.push(
      { content: JSON.stringify({ analysis: '多步骤', steps: manySteps }) },
      { content: '总结' }
    );
    const agent = new AgentLoop(m);
    agent.maxSteps = 3;
    const result = await agent.run('test', {});
    assert.equal(result.steps.length, 3);
  });

  it('触发 onStep 回调事件', async () => {
    const m = createMocks();
    m.aiClient._responses.push(
      { content: '{"analysis":"事件测试","steps":[{"id":1,"action":"步骤","type":"output","optional":false}]}' },
      { content: '总结' }
    );
    const agent = new AgentLoop(m);
    await agent.run('test', {});
    assert.ok(m.stepEvents.length >= 3);
    const types = m.stepEvents.map(e => e.type);
    assert.ok(types.includes('planning'));
    assert.ok(types.includes('plan'));
    assert.ok(types.includes('executing'));
    assert.ok(types.includes('step-done'));
    assert.ok(types.includes('summarizing'));
  });
});

// ==================== summarize() ====================

describe('AgentLoop.summarize()', () => {
  it('汇总成功步骤的结果', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '汇总结果' });
    const agent = new AgentLoop(m);
    const summary = await agent.summarize('目标', [
      { action: '步骤1', result: { content: '结果1' } },
      { action: '步骤2', result: { content: '结果2' } },
    ], {});
    assert.equal(summary, '汇总结果');
  });

  it('过滤掉失败的步骤', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '只汇总成功的' });
    const agent = new AgentLoop(m);
    const summary = await agent.summarize('目标', [
      { action: '成功', result: { content: '好' } },
      { action: '失败', result: { error: '出错了' } },
    ], {});
    assert.equal(summary, '只汇总成功的');
  });

  it('步骤结果内容为对象时序列化', async () => {
    const m = createMocks();
    m.aiClient._responses.push({ content: '对象结果汇总' });
    const agent = new AgentLoop(m);
    const summary = await agent.summarize('目标', [
      { action: '步骤', result: { content: { key: 'value' } } },
    ], {});
    assert.equal(summary, '对象结果汇总');
  });
});
