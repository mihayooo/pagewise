/**
 * Bookmark Batch — 辅助函数与删除/标签操作
 * 从 bookmark-batch.js 拆分
 *
 * @module lib/bookmark-batch-utils
 */

// ==================== 辅助函数 ====================

/**
 * 标签归一化: 小写、trim、去特殊字符
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s{2,}/g, '-')
    .replace(/[^\p{L}\p{N}_\-]/gu, '')
    .slice(0, 30);
}

/**
 * 构建 id → bookmark 查找表
 * @param {Bookmark[]} bookmarks
 * @returns {Map<string, Bookmark>}
 */
export function buildIdMap(bookmarks) {
  const map = new Map();
  if (!Array.isArray(bookmarks)) return map;
  for (const bm of bookmarks) {
    map.set(String(bm.id), bm);
  }
  return map;
}

/**
 * 创建标准批处理结果容器
 * @returns {BatchResult}
 */
export function createResult() {
  return { success: 0, failed: 0, results: [], errors: [] };
}

/**
 * 深拷贝一个书签（简单结构）
 * @param {Bookmark} bm
 * @returns {Bookmark}
 */
export function cloneBookmark(bm) {
  return {
    ...bm,
    folderPath: Array.isArray(bm.folderPath) ? [...bm.folderPath] : [],
    tags: Array.isArray(bm.tags) ? [...bm.tags] : [],
  };
}

// ==================== 批量删除 ====================

/**
 * 批量删除书签
 *
 * @param {Bookmark[]} bookmarks — 书签数组 (原数组不变，返回过滤后的新数组)
 * @param {string[]}   ids       — 要删除的书签 id 列表
 * @returns {BatchResult & { remaining: Bookmark[] }}
 */
export function batchDelete(bookmarks, ids) {
  const result = createResult();
  result.remaining = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.remaining = bookmarks.map(cloneBookmark);
    return result;
  }

  const deleteSet = new Set(ids.map(String));
  const idMap = buildIdMap(bookmarks);

  // 检查每个要删除的 id 是否存在
  for (const id of deleteSet) {
    if (idMap.has(id)) {
      result.success++;
      result.results.push({ id, title: idMap.get(id).title });
    } else {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  // 构建 remaining 列表
  for (const bm of bookmarks) {
    if (!deleteSet.has(String(bm.id))) {
      result.remaining.push(cloneBookmark(bm));
    }
  }

  return result;
}

/**
 * 批量添加单个标签 (batchTag 的便捷封装)
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {string[]}   ids       — 目标书签 id 列表
 * @param {string}     tag       — 要添加的标签
 * @returns {BatchResult & { updated: Bookmark[] }}
 */
export function batchAddTag(bookmarks, ids, tag) {
  return batchTag(bookmarks, ids, [tag], 'add')
}

/**
 * 批量移除单个标签 (batchTag 的便捷封装)
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {string[]}   ids       — 目标书签 id 列表
 * @param {string}     tag       — 要移除的标签
 * @returns {BatchResult & { updated: Bookmark[] }}
 */
export function batchRemoveTag(bookmarks, ids, tag) {
  return batchTag(bookmarks, ids, [tag], 'remove')
}

// ==================== 批量标签 ====================

/**
 * 批量添加或移除标签
 *
 * @param {Bookmark[]} bookmarks — 书签数组 (原数组不变，返回修改后的新数组)
 * @param {string[]}   ids       — 目标书签 id 列表
 * @param {string[]}   tags      — 要操作的标签列表
 * @param {'add'|'remove'} action — 'add' 添加标签, 'remove' 移除标签
 * @returns {BatchResult & { updated: Bookmark[] }}
 */
export function batchTag(bookmarks, ids, tags, action) {
  const result = createResult();
  result.updated = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.updated = bookmarks.map(cloneBookmark);
    return result;
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    result.updated = bookmarks.map(cloneBookmark);
    return result;
  }
  if (action !== 'add' && action !== 'remove') {
    result.updated = bookmarks.map(cloneBookmark);
    result.errors.push({ id: '*', reason: `invalid action: "${action}", must be "add" or "remove"` });
    result.failed = ids.length;
    return result;
  }

  const targetSet = new Set(ids.map(String));
  const normalizedTags = tags.map(normalizeTag).filter(Boolean);
  const idMap = buildIdMap(bookmarks);

  // 验证所有 ids 是否存在
  for (const id of targetSet) {
    if (!idMap.has(id)) {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  for (const bm of bookmarks) {
    const id = String(bm.id);
    const clone = cloneBookmark(bm);

    if (targetSet.has(id) && idMap.has(id)) {
      if (action === 'add') {
        const existing = new Set(clone.tags);
        let added = 0;
        for (const tag of normalizedTags) {
          if (!existing.has(tag)) {
            clone.tags.push(tag);
            existing.add(tag);
            added++;
          }
        }
        if (added > 0) {
          result.success++;
          result.results.push({ id, tagsAdded: added, newTags: [...clone.tags] });
        } else {
          // All tags already present — still counts as success (idempotent)
          result.success++;
          result.results.push({ id, tagsAdded: 0, newTags: [...clone.tags] });
        }
      } else {
        // remove
        const removeSet = new Set(normalizedTags);
        const before = clone.tags.length;
        clone.tags = clone.tags.filter(t => !removeSet.has(t));
        const removed = before - clone.tags.length;
        result.success++;
        result.results.push({ id, tagsRemoved: removed, newTags: [...clone.tags] });
      }
    }

    result.updated.push(clone);
  }

  return result;
}
