/**
 * CWSValidator — Chrome Web Store 提交合规验证器
 *
 * R300: CWSProductionSubmit — v3.4.0 Chrome Web Store 正式提交
 * 纯逻辑验证模块，无 I/O、无 Chrome API 依赖
 *
 * @module lib/cws-validator
 */

/** CWS 要求的最小权限集 */
const MINIMAL_PERMISSIONS = new Set([
  'storage', 'sidePanel', 'tabs', 'activeTab', 'bookmarks',
]);

/** 高风险权限 — 需额外说明 */
const HIGH_RISK_PERMISSIONS = new Set([
  'downloads', 'history', 'management', 'nativeMessaging', 'debugger',
  'geolocation', 'notifications', 'webRequest', 'webRequestBlocking',
  'proxy', 'desktopCapture', 'pageCapture', 'topSites', 'browsingData',
  'privacy', 'sessions', 'identity', 'gcm',
]);

/** 允许的 host_permissions 域名 */
const ALLOWED_HOST_PATTERNS = [
  'anthropic.com', 'openai.com', 'deepseek.com', 'localhost', '127.0.0.1',
];

/** CWS 限制常量 */
const CWS_LIMITS = {
  SHORT_DESC_MAX_CHARS: 132,
  DETAILED_DESC_MAX_CHARS: 16000,
  ZIP_SIZE_SOFT_LIMIT: 5 * 1024 * 1024,
  ZIP_SIZE_HARD_LIMIT: 10 * 1024 * 1024,
  SW_COLD_START_MS: 500,
};

const REQUIRED_MANIFEST_FIELDS = ['manifest_version', 'name', 'version', 'description'];
const REQUIRED_ICON_SIZES = ['16', '48', '128'];

/**
 * 验证 manifest.json 基本结构
 * @param {Object} manifest
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validateManifestStructure(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object') {
    return { pass: false, issues: ['manifest.json 不是有效的 JSON 对象'], details: {} };
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) issues.push(`缺少必需字段: ${field}`);
  }
  if (manifest.manifest_version !== 3) {
    issues.push(`manifest_version 应为 3 (实际: ${manifest.manifest_version})`);
  }
  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    issues.push(`版本号格式不正确: ${manifest.version} (期望 x.y.z)`);
  }
  if (!manifest.background?.service_worker) issues.push('缺少 background.service_worker 声明');
  if (!manifest.side_panel?.default_path) issues.push('缺少 side_panel.default_path 声明');
  return {
    pass: issues.length === 0, issues,
    details: {
      version: manifest.version, manifestVersion: manifest.manifest_version,
      hasServiceWorker: !!manifest.background?.service_worker,
      hasSidePanel: !!manifest.side_panel?.default_path,
    },
  };
}

/**
 * 验证权限最小化
 * @param {Object} manifest
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validatePermissions(manifest) {
  const issues = [];
  const permissions = manifest.permissions || [];
  const hostPermissions = manifest.host_permissions || [];
  const extra = permissions.filter(p => !MINIMAL_PERMISSIONS.has(p));
  if (extra.length > 0) {
    issues.push(`多余权限: ${extra.join(', ')} (最小集: ${[...MINIMAL_PERMISSIONS].join(', ')})`);
  }
  const missing = [...MINIMAL_PERMISSIONS].filter(p => !permissions.includes(p));
  if (missing.length > 0) issues.push(`缺少必需权限: ${missing.join(', ')}`);
  const highRisk = permissions.filter(p => HIGH_RISK_PERMISSIONS.has(p));
  if (highRisk.length > 0) issues.push(`高风险权限: ${highRisk.join(', ')}`);
  if (hostPermissions.includes('<all_urls>')) issues.push('host_permissions 不应包含 <all_urls>');
  const unknownHosts = hostPermissions.filter(hp =>
    !ALLOWED_HOST_PATTERNS.some(a => hp.includes(a)));
  if (unknownHosts.length > 0) issues.push(`未知 host_permissions: ${unknownHosts.join(', ')}`);
  return {
    pass: issues.length === 0, issues,
    details: { declaredPermissions: permissions, extraPermissions: extra,
      missingPermissions: missing, highRiskPermissions: highRisk,
      hostPermissions, unknownHosts },
  };
}

/**
 * 验证 CSP 策略合规
 * @param {Object} manifest
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validateCSP(manifest) {
  const issues = [];
  const csp = manifest.content_security_policy?.extension_pages || '';
  if (!csp) {
    issues.push('缺少 content_security_policy.extension_pages 声明');
  } else {
    if (!csp.includes("script-src 'self'")) issues.push(`CSP script-src 应为 'self'`);
    if (csp.includes('unsafe-eval')) issues.push('CSP 不应包含 unsafe-eval');
    if (csp.includes('unsafe-inline')) issues.push('CSP 不应包含 unsafe-inline');
    if (!csp.includes('object-src')) issues.push('CSP 应声明 object-src');
  }
  return {
    pass: issues.length === 0, issues,
    details: { csp, hasScriptSrcSelf: csp.includes("script-src 'self'"),
      hasObjectSrcSelf: csp.includes("object-src 'self'"),
      hasUnsafeEval: csp.includes('unsafe-eval'), hasUnsafeInline: csp.includes('unsafe-inline') },
  };
}

/**
 * 验证图标声明完整性
 * @param {Object} manifest
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validateIcons(manifest) {
  const issues = [];
  const icons = manifest.icons || {};
  for (const size of REQUIRED_ICON_SIZES) {
    if (!icons[size]) issues.push(`icons 中缺少 ${size}px 声明`);
  }
  const actionIcons = manifest.action?.default_icon || {};
  for (const size of REQUIRED_ICON_SIZES) {
    if (!actionIcons[size]) issues.push(`action.default_icon 中缺少 ${size}px 声明`);
  }
  return { pass: issues.length === 0, issues, details: { declaredIcons: icons, actionIcons } };
}

/**
 * 验证 CWS 商店描述长度
 * @param {{ shortDescription?: string, detailedDescription?: string }} options
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validateStoreListing(options) {
  const issues = [];
  const { shortDescription, detailedDescription } = options || {};
  if (!shortDescription) {
    issues.push('缺少简短描述');
  } else if (shortDescription.length > CWS_LIMITS.SHORT_DESC_MAX_CHARS) {
    issues.push(`简短描述超长: ${shortDescription.length}/${CWS_LIMITS.SHORT_DESC_MAX_CHARS}`);
  }
  if (!detailedDescription) {
    issues.push('缺少详细描述');
  } else if (detailedDescription.length > CWS_LIMITS.DETAILED_DESC_MAX_CHARS) {
    issues.push(`详细描述超长: ${detailedDescription.length}/${CWS_LIMITS.DETAILED_DESC_MAX_CHARS}`);
  }
  return { pass: issues.length === 0, issues, details: {
    shortDescLength: shortDescription?.length || 0, shortDescLimit: CWS_LIMITS.SHORT_DESC_MAX_CHARS,
    detailedDescLength: detailedDescription?.length || 0, detailedDescLimit: CWS_LIMITS.DETAILED_DESC_MAX_CHARS,
  }};
}

/**
 * 验证 .zip 包大小
 * @param {number} sizeBytes
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function validateZipSize(sizeBytes) {
  const issues = [];
  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return { pass: false, issues: ['无效的 zip 文件大小'], details: {} };
  }
  if (sizeBytes > CWS_LIMITS.ZIP_SIZE_HARD_LIMIT) {
    issues.push(`超过 CWS 硬限制: ${(sizeBytes / 1048576).toFixed(2)}MB > 10MB`);
  }
  if (sizeBytes > CWS_LIMITS.ZIP_SIZE_SOFT_LIMIT) {
    issues.push(`超过推荐限制: ${(sizeBytes / 1048576).toFixed(2)}MB > 5MB`);
  }
  return { pass: sizeBytes <= CWS_LIMITS.ZIP_SIZE_HARD_LIMIT, issues, details: {
    sizeBytes, sizeMB: (sizeBytes / 1048576).toFixed(2),
    withinSoftLimit: sizeBytes <= CWS_LIMITS.ZIP_SIZE_SOFT_LIMIT,
    withinHardLimit: sizeBytes <= CWS_LIMITS.ZIP_SIZE_HARD_LIMIT,
  }};
}

/**
 * 估算 Service Worker 冷启动时间
 * @param {number} moduleImportCount — SW 依赖的 ES module 数量
 * @param {{ baseOverheadMs?: number, perModuleMs?: number }} [options]
 * @returns {{ pass: boolean, issues: string[], details: Object }}
 */
export function estimateServiceWorkerColdStart(moduleImportCount, options) {
  const { baseOverheadMs = 100, perModuleMs = 10 } = options || {};
  if (typeof moduleImportCount !== 'number' || moduleImportCount < 0) {
    return { pass: false, issues: ['无效的模块数量'], details: {} };
  }
  const estimatedMs = baseOverheadMs + (moduleImportCount * perModuleMs);
  const issues = estimatedMs > CWS_LIMITS.SW_COLD_START_MS
    ? [`估算冷启动时间 ${estimatedMs}ms > ${CWS_LIMITS.SW_COLD_START_MS}ms 目标`] : [];
  return { pass: issues.length === 0, issues, details: {
    moduleCount: moduleImportCount, baseOverheadMs, perModuleMs,
    estimatedMs, targetMs: CWS_LIMITS.SW_COLD_START_MS,
  }};
}

/**
 * 综合 CWS 提交验证
 * @param {Object} manifest
 * @param {{ zipSizeBytes?: number, shortDescription?: string, detailedDescription?: string, swModuleCount?: number }} [options]
 * @returns {{ pass: boolean, checks: Object, allIssues: string[] }}
 */
export function validateManifestForCWS(manifest, options) {
  const checks = {};
  checks.structure = validateManifestStructure(manifest);
  checks.permissions = validatePermissions(manifest);
  checks.csp = validateCSP(manifest);
  checks.icons = validateIcons(manifest);
  if (options?.shortDescription !== undefined || options?.detailedDescription !== undefined) {
    checks.storeListing = validateStoreListing({
      shortDescription: options.shortDescription, detailedDescription: options.detailedDescription });
  }
  if (typeof options?.zipSizeBytes === 'number') checks.zipSize = validateZipSize(options.zipSizeBytes);
  if (typeof options?.swModuleCount === 'number') {
    checks.swColdStart = estimateServiceWorkerColdStart(options.swModuleCount);
  }
  const allIssues = [];
  for (const [name, check] of Object.entries(checks)) {
    for (const issue of check.issues) allIssues.push(`[${name}] ${issue}`);
  }
  return { pass: allIssues.length === 0, checks, allIssues };
}

/**
 * 获取 manifest 权限审计报告
 * @param {Object} manifest
 * @returns {Object}
 */
export function getPermissionAuditReport(manifest) {
  const permissions = manifest.permissions || [];
  const hostPermissions = manifest.host_permissions || [];
  const required = [...MINIMAL_PERMISSIONS].filter(p => permissions.includes(p));
  const extra = permissions.filter(p => !MINIMAL_PERMISSIONS.has(p));
  const highRisk = permissions.filter(p => HIGH_RISK_PERMISSIONS.has(p));
  return {
    totalPermissions: permissions.length, required, extra, highRisk, hostPermissions,
    hasAllUrls: hostPermissions.includes('<all_urls>'),
    hasUnknownHosts: hostPermissions.some(hp => !ALLOWED_HOST_PATTERNS.some(a => hp.includes(a))),
    compliance: extra.length === 0 && highRisk.length === 0 && !hostPermissions.includes('<all_urls>')
      ? 'PASS' : 'NEEDS_REVIEW',
  };
}

export { CWS_LIMITS, MINIMAL_PERMISSIONS, HIGH_RISK_PERMISSIONS, REQUIRED_ICON_SIZES };
