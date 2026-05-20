/**
 * BookmarkKnowledgePacks — 知识包分享与团队空间
 *
 * 实现用户间知识资产打包、分享、导入与管理。
 * 拆分为 core（创建/脱敏/社区管理）和 io（导入/导出/持久化/增量更新）。
 *
 * @module lib/bookmark-knowledge-packs
 * @see bookmark-knowledge-packs-core.js
 * @see bookmark-knowledge-packs-io.js
 */

// 导入 core — 类定义 + 核心方法
export {
  BookmarkKnowledgePacks,
  PACK_FORMAT_VERSION,
  VISIBILITY_LEVELS,
  ANKI_EXPORT_VERSION,
} from './bookmark-knowledge-packs-core.js'

// 导入 io — 副作用：为 BookmarkKnowledgePacks 原型混入
// importKnowledgePack / checkPackUpdate / exportToAnki / exportToBase64 / exportData / importData
import './bookmark-knowledge-packs-io.js'
