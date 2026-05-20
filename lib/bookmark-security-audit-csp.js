/**
 * BookmarkSecurityAudit — CSP 与内容脚本审计子模块
 *
 * 从 bookmark-security-audit.js 拆分:
 *   - auditContentScripts() — 内容脚本安全性审计
 *   - auditCSP()            — Content Security Policy 审计
 *   - generateSecurityReport() — 完整安全报告
 *   - checkCSPDirectives()  — CSP 指令检查
 *
 * @module lib/bookmark-security-audit-csp
 */

/** CSP 中不安全的指令值 */
const UNSAFE_CSP_VALUES = Object.freeze([
  "'unsafe-eval'",
  "'unsafe-inline'",
  'data:',
  '*',
])

/** 最小安全 CSP 策略 */
const MINIMAL_CSP = "script-src 'self'; object-src 'self';"

/** 敏感主机模式（当前子模块未直接使用，保留供未来扩展） */
const _WILDCARD_HOST_PATTERNS = Object.freeze([
  '<all_urls>',
  '*://*/*',
  '*://*/',
  'http://*/*',
  'https://*/*',
])

export { UNSAFE_CSP_VALUES, MINIMAL_CSP }

/**
 * 审计 manifest 中的内容脚本安全性
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditContentScripts(manifest) {
  const issues = []
  const warnings = []
  const recommendations = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings,
      recommendations,
    }
  }

  const contentScripts = manifest.content_scripts
  if (Array.isArray(contentScripts)) {
    for (let i = 0; i < contentScripts.length; i++) {
      const cs = contentScripts[i]
      const prefix = `content_scripts[${i}]`

      if (Array.isArray(cs.matches)) {
        for (const match of cs.matches) {
          if (match === '<all_urls>' || match === '*://*/*') {
            issues.push(`${prefix} matches "${match}" — injects into every page, restrict to specific domains`)
          }
        }
      } else if (!cs.matches) {
        issues.push(`${prefix} has no matches defined`)
      }

      if (cs.run_at === 'document_start') {
        warnings.push(`${prefix} runs at document_start — may interfere with page loading`)
      }

      if (cs.all_frames === true) {
        warnings.push(`${prefix} has all_frames=true — runs in iframes too, verify necessity`)
      }
    }

    if (contentScripts.length > 3) {
      warnings.push(`high content script count (${contentScripts.length}) — may impact performance`)
    }
  }

  const war = manifest.web_accessible_resources
  if (Array.isArray(war)) {
    for (let i = 0; i < war.length; i++) {
      const resource = war[i]
      const prefix = `web_accessible_resources[${i}]`

      if (Array.isArray(resource.matches)) {
        for (const match of resource.matches) {
          if (match === '<all_urls>' || match === '*://*/*') {
            warnings.push(`${prefix} matches "${match}" — exposes resources to all websites`)
          }
        }
      }

      if (Array.isArray(resource.resources)) {
        for (const res of resource.resources) {
          if (res.endsWith('.js') || res.endsWith('.mjs')) {
            warnings.push(`${prefix} exposes script "${res}" — may be used for fingerprinting or attacks`)
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    recommendations.push('content scripts use specific domain matching — good practice')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

/**
 * 审计 manifest 中的 Content Security Policy
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditCSP(manifest) {
  const issues = []
  const warnings = []
  const recommendations = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings,
      recommendations,
    }
  }

  const csp = manifest.content_security_policy

  if (!csp) {
    issues.push('no content_security_policy defined — extension pages may be vulnerable to XSS')
    recommendations.push('add CSP: "extension_pages": "' + MINIMAL_CSP + '"')
    return { passed: false, issues, warnings, recommendations }
  }

  if (typeof csp === 'string') {
    warnings.push('CSP is a string (MV2 style) — Manifest V3 should use object format')
    checkCSPDirectives(csp, issues, warnings)
  } else if (typeof csp === 'object') {
    if (csp.extension_pages) {
      checkCSPDirectives(csp.extension_pages, issues, warnings)
    } else {
      issues.push('content_security_policy is missing "extension_pages" directive')
    }

    if (csp.sandbox) {
      checkCSPDirectives(csp.sandbox, issues, warnings, 'sandbox')
    }

    if (csp.content_scripts) {
      warnings.push('CSP "content_scripts" directive is MV2-only — ignored in Manifest V3')
    }
  } else {
    issues.push('content_security_policy has unexpected type')
  }

  if (issues.length === 0) {
    recommendations.push('CSP policy looks secure')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

/**
 * 检查单个 CSP 指令中的不安全值
 */
function checkCSPDirectives(policy, issues, warnings, label) {
  if (typeof policy !== 'string') {
    issues.push(`CSP ${label || 'extension_pages'} value is not a string`)
    return
  }

  const prefix = label ? `CSP [${label}]` : 'CSP'

  if (policy.includes("'unsafe-eval'")) {
    issues.push(`${prefix} contains 'unsafe-eval' — allows code injection via eval()`)
  }

  if (policy.includes("'unsafe-inline'")) {
    issues.push(`${prefix} contains 'unsafe-inline' — allows inline script injection`)
  }

  if (policy.includes('data:')) {
    warnings.push(`${prefix} allows 'data:' URIs — potential XSS vector`)
  }

  const directives = policy.split(';').map(d => d.trim())
  for (const directive of directives) {
    if (directive.includes('*') && !directive.includes("'self'")) {
      warnings.push(`${prefix} directive uses wildcard: "${directive.trim()}"`)
    }
  }

  const hasScriptSrc = directives.some(d => d.startsWith('script-src'))
  if (!hasScriptSrc) {
    warnings.push(`${prefix} does not define script-src — falls back to default-src`)
  }

  const hasObjectSrc = directives.some(d => d.startsWith('object-src'))
  if (!hasObjectSrc) {
    warnings.push(`${prefix} does not define object-src — plugins may be loaded`)
  }
}

/**
 * 生成完整的安全审计报告
 *
 * @param {object} manifest - manifest.json 对象
 * @param {Function} auditPermissionsFn — 权限审计函数
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function generateSecurityReport(manifest, auditPermissionsFn) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings: [],
      recommendations: [],
    }
  }

  const permResult = auditPermissionsFn(manifest)
  const csResult = auditContentScripts(manifest)
  const cspResult = auditCSP(manifest)

  const allIssues = [
    ...permResult.issues,
    ...csResult.issues,
    ...cspResult.issues,
  ]

  const allWarnings = [
    ...permResult.warnings,
    ...csResult.warnings,
    ...cspResult.warnings,
  ]

  const allRecommendations = [
    ...permResult.recommendations,
    ...csResult.recommendations,
    ...cspResult.recommendations,
  ]

  return {
    passed: allIssues.length === 0,
    issues: allIssues,
    warnings: allWarnings,
    recommendations: allRecommendations,
  }
}
