/**
 * SkillCommunityHub + SkillCommunityReviews — 从 skill-store.js (R130) 拆分
 *
 * 包含：
 *   - SkillCommunityHub: GitHub 集成、从仓库安装技能
 *   - SkillCommunityReviews: 评分/评论系统 (IndexedDB)
 *   - 版本工具: parseVersion, compareVersions, isNewerVersion, isVersionCompatible
 *
 * @module skill-store-community
 */

import { createZip } from './skill-zip.js'
import { validateSkillPackage, parseSkillManifest } from './skill-validator.js'

const GITHUB_API_BASE = 'https://api.github.com'

// ==================== Version Utilities ====================

export function parseVersion(version) {
  const parts = String(version).split('.')
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0
  }
}

export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1
  return 0
}

export function isNewerVersion(a, b) {
  return compareVersions(a, b) > 0
}

export function isVersionCompatible(current, minimum) {
  return compareVersions(current, minimum) >= 0
}

// ==================== Base64 ====================

function base64Decode(str) {
  const cleaned = str.replace(/\s/g, '')
  if (typeof atob !== 'undefined') {
    return atob(cleaned)
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf-8')
  }
  throw new Error('No base64 decoder available')
}

// ==================== SkillCommunityHub ====================

export class SkillCommunityHub {
  constructor(options = {}) {
    this.githubApiBase = options.githubApiBase || GITHUB_API_BASE
    this._fetch = options.fetch || null
  }

  _getFetch() {
    return this._fetch || (typeof fetch !== 'undefined' ? fetch : null)
  }

  async fetchFromGitHub(repo, options = {}) {
    const { branch = 'main', path = '' } = options

    if (!repo || !repo.includes('/')) {
      throw new Error('Invalid repo format. Expected "owner/repo"')
    }

    const fetchFn = this._getFetch()
    if (!fetchFn) {
      throw new Error('fetch is not available')
    }

    const basePath = path ? `${path}/` : ''
    const requiredFiles = ['SKILL.md', 'main.js', 'README.md']
    const files = []

    for (const filename of requiredFiles) {
      const url = `${this.githubApiBase}/repos/${repo}/contents/${basePath}${filename}?ref=${branch}`

      try {
        const resp = await fetchFn(url, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PageWise-SkillInstaller'
          }
        })

        if (!resp.ok) {
          if (resp.status === 404) {
            throw new Error(`File not found: ${basePath}${filename}`)
          }
          throw new Error(`GitHub API error: HTTP ${resp.status}`)
        }

        const data = await resp.json()

        if (data.encoding === 'base64') {
          const content = base64Decode(data.content)
          files.push({ name: filename, content })
        } else if (data.content) {
          files.push({ name: filename, content: data.content })
        }
      } catch (e) {
        if (e.message.includes('not found') || e.message.includes('HTTP')) {
          throw e
        }
        throw new Error(`Failed to fetch ${filename}: ${e.message}`)
      }
    }

    // Fetch optional files
    const optionalFiles = ['test.js']
    for (const filename of optionalFiles) {
      const url = `${this.githubApiBase}/repos/${repo}/contents/${basePath}${filename}?ref=${branch}`

      try {
        const resp = await fetchFn(url, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PageWise-SkillInstaller'
          }
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.encoding === 'base64') {
            files.push({ name: filename, content: base64Decode(data.content) })
          } else if (data.content) {
            files.push({ name: filename, content: data.content })
          }
        }
      } catch {
        // Optional file, silently skip
      }
    }

    const skillMd = files.find(f => f.name === 'SKILL.md')
    if (!skillMd) {
      throw new Error('SKILL.md not found in repository')
    }

    const { frontmatter } = parseSkillManifest(skillMd.content)

    return { files, manifest: frontmatter }
  }

  async installFromGitHub(repo, options = {}) {
    const { files, manifest: _manifest } = await this.fetchFromGitHub(repo, options)

    const validation = validateSkillPackage(files)
    if (!validation.valid) {
      throw new Error(`Skill validation failed:\n${validation.toString()}`)
    }

    // Dynamically import to avoid circular dependency
    const { SkillPackageManager } = await import('./skill-store.js')
    const pkg = new SkillPackageManager()
    const zipData = createZip(files)
    return pkg.importSkill(zipData, { overwrite: options.overwrite || false })
  }
}

// ==================== Skill Review / Rating (IndexedDB) ====================

const REVIEW_DB_NAME = 'pagewise_skill_reviews'
const REVIEW_DB_VERSION = 1
const REVIEW_STORE_NAME = 'reviews'
const STATS_STORE_NAME = 'stats'

function openReviewDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REVIEW_DB_NAME, REVIEW_DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
        const store = db.createObjectStore(REVIEW_STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('skillId', 'skillId', { unique: false })
        store.createIndex('author', 'author', { unique: false })
      }
      if (!db.objectStoreNames.contains(STATS_STORE_NAME)) {
        db.createObjectStore(STATS_STORE_NAME, { keyPath: 'skillId' })
      }
    }

    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => reject(event.target.error)
  })
}

function r2p(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export class SkillCommunityReviews {
  async addReview(review) {
    if (!review.skillId) throw new Error('Missing skillId')
    if (!review.author) throw new Error('Missing author')
    if (typeof review.rating !== 'number' || review.rating < 1 || review.rating > 5) {
      throw new Error('Rating must be a number between 1 and 5')
    }

    const record = {
      skillId: review.skillId,
      author: review.author,
      rating: Math.round(review.rating * 10) / 10,
      comment: review.comment || '',
      version: review.version || '',
      createdAt: Date.now()
    }

    const db = await openReviewDB()
    const tx = db.transaction([REVIEW_STORE_NAME, STATS_STORE_NAME], 'readwrite')
    const reviewStore = tx.objectStore(REVIEW_STORE_NAME)
    const statsStore = tx.objectStore(STATS_STORE_NAME)

    const saved = await r2p(reviewStore.add(record))

    const allReviews = await r2p(reviewStore.index('skillId').getAll(review.skillId))
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0)
    const avgRating = Math.round((totalRating / allReviews.length) * 10) / 10

    const stats = {
      skillId: review.skillId,
      rating: avgRating,
      reviewCount: allReviews.length,
      lastUpdated: Date.now()
    }
    await r2p(statsStore.put(stats))

    db.close()
    return { ...record, id: saved }
  }

  async getReviews(skillId) {
    const db = await openReviewDB()
    const tx = db.transaction(REVIEW_STORE_NAME, 'readonly')
    const store = tx.objectStore(REVIEW_STORE_NAME)
    const reviews = await r2p(store.index('skillId').getAll(skillId))
    db.close()
    return reviews || []
  }

  async getStats(skillId) {
    const db = await openReviewDB()
    const tx = db.transaction(STATS_STORE_NAME, 'readonly')
    const store = tx.objectStore(STATS_STORE_NAME)
    const stats = await r2p(store.get(skillId))
    db.close()

    return stats || {
      skillId,
      rating: 0,
      reviewCount: 0,
      lastUpdated: null
    }
  }

  async deleteReview(skillId, author) {
    const db = await openReviewDB()
    const tx = db.transaction([REVIEW_STORE_NAME, STATS_STORE_NAME], 'readwrite')
    const store = tx.objectStore(REVIEW_STORE_NAME)
    const reviews = await r2p(store.index('skillId').getAll(skillId))
    const toDelete = reviews.find(r => r.author === author)

    if (!toDelete) {
      db.close()
      return false
    }

    await r2p(store.delete(toDelete.id))

    const remaining = reviews.filter(r => r.id !== toDelete.id)
    const statsStore = tx.objectStore(STATS_STORE_NAME)

    if (remaining.length === 0) {
      await r2p(statsStore.delete(skillId))
    } else {
      const totalRating = remaining.reduce((sum, r) => sum + r.rating, 0)
      const avgRating = Math.round((totalRating / remaining.length) * 10) / 10
      await r2p(statsStore.put({
        skillId,
        rating: avgRating,
        reviewCount: remaining.length,
        lastUpdated: Date.now()
      }))
    }

    db.close()
    return true
  }
}
