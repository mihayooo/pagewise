/**
 * Chrome Web Store 发布检查辅助 — 从 bookmark-store-prep.js (R130) 拆分
 *
 * 包含：
 *   - validateContentSecurityPolicy: CSP 校验
 *   - generatePermissionJustification: 权限正当理由生成
 *   - detectLanguageSupport: 语言支持检测
 *   - suggestManifestImprovements: 改进建议
 *   - checkStoreSubmissionReadiness: 综合提交准备检查
 */

import { validateManifest, checkIcons } from './bookmark-store-prep.js'

// ==================== 私有常量 ====================

const MAX_DESCRIPTION_LENGTH = 132

const DANGEROUS_PERMISSIONS = Object.freeze([
  'debugger', 'pageCapture', 'webRequest', 'webRequestBlocking',
  'declarativeNetRequest', 'desktopCapture', 'nativeMessaging',
])

const PERMISSION_JUSTIFICATIONS = Object.freeze({
  storage: '用于在浏览器本地存储用户设置、对话历史和知识库数据。',
  sidePanel: '用于在浏览器侧边栏中显示 AI 问答面板，提供沉浸式阅读交互体验。',
  contextMenus: '用于在右键菜单中添加"向 AI 提问"等快捷操作入口。',
  tabs: '用于获取当前标签页的 URL 和标题，以便 AI 理解用户正在阅读的页面上下文。',
  activeTab: '用于仅在用户主动操作时访问当前标签页内容，遵循最小权限原则。',
  bookmarks: '用于读取和管理浏览器书签，实现书签智能分析和知识图谱功能。',
  notifications: '用于在死链检测完成、新书签等事件时向用户推送浏览器通知。',
  alarms: '用于设置定时任务，如定期链接检查、自动备份等周期性操作。',
})

const CSP_REQUIREMENTS = Object.freeze({
  required: ["script-src 'self'", "object-src 'self'"],
  forbidden: ["'unsafe-eval'", "'unsafe-inline'", 'data:', 'http:', 'https:'],
})

// ==================== CSP Validation ====================

/**
 * @param {string} csp - CSP 策略字符串
 * * @returns {{valid: boolean, issues: string[]}}
 */
export function validateContentSecurityPolicy(manifest) {
  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings, policy: null }
  }

  const csp = manifest.content_security_policy

  if (!csp) {
    errors.push('content_security_policy is missing — Chrome Web Store requires explicit CSP')
    return { valid: false, errors, warnings, policy: null }
  }

  let policyStr = ''
  if (typeof csp === 'string') {
    policyStr = csp
  } else if (typeof csp === 'object' && csp.extension_pages) {
    policyStr = csp.extension_pages
  } else {
    errors.push('content_security_policy must be a string or object with extension_pages')
    return { valid: false, errors, warnings, policy: null }
  }

  for (const forbidden of CSP_REQUIREMENTS.forbidden) {
    if (policyStr.includes(forbidden)) {
      errors.push(`CSP contains forbidden directive: ${forbidden}`)
    }
  }

  for (const required of CSP_REQUIREMENTS.required) {
    const directive = required.split(' ')[0]
    if (!policyStr.includes(directive)) {
      warnings.push(`CSP missing recommended directive: ${required}`)
    }
  }

  if (manifest.content_security_policy.sandbox) {
    warnings.push('CSP has sandbox policy — verify it does not restrict extension functionality')
  }

  return { valid: errors.length === 0, errors, warnings, policy: policyStr }
}

// ==================== Permission Justification ====================

/**
 * @param {Array<string>} permissions - 权限列表
 * * @returns {string} 权限正当理由说明
 */
export function generatePermissionJustification(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { permissions: [] }
  }

  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const result = []

  for (const perm of perms) {
    const template = PERMISSION_JUSTIFICATIONS[perm]
    result.push({
      permission: perm,
      justification: template || `需要 ${perm} 权限以支持扩展功能。请补充具体使用场景说明。`,
      hasTemplate: !!template,
    })
  }

  return { permissions: result }
}

// ==================== Language Support ====================

/**
 * @param {object} manifest - manifest.json
 * * @returns {{supported: string[], missing: string[]}}
 */
export function detectLanguageSupport(manifest, localesInfo) {
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { defaultLocale: null, availableLocales: [], isIntl: false, warnings: ['manifest is invalid'] }
  }

  const defaultLocale = manifest.default_locale || null

  if (!defaultLocale) {
    warnings.push('default_locale is not set — Chrome Web Store will default to English')
  }

  const availableLocales = (localesInfo && Array.isArray(localesInfo.availableLocales))
    ? localesInfo.availableLocales
    : []

  if (availableLocales.length === 0) {
    warnings.push('no locale files detected — extension will use fallback strings only')
  }

  if (localesInfo && localesInfo.messagesByLocale) {
    for (const locale of availableLocales) {
      const messages = localesInfo.messagesByLocale[locale]
      if (!messages || typeof messages !== 'object') {
        warnings.push(`locale "${locale}" has no messages`)
        continue
      }
      if (!messages.extName) {
        warnings.push(`locale "${locale}" is missing required key: extName`)
      }
      if (!messages.extDescription) {
        warnings.push(`locale "${locale}" is missing required key: extDescription`)
      }
    }
  }

  return {
    defaultLocale,
    availableLocales: [...availableLocales],
    isIntl: availableLocales.length >= 2,
    warnings,
  }
}

// ==================== Improvement Suggestions ====================

/**
 * @param {object} manifest - manifest.json
 * * @returns {string[]} 改进建议列表
 */
export function suggestManifestImprovements(manifest) {
  const suggestions = []

  if (!manifest || typeof manifest !== 'object') {
    return { suggestions: [{ severity: 'error', message: 'manifest is invalid' }], score: 0 }
  }

  if (!manifest.name) suggestions.push({ severity: 'error', message: 'name is required' })
  if (!manifest.version) suggestions.push({ severity: 'error', message: 'version is required' })
  if (!manifest.description) suggestions.push({ severity: 'error', message: 'description is required' })
  if (!manifest.icons || Object.keys(manifest.icons).length === 0) {
    suggestions.push({ severity: 'error', message: 'icons are required' })
  }

  if (!manifest.content_security_policy) {
    suggestions.push({ severity: 'error', message: 'add content_security_policy for security' })
  }
  if (!manifest.default_locale) {
    suggestions.push({ severity: 'warning', message: 'set default_locale for i18n support' })
  }
  if (!manifest.minimum_chrome_version) {
    suggestions.push({ severity: 'warning', message: 'set minimum_chrome_version to avoid compatibility issues' })
  }
  if (manifest.manifest_version !== 3) {
    suggestions.push({ severity: 'error', message: 'must use Manifest V3 for Chrome Web Store' })
  }

  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        suggestions.push({ severity: 'warning', message: 'content_scripts uses <all_urls> — consider limiting scope' })
        break
      }
    }
  }

  if (Array.isArray(manifest.host_permissions)) {
    const broad = manifest.host_permissions.filter(h => h === '<all_urls>' || h === '*://*/*')
    if (broad.length > 0) {
      suggestions.push({ severity: 'warning', message: 'host_permissions has broad patterns — may trigger extra review' })
    }
  }

  if (!manifest.author) {
    suggestions.push({ severity: 'info', message: 'consider adding author field for credibility' })
  }
  if (!manifest.options_page && !manifest.options_ui) {
    suggestions.push({ severity: 'info', message: 'consider adding options page for user configuration' })
  }
  if (!manifest.action && !manifest.browser_action) {
    suggestions.push({ severity: 'info', message: 'no action/browser_action defined — users may not know how to activate' })
  }

  let score = 100
  for (const s of suggestions) {
    if (s.severity === 'error') score -= 20
    else if (s.severity === 'warning') score -= 10
    else if (s.severity === 'info') score -= 3
  }
  score = Math.max(0, score)

  return { suggestions, score }
}

// ==================== Submission Readiness ====================

/**
 * @param {object} manifest - manifest.json
 * * @returns {{ready: boolean, issues: string[], warnings: string[]}}
 */
export function checkStoreSubmissionReadiness(manifest, localesInfo) {
  const checks = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      ready: false,
      score: 0,
      checks: [{ id: 'manifest-valid', label: 'manifest 有效性', passed: false, detail: 'manifest must be a non-null object' }],
    }
  }

  const validation = validateManifest(manifest)
  checks.push({
    id: 'manifest-valid',
    label: 'manifest.json 格式校验',
    passed: validation.valid,
    detail: validation.valid ? '所有必填字段正确' : `错误: ${validation.errors.join('; ')}`,
  })

  const iconResult = checkIcons(manifest)
  checks.push({
    id: 'icons-complete',
    label: '图标完整性 (16/48/128px)',
    passed: iconResult.valid,
    detail: iconResult.valid ? '所有必需图标尺寸已配置' : `缺少: ${iconResult.missing.join(', ')}`,
  })

  const cspResult = validateContentSecurityPolicy(manifest)
  checks.push({
    id: 'csp-configured',
    label: 'Content Security Policy',
    passed: cspResult.valid,
    detail: cspResult.valid ? 'CSP 安全策略已配置' : `问题: ${cspResult.errors.join('; ')}`,
  })

  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const dangerousFound = perms.filter(p => DANGEROUS_PERMISSIONS.includes(p))
  checks.push({
    id: 'permissions-safe',
    label: '权限安全性检查',
    passed: dangerousFound.length === 0,
    detail: dangerousFound.length === 0 ? '无高危权限' : `包含高危权限: ${dangerousFound.join(', ')}`,
  })

  const desc = manifest.description || ''
  const isI18n = desc.startsWith('__MSG_')
  checks.push({
    id: 'description-valid',
    label: '描述长度检查 (≤132字符)',
    passed: isI18n || (desc.length > 0 && desc.length <= MAX_DESCRIPTION_LENGTH),
    detail: isI18n ? '使用 i18n 占位符（需确保实际翻译≤132字符）' : `长度: ${desc.length}/${MAX_DESCRIPTION_LENGTH}`,
  })

  const langResult = detectLanguageSupport(manifest, localesInfo)
  checks.push({
    id: 'i18n-support',
    label: '多语言支持 (i18n)',
    passed: langResult.availableLocales.length >= 2,
    detail: langResult.availableLocales.length >= 2
      ? `支持 ${langResult.availableLocales.join(', ')}`
      : `仅支持 ${langResult.availableLocales.length} 个语言，建议至少 2 个`,
  })

  let contentScriptsSafe = true
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        contentScriptsSafe = false
      }
    }
  }
  checks.push({
    id: 'content-scripts-safe',
    label: 'Content Scripts 范围检查',
    passed: contentScriptsSafe,
    detail: contentScriptsSafe ? 'content_scripts 范围合理' : 'content_scripts 使用 <all_urls>，建议缩小范围',
  })

  const hasSW = manifest.background && manifest.background.service_worker
  checks.push({
    id: 'service-worker',
    label: 'Background Service Worker',
    passed: !!hasSW,
    detail: hasSW ? `已配置: ${manifest.background.service_worker}` : '未配置 background service_worker',
  })

  const passed = checks.filter(c => c.passed).length
  const score = Math.round((passed / checks.length) * 100)

  const requiredIds = ['manifest-valid', 'icons-complete', 'csp-configured', 'permissions-safe', 'description-valid']
  const ready = requiredIds.every(id => checks.find(c => c.id === id)?.passed)

  return { ready, score, checks }
}
