/**
 * BookmarkOnboarding — 书签引导向导模块
 *
 * 首次安装时显示分步引导，帮助用户了解核心功能并完成初始设置。
 * 使用 chrome.storage.local 存储引导状态和用户偏好。
 *
 * 引导步骤:
 *   1. welcome     — 欢迎页，介绍产品定位
 *   2. features    — 核心功能介绍（书签采集、知识图谱、AI 推荐）
 *   3. theme       — 选择主题偏好（浅色/深色/跟随系统）
 *   4. autoCollect — 启用/禁用自动书签采集
 *
 * i18n:
 *   - 内置 zh-CN / en-US 双语 locale 包（22 个 key）
 *   - getLocales() 获取所有内置 locale
 *   - t(key, locale) 翻译辅助函数
 *   - 与 _locales/ Chrome Web Store 消息保持同步
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API（通过依赖注入）
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 与现有 lib/onboarding.js（通用引导）互补，不冲突
 */

// ==================== I18n Locale Data ====================

/**
 * 内置引导向导语言包
 * 22 个 key，覆盖所有用户可见字符串
 */
const ONBOARDING_LOCALES = Object.freeze({
  'zh-CN': Object.freeze({
    'onboarding.welcome.title': '欢迎使用书签智能助手',
    'onboarding.welcome.description': 'PageWise 可以将你的浏览器书签转化为智能知识网络，帮助你更高效地管理和发现知识。',
    'onboarding.features.title': '核心功能',
    'onboarding.features.description': '了解 PageWise 书签助手的三大核心能力。',
    'onboarding.features.bookmarkCollect.title': '智能书签采集',
    'onboarding.features.bookmarkCollect.description': '自动读取并分析你的浏览器书签，构建结构化知识索引。',
    'onboarding.features.knowledgeGraph.title': '知识图谱',
    'onboarding.features.knowledgeGraph.description': '将书签之间的关联关系可视化，发现隐藏的知识联系。',
    'onboarding.features.aiRecommend.title': 'AI 智能推荐',
    'onboarding.features.aiRecommend.description': '基于你的阅读习惯和知识结构，推荐有价值的学习内容。',
    'onboarding.theme.title': '选择主题',
    'onboarding.theme.description': '选择你喜欢的界面主题风格，可以随时在设置中更改。',
    'onboarding.theme.light': '浅色',
    'onboarding.theme.dark': '深色',
    'onboarding.theme.system': '跟随系统',
    'onboarding.autoCollect.title': '自动采集',
    'onboarding.autoCollect.description': '是否启用书签自动采集？启用后 PageWise 会自动分析新添加的书签。',
    'onboarding.complete': '设置完成！开始探索你的书签知识网络吧。',
    'onboarding.progress': '{{current}} / {{total}}',
    'onboarding.btn.next': '下一步',
    'onboarding.btn.prev': '上一步',
    'onboarding.btn.skip': '跳过',
  }),
  'en-US': Object.freeze({
    'onboarding.welcome.title': 'Welcome to Bookmark Assistant',
    'onboarding.welcome.description': 'PageWise transforms your browser bookmarks into an intelligent knowledge network, helping you manage and discover knowledge more efficiently.',
    'onboarding.features.title': 'Core Features',
    'onboarding.features.description': 'Discover the three core capabilities of PageWise Bookmark Assistant.',
    'onboarding.features.bookmarkCollect.title': 'Smart Bookmark Collection',
    'onboarding.features.bookmarkCollect.description': 'Automatically read and analyze your browser bookmarks, building a structured knowledge index.',
    'onboarding.features.knowledgeGraph.title': 'Knowledge Graph',
    'onboarding.features.knowledgeGraph.description': 'Visualize relationships between bookmarks and discover hidden knowledge connections.',
    'onboarding.features.aiRecommend.title': 'AI Smart Recommendations',
    'onboarding.features.aiRecommend.description': 'Get valuable learning content recommendations based on your reading habits and knowledge structure.',
    'onboarding.theme.title': 'Choose Theme',
    'onboarding.theme.description': 'Choose your preferred interface theme. You can change it anytime in settings.',
    'onboarding.theme.light': 'Light',
    'onboarding.theme.dark': 'Dark',
    'onboarding.theme.system': 'Follow System',
    'onboarding.autoCollect.title': 'Auto Collection',
    'onboarding.autoCollect.description': 'Enable automatic bookmark collection? When enabled, PageWise will automatically analyze newly added bookmarks.',
    'onboarding.complete': 'Setup complete! Start exploring your bookmark knowledge network.',
    'onboarding.progress': '{{current}} / {{total}}',
    'onboarding.btn.next': 'Next',
    'onboarding.btn.prev': 'Back',
    'onboarding.btn.skip': 'Skip',
  }),
})

// ==================== I18n Helper ====================

/**
 * 翻译辅助函数 — 从内置 locale 获取翻译文本
 *
 * @param {string} key - locale key（如 'onboarding.welcome.title'）
 * @param {string} [locale='zh-CN'] - 目标语言
 * @param {Object} [params] - 插值参数（如 { current: 1, total: 4 }）
 * @returns {string} 翻译文本；未找到时返回原始 key
 */
export function t(key, locale, params) {
  const loc = locale || 'zh-CN'
  const messages = ONBOARDING_LOCALES[loc] || ONBOARDING_LOCALES['zh-CN']
  let text = messages[key]
  if (text === undefined) {
    // 尝试回退到 zh-CN
    text = ONBOARDING_LOCALES['zh-CN'][key]
    if (text === undefined) return key
  }
  if (params && typeof params === 'object') {
    text = text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return params[name] !== undefined ? String(params[name]) : match
    })
  }
  return text
}

/**
 * 获取内置 locale 语言包
 * @param {string} [locale] - 指定语言；不传返回全部
 * @returns {Object} 语言包或 { 'zh-CN': {...}, 'en-US': {...} }
 */
export function getLocales(locale) {
  if (locale) return ONBOARDING_LOCALES[locale] || null
  return { ...ONBOARDING_LOCALES }
}

// ==================== Storage Keys ====================

const STORAGE_KEYS = Object.freeze({
  completed: 'bookmarkOnboardingCompleted',
  completedAt: 'bookmarkOnboardingCompletedAt',
  step: 'bookmarkOnboardingStep',
  theme: 'bookmarkOnboardingTheme',
  autoCollect: 'bookmarkOnboardingAutoCollect',
})

// ==================== Valid Theme Values ====================

const VALID_THEMES = ['light', 'dark', 'system']

// ==================== Onboarding Steps ====================

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: '欢迎使用书签智能助手',
    description: 'PageWise 可以将你的浏览器书签转化为智能知识网络，帮助你更高效地管理和发现知识。',
    icon: '👋',
    canSkip: true,
  },
  {
    id: 'features',
    title: '核心功能',
    description: '了解 PageWise 书签助手的三大核心能力。',
    icon: '✨',
    canSkip: true,
  },
  {
    id: 'theme',
    title: '选择主题',
    description: '选择你喜欢的界面主题风格，可以随时在设置中更改。',
    icon: '🎨',
    canSkip: true,
  },
  {
    id: 'autoCollect',
    title: '自动采集',
    description: '是否启用书签自动采集？启用后 PageWise 会自动分析新添加的书签。',
    icon: '📥',
    canSkip: true,
  },
]

// ==================== Core Features ====================

const CORE_FEATURES = [
  {
    id: 'bookmarkCollect',
    title: '智能书签采集',
    description: '自动读取并分析你的浏览器书签，构建结构化知识索引。',
    icon: '🔖',
  },
  {
    id: 'knowledgeGraph',
    title: '知识图谱',
    description: '将书签之间的关联关系可视化，发现隐藏的知识联系。',
    icon: '🕸️',
  },
  {
    id: 'aiRecommend',
    title: 'AI 智能推荐',
    description: '基于你的阅读习惯和知识结构，推荐有价值的学习内容。',
    icon: '🤖',
  },
]

// ==================== Theme Choices ====================

const THEME_CHOICES = [
  { id: 'light', label: '浅色', icon: '☀️' },
  { id: 'dark', label: '深色', icon: '🌙' },
  { id: 'system', label: '跟随系统', icon: '💻' },
]

// ==================== Module Factory ====================

/**
 * 创建 BookmarkOnboarding 模块实例
 *
 * @param {object} storage - chrome.storage.local 兼容接口 (get/set/remove)
 * @returns {object} BookmarkOnboarding API
 */
export function _createBookmarkOnboardingModule(storage) {
  return {
    // ─── Completion State ───

    /**
     * 检查是否需要显示引导向导
     * @returns {Promise<boolean>}
     */
    async shouldShowOnboarding() {
      const data = await storage.get(STORAGE_KEYS.completed)
      return !data[STORAGE_KEYS.completed]
    },

    /**
     * 标记引导完成
     * @returns {Promise<void>}
     */
    async completeOnboarding() {
      await storage.set({
        [STORAGE_KEYS.completed]: true,
        [STORAGE_KEYS.completedAt]: Date.now(),
      })
    },

    /**
     * 重置引导状态（设置中重新触发用）
     * @returns {Promise<void>}
     */
    async resetOnboarding() {
      await storage.remove([
        STORAGE_KEYS.completed,
        STORAGE_KEYS.completedAt,
        STORAGE_KEYS.step,
      ])
    },

    // ─── Steps Configuration ───

    /**
     * 获取引导步骤配置
     * @returns {Array<object>} 步骤副本数组
     */
    getSteps() {
      return ONBOARDING_STEPS.map(s => ({ ...s }))
    },

    /**
     * 获取步骤总数
     * @returns {number}
     */
    getTotalSteps() {
      return ONBOARDING_STEPS.length
    },

    // ─── Step Navigation ───

    /**
     * 获取当前步骤索引 (0-based)
     * @returns {Promise<number>}
     */
    async getCurrentStepIndex() {
      const data = await storage.get(STORAGE_KEYS.step)
      const idx = data[STORAGE_KEYS.step]
      if (typeof idx !== 'number' || idx < 0) return 0
      return Math.min(idx, ONBOARDING_STEPS.length - 1)
    },

    /**
     * 设置当前步骤索引
     * @param {number} index
     * @returns {Promise<void>}
     */
    async setCurrentStepIndex(index) {
      await storage.set({ [STORAGE_KEYS.step]: index })
    },

    /**
     * 前进到下一步
     * @returns {Promise<number>} 新的步骤索引，已完成返回 -1
     */
    async nextStep() {
      const completed = await this.shouldShowOnboarding()
      if (!completed) {
        // Already completed — check the stored flag directly
        const data = await storage.get(STORAGE_KEYS.completed)
        if (data[STORAGE_KEYS.completed]) return -1
      }

      const current = await this.getCurrentStepIndex()
      const maxIdx = ONBOARDING_STEPS.length - 1
      const next = Math.min(current + 1, maxIdx)
      await this.setCurrentStepIndex(next)
      return next
    },

    /**
     * 后退到上一步
     * @returns {Promise<number>} 新的步骤索引
     */
    async prevStep() {
      const current = await this.getCurrentStepIndex()
      const prev = Math.max(current - 1, 0)
      await this.setCurrentStepIndex(prev)
      return prev
    },

    /**
     * 跳转到指定步骤
     * @param {number} index
     * @returns {Promise<number>} 实际跳转到的步骤索引
     */
    async goToStep(index) {
      const clamped = Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1))
      await this.setCurrentStepIndex(clamped)
      return clamped
    },

    // ─── User Preferences ───

    /**
     * 获取主题选项列表
     * @returns {Array<object>}
     */
    getThemeChoices() {
      return THEME_CHOICES.map(c => ({ ...c }))
    },

    /**
     * 设置用户主题偏好
     * @param {'light'|'dark'|'system'} theme
     * @returns {Promise<void>}
     */
    async setUserTheme(theme) {
      if (!VALID_THEMES.includes(theme)) {
        throw new Error(`Invalid theme: ${theme}. Must be one of: ${VALID_THEMES.join(', ')}`)
      }
      await storage.set({ [STORAGE_KEYS.theme]: theme })
    },

    /**
     * 获取用户主题偏好
     * @returns {Promise<string|null>}
     */
    async getUserTheme() {
      const data = await storage.get(STORAGE_KEYS.theme)
      return data[STORAGE_KEYS.theme] ?? null
    },

    /**
     * 设置自动采集开关
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setAutoCollect(enabled) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`Invalid autoCollect value: must be boolean, got ${typeof enabled}`)
      }
      await storage.set({ [STORAGE_KEYS.autoCollect]: enabled })
    },

    /**
     * 获取自动采集开关状态
     * @returns {Promise<boolean|null>}
     */
    async getAutoCollect() {
      const data = await storage.get(STORAGE_KEYS.autoCollect)
      return data[STORAGE_KEYS.autoCollect] ?? null
    },

    // ─── Core Features ───

    /**
     * 获取核心功能列表（用于 features 步骤展示）
     * @returns {Array<object>}
     */
    getCoreFeatures() {
      return CORE_FEATURES.map(f => ({ ...f }))
    },

    // ─── Progress Tracking ───

    /**
     * 获取引导进度
     * @returns {Promise<{current: number, total: number, percentage: number}>}
     */
    async getProgress() {
      const stepIdx = await this.getCurrentStepIndex()
      const total = ONBOARDING_STEPS.length
      return {
        current: stepIdx + 1,
        total,
        percentage: Math.round(((stepIdx + 1) / total) * 100),
      }
    },
  }
}

/** 默认实例（使用 chrome.storage.local），仅在浏览器环境中可用 */
export const bookmarkOnboarding =
  typeof chrome !== 'undefined' && chrome.storage
    ? _createBookmarkOnboardingModule(chrome.storage.local)
    : null
