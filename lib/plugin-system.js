/**
 * Plugin System — 模板/插件系统 (R130 拆分)
 *
 * 底层工具（版本工具、验证、PluginRegistry）已迁移至 plugin-system-utils.js。
 * 此文件保留 PluginManager 并 re-export 所有 API。
 */

// Re-export for backward compatibility
export {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validatePlugin,
  PluginRegistry,
} from './plugin-system-utils.js'

import { saveSkill, getAllSkills, getSkillById, deleteSkill, toggleSkill } from './custom-skills.js'
import { validatePlugin, PluginRegistry } from './plugin-system-utils.js'

// ==================== PluginManager ====================

export class PluginManager {
  constructor() {
    this.registry = new PluginRegistry()
  }

  async install(manifest) {
    const validation = validatePlugin(manifest)
    if (!validation.valid) {
      throw new Error(`插件验证失败: ${validation.errors.join('; ')}`)
    }

    const conflicts = await this.registry.checkConflicts(manifest)
    const blocking = conflicts.filter(c =>
      c.type === 'already_installed' || c.type === 'missing_dependency'
    )
    if (blocking.length > 0) {
      throw new Error(`安装冲突: ${blocking.map(c => c.message).join('; ')}`)
    }

    const pluginRecord = await this.registry.registerPlugin(manifest)

    await saveSkill({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description || '',
      category: manifest.category || 'custom',
      prompt: manifest.prompt,
      parameters: manifest.parameters || [],
      trigger: manifest.trigger || { type: 'manual' },
      enabled: true,
    })

    return pluginRecord
  }

  async uninstall(id) {
    const plugin = await this.registry.getPlugin(id)
    if (!plugin) {
      throw new Error(`插件不存在: ${id}`)
    }

    const allPlugins = await this.registry.getInstalled()
    const dependents = allPlugins.filter(p =>
      p.dependencies && p.dependencies[id]
    )
    if (dependents.length > 0) {
      const names = dependents.map(p => p.name || p.id).join(', ')
      throw new Error(`无法卸载: 被以下插件依赖: ${names}`)
    }

    await this.registry.unregisterPlugin(id)

    try {
      await deleteSkill(id)
    } catch {
      // may not exist in custom-skills
    }
  }

  async enable(id) {
    await this.registry.updatePluginStatus(id, 'installed')
    try {
      await toggleSkill(id)
    } catch {
      // ignore if skill not found
    }
  }

  async disable(id) {
    await this.registry.updatePluginStatus(id, 'disabled')
    try {
      const skill = await getSkillById(id)
      if (skill && skill.enabled) {
        await toggleSkill(id)
      }
    } catch {
      // ignore
    }
  }

  async exportPlugin(skillId) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`)
    }

    let pluginMeta = null
    try {
      pluginMeta = await this.registry.getPlugin(skillId)
    } catch {
      // registry not available, skip
    }

    return {
      id: skill.id,
      name: skill.name,
      version: pluginMeta?.version || '1.0.0',
      description: skill.description || '',
      author: pluginMeta?.author || '',
      license: pluginMeta?.license || 'MIT',
      category: skill.category || 'custom',
      prompt: skill.prompt || '',
      parameters: pluginMeta?.parameters || skill.parameters || [],
      trigger: skill.trigger || { type: 'manual' },
      tags: pluginMeta?.tags || [],
      homepage: pluginMeta?.homepage || '',
      createdAt: new Date(skill.createdAt || Date.now()).toISOString(),
    }
  }

  async exportAll() {
    const skills = await getAllSkills()
    const manifests = []
    for (const skill of skills) {
      try {
        const manifest = await this.exportPlugin(skill.id)
        manifests.push(manifest)
      } catch {
        // skip failed exports
      }
    }
    return manifests
  }

  async importPlugin(json) {
    const manifest = typeof json === 'string' ? JSON.parse(json) : json
    return await this.install(manifest)
  }

  async importBatch(json) {
    let items = json
    if (typeof json === 'string') {
      items = JSON.parse(json)
    }
    if (!Array.isArray(items)) {
      items = [items]
    }

    const result = { success: 0, failed: 0, errors: [] }

    for (const item of items) {
      try {
        await this.importPlugin(item)
        result.success++
      } catch (e) {
        result.failed++
        result.errors.push({
          id: item?.id ?? 'unknown',
          error: e.message,
        })
      }
    }

    return result
  }

  async getUpdatable() {
    const all = await this.registry.getInstalled()
    return all.map(p => ({
      id: p.id,
      name: p.name,
      currentVersion: p.version,
      status: p.status,
    }))
  }
}
