/**
 * BookmarkOnboardingLocales — 引导向导 i18n 语言包
 *
 * 从 bookmark-onboarding.js (R226) 拆分:
 *   - ONBOARDING_LOCALES — 内置引导向导语言包
 *   - t(key, locale, params) — 翻译辅助函数
 *   - getLocales(locale) — 获取内置 locale 语言包
 *
 * @module lib/bookmark-onboarding-locales
 */

// ==================== I18n Locale Data ====================

/**
 * 内置引导向导语言包
 * 22 个 key，覆盖所有用户可见字符串
 */
export const ONBOARDING_LOCALES = Object.freeze({
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
