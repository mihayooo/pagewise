/**
 * R238: 首次体验优化与遥测数据验证 — 集成测试
 *
 * FirstRunExperienceOpt — 覆盖 onboarding → telemetry → feedback 全链路
 *
 * 测试矩阵:
 *   1. Onboarding 触发时机与流程正确性
 *   2. Telemetry 核心动作采集点覆盖验证
 *   3. Feedback-collector 7 天 NPS 计时逻辑
 *   4. Onboarding i18n 中文 locale 完整性
 *   5. First-run 全链路集成
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createOnboardingModule, ONBOARDING_STEP_I18N } from '../lib/onboarding.js';
import { _createTelemetry } from '../lib/telemetry.js';
import { _createFeedbackCollector } from '../lib/feedback-collector.js';
import { _createFirstRun, TELEMETRY_FEATURES, CORE_TELEMETRY_ACTIONS } from '../lib/first-run.js';

// ==================== Mock Storage ====================

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      const result = {};
      if (typeof keys === 'string') {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) result[k] = store[k];
      } else if (typeof keys === 'object' && keys !== null) {
        for (const [k, def] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : def;
        }
      }
      return result;
    },
    async set(obj) { Object.assign(store, obj); },
    async remove(key) { delete store[key]; },
    _store: store,
  };
}

function createMockNotifier() {
  const sent = [];
  return {
    notify(message, type) {
      sent.push({ message, type });
      return { id: `notif-${sent.length}` };
    },
    _sent: sent,
  };
}

/** 模拟 i18n 翻译函数 */
function createMockT(localeData) {
  return (key, params) => {
    let text = localeData[key] || null;
    if (text && params) {
      text = text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
        return params[name] !== undefined ? String(params[name]) : match;
      });
    }
    return text || key;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==================== Test Suite ====================

// --- 1. Onboarding 4 步流程审查 ---

describe('R238-1: Onboarding 触发时机审查', () => {
  it('shouldShowOnboarding: 未完成标记时返回 true（模拟 service worker install → storage 检查）', async () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    // service worker install 后 storage 中无 onboardingCompleted
    assert.equal(await mod.shouldShowOnboarding(), true);
  });

  it('completeOnboarding 后 shouldShowOnboarding 返回 false', async () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    await mod.completeOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), false);
  });

  it('resetOnboarding 后再次触发引导流程', async () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    await mod.completeOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), false);
    await mod.resetOnboarding();
    assert.equal(await mod.shouldShowOnboarding(), true);
  });

  it('4 步向导配置完整: welcome → config → test-connection → first-question', () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    const steps = mod.getStepConfig();
    assert.equal(steps.length, 4);
    const ids = steps.map(s => s.id);
    assert.deepEqual(ids, ['welcome', 'config', 'test-connection', 'first-question']);
  });

  it('API 已配置时自动跳过 config 和 test-connection 步骤', async () => {
    const storage = createMockStorage();
    const settingsStorage = createMockStorage({
      apiKey: 'sk-test',
      apiBaseUrl: 'https://api.openai.com',
      model: 'gpt-4',
    });
    const mod = _createOnboardingModule(storage, settingsStorage);
    const steps = await mod.getRecommendedSteps();
    const ids = steps.map(s => s.id);
    assert.ok(!ids.includes('config'));
    assert.ok(!ids.includes('test-connection'));
    assert.ok(ids.includes('welcome'));
    assert.ok(ids.includes('first-question'));
    assert.equal(steps.length, 2);
  });

  it('步骤副本隔离：修改返回的步骤不影响内部配置', () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    const a = mod.getStepConfig();
    const b = mod.getStepConfig();
    assert.notEqual(a, b);
    a[0].title = 'MODIFIED';
    assert.notEqual(b[0].title, 'MODIFIED');
  });
});

// --- 2. Telemetry 核心动作采集点覆盖验证 ---

describe('R238-2: Telemetry 核心动作采集点覆盖', () => {
  let storage, telemetry;

  beforeEach(() => {
    storage = createMockStorage();
    telemetry = _createTelemetry(storage);
  });

  it('TELEMETRY_FEATURES 定义了所有核心动作', () => {
    assert.equal(typeof TELEMETRY_FEATURES.ASK_AI, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.AI_ANSWER, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.BOOKMARK_OP, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.KNOWLEDGE_QUERY, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.SEARCH, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.PAGE_SUMMARIZE, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.KNOWLEDGE_SAVE, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.SCREENSHOT_ASK, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.BOOKMARK_GRAPH, 'string');
    assert.equal(typeof TELEMETRY_FEATURES.ONBOARDING_COMPLETE, 'string');
  });

  it('CORE_TELEMETRY_ACTIONS 包含 ≥10 个核心采集点', () => {
    assert.ok(CORE_TELEMETRY_ACTIONS.length >= 10,
      `Expected ≥10 core actions, got ${CORE_TELEMETRY_ACTIONS.length}`);
  });

  it('各核心动作名称互不重复', () => {
    const unique = new Set(CORE_TELEMETRY_ACTIONS);
    assert.equal(unique.size, CORE_TELEMETRY_ACTIONS.length);
  });

  it('trackFeature 正确记录选中即问 (ask_ai)', async () => {
    await telemetry.trackFeature(TELEMETRY_FEATURES.ASK_AI);
    const summary = await telemetry.getSummary();
    assert.equal(summary.features.ask_ai, 1);
  });

  it('trackFeature 正确记录 AI 回答 (ai_answer)', async () => {
    await telemetry.trackFeature(TELEMETRY_FEATURES.AI_ANSWER);
    const summary = await telemetry.getSummary();
    assert.equal(summary.features.ai_answer, 1);
  });

  it('trackFeature 正确记录书签操作 (bookmark_op)', async () => {
    await telemetry.trackFeature(TELEMETRY_FEATURES.BOOKMARK_OP);
    const summary = await telemetry.getSummary();
    assert.equal(summary.features.bookmark_op, 1);
  });

  it('trackFeature 正确记录知识库查询 (knowledge_query)', async () => {
    await telemetry.trackFeature(TELEMETRY_FEATURES.KNOWLEDGE_QUERY);
    const summary = await telemetry.getSummary();
    assert.equal(summary.features.knowledge_query, 1);
  });

  it('trackFeature 正确记录搜索 (search)', async () => {
    await telemetry.trackFeature(TELEMETRY_FEATURES.SEARCH);
    const summary = await telemetry.getSummary();
    assert.equal(summary.features.search, 1);
  });
});

// --- 3. Feedback-collector 7 天 NPS 计时逻辑 ---

describe('R238-3: Feedback-collector 7 天 NPS 计时逻辑', () => {
  it('安装不足 7 天不弹出 NPS（6 天 23 小时）', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - (6 * MS_PER_DAY + 23 * 60 * 60 * 1000),
    });
    const collector = _createFeedbackCollector(storage, { now: () => now });
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('安装恰好满 7 天弹出 NPS', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - 7 * MS_PER_DAY,
    });
    const collector = _createFeedbackCollector(storage, { now: () => now });
    assert.equal(await collector.shouldShowPrompt(), true);
  });

  it('安装满 30 天仍可弹出 NPS（未提交/未跳过）', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - 30 * MS_PER_DAY,
    });
    const collector = _createFeedbackCollector(storage, { now: () => now });
    assert.equal(await collector.shouldShowPrompt(), true);
  });

  it('无安装时间戳时不弹出 NPS', async () => {
    const storage = createMockStorage();
    const collector = _createFeedbackCollector(storage);
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('提交反馈后不再弹出 NPS', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - 30 * MS_PER_DAY,
    });
    const collector = _createFeedbackCollector(storage, { now: () => now });
    assert.equal(await collector.shouldShowPrompt(), true);
    await collector.submitFeedback(8, '不错');
    assert.equal(await collector.shouldShowPrompt(), false);
  });

  it('用户跳过后不再弹出 NPS', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - 30 * MS_PER_DAY,
    });
    const collector = _createFeedbackCollector(storage, { now: () => now });
    assert.equal(await collector.shouldShowPrompt(), true);
    await collector.dismissPrompt();
    assert.equal(await collector.shouldShowPrompt(), false);
  });
});

// --- 4. Onboarding i18n 中文 locale ---

describe('R238-4: Onboarding i18n 中文 locale 完整性', () => {
  it('ONBOARDING_STEP_I18N 包含所有 4 个步骤的 key', () => {
    assert.ok(ONBOARDING_STEP_I18N.welcome);
    assert.ok(ONBOARDING_STEP_I18N.config);
    assert.ok(ONBOARDING_STEP_I18N['test-connection']);
    assert.ok(ONBOARDING_STEP_I18N['first-question']);
  });

  it('每个步骤有 title 和 description i18n key', () => {
    for (const [stepId, keys] of Object.entries(ONBOARDING_STEP_I18N)) {
      assert.ok(keys.title, `${stepId} missing title key`);
      assert.ok(keys.description, `${stepId} missing description key`);
    }
  });

  it('i18n key 以 onboarding.steps. 为前缀', () => {
    for (const [stepId, keys] of Object.entries(ONBOARDING_STEP_I18N)) {
      assert.ok(keys.title.startsWith('onboarding.steps.'),
        `${stepId}.title prefix: ${keys.title}`);
      assert.ok(keys.description.startsWith('onboarding.steps.'),
        `${stepId}.description prefix: ${keys.description}`);
    }
  });

  it('getLocalizedStepConfig 使用 i18n 翻译步骤文案', () => {
    const zhData = {
      'onboarding.steps.welcome.title': '欢迎使用智阅！',
      'onboarding.steps.welcome.description': '智能技术知识助手',
      'onboarding.steps.config.title': '配置 API',
      'onboarding.steps.config.description': '配置 AI 服务商',
      'onboarding.steps.testConnection.title': '测试连接',
      'onboarding.steps.testConnection.description': '验证连接',
      'onboarding.steps.firstQuestion.title': '试用功能',
      'onboarding.steps.firstQuestion.description': '发送消息',
    };
    const tFn = createMockT(zhData);
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null, { t: tFn });
    const steps = mod.getLocalizedStepConfig();
    assert.equal(steps[0].title, '欢迎使用智阅！');
    assert.equal(steps[0].description, '智能技术知识助手');
    assert.equal(steps.length, 4);
  });

  it('getLocalizedStepConfig 无 t 函数时回退到默认文案', () => {
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null);
    const steps = mod.getLocalizedStepConfig();
    assert.ok(steps[0].title.includes('欢迎'));
    assert.equal(steps.length, 4);
  });

  it('英文 locale 翻译函数覆盖所有步骤', () => {
    const enData = {
      'onboarding.steps.welcome.title': 'Welcome to PageWise!',
      'onboarding.steps.welcome.description': 'Intelligent tech assistant',
      'onboarding.steps.config.title': 'Configure API',
      'onboarding.steps.config.description': 'Set up AI provider',
      'onboarding.steps.testConnection.title': 'Test Connection',
      'onboarding.steps.testConnection.description': 'Verify connection',
      'onboarding.steps.firstQuestion.title': 'Try It Out',
      'onboarding.steps.firstQuestion.description': 'Send your first message',
    };
    const tFn = createMockT(enData);
    const storage = createMockStorage();
    const mod = _createOnboardingModule(storage, null, { t: tFn });
    const steps = mod.getLocalizedStepConfig();
    assert.equal(steps[0].title, 'Welcome to PageWise!');
    assert.equal(steps[2].title, 'Test Connection');
  });
});

// --- 5. First-run 全链路集成 ---

describe('R238-5: First-run 全链路集成', () => {
  it('recordInstallDate 首次安装记录时间戳', async () => {
    const now = 1700000000000;
    const storage = createMockStorage();
    const firstRun = _createFirstRun({ storage, now: () => now });
    await firstRun.recordInstallDate();
    assert.equal(storage._store.pagewise_install_date, now);
  });

  it('recordInstallDate 重复调用不覆盖已有时间戳', async () => {
    const firstTime = 1700000000000;
    const secondTime = 1700000100000;
    const storage = createMockStorage();
    const firstRun = _createFirstRun({ storage, now: () => firstTime });
    await firstRun.recordInstallDate();
    const firstRun2 = _createFirstRun({ storage, now: () => secondTime });
    await firstRun2.recordInstallDate();
    assert.equal(storage._store.pagewise_install_date, firstTime);
  });

  it('完整链路: 安装 → onboarding → telemetry → feedback', async () => {
    const now = Date.now();
    const storage = createMockStorage();
    const settingsStorage = createMockStorage({ apiKey: 'sk', apiBaseUrl: 'https://api.openai.com', model: 'gpt-4' });

    const onboarding = _createOnboardingModule(storage, settingsStorage);
    const telemetry = _createTelemetry(storage);
    const feedback = _createFeedbackCollector(storage, { now: () => now });

    const firstRun = _createFirstRun({
      storage,
      onboarding,
      telemetry,
      feedback,
      now: () => now,
    });

    // Step 1: 安装记录时间戳
    await firstRun.recordInstallDate();
    assert.ok(await firstRun.getInstallDate());

    // Step 2: 需要 onboarding
    assert.equal(await firstRun.shouldShowOnboarding(), true);

    // Step 3: 完成 onboarding
    await firstRun.completeOnboarding();
    assert.equal(await firstRun.shouldShowOnboarding(), false);

    // Step 4: telemetry 记录了 onboarding_complete
    const summary = await firstRun.getTelemetrySummary();
    assert.equal(summary.features.onboarding_complete, 1);

    // Step 5: 安装不足 7 天，不需要 feedback
    assert.equal(await firstRun.shouldShowFeedback(), false);

    // Step 6: 模拟 8 天后
    const laterStorage = createMockStorage({
      pagewise_install_date: now - 8 * MS_PER_DAY,
    });
    const laterFeedback = _createFeedbackCollector(laterStorage, { now: () => now });
    const laterFirstRun = _createFirstRun({
      storage: laterStorage,
      onboarding,
      telemetry,
      feedback: laterFeedback,
      now: () => now,
    });
    // 此时应该弹出 feedback
    assert.equal(await laterFirstRun.shouldShowFeedback(), true);
  });

  it('getStatus 返回完整状态摘要', async () => {
    const now = Date.now();
    const storage = createMockStorage({
      pagewise_install_date: now - 10 * MS_PER_DAY,
    });
    const settingsStorage = createMockStorage({ apiKey: 'sk', apiBaseUrl: 'https://api.openai.com', model: 'gpt-4' });
    const onboarding = _createOnboardingModule(storage, settingsStorage);
    const telemetry = _createTelemetry(storage);
    const feedback = _createFeedbackCollector(storage, { now: () => now });

    const firstRun = _createFirstRun({
      storage,
      onboarding,
      telemetry,
      feedback,
      now: () => now,
    });

    // Track some features
    await telemetry.trackFeature('ask_ai');
    await telemetry.trackFeature('search');

    const status = await firstRun.getStatus();
    assert.equal(status.daysSinceInstall, 10);
    assert.equal(status.needsOnboarding, true);
    assert.equal(status.needsFeedback, true);
    assert.equal(status.telemetryEnabled, true);
    assert.equal(status.telemetryFeatureCount, 2);
    assert.ok(Array.isArray(status.telemetryCoverage));
  });

  it('verifyTelemetryCoverage 报告未覆盖的核心动作', async () => {
    const storage = createMockStorage();
    const telemetry = _createTelemetry(storage);
    const firstRun = _createFirstRun({ storage, telemetry });

    // 只跟踪了部分动作
    await telemetry.trackFeature('ask_ai');
    await telemetry.trackFeature('search');

    const coverage = await firstRun.verifyTelemetryCoverage();
    assert.ok(Array.isArray(coverage));
    assert.ok(coverage.length >= 10);

    const askAiEntry = coverage.find(c => c.action === 'ask_ai');
    assert.ok(askAiEntry);
    assert.equal(askAiEntry.covered, true);
    assert.equal(askAiEntry.count, 1);

    const bookmarkEntry = coverage.find(c => c.action === 'bookmark_op');
    assert.ok(bookmarkEntry);
    assert.equal(bookmarkEntry.covered, false);
    assert.equal(bookmarkEntry.count, 0);
  });

  it('无 telemetry 模块时 verifyTelemetryCoverage 返回全部未覆盖', async () => {
    const storage = createMockStorage();
    const firstRun = _createFirstRun({ storage });

    const coverage = await firstRun.verifyTelemetryCoverage();
    assert.ok(coverage.every(c => c.covered === false));
    assert.ok(coverage.every(c => c.count === 0));
  });

  it('无 feedback 模块时 shouldShowFeedback 返回 false', async () => {
    const storage = createMockStorage();
    const firstRun = _createFirstRun({ storage });
    assert.equal(await firstRun.shouldShowFeedback(), false);
  });

  it('submitFeedback 无 feedback 模块时抛出错误', async () => {
    const storage = createMockStorage();
    const firstRun = _createFirstRun({ storage });
    await assert.rejects(
      () => firstRun.submitFeedback(8, '不错'),
      { message: /feedback.*not.*init/i }
    );
  });
});
