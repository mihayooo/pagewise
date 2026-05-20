/**
 * 测试 lib/onboarding.js — 新手引导流程
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createOnboardingModule } from '../lib/onboarding.js';

/** 创建 mock storage (兼容 chrome.storage 风格) */
function createMockStorage(initial = {}) {
  const store = { ...initial };
  function doGet(keys, callback) {
    const result = {};
    if (keys === null || keys === undefined) {
      Object.assign(result, store);
    } else if (typeof keys === 'string') {
      result[keys] = store[keys];
    } else if (Array.isArray(keys)) {
      for (const k of keys) result[k] = store[k];
    } else if (typeof keys === 'object') {
      for (const [k, defaultVal] of Object.entries(keys)) {
        result[k] = store[k] !== undefined ? store[k] : defaultVal;
      }
    }
    const promise = Promise.resolve(result);
    if (callback) callback(result);
    return promise;
  }
  return {
    get: (keys, callback) => doGet(keys, callback),
    set: async (obj) => Object.assign(store, obj),
    remove: async (key) => { delete store[key]; },
    _store: store,
  };
}

let storage, settingsStorage, mod;

beforeEach(() => {
  storage = createMockStorage();
  settingsStorage = createMockStorage({
    apiKey: 'sk-test',
    apiBaseUrl: 'https://api.openai.com',
    model: 'gpt-4',
  });
  mod = _createOnboardingModule(storage, settingsStorage);
});

// ==================== shouldShowOnboarding ====================

describe('shouldShowOnboarding', () => {
  it('首次使用返回 true', async () => {
    assert.equal(await mod.shouldShowOnboarding(), true);
  });

  it('完成后返回 false', async () => {
    await mod.completeOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), false);
  });
});

// ==================== completeOnboarding / resetOnboarding ====================

describe('completeOnboarding & resetOnboarding', () => {
  it('completeOnboarding 设置标记', async () => {
    await mod.completeOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), false);
  });

  it('resetOnboarding 清除标记', async () => {
    await mod.completeOnboarding();
    await mod.resetOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), true);
  });
});

// ==================== getStepConfig / getTotalSteps ====================

describe('getStepConfig & getTotalSteps', () => {
  it('返回 4 个步骤', () => {
    assert.equal(mod.getTotalSteps(), 4);
  });

  it('步骤包含 welcome, config, test-connection, first-question', () => {
    const steps = mod.getStepConfig();
    const ids = steps.map(s => s.id);
    assert.ok(ids.includes('welcome'));
    assert.ok(ids.includes('config'));
    assert.ok(ids.includes('test-connection'));
    assert.ok(ids.includes('first-question'));
  });

  it('返回副本而非原数组', () => {
    const a = mod.getStepConfig();
    const b = mod.getStepConfig();
    assert.notEqual(a, b);
  });
});

// ==================== isAPIConfigured ====================

describe('isAPIConfigured', () => {
  it('API 完整配置返回 true', async () => {
    assert.equal(await mod.isAPIConfigured(), true);
  });

  it('缺少 apiKey 返回 false', async () => {
    settingsStorage = createMockStorage({ apiBaseUrl: 'url', model: 'm' });
    const m = _createOnboardingModule(storage, settingsStorage);
    assert.equal(await m.isAPIConfigured(), false);
  });

  it('无 settingsStorage 返回 false', async () => {
    const m = _createOnboardingModule(storage, null);
    assert.equal(await m.isAPIConfigured(), false);
  });
});

// ==================== getRecommendedSteps ====================

describe('getRecommendedSteps', () => {
  it('API 已配置时跳过 config 和 test-connection', async () => {
    const steps = await mod.getRecommendedSteps();
    const ids = steps.map(s => s.id);
    assert.ok(!ids.includes('config'));
    assert.ok(!ids.includes('test-connection'));
    assert.ok(ids.includes('welcome'));
    assert.ok(ids.includes('first-question'));
  });

  it('API 未配置时显示所有步骤', async () => {
    settingsStorage = createMockStorage({});
    const m = _createOnboardingModule(storage, settingsStorage);
    const steps = await m.getRecommendedSteps();
    assert.equal(steps.length, 4);
  });
});

// ==================== getSampleQuestion / getSampleQuestions ====================

describe('getSampleQuestion & getSampleQuestions', () => {
  it('getSampleQuestions 返回非空数组', () => {
    const qs = mod.getSampleQuestions();
    assert.ok(qs.length > 0);
    assert.ok(qs.every(q => typeof q === 'string'));
  });

  it('getSampleQuestion 返回字符串', () => {
    const q = mod.getSampleQuestion();
    assert.equal(typeof q, 'string');
    assert.ok(q.length > 0);
  });
});
