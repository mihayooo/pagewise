/**
 * 测试 lib/knowledge-packs-utils.js — 知识包工具函数
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACK_FORMAT_VERSION,
  VISIBILITY_LEVELS,
  ANKI_EXPORT_VERSION,
  computeChecksum,
  deepCopy,
  generatePackId,
  compareVersions,
  validateVisibility,
} from '../lib/knowledge-packs-utils.js';

// ==================== 常量 ====================

describe('knowledge-packs-utils constants', () => {
  it('PACK_FORMAT_VERSION 应为 "1.0"', () => {
    assert.equal(PACK_FORMAT_VERSION, '1.0');
  });

  it('VISIBILITY_LEVELS 应包含三个级别', () => {
    assert.deepEqual(VISIBILITY_LEVELS, ['public', 'team', 'private']);
  });

  it('VISIBILITY_LEVELS 应被冻结', () => {
    assert.throws(() => { VISIBILITY_LEVELS.push('test'); });
  });

  it('ANKI_EXPORT_VERSION 应为 "1.0"', () => {
    assert.equal(ANKI_EXPORT_VERSION, '1.0');
  });
});

// ==================== computeChecksum ====================

describe('computeChecksum', () => {
  it('空字符串返回非零校验和', () => {
    const result = computeChecksum('');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('相同输入返回相同校验和', () => {
    assert.equal(computeChecksum('hello'), computeChecksum('hello'));
  });

  it('不同输入返回不同校验和', () => {
    assert.notEqual(computeChecksum('hello'), computeChecksum('world'));
  });

  it('非字符串输入返回 "0"', () => {
    assert.equal(computeChecksum(null), '0');
    assert.equal(computeChecksum(undefined), '0');
    assert.equal(computeChecksum(123), '0');
    assert.equal(computeChecksum({}), '0');
    assert.equal(computeChecksum([]), '0');
  });

  it('长字符串生成有效校验和', () => {
    const long = 'a'.repeat(10000);
    const result = computeChecksum(long);
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});

// ==================== deepCopy ====================

describe('deepCopy', () => {
  it('深拷贝简单对象', () => {
    const obj = { a: 1, b: { c: 2 } };
    const copy = deepCopy(obj);
    assert.deepEqual(copy, obj);
    assert.notEqual(copy, obj);
    assert.notEqual(copy.b, obj.b);
  });

  it('深拷贝数组', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const copy = deepCopy(arr);
    assert.deepEqual(copy, arr);
    assert.notEqual(copy[1], arr[1]);
  });

  it('深拷贝 null', () => {
    assert.equal(deepCopy(null), null);
  });

  it('深拷贝基本类型', () => {
    assert.equal(deepCopy(42), 42);
    assert.equal(deepCopy('str'), 'str');
  });
});

// ==================== generatePackId ====================

describe('generatePackId', () => {
  it('生成包含 kp- 前缀的 ID', () => {
    const id = generatePackId(() => 12345);
    assert.ok(id.startsWith('kp-12345-'));
  });

  it('使用传入的 nowFn 获取时间戳', () => {
    let called = false;
    generatePackId(() => { called = true; return 0; });
    assert.ok(called);
  });

  it('生成的 ID 格式正确', () => {
    const id = generatePackId(() => 999);
    const parts = id.split('-');
    assert.equal(parts[0], 'kp');
    assert.equal(parts[1], '999');
    assert.equal(parts[2].length, 6); // random part
  });
});

// ==================== compareVersions ====================

describe('compareVersions', () => {
  it('相同版本返回 0', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });

  it('v1 > v2 返回 1 (major)', () => {
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
  });

  it('v1 < v2 返回 -1 (major)', () => {
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('比较 minor 版本', () => {
    assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
    assert.equal(compareVersions('1.1.0', '1.2.0'), -1);
  });

  it('比较 patch 版本', () => {
    assert.equal(compareVersions('1.0.2', '1.0.1'), 1);
    assert.equal(compareVersions('1.0.1', '1.0.2'), -1);
  });

  it('长度不等的版本号', () => {
    assert.equal(compareVersions('1.0', '1.0.0'), 0);
    assert.equal(compareVersions('1', '1.0.0'), 0);
  });

  it('数值字符串版本', () => {
    assert.equal(compareVersions(1, 1), 0);
  });
});

// ==================== validateVisibility ====================

describe('validateVisibility', () => {
  it('有效值不抛异常', () => {
    assert.doesNotThrow(() => validateVisibility('public'));
    assert.doesNotThrow(() => validateVisibility('team'));
    assert.doesNotThrow(() => validateVisibility('private'));
  });

  it('无效值抛异常', () => {
    assert.throws(() => validateVisibility('invalid'));
    assert.throws(() => validateVisibility(''));
    assert.throws(() => validateVisibility(null));
  });
});
