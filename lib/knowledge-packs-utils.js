/**
 * 知识包工具函数与常量 — 从 bookmark-knowledge-packs.js 提取
 * 
 * 包含: 格式常量、校验和计算、深拷贝、ID 生成、版本比较
 * 
 * @module lib/knowledge-packs-utils
 */

/** .pwkp 格式版本 */
export const PACK_FORMAT_VERSION = '1.0'

/** 可见性级别 */
export const VISIBILITY_LEVELS = Object.freeze(['public', 'team', 'private'])

/** Anki 导出格式版本 */
export const ANKI_EXPORT_VERSION = '1.0'

/**
 * 计算字符串的简单校验和 (djb2 变体)
 * @param {string} str
 * @returns {string} 十六进制校验和
 */
export function computeChecksum(str) {
  if (typeof str !== 'string') return '0'
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

/**
 * 深拷贝可序列化数据
 * @param {*} data
 * @returns {*}
 */
export function deepCopy(data) {
  return JSON.parse(JSON.stringify(data))
}

/**
 * 生成唯一 pack ID
 * @param {Function} nowFn
 * @returns {string}
 */
export function generatePackId(nowFn) {
  const ts = nowFn()
  const rand = Math.random().toString(36).slice(2, 8)
  return `kp-${ts}-${rand}`
}

/**
 * 比较语义版本号 (semver-like)
 * @param {string} v1
 * @param {string} v2
 * @returns {number} 1 if v1>v2, -1 if v1<v2, 0 if equal
 */
export function compareVersions(v1, v2) {
  const parts1 = String(v1).split('.').map(Number)
  const parts2 = String(v2).split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * 验证 visibility 参数
 * @param {string} visibility
 * @throws {Error}
 */
export function validateVisibility(visibility) {
  if (!VISIBILITY_LEVELS.includes(visibility)) {
    throw new Error(`visibility 无效，必须是 ${VISIBILITY_LEVELS.join('|')}`)
  }
}
