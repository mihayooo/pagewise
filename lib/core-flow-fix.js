/**
 * CoreFlowFix — 核心流程改进模块 (R110, 编排层)
 *
 * R280: 从原 384 行拆分为:
 *   - core-flow-fix-queue.js — 知识库写入重试队列管理
 *   - core-flow-fix.js — 选区重试 + AI 超时检测 + 检索空态引导 + re-export（编排层）
 *
 * 纯 ES Module，不依赖 DOM / Chrome API
 */

// ==================== 选区重试 ====================

/** 默认选区重试配置 */
export const SELECTION_RETRY_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 2000
};

/**
 * 计算指数退避延迟
 * @param {number} attempt - 当前尝试次数 (0-based)
 * @param {number} baseDelayMs - 基础延迟 (ms)
 * @param {number} maxDelayMs - 最大延迟上限 (ms)
 * @returns {number} 延迟毫秒数
 */
export function calcBackoffDelay(attempt, baseDelayMs = 300, maxDelayMs = 2000) {
  if (attempt <= 0) return 0;
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  return delay;
}

/**
 * 获取选区重试提示消息
 * @param {number} attempt - 当前尝试次数 (1-based)
 * @param {number} maxRetries - 最大重试次数
 * @returns {string} 提示消息
 */
export function getSelectionRetryMessage(attempt, maxRetries) {
  if (attempt <= 0) return '';
  if (attempt >= maxRetries) {
    return '⚠️ 无法获取选中文本，请在页面中重新选中内容后再试';
  }
  return `正在重新获取选中文本（第 ${attempt}/${maxRetries} 次）...`;
}

/**
 * 获取选区失败的最终提示消息
 * @returns {string}
 */
export function getSelectionFailedMessage() {
  return '⚠️ 无法获取选中文本，请在页面中重新选中内容后重试。您也可以直接在输入框中输入问题。';
}

// ==================== AI 超时检测 ====================

/** 默认超时配置 */
export const AI_TIMEOUT_DEFAULTS = {
  warningThresholdMs: 15000,  // 15 秒后显示警告
  timeoutThresholdMs: 120000  // 120 秒视为超时
};

/**
 * 格式化经过时间
 * @param {number} elapsedMs - 经过的毫秒数
 * @returns {string} 格式化的时间字符串 (如 "12s" 或 "1m 23s")
 */
export function formatElapsedTime(elapsedMs) {
  if (elapsedMs < 0) elapsedMs = 0;
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}

/**
 * 判断当前请求是否应显示超时警告
 * @param {number} startTime - 请求开始时间 (performance.now())
 * @param {number} thresholdMs - 警告阈值 (ms)
 * @param {number} now - 当前时间
 * @returns {boolean}
 */
export function shouldShowTimeoutWarning(startTime, thresholdMs, now) {
  if (typeof startTime !== 'number' || !isFinite(startTime)) return false;
  if (typeof thresholdMs !== 'number' || thresholdMs <= 0) return false;
  if (typeof now !== 'number' || !isFinite(now)) return false;
  return (now - startTime) >= thresholdMs;
}

/**
 * 获取超时警告消息
 * @param {string} elapsed - 格式化的经过时间
 * @returns {string} 超时警告消息
 */
export function getTimeoutWarningMessage(elapsed) {
  return `⏳ AI 响应耗时较长（${elapsed}），请耐心等待或点击「停止」后重试`;
}

/**
 * 获取超时建议
 * @returns {string}
 */
export function getTimeoutSuggestion() {
  return '💡 提示：如果频繁超时，请尝试切换到更快的模型（如 GPT-4o-mini），或缩短问题内容。';
}

// ==================== 检索空态引导 ====================

/** 引导类型枚举 */
export const GuidanceType = {
  EMPTY_KB: 'empty_kb',       // 知识库完全为空
  NO_RESULTS: 'no_results',   // 有知识库但搜索无结果
  TIPS: 'tips'                // 搜索技巧提示
};

/**
 * 生成知识库空态引导内容
 * @returns {{ type: string, icon: string, title: string, message: string, tips: string[] }}
 */
export function getEmptyKBGuidance() {
  return {
    type: GuidanceType.EMPTY_KB,
    icon: '📚',
    title: '知识库为空',
    message: '您还没有保存任何知识条目。开始提问后，AI 回答会自动保存到知识库中。',
    tips: [
      '在页面中选中文字，然后点击「问AI」',
      '直接在输入框中输入问题并发送',
      'AI 回答后点击「保存到知识库」按钮'
    ]
  };
}

/**
 * 生成搜索无结果引导内容
 * @param {string} query - 搜索关键词
 * @param {Array} suggestions - 建议搜索词
 * @returns {{ type: string, icon: string, title: string, message: string, suggestions: string[], tips: string[] }}
 */
export function getNoResultsGuidance(query, suggestions = []) {
  const guidance = {
    type: GuidanceType.NO_RESULTS,
    icon: '🔍',
    title: `未找到匹配「${query || ''}」的知识条目`,
    message: '',
    suggestions: suggestions || [],
    tips: []
  };

  if (suggestions && suggestions.length > 0) {
    guidance.message = '试试以下建议：';
    guidance.tips = [
      '检查搜索词是否有错别字',
      '尝试使用更短的关键词',
      '切换到语义搜索模式获得更宽泛的结果'
    ];
  } else {
    guidance.message = '没有找到相关条目，您可以尝试：';
    guidance.tips = [
      '使用更短或更常见的关键词',
      '切换到语义搜索模式',
      '浏览标签筛选相关条目',
      '先提问并保存更多知识到知识库中'
    ];
  }

  return guidance;
}

/**
 * 生成搜索技巧提示内容
 * @returns {{ type: string, icon: string, title: string, message: string, tips: string[] }}
 */
export function getSearchTips() {
  return {
    type: GuidanceType.TIPS,
    icon: '💡',
    title: '搜索技巧',
    message: '使用以下技巧可以更精确地找到知识条目：',
    tips: [
      '使用关键词搜索精确匹配标题、内容和标签',
      '切换到语义搜索模式，理解搜索意图',
      '通过标签筛选缩小搜索范围',
      '使用简短的中文关键词效果最佳'
    ]
  };
}

/**
 * 根据知识库条目数量和搜索结果生成上下文引导
 * @param {number} entryCount - 知识库条目总数
 * @param {string} query - 搜索词
 * @param {Array} suggestions - 建议搜索词
 * @returns {Object} 引导内容对象
 */
export function generateSearchGuidance(entryCount, query, suggestions = []) {
  if (entryCount === 0) {
    return getEmptyKBGuidance();
  }
  return getNoResultsGuidance(query, suggestions);
}

// ==================== 常量 ====================

/** 流程改进标识 */
export const CORE_FLOW_FIX_VERSION = '1.0.0';

// ==================== 向后兼容 re-export ====================
// 从 core-flow-fix-queue.js 重导出队列相关函数
export {
  QUEUE_DEFAULTS,
  createQueueEntry,
  calcRetryDelay,
  calcNextRetryTime,
  shouldRetry,
  markRetry,
  markSuccess,
  markFailed,
  enqueue,
  getPendingItems,
  clearCompleted,
  getQueueStats,
} from './core-flow-fix-queue.js';
