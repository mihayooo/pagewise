/**
 * BookmarkNotifier 内部方法 — 通知构建与分发
 *
 * R203: 从 bookmark-notifier.js 拆分
 * 包含: _buildNotification / _dispatch / _generateId
 *
 * @module lib/bookmark-notifier-dispatch
 */

/** 通知历史最大条数 */
export const MAX_HISTORY = 500;

/**
 * 构建通知对象
 *
 * @param {Object} ctx — BookmarkNotifier 上下文 (this)
 * @param {string} type — 通知类型
 * @param {Object} params
 * @returns {Object} NotificationEntry
 */
export function buildNotification(ctx, type, params) {
  return {
    id: generateId(ctx),
    type,
    title: params.title,
    body: params.body,
    level: params.level || 'info',
    data: params.data || null,
    timestamp: ctx._nowFn(),
    channel: [...ctx._prefs.channels],
  };
}

/**
 * 分发通知 (含偏好检查和合并逻辑)
 *
 * @param {Object} ctx — BookmarkNotifier 上下文 (this)
 * @param {Object} notification
 * @returns {Object} NotificationResult
 */
export function dispatch(ctx, notification) {
  // 全局开关检查
  if (!ctx._prefs.enabled) {
    return { sent: false, reason: 'disabled', notification };
  }

  // 类型级别检查
  const typeDisabled = ctx._prefs.types[notification.type] === false;
  if (typeDisabled) {
    return { sent: false, reason: 'type-disabled', notification };
  }

  // 合并检查
  const lastSent = ctx._lastSentAt.get(notification.type);
  const now = ctx._nowFn();
  if (lastSent !== undefined && (now - lastSent) < ctx._prefs.mergeInterval) {
    // 合并到待发通知中
    ctx._pendingMerges.set(notification.type, notification);
    return { sent: false, reason: 'merged', notification };
  }

  // 发送通知
  ctx._lastSentAt.set(notification.type, now);

  // 如果有挂起的合并通知，也一并记录
  const pending = ctx._pendingMerges.get(notification.type);
  if (pending) {
    ctx._pendingMerges.delete(notification.type);
    // 将挂起通知的数据合并到当前通知
    if (pending.data && notification.data) {
      if (pending.data.links && notification.data.links) {
        notification.data = {
          ...notification.data,
          links: [...new Set([...pending.data.links, ...notification.data.links])],
          count: notification.data.count + (pending.data.count || 0),
        };
      } else if (notification.data.count !== undefined && pending.data.count !== undefined) {
        notification.data = { count: notification.data.count + pending.data.count };
        notification.title = `合并通知: 共 ${notification.data.count} 条`;
      }
    }
  }

  // 记录到历史
  ctx._history.push(notification);
  ctx._totalSent++;

  // 裁剪历史
  if (ctx._history.length > MAX_HISTORY) {
    ctx._history = ctx._history.slice(-MAX_HISTORY);
  }

  // 执行分发
  try {
    ctx._dispatchFn(notification);
  } catch {
    // 分发失败不影响记录
  }

  return { sent: true, reason: null, notification };
}

/**
 * 生成唯一通知 ID
 * @param {Object} ctx — BookmarkNotifier 上下文 (this)
 * @returns {string}
 */
export function generateId(ctx) {
  ctx._idCounter++;
  return `notif-${ctx._idCounter}-${ctx._nowFn().toString(36)}`;
}
