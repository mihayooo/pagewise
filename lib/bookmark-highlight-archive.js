/**
 * SmartHighlightArchive — 智能摘录归档
 *
 * 拆分为 core（构造/核心API/撤销/内部方法）和 toast（Toast/上下文/统计）。
 *
 * @module lib/bookmark-highlight-archive
 * @see bookmark-highlight-archive-core.js
 * @see bookmark-highlight-archive-toast.js
 */

export { SmartHighlightArchive } from './bookmark-highlight-archive-core.js';

// 导入 toast — 副作用：为 SmartHighlightArchive 原型混入
// buildToastMessage / buildBatchToastMessage / extractContext / getStats / getRecentArchives / cleanupUndoBuffer
import './bookmark-highlight-archive-toast.js';

export { DEFAULT_UNDO_WINDOW_MS, CONTEXT_CHARS } from './bookmark-highlight-archive-core.js';
