/**
 * EvolutionEngine 批量进化 — 从 evolution.js (R140) 拆分
 *
 * 包含:
 *   - batchEvolve() — 定期批量进化
 *   - analyzeStylePreference() — 回答风格偏好分析
 *   - analyzeRetrievalEffectiveness() — 检索效果分析
 *   - analyzeSkillPatterns() — 技能使用模式分析
 *   - analyzeUserLevel() — 用户技术水平推断
 *
 * @module lib/evolution-batch
 */

/**
 * 定期分析所有信号，批量进化
 * 每 20 次交互或每天运行一次
 *
 * @param {EvolutionEngine} engine
 */
export async function batchEvolve(engine) {
  const recentInteractions = engine.interactions.slice(-50);
  if (recentInteractions.length < 10) return;

  const recentSignals = engine.signals.slice(-100);

  analyzeStylePreference(engine, recentInteractions, recentSignals);
  analyzeRetrievalEffectiveness(engine, recentInteractions, recentSignals);
  analyzeSkillPatterns(engine, recentInteractions, recentSignals);
  analyzeUserLevel(engine, recentInteractions);

  await engine.saveState();

  engine.evolutionLog.push({
    dimension: 'batch_evolve',
    value: `${recentInteractions.length} interactions analyzed`,
    reason: '定期批量进化',
    timestamp: new Date().toISOString()
  });
}

/**
 * 分析回答风格偏好
 *
 * @param {EvolutionEngine} engine
 * @param {Array} interactions
 * @param {Array} signals
 */
export function analyzeStylePreference(engine, interactions, signals) {
  const successfulIds = new Set(
    signals.filter(s => s.type === 'copied' || s.type === 'saved_to_kb')
      .map(s => s.interactionId)
  );

  const successful = interactions.filter(i => successfulIds.has(i.id));
  if (successful.length < 3) return;

  const avgLength = successful.reduce((sum, i) => sum + i.answerLength, 0) / successful.length;

  if (avgLength > 1500) {
    engine.evolve('answer_style', 'detailed', `成功回答平均长度 ${Math.round(avgLength)} 字，用户偏好详细回答`);
  } else if (avgLength < 300) {
    engine.evolve('answer_style', 'concise', `成功回答平均长度 ${Math.round(avgLength)} 字，用户偏好简洁回答`);
  } else {
    engine.evolve('answer_style', 'balanced', `成功回答平均长度 ${Math.round(avgLength)} 字，保持平衡`);
  }
}

/**
 * 分析检索效果
 *
 * @param {EvolutionEngine} engine
 * @param {Array} interactions
 * @param {Array} signals
 */
export function analyzeRetrievalEffectiveness(engine, interactions, signals) {
  const repeated = signals.filter(s => s.type === 'repeated_question');
  const withRetrieval = interactions.filter(i => i.retrievalHits > 0);

  if (repeated.length > 3 && withRetrieval.length > 5) {
    engine.evolve('retrieval_expand', 'wider', `${repeated.length} 次重复提问，检索可能不准`);
  }
}

/**
 * 分析技能使用模式
 *
 * @param {EvolutionEngine} engine
 * @param {Array} interactions
 * @param {Array} signals
 */
export function analyzeSkillPatterns(engine, _interactions, _signals) {
  const skillSuccess = engine.strategies._skillSuccess || {};
  const skillIgnore = engine.strategies._skillIgnore || {};

  for (const [skillId, ignoreCount] of Object.entries(skillIgnore)) {
    const successCount = skillSuccess[skillId] || 0;
    if (ignoreCount > successCount * 2) {
      engine.strategies.autoSkillThreshold = Math.min(0.9,
        engine.strategies.autoSkillThreshold + 0.05
      );
    }
  }
}

/**
 * 推断用户技术水平
 *
 * @param {EvolutionEngine} engine
 * @param {Array} interactions
 */
export function analyzeUserLevel(engine, interactions) {
  const questions = interactions.map(i => i.question).join(' ');

  const advancedTerms = ['架构', '设计模式', '源码', '原理', '底层', '性能优化',
    'architecture', 'pattern', 'internals', 'implementation'];
  const beginnerTerms = ['什么是', '怎么用', '入门', '教程', '基础', '新手',
    'what is', 'how to use', 'tutorial', 'beginner', 'getting started'];

  const advancedCount = advancedTerms.filter(t => questions.includes(t)).length;
  const beginnerCount = beginnerTerms.filter(t => questions.includes(t)).length;

  if (advancedCount > beginnerCount * 2) {
    engine.strategies._inferredLevel = 'advanced';
  } else if (beginnerCount > advancedCount * 2) {
    engine.strategies._inferredLevel = 'beginner';
  } else {
    engine.strategies._inferredLevel = 'intermediate';
  }
}
