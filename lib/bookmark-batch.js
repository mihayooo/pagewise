/**
 * BookmarkBatch — 批量操作模块
 *
 * 向后兼容门面模块 — 委托给拆分后的子模块:
 *   - bookmark-batch-utils.js — 辅助函数 + 删除/标签操作
 *   - bookmark-batch-export.js — 移动/导出操作
 *
 * 所有方法返回 { success, failed, results, errors } 统一结构。
 * 纯前端实现，不依赖外部 API。
 *
 * R161 拆分: 原 476 行 → 门面 + 2 子模块
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status]
 * @property {number}   [dateAdded]
 */

/**
 * @typedef {Object} BatchResult
 * @property {number}     success  — 成功数量
 * @property {number}     failed   — 失败数量
 * @property {Object[]}   results  — 成功项详情
 * @property {Object[]}   errors   — 失败项详情 { id, reason }
 */

export {
  normalizeTag,
  buildIdMap,
  createResult,
  cloneBookmark,
  batchDelete,
  batchAddTag,
  batchRemoveTag,
  batchTag,
} from './bookmark-batch-utils.js';

export {
  batchMove,
  batchMoveToFolder,
  batchExport,
} from './bookmark-batch-export.js';
