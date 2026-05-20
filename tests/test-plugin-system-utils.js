/**
 * 测试 lib/plugin-system-utils.js — 插件系统工具函数
 * R222: CoverageBreak50
 *
 * 仅测试纯逻辑函数 (parseVersion, compareVersions, satisfiesVersion, validatePlugin)
 * IndexedDB 依赖的 PluginRegistry 需要集成环境，此处不覆盖
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validatePlugin,
  PluginRegistry,
} from '../lib/plugin-system-utils.js';

// ==================== parseVersion ====================

describe('parseVersion', () => {
  it('解析标准 semver', () => {
    const v = parseVersion('1.2.3');
    assert.equal(v.major, 1);
    assert.equal(v.minor, 2);
    assert.equal(v.patch, 3);
    assert.equal(v.prerelease, '');
  });

  it('解析带 prerelease 的版本', () => {
    const v = parseVersion('1.0.0-beta.1');
    assert.equal(v.major, 1);
    assert.equal(v.minor, 0);
    assert.equal(v.patch, 0);
    assert.equal(v.prerelease, 'beta.1');
  });

  it('null 输入抛异常', () => {
    assert.throws(() => parseVersion(null));
  });

  it('空字符串抛异常', () => {
    assert.throws(() => parseVersion(''));
  });

  it('非字符串输入抛异常', () => {
    assert.throws(() => parseVersion(123));
  });

  it('无效格式抛异常', () => {
    assert.throws(() => parseVersion('abc'));
    assert.throws(() => parseVersion('1.2'));
    assert.throws(() => parseVersion('v1.2.3'));
  });
});

// ==================== compareVersions ====================

describe('compareVersions', () => {
  it('相同版本返回 0', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });

  it('major 不同', () => {
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('minor 不同', () => {
    assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
    assert.equal(compareVersions('1.1.0', '1.2.0'), -1);
  });

  it('patch 不同', () => {
    assert.equal(compareVersions('1.0.2', '1.0.1'), 1);
    assert.equal(compareVersions('1.0.1', '1.0.2'), -1);
  });

  it('prerelease 小于正式版', () => {
    assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1);
    assert.equal(compareVersions('1.0.0', '1.0.0-beta'), 1);
  });

  it('prerelease 按字典序比较', () => {
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
    assert.equal(compareVersions('1.0.0-beta', '1.0.0-alpha'), 1);
  });
});

// ==================== satisfiesVersion ====================

describe('satisfiesVersion', () => {
  it('null/空 range 返回 true', () => {
    assert.equal(satisfiesVersion('1.0.0', null), true);
    assert.equal(satisfiesVersion('1.0.0', ''), true);
    assert.equal(satisfiesVersion('1.0.0', undefined), true);
  });

  it('精确匹配', () => {
    assert.equal(satisfiesVersion('1.0.0', '1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.1', '1.0.0'), false);
  });

  it('^ 范围 (兼容)', () => {
    assert.equal(satisfiesVersion('1.0.0', '^1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.1', '^1.0.0'), true);
    assert.equal(satisfiesVersion('2.0.0', '^1.0.0'), false);
  });

  it('^ 范围 minor 不同', () => {
    // Implementation: ^ requires same major; if minor differs, must be > base minor
    assert.equal(satisfiesVersion('1.1.0', '^1.0.0'), true);
    assert.equal(satisfiesVersion('0.2.0', '^1.0.0'), false);
  });

  it('~ 范围', () => {
    assert.equal(satisfiesVersion('1.0.0', '~1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.1', '~1.0.0'), true);
    assert.equal(satisfiesVersion('0.9.0', '~1.0.0'), false);
  });

  it('>= 范围', () => {
    assert.equal(satisfiesVersion('2.0.0', '>=1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.0', '>=1.0.0'), true);
    assert.equal(satisfiesVersion('0.9.0', '>=1.0.0'), false);
  });
});

// ==================== validatePlugin ====================

describe('validatePlugin', () => {
  const validPlugin = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    prompt: 'Do something useful',
    description: 'A plugin',
    author: 'Test',
    tags: ['test'],
  };

  it('有效插件返回 valid: true', () => {
    const r = validatePlugin(validPlugin);
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
  });

  it('null manifest 返回无效', () => {
    const r = validatePlugin(null);
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes('manifest'));
  });

  it('非对象 manifest 返回无效', () => {
    assert.equal(validatePlugin('str').valid, false);
    assert.equal(validatePlugin(123).valid, false);
  });

  it('缺少 id', () => {
    const r = validatePlugin({ ...validPlugin, id: undefined });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('id')));
  });

  it('id 格式无效', () => {
    const r = validatePlugin({ ...validPlugin, id: '!!!invalid' });
    assert.equal(r.valid, false);
  });

  it('缺少 name', () => {
    const r = validatePlugin({ ...validPlugin, name: undefined });
    assert.equal(r.valid, false);
  });

  it('缺少 version', () => {
    const r = validatePlugin({ ...validPlugin, version: undefined });
    assert.equal(r.valid, false);
  });

  it('无效 version 格式', () => {
    const r = validatePlugin({ ...validPlugin, version: 'abc' });
    assert.equal(r.valid, false);
  });

  it('缺少 prompt', () => {
    const r = validatePlugin({ ...validPlugin, prompt: undefined });
    assert.equal(r.valid, false);
  });

  it('空白 prompt', () => {
    const r = validatePlugin({ ...validPlugin, prompt: '   ' });
    assert.equal(r.valid, false);
  });

  it('license 类型错误', () => {
    const r = validatePlugin({ ...validPlugin, license: 123 });
    assert.equal(r.valid, false);
  });

  it('category 类型错误', () => {
    const r = validatePlugin({ ...validPlugin, category: 123 });
    assert.equal(r.valid, false);
  });

  it('description 类型错误', () => {
    const r = validatePlugin({ ...validPlugin, description: 123 });
    assert.equal(r.valid, false);
  });

  it('author 类型错误', () => {
    const r = validatePlugin({ ...validPlugin, author: 123 });
    assert.equal(r.valid, false);
  });

  it('parameters 非数组', () => {
    const r = validatePlugin({ ...validPlugin, parameters: 'not array' });
    assert.equal(r.valid, false);
  });

  it('parameters 元素非对象', () => {
    const r = validatePlugin({ ...validPlugin, parameters: [123] });
    assert.equal(r.valid, false);
  });

  it('parameters 元素缺少 name', () => {
    const r = validatePlugin({ ...validPlugin, parameters: [{ type: 'string' }] });
    assert.equal(r.valid, false);
  });

  it('parameters 元素 type 类型错误', () => {
    const r = validatePlugin({ ...validPlugin, parameters: [{ name: 'p', type: 123 }] });
    assert.equal(r.valid, false);
  });

  it('dependencies 非对象', () => {
    const r = validatePlugin({ ...validPlugin, dependencies: ['a'] });
    assert.equal(r.valid, false);
  });

  it('dependencies value 非字符串', () => {
    const r = validatePlugin({ ...validPlugin, dependencies: { dep: 123 } });
    assert.equal(r.valid, false);
  });

  it('tags 非数组', () => {
    const r = validatePlugin({ ...validPlugin, tags: 'not array' });
    assert.equal(r.valid, false);
  });

  it('tags 元素非字符串', () => {
    const r = validatePlugin({ ...validPlugin, tags: [123] });
    assert.equal(r.valid, false);
  });

  it('trigger 非对象', () => {
    const r = validatePlugin({ ...validPlugin, trigger: 'not obj' });
    assert.equal(r.valid, false);
  });

  it('trigger 缺少 type', () => {
    const r = validatePlugin({ ...validPlugin, trigger: {} });
    assert.equal(r.valid, false);
  });

  it('缺少可选字段产生 warnings', () => {
    const r = validatePlugin({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      prompt: 'Do it',
    });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.length >= 2); // missing description, author, tags
  });

  it('PluginRegistry 类可导出', () => {
    assert.equal(typeof PluginRegistry, 'function');
  });
});
