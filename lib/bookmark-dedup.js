/**
 * BookmarkDedup — 重复书签检测与清理
 *
 * R207: 合并至 bookmark-duplicate-detector.js，保留向后兼容 re-export。
 * BookmarkDedup 是 BookmarkDuplicateDetector 的兼容别名，所有原始 API
 * (normalizeUrl / titleSimilarity / findByExactUrl / findBySimilarTitle /
 *  findDuplicates / suggestCleanup / batchRemove) 均可通过此模块访问。
 *
 * @module lib/bookmark-dedup
 */

import { BookmarkDuplicateDetector } from './bookmark-duplicate-detector.js';

/**
 * BookmarkDedup — 向后兼容别名
 *
 * 所有方法已合并至 BookmarkDuplicateDetector，此处仅做 re-export。
 * 新代码应直接 import { BookmarkDuplicateDetector } from './bookmark-duplicate-detector.js'
 */
export class BookmarkDedup extends BookmarkDuplicateDetector {}
export default BookmarkDedup;
