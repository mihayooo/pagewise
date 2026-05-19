/**
 * EvolutionEngine 信号处理 — 从 evolution.js (R140) 拆分
 *
 * 包含:
 *   - detectImplicitSignals() — 隐式信号检测
 *   - processSignal() — 信号分发
 *   - onAnswerCopied / onSavedToKB / onQuickFollowup / onRepeatedQuestion
 *   - onSkillUsed / onSkillIgnored / onPositiveFeedback / onNegativeFeedback
 *
 * @module lib/evolution-signals
 */

/**
 * 记录隐式信号（自动检测）
 *
 * @param {EvolutionEngine} engine
 * @param {string} interactionId
 * @param {Object} context
 * @returns {string[]} 检测到的信号类型列表
 */
export function detectImplicitSignals(engine, interactionId, context) {
  const signals = [];

  if (context.followUpWithin30s) {
    signals.push('quick_followup');
  }

  if (context.repeatedQuestion) {
    signals.push('repeated_question');
  }

  if (context.answerLength < 100 && !context.followUp) {
    signals.push('quick_resolution');
  }

  if (context.textSelectedAfterAnswer) {
    signals.push('text_selected');
  }

  signals.forEach(type => engine.recordSignal(type, interactionId));
  return signals;
}

/**
 * 处理信号，即时调优
 *
 * @param {EvolutionEngine} engine
 * @param {Object} signal
 */
export function processSignal(engine, signal) {
  switch (signal.type) {
    case 'copied':
      onAnswerCopied(engine, signal);
      break;
    case 'saved_to_kb':
      onSavedToKB(engine, signal);
      break;
    case 'quick_followup':
      onQuickFollowup(engine, signal);
      break;
    case 'repeated_question':
      onRepeatedQuestion(engine, signal);
      break;
    case 'skill_used':
      onSkillUsed(engine, signal);
      break;
    case 'skill_ignored':
      onSkillIgnored(engine, signal);
      break;
    case 'positive_feedback':
      onPositiveFeedback(engine, signal);
      break;
    case 'negative_feedback':
      onNegativeFeedback(engine, signal);
      break;
  }

  engine.saveState();
}

// ==================== 信号处理器 ====================

function onAnswerCopied(engine, signal) {
  engine.strategies.successfulInteractions++;

  const interaction = engine.interactions.find(i => i.id === signal.interactionId);
  if (!interaction) return;

  const pattern = {
    pageType: interaction.pageType,
    answerLength: interaction.answerLength,
    style: engine.strategies.answerStyle,
    timestamp: signal.timestamp
  };

  if (!engine.strategies._successPatterns) engine.strategies._successPatterns = [];
  engine.strategies._successPatterns.push(pattern);
  engine.strategies._successPatterns = engine.strategies._successPatterns.slice(-50);
}

function onSavedToKB(engine, signal) {
  engine.strategies.successfulInteractions++;

  const interaction = engine.interactions.find(i => i.id === signal.interactionId);
  if (interaction?.pageUrl) {
    engine.boostDomain(interaction.pageUrl);
  }
}

function onQuickFollowup(engine, signal) {
  const interaction = engine.interactions.find(i => i.id === signal.interactionId);
  if (!interaction) return;

  if (interaction.answerLength < 500) {
    engine.evolve('answer_detail', 'increased', '用户在短回答后追问');
  }
}

function onRepeatedQuestion(engine, signal) {
  engine.evolve('retrieval_expand', 'wider', '用户重复提问，扩大检索范围');
}

function onSkillUsed(engine, signal) {
  if (!engine.strategies._skillSuccess) engine.strategies._skillSuccess = {};
  const skillId = signal.data?.skillId;
  if (skillId) {
    engine.strategies._skillSuccess[skillId] = (engine.strategies._skillSuccess[skillId] || 0) + 1;
  }
}

function onSkillIgnored(engine, signal) {
  if (!engine.strategies._skillIgnore) engine.strategies._skillIgnore = {};
  const key = `${signal.data?.pageType}:${signal.data?.skillId}`;
  engine.strategies._skillIgnore[key] = (engine.strategies._skillIgnore[key] || 0) + 1;
}

function onPositiveFeedback(engine, signal) {
  engine.strategies.successfulInteractions++;
  engine.evolve('approach_confirmed', 'keep', '用户正面反馈');
}

function onNegativeFeedback(engine, signal) {
  const correction = signal.data?.correction || '';
  if (correction) {
    if (!engine.strategies._avoidPatterns) engine.strategies._avoidPatterns = [];
    engine.strategies._avoidPatterns.push({
      correction,
      timestamp: signal.timestamp
    });
    engine.strategies._avoidPatterns = engine.strategies._avoidPatterns.slice(-30);
  }
}
