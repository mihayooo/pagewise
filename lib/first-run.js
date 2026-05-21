/**
 * FirstRun — 首次运行体验集成模块
 *
 * R238: FirstRunExperienceOpt — 桥接 onboarding → telemetry → feedback 全链路
 *
 * 职责:
 *   1. 安装时记录时间戳（pagewise_install_date）
 *   2. 检查是否需要显示 onboarding 引导
 *   3. 在 onboarding 完成后触发 telemetry 采集点
 *   4. 判断是否需要显示 NPS 反馈弹窗（7 天后）
 *   5. 提供 telemetry 采集点验证 API
 *
 * 设计约束:
 *   - 纯 ES Module，不依赖 DOM 或 Chrome API（通过依赖注入）
 *   - 所有子模块（onboarding/telemetry/feedback）可独立使用
 *   - 无副作用的工厂函数模式
 *
 * @module lib/first-run
 */

// ==================== 常量 ====================

/** 安装时间戳 storage key */
const INSTALL_DATE_KEY = 'pagewise_install_date';

/** 遥测功能名称 — 核心动作采集点 */
export const TELEMETRY_FEATURES = Object.freeze({
  /** 选中即问 */
  ASK_AI: 'ask_ai',
  /** AI 回答 */
  AI_ANSWER: 'ai_answer',
  /** 书签操作 */
  BOOKMARK_OP: 'bookmark_op',
  /** 知识库查询 */
  KNOWLEDGE_QUERY: 'knowledge_query',
  /** 搜索 */
  SEARCH: 'search',
  /** 页面总结 */
  PAGE_SUMMARIZE: 'page_summarize',
  /** 知识库保存 */
  KNOWLEDGE_SAVE: 'knowledge_save',
  /** 截图提问 */
  SCREENSHOT_ASK: 'screenshot_ask',
  /** 书签图谱 */
  BOOKMARK_GRAPH: 'bookmark_graph',
  /** Onboarding 完成 */
  ONBOARDING_COMPLETE: 'onboarding_complete',
});

/** 核心遥测采集点列表 — 用于验证完整性 */
export const CORE_TELEMETRY_ACTIONS = Object.freeze(Object.values(TELEMETRY_FEATURES));

// ==================== 工厂函数 ====================

/**
 * 创建 FirstRun 实例
 *
 * @param {object} deps — 依赖注入
 * @param {object} deps.storage — chrome.storage.local 兼容接口
 * @param {object} [deps.onboarding] — onboarding 模块实例
 * @param {object} [deps.telemetry] — telemetry 模块实例
 * @param {object} [deps.feedback] — feedback-collector 模块实例
 * @param {function} [deps.now] — 自定义时间源（测试用）
 * @returns {FirstRunAPI}
 */
export function _createFirstRun(deps) {
  const { storage, onboarding, telemetry, feedback } = deps;
  const nowFn = (deps.now) || (() => Date.now());

  return {
    /**
     * 记录首次安装时间戳
     * @returns {Promise<void>}
     */
    async recordInstallDate() {
      const existing = await storage.get(INSTALL_DATE_KEY);
      if (!existing[INSTALL_DATE_KEY]) {
        await storage.set({ [INSTALL_DATE_KEY]: nowFn() });
      }
    },

    /**
     * 获取安装时间戳
     * @returns {Promise<number|null>}
     */
    async getInstallDate() {
      const data = await storage.get(INSTALL_DATE_KEY);
      return data[INSTALL_DATE_KEY] || null;
    },

    /**
     * 检查是否需要显示 onboarding
     * @returns {Promise<boolean>}
     */
    async shouldShowOnboarding() {
      if (!onboarding) return false;
      return await onboarding.shouldShowOnboarding();
    },

    /**
     * 完成 onboarding 并记录遥测
     * @returns {Promise<void>}
     */
    async completeOnboarding() {
      if (onboarding) {
        await onboarding.completeOnboarding();
      }
      if (telemetry) {
        await telemetry.trackFeature(TELEMETRY_FEATURES.ONBOARDING_COMPLETE);
      }
    },

    /**
     * 检查是否需要显示 NPS 反馈弹窗
     * @returns {Promise<boolean>}
     */
    async shouldShowFeedback() {
      if (!feedback) return false;
      return await feedback.shouldShowPrompt();
    },

    /**
     * 提交 NPS 反馈
     * @param {number} score — 0-10
     * @param {string} [comment]
     * @returns {Promise<object>}
     */
    async submitFeedback(score, comment) {
      if (!feedback) throw new Error('feedback module not initialized');
      return await feedback.submitFeedback(score, comment);
    },

    /**
     * 跟踪功能使用
     * @param {string} featureName
     * @returns {Promise<void>}
     */
    async trackFeature(featureName) {
      if (telemetry) {
        await telemetry.trackFeature(featureName);
      }
    },

    /**
     * 追踪错误
     * @param {string} errorType
     * @param {object} [details]
     * @returns {Promise<void>}
     */
    async trackError(errorType, details) {
      if (telemetry) {
        await telemetry.trackError(errorType, details);
      }
    },

    /**
     * 记录性能指标
     * @param {string} metricName
     * @param {number} value
     * @returns {Promise<void>}
     */
    async recordMetric(metricName, value) {
      if (telemetry) {
        await telemetry.recordMetric(metricName, value);
      }
    },

    /**
     * 获取遥测摘要
     * @returns {Promise<object>}
     */
    async getTelemetrySummary() {
      if (!telemetry) return { features: {}, errors: {}, metrics: {} };
      return await telemetry.getSummary();
    },

    /**
     * 验证核心遥测采集点是否已覆盖
     * 返回每个核心动作的采集状态
     * @returns {Promise<Array<{action: string, covered: boolean, count: number}>>}
     */
    async verifyTelemetryCoverage() {
      if (!telemetry) {
        return CORE_TELEMETRY_ACTIONS.map(action => ({
          action,
          covered: false,
          count: 0,
        }));
      }
      const summary = await telemetry.getSummary();
      return CORE_TELEMETRY_ACTIONS.map(action => ({
        action,
        covered: typeof summary.features[action] === 'number' && summary.features[action] > 0,
        count: summary.features[action] || 0,
      }));
    },

    /**
     * 获取首次运行状态摘要
     * @returns {Promise<object>}
     */
    async getStatus() {
      const installDate = await this.getInstallDate();
      const needsOnboarding = await this.shouldShowOnboarding();
      const needsFeedback = await this.shouldShowFeedback();
      const telemetrySummary = await this.getTelemetrySummary();
      const coverage = await this.verifyTelemetryCoverage();

      return {
        installDate,
        daysSinceInstall: installDate ? Math.floor((nowFn() - installDate) / (24 * 60 * 60 * 1000)) : null,
        needsOnboarding,
        needsFeedback,
        telemetryEnabled: telemetry ? telemetry.isEnabled() : false,
        telemetryFeatureCount: Object.keys(telemetrySummary.features).length,
        telemetryCoverage: coverage,
      };
    },
  };
}

/**
 * @typedef {Object} FirstRunAPI
 * @property {function(): Promise<void>} recordInstallDate
 * @property {function(): Promise<number|null>} getInstallDate
 * @property {function(): Promise<boolean>} shouldShowOnboarding
 * @property {function(): Promise<void>} completeOnboarding
 * @property {function(): Promise<boolean>} shouldShowFeedback
 * @property {function(number, string=): Promise<object>} submitFeedback
 * @property {function(string): Promise<void>} trackFeature
 * @property {function(string, object=): Promise<void>} trackError
 * @property {function(string, number): Promise<void>} recordMetric
 * @property {function(): Promise<object>} getTelemetrySummary
 * @property {function(): Promise<Array>} verifyTelemetryCoverage
 * @property {function(): Promise<object>} getStatus
 */
