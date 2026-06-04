/**
 * FeedbackCollector — NPS 反馈收集器
 *
 * R212: PostLaunchTelemetry — 发布后遥测与反馈收集
 *
 * 设计约束:
 *   - 安装满 7 天后弹出 NPS 评分（0-10）
 *   - 附带文字反馈输入框
 *   - 反馈数据纯本地存储（chrome.storage.local）
 *   - 支持导出 JSON
 *   - 与 BookmarkNotifications 集成:
 *     - 低分 (0-6) 触发"帮助改进"引导
 *     - 高分 (9-10) 引导留 Chrome Web Store 评价
 *
 * @example
 *   import { createFeedbackCollector } from './lib/feedback-collector.js'
 *   const collector = createFeedbackCollector(chrome.storage.local, { notifier })
 *   if (await collector.shouldShowPrompt()) {
 *     // 显示 NPS UI
 *     await collector.submitFeedback(8, '很好用')
 *   }
 *
 * @module lib/feedback-collector
 */

// ==================== 常量 ====================

const FEEDBACK_KEY = 'pagewise_feedback';
const INSTALL_DATE_KEY = 'pagewise_install_date';
const DISMISSED_KEY = 'pagewise_feedback_dismissed';

/** NPS 触发天数 */
const NPS_DELAY_DAYS = 7;

/** 毫秒/天 */
const _MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Chrome Web Store 评价链接 */
const CWS_REVIEW_URL = 'https://chrome.google.com/webstore/detail/pagewise/review';

// ==================== 工厂函数 ====================

/**
 * 创建 FeedbackCollector 实例
 *
 * @param {object} storage — chrome.storage.local 兼容接口
 * @param {object} [options]
 * @param {object} [options.notifier] — BookmarkNotifications 实例（可选）
 * @param {function} [options.now] — 自定义时间源（测试用）
 * @returns {FeedbackCollectorAPI}
 */
export function _createFeedbackCollector(storage, options = {}) {
  const notifier = options.notifier || null;
  const nowFn = options.now || (() => Date.now());

  /** 反馈缓存（submitFeedback 后同步可用） */
  let _feedbackCache = undefined; // undefined = 未加载

  /**
   * 从 storage 读取反馈
   * @returns {Promise<object|null>}
   */
  async function _loadFeedback() {
    if (_feedbackCache !== undefined) return _feedbackCache;
    try {
      const raw = await storage.get(FEEDBACK_KEY);
      _feedbackCache = raw[FEEDBACK_KEY] || null;
    } catch (e) {
       console.warn('[PageWise]', 'feedback load error', e)
       _feedbackCache = null;
    }
    return _feedbackCache;
  }

  /**
   * 获取安装日期
   * @returns {Promise<number|null>}
   */
  async function _getInstallDate() {
    try {
      const raw = await storage.get(INSTALL_DATE_KEY);
      return raw[INSTALL_DATE_KEY] || null;
    } catch (e) {
       console.warn('[PageWise]', 'install date read error', e)
       return null;
    }
  }

  /**
   * 获取跳过标记
   * @returns {Promise<boolean>}
   */
  async function _isDismissed() {
    try {
      const raw = await storage.get(DISMISSED_KEY);
      return !!raw[DISMISSED_KEY];
    } catch (e) {
       console.warn('[PageWise]', 'dismissed flag read error', e)
       return false;
    }
  }

  /**
   * 根据 NPS 分数发送通知
   * @param {number} score
   * @param {string} comment
   */
  function _sendNotification(score, comment) {
    if (!notifier || typeof notifier.notify !== 'function') return;
    if (score <= 6) {
      notifier.notify(
        '感谢你的反馈！我们非常重视你的使用体验，希望能帮助我们改进智阅 PageWise。' +
        (comment ? ` 你提到的"${comment.slice(0, 50)}"我们已记录。` : '') +
        ' 你可以通过扩展设置页面提交更详细的改进建议。',
        'info'
      );
    } else if (score >= 9) {
      notifier.notify(
        '感谢你对智阅 PageWise 的好评！🎉 如果你觉得好用，欢迎在 Chrome Web Store 留下你的评价，' +
        '帮助更多人发现这个工具：' + CWS_REVIEW_URL,
        'info'
      );
    }
    // 7-8 分（被动者）不触发通知
  }

  // ==================== API ====================

  return {
    /**
     * 检查是否应该显示 NPS 弹窗
     *
     * 条件:
     *   1. 安装日期存在
     *   2. 安装满 7 天
     *   3. 尚未提交反馈
     *   4. 尚未跳过
     *
     * @returns {Promise<boolean>}
     */
    async shouldShowPrompt() {
      const installDate = await _getInstallDate();
      if (!installDate) return false;

      const daysSinceInstall = (nowFn() - installDate) / _MS_PER_DAY;
      if (daysSinceInstall < NPS_DELAY_DAYS) return false;

      const feedback = await _loadFeedback();
      if (feedback) return false;

      const dismissed = await _isDismissed();
      if (dismissed) return false;

      return true;
    },

    /**
     * 提交 NPS 反馈
     *
     * @param {number} score — NPS 分数 (0-10 整数)
     * @param {string} [comment=''] — 文字反馈
     * @returns {Promise<FeedbackEntry>}
     * @throws {Error} 分数不合法时抛出
     */
    async submitFeedback(score, comment = '') {
      if (typeof score !== 'number' || !Number.isInteger(score)) {
        throw new Error('score 必须是 0-10 的整数');
      }
      if (score < 0 || score > 10) {
        throw new Error('score 必须在 0-10 之间');
      }

      const entry = {
        score,
        comment: typeof comment === 'string' ? comment : String(comment || ''),
        category: _getNPSCategory(score),
        timestamp: nowFn(),
      };

      try {
        await storage.set({ [FEEDBACK_KEY]: entry });
      } catch (e) {
        console.warn('[PageWise]', 'feedback save error', e)
      }

      // 更新缓存
      _feedbackCache = entry;

      _sendNotification(score, entry.comment);

      return { ...entry };
    },

    /**
     * 跳过 NPS 弹窗
     */
    async dismissPrompt() {
      try {
        await storage.set({ [DISMISSED_KEY]: true });
      } catch (e) {
        console.warn('[PageWise]', 'feedback dismiss save error', e)
      }
    },

    /**
     * 获取 NPS 分类
     * @param {number} score
     * @returns {'detractor'|'passive'|'promoter'}
     */
    getNPSCategory(score) {
      return _getNPSCategory(score);
    },

    /**
     * 获取已提交的反馈
     * @returns {Promise<object|null>}
     */
    async getFeedback() {
      return await _loadFeedback();
    },

    /**
     * 导出反馈数据为 JSON 可序列化对象
     * @returns {object|null}
     */
    exportFeedback() {
      if (!_feedbackCache) return null;
      return {
        ..._feedbackCache,
        category: _feedbackCache.category || _getNPSCategory(_feedbackCache.score),
        exportedAt: Date.now(),
      };
    },
  };
}

/**
 * NPS 分类判定（纯函数）
 * @param {number} score
 * @returns {'detractor'|'passive'|'promoter'}
 */
function _getNPSCategory(score) {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'passive';
  return 'promoter';
}

/**
 * 生产环境创建入口
 *
 * @param {object} storage — chrome.storage.local
 * @param {object} [options]
 * @param {object} [options.notifier] — NotificationManager 实例
 * @returns {FeedbackCollectorAPI}
 */
export function createFeedbackCollector(storage, options) {
  if (!storage) {
    throw new Error('feedback-collector: storage 接口必须提供');
  }
  return _createFeedbackCollector(storage, options);
}

/**
 * @typedef {Object} FeedbackEntry
 * @property {number} score — NPS 分数 (0-10)
 * @property {string} comment — 文字反馈
 * @property {string} category — NPS 分类 (detractor/passive/promoter)
 * @property {number} timestamp — 提交时间戳
 */

/**
 * @typedef {Object} FeedbackCollectorAPI
 * @property {function(): Promise<boolean>} shouldShowPrompt
 * @property {function(number, string=): Promise<FeedbackEntry>} submitFeedback
 * @property {function(): Promise<void>} dismissPrompt
 * @property {function(number): string} getNPSCategory
 * @property {function(): Promise<object|null>} getFeedback
 * @property {function(): object|null} exportFeedback
 */
