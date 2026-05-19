/**
 * 测试 lib/evolution.js — EvolutionEngine 自进化系统
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/setup.js';

installChromeMock();

const { EvolutionEngine } = await import('../lib/evolution.js');

// Helper: create an engine and wait for async loadState to complete
async function createEngine() {
  const engine = new EvolutionEngine();
  await new Promise(r => setTimeout(r, 10));
  return engine;
}

// ==================== 构造函数 ====================

describe('EvolutionEngine 构造函数', () => {
  beforeEach(() => { resetChromeMock(); });

  it('初始化默认状态', async () => {
    const engine = await createEngine();
    assert.ok(Array.isArray(engine.interactions));
    assert.ok(Array.isArray(engine.signals));
    assert.ok(typeof engine.strategies === 'object');
    assert.ok(Array.isArray(engine.evolutionLog));
  });

  it('defaultStrategies 返回正确默认值', () => {
    const engine = new EvolutionEngine();
    const s = engine.defaultStrategies();
    assert.equal(s.answerStyle, 'balanced');
    assert.equal(s.codeDetailLevel, 'medium');
    assert.equal(s.useAnalogies, true);
    assert.equal(s.useBulletPoints, true);
    assert.equal(s.retrievalTopK, 5);
    assert.equal(s.recencyWeight, 0.3);
    assert.equal(s.tagWeight, 0.4);
    assert.equal(s.titleWeight, 0.5);
    assert.equal(s.systemPromptVersion, 1);
    assert.ok(Array.isArray(s.personalityTraits));
    assert.equal(s.autoSkillThreshold, 0.7);
    assert.equal(s.totalInteractions, 0);
    assert.equal(s.successfulInteractions, 0);
    assert.equal(s.lastEvolution, null);
  });

  it('loadState 从 chrome.storage 恢复', async () => {
    const savedState = {
      interactions: [{ id: 'test', question: 'q' }],
      signals: [{ type: 'copied', interactionId: 'test' }],
      strategies: { answerStyle: 'detailed', totalInteractions: 1, successfulInteractions: 0 },
      evolutionLog: [{ dimension: 'test' }],
    };
    await chrome.storage.local.set({ evolutionState: savedState });
    const engine = await createEngine();
    assert.equal(engine.strategies.answerStyle, 'detailed');
    assert.equal(engine.strategies.totalInteractions, 1);
  });

  it('loadState 失败时使用默认策略', async () => {
    const engine = await createEngine();
    assert.equal(engine.strategies.answerStyle, 'balanced');
  });
});

// ==================== recordInteraction() ====================

describe('EvolutionEngine.recordInteraction()', () => {
  beforeEach(() => { resetChromeMock(); });

  it('记录交互并生成 ID', async () => {
    const engine = await createEngine();
    const id = engine.recordInteraction({
      question: '什么是 JavaScript？',
      answer: 'JavaScript 是一门编程语言',
      pageType: 'article',
    });
    assert.ok(typeof id === 'string');
    assert.ok(id.length > 0);
    assert.equal(engine.interactions.length, 1);
    assert.equal(engine.strategies.totalInteractions, 1);
  });

  it('记录的交互包含所有必要字段', async () => {
    const engine = await createEngine();
    engine.recordInteraction({
      question: 'test',
      answer: 'answer text that is long enough',
      pageType: 'code',
      pageUrl: 'https://example.com',
      skillsUsed: ['code-explain'],
      retrievalHits: 3,
    });
    const record = engine.interactions[0];
    assert.equal(record.question, 'test');
    assert.equal(record.answerLength, 31);
    assert.equal(record.pageType, 'code');
    assert.equal(record.pageUrl, 'https://example.com');
    assert.deepEqual(record.skillsUsed, ['code-explain']);
    assert.equal(record.retrievalHits, 3);
    assert.ok(record.timestamp);
    assert.ok(record.id);
  });

  it('默认字段处理', async () => {
    const engine = await createEngine();
    engine.recordInteraction({});
    const record = engine.interactions[0];
    assert.equal(record.pageType, 'generic');
    assert.equal(record.pageUrl, '');
    assert.deepEqual(record.skillsUsed, []);
    assert.equal(record.retrievalHits, 0);
    assert.equal(record.answerLength, 0);
  });
});

// ==================== recordSignal() ====================

describe('EvolutionEngine.recordSignal()', () => {
  it('记录信号并关联到交互', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('copied', id);
    assert.equal(engine.signals.length, 1);
    assert.equal(engine.signals[0].type, 'copied');
    assert.equal(engine.signals[0].interactionId, id);
  });

  it('信号关联到交互记录的 signals 数组', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('copied', id);
    const interaction = engine.interactions.find(i => i.id === id);
    assert.ok(interaction.signals.includes('copied'));
  });

  it('信号处理 copied 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('copied', id);
    assert.equal(engine.strategies.successfulInteractions, 1);
  });

  it('信号处理 saved_to_kb 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({
      question: 'test',
      answer: 'answer',
      pageUrl: 'https://example.com/page',
    });
    engine.recordSignal('saved_to_kb', id);
    assert.equal(engine.strategies.successfulInteractions, 1);
  });

  it('信号处理 quick_followup 类型 - 短回答', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'short' });
    // answerLength < 500 triggers evolve
    engine.recordSignal('quick_followup', id);
    // Should have evolved answer_detail
    const log = engine.evolutionLog.find(e => e.dimension === 'answer_detail');
    assert.ok(log);
  });

  it('信号处理 repeated_question 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'again', answer: 'answer' });
    engine.recordSignal('repeated_question', id);
    const log = engine.evolutionLog.find(e => e.dimension === 'retrieval_expand');
    assert.ok(log);
  });

  it('信号处理 skill_used 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('skill_used', id, { data: { skillId: 'my-skill' } });
    assert.equal(engine.strategies._skillSuccess['my-skill'], 1);
  });

  it('信号处理 skill_ignored 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('skill_ignored', id, { data: { pageType: 'article', skillId: 'summarize' } });
    assert.equal(engine.strategies._skillIgnore['article:summarize'], 1);
  });

  it('信号处理 positive_feedback 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('positive_feedback', id);
    assert.equal(engine.strategies.successfulInteractions, 1);
    const log = engine.evolutionLog.find(e => e.dimension === 'approach_confirmed');
    assert.ok(log);
  });

  it('信号处理 negative_feedback 类型', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('negative_feedback', id, { data: { correction: '太简短了' } });
    assert.ok(engine.strategies._avoidPatterns);
    assert.equal(engine.strategies._avoidPatterns.length, 1);
    assert.equal(engine.strategies._avoidPatterns[0].correction, '太简短了');
  });

  it('negative_feedback 无 correction 时不记录', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('negative_feedback', id, { data: {} });
    // _avoidPatterns should not exist or be empty
    assert.ok(!engine.strategies._avoidPatterns || engine.strategies._avoidPatterns.length === 0);
  });

  it('关联不存在的交互时仍正常工作', () => {
    const engine = new EvolutionEngine();
    engine.recordSignal('copied', 'nonexistent-id');
    assert.equal(engine.signals.length, 1);
  });
});

// ==================== detectImplicitSignals() ====================

describe('EvolutionEngine.detectImplicitSignals()', () => {
  it('检测 quick_followup 信号', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    const signals = engine.detectImplicitSignals(id, { followUpWithin30s: true });
    assert.ok(signals.includes('quick_followup'));
  });

  it('检测 repeated_question 信号', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    const signals = engine.detectImplicitSignals(id, { repeatedQuestion: true });
    assert.ok(signals.includes('repeated_question'));
  });

  it('检测 quick_resolution 信号', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'ok' });
    const signals = engine.detectImplicitSignals(id, { answerLength: 50, followUp: false });
    assert.ok(signals.includes('quick_resolution'));
  });

  it('检测 text_selected 信号', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    const signals = engine.detectImplicitSignals(id, { textSelectedAfterAnswer: true });
    assert.ok(signals.includes('text_selected'));
  });

  it('无信号条件时返回空数组', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'very long answer '.repeat(20) });
    const signals = engine.detectImplicitSignals(id, {});
    assert.equal(signals.length, 0);
  });

  it('多信号同时触发', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'a' });
    const signals = engine.detectImplicitSignals(id, {
      followUpWithin30s: true,
      repeatedQuestion: true,
      answerLength: 50,
      followUp: false,
      textSelectedAfterAnswer: true,
    });
    assert.ok(signals.length >= 4);
  });
});

// ==================== evolve() ====================

describe('EvolutionEngine.evolve()', () => {
  it('answer_detail 增加 → detailed', () => {
    const engine = new EvolutionEngine();
    engine.evolve('answer_detail', 'increased', '用户追问');
    assert.equal(engine.strategies.answerStyle, 'detailed');
    assert.ok(engine.strategies.lastEvolution);
    assert.equal(engine.evolutionLog.length, 1);
  });

  it('answer_detail 减少 → concise', () => {
    const engine = new EvolutionEngine();
    engine.evolve('answer_detail', 'decreased', '用户跳过');
    assert.equal(engine.strategies.answerStyle, 'concise');
  });

  it('answer_style 直接设置', () => {
    const engine = new EvolutionEngine();
    engine.evolve('answer_style', 'detailed', '用户偏好');
    assert.equal(engine.strategies.answerStyle, 'detailed');
  });

  it('code_detail 设置', () => {
    const engine = new EvolutionEngine();
    engine.evolve('code_detail', 'verbose', '代码需求');
    assert.equal(engine.strategies.codeDetailLevel, 'verbose');
  });

  it('retrieval_expand 增加 topK', () => {
    const engine = new EvolutionEngine();
    const origK = engine.strategies.retrievalTopK;
    engine.evolve('retrieval_expand', 'wider', '扩大范围');
    assert.equal(engine.strategies.retrievalTopK, origK + 1);
  });

  it('retrieval_expand 不超过 10', () => {
    const engine = new EvolutionEngine();
    engine.strategies.retrievalTopK = 10;
    engine.evolve('retrieval_expand', 'wider', '上限');
    assert.equal(engine.strategies.retrievalTopK, 10);
  });

  it('retrieval_narrow 减少 topK', () => {
    const engine = new EvolutionEngine();
    engine.strategies.retrievalTopK = 5;
    engine.evolve('retrieval_narrow', 'narrower', '缩小范围');
    assert.equal(engine.strategies.retrievalTopK, 4);
  });

  it('retrieval_narrow 不低于 3', () => {
    const engine = new EvolutionEngine();
    engine.strategies.retrievalTopK = 3;
    engine.evolve('retrieval_narrow', 'narrower', '下限');
    assert.equal(engine.strategies.retrievalTopK, 3);
  });

  it('进化日志记录 previousValue', () => {
    const engine = new EvolutionEngine();
    engine.strategies.answerStyle = 'balanced';
    engine.evolve('answer_style', 'detailed', '测试');
    assert.equal(engine.evolutionLog[0].previousValue, 'balanced');
  });
});

// ==================== batchEvolve() ====================

describe('EvolutionEngine.batchEvolve()', () => {
  it('交互不足 10 次时不执行', async () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 5; i++) {
      engine.recordInteraction({ question: `q${i}`, answer: 'a' });
    }
    await engine.batchEvolve();
    // No batch_evolve log entry
    assert.equal(engine.evolutionLog.filter(e => e.dimension === 'batch_evolve').length, 0);
  });

  it('足够交互时执行批量进化', async () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 15; i++) {
      const id = engine.recordInteraction({ question: `q${i}`, answer: 'a'.repeat(200) });
      if (i % 3 === 0) engine.recordSignal('copied', id);
    }
    await engine.batchEvolve();
    const batchLogs = engine.evolutionLog.filter(e => e.dimension === 'batch_evolve');
    assert.ok(batchLogs.length > 0);
  });

  it('analyzeStylePreference 在成功回答较多时调整', async () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 15; i++) {
      const id = engine.recordInteraction({
        question: `q${i}`,
        answer: 'a'.repeat(2000),
        answerLength: 2000,
      });
      engine.recordSignal('copied', id);
    }
    await engine.batchEvolve();
    // Should detect detailed preference
    assert.equal(engine.strategies.answerStyle, 'detailed');
  });

  it('analyzeStylePreference 短回答偏好 concise', async () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 15; i++) {
      const id = engine.recordInteraction({
        question: `q${i}`,
        answer: 'ok',
        answerLength: 50,
      });
      engine.recordSignal('saved_to_kb', id);
    }
    await engine.batchEvolve();
    assert.equal(engine.strategies.answerStyle, 'concise');
  });

  it('analyzeRetrievalEffectiveness 检测检索不准', async () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 15; i++) {
      const id = engine.recordInteraction({
        question: `q${i}`,
        answer: 'a',
        retrievalHits: 3,
      });
      if (i < 5) engine.recordSignal('repeated_question', id);
    }
    await engine.batchEvolve();
    const expandLogs = engine.evolutionLog.filter(e => e.dimension === 'retrieval_expand');
    assert.ok(expandLogs.length > 0);
  });
});

// ==================== analyzeUserLevel() ====================

describe('EvolutionEngine.analyzeUserLevel()', () => {
  it('检测高级用户', () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 5; i++) {
      engine.recordInteraction({ question: '请解释架构设计模式和源码原理', answer: 'a' });
    }
    engine.analyzeUserLevel(engine.interactions);
    assert.equal(engine.strategies._inferredLevel, 'advanced');
  });

  it('检测初学者', () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 5; i++) {
      engine.recordInteraction({ question: '什么是入门教程和基础', answer: 'a' });
    }
    engine.analyzeUserLevel(engine.interactions);
    assert.equal(engine.strategies._inferredLevel, 'beginner');
  });

  it('默认中级', () => {
    const engine = new EvolutionEngine();
    for (let i = 0; i < 5; i++) {
      engine.recordInteraction({ question: '帮我看看这个', answer: 'a' });
    }
    engine.analyzeUserLevel(engine.interactions);
    assert.equal(engine.strategies._inferredLevel, 'intermediate');
  });
});

// ==================== 策略输出 ====================

describe('EvolutionEngine 策略输出', () => {
  it('getStrategyPrompt concise 风格', () => {
    const engine = new EvolutionEngine();
    engine.strategies.answerStyle = 'concise';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('简洁精炼'));
  });

  it('getStrategyPrompt detailed 风格', () => {
    const engine = new EvolutionEngine();
    engine.strategies.answerStyle = 'detailed';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('详细全面'));
  });

  it('getStrategyPrompt balanced 风格', () => {
    const engine = new EvolutionEngine();
    engine.strategies.answerStyle = 'balanced';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('清晰有条理'));
  });

  it('getStrategyPrompt codeDetailLevel minimal', () => {
    const engine = new EvolutionEngine();
    engine.strategies.codeDetailLevel = 'minimal';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('简短'));
  });

  it('getStrategyPrompt codeDetailLevel verbose', () => {
    const engine = new EvolutionEngine();
    engine.strategies.codeDetailLevel = 'verbose';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('完整'));
  });

  it('getStrategyPrompt 包含避免模式', () => {
    const engine = new EvolutionEngine();
    engine.strategies._avoidPatterns = [
      { correction: '避免测试1' },
      { correction: '避免测试2' },
    ];
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('避免'));
    assert.ok(prompt.includes('避免测试1'));
  });

  it('getStrategyPrompt 包含推断用户水平', () => {
    const engine = new EvolutionEngine();
    engine.strategies._inferredLevel = 'advanced';
    const prompt = engine.getStrategyPrompt();
    assert.ok(prompt.includes('高级'));
  });

  it('getRetrievalConfig 返回检索参数', () => {
    const engine = new EvolutionEngine();
    const config = engine.getRetrievalConfig();
    assert.equal(config.topK, 5);
    assert.equal(config.recencyWeight, 0.3);
    assert.equal(config.tagWeight, 0.4);
    assert.equal(config.titleWeight, 0.5);
  });

  it('getSkillThreshold 返回阈值', () => {
    const engine = new EvolutionEngine();
    assert.equal(engine.getSkillThreshold(), 0.7);
  });
});

// ==================== boostDomain() ====================

describe('EvolutionEngine.boostDomain()', () => {
  it('提升域名权重', () => {
    const engine = new EvolutionEngine();
    engine.boostDomain('https://example.com/page');
    assert.equal(engine.strategies._domainBoost['example.com'], 1);
  });

  it('重复提升累加', () => {
    const engine = new EvolutionEngine();
    engine.boostDomain('https://example.com/a');
    engine.boostDomain('https://example.com/b');
    assert.equal(engine.strategies._domainBoost['example.com'], 2);
  });

  it('无效 URL 不报错', () => {
    const engine = new EvolutionEngine();
    assert.doesNotThrow(() => engine.boostDomain('not-a-url'));
    assert.doesNotThrow(() => engine.boostDomain(''));
  });
});

// ==================== getStats() ====================

describe('EvolutionEngine.getStats()', () => {
  it('返回正确统计', () => {
    const engine = new EvolutionEngine();
    engine.recordInteraction({ question: 'q1', answer: 'a' });
    engine.recordInteraction({ question: 'q2', answer: 'a' });
    engine.strategies.successfulInteractions = 1;

    const stats = engine.getStats();
    assert.equal(stats.totalInteractions, 2);
    assert.equal(stats.successfulInteractions, 1);
    assert.equal(stats.successRate, 50);
    assert.equal(stats.currentStyle, 'balanced');
    assert.equal(stats.inferredLevel, 'intermediate');
  });

  it('零交互时 successRate 为 0', () => {
    const engine = new EvolutionEngine();
    const stats = engine.getStats();
    assert.equal(stats.successRate, 0);
  });
});

// ==================== reset() ====================

describe('EvolutionEngine.reset()', () => {
  it('重置所有状态', async () => {
    const engine = new EvolutionEngine();
    engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('copied', engine.interactions[0].id);
    engine.evolve('answer_style', 'detailed', 'test');

    await engine.reset();

    assert.equal(engine.interactions.length, 0);
    assert.equal(engine.signals.length, 0);
    assert.equal(engine.evolutionLog.length, 0);
    assert.equal(engine.strategies.answerStyle, 'balanced');
    assert.equal(engine.strategies.totalInteractions, 0);
  });
});

// ==================== onAnswerCopied / onSavedToKB ====================

describe('EvolutionEngine 信号处理器细节', () => {
  it('onAnswerCopied 记录成功模式', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({
      question: 'test',
      answer: 'good answer',
      pageType: 'article',
      answerLength: 100,
    });
    engine.strategies.answerStyle = 'balanced';
    engine.recordSignal('copied', id);
    assert.ok(engine.strategies._successPatterns);
    assert.equal(engine.strategies._successPatterns.length, 1);
    assert.equal(engine.strategies._successPatterns[0].pageType, 'article');
  });

  it('_successPatterns 最多保留 50 条', () => {
    const engine = new EvolutionEngine();
    engine.strategies._successPatterns = Array.from({ length: 55 }, (_, i) => ({
      pageType: 'test', answerLength: 100, style: 'balanced', timestamp: 'ts'
    }));
    const id = engine.recordInteraction({ question: 'test', answer: 'answer', pageType: 'article' });
    engine.recordSignal('copied', id);
    assert.ok(engine.strategies._successPatterns.length <= 50);
  });

  it('onSavedToKB 对无 URL 交互仍正常', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer', pageUrl: '' });
    engine.recordSignal('saved_to_kb', id);
    assert.equal(engine.strategies.successfulInteractions, 1);
  });

  it('onQuickFollowup 长回答时不进化', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({
      question: 'test',
      answer: 'a'.repeat(600),
      answerLength: 600,
    });
    const beforeLen = engine.evolutionLog.length;
    engine.recordSignal('quick_followup', id);
    // answerLength >= 500, so no evolution for answer_detail
    assert.equal(engine.evolutionLog.length, beforeLen);
  });

  it('_avoidPatterns 最多保留 30 条', () => {
    const engine = new EvolutionEngine();
    engine.strategies._avoidPatterns = Array.from({ length: 35 }, (_, i) => ({
      correction: `correction ${i}`, timestamp: 'ts'
    }));
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('negative_feedback', id, { data: { correction: 'new correction' } });
    assert.ok(engine.strategies._avoidPatterns.length <= 30);
  });

  it('onSkillUsed 无 data 时不出错', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('skill_used', id, {});
    assert.ok(engine.strategies._skillSuccess);
  });

  it('onSkillIgnored 无 data 时不出错', () => {
    const engine = new EvolutionEngine();
    const id = engine.recordInteraction({ question: 'test', answer: 'answer' });
    engine.recordSignal('skill_ignored', id, {});
    assert.ok(engine.strategies._skillIgnore);
  });
});
