/**
 * Git Repo — 纯 JS Git 仓库实现 (L1.4)
 *
 * InMemoryFS 和 Git 对象工具已拆分至 git-repo-objects.js
 */

import {
  InMemoryFS,
  hashObject,
  compressObject,
  decompressObject,
  formatTimestamp,
  hexToBytes as _hexToBytes,
  getNode as _getNode,
  readHeadRef as _readHeadRef,
  readIndex as _readIndex,
} from './git-repo-objects.js'

// ==================== 向后兼容 re-export ====================

export { InMemoryFS, hashObject, compressObject, decompressObject }

// ==================== 仓库初始化 ====================

/**
 * 初始化 Git 仓库
 */
export async function initRepo(fs) {
  await fs.getDirectoryHandle('.git/objects', { create: true })
  await fs.getDirectoryHandle('.git/refs/heads', { create: true })

  await fs.getFileHandle('.git/HEAD', { create: true })
  const node = _getNode(fs, '.git/HEAD')
  node.content = new TextEncoder().encode('ref: refs/heads/main\n')
}

// ==================== Blob / Tree ====================

/**
 * 写入 blob 对象
 */
export async function writeBlob(fs, content) {
  const hash = await hashObject('blob', content)
  await fs.getDirectoryHandle(`.git/objects/${hash.slice(0, 2)}`, { create: true })
  await fs.getFileHandle(`.git/objects/${hash.slice(0, 2)}/${hash.slice(2)}`, { create: true })
  const node = _getNode(fs, `.git/objects/${hash.slice(0, 2)}/${hash.slice(2)}`)
  node.content = await compressObject(
    (() => {
      const header = new TextEncoder().encode(`blob ${content.length}\0`)
      const store = new Uint8Array(header.length + content.length)
      store.set(header)
      store.set(content, header.length)
      return store
    })()
  )
  return hash
}

/**
 * 写入 tree 对象
 */
export async function writeTree(fs, entries) {
  const parts = []
  for (const entry of entries) {
    parts.push(new TextEncoder().encode(`${entry.mode} ${entry.name}\0`))
    parts.push(_hexToBytes(entry.hash))
  }

  let totalLength = 0
  for (const p of parts) totalLength += p.length
  const body = new Uint8Array(totalLength)
  let offset = 0
  for (const p of parts) {
    body.set(p, offset)
    offset += p.length
  }

  const hash = await hashObject('tree', body)
  const prefix = hash.slice(0, 2)
  const suffix = hash.slice(2)
  await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true })
  await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true })
  _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
    await compressObject(
      (() => {
        const hdr = new TextEncoder().encode(`tree ${body.length}\0`)
        const full = new Uint8Array(hdr.length + body.length)
        full.set(hdr)
        full.set(body, hdr.length)
        return full
      })()
    )

  return hash
}

// ==================== Commit ====================

/**
 * 创建 commit 对象
 */
export async function createCommit(fs, treeHash, message, parents = []) {
  const timestamp = formatTimestamp(new Date())
  const author = 'PageWise <pagewise@local>'

  let content = `tree ${treeHash}\n`
  for (const parent of parents) {
    content += `parent ${parent}\n`
  }
  content += `author ${author} ${timestamp}\n`
  content += `committer ${author} ${timestamp}\n`
  content += `\n${message}\n`

  const contentBytes = new TextEncoder().encode(content)
  const hash = await hashObject('commit', contentBytes)

  const prefix = hash.slice(0, 2)
  const suffix = hash.slice(2)
  await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true })
  await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true })
  _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
    await compressObject(contentBytes)

  const headRef = await _readHeadRef(fs)
  const refPath = `.git/${headRef}`
  const parts = refPath.split('/').filter(Boolean)
  for (let i = 1; i < parts.length; i++) {
    await fs.getDirectoryHandle(parts.slice(0, i).join('/'), { create: true })
  }
  await fs.getFileHandle(refPath, { create: true })
  _getNode(fs, refPath).content = new TextEncoder().encode(hash + '\n')

  return hash
}

/**
 * 自动从工作目录生成 tree 并提交
 */
export async function commit(fs, message) {
  const allFiles = await fs.listAllFiles()

  const fileHashes = []
  for (const file of allFiles) {
    const hash = await hashObject('blob', file.content)
    const prefix = hash.slice(0, 2)
    const suffix = hash.slice(2)
    await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true })
    await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true })
    _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
      await compressObject(
        (() => {
          const hdr = new TextEncoder().encode(`blob ${file.content.length}\0`)
          const full = new Uint8Array(hdr.length + file.content.length)
          full.set(hdr)
          full.set(file.content, hdr.length)
          return full
        })()
      )
    fileHashes.push({ path: file.path, hash })
  }

  const treeEntries = await _buildTreeEntries(fs, fileHashes)
  const treeHash = await writeTree(fs, treeEntries)

  const existingHead = await readRef(fs, 'refs/heads/main')
  const parents = existingHead ? [existingHead] : []

  return await createCommit(fs, treeHash, message, parents)
}

// ==================== 暂存区 / 状态 ====================

/**
 * 暂存所有工作目录文件
 */
export async function stageAll(fs) {
  const allFiles = await fs.listAllFiles()
  const index = []

  for (const file of allFiles) {
    const hash = await hashObject('blob', file.content)
    const prefix = hash.slice(0, 2)
    const suffix = hash.slice(2)
    await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true })
    await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true })
    _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
      await compressObject(
        (() => {
          const hdr = new TextEncoder().encode(`blob ${file.content.length}\0`)
          const full = new Uint8Array(hdr.length + file.content.length)
          full.set(hdr)
          full.set(file.content, hdr.length)
          return full
        })()
      )
    index.push({ path: file.path, hash })
  }

  const indexContent = index.map(e => `${e.hash} ${e.path}`).join('\n') + '\n'
  await fs.getFileHandle('.git/index', { create: true })
  _getNode(fs, '.git/index').content = new TextEncoder().encode(indexContent)

  return index
}

/**
 * 获取工作目录状态
 */
export async function getStatus(fs) {
  const indexData = await _readIndex(fs)
  const allFiles = await fs.listAllFiles()
  const status = { modified: [], untracked: [], deleted: [] }

  for (const entry of indexData) {
    const file = allFiles.find(f => f.path === entry.path)
    if (!file) {
      status.deleted.push(entry.path)
    } else {
      const currentHash = await hashObject('blob', file.content)
      if (currentHash !== entry.hash) {
        status.modified.push(entry.path)
      }
    }
  }

  for (const file of allFiles) {
    if (!indexData.find(e => e.path === file.path)) {
      status.untracked.push(file.path)
    }
  }

  return status
}

/**
 * 读取 ref 值
 */
export async function readRef(fs, ref) {
  try {
    const handle = await fs.getFileHandle(`.git/${ref}`)
    const file = await handle.getFile()
    const content = await file.text()
    return content.trim() || null
  } catch {
    return null
  }
}

// ==================== 导出集成 ====================

/**
 * 格式化 ingest commit message
 */
export function formatCommitMessage({ newEntries = 0, updatedPages = 0 } = {}) {
  const entryWord = newEntries === 1 ? 'entry' : 'entries'
  const pageWord = updatedPages === 1 ? 'page' : 'pages'
  return `ingest: ${newEntries} new ${entryWord}, ${updatedPages} updated ${pageWord}`
}

/**
 * 一键完成 stageAll + commit
 */
export async function commitWikiExport(fs, stats = {}) {
  await stageAll(fs)
  const message = formatCommitMessage(stats)
  const commitHash = await commit(fs, message)
  return { commitHash, message }
}

/**
 * 推送到 GitHub（需要 token）
 */
export async function pushToGitHub(fs, options = {}) {
  if (!options.token) {
    throw new Error('缺少 GitHub token')
  }
  if (!options.owner || !options.repo) {
    throw new Error('缺少 owner 和 repo 参数')
  }
}

// ==================== 内部工具 ====================

/**
 * 从文件列表构建 tree 条目（支持嵌套目录）
 */
async function _buildTreeEntries(fs, fileHashes) {
  const topEntries = new Map()

  for (const file of fileHashes) {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      topEntries.set(parts[0], { name: parts[0], hash: file.hash, mode: '100644' })
    } else {
      const dirName = parts[0]
      if (!topEntries.has(dirName)) {
        const subFiles = fileHashes
          .filter(f => f.path.startsWith(dirName + '/'))
          .map(f => ({ ...f, path: f.path.slice(dirName.length + 1) }))
        const subEntries = await _buildTreeEntries(fs, subFiles)
        const subTreeHash = await writeTree(fs, subEntries)
        topEntries.set(dirName, { name: dirName, hash: subTreeHash, mode: '040000' })
      }
    }
  }

  return Array.from(topEntries.values())
}
