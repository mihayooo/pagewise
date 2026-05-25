/**
 * KnowledgeBaseCursor — 游标分页查询模块
 * 职责: 大数据集优化游标分页（替代 getAll()，降低内存峰值）
 * R277: 从 knowledge-base-crud.js 提取，控制模块行数 ≤400
 */

/**
 * 为 KnowledgeBaseCRUD 类注入游标分页查询方法
 * @param {Function} BaseClass — 基类
 * @returns {Function} 增强后的类
 */
export function withCursorPaging(BaseClass) {
  return class extends BaseClass {
    /**
     * R277: 大数据集优化 — 游标分页查询（替代 getAll()，降低内存峰值）
     *
     * 当条目数 >5000 时，推荐使用此方法代替 getAllEntries，避免一次性加载全部数据到内存。
     * 使用 IDBKeyRange + cursor 遍历，每次仅持有一页数据。
     *
     * @param {Object} [options]
     * @param {string} [options.category] — 按分类过滤（利用 type_updatedAt 复合索引）
     * @param {string} [options.updatedAfter] — ISO 日期字符串，仅返回此日期之后更新的条目
     * @param {number} [options.pageSize=50] — 每页条目数
     * @param {number} [options.page=1] — 页码（从 1 开始）
     * @param {string} [options.order='prev'] — 排序方向 ('prev' 最新优先 / 'next' 最早优先)
     * @returns {Promise<{ entries: Array, total: number, page: number, totalPages: number }>}
     */
    async getEntriesCursorPaged(options = {}) {
      await this.ensureInit();

      const {
        category = null,
        updatedAfter = null,
        pageSize = 50,
        page = 1,
        order = 'prev',
      } = options;

      const effectivePageSize = Math.max(1, Math.min(500, Math.floor(pageSize)));
      const effectivePage = Math.max(1, Math.floor(page));

      let indexName = 'updatedAt';
      let range = null;

      if (category && updatedAfter) {
        indexName = 'type_updatedAt';
        range = IDBKeyRange.bound(
          [category, updatedAfter],
          [category, '￿']
        );
      } else if (category) {
        indexName = 'type_updatedAt';
        range = IDBKeyRange.bound(
          [category, ''],
          [category, '￿']
        );
      } else if (updatedAfter) {
        range = IDBKeyRange.lowerBound(updatedAfter);
      }

      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('entries', 'readonly');
        const store = tx.objectStore('entries');
        const index = store.index(indexName);
        const countReq = range ? index.count(range) : index.count();

        countReq.onsuccess = () => {
          const total = countReq.result || 0;
          const totalPages = Math.ceil(total / effectivePageSize);

          if (total === 0 || effectivePage > totalPages) {
            resolve({ entries: [], total, page: effectivePage, totalPages });
            return;
          }

          const offset = (effectivePage - 1) * effectivePageSize;
          const results = [];
          let skipped = 0;

          const cursorReq = index.openCursor(range, order);

          cursorReq.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor || results.length >= effectivePageSize) {
              resolve({ entries: results, total, page: effectivePage, totalPages });
              return;
            }

            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            results.push(cursor.value);
            cursor.continue();
          };

          cursorReq.onerror = () => {
            reject(new Error('游标分页查询失败'));
          };
        };

        countReq.onerror = () => {
          reject(new Error('获取条目总数失败'));
        };
      });
    }
  };
}
