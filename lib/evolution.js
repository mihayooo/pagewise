/**
 * Evolution Engine - 自进化系统 (R140 拆分)
 *
 * 信号处理逻辑已迁移至 evolution-signals.js。
 * 批量进化分析已迁移至 evolution-batch.js。
 * 此文件保留 EvolutionEngine 类并 re-export 所有 API。
 */

import { detectImplicitSignals, processSignal } from './evolution-signals.js';
import { batchEvolve, analyzeStylePreference, analyzeRetrievalEffectiveness, analyzeSkillPatterns, analyzeUserLevel } from './evolution-batch.js';

// Re-export for direct access
export { detectImplicitSignals, processSignal } from './evolution-signals.js';
export { batchEvolve, analyzeStylePreference, analyzeRetrievalEffectiveness, analyzeSkillPatterns, analyzeUserLevel } from './evolution-batch.js';
export { batchEvolve as batchEvolveFn } from './evolution-batch.js';

export class EvolutionEngine {
  constructor() {
    this.interactions = [];       // 交互记录
    this.signals = [];            // 信号记录
    this.strategies = this.defaultStrategies();  // 当前策略参数（同步初始化默认值）
    this.evolutionLog = [];       // 进化日志

    this.loadState();
  }

  // ==================== 初始化 ====================

  async loadState() {
    try {
      const data = await chrome.storage.local.get(['evolutionState']);
      if (data.evolutionState) {
        this.interactions = data.evolutionState.interactions || [];
        this.signals = data.evolutionState.signals || [];
        this.strategies = data.evolutionState.strategies || this.defaultStrategies();
        this.evolutionLog = data.evolutionState.evolutionLog || [];
      }
      // Note: no else branch — constructor already sets defaults.
      // This prevents loadState (resolving after async ops) from
      // overwriting user-modified strategies when storage is empty.
    } catch {
      this.strategies = this.defaultStrategies();
    }
  }

  async saveState() {
    try {
      const state = {
        interactions: this.interactions.slice(-500),
        signals: this.signals.slice(-500),
        strategies: this.strategies,
        evolutionLog: this.evolutionLog.slice(-100)
      };
      await chrome.storage.local.set({ evolutionState: state });
    } catch {}
  }

  defaultStrategies() {
    return {
      answerStyle: 'balanced',
      codeDetailLevel: 'medium',
      useAnalogies: true,
      useBulletPoints: true,
      retrievalTopK: 5,
      recencyWeight: 0.3,
      tagWeight: 0.4,
      titleWeight: 0.5,
      systemPromptVersion: 1,
      personalityTraits: [],
      autoSkillThreshold: 0.7,
      totalInteractions: 0,
      successfulInteractions: 0,
      lastEvolution: null
    };
  }

  // ==================== 信号采集 ====================

  recordInteraction(interaction) {
    const record = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      question: interaction.question,
      answerLength: interaction.answer?.length || 0,
      pageType: interaction.pageType || 'generic',
      pageUrl: interaction.pageUrl || '',
      skillsUsed: interaction.skillsUsed || [],
      retrievalHits: interaction.retrievalHits || 0,
      signals: [],
      ...interaction
    };

    this.interactions.push(record);
    this.strategies.totalInteractions++;
    return record.id;
  }

  recordSignal(type, interactionId, data = {}) {
    const signal = {
      type,
      interactionId,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.signals.push(signal);

    const interaction = this.interactions.find(i => i.id === interactionId);
    if (interaction) {
      interaction.signals.push(type);
    }

    processSignal(this, signal);
  }

  detectImplicitSignals(interactionId, context) {
    return detectImplicitSignals(this, interactionId, context);
  }

  // ==================== 进化执行 ====================

  evolve(dimension, value, reason) {
    // Map dimension names to strategy property keys
    const dimensionKeyMap = {
      'answer_detail': 'answerStyle',
      'answer_style': 'answerStyle',
      'code_detail': 'codeDetailLevel',
      'retrieval_expand': 'retrievalTopK',
      'retrieval_narrow': 'retrievalTopK'
    };
    const strategyKey = dimensionKeyMap[dimension] || dimension;

    const entry = {
      dimension,
      value,
      reason,
      timestamp: new Date().toISOString(),
      previousValue: this.strategies[strategyKey]
    };

    this.evolutionLog.push(entry);
    this.strategies.lastEvolution = entry.timestamp;

    switch (dimension) {
      case 'answer_detail':
        this.strategies.answerStyle = value === 'increased' ? 'detailed' : 'concise';
        break;
      case 'answer_style':
        this.strategies.answerStyle = value;
        break;
      case 'code_detail':
        this.strategies.codeDetailLevel = value;
        break;
      case 'retrieval_expand':
        this.strategies.retrievalTopK = Math.min(10, this.strategies.retrievalTopK + 1);
        break;
      case 'retrieval_narrow':
        this.strategies.retrievalTopK = Math.max(3, this.strategies.retrievalTopK - 1);
        break;
    }
  }

  // ==================== 批量进化 ====================

  async batchEvolve() {
    return batchEvolve(this);
  }

  analyzeUserLevel(interactions) {
    analyzeUserLevel(this, interactions);
  }

  // ==================== 策略输出 ====================

  getStrategyPrompt() {
    let prompt = '';

    switch (this.strategies.answerStyle) {
      case 'concise':
        prompt += '\n回答要求：简洁精炼，直击要点，避免冗余。';
        break;
      case 'detailed':
        prompt += '\n回答要求：详细全面，给出完整解释和示例。';
        break;
      default:
        prompt += '\n回答要求：清晰有条理，平衡详细度。';
    }

    switch (this.strategies.codeDetailLevel) {
      case 'minimal':
        prompt += '代码示例简短，只给关键部分。';
        break;
      case 'verbose':
        prompt += '代码示例完整，包含注释和错误处理。';
        break;
    }

    const avoids = this.strategies._avoidPatterns || [];
    if (avoids.length > 0) {
      const recent = avoids.slice(-5).map(a => a.correction).join('；');
      prompt += `\n避免：${recent}`;
    }

    if (this.strategies._inferredLevel) {
      const levelMap = { beginner: '初学者', intermediate: '中级', advanced: '高级' };
      prompt += `\n用户水平：${levelMap[this.strategies._inferredLevel] || '中级'}`;
    }

    return prompt;
  }

  getRetrievalConfig() {
    return {
      topK: this.strategies.retrievalTopK,
      recencyWeight: this.strategies.recencyWeight,
      tagWeight: this.strategies.tagWeight,
      titleWeight: this.strategies.titleWeight
    };
  }

  getSkillThreshold() {
    return this.strategies.autoSkillThreshold;
  }

  // ==================== 辅助 ====================

  boostDomain(url) {
    try {
      const domain = new URL(url).hostname;
      if (!this.strategies._domainBoost) this.strategies._domainBoost = {};
      this.strategies._domainBoost[domain] = (this.strategies._domainBoost[domain] || 0) + 1;
    } catch {}
  }

  getStats() {
    return {
      totalInteractions: this.strategies.totalInteractions,
      successfulInteractions: this.strategies.successfulInteractions,
      successRate: this.strategies.totalInteractions > 0
        ? Math.round(this.strategies.successfulInteractions / this.strategies.totalInteractions * 100)
        : 0,
      evolutionCount: this.evolutionLog.length,
      currentStyle: this.strategies.answerStyle,
      inferredLevel: this.strategies._inferredLevel || 'intermediate',
      lastEvolution: this.strategies.lastEvolution
    };
  }

  async reset() {
    this.interactions = [];
    this.signals = [];
    this.strategies = this.defaultStrategies();
    this.evolutionLog = [];
    await this.saveState();
  }
}
