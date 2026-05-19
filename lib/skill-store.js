/**
 * SkillStore — 在线技能商店客户端 (R130 拆分)
 *
 * 社区功能（SkillCommunityHub、SkillCommunityReviews、版本工具）
 * 已迁移至 skill-store-community.js。
 * 此文件保留 SkillStore、SkillPackageManager 并 re-export 所有 API。
 */

import { saveSkill, getSkillById, getAllSkills } from './custom-skills.js'
import { createZip, readZipAsText } from './skill-zip.js'
import { validateSkillPackage, parseSkillManifest } from './skill-validator.js'

// Re-export community features for backward compatibility
export {
  SkillCommunityHub,
  SkillCommunityReviews,
  parseVersion,
  compareVersions,
  isNewerVersion,
  isVersionCompatible,
} from './skill-store-community.js'

import { isNewerVersion, isVersionCompatible } from './skill-store-community.js'

const DEFAULT_API_URL = 'https://api.clawhub.com/v1/skills'
const PAGEWISE_VERSION = '2.0.0'

// ==================== SkillStore ====================

export class SkillStore {
  constructor(apiUrl = DEFAULT_API_URL) {
    this.apiUrl = apiUrl
  }

  async fetchSkills() {
    try {
      const resp = await fetch(this.apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })
      if (!resp.ok) {
        console.warn(`SkillStore fetch failed: HTTP ${resp.status}`)
        return []
      }
      const data = await resp.json()
      return Array.isArray(data) ? data : (data.skills || data.data || [])
    } catch (e) {
      console.warn('SkillStore fetch error:', e.message)
      return []
    }
  }

  async installSkill(skill) {
    if (!skill || !skill.id || !skill.name) {
      throw new Error('技能数据不完整')
    }
    return await saveSkill({
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      category: skill.category || 'custom',
      prompt: skill.prompt || '',
      parameters: skill.parameters || [],
      trigger: skill.trigger || { type: 'manual' },
      enabled: true
    })
  }

  async isInstalled(skillId) {
    const existing = await getSkillById(skillId)
    return !!existing
  }
}

// ==================== SkillPackageManager ====================

export class SkillPackageManager {
  constructor() {
    this._fetch = null
  }

  async exportSkill(skillId, options = {}) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const version = skill.version || '1.0.0'
    const author = options.author || 'PageWise User'
    const license = options.license || 'MIT'

    const skillMd = [
      '---',
      `id: ${skill.id}`,
      `name: ${skill.name}`,
      `version: ${version}`,
      `description: ${skill.description || ''}`,
      `author: ${author}`,
      `category: ${skill.category || 'general'}`,
      `license: ${license}`,
      '---',
      '',
      `# ${skill.name}`,
      '',
      skill.description || '',
      '',
      '## Parameters',
      '',
      ...(skill.parameters || []).map(p =>
        `- **${p.name}** (${p.type || 'string'}${p.required ? ', required' : ''}): ${p.description || ''}`
      ),
      ''
    ].join('\n')

    const mainJs = [
      `// Skill: ${skill.name}`,
      `// Auto-exported by PageWise`,
      '',
      `export default async function execute(params, context) {`,
      `  ${skill.prompt ? `const prompt = \`${skill.prompt.replace(/`/g, '\\`')}\`;` : 'const prompt = "No prompt configured";'}`,
      `  const response = await context.ai.chat([{ role: 'user', content: prompt }]);`,
      `  return response.content;`,
      `}`,
      ''
    ].join('\n')

    const readme = [
      `# ${skill.name}`,
      '',
      skill.description || '',
      '',
      '## Usage',
      '',
      'Install this skill from the PageWise skill marketplace.',
      '',
      '## Parameters',
      '',
      ...(skill.parameters || []).map(p =>
        `- \`${p.name}\` (${p.type || 'string'}): ${p.description || ''}`
      ),
      ''
    ].join('\n')

    const meta = {
      exportedAt: new Date().toISOString(),
      exportedBy: `PageWise/${PAGEWISE_VERSION}`,
      skillId: skill.id,
      version
    }

    const files = [
      { name: 'SKILL.md', content: skillMd },
      { name: 'main.js', content: mainJs },
      { name: 'README.md', content: readme },
      { name: '.skillmeta.json', content: JSON.stringify(meta, null, 2) }
    ]

    return createZip(files)
  }

  async importSkill(zipData, options = {}) {
    const { validate = true, overwrite = false } = options

    let files
    try {
      files = readZipAsText(zipData)
    } catch (e) {
      throw new Error(`Failed to read skill package: ${e.message}`)
    }

    if (files.length === 0) {
      throw new Error('Skill package is empty')
    }

    if (validate) {
      const validation = validateSkillPackage(files)
      if (!validation.valid) {
        throw new Error(`Skill validation failed:\n${validation.toString()}`)
      }
    }

    const skillMd = files.find(f => f.name === 'SKILL.md')
    if (!skillMd) {
      throw new Error('Missing SKILL.md in package')
    }

    const { frontmatter } = parseSkillManifest(skillMd.content)

    if (frontmatter.minVersion) {
      if (!isVersionCompatible(PAGEWISE_VERSION, frontmatter.minVersion)) {
        throw new Error(
          `Skill requires PageWise >= ${frontmatter.minVersion}, current: ${PAGEWISE_VERSION}`
        )
      }
    }

    const existing = await getSkillById(frontmatter.id)
    if (existing && !overwrite) {
      const existingVer = existing.version || '0.0.0'
      if (!isNewerVersion(frontmatter.version, existingVer)) {
        throw new Error(
          `Skill "${frontmatter.id}" already installed (${existingVer} >= ${frontmatter.version}). Use overwrite option to force.`
        )
      }
    }

    const mainJs = files.find(f => f.name === 'main.js')

    const skillRecord = {
      id: frontmatter.id,
      name: frontmatter.name,
      description: frontmatter.description || '',
      category: frontmatter.category || 'general',
      prompt: mainJs ? mainJs.content : '',
      version: frontmatter.version,
      author: frontmatter.author,
      license: frontmatter.license,
      parameters: frontmatter.parameters || [],
      trigger: frontmatter.trigger || { type: 'manual' },
      enabled: true,
      installedAt: Date.now()
    }

    return await saveSkill(skillRecord)
  }

  async checkForUpdate(skillId, latestVersion) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const currentVersion = skill.version || '1.0.0'
    return {
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion
    }
  }

  async getVersionInfo(skillId) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    return {
      id: skill.id,
      name: skill.name,
      version: skill.version || '1.0.0',
      installedAt: skill.installedAt || null,
      updatedAt: skill.updatedAt || null
    }
  }
}
