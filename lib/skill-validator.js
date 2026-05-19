/**
 * Skill Validator — Community skill format validation & security checks
 *
 * Security scan 与包大小校验已拆分至 skill-validator-security.js
 */

import {
  SecurityScanResult,
  scanCode,
  scanPackage,
  validatePackageSize,
} from './skill-validator-security.js'

// ==================== Constants ====================

/** Valid skill ID pattern */
const ID_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/

/** Valid semver pattern */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/** Valid categories */
const VALID_CATEGORIES = [
  'analysis', 'code', 'debug', 'doc', 'learning',
  'export', 'translation', 'general'
]

/** Required files in a skill package */
const REQUIRED_FILES = ['SKILL.md', 'main.js', 'README.md']

// ==================== SKILL.md Parser ====================

/**
 * Parse SKILL.md frontmatter and body
 */
export function parseSkillManifest(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must contain YAML frontmatter delimited by ---')
  }

  const yamlStr = match[1]
  const body = match[2].trim()
  const frontmatter = parseSimpleYaml(yamlStr)

  return { frontmatter, body }
}

/**
 * Simple YAML parser for skill manifests
 */
export function parseSimpleYaml(yaml) {
  const result = {}
  const lines = yaml.split(/\r?\n/)
  let currentKey = null
  let currentArray = null
  let currentObject = null
  let inBlock = false
  let blockIndent = 0

  function flushPending() {
    if (currentArray !== null && currentKey) {
      if (currentObject !== null) {
        currentArray.push(currentObject)
        currentObject = null
      }
      result[currentKey] = currentArray
      currentArray = null
    } else if (currentObject !== null && currentKey) {
      result[currentKey] = currentObject
      currentObject = null
    }
    currentKey = null
    inBlock = false
  }

  for (const line of lines) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue

    const indent = line.search(/\S/)
    const trimmed = line.trim()

    if (indent === 0) {
      flushPending()

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx > 0) {
        currentKey = trimmed.substring(0, colonIdx).trim()
        const value = trimmed.substring(colonIdx + 1).trim()

        if (value === '' || value === '|' || value === '>') {
          inBlock = true
          blockIndent = 0
        } else {
          result[currentKey] = parseYamlValue(value)
          currentKey = null
          inBlock = false
        }
      }
    } else if (indent > 0 && currentKey) {
      inBlock = true
      if (blockIndent === 0) blockIndent = indent

      if (trimmed.startsWith('- ')) {
        const itemValue = trimmed.substring(2).trim()

        if (currentObject !== null && Object.keys(currentObject).length > 0) {
          if (currentArray === null) currentArray = []
          currentArray.push(currentObject)
          currentObject = null
        }
        if (currentArray === null) currentArray = []

        if (itemValue.includes(': ') && !itemValue.startsWith('"') && !itemValue.startsWith("'")) {
          currentObject = {}
          const objColonIdx = itemValue.indexOf(':')
          const objKey = itemValue.substring(0, objColonIdx).trim()
          const objVal = itemValue.substring(objColonIdx + 1).trim()
          currentObject[objKey] = parseYamlValue(objVal)
        } else {
          if (currentObject !== null) {
            currentArray.push(currentObject)
            currentObject = null
          }
          currentArray.push(parseYamlValue(itemValue))
        }
      } else if (trimmed.includes(': ') && !trimmed.startsWith('-')) {
        const colonIdx = trimmed.indexOf(':')
        const nestedKey = trimmed.substring(0, colonIdx).trim()
        const nestedVal = trimmed.substring(colonIdx + 1).trim()

        if (currentObject !== null) {
          if (nestedVal) {
            currentObject[nestedKey] = parseYamlValue(nestedVal)
          }
        } else {
          if (currentObject === null) {
            currentObject = {}
          }
          if (nestedVal) {
            currentObject[nestedKey] = parseYamlValue(nestedVal)
          }
        }
      }
    }
  }

  flushPending()

  return result
}

function parseYamlValue(str) {
  if (!str || str === '~' || str === 'null') return null
  if (str === 'true') return true
  if (str === 'false') return false

  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1)
  }

  if (str.startsWith('[') && str.endsWith(']')) {
    return str.slice(1, -1).split(',').map(s => parseYamlValue(s.trim()))
  }

  const num = Number(str)
  if (!isNaN(num) && str.trim() !== '') return num

  return str
}

// ==================== Validation ====================

export class ValidationError extends Error {
  constructor(message, { field = null, severity = 'error' } = {}) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
    this.severity = severity
  }
}

export class ValidationResult {
  constructor() {
    this.errors = []
    this.warnings = []
  }

  get valid() {
    return this.errors.length === 0
  }

  addError(message, field = null) {
    this.errors.push(new ValidationError(message, { field, severity: 'error' }))
  }

  addWarning(message, field = null) {
    this.warnings.push(new ValidationError(message, { field, severity: 'warning' }))
  }

  merge(other) {
    this.errors.push(...other.errors)
    this.warnings.push(...other.warnings)
  }

  toString() {
    const lines = []
    if (this.valid) {
      lines.push('Validation passed')
    } else {
      lines.push(`Validation failed with ${this.errors.length} error(s)`)
    }
    if (this.warnings.length > 0) {
      lines.push(`${this.warnings.length} warning(s)`)
    }
    for (const err of this.errors) {
      lines.push(`  ERROR${err.field ? ` [${err.field}]` : ''}: ${err.message}`)
    }
    for (const warn of this.warnings) {
      lines.push(`  WARN${warn.field ? ` [${warn.field}]` : ''}: ${warn.message}`)
    }
    return lines.join('\n')
  }
}

/**
 * Validate SKILL.md manifest fields
 */
export function validateManifest(frontmatter) {
  const result = new ValidationResult()

  const requiredFields = ['id', 'name', 'version', 'description', 'author', 'category', 'license']
  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      result.addError(`Missing required field: ${field}`, field)
    }
  }

  if (frontmatter.id) {
    if (!ID_PATTERN.test(frontmatter.id)) {
      result.addError(
        `Invalid skill ID "${frontmatter.id}": must be lowercase alphanumeric with hyphens, 2-64 chars, start with letter`,
        'id'
      )
    }
  }

  if (frontmatter.name && frontmatter.name.length > 100) {
    result.addError('Skill name exceeds 100 characters', 'name')
  }

  if (frontmatter.version) {
    if (!SEMVER_PATTERN.test(frontmatter.version)) {
      result.addError(`Invalid version "${frontmatter.version}": must be semver (MAJOR.MINOR.PATCH)`, 'version')
    }
  }

  if (frontmatter.minVersion) {
    if (!SEMVER_PATTERN.test(String(frontmatter.minVersion))) {
      result.addError(`Invalid minVersion "${frontmatter.minVersion}": must be semver`, 'minVersion')
    }
  }

  if (frontmatter.description && frontmatter.description.length > 200) {
    result.addWarning('Description exceeds 200 characters', 'description')
  }

  if (frontmatter.category && !VALID_CATEGORIES.includes(frontmatter.category)) {
    result.addError(
      `Invalid category "${frontmatter.category}": must be one of ${VALID_CATEGORIES.join(', ')}`,
      'category'
    )
  }

  if (frontmatter.parameters) {
    if (!Array.isArray(frontmatter.parameters)) {
      result.addError('Parameters must be an array', 'parameters')
    } else {
      const validTypes = ['string', 'number', 'boolean', 'enum', 'object']
      for (let i = 0; i < frontmatter.parameters.length; i++) {
        const param = frontmatter.parameters[i]
        if (!param.name) {
          result.addError(`Parameter ${i} missing name`, `parameters[${i}]`)
        }
        if (!param.type) {
          result.addError(`Parameter ${i} missing type`, `parameters[${i}]`)
        } else if (!validTypes.includes(param.type)) {
          result.addError(
            `Parameter ${i} has invalid type "${param.type}"`,
            `parameters[${i}]`
          )
        }
      }
    }
  }

  if (frontmatter.trigger) {
    const validTriggerTypes = ['manual', 'auto', 'keyword', 'url_pattern']
    if (!frontmatter.trigger.type || !validTriggerTypes.includes(frontmatter.trigger.type)) {
      result.addError(
        `Invalid trigger type: must be one of ${validTriggerTypes.join(', ')}`,
        'trigger'
      )
    }
  }

  if (frontmatter.keywords) {
    if (!Array.isArray(frontmatter.keywords)) {
      result.addError('Keywords must be an array', 'keywords')
    } else if (frontmatter.keywords.length > 10) {
      result.addWarning('Too many keywords (max 10 recommended)', 'keywords')
    }
  }

  return result
}

// ==================== 向后兼容 re-export ====================

export { SecurityScanResult, scanCode, scanPackage, validatePackageSize }

// ==================== Full Validation Pipeline ====================

/**
 * Validate a complete skill package
 */
export function validateSkillPackage(files) {
  const result = new ValidationResult()

  const fileNames = files.map(f => f.name)
  for (const required of REQUIRED_FILES) {
    if (!fileNames.includes(required)) {
      result.addError(`Missing required file: ${required}`)
    }
  }

  const sizeResult = validatePackageSize(files)
  result.merge(sizeResult)

  const skillMd = files.find(f => f.name === 'SKILL.md')
  if (skillMd) {
    try {
      const { frontmatter } = parseSkillManifest(skillMd.content)
      const manifestResult = validateManifest(frontmatter)
      result.merge(manifestResult)
    } catch (e) {
      result.addError(`Failed to parse SKILL.md: ${e.message}`, 'SKILL.md')
    }
  }

  const securityResult = scanPackage(files)
  if (!securityResult.safe) {
    for (const finding of securityResult.findings) {
      if (finding.risk === 'critical' || finding.risk === 'high') {
        result.addError(
          `Security: ${finding.pattern} found in ${finding.file}:${finding.line}`,
          finding.file
        )
      } else {
        result.addWarning(
          `Security: ${finding.pattern} found in ${finding.file}:${finding.line}`,
          finding.file
        )
      }
    }
  }

  return result
}
