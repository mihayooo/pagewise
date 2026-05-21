/**
 * 测试 lib/bookmark-knowledge-link-scorer.js — 关联计算子模块
 * Coverage Sprint R152
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  URL_MATCH_WEIGHT, TITLE_SIMILARITY_WEIGHT, TAG_OVERLAP_WEIGHT,
  CORRELATION_THRESHOLD, SUGGESTION_THRESHOLD,
  normalizeUrl, normalizeTag, computeUrlMatch, computeTitleSimilarity,
  computeTagOverlap, computeCorrelation,
} = await import('../../lib/bookmark-knowledge-link-scorer.js');

// ==================== Constants ====================

describe('scorer constants', () => {
  it('权重总和为1', () => {
    assert.equal(URL_MATCH_WEIGHT + TITLE_SIMILARITY_WEIGHT + TAG_OVERLAP_WEIGHT, 1);
  });

  it('阈值在合理范围', () => {
    assert.ok(CORRELATION_THRESHOLD > 0 && CORRELATION_THRESHOLD < 1);
    assert.ok(SUGGESTION_THRESHOLD > CORRELATION_THRESHOLD);
  });
});

// ==================== normalizeUrl ====================

describe('normalizeUrl', () => {
  it('移除协议', () => {
    const n = normalizeUrl('https://github.com/repo');
    assert.ok(!n.startsWith('https://'));
    assert.ok(n.includes('github.com'));
  });

  it('移除 www', () => {
    const n = normalizeUrl('https://www.github.com/repo');
    assert.ok(!n.startsWith('www.'));
  });

  it('移除尾斜杠', () => {
    assert.equal(normalizeUrl('https://github.com/repo/'), normalizeUrl('https://github.com/repo'));
  });

  it('空输入返回空', () => {
    assert.equal(normalizeUrl(''), '');
    assert.equal(normalizeUrl(null), '');
    assert.equal(normalizeUrl(undefined), '');
    assert.equal(normalizeUrl(123), '');
  });

  it('无效URL回退处理', () => {
    const n = normalizeUrl('not-a-valid-url');
    assert.ok(typeof n === 'string');
  });

  it('大小写归一化', () => {
    const n = normalizeUrl('https://GitHub.COM/Repo');
    assert.ok(n.includes('github.com'));
  });
});

// ==================== normalizeTag ====================

describe('normalizeTag', () => {
  it('小写归一化', () => {
    assert.equal(normalizeTag('JavaScript'), 'javascript');
  });

  it('去首尾空格', () => {
    assert.equal(normalizeTag('  tag  '), 'tag');
  });

  it('空输入返回空', () => {
    assert.equal(normalizeTag(''), '');
    assert.equal(normalizeTag(null), '');
    assert.equal(normalizeTag(undefined), '');
    assert.equal(normalizeTag(123), '');
  });
});

// ==================== computeUrlMatch ====================

describe('computeUrlMatch', () => {
  it('完全匹配返回1', () => {
    const bm = { url: 'https://github.com/repo' };
    const entry = { sourceUrl: 'https://github.com/repo' };
    assert.equal(computeUrlMatch(bm, entry), 1);
  });

  it('不同URL返回0', () => {
    const bm = { url: 'https://github.com/a' };
    const entry = { sourceUrl: 'https://dev.to/b' };
    assert.equal(computeUrlMatch(bm, entry), 0);
  });

  it('子路径匹配返回0.7', () => {
    const bm = { url: 'https://github.com/repo' };
    const entry = { sourceUrl: 'https://github.com/repo/sub' };
    assert.equal(computeUrlMatch(bm, entry), 0.7);
  });

  it('同域名匹配返回0.3', () => {
    const bm = { url: 'https://github.com/a' };
    const entry = { sourceUrl: 'https://github.com/b' };
    assert.equal(computeUrlMatch(bm, entry), 0.3);
  });

  it('空URL返回0', () => {
    assert.equal(computeUrlMatch({ url: '' }, { sourceUrl: 'https://a.com' }), 0);
    assert.equal(computeUrlMatch({ url: 'https://a.com' }, { sourceUrl: '' }), 0);
  });

  it('缺少url属性', () => {
    assert.equal(computeUrlMatch({}, { sourceUrl: 'https://a.com' }), 0);
  });
});

// ==================== computeTitleSimilarity ====================

describe('computeTitleSimilarity', () => {
  it('相同标题返回高相似度', () => {
    const mockEngine = {
      generateVector: (text) => {
        const vec = new Map();
        for (const word of text.split(/\s+/)) {
          vec.set(word, (vec.get(word) || 0) + 1);
        }
        return vec;
      },
      cosineSimilarity: (a, b) => {
        let dot = 0, normA = 0, normB = 0;
        for (const [k, v] of a) { normA += v * v; if (b.has(k)) dot += v * b.get(k); }
        for (const [, v] of b) { normB += v * v; }
        return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
      },
    };
    const sim = computeTitleSimilarity(
      { title: 'React Tutorial', contentPreview: '' },
      { title: 'React Tutorial', question: '', summary: '' },
      mockEngine,
    );
    assert.ok(sim > 0.9);
  });

  it('空标题返回0', () => {
    const mockEngine = { generateVector: () => new Map(), cosineSimilarity: () => 0 };
    assert.equal(
      computeTitleSimilarity({ title: '' }, { title: '' }, mockEngine),
      0
    );
  });

  it('引擎异常返回0', () => {
    const mockEngine = { generateVector: () => { throw new Error('fail'); }, cosineSimilarity: () => 0 };
    assert.equal(
      computeTitleSimilarity({ title: 'A' }, { title: 'B' }, mockEngine),
      0
    );
  });

  it('空向量返回0', () => {
    const mockEngine = { generateVector: () => new Map(), cosineSimilarity: () => 0 };
    assert.equal(
      computeTitleSimilarity({ title: 'A' }, { title: 'B' }, mockEngine),
      0
    );
  });

  it('使用 contentPreview 和 question/summary', () => {
    const mockEngine = {
      generateVector: (text) => {
        const vec = new Map();
        for (const word of text.split(/\s+/)) {
          vec.set(word, (vec.get(word) || 0) + 1);
        }
        return vec;
      },
      cosineSimilarity: (a, b) => {
        let dot = 0, normA = 0, normB = 0;
        for (const [k, v] of a) { normA += v * v; if (b.has(k)) dot += v * b.get(k); }
        for (const [, v] of b) { normB += v * v; }
        return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
      },
    };
    const sim = computeTitleSimilarity(
      { title: '', contentPreview: 'machine learning guide' },
      { title: '', question: 'machine learning', summary: 'guide to ML' },
      mockEngine,
    );
    assert.ok(sim > 0);
  });
});

// ==================== computeTagOverlap ====================

describe('computeTagOverlap', () => {
  it('相同标签返回1', () => {
    const sim = computeTagOverlap(
      { tags: ['react', 'javascript'] },
      { tags: ['react', 'javascript'] },
    );
    assert.equal(sim, 1);
  });

  it('无交集返回0', () => {
    const sim = computeTagOverlap(
      { tags: ['react'] },
      { tags: ['python'] },
    );
    assert.equal(sim, 0);
  });

  it('部分重叠', () => {
    const sim = computeTagOverlap(
      { tags: ['react', 'javascript'] },
      { tags: ['react', 'python'] },
    );
    assert.ok(sim > 0 && sim < 1);
  });

  it('空标签返回0', () => {
    assert.equal(computeTagOverlap({ tags: [] }, { tags: ['a'] }), 0);
    assert.equal(computeTagOverlap({ tags: ['a'] }, { tags: [] }), 0);
  });

  it('缺少tags属性', () => {
    assert.equal(computeTagOverlap({}, { tags: ['a'] }), 0);
    assert.equal(computeTagOverlap({ tags: ['a'] }, {}), 0);
  });

  it('标签归一化', () => {
    const sim = computeTagOverlap(
      { tags: ['JavaScript', '  REACT  '] },
      { tags: ['javascript', 'react'] },
    );
    assert.equal(sim, 1);
  });

  it('Jaccard 系数计算正确', () => {
    // {a,b} ∩ {b,c} = {b} = 1, union = {a,b,c} = 3
    const sim = computeTagOverlap(
      { tags: ['a', 'b'] },
      { tags: ['b', 'c'] },
    );
    assert.equal(sim, 1 / 3);
  });
});

// ==================== computeCorrelation ====================

describe('computeCorrelation', () => {
  const mockEngine = {
    generateVector: (text) => {
      const vec = new Map();
      for (const word of text.split(/\s+/)) {
        vec.set(word, (vec.get(word) || 0) + 1);
      }
      return vec;
    },
    cosineSimilarity: (a, b) => {
      let dot = 0, normA = 0, normB = 0;
      for (const [k, v] of a) { normA += v * v; if (b.has(k)) dot += v * b.get(k); }
      for (const [, v] of b) { normB += v * v; }
      return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    },
  };

  it('计算关联度', () => {
    const result = computeCorrelation(
      { url: 'https://github.com/repo', title: 'React Guide', tags: ['react'] },
      { sourceUrl: 'https://github.com/repo', title: 'React Guide', question: '', summary: '', tags: ['react'] },
      mockEngine,
    );
    assert.ok(result.total > 0);
    assert.ok(result.urlMatch >= 0);
    assert.ok(result.titleSimilarity >= 0);
    assert.ok(result.tagOverlap >= 0);
    // All fields rounded to 3 decimal places
    assert.equal(String(result.urlMatch).split('.')[1]?.length <= 3 || result.urlMatch === 1, true);
  });

  it('无关联返回低分', () => {
    const result = computeCorrelation(
      { url: 'https://a.com', title: 'X', tags: ['x'] },
      { sourceUrl: 'https://b.com', title: 'Y', question: '', summary: '', tags: ['y'] },
      mockEngine,
    );
    assert.ok(result.total < 0.5);
  });
});
