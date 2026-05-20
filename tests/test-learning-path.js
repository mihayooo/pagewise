/**
 * 测试 lib/learning-path.js — 学习路径生成
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicStats,
  buildLearningPathPrompt,
  parseLearningPathResponse,
  validateLearningPath,
  renderLearningPathHTML
} from '../lib/learning-path.js';

// ==================== buildTopicStats ====================

describe('buildTopicStats', () => {
  it('null/undefined 输入返回空结果', () => {
    assert.deepEqual(buildTopicStats(null), { topics: [], totalCount: 0 });
    assert.deepEqual(buildTopicStats(undefined), { topics: [], totalCount: 0 });
  });

  it('空数组返回空结果', () => {
    assert.deepEqual(buildTopicStats([]), { topics: [], totalCount: 0 });
  });

  it('非数组输入返回空结果', () => {
    assert.deepEqual(buildTopicStats('not array'), { topics: [], totalCount: 0 });
  });

  it('按 tags 统计主题', () => {
    const entries = [
      { id: '1', tags: ['JavaScript', 'React'] },
      { id: '2', tags: ['JavaScript', 'Vue'] },
      { id: '3', tags: ['Python'] },
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.totalCount, 3);
    assert.equal(result.topics.length, 4);
    // JavaScript 应排第一（count=2）
    assert.equal(result.topics[0].name, 'JavaScript');
    assert.equal(result.topics[0].count, 2);
  });

  it('无 tags 时用 category 兜底', () => {
    const entries = [
      { id: '1', category: '前端' },
      { id: '2', category: '前端' },
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.topics[0].name, '前端');
    assert.equal(result.topics[0].count, 2);
  });

  it('无 tags 无 category 时归为"未分类"', () => {
    const entries = [{ id: '1' }];
    const result = buildTopicStats(entries);
    assert.equal(result.topics[0].name, '未分类');
  });

  it('同一 entry 的 tag 只计入一次 entryIds', () => {
    const entries = [
      { id: '1', tags: ['JS'] },
      { id: '1', tags: ['JS'] },  // 重复 id
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.topics[0].count, 2);
    assert.equal(result.topics[0].entryIds.length, 1); // entryIds 去重
  });

  it('结果按 count 降序排列', () => {
    const entries = [
      { id: '1', tags: ['A'] },
      { id: '2', tags: ['B', 'B2'] },
      { id: '3', tags: ['B'] },
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.topics[0].name, 'B');
  });
});

// ==================== buildLearningPathPrompt ====================

describe('buildLearningPathPrompt', () => {
  it('空主题返回提示信息', () => {
    const result = buildLearningPathPrompt([]);
    assert.match(result, /没有足够的主题/);
  });

  it('null 输入返回提示信息', () => {
    const result = buildLearningPathPrompt(null);
    assert.match(result, /没有足够的主题/);
  });

  it('有主题时生成包含统计的 prompt', () => {
    const topics = [
      { name: 'JavaScript', count: 5, entryIds: ['1', '2'] },
      { name: 'React', count: 3, entryIds: ['3'] },
    ];
    const result = buildLearningPathPrompt(topics);
    assert.match(result, /JavaScript/);
    assert.match(result, /5 条相关知识/);
    assert.match(result, /React/);
    assert.match(result, /JSON/);
  });
});

// ==================== parseLearningPathResponse ====================

describe('parseLearningPathResponse', () => {
  it('null/非字符串返回 null', () => {
    assert.equal(parseLearningPathResponse(null), null);
    assert.equal(parseLearningPathResponse(123), null);
  });

  it('直接 JSON 格式', () => {
    const json = JSON.stringify({ stages: [{ title: 'A', description: 'B', topics: [] }] });
    const result = parseLearningPathResponse(json);
    assert.ok(result);
    assert.equal(result.stages.length, 1);
  });

  it('markdown 代码块中的 JSON', () => {
    const resp = '```json\n{"stages":[{"title":"A","description":"B","topics":[]}]}\n```';
    const result = parseLearningPathResponse(resp);
    assert.ok(result);
    assert.equal(result.stages[0].title, 'A');
  });

  it('含 stages 的 JSON 对象', () => {
    const resp = 'some text {"stages":[{"title":"X","description":"Y","topics":[]}]} more text';
    const result = parseLearningPathResponse(resp);
    assert.ok(result);
  });

  it('无效 JSON 返回 null', () => {
    assert.equal(parseLearningPathResponse('not json at all'), null);
  });

  it('JSON 无 stages 字段返回 null', () => {
    assert.equal(parseLearningPathResponse('{"foo":"bar"}'), null);
  });
});

// ==================== validateLearningPath ====================

describe('validateLearningPath', () => {
  it('null 返回 false', () => {
    assert.equal(validateLearningPath(null), false);
  });

  it('无 stages 返回 false', () => {
    assert.equal(validateLearningPath({}), false);
  });

  it('stages 为空数组返回 false', () => {
    assert.equal(validateLearningPath({ stages: [] }), false);
  });

  it('stage 缺少 title 返回 false', () => {
    assert.equal(validateLearningPath({
      stages: [{ description: 'B', topics: [] }]
    }), false);
  });

  it('stage 缺少 description 返回 false', () => {
    assert.equal(validateLearningPath({
      stages: [{ title: 'A', topics: [] }]
    }), false);
  });

  it('stage topics 非数组返回 false', () => {
    assert.equal(validateLearningPath({
      stages: [{ title: 'A', description: 'B', topics: 'not array' }]
    }), false);
  });

  it('有效结构返回 true', () => {
    assert.equal(validateLearningPath({
      stages: [{ title: 'A', description: 'B', topics: ['T1'] }]
    }), true);
  });
});

// ==================== renderLearningPathHTML ====================

describe('renderLearningPathHTML', () => {
  it('null 返回空字符串', () => {
    assert.equal(renderLearningPathHTML(null), '');
  });

  it('空 stages 返回空字符串', () => {
    assert.equal(renderLearningPathHTML({ stages: [] }), '');
  });

  it('渲染单个阶段', () => {
    const path = {
      stages: [{ title: '基础', description: '学习基础', topics: ['JS'], estimatedTime: '2周' }]
    };
    const html = renderLearningPathHTML(path, (s) => s);
    assert.match(html, /基础/);
    assert.match(html, /学习基础/);
    assert.match(html, /JS/);
    assert.match(html, /2周/);
  });

  it('多阶段有连接线', () => {
    const path = {
      stages: [
        { title: 'A', description: 'B', topics: [] },
        { title: 'C', description: 'D', topics: [] },
      ]
    };
    const html = renderLearningPathHTML(path, (s) => s);
    assert.match(html, /lp-connector-line/);
  });

  it('使用 escapeHtml 函数', () => {
    const path = {
      stages: [{ title: '<script>', description: 'desc', topics: [] }]
    };
    const escaped = renderLearningPathHTML(path, (s) => s.replace(/</g, '&lt;'));
    assert.match(escaped, /&lt;script>/);
  });

  it('含 entries 时渲染推荐阅读', () => {
    const path = {
      stages: [{
        title: 'T', description: 'D', topics: [],
        entries: [{ id: '1', title: '文章1' }]
      }]
    };
    const html = renderLearningPathHTML(path, (s) => s);
    assert.match(html, /推荐阅读/);
    assert.match(html, /文章1/);
  });
});
