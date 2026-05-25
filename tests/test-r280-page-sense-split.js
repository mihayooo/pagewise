/**
 * 测试 R280 拆分模块 — page-sense-context.js & page-sense-dom.js
 *
 * 覆盖场景:
 *   1-5:   ContextExtractor — extractEndpoints
 *   6-10:  ContextExtractor — isGitHubRepoPage / detectGitHubPageType
 *   11-15: ContextExtractor — extractRepoInfo / extractErrors
 *   16-20: PageSenseDom — analyze / toPrompt / suggestSkills
 *   21-25: PageSense 向后兼容性
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ContextExtractor } from '../lib/page-sense-context.js';
import { PageSenseDom } from '../lib/page-sense-dom.js';
import { PageSense } from '../lib/page-sense.js';

// ==================== ContextExtractor ====================

describe('ContextExtractor extractEndpoints', () => {
  let ce;
  beforeEach(() => { ce = new ContextExtractor(); });

  it('1. 提取 GET/POST/PUT/DELETE 端点', () => {
    const endpoints = ce.extractEndpoints('GET /api/users\nPOST /api/items\nPUT /api/items/1');
    assert.ok(endpoints.length >= 3, `应提取到至少 3 个端点，实际 ${endpoints.length}`);
  });

  it('2. 提取带路径参数的端点', () => {
    const endpoints = ce.extractEndpoints('GET /api/users/{userId}/posts/{postId}');
    assert.ok(endpoints.some(e => e.includes('{userId}')));
  });

  it('3. 提取反引号包裹的 API 路径', () => {
    const endpoints = ce.extractEndpoints('使用 `/api/v2/data` 端点');
    assert.ok(endpoints.some(e => e.includes('/api/v2/data')));
  });

  it('4. 空内容返回空数组', () => {
    assert.deepEqual(ce.extractEndpoints(''), []);
    assert.deepEqual(ce.extractEndpoints(null), []);
    assert.deepEqual(ce.extractEndpoints(undefined), []);
  });

  it('5. 去重处理', () => {
    const endpoints = ce.extractEndpoints('GET /api/users\nGET /api/users');
    const unique = endpoints.filter(e => e.includes('GET /api/users'));
    assert.equal(unique.length, 1, '应去重');
  });
});

describe('ContextExtractor isGitHubRepoPage', () => {
  let ce;
  beforeEach(() => { ce = new ContextExtractor(); });

  it('6. 识别 GitHub 仓库根页面', () => {
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo'));
    assert.ok(ce.isGitHubRepoPage('https://github.com/facebook/react'));
  });

  it('7. 识别仓库子页面', () => {
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo/issues'));
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo/pull/42'));
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo/wiki'));
  });

  it('8. 不匹配非仓库页面', () => {
    assert.ok(!ce.isGitHubRepoPage('https://github.com/user'));
    assert.ok(!ce.isGitHubRepoPage('https://github.com/explore'));
    assert.ok(!ce.isGitHubRepoPage('https://example.com/repo'));
    assert.ok(!ce.isGitHubRepoPage(''));
    assert.ok(!ce.isGitHubRepoPage(null));
  });

  it('9. 带尾部斜杠的仓库根页面', () => {
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo/'));
  });

  it('10. HTTP 和 HTTPS 都识别', () => {
    assert.ok(ce.isGitHubRepoPage('http://github.com/user/repo'));
    assert.ok(ce.isGitHubRepoPage('https://github.com/user/repo'));
  });
});

describe('ContextExtractor detectGitHubPageType & extractRepoInfo & extractErrors', () => {
  let ce;
  beforeEach(() => { ce = new ContextExtractor(); });

  it('11. detectGitHubPageType 正确分类', () => {
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo'), 'repo-root');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/issues/42'), 'repo-issues');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/pull/7'), 'repo-pr');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/blob/main/README.md'), 'repo-file');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/tree/dev'), 'repo-file');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/wiki'), 'repo-wiki');
    assert.equal(ce.detectGitHubPageType('https://github.com/user/repo/releases'), 'repo-releases');
  });

  it('12. detectGitHubPageType 空/null 返回 unknown', () => {
    assert.equal(ce.detectGitHubPageType(''), 'unknown');
    assert.equal(ce.detectGitHubPageType(null), 'unknown');
    assert.equal(ce.detectGitHubPageType(undefined), 'unknown');
  });

  it('13. extractRepoInfo 提取 owner/repo', () => {
    const info = ce.extractRepoInfo('https://github.com/facebook/react');
    assert.equal(info.owner, 'facebook');
    assert.equal(info.repo, 'react');
  });

  it('13b. extractRepoInfo 支持 GitLab/Gitee', () => {
    const gl = ce.extractRepoInfo('https://gitlab.com/group/project');
    assert.equal(gl.owner, 'group');
    assert.equal(gl.repo, 'project');
  });

  it('14. extractRepoInfo 无匹配返回空对象', () => {
    assert.deepEqual(ce.extractRepoInfo('https://example.com'), {});
    assert.deepEqual(ce.extractRepoInfo(null), {});
  });

  it('15. extractErrors 提取错误信息', () => {
    const errors = ce.extractErrors('Error: Cannot find module xyz\nTypeError: undefined is not a function');
    assert.ok(errors.length >= 1);
  });

  it('15b. extractErrors 空/null 返回空数组', () => {
    assert.deepEqual(ce.extractErrors(''), []);
    assert.deepEqual(ce.extractErrors(null), []);
  });
});

// ==================== PageSenseDom ====================

describe('PageSenseDom 分析器与核心逻辑', () => {
  let psd;
  beforeEach(() => { psd = new PageSenseDom(); });

  it('16. 注册了默认分析器', () => {
    assert.ok(psd.analyzers.length >= 8, '应有至少 8 个默认分析器');
  });

  it('17. register 可添加自定义分析器', () => {
    const count = psd.analyzers.length;
    psd.register({ id: 'custom', detect: () => false, extract: () => ({}) });
    assert.equal(psd.analyzers.length, count + 1);
  });

  it('18. analyze 返回正确的结构', () => {
    const result = psd.analyze({ url: 'https://github.com/user/repo', content: '' });
    assert.ok(Array.isArray(result.types));
    assert.ok(result.primaryType);
    assert.ok(typeof result.summary === 'string');
  });

  it('19. analyze 识别 API 文档', () => {
    const result = psd.analyze({ url: 'https://api.example.com/docs/users', content: '' });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('20. toPrompt 无匹配返回空字符串', () => {
    const prompt = psd.toPrompt({ url: 'https://example.com/', content: '' });
    assert.equal(prompt, '');
  });

  it('20b. toPrompt 有匹配返回感知结果', () => {
    const prompt = psd.toPrompt({ url: 'https://github.com/user/repo', content: '' });
    assert.ok(prompt.includes('页面感知结果'));
    assert.ok(prompt.includes('代码仓库'));
  });
});

// ==================== PageSense 向后兼容 ====================

describe('PageSense 向后兼容性', () => {
  let ps;
  beforeEach(() => { ps = new PageSense(); });

  it('21. PageSense 实例是 ContextExtractor 子类', () => {
    assert.ok(ps instanceof ContextExtractor);
  });

  it('22. PageSense 实例是 PageSenseDom 子类', () => {
    assert.ok(ps instanceof PageSenseDom);
  });

  it('23. PageSense 可调用 extractEndpoints', () => {
    const endpoints = ps.extractEndpoints('GET /api/users');
    assert.ok(endpoints.length >= 1);
  });

  it('24. PageSense 可调用 isGitHubRepoPage', () => {
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo'));
  });

  it('25. PageSense 有 HTML 提取方法', () => {
    assert.ok(typeof ps.extractContent === 'function');
    assert.ok(typeof ps.extractImages === 'function');
    assert.ok(typeof ps.extractMetadata === 'function');
    assert.ok(typeof ps.extractHeadings === 'function');
  });
});
