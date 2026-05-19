/**
 * Skill Validator — Security Scan & Package Size 子模块
 *
 * 从 skill-validator.js 拆分，负责:
 *   - SecurityScanResult — 安全扫描结果类
 *   - scanCode / scanPackage — JavaScript 代码安全扫描
 *   - validatePackageSize — 包大小校验
 *
 * @module lib/skill-validator-security
 */

import { ValidationResult } from './skill-validator.js'

/** Maximum skill package size (500KB) */
const MAX_PACKAGE_SIZE = 500 * 1024

/** Maximum individual file size (200KB) */
const MAX_FILE_SIZE = 200 * 1024

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.md', '.js', '.json', '.svg', '.png', '.jpg', '.css', '.txt']

/** Prohibited JavaScript patterns (security) */
const PROHIBITED_PATTERNS = [
  { pattern: /\beval\s*\(/, name: 'eval()', risk: 'critical' },
  { pattern: /new\s+Function\s*\(/, name: 'new Function()', risk: 'critical' },
  { pattern: /\bchrome\./, name: 'chrome.* API access', risk: 'critical' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest', risk: 'high' },
  { pattern: /\bWebSocket\b/, name: 'WebSocket', risk: 'high' },
  { pattern: /\bimport\s*\(/, name: 'dynamic import()', risk: 'high' },
  { pattern: /require\s*\(/, name: 'require()', risk: 'high' },
  { pattern: /\bfetch\s*\(/, name: 'fetch() (use context.ai instead)', risk: 'medium' },
  { pattern: /\bsetTimeout\s*\(.*["'`]/s, name: 'setTimeout with string', risk: 'critical' },
  { pattern: /\bsetInterval\s*\(.*["'`]/s, name: 'setInterval with string', risk: 'critical' },
  { pattern: /document\.\s*(write|createElement|getElementById)/, name: 'DOM manipulation', risk: 'high' },
  { pattern: /window\.\s*(open|location|localStorage)/, name: 'window object access', risk: 'high' },
  { pattern: /\bprocess\./, name: 'Node.js process access', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']child_process["']\s*\)/, name: 'child_process', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']fs["']\s*\)/, name: 'fs module', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']net["']\s*\)/, name: 'net module', risk: 'critical' },
]

/**
 * Security scan result
 */
export class SecurityScanResult {
  constructor() {
    /** @type {Array<{file: string, pattern: string, risk: string, line: number}>} */
    this.findings = []
  }

  get safe() {
    return this.findings.length === 0
  }

  get criticalCount() {
    return this.findings.filter(f => f.risk === 'critical').length
  }

  get highCount() {
    return this.findings.filter(f => f.risk === 'high').length
  }

  addFinding(file, pattern, risk, line = 0) {
    this.findings.push({ file, pattern, risk, line })
  }

  toString() {
    if (this.safe) return 'Security scan passed'
    const lines = [`Security scan found ${this.findings.length} issue(s):`]
    for (const f of this.findings) {
      lines.push(`  [${f.risk.toUpperCase()}] ${f.file}:${f.line} — ${f.pattern}`)
    }
    return lines.join('\n')
  }
}

/**
 * Scan JavaScript code for prohibited patterns
 * @param {string} code - JavaScript source code
 * @param {string} filename - Filename for reporting
 * @returns {SecurityScanResult}
 */
export function scanCode(code, filename = 'unknown') {
  const result = new SecurityScanResult()
  const lines = code.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\/\//.test(line)) continue

    for (const { pattern, name, risk } of PROHIBITED_PATTERNS) {
      if (pattern.test(line)) {
        result.addFinding(filename, name, risk, i + 1)
      }
    }
  }

  return result
}

/**
 * Scan all JS files in a skill package
 * @param {Array<{name: string, content: string}>} files
 * @returns {SecurityScanResult}
 */
export function scanPackage(files) {
  const result = new SecurityScanResult()

  for (const file of files) {
    if (file.name.endsWith('.js')) {
      const fileResult = scanCode(file.content, file.name)
      result.findings.push(...fileResult.findings)
    }
  }

  return result
}

/**
 * Validate package file sizes
 * @param {Array<{name: string, content: string|Uint8Array}>} files
 * @returns {ValidationResult}
 */
export function validatePackageSize(files) {
  const result = new ValidationResult()

  let totalSize = 0
  for (const file of files) {
    const size = typeof file.content === 'string' ? file.content.length : file.content.byteLength
    totalSize += size

    if (size > MAX_FILE_SIZE) {
      result.addError(
        `File "${file.name}" exceeds maximum size (${(size / 1024).toFixed(1)}KB > ${MAX_FILE_SIZE / 1024}KB)`,
        file.name
      )
    }

    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    if (ext && !ALLOWED_EXTENSIONS.includes(ext) && file.name !== 'SKILL.md') {
      result.addWarning(
        `File "${file.name}" has disallowed extension "${ext}"`,
        file.name
      )
    }
  }

  if (totalSize > MAX_PACKAGE_SIZE) {
    result.addError(
      `Package size exceeds maximum (${(totalSize / 1024).toFixed(1)}KB > ${MAX_PACKAGE_SIZE / 1024}KB)`,
      'package'
    )
  }

  return result
}
