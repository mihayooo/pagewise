/**
 * Unit tests for lib/sanitize.js — 输入安全加固 InputSanitization
 *
 * R111: 统一用户输入净化层
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  escapeHtmlAttr,
  sanitizeUrl,
  escapeSearchQuery,
  truncate,
  sanitizeBookmarkTitle,
  sanitizeTag,
} from '../lib/sanitize.js';

// ============================================================
// escapeHtml — HTML 实体编码 (XSS 防护)
// ============================================================
describe('escapeHtml', () => {
  it('应转义 & 为 &amp;', () => {
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
  });

  it('应转义 < 为 &lt;', () => {
    assert.equal(escapeHtml('a<b'), 'a&lt;b');
  });

  it('应转义 > 为 &gt;', () => {
    assert.equal(escapeHtml('a>b'), 'a&gt;b');
  });

  it('应转义 " 为 &quot;', () => {
    assert.equal(escapeHtml('a"b'), 'a&quot;b');
  });

  it("应转义 ' 为 &#39;", () => {
    assert.equal(escapeHtml("a'b"), 'a&#39;b');
  });

  it('应处理多种特殊字符组合', () => {
    const input = '<script>alert("xss")</script>';
    const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    assert.equal(escapeHtml(input), expected);
  });

  it('应处理空字符串', () => {
    assert.equal(escapeHtml(''), '');
  });

  it('应处理 null/undefined 为安全空字符串', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  it('应处理非字符串类型', () => {
    assert.equal(escapeHtml(123), '123');
    assert.equal(escapeHtml(true), 'true');
  });

  it('不应转义普通文本', () => {
    assert.equal(escapeHtml('Hello World 你好'), 'Hello World 你好');
  });

  it('应处理已经是实体编码的输入（不双重编码 &amp;）', () => {
    // 注意: &amp; 中的 & 仍会被编码为 &amp;amp; 这是安全行为
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
  });
});

// ============================================================
// escapeHtmlAttr — HTML 属性值编码
// ============================================================
describe('escapeHtmlAttr', () => {
  it('应与 escapeHtml 编码结果一致', () => {
    const input = '<div class="test">it\'s</div>';
    assert.equal(escapeHtmlAttr(input), escapeHtml(input));
  });

  it('应处理空/null/undefined', () => {
    assert.equal(escapeHtmlAttr(''), '');
    assert.equal(escapeHtmlAttr(null), '');
    assert.equal(escapeHtmlAttr(undefined), '');
  });

  it('应转义属性注入 payload', () => {
    const input = '" onmouseover="alert(1)"';
    assert.ok(!escapeHtmlAttr(input).includes('"'));
  });
});

// ============================================================
// sanitizeUrl — URL 校验 (http/https 仅允许, javascript: 拦截)
// ============================================================
describe('sanitizeUrl', () => {
  it('应允许 http:// URL', () => {
    assert.equal(sanitizeUrl('http://example.com'), 'http://example.com');
  });

  it('应允许 https:// URL', () => {
    assert.equal(sanitizeUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  });

  it('应拦截 javascript: URL（全小写）', () => {
    assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  });

  it('应拦截 JavaScript: URL（混合大小写）', () => {
    assert.equal(sanitizeUrl('JaVaScRiPt:alert(1)'), '');
  });

  it('应拦截 javascript: URL（带前导空白）', () => {
    assert.equal(sanitizeUrl('  javascript:alert(1)'), '');
  });

  it('应拦截 javascript: URL（带制表符/换行）', () => {
    assert.equal(sanitizeUrl('\t\njavascript:alert(1)'), '');
  });

  it('应拦截 data: URL', () => {
    assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
  });

  it('应拦截 vbscript: URL', () => {
    assert.equal(sanitizeUrl('vbscript:msgbox'), '');
  });

  it('空/null/undefined 应返回空字符串', () => {
    assert.equal(sanitizeUrl(''), '');
    assert.equal(sanitizeUrl(null), '');
    assert.equal(sanitizeUrl(undefined), '');
  });

  it('应允许相对 URL', () => {
    assert.equal(sanitizeUrl('/path/to/page'), '/path/to/page');
  });

  it('应允许锚点 URL', () => {
    assert.equal(sanitizeUrl('#section'), '#section');
  });

  it('应允许 mailto: URL', () => {
    assert.equal(sanitizeUrl('mailto:user@example.com'), 'mailto:user@example.com');
  });

  it('应允许 file: URL（Chrome 扩展可能需要）', () => {
    assert.equal(sanitizeUrl('file:///path/to/file'), 'file:///path/to/file');
  });

  it('应拦截非协议字符串开头的危险模式', () => {
    assert.equal(sanitizeUrl('jAvAsCrIpT:void(0)'), '');
  });

  it('应保留 URL 中的特殊字符', () => {
    const url = 'https://example.com/path?q=hello+world&lang=zh-CN#top';
    assert.equal(sanitizeUrl(url), url);
  });
});

// ============================================================
// escapeSearchQuery — 搜索注入防护 (特殊字符转义)
// ============================================================
describe('escapeSearchQuery', () => {
  it('应转义正则特殊字符', () => {
    const input = 'test.*+?^${}()|[]\\';
    const escaped = escapeSearchQuery(input);
    // 转义后不应包含未转义的特殊字符
    assert.ok(!escaped.includes('.*'));
    assert.ok(escaped.includes('\\.'));
  });

  it('应转义 HTML 特殊字符', () => {
    const input = '<script>alert("xss")</script>';
    const escaped = escapeSearchQuery(input);
    assert.ok(!escaped.includes('<script>'));
  });

  it('应保留普通文本', () => {
    assert.equal(escapeSearchQuery('hello world'), 'hello world');
  });

  it('应处理空/null/undefined', () => {
    assert.equal(escapeSearchQuery(''), '');
    assert.equal(escapeSearchQuery(null), '');
    assert.equal(escapeSearchQuery(undefined), '');
  });

  it('应转义反斜杠', () => {
    assert.ok(escapeSearchQuery('a\\b').includes('\\\\'));
  });

  it('应处理中文查询', () => {
    assert.equal(escapeSearchQuery('你好世界'), '你好世界');
  });

  it('应转义引号防止注入', () => {
    const escaped = escapeSearchQuery('it\'s a "test"');
    assert.ok(!escaped.includes('"'));
  });
});

// ============================================================
// truncate — 截断
// ============================================================
describe('truncate', () => {
  it('短于限制的文本不截断', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });

  it('超长文本应截断并添加后缀', () => {
    // maxLen=5, suffix='...' (3 chars) → 2 chars content + '...' = 'he...'
    assert.equal(truncate('hello world', 5), 'he...');
  });

  it('正好等于限制的文本不截断', () => {
    assert.equal(truncate('hello', 5), 'hello');
  });

  it('应支持自定义后缀', () => {
    // maxLen=5, suffix='…' (1 char) → 4 chars content + '…' = 'hell…'
    assert.equal(truncate('hello world', 5, '…'), 'hell…');
  });

  it('应处理空/null/undefined', () => {
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), '');
    assert.equal(truncate(undefined, 10), '');
  });

  it('maxLen 为 0 应返回空字符串', () => {
    assert.equal(truncate('hello', 0), '');
  });

  it('maxLen 为负数应返回空字符串', () => {
    assert.equal(truncate('hello', -1), '');
  });
});

// ============================================================
// sanitizeBookmarkTitle — 书签标题长度限制
// ============================================================
describe('sanitizeBookmarkTitle', () => {
  it('应保持正常标题不变', () => {
    assert.equal(sanitizeBookmarkTitle('My Bookmark'), 'My Bookmark');
  });

  it('应去除首尾空白', () => {
    assert.equal(sanitizeBookmarkTitle('  hello  '), 'hello');
  });

  it('应截断超长标题（默认 200 字符）', () => {
    const long = 'a'.repeat(300);
    const result = sanitizeBookmarkTitle(long);
    assert.ok(result.length <= 200);
    assert.ok(result.endsWith('...'));
  });

  it('应支持自定义最大长度', () => {
    const result = sanitizeBookmarkTitle('a'.repeat(20), 10);
    assert.ok(result.length <= 10);
  });

  it('空/null/undefined 应返回空字符串', () => {
    assert.equal(sanitizeBookmarkTitle(''), '');
    assert.equal(sanitizeBookmarkTitle(null), '');
    assert.equal(sanitizeBookmarkTitle(undefined), '');
  });

  it('应转义 HTML 特殊字符', () => {
    const result = sanitizeBookmarkTitle('<b>bold</b>');
    assert.ok(!result.includes('<b>'));
    assert.ok(result.includes('&lt;'));
  });
});

// ============================================================
// sanitizeTag — 标签净化
// ============================================================
describe('sanitizeTag', () => {
  it('应去除首尾空白', () => {
    assert.equal(sanitizeTag('  javascript  '), 'javascript');
  });

  it('应转换为小写', () => {
    assert.equal(sanitizeTag('JavaScript'), 'javascript');
  });

  it('应截断超长标签（默认 50 字符）', () => {
    const long = 'a'.repeat(60);
    const result = sanitizeTag(long);
    assert.ok(result.length <= 50);
  });

  it('应去除不安全字符', () => {
    const result = sanitizeTag('tag<script>');
    assert.ok(!result.includes('<'));
    assert.ok(!result.includes('>'));
  });

  it('应保留连字符和下划线', () => {
    assert.equal(sanitizeTag('my-tag_name'), 'my-tag_name');
  });

  it('应保留中文标签', () => {
    assert.equal(sanitizeTag('机器学习'), '机器学习');
  });

  it('空/null/undefined 应返回空字符串', () => {
    assert.equal(sanitizeTag(''), '');
    assert.equal(sanitizeTag(null), '');
    assert.equal(sanitizeTag(undefined), '');
  });

  it('纯空白字符串应返回空字符串', () => {
    assert.equal(sanitizeTag('   '), '');
  });
});

// ============================================================
// 边界 & 安全综合测试
// ============================================================
describe('综合安全测试', () => {
  it('XSS payload: <img onerror=alert(1) src=x>', () => {
    const escaped = escapeHtml('<img onerror=alert(1) src=x>');
    assert.ok(!escaped.includes('<img'));
    assert.ok(escaped.includes('&lt;'));
  });

  it('XSS payload: javascript:void(0) URL', () => {
    assert.equal(sanitizeUrl('javascript:void(0)'), '');
  });

  it('XSS payload: data URI', () => {
    assert.equal(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), '');
  });

  it('搜索注入: 正则 DoS (ReDoS) 字符串安全', () => {
    const evil = '(a+)+'.repeat(10);
    const result = escapeSearchQuery(evil);
    assert.ok(result.length > 0);
    // 不应抛出异常
  });

  it('Unicode 安全: emoji 和特殊 Unicode', () => {
    const input = '🎉🚀💻 <test>';
    const escaped = escapeHtml(input);
    assert.ok(escaped.includes('🎉'));
    assert.ok(!escaped.includes('<test>'));
  });
});
