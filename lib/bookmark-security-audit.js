/**
 * BookmarkSecurityAudit — Chrome 扩展安全审计模块
 *
 * 对 manifest.json 进行全面安全审计，包括权限最小化检查、内容脚本安全评估、
 * Content Security Policy 校验，并生成结构化安全报告。
 *
 * 子模块:
 *   - bookmark-security-audit-csp.js — CSP 审计 + 内容脚本审计 + 安全报告
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 所有函数为纯函数，接受 manifest 对象作为参数
 */

import {
  generateSecurityReport as _generateSecurityReport,
} from './bookmark-security-audit-csp.js'

// 向后兼容 re-exports
export {
  auditContentScripts,
  auditCSP,
  UNSAFE_CSP_VALUES,
  MINIMAL_CSP,
} from './bookmark-security-audit-csp.js'

// ==================== Constants ====================

/** 高危权限 — Chrome Web Store 审核重点关注 */
export const DANGEROUS_PERMISSIONS = Object.freeze([
  'debugger',
  'pageCapture',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'desktopCapture',
  'nativeMessaging',
  'geolocation',
  'notifications',
  'clipboardRead',
  'clipboardWrite',
])

/** 广泛权限 — 允许但需要正当理由 */
export const BROAD_PERMISSIONS = Object.freeze([
  'tabs',
  'history',
  'topSites',
  'browsingData',
  'downloads',
])

/** 敏感主机模式 — 过于宽泛 */
export const WILDCARD_HOST_PATTERNS = Object.freeze([
  '<all_urls>',
  '*://*/*',
  '*://*/',
  'http://*/*',
  'https://*/*',
])

// ==================== Permission Audit ====================

/**
 * 审计 manifest 中的权限配置
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditPermissions(manifest) {
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

  const perms = manifest.permissions
  if (!Array.isArray(perms)) {
    if (perms !== undefined) {
      issues.push('permissions field is not an array')
    }
  } else {
    for (const perm of perms) {
      if (DANGEROUS_PERMISSIONS.includes(perm)) {
        issues.push(`dangerous permission detected: "${perm}"`)
      }
    }

    for (const perm of perms) {
      if (BROAD_PERMISSIONS.includes(perm)) {
        warnings.push(`broad permission detected: "${perm}" — verify necessity`)
      }
    }

    if (perms.length > 8) {
      warnings.push(`high permission count (${perms.length}) — consider reducing to minimum required`)
    }

    if (perms.includes('tabs') && !perms.includes('activeTab')) {
      recommendations.push('consider using "activeTab" instead of "tabs" for reduced attack surface')
    }
  }

  const hostPerms = manifest.host_permissions
  if (Array.isArray(hostPerms)) {
    for (const pattern of hostPerms) {
      if (WILDCARD_HOST_PATTERNS.includes(pattern)) {
        issues.push(`overly broad host_permission: "${pattern}" — grants access to all websites`)
      }
    }

    for (const pattern of hostPerms) {
      if (pattern.startsWith('http://') && !pattern.startsWith('http://localhost') && !pattern.startsWith('http://127.0.0.1')) {
        warnings.push(`host_permission uses insecure HTTP: "${pattern}"`)
      }
    }
  }

  if (issues.length === 0 && warnings.length === 0) {
    recommendations.push('permissions look clean — no excessive access detected')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

// ==================== Full Security Report ====================

/**
 * 生成完整的安全审计报告
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function generateSecurityReport(manifest) {
  return _generateSecurityReport(manifest, auditPermissions)
}
