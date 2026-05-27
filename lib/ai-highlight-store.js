/**
 * AIHighlightStore — AI 问答高亮持久化模块
 *
 * 从 search-history.js 拆分而来，管理 AI 问答高亮的 IndexedDB 操作：
 *   - saveAIHighlight(data)                     — 存储 AI 问答高亮
 *   - getAIHighlightsByPageUrl(pageUrl)         — 按页面获取高亮
 *   - getAllAIHighlights()                      — 获取全部高亮
 *   - deleteAIHighlight(id)                     — 删除指定高亮
 *   - clearAllAIHighlights()                    — 清除全部高亮
 */

import { openDB, HIGHLIGHT_STORE } from './search-history.js'

/**
 * 存储 AI 问答高亮
 * @param {{ bookmarkId?: string, pageUrl: string, selectedText: string, aiAnswer: string }} data
 * @returns {Promise<Object>} 保存的高亮记录
 */
export async function saveAIHighlight(data) {
  const { bookmarkId = '', pageUrl, selectedText, aiAnswer } = data
  if (!pageUrl || !selectedText || !aiAnswer) {
    throw new Error('pageUrl, selectedText and aiAnswer are required')
  }

  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const record = {
      bookmarkId,
      pageUrl,
      selectedText,
      aiAnswer,
      createdAt: new Date().toISOString()
    }

    const addReq = store.add(record)
    addReq.onsuccess = () => {
      record.id = addReq.result
      resolve(record)
    }
    addReq.onerror = () => reject(new Error('保存 AI 高亮失败'))
  })
}

/**
 * 按页面 URL 获取 AI 高亮列表
 * @param {string} pageUrl
 * @returns {Promise<Array>}
 */
export async function getAIHighlightsByPageUrl(pageUrl) {
  if (!pageUrl) return []

  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readonly')
  const store = tx.objectStore(HIGHLIGHT_STORE)
  const index = store.index('pageUrl')

  return new Promise((resolve, reject) => {
    const request = index.getAll(pageUrl)
    request.onsuccess = () => {
      const results = (request.result || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
      resolve(results)
    }
    request.onerror = () => reject(new Error('获取 AI 高亮失败'))
  })
}

/**
 * 获取全部 AI 高亮
 * @returns {Promise<Array>}
 */
export async function getAllAIHighlights() {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readonly')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const results = (request.result || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
      resolve(results)
    }
    request.onerror = () => reject(new Error('获取全部 AI 高亮失败'))
  })
}

/**
 * 删除指定 AI 高亮
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteAIHighlight(id) {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('删除 AI 高亮失败'))
  })
}

/**
 * 清除全部 AI 高亮
 * @returns {Promise<boolean>}
 */
export async function clearAllAIHighlights() {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.clear()
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('清除 AI 高亮失败'))
  })
}
