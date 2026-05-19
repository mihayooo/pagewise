/**
 * BookmarkOrganize — 书签组织模块 (Re-export Facade)
 *
 * R125: 拆分后保留向后兼容 re-export。
 * 原始实现已拆分为:
 *   - bookmark-clusterer.js     — BookmarkClusterer (主题聚类)
 *   - bookmark-folder-analyzer.js — BookmarkFolderAnalyzer (文件夹分析)
 *   - bookmark-dedup.js         — BookmarkDedup (去重检测)
 *   - bookmark-tag-editor.js    — BookmarkTagEditor (标签编辑)
 */
export { BookmarkClusterer } from './bookmark-clusterer.js';
export { BookmarkFolderAnalyzer, QUALITY_THRESHOLDS } from './bookmark-folder-analyzer.js';
export { BookmarkDedup } from './bookmark-dedup.js';
export { BookmarkTagEditor } from './bookmark-tag-editor.js';
