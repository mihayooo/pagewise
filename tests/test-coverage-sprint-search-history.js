/**
 * 测试 lib/bookmark-search-history.js — BookmarkSearchHistory 搜索历史管理
 * Coverage Sprint R152
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../lib/bookmark-search-history.js');
const { recordSearch, getSearchHistory, getPopularSearches, getSuggestions, clearHistory } = mod;

beforeEach(() => { clearHistory(); });

// ==================== recordSearch ====================

describe('recordSearch', () => {
  it('记录搜索', () => {
    const entry = recordSearch('react tutorial');
    assert.ok(entry);
    assert.equal(entry.query, 'react tutorial');
    assert.equal(entry.count, 1);
    assert.ok(entry.id);
    assert.ok(entry.timestamp > 0);
  });

  it('空查询返回 null', () => {
    assert.equal(recordSearch(''), null);
    assert.equal(recordSearch('   '), null);
    assert.equal(recordSearch(null), null);
    assert.equal(recordSearch(undefined), null);
    assert.equal(recordSearch(123), null);
  });

  it('重复查询累加计数', () => {
    recordSearch('react');
    const entry = recordSearch('react');
    assert.equal(entry.count, 2);
  });

  it('大小写归一化', () => {
    recordSearch('React');
    const entry = recordSearch('REACT');
    assert.equal(entry.count, 2);
  });

  it('空格归一化', () => {
    recordSearch('  react   tutorial  ');
    const entry = recordSearch('react tutorial');
    assert.equal(entry.count, 2);
  });

  it('重复查询移到列表最前', () => {
    recordSearch('aaa');
    recordSearch('bbb');
    const entry = recordSearch('aaa');
    assert.equal(entry.count, 2);
    const history = getSearchHistory();
    assert.equal(history[0].query, 'aaa');
  });
});

// ==================== getSearchHistory ====================

describe('getSearchHistory', () => {
  it('返回最近搜索', () => {
    recordSearch('react');
    recordSearch('vue');
    recordSearch('angular');
    const history = getSearchHistory();
    assert.equal(history.length, 3);
    assert.equal(history[0].query, 'angular');
  });

  it('限制返回数量', () => {
    for (let i = 0; i < 30; i++) recordSearch(`query${i}`);
    assert.equal(getSearchHistory(5).length, 5);
    assert.equal(getSearchHistory(10).length, 10);
  });

  it('默认限制20条', () => {
    for (let i = 0; i < 25; i++) recordSearch(`query${i}`);
    assert.equal(getSearchHistory().length, 20);
  });

  it('limit=0 返回空', () => {
    recordSearch('test');
    assert.equal(getSearchHistory(0).length, 0);
  });

  it('空历史返回空数组', () => {
    assert.deepEqual(getSearchHistory(), []);
  });
});

// ==================== getPopularSearches ====================

describe('getPopularSearches', () => {
  it('按次数降序', () => {
    recordSearch('a');
    recordSearch('b');
    recordSearch('b');
    recordSearch('c');
    recordSearch('c');
    recordSearch('c');
    const popular = getPopularSearches();
    assert.equal(popular[0].query, 'c');
    assert.equal(popular[1].query, 'b');
    assert.equal(popular[2].query, 'a');
  });

  it('次数相同时按时间降序', () => {
    recordSearch('old');
    recordSearch('new');
    const popular = getPopularSearches();
    assert.equal(popular[0].query, 'new');
    assert.equal(popular[1].query, 'old');
  });

  it('限制返回数量', () => {
    for (let i = 0; i < 20; i++) recordSearch(`q${i}`);
    assert.ok(getPopularSearches(5).length <= 5);
  });

  it('limit=0 返回全部', () => {
    recordSearch('a');
    recordSearch('b');
    const popular = getPopularSearches(0);
    assert.equal(popular.length, 2);
  });

  it('空历史', () => {
    assert.deepEqual(getPopularSearches(), []);
  });
});

// ==================== getSuggestions ====================

describe('getSuggestions', () => {
  it('前缀匹配', () => {
    recordSearch('react tutorial');
    recordSearch('react hooks');
    recordSearch('vue guide');
    const suggestions = getSuggestions('react');
    assert.equal(suggestions.length, 2);
    assert.ok(suggestions.includes('react tutorial'));
    assert.ok(suggestions.includes('react hooks'));
  });

  it('按次数降序', () => {
    recordSearch('react');
    recordSearch('react tutorial');
    recordSearch('react tutorial');
    const suggestions = getSuggestions('react');
    assert.equal(suggestions[0], 'react tutorial');
  });

  it('无匹配返回空', () => {
    recordSearch('python');
    assert.deepEqual(getSuggestions('react'), []);
  });

  it('空输入返回空', () => {
    assert.deepEqual(getSuggestions(''), []);
    assert.deepEqual(getSuggestions(null), []);
    assert.deepEqual(getSuggestions(123), []);
  });

  it('前缀为空格返回空', () => {
    assert.deepEqual(getSuggestions('   '), []);
  });

  it('去重', () => {
    recordSearch('react');
    recordSearch('react');
    const suggestions = getSuggestions('react');
    const reactCount = suggestions.filter(s => s === 'react').length;
    assert.equal(reactCount, 1);
  });
});

// ==================== clearHistory ====================

describe('clearHistory', () => {
  it('清除所有历史', () => {
    recordSearch('a');
    recordSearch('b');
    clearHistory();
    assert.deepEqual(getSearchHistory(), []);
    assert.deepEqual(getPopularSearches(), []);
    assert.deepEqual(getSuggestions('a'), []);
  });

  it('清除后可以重新记录', () => {
    recordSearch('old');
    clearHistory();
    recordSearch('new');
    const history = getSearchHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].query, 'new');
  });
});

// ==================== Edge cases ====================

describe('search history edge cases', () => {
  it('大量搜索记录', () => {
    for (let i = 0; i < 100; i++) {
      recordSearch(`query${i}`);
    }
    assert.equal(getSearchHistory(100).length, 100);
  });

  it('中文搜索', () => {
    recordSearch('人工智能');
    const suggestions = getSuggestions('人工');
    assert.ok(suggestions.includes('人工智能'));
  });

  it('混合中英文', () => {
    recordSearch('React学习指南');
    const history = getSearchHistory();
    assert.equal(history[0].query, 'react学习指南');
  });
});
