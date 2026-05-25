/**
 * SettingsRegistry — 设置注册/校验/分类
 *
 * R250: 从 settings-manager.js 拆分
 * 职责: 常量定义、内置设置项、注册表管理、校验逻辑
 *
 * @module lib/settings-registry
 */

// ==================== 常量 ====================

/** 设置项 UI 控件类型 */
export const SETTING_TYPES = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  SELECT: 'select',
})

/** 设置分组 */
export const SETTING_CATEGORIES = Object.freeze({
  appearance: { label: '外观', icon: '🎨', order: 1 },
  ai:         { label: 'AI', icon: '🤖', order: 2 },
  bookmark:   { label: '书签', icon: '🔖', order: 3 },
  learning:   { label: '学习', icon: '📚', order: 4 },
  privacy:    { label: '隐私', icon: '🔒', order: 5 },
  advanced:   { label: '高级', icon: '⚙️', order: 6 },
})

/** 敏感字段（导出时排除） */
export const SENSITIVE_KEYS = new Set(['apiKey'])

/** 支持的语言列表 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US']

// ==================== 内置设置定义 ====================

/** BUILTIN_SETTINGS 常量 */
export const BUILTIN_SETTINGS = [
  // ─── 外观 (appearance) ───
  {
    key: 'theme',
    type: SETTING_TYPES.SELECT,
    label: '主题',
    description: '界面主题风格',
    default: 'light',
    category: 'appearance',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'system', label: '跟随系统' },
    ],
    validator: (v) => ['light', 'dark', 'system'].includes(v),
    validationMessage: 'theme 必须为 light/dark/system',
  },
  {
    key: 'language',
    type: SETTING_TYPES.SELECT,
    label: '语言',
    description: '界面语言',
    default: 'zh-CN',
    category: 'appearance',
    options: [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' },
    ],
    validator: (v) => SUPPORTED_LOCALES.includes(v),
    validationMessage: '不支持的语言',
  },

  // ─── AI ───
  {
    key: 'apiKey',
    type: SETTING_TYPES.TEXT,
    label: 'API Key',
    description: 'AI 服务 API 密钥',
    default: '',
    category: 'ai',
    validator: (v) => typeof v === 'string',
    validationMessage: 'apiKey 必须为字符串',
  },
  {
    key: 'apiProtocol',
    type: SETTING_TYPES.SELECT,
    label: 'API 协议',
    description: 'AI 服务协议类型',
    default: 'openai',
    category: 'ai',
    options: [
      { value: 'openai', label: 'OpenAI 兼容' },
      { value: 'claude', label: 'Claude (Anthropic)' },
    ],
    validator: (v) => ['openai', 'claude'].includes(v),
    validationMessage: 'apiProtocol 必须为 openai/claude',
  },
  {
    key: 'apiBaseUrl',
    type: SETTING_TYPES.TEXT,
    label: 'API 地址',
    description: 'AI 服务端点 URL',
    default: 'https://api.openai.com',
    category: 'ai',
    validator: (v) => typeof v === 'string',
    validationMessage: 'apiBaseUrl 必须为字符串',
  },
  {
    key: 'model',
    type: SETTING_TYPES.TEXT,
    label: '模型名称',
    description: 'AI 模型标识',
    default: 'gpt-4o',
    category: 'ai',
    validator: (v) => typeof v === 'string' && v.length > 0,
    validationMessage: 'model 不能为空',
  },
  {
    key: 'maxTokens',
    type: SETTING_TYPES.NUMBER,
    label: '最大输出长度',
    description: 'AI 响应最大 token 数',
    default: 4096,
    category: 'ai',
    min: 256,
    max: 128000,
    validator: (v) => typeof v === 'number' && v >= 256 && v <= 128000,
    validationMessage: 'maxTokens 范围: 256-128000',
  },
  {
    key: 'maxContentLength',
    type: SETTING_TYPES.NUMBER,
    label: '最大内容长度',
    description: '页面内容截取最大字符数',
    default: 8000,
    category: 'ai',
    min: 1000,
    max: 50000,
    validator: (v) => typeof v === 'number' && v >= 1000 && v <= 50000,
    validationMessage: 'maxContentLength 范围: 1000-50000',
  },

  // ─── 书签 (bookmark) ───
  {
    key: 'autoExtract',
    type: SETTING_TYPES.BOOLEAN,
    label: '自动提取',
    description: '自动提取页面内容',
    default: false,
    category: 'bookmark',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'autoExtract 必须为 boolean',
  },
  {
    key: 'autoCollect',
    type: SETTING_TYPES.BOOLEAN,
    label: '自动书签采集',
    description: '自动分析新添加的书签',
    default: false,
    category: 'bookmark',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'autoCollect 必须为 boolean',
  },

  // ─── 学习 (learning) ───
  {
    key: 'reviewReminderEnabled',
    type: SETTING_TYPES.BOOLEAN,
    label: '复习提醒',
    description: '启用间隔复习提醒通知',
    default: true,
    category: 'learning',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'reviewReminderEnabled 必须为 boolean',
  },
  {
    key: 'maxDailyReviews',
    type: SETTING_TYPES.NUMBER,
    label: '每日最大复习数',
    description: '每天最多复习的卡片数',
    default: 20,
    category: 'learning',
    min: 1,
    max: 100,
    validator: (v) => typeof v === 'number' && v >= 1 && v <= 100,
    validationMessage: 'maxDailyReviews 范围: 1-100',
  },
  {
    key: 'coachStrictness',
    type: SETTING_TYPES.SELECT,
    label: '教练严格程度',
    description: '学习教练的任务难度',
    default: 'normal',
    category: 'learning',
    options: [
      { value: 'relaxed', label: '宽松' },
      { value: 'normal', label: '标准' },
      { value: 'strict', label: '严格' },
    ],
    validator: (v) => ['relaxed', 'normal', 'strict'].includes(v),
    validationMessage: 'coachStrictness 必须为 relaxed/normal/strict',
  },
  {
    key: 'dailyTaskCount',
    type: SETTING_TYPES.NUMBER,
    label: '每日任务数',
    description: '学习教练每日任务数量',
    default: 5,
    category: 'learning',
    min: 1,
    max: 20,
    validator: (v) => typeof v === 'number' && v >= 1 && v <= 20,
    validationMessage: 'dailyTaskCount 范围: 1-20',
  },

  // ─── 隐私 (privacy) ───
  {
    key: 'telemetryEnabled',
    type: SETTING_TYPES.BOOLEAN,
    label: '遥测数据收集',
    description: '允许收集匿名使用统计（纯本地，不上传服务器）',
    default: true,
    category: 'privacy',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'telemetryEnabled 必须为 boolean',
  },
  {
    key: 'dataRetentionDays',
    type: SETTING_TYPES.NUMBER,
    label: '数据保留天数',
    description: '历史数据自动清理周期（天），0 表示永不清理',
    default: 90,
    category: 'privacy',
    min: 0,
    max: 365,
    validator: (v) => typeof v === 'number' && v >= 0 && v <= 365,
    validationMessage: 'dataRetentionDays 范围: 0-365',
  },

  // ─── 高级 (advanced) ───
  {
    key: 'debugMode',
    type: SETTING_TYPES.BOOLEAN,
    label: '调试模式',
    description: '启用详细日志输出',
    default: false,
    category: 'advanced',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'debugMode 必须为 boolean',
  },
  {
    key: 'cacheEnabled',
    type: SETTING_TYPES.BOOLEAN,
    label: 'AI 响应缓存',
    description: '启用 AI 响应缓存以减少 API 调用',
    default: true,
    category: 'advanced',
    validator: (v) => typeof v === 'boolean',
    validationMessage: 'cacheEnabled 必须为 boolean',
  },
]

// ==================== 注册表工厂 ====================

/**
 * 创建设置注册表
 *
 * @returns {SettingsRegistryAPI}
 */
export function createSettingsRegistry() {
  /** @type {Map<string, object>} key → setting definition */
  const _registry = new Map()

  // 注册所有内置设置
  for (const def of BUILTIN_SETTINGS) {
    _registry.set(def.key, def)
  }

  return {
    /**
     * 注册自定义设置项
     * @param {object} def — { key, type, label, description, default, category, options?, validator?, validationMessage? }
     */
    registerSetting(def) {
      if (!def.key) throw new Error('registerSetting: key 必填')
      if (!def.type) throw new Error('registerSetting: type 必填')
      if (!def.category) throw new Error('registerSetting: category 必填')
      _registry.set(def.key, { ...def })
    },

    /** 获取所有已注册的设置 key */
    getRegisteredKeys() {
      return [..._registry.keys()]
    },

    /** 获取内部注册表（供其他子模块使用） */
    getRegistry() {
      return _registry
    },

    /** 获取设置定义（供校验/Schema 使用） */
    getDefinition(key) {
      return _registry.get(key)
    },

    /** 获取默认值映射 */
    getDefaults() {
      const defaults = {}
      for (const [key, def] of _registry) {
        defaults[key] = def.default
      }
      return defaults
    },

    /** 校验单个设置值 */
    validate(key, value) {
      const def = _registry.get(key)
      if (!def) return // 未注册的 key 允许写入（兼容扩展）
      if (def.validator && !def.validator(value)) {
        throw new Error(`设置校验失败: ${key} — ${def.validationMessage || '值不合法'}`)
      }
    },
  }
}

/**
 * @typedef {Object} SettingsRegistryAPI
 * @property {(def: object) => void} registerSetting
 * @property {() => string[]} getRegisteredKeys
 * @property {() => Map<string, object>} getRegistry
 * @property {(key: string) => object|undefined} getDefinition
 * @property {() => object} getDefaults
 * @property {(key: string, value: *) => void} validate
 */
