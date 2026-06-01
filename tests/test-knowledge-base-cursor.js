/**
 * 测试 lib/knowledge-base-cursor.js — 游标分页查询模块
 * 覆盖: withCursorPaging mixin, getEntriesCursorPaged()
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

installIndexedDBMock();
const { withCursorPaging } = await import('../lib/knowledge-base-cursor.js');

// ==================== 测试辅助 ====================

/**
 * 创建一个带 entries store 的 mock DB，并直接注入测试数据。
 * 不使用 tx.oncomplete（mock 不支持），而是直接操作 _records Map。
 */
function createTestDBWithEntries(entries = []) {
  const req = indexedDB.open('test-cursor-db', 1);
  return new Promise((resolve, reject) => {
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const store = db.createObjectStore('entries', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
      store.createIndex('type_updatedAt', ['type', 'updatedAt']);
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      // 直接注入数据到 store 的内部 _records Map
      const store = db._stores['entries'];
      if (store && entries.length > 0) {
        for (const entry of entries) {
          store._records.set(entry.id, { ...entry });
        }
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 生成测试条目 */
function makeEntries(count, opts = {}) {
  const { type = 'note', baseDate = '2024-01-01', idPrefix = 'entry' } = opts;
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}-${String(i + 1).padStart(3, '0')}`,
    title: `Entry ${i + 1}`,
    content: `Content for entry ${i + 1}`,
    type,
    updatedAt: new Date(new Date(baseDate).getTime() + i * 86400000).toISOString(),
    createdAt: new Date(new Date(baseDate).getTime() + i * 86400000).toISOString(),
  }));
}

/** 创建使用 withCursorPaging mixin 的测试实例 */
function createPagedInstance(db) {
  const Base = class {
    async ensureInit() { this.db = db; }
  };
  return new (withCursorPaging(Base))();
}

// ==================== 测试用例 ====================

describe('withCursorPaging mixin', () => {
  it('返回的类继承自 BaseClass', () => {
    const Base = class { async ensureInit() {} };
    const Enhanced = withCursorPaging(Base);
    const instance = new Enhanced();
    assert.ok(instance instanceof Base, '应是 BaseClass 的实例');
    assert.equal(typeof instance.getEntriesCursorPaged, 'function', '应有 getEntriesCursorPaged 方法');
  });

  it('mixin 不修改 BaseClass 原型', () => {
    const Base = class { async ensureInit() {} };
    withCursorPaging(Base);
    assert.equal(typeof Base.prototype.getEntriesCursorPaged, 'undefined', 'BaseClass 原型不应被修改');
  });
});

describe('getEntriesCursorPaged — 基本分页', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  it('默认参数返回第一页（pageSize=50, page=1）', async () => {
    const db = await createTestDBWithEntries(makeEntries(25));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged();
    assert.equal(result.entries.length, 25, '应返回全部 25 条（< pageSize）');
    assert.equal(result.total, 25);
    assert.equal(result.page, 1);
    assert.equal(result.totalPages, 1);
  });

  it('分页返回正确数量（pageSize=10, page=1）', async () => {
    const db = await createTestDBWithEntries(makeEntries(25));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 10, page: 1 });
    assert.equal(result.entries.length, 10, '第一页应有 10 条');
    assert.equal(result.total, 25);
    assert.equal(result.totalPages, 3);
  });

  it('第二页返回正确数据（不与第一页重复）', async () => {
    const db = await createTestDBWithEntries(makeEntries(25));
    const instance = createPagedInstance(db);
    const page1 = await instance.getEntriesCursorPaged({ pageSize: 10, page: 1 });
    const page2 = await instance.getEntriesCursorPaged({ pageSize: 10, page: 2 });
    assert.equal(page2.entries.length, 10, '第二页应有 10 条');
    const ids1 = new Set(page1.entries.map(e => e.id));
    const ids2 = new Set(page2.entries.map(e => e.id));
    for (const id of ids2) {
      assert.ok(!ids1.has(id), `ID ${id} 不应同时出现在第 1 页和第 2 页`);
    }
  });

  it('最后一页返回剩余条目', async () => {
    const db = await createTestDBWithEntries(makeEntries(25));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 10, page: 3 });
    assert.equal(result.entries.length, 5, '最后一页应有 5 条');
  });

  it('page > totalPages 返回空数组', async () => {
    const db = await createTestDBWithEntries(makeEntries(25));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 10, page: 100 });
    assert.equal(result.entries.length, 0, '超出页码应返回空');
    assert.equal(result.total, 25, 'total 仍应为 25');
  });

  it('空数据库返回空结果', async () => {
    const db = await createTestDBWithEntries([]);
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged();
    assert.equal(result.entries.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
  });
});

describe('getEntriesCursorPaged — 参数校验与边界', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  it('pageSize < 1 被钳位为 1', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 0 });
    assert.equal(result.entries.length, 1, 'pageSize=0 应钳位为 1');
  });

  it('pageSize > 500 被钳位为 500', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 9999 });
    assert.ok(result.entries.length <= 500, 'pageSize 不应超过 500');
  });

  it('page < 1 被钳位为 1', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ page: -5 });
    assert.equal(result.page, 1, 'page 应钳位为 1');
  });

  it('pageSize 为小数时取整', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 3.7 });
    assert.equal(result.entries.length, 3, 'pageSize=3.7 应取整为 3');
  });

  it('排序方向 order="next" 返回最早优先', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 3, order: 'next' });
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].id, 'entry-001');
  });

  it('排序方向 order="prev" 返回最新优先（默认）', async () => {
    const db = await createTestDBWithEntries(makeEntries(10));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ pageSize: 3, order: 'prev' });
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].id, 'entry-010');
  });
});

describe('getEntriesCursorPaged — 条件过滤', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  it('按 category 过滤只返回匹配类型的条目', async () => {
    const notes = makeEntries(10, { type: 'note', idPrefix: 'note' });
    const articles = makeEntries(8, { type: 'article', baseDate: '2024-06-01', idPrefix: 'article' });
    const db = await createTestDBWithEntries([...notes, ...articles]);
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ category: 'note', pageSize: 100 });
    assert.equal(result.entries.length, 10, '应只返回 10 条 note');
    for (const entry of result.entries) {
      assert.equal(entry.type, 'note', '所有条目类型应为 note');
    }
  });

  it('category 不存在时返回空', async () => {
    const db = await createTestDBWithEntries(makeEntries(5));
    const instance = createPagedInstance(db);
    const result = await instance.getEntriesCursorPaged({ category: 'nonexistent' });
    assert.equal(result.entries.length, 0);
    assert.equal(result.total, 0);
  });

  it('按 updatedAfter 过滤', async () => {
    const entries = makeEntries(10);
    const db = await createTestDBWithEntries(entries);
    const instance = createPagedInstance(db);
    // Filter: only entries updated after day 5
    const cutoff = new Date(new Date('2024-01-01').getTime() + 5 * 86400000).toISOString();
    const result = await instance.getEntriesCursorPaged({
      updatedAfter: cutoff,
      pageSize: 100,
    });
    assert.ok(result.entries.length > 0, '应有过滤后的结果');
    for (const entry of result.entries) {
      assert.ok(entry.updatedAt >= cutoff,
        `条目 updatedAt (${entry.updatedAt}) 应 >= 过滤时间 (${cutoff})`);
    }
  });

  it('同时按 category 和 updatedAfter 过滤', async () => {
    const notes = makeEntries(10, { type: 'note', idPrefix: 'note' });
    const articles = makeEntries(8, { type: 'article', baseDate: '2024-06-01', idPrefix: 'article' });
    const db = await createTestDBWithEntries([...notes, ...articles]);
    const instance = createPagedInstance(db);
    const cutoff = '2024-06-05T00:00:00.000Z';
    const result = await instance.getEntriesCursorPaged({
      category: 'article',
      updatedAfter: cutoff,
      pageSize: 100,
    });
    assert.ok(result.entries.length > 0, '应有匹配结果');
    for (const entry of result.entries) {
      assert.equal(entry.type, 'article');
      assert.ok(entry.updatedAt >= cutoff);
    }
  });
});

describe('getEntriesCursorPaged — ensureInit 调用', () => {
  it('调用前会先执行 ensureInit()', async () => {
    resetIndexedDBMock();
    installIndexedDBMock();
    const db = await createTestDBWithEntries(makeEntries(3));
    let initCalled = false;
    const Base = class {
      async ensureInit() {
        initCalled = true;
        this.db = db;
      }
    };
    const instance = new (withCursorPaging(Base))();
    await instance.getEntriesCursorPaged();
    assert.ok(initCalled, 'ensureInit() 应被调用');
  });
});
