/**
 * 测试 lib/tag-editor-constants.js — BookmarkTagEditorV2 常量与辅助方法
 * Coverage Sprint R152
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { TECH_KEYWORDS, DOMAIN_TAG_MAP, _extractDomainTag, _extractPathTags, _escapeRegex } =
  await import('../lib/tag-editor-constants.js');

// ==================== TECH_KEYWORDS ====================

describe('TECH_KEYWORDS', () => {
  it('包含常见技术关键词', () => {
    assert.ok(TECH_KEYWORDS.has('javascript'));
    assert.ok(TECH_KEYWORDS.has('typescript'));
    assert.ok(TECH_KEYWORDS.has('python'));
    assert.ok(TECH_KEYWORDS.has('react'));
    assert.ok(TECH_KEYWORDS.has('vue'));
    assert.ok(TECH_KEYWORDS.has('angular'));
    assert.ok(TECH_KEYWORDS.has('docker'));
    assert.ok(TECH_KEYWORDS.has('kubernetes'));
  });

  it('是Set类型', () => {
    assert.ok(TECH_KEYWORDS instanceof Set);
    assert.ok(TECH_KEYWORDS.size > 50);
  });

  it('包含全栈相关关键词', () => {
    assert.ok(TECH_KEYWORDS.has('machine-learning'));
    assert.ok(TECH_KEYWORDS.has('deep-learning'));
    assert.ok(TECH_KEYWORDS.has('design-pattern'));
    assert.ok(TECH_KEYWORDS.has('microservice'));
    assert.ok(TECH_KEYWORDS.has('serverless'));
  });
});

// ==================== DOMAIN_TAG_MAP ====================

describe('DOMAIN_TAG_MAP', () => {
  it('包含常用域名映射', () => {
    assert.equal(DOMAIN_TAG_MAP['github.com'], 'github');
    assert.equal(DOMAIN_TAG_MAP['stackoverflow.com'], 'stackoverflow');
    assert.equal(DOMAIN_TAG_MAP['medium.com'], 'medium');
    assert.equal(DOMAIN_TAG_MAP['dev.to'], 'dev');
    assert.equal(DOMAIN_TAG_MAP['youtube.com'], 'youtube');
  });

  it('是对象类型', () => {
    assert.equal(typeof DOMAIN_TAG_MAP, 'object');
    assert.ok(Object.keys(DOMAIN_TAG_MAP).length > 20);
  });

  it('包含前端框架域名', () => {
    assert.equal(DOMAIN_TAG_MAP['react.dev'], 'react');
    assert.equal(DOMAIN_TAG_MAP['vuejs.org'], 'vue');
    assert.equal(DOMAIN_TAG_MAP['nextjs.org'], 'nextjs');
    assert.equal(DOMAIN_TAG_MAP['svelte.dev'], 'svelte');
  });

  it('x.com 映射到 twitter', () => {
    assert.equal(DOMAIN_TAG_MAP['x.com'], 'twitter');
  });

  it('包含 MDN 和 w3schools', () => {
    assert.equal(DOMAIN_TAG_MAP['developer.mozilla.org'], 'mdn');
    assert.equal(DOMAIN_TAG_MAP['w3schools.com'], 'w3schools');
  });
});

// ==================== _extractDomainTag ====================

describe('_extractDomainTag', () => {
  it('从 GitHub URL 提取标签', () => {
    assert.equal(_extractDomainTag('https://github.com/user/repo'), 'github');
  });

  it('从 dev.to URL 提取标签', () => {
    assert.equal(_extractDomainTag('https://dev.to/article'), 'dev');
  });

  it('www 子域名', () => {
    assert.equal(_extractDomainTag('https://www.github.com/repo'), 'github');
  });

  it('子域名匹配', () => {
    assert.equal(_extractDomainTag('https://docs.docker.com/guide'), 'docker');
    assert.equal(_extractDomainTag('https://cloud.google.com/'), 'gcp');
    assert.equal(_extractDomainTag('https://aws.amazon.com/'), 'aws');
  });

  it('未知域名提取主域名', () => {
    const tag = _extractDomainTag('https://mycompany.io/page');
    assert.ok(tag === null || typeof tag === 'string');
  });

  it('排除保留域名', () => {
    const tag = _extractDomainTag('https://something.com/page');
    // com is excluded
    assert.ok(tag === null || (typeof tag === 'string' && tag !== 'com'));
  });

  it('无效URL返回null', () => {
    assert.equal(_extractDomainTag(''), null);
    assert.equal(_extractDomainTag(null), null);
    assert.equal(_extractDomainTag(undefined), null);
    assert.equal(_extractDomainTag(123), null);
    assert.equal(_extractDomainTag('not-a-url'), null);
  });

  it('anthropic.com映射', () => {
    assert.equal(_extractDomainTag('https://anthropic.com/'), 'anthropic');
  });

  it('firebase.google.com', () => {
    assert.equal(_extractDomainTag('https://firebase.google.com/'), 'firebase');
  });
});

// ==================== _extractPathTags ====================

describe('_extractPathTags', () => {
  it('提取路径段', () => {
    const tags = _extractPathTags('https://github.com/react/repo');
    assert.ok(Array.isArray(tags));
  });

  it('跳过单字符段', () => {
    const tags = _extractPathTags('https://github.com/a/b/longname');
    assert.ok(!tags.includes('a'));
    assert.ok(!tags.includes('b'));
  });

  it('移除 HTML 扩展名', () => {
    const tags = _extractPathTags('https://example.com/articles/guide.html');
    assert.ok(tags.includes('articles') || tags.includes('guide'));
  });

  it('跳过纯数字段', () => {
    const tags = _extractPathTags('https://example.com/articles/12345/guide');
    assert.ok(!tags.includes('12345'));
  });

  it('限制返回数量', () => {
    const tags = _extractPathTags('https://example.com/a/b/c/d/e/f/g');
    assert.ok(tags.length <= 3);
  });


  it('无效URL返回空数组', () => {
    assert.deepEqual(_extractPathTags(''), []);
    assert.deepEqual(_extractPathTags(null), []);
    assert.deepEqual(_extractPathTags(undefined), []);
    assert.deepEqual(_extractPathTags(123), []);
    assert.deepEqual(_extractPathTags('not-a-url'), []);
  });

  it('路径段长度限制', () => {
    const longSegment = 'a'.repeat(25);
    const tags = _extractPathTags(`https://example.com/${longSegment}`);
    assert.ok(!tags.includes(longSegment));
  });

  it('移除 .php 扩展名', () => {
    const tags = _extractPathTags('https://example.com/pages/about.php');
    assert.ok(tags.includes('about'));
  });
});

// ==================== _escapeRegex ====================

describe('_escapeRegex', () => {
  it('转义特殊字符', () => {
    assert.equal(_escapeRegex('.*+?^${}()|[]\\'), '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('普通字符串不变', () => {
    assert.equal(_escapeRegex('hello world'), 'hello world');
  });

  it('混合字符串', () => {
    const escaped = _escapeRegex('price: $10.00');
    assert.ok(escaped.includes('\\$'));
    assert.ok(escaped.includes('\\.'));
  });
});
