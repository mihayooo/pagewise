/**
 * BookmarkStorePrep — Chrome Web Store 发布准备模块 (R130 拆分)
 *
 * 拆分自原始文件：辅助检查函数迁移至 bookmark-store-prep-checks.js。
 * 此文件保留核心校验函数并 re-export 所有 API。
 */

// Re-export check functions for backward compatibility
export {
  validateContentSecurityPolicy,
  generatePermissionJustification,
  detectLanguageSupport,
  suggestManifestImprovements,
  checkStoreSubmissionReadiness,
} from './bookmark-store-prep-checks.js'

// ==================== Constants ====================

const MAX_DESCRIPTION_LENGTH = 132

const REQUIRED_ICON_SIZES = ['16', '48', '128']

const DANGEROUS_PERMISSIONS = Object.freeze([
  'debugger',
  'pageCapture',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'desktopCapture',
  'nativeMessaging',
])

const STORE_CATEGORIES = Object.freeze({
  primary: 'Productivity',
  secondary: 'Developer Tools',
})

const SCREENSHOT_SPECS = Object.freeze({
  promotional: {
    sizes: [{ width: 1400, height: 560 }],
    maxSize: '1MB',
    format: 'PNG or JPEG',
    count: { min: 1, max: 5 },
  },
  screenshots: {
    sizes: [
      { width: 1280, height: 800 },
      { width: 640, height: 400 },
    ],
    maxSize: '2MB',
    format: 'PNG or JPEG',
    count: { min: 1, max: 5 },
  },
})

// ==================== Core Functions ====================

export function validateManifest(manifest) {
  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings }
  }

  if (manifest.manifest_version !== 3) {
    errors.push('manifest_version must be 3 (Manifest V3)')
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name is required and must be a non-empty string')
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version is required and must be a non-empty string (e.g. "1.0.0")')
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    warnings.push('version should follow semver format (e.g. "1.0.0")')
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('description is required and must be a non-empty string')
  } else {
    if (manifest.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} chars (got ${manifest.description.length})`)
    }
    if (manifest.description.startsWith('__MSG_') || manifest.description.endsWith('__')) {
      warnings.push('description uses i18n placeholder — Chrome Web Store requires a plain-text description for review')
    }
  }

  const iconResult = checkIcons(manifest)
  errors.push(...iconResult.errors)
  warnings.push(...iconResult.warnings)

  const perms = manifest.permissions
  if (!Array.isArray(perms)) {
    warnings.push('permissions is not an array — consider explicitly listing required permissions')
  } else {
    for (const perm of perms) {
      if (DANGEROUS_PERMISSIONS.includes(perm)) {
        warnings.push(`permission "${perm}" is considered dangerous — Chrome Web Store review may require justification`)
      }
    }
  }

  const hostPerms = manifest.host_permissions
  if (Array.isArray(hostPerms)) {
    const allUrls = hostPerms.filter(h => h === '<all_urls>' || h === '*://*/*')
    if (allUrls.length > 0) {
      warnings.push(`host_permissions contains broad pattern "${allUrls[0]}" — may trigger extra review scrutiny`)
    }
  }

  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        warnings.push('content_scripts matches "<all_urls>" — consider limiting to specific hosts')
      }
    }
  }

  if (!manifest.background) {
    warnings.push('no background service_worker defined')
  } else if (!manifest.background.service_worker) {
    warnings.push('background.service_worker is not set')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function checkIcons(manifest) {
  const errors = []
  const warnings = []
  const found = []
  const missing = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings, found, missing }
  }

  const icons = manifest.icons

  if (!icons || typeof icons !== 'object') {
    for (const size of REQUIRED_ICON_SIZES) {
      missing.push(size)
      errors.push(`missing required icon size: ${size}`)
    }
    return { valid: false, errors, warnings, found, missing }
  }

  for (const size of REQUIRED_ICON_SIZES) {
    if (icons[size] && typeof icons[size] === 'string' && icons[size].length > 0) {
      found.push(size)
    } else {
      missing.push(size)
      errors.push(`missing required icon size: ${size}`)
    }
  }

  const extraSizes = Object.keys(icons).filter(s => !REQUIRED_ICON_SIZES.includes(s))
  if (extraSizes.length > 0) {
    warnings.push(`additional icon sizes present: ${extraSizes.join(', ')}`)
  }

  return { valid: errors.length === 0, errors, warnings, found, missing }
}

export function getStoreListing(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      name: '', version: '', description: '', shortDescription: '',
      permissions: [], hostPermissions: [], iconPaths: {},
      category: STORE_CATEGORIES.primary, manifestVersion: 0, isValid: false,
    }
  }

  const name = manifest.name || ''
  const version = manifest.version || ''
  const rawDescription = manifest.description || ''
  const shortDescription = rawDescription.length > MAX_DESCRIPTION_LENGTH
    ? rawDescription.slice(0, MAX_DESCRIPTION_LENGTH)
    : rawDescription

  const iconPaths = {}
  if (manifest.icons && typeof manifest.icons === 'object') {
    for (const [size, path] of Object.entries(manifest.icons)) {
      iconPaths[size] = path
    }
  }

  const permissions = Array.isArray(manifest.permissions) ? [...manifest.permissions] : []
  const hostPermissions = Array.isArray(manifest.host_permissions) ? [...manifest.host_permissions] : []
  const validation = validateManifest(manifest)

  return {
    name, version, description: rawDescription, shortDescription,
    permissions, hostPermissions, iconPaths,
    category: STORE_CATEGORIES.primary,
    manifestVersion: manifest.manifest_version || 0,
    isValid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  }
}

export function getScreenshotSpec() {
  return {
    promotional: { ...SCREENSHOT_SPECS.promotional },
    screenshots: { ...SCREENSHOT_SPECS.screenshots },
    tips: [
      '推荐使用 1280×800 分辨率截图',
      '展示核心功能：侧边栏问答、知识图谱、书签分析',
      '截图应清晰展示扩展在真实网页中的使用场景',
      '第一张截图最重要，将显示在商店列表的首位',
      '可在截图中添加简短说明文字',
    ],
  }
}
