/**
 * 测试 lib/bookmark-advanced-tags.js — AdvancedTagManager 高级标签管理器
 * Coverage Sprint R152: 行覆盖率冲刺 85%
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { AdvancedTagManager } = await import('../lib/bookmark-advanced-tags.js');

const sampleBookmarks = [
  { id: 'bm1', title: 'React Tutorial', url: 'https://github.com/user/react-guide', tags: ['react', 'javascript', 'tutorial'] },
  { id: 'bm2', title: 'Python Flask API', url: 'https://dev.to/user/flask-api', tags: ['python', 'flask', 'api'] },
  { id: 'bm3', title: 'Docker Deploy Guide', url: 'https://medium.com/deploy', tags: ['docker', 'tutorial'] },
  { id: 'bm4', title: 'Rust Performance', url: 'https://blog.example.com/rust-perf', tags: ['rust', 'performance'] },
  { id: 'bm5', title: 'React Vue Comparison', url: 'https://github.com/user/compare', tags: ['react', 'vue'] },
];

// ==================== Constructor ====================

describe('AdvancedTagManager constructor', () => {
  it('default constructor with no options', () => {
    const mgr = new AdvancedTagManager();
    assert.deepEqual(mgr.bookmarks, []);
    assert.equal(mgr._colorIndex, 0);
  });

  it('constructor with bookmarks', () => {
    const mgr = new AdvancedTagManager({ bookmarks: sampleBookmarks });
    assert.equal(mgr.bookmarks.length, 5);
    // Tags should be deep-copied
    assert.deepEqual(mgr.bookmarks[0].tags, ['react', 'javascript', 'tutorial']);
    // Mutating original should not affect manager
    sampleBookmarks[0].tags.push('extra');
    assert.equal(mgr.bookmarks[0].tags.length, 3);
    sampleBookmarks[0].tags.pop(); // restore
  });

  it('constructor with null bookmarks', () => {
    const mgr = new AdvancedTagManager({ bookmarks: null });
    assert.deepEqual(mgr.bookmarks, []);
  });

  it('constructor with non-array bookmarks', () => {
    const mgr = new AdvancedTagManager({ bookmarks: 'invalid' });
    assert.deepEqual(mgr.bookmarks, []);
  });

  it('constructor handles bookmarks without tags', () => {
    const mgr = new AdvancedTagManager({ bookmarks: [{ id: '1', title: 'Test', url: '' }] });
    assert.deepEqual(mgr.bookmarks[0].tags, []);
  });
});

// ==================== Tag Colors ====================

describe('AdvancedTagManager color management', () => {
  let mgr;
  beforeEach(() => { mgr = new AdvancedTagManager(); });

  it('assignColor 分配颜色', () => {
    const color = mgr.assignColor('react');
    assert.ok(color.startsWith('#'));
    assert.equal(color, '#F44336'); // first in palette
  });

  it('assignColor 相同标签返回相同颜色', () => {
    const c1 = mgr.assignColor('react');
    const c2 = mgr.assignColor('react');
    assert.equal(c1, c2);
  });

  it('assignColor 不同标签分配不同颜色', () => {
    const c1 = mgr.assignColor('react');
    const c2 = mgr.assignColor('vue');
    assert.notEqual(c1, c2);
  });

  it('assignColor 空标签返回第一个颜色', () => {
    assert.equal(mgr.assignColor(''), '#F44336');
    assert.equal(mgr.assignColor(null), '#F44336');
    assert.equal(mgr.assignColor(undefined), '#F44336');
  });

  it('assignColor 大小写不敏感', () => {
    const c1 = mgr.assignColor('React');
    const c2 = mgr.assignColor('react');
    assert.equal(c1, c2);
  });

  it('assignColor 15色色盘轮转', () => {
    for (let i = 0; i < 15; i++) {
      mgr.assignColor(`tag${i}`);
    }
    // 16th tag should cycle to first color
    const c16 = mgr.assignColor('tag15');
    assert.equal(c16, '#F44336');
  });

  it('getColor 获取已分配的颜色', () => {
    mgr.assignColor('react');
    const color = mgr.getColor('react');
    assert.equal(color, '#F44336');
  });

  it('getColor 未分配时自动分配', () => {
    const color = mgr.getColor('newtag');
    assert.ok(color.startsWith('#'));
  });

  it('getColor 空标签返回第一个颜色', () => {
    assert.equal(mgr.getColor(''), '#F44336');
    assert.equal(mgr.getColor(null), '#F44336');
  });

  it('getPalette 返回15色色盘', () => {
    const palette = AdvancedTagManager.getPalette();
    assert.equal(palette.length, 15);
    assert.ok(palette.every(c => c.startsWith('#')));
  });
});

// ==================== Tag Hierarchy ====================

describe('AdvancedTagManager tag hierarchy', () => {
  let mgr;
  beforeEach(() => { mgr = new AdvancedTagManager(); });

  it('setParent 设置父子关系', () => {
    mgr.setParent('react-hooks', 'react');
    const children = mgr.getChildren('react');
    assert.ok(children.includes('react-hooks'));
  });

  it('setParent 空参数忽略', () => {
    mgr.setParent('', 'react');
    mgr.setParent('react', '');
    mgr.setParent(null, 'react');
    assert.deepEqual(mgr.getChildren('react'), []);
  });

  it('setParent 自引用忽略', () => {
    mgr.setParent('react', 'react');
    assert.deepEqual(mgr.getChildren('react'), []);
  });

  it('setParent 大小写不敏感', () => {
    mgr.setParent('React-Hooks', 'React');
    assert.deepEqual(mgr.getChildren('react'), ['react-hooks']);
  });

  it('getChildren 无子标签返回空数组', () => {
    assert.deepEqual(mgr.getChildren('nonexistent'), []);
  });

  it('getChildren 多个子标签', () => {
    mgr.setParent('react-hooks', 'react');
    mgr.setParent('react-router', 'react');
    mgr.setParent('react-dom', 'react');
    const children = mgr.getChildren('react');
    assert.equal(children.length, 3);
    assert.ok(children.includes('react-hooks'));
    assert.ok(children.includes('react-router'));
    assert.ok(children.includes('react-dom'));
  });

  it('getChildren 空标签返回空数组', () => {
    assert.deepEqual(mgr.getChildren(''), []);
    assert.deepEqual(mgr.getChildren(null), []);
  });

  it('getAncestors 获取祖先链', () => {
    mgr.setParent('usestate', 'hooks');
    mgr.setParent('hooks', 'react');
    const ancestors = mgr.getAncestors('usestate');
    assert.deepEqual(ancestors, ['hooks', 'react']);
  });

  it('getAncestors 无祖先返回空', () => {
    assert.deepEqual(mgr.getAncestors('react'), []);
  });

  it('getAncestors 空标签返回空', () => {
    assert.deepEqual(mgr.getAncestors(''), []);
    assert.deepEqual(mgr.getAncestors(null), []);
  });

  it('getAncestors 防止循环引用', () => {
    mgr.setParent('a', 'b');
    mgr.setParent('b', 'a'); // circular
    const ancestors = mgr.getAncestors('a');
    assert.ok(ancestors.length <= 2);
  });
});

// ==================== Tag Statistics ====================

describe('AdvancedTagManager tag statistics', () => {
  it('getTagStats 统计标签计数', () => {
    const mgr = new AdvancedTagManager({ bookmarks: sampleBookmarks });
    const stats = mgr.getTagStats();
    assert.equal(stats.count['react'], 2);
    assert.equal(stats.count['tutorial'], 2);
    assert.equal(stats.count['python'], 1);
  });

  it('getTagStats top tags 按计数降序', () => {
    const mgr = new AdvancedTagManager({ bookmarks: sampleBookmarks });
    const stats = mgr.getTagStats();
    assert.ok(stats.top.length > 0);
    // react and tutorial both have 2, should be before python (1)
    const reactIdx = stats.top.indexOf('react');
    const pythonIdx = stats.top.indexOf('python');
    assert.ok(reactIdx < pythonIdx);
  });

  it('getTagStats 共现分析', () => {
    const mgr = new AdvancedTagManager({ bookmarks: sampleBookmarks });
    const stats = mgr.getTagStats();
    assert.ok(stats.coOccurrence.length > 0);
    // react + javascript appear together in bm1
    const pair = stats.coOccurrence.find(p =>
      (p.tagA === 'javascript' && p.tagB === 'react') ||
      (p.tagA === 'react' && p.tagB === 'javascript')
    );
    assert.ok(pair, 'react-javascript co-occurrence should exist');
    assert.equal(pair.count, 1);
  });

  it('getTagStats 空书签列表', () => {
    const mgr = new AdvancedTagManager({ bookmarks: [] });
    const stats = mgr.getTagStats();
    assert.deepEqual(stats.count, {});
    assert.deepEqual(stats.top, []);
    assert.deepEqual(stats.coOccurrence, []);
  });

  it('getTagStats 共现降序排列', () => {
    const mgr = new AdvancedTagManager({
      bookmarks: [
        { id: '1', title: '', url: '', tags: ['a', 'b', 'c'] },
        { id: '2', title: '', url: '', tags: ['a', 'b'] },
      ]
    });
    const stats = mgr.getTagStats();
    if (stats.coOccurrence.length > 1) {
      assert.ok(stats.coOccurrence[0].count >= stats.coOccurrence[1].count);
    }
  });
});

// ==================== Auto-tagging ====================

describe('AdvancedTagManager auto-tagging', () => {
  it('autoTag 从标题提取关键词标签', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Learn React and TypeScript', url: '' });
    assert.ok(tags.includes('react'));
    assert.ok(tags.includes('typescript'));
  });

  it('autoTag 从 URL 域名提取标签', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: '', url: 'https://github.com/user/repo' });
    assert.ok(tags.includes('github'));
  });

  it('autoTag 从 dev.to 提取标签', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: '', url: 'https://dev.to/article' });
    assert.ok(tags.includes('dev'));
  });

  it('autoTag 从 arxiv.org 提取标签', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: '', url: 'https://arxiv.org/abs/1234' });
    assert.ok(tags.includes('arxiv'));
  });

  it('autoTag 多词关键词匹配', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Machine learning tutorial', url: '' });
    assert.ok(tags.includes('machine-learning'));
  });

  it('autoTag 去重', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'react react tutorial', url: 'https://react.dev' });
    const reactCount = tags.filter(t => t === 'react').length;
    assert.equal(reactCount, 1);
  });

  it('autoTag 空输入返回空', () => {
    const mgr = new AdvancedTagManager();
    assert.deepEqual(mgr.autoTag({}), []);
    assert.deepEqual(mgr.autoTag(null), []);
    assert.deepEqual(mgr.autoTag({ title: '', url: '' }), []);
  });

  it('autoTag 无效 URL 不崩溃', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: '', url: 'not-a-url' });
    assert.ok(Array.isArray(tags));
  });

  it('autoTag python from medium.com', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Python Guide', url: 'https://medium.com/article' });
    assert.ok(tags.includes('python'));
    assert.ok(tags.includes('medium'));
  });

  it('autoTag docker keywords', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Docker container deployment', url: 'https://docs.docker.com/guide' });
    assert.ok(tags.includes('docker'));
  });

  it('autoTag kubernetes and k8s keywords', () => {
    const mgr = new AdvancedTagManager();
    const tags1 = mgr.autoTag({ title: 'Kubernetes deployment', url: '' });
    assert.ok(tags1.includes('kubernetes'));
    const tags2 = mgr.autoTag({ title: 'K8s cluster setup', url: '' });
    assert.ok(tags2.includes('kubernetes'));
  });

  it('autoTag test and testing keywords', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Unit test with Jest', url: '' });
    assert.ok(tags.includes('testing'));
    assert.ok(tags.includes('jest'));
  });

  it('autoTag go keyword with word boundary', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Go programming guide', url: '' });
    assert.ok(tags.includes('go'));
  });

  it('autoTag security keyword', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Web security best practices', url: '' });
    assert.ok(tags.includes('security'));
  });

  it('autoTag from leetcode.com', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: '', url: 'https://leetcode.com/problems/1' });
    assert.ok(tags.includes('leetcode'));
  });

  it('autoTag design pattern keyword', () => {
    const mgr = new AdvancedTagManager();
    const tags = mgr.autoTag({ title: 'Design pattern guide', url: '' });
    assert.ok(tags.includes('design-pattern'));
  });
});

// ==================== Edge cases ====================

describe('AdvancedTagManager edge cases', () => {
  it('assignColor 超长标签', () => {
    const mgr = new AdvancedTagManager();
    const longTag = 'a'.repeat(1000);
    const color = mgr.assignColor(longTag);
    assert.ok(color.startsWith('#'));
  });

  it('assignColor 特殊字符标签', () => {
    const mgr = new AdvancedTagManager();
    const color = mgr.assignColor('tag@#$%');
    assert.ok(color.startsWith('#'));
  });

  it('setParent 深层嵌套', () => {
    const mgr = new AdvancedTagManager();
    mgr.setParent('l1', 'l0');
    mgr.setParent('l2', 'l1');
    mgr.setParent('l3', 'l2');
    mgr.setParent('l4', 'l3');
    const ancestors = mgr.getAncestors('l4');
    assert.deepEqual(ancestors, ['l3', 'l2', 'l1', 'l0']);
  });

  it('bookmarks with empty tags array', () => {
    const mgr = new AdvancedTagManager({
      bookmarks: [{ id: '1', title: 'Test', url: '', tags: [] }]
    });
    const stats = mgr.getTagStats();
    assert.deepEqual(stats.count, {});
  });
});
