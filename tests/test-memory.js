/**
 * 测试 lib/memory.js — 增强记忆系统
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installChromeMock();
installIndexedDBMock();
const { MemorySystem } = await import('../lib/memory.js');

let mem;

beforeEach(async () => {
  resetChromeMock();
  resetIndexedDBMock();
  installChromeMock();
  installIndexedDBMock();
  mem = new MemorySystem();
  // Mock kb.init to avoid real IndexedDB
  mem.kb = {
    init: async () => {},
    getAllEntries: async () => [],
    getEntry: async () => null,
    deleteEntry: async () => {},
    getAllTags: async () => [],
    exportMarkdown: async () => '',
    exportJSON: async () => '',
    saveEntry: async (entry) => ({ id: 'test-id', ...entry }),
  };
  mem.userProfile = {
    level: 'intermediate',
    languages: [],
    domains: [],
    preferences: {},
    interactions: 0,
  };
});

// ==================== extractKeywords ====================

describe('extractKeywords', () => {
  it('提取英文关键词', () => {
    const kw = mem.extractKeywords('How to use React hooks?');
    assert.ok(kw.some(k => k.includes('react')));
    assert.ok(kw.some(k => k.includes('hooks')));
    // 停用词应被过滤
    assert.ok(!kw.some(k => k === 'how'));
    assert.ok(!kw.some(k => k === 'to'));
  });

  it('提取中文关键词', () => {
    const kw = mem.extractKeywords('如何使用 React 的 useState 钩子');
    assert.ok(kw.some(k => k.includes('react')));
    assert.ok(kw.some(k => k.includes('usestate')));
  });

  it('保留原始查询', () => {
    const query = 'React hooks tutorial';
    const kw = mem.extractKeywords(query);
    assert.ok(kw.includes(query));
  });

  it('过滤短 token', () => {
    const kw = mem.extractKeywords('a b cd ef');
    // "a", "b" 长度<2 应被过滤
    assert.ok(!kw.includes('a'));
    assert.ok(kw.some(k => k.includes('cd')));
  });
});

// ==================== extractDomain ====================

describe('extractDomain', () => {
  it('提取二级域名', () => {
    assert.equal(mem.extractDomain('https://www.example.com/path'), 'example.com');
  });

  it('子域名', () => {
    assert.equal(mem.extractDomain('https://api.github.com/v3'), 'github.com');
  });

  it('无效 URL 返回 null', () => {
    assert.equal(mem.extractDomain('not a url'), null);
  });

  it('单段 hostname 返回自身', () => {
    assert.equal(mem.extractDomain('https://localhost/path'), 'localhost');
  });
});

// ==================== scoreRelevance ====================

describe('scoreRelevance', () => {
  it('标题匹配得高分', () => {
    const entry = { title: 'React Hooks Guide', tags: [], question: '', summary: '', answer: '', createdAt: new Date().toISOString() };
    const score = mem.scoreRelevance(entry, ['react'], 'react hooks');
    assert.ok(score > 0);
  });

  it('标签匹配', () => {
    const entry = { title: '', tags: ['javascript', 'react'], question: '', summary: '', answer: '', createdAt: new Date().toISOString() };
    const score = mem.scoreRelevance(entry, ['react'], 'about react');
    assert.ok(score > 0);
  });

  it('空 entry 得 0 分', () => {
    const entry = { createdAt: new Date().toISOString() };
    const score = mem.scoreRelevance(entry, ['test'], 'test');
    assert.equal(score, 0);
  });
});

// ==================== learnFromInteraction ====================

describe('learnFromInteraction', () => {
  it('递增交互次数', async () => {
    await mem.learnFromInteraction('q', 'a', {});
    assert.equal(mem.userProfile.interactions, 1);
  });

  it('学习编程语言', async () => {
    await mem.learnFromInteraction('q', 'a', {
      codeBlocks: [{ lang: 'javascript' }, { lang: 'python' }],
    });
    assert.ok(mem.userProfile.languages.includes('javascript'));
    assert.ok(mem.userProfile.languages.includes('python'));
  });

  it('不重复添加语言', async () => {
    await mem.learnFromInteraction('q', 'a', { codeBlocks: [{ lang: 'js' }] });
    await mem.learnFromInteraction('q', 'a', { codeBlocks: [{ lang: 'js' }] });
    assert.equal(mem.userProfile.languages.filter(l => l === 'js').length, 1);
  });

  it('学习域名', async () => {
    await mem.learnFromInteraction('q', 'a', { url: 'https://github.com/repo' });
    assert.ok(mem.userProfile.domains.includes('github.com'));
  });

  it('域名上限 20 个', async () => {
    for (let i = 0; i < 25; i++) {
      await mem.learnFromInteraction('q', 'a', { url: `https://site${i}.com/page` });
    }
    assert.ok(mem.userProfile.domains.length <= 20);
  });
});

// ==================== autoSaveIfWorth ====================

describe('autoSaveIfWorth', () => {
  it('答案太短不保存', async () => {
    const result = await mem.autoSaveIfWorth('q', 'short', {}, null);
    assert.equal(result, null);
  });

  it('非技术内容不保存', async () => {
    const longAnswer = 'x'.repeat(200);
    const result = await mem.autoSaveIfWorth('what is love', longAnswer, {}, null);
    assert.equal(result, null);
  });

  it('技术内容 + 长答案应保存', async () => {
    const aiClient = {
      generateSummaryAndTags: async () => ({ summary: 'test', tags: ['test'] }),
    };
    const longAnswer = 'This function uses the API to debug the code. '.repeat(10);
    const result = await mem.autoSaveIfWorth(
      'How to debug this function?',
      longAnswer,
      { title: 'Test Page', url: 'https://example.com' },
      aiClient
    );
    assert.ok(result);
  });
});

// ==================== toPrompt ====================

describe('toPrompt', () => {
  it('无记忆时返回空字符串', async () => {
    const prompt = await mem.toPrompt('test query');
    assert.equal(prompt, '');
  });

  it('有记忆时返回 prompt', async () => {
    mem.kb.getAllEntries = async () => [
      { id: '1', title: 'Test', summary: 'Test summary', tags: ['test'], createdAt: new Date().toISOString() }
    ];
    const prompt = await mem.toPrompt('test');
    assert.ok(prompt.length > 0);
    assert.match(prompt, /相关记忆/);
  });

  it('异常时返回空字符串', async () => {
    mem.recall = async () => { throw new Error('fail'); };
    const prompt = await mem.toPrompt('test');
    assert.equal(prompt, '');
  });
});

// ==================== keywordSearch ====================

describe('keywordSearch', () => {
  it('空知识库返回空数组', async () => {
    const result = await mem.keywordSearch(['test']);
    assert.deepEqual(result, []);
  });

  it('匹配标题', async () => {
    mem.kb.getAllEntries = async () => [
      { id: '1', title: 'React Hooks Guide', tags: [] },
      { id: '2', title: 'Python Basics', tags: [] },
    ];
    const result = await mem.keywordSearch(['react']);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'React Hooks Guide');
  });

  it('匹配标签', async () => {
    mem.kb.getAllEntries = async () => [
      { id: '1', title: 'X', tags: ['javascript'] },
    ];
    const result = await mem.keywordSearch(['javascript']);
    assert.equal(result.length, 1);
  });
});
