/**
 * 测试 lib/bookmark-tag-editor.js — BookmarkTagEditor 标签手动编辑器
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkTagEditor } = await import('../lib/bookmark-tag-editor.js');

const sampleBookmarks = [
  { id: 'bm1', title: 'Test 1', url: 'http://a.com', tags: ['JavaScript', 'Web  Dev'] },
  { id: 'bm2', title: 'Test 2', url: 'http://b.com', tags: ['python', 'AI'] },
  { id: 'bm3', title: 'Test 3', url: 'http://c.com', tags: [] },
];

// ==================== normalizeTag ====================

describe('BookmarkTagEditor.normalizeTag()', () => {
  it('转小写', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('JavaScript'), 'javascript');
  });

  it('去除首尾空格', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('  tag  '), 'tag');
  });

  it('连续空格替换为连字符', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('web  dev'), 'web-dev');
  });

  it('移除特殊字符', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('tag@#$%'), 'tag');
  });

  it('保留中文', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('编程语言'), '编程语言');
  });

  it('保留连字符和下划线', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('my-tag_name'), 'my-tag_name');
  });

  it('最大 30 字符截断', () => {
    const long = 'a'.repeat(50);
    assert.ok(BookmarkTagEditor.normalizeTag(long).length <= 30);
  });

  it('非字符串返回空', () => {
    assert.equal(BookmarkTagEditor.normalizeTag(null), '');
    assert.equal(BookmarkTagEditor.normalizeTag(123), '');
    assert.equal(BookmarkTagEditor.normalizeTag(undefined), '');
  });

  it('纯数字保留', () => {
    assert.equal(BookmarkTagEditor.normalizeTag('12345'), '12345');
  });
});

// ==================== 构造函数 ====================

describe('BookmarkTagEditor 构造函数', () => {
  it('初始化书签映射', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.deepEqual(editor.getTags('bm1'), ['javascript', 'web-dev']);
    assert.deepEqual(editor.getTags('bm2'), ['python', 'ai']);
  });

  it('空构造', () => {
    const editor = new BookmarkTagEditor();
    assert.deepEqual(editor.getAllTags(), []);
  });

  it('合并 existingTags', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: sampleBookmarks,
      existingTags: ['react', 'Vue'],
    });
    const tags = editor.getAllTags();
    assert.ok(tags.includes('react'));
    assert.ok(tags.includes('vue'));
  });

  it('规范化标签去重', () => {
    const editor = new BookmarkTagEditor({
      bookmarks: [{ id: 'bm1', title: 'T', url: '', tags: ['JavaScript', 'JAVASCRIPT', 'javascript'] }],
    });
    // Constructor normalizes but does not dedup within a bookmark's tags array
    const tags = editor.getTags('bm1');
    assert.equal(tags.length, 3);
    assert.ok(tags.every(t => t === 'javascript'));
    // But getAllTags returns deduplicated global set
    assert.deepEqual(editor.getAllTags(), ['javascript']);
  });
});

// ==================== getTags / getAllTags ====================

describe('BookmarkTagEditor 查询', () => {
  it('getTags 不存在的书签返回空', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.deepEqual(editor.getTags('nonexistent'), []);
  });

  it('getAllTags 返回排序列表', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    const tags = editor.getAllTags();
    assert.deepEqual(tags, [...tags].sort());
  });
});

// ==================== addTag ====================

describe('BookmarkTagEditor.addTag()', () => {
  it('成功添加新标签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.addTag('bm1', 'react'), true);
    assert.ok(editor.getTags('bm1').includes('react'));
  });

  it('书签不存在返回 false', () => {
    const editor = new BookmarkTagEditor();
    assert.equal(editor.addTag('missing', 'tag'), false);
  });

  it('空标签返回 false', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.addTag('bm1', ''), false);
    assert.equal(editor.addTag('bm1', '   '), false);
  });

  it('已存在的标签返回 false', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.addTag('bm1', 'JavaScript'), false); // already normalized
  });

  it('新标签加入全局标签库', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    editor.addTag('bm1', 'newtag');
    assert.ok(editor.getAllTags().includes('newtag'));
  });
});

// ==================== removeTag ====================

describe('BookmarkTagEditor.removeTag()', () => {
  it('成功删除标签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.removeTag('bm1', 'JavaScript'), true);
    assert.ok(!editor.getTags('bm1').includes('javascript'));
  });

  it('书签不存在返回 false', () => {
    const editor = new BookmarkTagEditor();
    assert.equal(editor.removeTag('missing', 'tag'), false);
  });

  it('标签不存在返回 false', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.removeTag('bm1', 'nonexistent'), false);
  });
});

// ==================== setTags ====================

describe('BookmarkTagEditor.setTags()', () => {
  it('覆盖标签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    editor.setTags('bm1', ['react', 'vue']);
    assert.deepEqual(editor.getTags('bm1'), ['react', 'vue']);
  });

  it('去重', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    editor.setTags('bm1', ['react', 'React', 'REACT']);
    assert.equal(editor.getTags('bm1').length, 1);
  });

  it('书签不存在不报错', () => {
    const editor = new BookmarkTagEditor();
    assert.doesNotThrow(() => editor.setTags('missing', ['tag']));
  });

  it('新标签加入全局库', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    editor.setTags('bm1', ['brand-new']);
    assert.ok(editor.getAllTags().includes('brand-new'));
  });
});

// ==================== getAutocomplete ====================

describe('BookmarkTagEditor.getAutocomplete()', () => {
  it('前缀匹配', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    const results = editor.getAutocomplete('java');
    assert.ok(results.includes('javascript'));
  });

  it('空输入返回空', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.deepEqual(editor.getAutocomplete(''), []);
    assert.deepEqual(editor.getAutocomplete('   '), []);
  });

  it('非字符串输入返回空', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.deepEqual(editor.getAutocomplete(null), []);
    assert.deepEqual(editor.getAutocomplete(123), []);
  });

  it('limit 限制结果数', () => {
    const bookmarks = Array.from({ length: 20 }, (_, i) => ({
      id: `bm${i}`, title: 'T', url: '', tags: [`tag${i}`],
    }));
    const editor = new BookmarkTagEditor({ bookmarks });
    assert.ok(editor.getAutocomplete('tag', 3).length <= 3);
  });

  it('无匹配返回空', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.deepEqual(editor.getAutocomplete('zzzzz'), []);
  });
});

// ==================== batchAddTag / batchRemoveTag ====================

describe('BookmarkTagEditor 批量操作', () => {
  it('batchAddTag 添加标签到多个书签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    const count = editor.batchAddTag(['bm1', 'bm2', 'bm3'], 'shared');
    assert.equal(count, 3);
    assert.ok(editor.getTags('bm1').includes('shared'));
    assert.ok(editor.getTags('bm2').includes('shared'));
    assert.ok(editor.getTags('bm3').includes('shared'));
  });

  it('batchAddTag 跳过不存在的书签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    const count = editor.batchAddTag(['bm1', 'missing'], 'newtag');
    assert.equal(count, 1);
  });

  it('batchRemoveTag 从多个书签删除标签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    const count = editor.batchRemoveTag(['bm1', 'bm2'], 'javascript');
    assert.equal(count, 1); // only bm1 has 'javascript'
  });

  it('batchRemoveTag 跳过不存在的书签', () => {
    const editor = new BookmarkTagEditor({ bookmarks: sampleBookmarks });
    assert.equal(editor.batchRemoveTag(['missing'], 'tag'), 0);
  });
});
