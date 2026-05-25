/**
 * KnowledgeBaseCRUD Batch — 批量操作与对话历史
 *
 * 从 knowledge-base-crud.js (R280) 拆分:
 *   - batchDelete — 批量删除条目
 *   - batchAddTag — 批量添加标签
 *   - saveConversation — 保存对话历史
 *   - getConversations — 查询对话历史
 *
 * @module knowledge-base-crud-batch
 */

import { classifyStorageError } from './error-handler.js';

/**
 * 批量操作 mixin — 注入到 KnowledgeBaseCRUD 的原型链中
 * @param {Function} BaseClass - 基类
 * @returns {Function} 扩展后的类
 */
export function withBatchOperations(BaseClass) {
  return class extends BaseClass {
    /**
     * 批量删除条目
     * @param {Array<number|string>} ids - 要删除的条目 ID 列表
     * @returns {number} 成功删除的条目数
     */
    async batchDelete(ids) {
      await this.ensureInit();
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      if (ids.length > 100) throw new Error('批量操作最多支持 100 条');

      let deleted = 0;
      for (const id of ids) {
        try {
          await this.deleteEntry(id);
          deleted++;
        } catch (_e) {
          // 单条删除失败不影响其他条目
        }
      }
      return deleted;
    }

    /**
     * 批量添加标签
     * @param {Array<number|string>} ids - 要添加标签的条目 ID 列表
     * @param {string} tag - 标签名称
     * @returns {number} 成功更新的条目数
     */
    async batchAddTag(ids, tag) {
      await this.ensureInit();
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      if (!tag || typeof tag !== 'string') throw new Error('标签不能为空');
      if (ids.length > 100) throw new Error('批量操作最多支持 100 条');

      let updated = 0;
      for (const id of ids) {
        try {
          const entry = await this.getEntry(id);
          if (entry) {
            const tags = entry.tags || [];
            if (!tags.includes(tag)) {
              tags.push(tag);
              await this.updateEntry(id, { tags });
              updated++;
            }
          }
        } catch (_e) {
          // 单条更新失败不影响其他条目
        }
      }
      return updated;
    }

    /**
     * 保存对话历史
     * @param {Object} conversation - 对话对象
     * @returns {Object} 保存后的对话记录
     */
    async saveConversation(conversation) {
      await this.ensureInit();

      const record = {
        sourceUrl: conversation.sourceUrl || '',
        sourceTitle: conversation.sourceTitle || '',
        messages: conversation.messages || [],
        createdAt: new Date().toISOString()
      };

      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const request = store.add(record);

        request.onsuccess = () => resolve({ ...record, id: request.result });
        request.onerror = () => {
          const err = new Error('保存对话失败');
          err.classified = classifyStorageError(err);
          reject(err);
        };
      });
    }

    /**
     * 查询对话历史
     * @param {string} sourceUrl - 来源 URL
     * @param {number} limit - 返回条数上限
     * @returns {Array<Object>} 对话记录列表
     */
    async getConversations(sourceUrl, limit = 20) {
      await this.ensureInit();

      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const index = store.index('sourceUrl');
        const request = index.getAll(sourceUrl);

        request.onsuccess = () => {
          const results = (request.result || [])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
          resolve(results);
        };

        request.onerror = () => {
          const err = new Error('查询对话失败');
          err.classified = classifyStorageError(err);
          reject(err);
        };
      });
    }
  };
}
