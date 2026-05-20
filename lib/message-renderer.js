/**
 * MessageRenderer — 消息渲染系统
 *
 * 拆分为 dom（构造/懒渲染/消息构建/管理）和 actions（操作/引用/代码块）。
 *
 * @module lib/message-renderer
 * @see message-renderer-dom.js
 * @see message-renderer-actions.js
 */

export { MessageRenderer, MAX_RENDERED, LOAD_BATCH } from './message-renderer-dom.js';

// 导入 actions — 副作用：为 MessageRenderer 原型混入
// handleMessageAction / _injectQuoteAttributes / _sendLocateAndHighlight /
// injectCodeBlockRunButtons / extractRunnableCodeBlocks
import './message-renderer-actions.js';
