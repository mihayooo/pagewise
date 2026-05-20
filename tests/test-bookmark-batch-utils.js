/**
 * 测试 lib/bookmark-batch-utils.js — 批量操作辅助函数
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTag,
  buildIdMap,
  createResult,
  cloneBookmark,
  batchDelete,
  batchAddTag,
  batchRemoveTag,
  batchTag,
} from '../lib/bookmark-batch-utils.js';

// ==================== normalizeTag ====================

describe('normalizeTag', () => {
  it('普通标签小写化', () => {
    assert.equal(normalizeTag('Hello'), 'hello');
  });

  it('去除首尾空格', () => {
    assert.equal(normalizeTag('  tag  '), 'tag');
  });

  it('多个空格替换为连字符', () => {
    assert.equal(normalizeTag('hello  world'), 'hello-world');
  });

  it('去除特殊字符', () => {
    assert.equal(normalizeTag('tag@#$%'), 'tag');
  });

  it('保留中文字符', () => {
    assert.equal(normalizeTag('标签'), '标签');
  });

  it('截断到30字符', () => {
    const long = 'a'.repeat(50);
    assert.ok(normalizeTag(long).length <= 30);
  });

  it('非字符串返回空字符串', () => {
    assert.equal(normalizeTag(null), '');
    assert.equal(normalizeTag(undefined), '');
    assert.equal(normalizeTag(123), '');
    assert.equal(normalizeTag({}), '');
  });

  it('保留下划线和连字符', () => {
    assert.equal(normalizeTag('my-tag_name'), 'my-tag_name');
  });
});

// ==================== buildIdMap ====================

describe('buildIdMap', () => {
  it('从书签数组构建查找表', () => {
    const bookmarks = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
    ];
    const map = buildIdMap(bookmarks);
    assert.equal(map.size, 2);
    assert.deepEqual(map.get('1'), { id: '1', title: 'A' });
  });

  it('非数组输入返回空 Map', () => {
    assert.equal(buildIdMap(null).size, 0);
    assert.equal(buildIdMap(undefined).size, 0);
    assert.equal(buildIdMap('str').size, 0);
  });

  it('空数组返回空 Map', () => {
    assert.equal(buildIdMap([]).size, 0);
  });

  it('id 转为字符串', () => {
    const map = buildIdMap([{ id: 123, title: 'Test' }]);
    assert.ok(map.has('123'));
  });
});

// ==================== createResult ====================

describe('createResult', () => {
  it('返回标准化结果容器', () => {
    const r = createResult();
    assert.equal(r.success, 0);
    assert.equal(r.failed, 0);
    assert.deepEqual(r.results, []);
    assert.deepEqual(r.errors, []);
  });
});

// ==================== cloneBookmark ====================

describe('cloneBookmark', () => {
  it('深拷贝书签', () => {
    const bm = { id: '1', title: 'Test', folderPath: ['a', 'b'], tags: ['x'] };
    const clone = cloneBookmark(bm);
    assert.deepEqual(clone, bm);
    assert.notEqual(clone, bm);
    assert.notEqual(clone.folderPath, bm.folderPath);
    assert.notEqual(clone.tags, bm.tags);
  });

  it('缺少数组字段时默认为空数组', () => {
    const bm = { id: '1', title: 'Test' };
    const clone = cloneBookmark(bm);
    assert.deepEqual(clone.folderPath, []);
    assert.deepEqual(clone.tags, []);
  });
});

// ==================== batchDelete ====================

describe('batchDelete', () => {
  const bookmarks = [
    { id: '1', title: 'A' },
    { id: '2', title: 'B' },
    { id: '3', title: 'C' },
  ];

  it('删除存在的书签', () => {
    const r = batchDelete(bookmarks, ['1', '3']);
    assert.equal(r.success, 2);
    assert.equal(r.failed, 0);
    assert.equal(r.remaining.length, 1);
    assert.equal(r.remaining[0].id, '2');
  });

  it('删除不存在的书签', () => {
    const r = batchDelete(bookmarks, ['999']);
    assert.equal(r.success, 0);
    assert.equal(r.failed, 1);
    assert.equal(r.remaining.length, 3);
    assert.ok(r.errors[0].reason.includes('not found'));
  });

  it('非数组书签返回空结果', () => {
    const r = batchDelete(null, ['1']);
    assert.equal(r.success, 0);
    assert.equal(r.remaining.length, 0);
  });

  it('空 ids 返回全部 remaining', () => {
    const r = batchDelete(bookmarks, []);
    assert.equal(r.remaining.length, 3);
  });

  it('null ids 返回全部 remaining', () => {
    const r = batchDelete(bookmarks, null);
    assert.equal(r.remaining.length, 3);
  });
});

// ==================== batchTag ====================

describe('batchTag', () => {
  const bookmarks = [
    { id: '1', title: 'A', tags: ['existing'] },
    { id: '2', title: 'B', tags: [] },
  ];

  it('添加标签', () => {
    const r = batchTag(bookmarks, ['1'], ['new'], 'add');
    assert.equal(r.success, 1);
    assert.equal(r.results[0].tagsAdded, 1);
  });

  it('添加已存在的标签 (幂等)', () => {
    const r = batchTag(bookmarks, ['1'], ['existing'], 'add');
    assert.equal(r.success, 1);
    assert.equal(r.results[0].tagsAdded, 0);
  });

  it('移除标签', () => {
    const r = batchTag(bookmarks, ['1'], ['existing'], 'remove');
    assert.equal(r.success, 1);
    assert.equal(r.results[0].tagsRemoved, 1);
  });

  it('无效 action', () => {
    const r = batchTag(bookmarks, ['1'], ['tag'], 'invalid');
    assert.equal(r.failed, 1);
    assert.ok(r.errors[0].reason.includes('invalid action'));
  });

  it('非数组书签', () => {
    const r = batchTag(null, ['1'], ['tag'], 'add');
    assert.equal(r.success, 0);
  });

  it('空 ids', () => {
    const r = batchTag(bookmarks, [], ['tag'], 'add');
    assert.equal(r.updated.length, 2);
  });

  it('空 tags', () => {
    const r = batchTag(bookmarks, ['1'], [], 'add');
    assert.equal(r.updated.length, 2);
  });

  it('id 不存在时 failed 增加', () => {
    const r = batchTag(bookmarks, ['999'], ['tag'], 'add');
    assert.equal(r.failed, 1);
    assert.ok(r.errors[0].reason.includes('not found'));
  });
});

// ==================== batchAddTag / batchRemoveTag ====================

describe('batchAddTag / batchRemoveTag 便捷封装', () => {
  const bookmarks = [{ id: '1', title: 'A', tags: [] }];

  it('batchAddTag 等价于 batchTag add', () => {
    const r = batchAddTag(bookmarks, ['1'], 'new-tag');
    assert.equal(r.success, 1);
  });

  it('batchRemoveTag 等价于 batchTag remove', () => {
    const bm = [{ id: '1', title: 'A', tags: ['removeme'] }];
    const r = batchRemoveTag(bm, ['1'], 'removeme');
    assert.equal(r.success, 1);
  });
});
