/**
 * Plugin System 底层工具 — 从 plugin-system.js (R130) 拆分
 *
 * 包含：
 *   - 版本工具: parseVersion, compareVersions, satisfiesVersion
 *   - 插件验证: validatePlugin
 *   - IndexedDB 操作: openPluginDB, idbRequestToPromise
 *   - 插件注册表: PluginRegistry
 *
 * @module plugin-system-utils
 */

import { saveSkill, deleteSkill } from './custom-skills.js'

// ==================== 常量 ====================

const PLUGIN_DB_NAME = 'pagewise_plugins'
const PLUGIN_DB_VERSION = 1
const PLUGIN_STORE_NAME = 'plugins'
const MAX_PLUGINS = 50

// ==================== 版本工具 ====================

export function parseVersion(version) {
  if (!version || typeof version !== 'string') {
    throw new Error(`Invalid version: ${version}`)
  }
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!match) {
    throw new Error(`Invalid semver: ${version}`)
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || '',
  }
}

export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1

  if (va.prerelease && !vb.prerelease) return -1
  if (!va.prerelease && vb.prerelease) return 1
  if (va.prerelease && vb.prerelease) {
    return va.prerelease.localeCompare(vb.prerelease)
  }

  return 0
}

export function satisfiesVersion(version, range) {
  if (!range || typeof range !== 'string') return true

  const v = parseVersion(version)

  if (range.startsWith('^')) {
    const base = parseVersion(range.slice(1))
    if (v.major !== base.major) return false
    if (v.minor !== base.minor) return v.minor > base.minor
    return v.patch >= base.patch
  }

  if (range.startsWith('~')) {
    return compareVersions(version, range.slice(1)) >= 0
  }

  if (range.startsWith('>=')) {
    return compareVersions(version, range.slice(2)) >= 0
  }

  return compareVersions(version, range) === 0
}

// ==================== 插件验证 ====================

export function validatePlugin(manifest) {
  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest 必须是一个对象'], warnings: [] }
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('id 是必填字段，且必须为字符串')
  } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.id)) {
    errors.push('id 仅允许字母、数字、下划线和连字符')
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name 是必填字段，且必须为字符串')
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version 是必填字段，且必须为字符串')
  } else {
    try {
      parseVersion(manifest.version)
    } catch {
      errors.push(`version 格式无效: ${manifest.version}（需要 semver 格式如 1.0.0）`)
    }
  }

  if (!manifest.prompt || typeof manifest.prompt !== 'string') {
    errors.push('prompt 是必填字段，且必须为非空字符串')
  } else if (manifest.prompt.trim().length === 0) {
    errors.push('prompt 不能为空白字符串')
  }

  if (manifest.license !== undefined && typeof manifest.license !== 'string') {
    errors.push('license 必须为字符串')
  }

  if (manifest.category !== undefined && typeof manifest.category !== 'string') {
    errors.push('category 必须为字符串')
  }

  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    errors.push('description 必须为字符串')
  }

  if (manifest.author !== undefined && typeof manifest.author !== 'string') {
    errors.push('author 必须为字符串')
  }

  if (manifest.parameters !== undefined) {
    if (!Array.isArray(manifest.parameters)) {
      errors.push('parameters 必须为数组')
    } else {
      manifest.parameters.forEach((p, i) => {
        if (!p || typeof p !== 'object') {
          errors.push(`parameters[${i}] 必须为对象`)
        } else {
          if (!p.name || typeof p.name !== 'string') {
            errors.push(`parameters[${i}].name 是必填字段`)
          }
          if (p.type && typeof p.type !== 'string') {
            errors.push(`parameters[${i}].type 必须为字符串`)
          }
        }
      })
    }
  }

  if (manifest.dependencies !== undefined) {
    if (typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
      errors.push('dependencies 必须为对象')
    } else {
      for (const [depId, depRange] of Object.entries(manifest.dependencies)) {
        if (typeof depRange !== 'string') {
          errors.push(`dependencies.${depId} 的版本范围必须为字符串`)
        }
      }
    }
  }

  if (manifest.tags !== undefined) {
    if (!Array.isArray(manifest.tags)) {
      errors.push('tags 必须为数组')
    } else if (manifest.tags.some(t => typeof t !== 'string')) {
      errors.push('tags 中的每个元素必须为字符串')
    }
  }

  if (manifest.trigger !== undefined) {
    if (typeof manifest.trigger !== 'object' || manifest.trigger === null) {
      errors.push('trigger 必须为对象')
    } else if (!manifest.trigger.type || typeof manifest.trigger.type !== 'string') {
      errors.push('trigger.type 是必填字段')
    }
  }

  if (!manifest.description) warnings.push('建议填写 description 以提高可发现性')
  if (!manifest.author) warnings.push('建议填写 author 标明作者')
  if (!manifest.tags || manifest.tags.length === 0) warnings.push('建议添加 tags 以便分类')

  return { valid: errors.length === 0, errors, warnings }
}

// ==================== IndexedDB 操作 ====================

function openPluginDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLUGIN_DB_NAME, PLUGIN_DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(PLUGIN_STORE_NAME)) {
        const store = db.createObjectStore(PLUGIN_STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('installedAt', 'installedAt', { unique: false })
      }
    }

    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => reject(event.target.error)
  })
}

function idbRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ==================== 插件注册表 ====================

export class PluginRegistry {
  async registerPlugin(manifest) {
    const all = await this.getInstalled()
    const existing = all.find(p => p.id === manifest.id)
    if (!existing && all.length >= MAX_PLUGINS) {
      throw new Error(`插件数量已达上限（${MAX_PLUGINS} 个）`)
    }

    const record = {
      ...manifest,
      license: manifest.license || 'MIT',
      status: existing ? existing.status : 'installed',
      installedAt: existing ? existing.installedAt : Date.now(),
      updatedAt: Date.now(),
    }

    const db = await openPluginDB()
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite')
    const store = tx.objectStore(PLUGIN_STORE_NAME)
    await idbRequestToPromise(store.put(record))
    db.close()

    return record
  }

  async unregisterPlugin(id) {
    const db = await openPluginDB()
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite')
    const store = tx.objectStore(PLUGIN_STORE_NAME)
    await idbRequestToPromise(store.delete(id))
    db.close()
  }

  async getInstalled() {
    const db = await openPluginDB()
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readonly')
    const store = tx.objectStore(PLUGIN_STORE_NAME)
    const result = await idbRequestToPromise(store.getAll())
    db.close()
    return result || []
  }

  async isInstalled(id) {
    const plugin = await this.getPlugin(id)
    return !!plugin
  }

  async getPlugin(id) {
    const db = await openPluginDB()
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readonly')
    const store = tx.objectStore(PLUGIN_STORE_NAME)
    const result = await idbRequestToPromise(store.get(id))
    db.close()
    return result || null
  }

  async updatePluginStatus(id, status) {
    const plugin = await this.getPlugin(id)
    if (!plugin) throw new Error(`插件不存在: ${id}`)

    plugin.status = status
    plugin.updatedAt = Date.now()

    const db = await openPluginDB()
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite')
    const store = tx.objectStore(PLUGIN_STORE_NAME)
    await idbRequestToPromise(store.put(plugin))
    db.close()
  }

  async checkConflicts(manifest) {
    const conflicts = []
    const all = await this.getInstalled()

    const existing = all.find(p => p.id === manifest.id)
    if (existing) {
      if (existing.version === manifest.version) {
        conflicts.push({
          type: 'already_installed',
          message: `插件 ${manifest.id}@${manifest.version} 已安装`,
          existing,
        })
      } else {
        const cmp = compareVersions(manifest.version, existing.version)
        if (cmp < 0) {
          conflicts.push({
            type: 'downgrade',
            message: `尝试从 v${existing.version} 降级到 v${manifest.version}`,
            existing,
          })
        } else {
          conflicts.push({
            type: 'upgrade',
            message: `将从 v${existing.version} 升级到 v${manifest.version}`,
            existing,
          })
        }
      }
    }

    if (manifest.dependencies) {
      for (const [depId, depRange] of Object.entries(manifest.dependencies)) {
        const depPlugin = all.find(p => p.id === depId)
        if (!depPlugin) {
          conflicts.push({
            type: 'missing_dependency',
            message: `缺少依赖插件: ${depId}`,
            existing: null,
          })
        } else if (!satisfiesVersion(depPlugin.version, depRange)) {
          conflicts.push({
            type: 'incompatible_dependency',
            message: `依赖 ${depId} 版本 ${depPlugin.version} 不满足 ${depRange}`,
            existing: depPlugin,
          })
        }
      }
    }

    return conflicts
  }
}
