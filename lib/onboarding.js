/**
 * Onboarding Module — 新手引导流程
 *
 * 管理首次安装时的分步引导，帮助用户快速上手。
 * 使用 chrome.storage.local 存储完成状态。
 *
 * 支持:
 * - 步骤向导 (welcome → API config → test connection → first question)
 * - 进度指示器 (step 1/4)
 * - 自动检测 API 配置并跳过配置步骤
 * - 跳过按钮
 * - 设置完成后显示示例问题
 */

const STORAGE_KEY = 'onboardingCompleted';

/** 引导步骤 i18n key 映射 */
const ONBOARDING_STEP_I18N = {
  welcome: {
    title: 'onboarding.steps.welcome.title',
    description: 'onboarding.steps.welcome.description',
  },
  config: {
    title: 'onboarding.steps.config.title',
    description: 'onboarding.steps.config.description',
  },
  'test-connection': {
    title: 'onboarding.steps.testConnection.title',
    description: 'onboarding.steps.testConnection.description',
  },
  'first-question': {
    title: 'onboarding.steps.firstQuestion.title',
    description: 'onboarding.steps.firstQuestion.description',
  },
};

/** 引导步骤默认文案（中文回退） */
const ONBOARDING_STEP_DEFAULTS = {
  welcome: {
    title: '欢迎使用智阅 PageWise！',
    description: '感谢安装智阅 PageWise！这是一个智能技术知识助手，帮助你在浏览网页时即时向 AI 提问，并自动整理成知识库。',
  },
  config: {
    title: '配置 API',
    description: '首先，让我们配置 AI 服务商。选择一个提供商，填写你的 API Key，然后测试连接是否正常。',
  },
  'test-connection': {
    title: '测试连接',
    description: '让我们验证 API 连接是否正常。点击下方按钮测试你刚才配置的 API。',
  },
  'first-question': {
    title: '试用功能',
    description: '现在试试发送你的第一条消息吧！在下方输入框中输入问题，或点击快捷按钮开始体验。',
  },
};

/** 引导步骤配置 — 4步向导 */
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: ONBOARDING_STEP_DEFAULTS.welcome.title,
    description: ONBOARDING_STEP_DEFAULTS.welcome.description,
    icon: '👋',
    highlight: null,
    canSkip: true
  },
  {
    id: 'config',
    title: ONBOARDING_STEP_DEFAULTS.config.title,
    description: ONBOARDING_STEP_DEFAULTS.config.description,
    icon: '⚙️',
    highlight: 'panelSettings',
    canSkip: true
  },
  {
    id: 'test-connection',
    title: ONBOARDING_STEP_DEFAULTS['test-connection'].title,
    description: ONBOARDING_STEP_DEFAULTS['test-connection'].description,
    icon: '🔗',
    highlight: 'panelSettings',
    canSkip: false
  },
  {
    id: 'first-question',
    title: ONBOARDING_STEP_DEFAULTS['first-question'].title,
    description: ONBOARDING_STEP_DEFAULTS['first-question'].description,
    icon: '💬',
    highlight: 'panelChat',
    canSkip: true
  }
];

/** 示例问题列表 */
const SAMPLE_QUESTIONS = [
  '什么是 WebSocket？它和 HTTP 有什么区别？',
  '解释一下 React 的 useEffect 生命周期是如何工作的？',
  '如何优化 SQL 查询性能？',
  '什么是 RAG（检索增强生成）？',
  '解释 JavaScript 中的事件循环机制是如何运行的？'
];

/**
 * 创建 onboarding 模块实例
 * @param {object} storage - chrome.storage.local 兼容接口
 * @param {object} [settingsStorage] - chrome.storage.sync 兼容接口（用于检测 API 配置）
 * @param {object} [options] - 附加选项
 * @param {Function} [options.t] - i18n 翻译函数 t(key, params) => string
 * @returns {object} onboarding API
 */
export function _createOnboardingModule(storage, settingsStorage, options = {}) {
  const tFn = options.t || null;
  return {
    /**
     * 检查是否需要显示引导
     * @returns {Promise<boolean>}
     */
    async shouldShowOnboarding() {
      const data = await storage.get(STORAGE_KEY);
      return !data[STORAGE_KEY];
    },

    /**
     * 标记引导完成
     * @returns {Promise<void>}
     */
    async completeOnboarding() {
      await storage.set({ [STORAGE_KEY]: true });
    },

    /**
     * 重置引导状态（设置中重新触发用）
     * @returns {Promise<void>}
     */
    async resetOnboarding() {
      await storage.remove(STORAGE_KEY);
    },

    /**
     * 获取引导步骤配置
     * @returns {Array<object>}
     */
    getStepConfig() {
      return ONBOARDING_STEPS.map(s => ({ ...s }));
    },

    /**
     * 获取本地化的引导步骤配置
     * 使用注入的 t 函数翻译步骤标题和描述
     * @returns {Array<object>}
     */
    getLocalizedStepConfig() {
      if (!tFn) return this.getStepConfig();
      return ONBOARDING_STEPS.map(s => {
        const i18nKeys = ONBOARDING_STEP_I18N[s.id];
        return {
          ...s,
          title: tFn(i18nKeys.title) || s.title,
          description: tFn(i18nKeys.description) || s.description,
        };
      });
    },

    /**
     * 获取步骤总数
     * @returns {number}
     */
    getTotalSteps() {
      return ONBOARDING_STEPS.length;
    },

    /**
     * 检测 API 是否已配置
     * @returns {Promise<boolean>}
     */
    async isAPIConfigured() {
      if (!settingsStorage) return false;
      try {
        const defaults = {
          apiKey: '',
          apiProtocol: 'openai',
          apiBaseUrl: '',
          model: ''
        };
        let data;
        // Support both promise-based (test mock) and callback-based (chrome.storage.sync) APIs
        const result = settingsStorage.get(defaults, (d) => { data = d; });
        if (result && typeof result.then === 'function') {
          data = await result;
        }
        if (!data) {
          // Fallback: try promise-style with single arg
          data = await settingsStorage.get(defaults);
        }
        return !!(data && data.apiKey && data.apiBaseUrl && data.model);
      } catch (_e) {
        return false;
      }
    },

    /**
     * 获取推荐的步骤序列（根据 API 是否已配置自动跳过 config 步骤）
     * @returns {Promise<Array<object>>}
     */
    async getRecommendedSteps() {
      const allSteps = this.getStepConfig();
      const apiConfigured = await this.isAPIConfigured();

      if (apiConfigured) {
        // API 已配置：跳过 config 和 test-connection 步骤
        return allSteps.filter(s => s.id !== 'config' && s.id !== 'test-connection');
      }
      return allSteps;
    },

    /**
     * 获取随机示例问题
     * @returns {string}
     */
    getSampleQuestion() {
      const idx = Math.floor(Math.random() * SAMPLE_QUESTIONS.length);
      return SAMPLE_QUESTIONS[idx];
    },

    /**
     * 获取所有示例问题
     * @returns {string[]}
     */
    getSampleQuestions() {
      return [...SAMPLE_QUESTIONS];
    }
  };
}

/** 导出 i18n key 映射，供测试和外部验证 */
export { ONBOARDING_STEP_I18N };

/** 默认实例（使用 chrome.storage.local），仅在浏览器环境中可用 */
export const onboarding = typeof chrome !== 'undefined' && chrome.storage
  ? _createOnboardingModule(chrome.storage.local, chrome.storage.sync || chrome.storage.local)
  : null;
