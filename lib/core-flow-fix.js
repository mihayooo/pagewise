/**
 * CoreFlowFix — 核心流程改进模块 (R110)
 *
 * 基于 R106 审计输出，修复核心用户体验流程中的交互痛点：
 * 1. 选区丢失容错 — 带指数退避的重试 + 用户友好提示
 * 2. AI 响应超时 UI 反馈 — 超时检测 + 经过时间提示 + 中止选项
 * 3. 知识库写入失败兜底 — 本地重试队列（支持持久化）
 * 4. 检索结果空态引导 — 上下文感知的引导文案 + 操作建议
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

// ==================== 知识库写入重试队列 ====================

/** 默认重试队列配置 */
export const QUEUE_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  maxQueueSize: 50,
  storageKey: 'pw_kb_write_queue'
};

/**
 * 创建队列条目
 * @param {Object} entryData - 要保存的知识条目数据
 * @returns {{ id: string, entryData: Object, retryCount: number, createdAt: string, nextRetryAt: string, lastError: string|null, status: string }}
 */
export function createQueueEntry(entryData) {
  const now = new Date().toISOString();
  return {
    id: `qw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryData,
    retryCount: 0,
    createdAt: now,
    nextRetryAt: now,
    lastError: null,
    status: 'pending'
  };
}

/**
 * 计算重试延迟（指数退避）
 * @param {number} retryCount - 已重试次数
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {number} 延迟毫秒数
 */
export function calcRetryDelay(retryCount, baseDelayMs = 1000, maxDelayMs = 10000) {
  if (retryCount <= 0) return 0;
  return Math.min(baseDelayMs * Math.pow(2, retryCount - 1), maxDelayMs);
}

/**
 * 计算下次重试时间
 * @param {number} retryCount - 已重试次数
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {string} ISO 时间戳
 */
export function calcNextRetryTime(retryCount, baseDelayMs = 1000, maxDelayMs = 10000) {
  const delay = calcRetryDelay(retryCount, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delay).toISOString();
}

/**
 * 判断队列条目是否应该重试
 * @param {Object} queueEntry - 队列条目
 * @param {number} maxRetries - 最大重试次数
 * @returns {boolean}
 */
export function shouldRetry(queueEntry, maxRetries = 3) {
  if (!queueEntry) return false;
  if (queueEntry.status === 'success' || queueEntry.status === 'failed') return false;
  if (queueEntry.retryCount >= maxRetries) return false;
  if (!queueEntry.nextRetryAt) return true;
  return new Date(queueEntry.nextRetryAt) <= new Date();
}

/**
 * 标记重试
 * @param {Object} queueEntry - 队列条目
 * @param {string} errorMessage - 错误消息
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {Object} 更新后的条目
 */
export function markRetry(queueEntry, errorMessage, baseDelayMs = 1000, maxDelayMs = 10000) {
  const updated = { ...queueEntry };
  updated.retryCount += 1;
  updated.lastError = errorMessage || null;
  updated.status = 'pending';
  updated.nextRetryAt = calcNextRetryTime(updated.retryCount, baseDelayMs, maxDelayMs);
  return updated;
}

/**
 * 标记成功
 * @param {Object} queueEntry - 队列条目
 * @returns {Object} 更新后的条目
 */
export function markSuccess(queueEntry) {
  return {
    ...queueEntry,
    status: 'success',
    lastError: null
  };
}

/**
 * 标记最终失败
 * @param {Object} queueEntry - 队列条目
 * @param {string} errorMessage - 错误消息
 * @returns {Object} 更新后的条目
 */
export function markFailed(queueEntry, errorMessage) {
  return {
    ...queueEntry,
    status: 'failed',
    lastError: errorMessage || null
  };
}

/**
 * 添加条目到队列
 * @param {Array} queue - 当前队列
 * @param {Object} entryData - 知识条目数据
 * @param {number} maxQueueSize - 最大队列长度
 * @returns {{ queue: Array, newEntry: Object }} 更新后的队列和新条目
 */
export function enqueue(queue, entryData, maxQueueSize = 50) {
  const newEntry = createQueueEntry(entryData);
  const updatedQueue = [...queue, newEntry];
  // 超过队列大小限制时，淘汰最早的已完成/失败条目
  if (updatedQueue.length > maxQueueSize) {
    const removable = updatedQueue.findIndex(
      e => e.status === 'success' || e.status === 'failed'
    );
    if (removable >= 0) {
      updatedQueue.splice(removable, 1);
    }
    // 如果没有可淘汰的，移除最旧的
    if (updatedQueue.length > maxQueueSize) {
      updatedQueue.shift();
    }
  }
  return { queue: updatedQueue, newEntry };
}

/**
 * 获取待重试的队列条目
 * @param {Array} queue - 当前队列
 * @param {number} maxRetries - 最大重试次数
 * @returns {Array} 待重试条目
 */
export function getPendingItems(queue, maxRetries = 3) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(item => shouldRetry(item, maxRetries));
}

/**
 * 清理已完成/失败的队列条目
 * @param {Array} queue - 当前队列
 * @returns {Array} 清理后的队列
 */
export function clearCompleted(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(item => item.status === 'pending');
}

/**
 * 获取队列统计信息
 * @param {Array} queue - 当前队列
 * @returns {{ total: number, pending: number, failed: number, success: number }}
 */
export function getQueueStats(queue) {
  if (!Array.isArray(queue)) {
    return { total: 0, pending: 0, failed: 0, success: 0 };
  }
  return {
    total: queue.length,
    pending: queue.filter(e => e.status === 'pending').length,
    failed: queue.filter(e => e.status === 'failed').length,
    success: queue.filter(e => e.status === 'success').length
  };
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
