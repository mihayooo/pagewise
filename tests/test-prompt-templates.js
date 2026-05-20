/**
 * 测试 lib/prompt-templates.js — Prompt 模板库
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';

installChromeMock();
const {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  renderTemplate,
  getBuiltinTemplates,
  BUILTIN_TEMPLATES,
  MAX_CUSTOM_TEMPLATES,
  STORAGE_KEY,
} = await import('../lib/prompt-templates.js');

let chrome;

beforeEach(() => {
  chrome = resetChromeMock();
  installChromeMock();
});

// ==================== getBuiltinTemplates ====================

describe('getBuiltinTemplates', () => {
  it('返回内置模板数组', () => {
    const builtins = getBuiltinTemplates();
    assert.ok(Array.isArray(builtins));
    assert.ok(builtins.length > 0);
  });

  it('所有内置模板标记 isBuiltin: true', () => {
    for (const tpl of getBuiltinTemplates()) {
      assert.equal(tpl.isBuiltin, true);
    }
  });

  it('返回副本而非原数组', () => {
    const a = getBuiltinTemplates();
    const b = getBuiltinTemplates();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});

// ==================== getAllTemplates ====================

describe('getAllTemplates', () => {
  it('返回内置 + 自定义模板', async () => {
    const all = await getAllTemplates();
    assert.ok(all.length >= BUILTIN_TEMPLATES.length);
  });

  it('内置模板在前', async () => {
    const all = await getAllTemplates();
    for (let i = 0; i < BUILTIN_TEMPLATES.length; i++) {
      assert.equal(all[i].id, BUILTIN_TEMPLATES[i].id);
    }
  });
});

// ==================== saveTemplate ====================

describe('saveTemplate', () => {
  it('新建自定义模板', async () => {
    const tpl = await saveTemplate({ name: '测试', content: 'hello {{name}}' });
    assert.ok(tpl.id.startsWith('tpl_'));
    assert.equal(tpl.name, '测试');
    assert.equal(tpl.isBuiltin, false);
    assert.equal(tpl.category, 'custom');
  });

  it('指定 category', async () => {
    const tpl = await saveTemplate({ name: 'T', content: 'C', category: 'mycat' });
    assert.equal(tpl.category, 'mycat');
  });

  it('更新已有模板', async () => {
    const created = await saveTemplate({ name: 'Old', content: 'old' });
    const updated = await saveTemplate({ id: created.id, name: 'New', content: 'new' });
    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'New');
  });

  it('更新不存在的模板抛错', async () => {
    await assert.rejects(
      () => saveTemplate({ id: 'nonexistent', name: 'X', content: 'Y' }),
      { message: '模板不存在' }
    );
  });

  it('超过上限抛错', async () => {
    // 填满到上限
    for (let i = 0; i < MAX_CUSTOM_TEMPLATES; i++) {
      await saveTemplate({ name: `tpl${i}`, content: `c${i}` });
    }
    await assert.rejects(
      () => saveTemplate({ name: 'overflow', content: 'x' }),
      { message: /上限/ }
    );
  });
});

// ==================== deleteTemplate ====================

describe('deleteTemplate', () => {
  it('删除自定义模板', async () => {
    const tpl = await saveTemplate({ name: 'ToDelete', content: 'bye' });
    await deleteTemplate(tpl.id);
    const all = await getAllTemplates();
    assert.ok(!all.find(t => t.id === tpl.id));
  });

  it('删除内置模板抛错', async () => {
    await assert.rejects(
      () => deleteTemplate(BUILTIN_TEMPLATES[0].id),
      { message: '内置模板不可删除' }
    );
  });

  it('删除不存在的模板抛错', async () => {
    await assert.rejects(
      () => deleteTemplate('nonexistent'),
      { message: '模板不存在' }
    );
  });
});

// ==================== renderTemplate ====================

describe('renderTemplate', () => {
  it('渲染内置模板并替换变量', async () => {
    const builtins = getBuiltinTemplates();
    const codeTpl = builtins.find(t => t.id === 'tpl_builtin_code_review');
    const result = await renderTemplate(codeTpl.id, { code: 'console.log(1)' });
    assert.match(result, /console\.log\(1\)/);
    assert.ok(!result.includes('{{code}}'));
  });

  it('渲染不存在的模板抛错', async () => {
    await assert.rejects(
      () => renderTemplate('nonexistent'),
      { message: '模板不存在' }
    );
  });

  it('未提供的变量保持原样', async () => {
    const builtins = getBuiltinTemplates();
    const codeTpl = builtins.find(t => t.id === 'tpl_builtin_code_review');
    const result = await renderTemplate(codeTpl.id, {});
    assert.match(result, /\{\{code\}\}/);
  });

  it('null 变量值替换为空字符串', async () => {
    const tpl = await saveTemplate({ name: 'V', content: 'Hello {{name}}!' });
    const result = await renderTemplate(tpl.id, { name: null });
    assert.equal(result, 'Hello !');
  });
});
