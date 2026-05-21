/**
 * SettingsManager — 统一设置管理器
 *
 * R248: UnifiedSettingsPanel
 *
 * 功能:
 *   1. 设置聚合: 从 15+ 个模块收集所有可配置项，统一注册到 SettingsRegistry
 *   2. 设置分组: 按类别（外观/AI/书签/学习/隐私/高级）组织
 *   3. 设置导入导出: exportSettings() / importSettings() JSON 格式
 *   4. 设置变更事件: onSettingChange(key, callback) 事件驱动
 *   5. 设置校验: 每个设置项附带 validator，非法值拒绝写入
 *   6. 设置重置: resetToDefaults(scope?) 按类别或全部重置
 *   7. Schema 生成: getSchema() 供 UI 渲染消费
 *
 * 设计约束:
 *   - 纯 ES Module，不依赖 DOM 或 Chrome API
 *   - 通过依赖注入 storage 接口
 *   - 所有文件 ≤ 400 行
 *
 * @module lib/settings-manager
 */

// ==================== 常量 ====================

const STORAGE_KEY = 'pagewise_settings'

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
const SENSITIVE_KEYS = new Set(['apiKey'])

/** 支持的语言列表 */
const SUPPORTED_LOCALES = ['zh-CN', 'en-US']

// ==================== 内置设置定义 ====================

const BUILTIN_SETTINGS = [
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

// ==================== 工厂函数 ====================

/**
 * 创建 SettingsManager 实例
 *
 * @param {object} storage — chrome.storage 兼容接口 (get/set/remove)
 * @returns {SettingsManagerAPI}
 */
export function createSettingsManager(storage) {
  /** @type {Map<string, object>} key → setting definition */
  const _registry = new Map()

  /** @type {Map<string, Set<Function>>} key → callbacks */
  const _listeners = new Map()

  /** @type {object|null} 内存缓存 */
  let _cache = null

  /** @type {Promise<void>|null} 写锁队列 */
  let _writeQueue = Promise.resolve()

  // 注册所有内置设置
  for (const def of BUILTIN_SETTINGS) {
    _registry.set(def.key, def)
  }

  // ==================== 内部方法 ====================

  /** 从 storage 加载全部设置 */
  async function _load() {
    if (_cache) return _cache
    try {
      const raw = await storage.get(STORAGE_KEY)
      _cache = raw[STORAGE_KEY] || {}
    } catch (_e) {
      _cache = {}
    }
    return _cache
  }

  /** 保存全部设置到 storage（串行化，防止并发覆盖） */
  async function _save(data) {
    _cache = data
    try {
      await storage.set({ [STORAGE_KEY]: data })
    } catch (_e) {
      // 静默处理
    }
  }

  /**
   * 串行化写操作 — 所有修改操作排队执行，避免并发覆盖
   * @param {Function} fn — 异步写操作
   * @returns {Promise<void>}
   */
  function _enqueue(fn) {
    _writeQueue = _writeQueue.then(fn, fn)
    return _writeQueue
  }

  /** 获取默认值映射 */
  function _getDefaults() {
    const defaults = {}
    for (const [key, def] of _registry) {
      defaults[key] = def.default
    }
    return defaults
  }

  /** 校验单个设置值 */
  function _validate(key, value) {
    const def = _registry.get(key)
    if (!def) return // 未注册的 key 允许写入（兼容扩展）
    if (def.validator && !def.validator(value)) {
      throw new Error(`设置校验失败: ${key} — ${def.validationMessage || '值不合法'}`)
    }
  }

  /** 触发变更事件 */
  function _emit(key, value) {
    const cbs = _listeners.get(key)
    if (!cbs || cbs.size === 0) return
    for (const cb of cbs) {
      try { cb(key, value) } catch (_e) { /* 静默 */ }
    }
  }

  // ==================== API ====================

  return {
    /**
     * 获取单个设置值（带默认值回退）
     * @param {string} key
     * @returns {Promise<*>}
     */
    async get(key) {
      const data = await _load()
      if (key in data) return data[key]
      const def = _registry.get(key)
      return def ? def.default : undefined
    },

    /**
     * 设置单个值（含校验 + 事件触发，串行化防并发）
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
      return _enqueue(async () => {
        _validate(key, value)
        const data = await _load()
        const oldValue = key in data ? data[key] : (_registry.get(key)?.default)
        if (oldValue === value) return // 值未变化，跳过
        data[key] = value
        await _save(data)
        _emit(key, value)
      })
    },

    /**
     * 获取所有设置（深拷贝）
     * @returns {Promise<object>}
     */
    async getAll() {
      const data = await _load()
      const defaults = _getDefaults()
      return { ...defaults, ...data }
    },

    /**
     * 获取完整 Schema（供 UI 渲染）
     * @returns {object} key → { type, label, description, default, category, options?, min?, max? }
     */
    getSchema() {
      const schema = {}
      for (const [key, def] of _registry) {
        const entry = {
          type: def.type,
          label: def.label,
          description: def.description,
          default: def.default,
          category: def.category,
        }
        if (def.options) entry.options = def.options.map(o => ({ ...o }))
        if (def.min !== undefined) entry.min = def.min
        if (def.max !== undefined) entry.max = def.max
        schema[key] = entry
      }
      return schema
    },

    /**
     * 按分类获取 Schema 子集
     * @param {string} category
     * @returns {object}
     */
    getSchemaByCategory(category) {
      const schema = this.getSchema()
      const result = {}
      for (const [key, def] of Object.entries(schema)) {
        if (def.category === category) {
          result[key] = def
        }
      }
      return result
    },

    /**
     * 注册设置变更监听
     * @param {string} key
     * @param {Function} callback — (key, value) => void
     * @returns {Function} 取消订阅函数
     */
    onSettingChange(key, callback) {
      if (!_listeners.has(key)) _listeners.set(key, new Set())
      _listeners.get(key).add(callback)
      return () => {
        const cbs = _listeners.get(key)
        if (cbs) cbs.delete(callback)
      }
    },

    /**
     * 导出全部设置为 JSON 字符串（跨设备迁移）
     * @returns {Promise<string>}
     */
    async exportSettings() {
      const data = await _load()
      const defaults = _getDefaults()
      const merged = { ...defaults, ...data }
      // 清除敏感字段
      const safeSettings = {}
      for (const [k, v] of Object.entries(merged)) {
        if (SENSITIVE_KEYS.has(k)) {
          safeSettings[k] = '' // 清空敏感值
        } else {
          safeSettings[k] = v
        }
      }
      const exportData = {
        version: 1,
        settings: safeSettings,
        exportedAt: Date.now(),
      }
      return JSON.stringify(exportData, null, 2)
    },

    /**
     * 从 JSON 字符串导入设置
     * @param {string} json
     * @returns {Promise<void>}
     */
    async importSettings(json) {
      let parsed
      try {
        parsed = JSON.parse(json)
      } catch (_e) {
        throw new Error('导入失败: JSON 格式无效')
      }
      if (!parsed.settings || typeof parsed.settings !== 'object') {
        throw new Error('导入失败: 缺少 settings 字段')
      }
      // 校验所有待导入值
      for (const [key, value] of Object.entries(parsed.settings)) {
        if (SENSITIVE_KEYS.has(key) && !value) continue
        _validate(key, value)
      }
      // 校验通过后串行写入
      return _enqueue(async () => {
        const data = await _load()
        for (const [key, value] of Object.entries(parsed.settings)) {
          if (SENSITIVE_KEYS.has(key) && !value) continue
          data[key] = value
        }
        await _save(data)
        for (const [key, value] of Object.entries(parsed.settings)) {
          if (SENSITIVE_KEYS.has(key) && !value) continue
          _emit(key, value)
        }
      })
    },

    /**
     * 重置为默认值
     * @param {string} [scope] — 分类名，不传则重置全部
     * @returns {Promise<void>}
     */
    async resetToDefaults(scope) {
      return _enqueue(async () => {
        const data = await _load()
        const defaults = _getDefaults()
        const keysToReset = []
        for (const [key, def] of _registry) {
          if (!scope || def.category === scope) {
            keysToReset.push(key)
          }
        }
        for (const key of keysToReset) {
          const oldValue = key in data ? data[key] : defaults[key]
          data[key] = defaults[key]
          if (oldValue !== defaults[key]) {
            _emit(key, defaults[key])
          }
        }
        await _save(data)
      })
    },

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
  }
}

/**
 * @typedef {Object} SettingsManagerAPI
 * @property {(key: string) => Promise<*>} get
 * @property {(key: string, value: *) => Promise<void>} set
 * @property {() => Promise<object>} getAll
 * @property {() => object} getSchema
 * @property {(category: string) => object} getSchemaByCategory
 * @property {(key: string, cb: Function) => Function} onSettingChange
 * @property {() => Promise<string>} exportSettings
 * @property {(json: string) => Promise<void>} importSettings
 * @property {(scope?: string) => Promise<void>} resetToDefaults
 * @property {(def: object) => void} registerSetting
 * @property {() => string[]} getRegisteredKeys
 */
