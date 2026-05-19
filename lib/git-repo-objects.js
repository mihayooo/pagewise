/**
 * Git Repo — 内存文件系统与 Git 对象工具子模块
 *
 * 从 git-repo.js 拆分，负责:
 *   - InMemoryFS — 内存文件系统
 *   - hashObject / compressObject / decompressObject — Git 对象工具
 *   - formatTimestamp / hexToBytes — 内部工具
 *
 * @module lib/git-repo-objects
 */

import { createHash } from 'node:crypto'
import { deflateSync, inflateSync } from 'node:zlib'

// ==================== InMemoryFS ====================

/**
 * 内存文件系统，模拟 File System Access API
 */
export class InMemoryFS {
  constructor() {
    this.root = { kind: 'directory', name: '', children: new Map() }
  }

  /**
   * 解析路径并找到父目录
   * @private
   */
  _resolveParent(path) {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return this.root
    const dirParts = parts.slice(0, -1)
    let current = this.root
    for (const part of dirParts) {
      if (!current.children.has(part)) {
        current.children.set(part, { kind: 'directory', name: part, children: new Map() })
      }
      current = current.children.get(part)
    }
    return current
  }

  /**
   * 获取目录句柄
   * @param {string} path
   * @param {Object} [options]
   * @param {boolean} [options.create]
   * @returns {Promise<Object>}
   */
  async getDirectoryHandle(path, options = {}) {
    const parts = path.split('/').filter(Boolean)
    let current = this.root
    for (const part of parts) {
      if (!current.children.has(part)) {
        if (!options.create) throw new Error(`目录不存在: ${part}`)
        current.children.set(part, { kind: 'directory', name: part, children: new Map() })
      }
      current = current.children.get(part)
    }
    return {
      name: parts[parts.length - 1] || '',
      kind: 'directory',
      children: current.children,
    }
  }

  /**
   * 获取文件句柄
   * @param {string} path
   * @param {Object} [options]
   * @param {boolean} [options.create]
   * @returns {Promise<Object>}
   */
  async getFileHandle(path, options = {}) {
    const parts = path.split('/').filter(Boolean)
    const fileName = parts.pop()
    let current = this.root
    for (const part of parts) {
      if (!current.children.has(part)) {
        if (!options.create) throw new Error(`目录不存在: ${part}`)
        current.children.set(part, { kind: 'directory', name: part, children: new Map() })
      }
      current = current.children.get(part)
    }
    if (!current.children.has(fileName)) {
      if (!options.create) throw new Error(`文件不存在: ${fileName}`)
      current.children.set(fileName, {
        kind: 'file',
        name: fileName,
        content: new Uint8Array(0),
      })
    }
    const node = current.children.get(fileName)
    return {
      name: fileName,
      kind: 'file',
      getFile: async () => ({
        text: async () => new TextDecoder().decode(node.content),
        arrayBuffer: async () => node.content.buffer.slice(
          node.content.byteOffset,
          node.content.byteOffset + node.content.byteLength
        ),
        size: node.content.length,
      }),
    }
  }

  /**
   * 递归列出所有文件
   * @returns {Promise<Array<{path: string, content: Uint8Array}>>}
   */
  async listAllFiles() {
    const result = []
    const walk = (dir, prefix) => {
      for (const [name, child] of dir.children) {
        const path = prefix ? `${prefix}/${name}` : name
        if (child.kind === 'file') {
          result.push({ path, content: child.content })
        } else if (child.kind === 'directory' && name !== '.git') {
          walk(child, path)
        }
      }
    }
    walk(this.root, '')
    return result
  }
}

// ==================== Git 对象工具 ====================

/**
 * 计算 Git 对象的 SHA-1 哈希
 * @param {string} type - 对象类型 (blob/tree/commit)
 * @param {Uint8Array} content - 对象内容
 * @returns {Promise<string>} 40 字符小写十六进制哈希
 */
export async function hashObject(type, content) {
  const header = new TextEncoder().encode(`${type} ${content.length}\0`)
  const store = new Uint8Array(header.length + content.length)
  store.set(header)
  store.set(content, header.length)
  return createHash('sha1').update(store).digest('hex')
}

/**
 * 使用 zlib 压缩数据
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export async function compressObject(data) {
  return new Uint8Array(deflateSync(data))
}

/**
 * 使用 zlib 解压数据
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export async function decompressObject(data) {
  return new Uint8Array(inflateSync(data))
}

/**
 * 格式化时间戳为 Git 格式
 * @param {Date} date
 * @returns {string}
 */
export function formatTimestamp(date) {
  const epoch = Math.floor(date.getTime() / 1000)
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absOffset = Math.abs(offset)
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const minutes = String(absOffset % 60).padStart(2, '0')
  return `${epoch} ${sign}${hours}${minutes}`
}

/**
 * 将十六进制字符串转为字节数组
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * 获取 FS 节点
 * @param {Object} fs
 * @param {string} path
 * @returns {Object}
 */
export function getNode(fs, path) {
  const parts = path.split('/').filter(Boolean)
  let current = fs.root
  for (let i = 0; i < parts.length - 1; i++) {
    current = current.children.get(parts[i])
  }
  return current.children.get(parts[parts.length - 1])
}

/**
 * 读取 HEAD 指向的 ref 路径
 * @param {Object} fs
 * @returns {Promise<string>}
 */
export async function readHeadRef(fs) {
  try {
    const headNode = getNode(fs, '.git/HEAD')
    const content = new TextDecoder().decode(headNode.content).trim()
    const match = content.match(/^ref:\s+(.+)$/)
    return match ? match[1] : 'refs/heads/main'
  } catch {
    return 'refs/heads/main'
  }
}

/**
 * 读取 index 文件
 * @param {Object} fs
 * @returns {Promise<Array>}
 */
export async function readIndex(fs) {
  try {
    const node = getNode(fs, '.git/index')
    const content = new TextDecoder().decode(node.content)
    return content.split('\n').filter(Boolean).map(line => {
      const [hash, ...pathParts] = line.split(' ')
      return { hash, path: pathParts.join(' ') }
    })
  } catch {
    return []
  }
}
