# VERIFICATION.md — Iteration #10 Review

> 任务: R238: 用户首次体验优化与遥测数据验证 FirstRunExperienceOpt  
> 审查日期: 2026-05-21  
> 审查人: Guard Agent  
> 变更文件: 6 files, +225 / -13 lines  
> 新文件: lib/first-run.js, tests/test-r238-first-run-experience.js  

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 安装时间戳修复正确；i18n 扩展完整；但 first-run.js 集成模块未被任何生产代码导入，telemetry/feedback-collector 未实际接入用户界面 |
| 代码质量 | ✅ | 纯 ES Module、依赖注入、工厂函数模式一致；无硬编码密钥/XSS 风险；模块行数合规（onboarding.js 240 行、first-run.js 236 行） |
| 测试覆盖 | ⚠️ | 34 用例全部通过，覆盖 5 个子套件；但 R238-2 仅测试 5/10 个 telemetry 采集点的 trackFeature 调用，缺少 page_summarize/knowledge_save/screenshot_ask/bookmark_graph/onboarding_complete 的实际跟踪测试 |
| 文档同步 | ⚠️ | CHANGELOG.md 和 IMPLEMENTATION.md 已更新；但 TODO.md R238 仍标记为 `[ ]` 未完成（IMPLEMENTATION.md 声称已标记为完成） |

---

## 发现的问题

### P1: first-run.js 集成模块未被生产代码导入（严重）

**问题**: `lib/first-run.js` 作为"桥接 onboarding → telemetry → feedback 全链路"的集成模块，但 `sidebar/sidebar.js`、`popup/`、`background/service-worker.js`、`options/` 均未 import 它。该模块目前仅作为测试对象存在。

**影响**:
- `telemetry.trackFeature()` 从未在真实用户操作中被调用（sidebar.js 不导入 telemetry）
- `feedback.shouldShowPrompt()` 从未在 UI 中被检查（sidebar.js 不导入 feedback-collector）
- 用户完成 onboarding 后，`onboarding_complete` 遥测采集点不会被记录
- NPS 反馈弹窗永远不会弹出（无代码检查是否需要弹出）

**证据**:
```
$ grep -rn 'first-run\|firstRun\|FirstRun' sidebar/ popup/ background/ options/ --include='*.js'
(no output)

$ grep -rn 'shouldShowFeedback\|feedback-collector' sidebar/sidebar.js
(no output)

$ grep -rn 'trackFeature' sidebar/sidebar.js
(no output)
```

**建议**: 在 sidebar.js 的 `init()` 方法中导入并调用 `first-run.js`，或直接导入 telemetry/feedback-collector。至少应在 sidebar 初始化时：
1. 检查 `firstRun.shouldShowFeedback()` → 弹出 NPS
2. 在用户执行核心动作时调用 `firstRun.trackFeature()`

### P2: TODO.md R238 未标记完成（中等）

**问题**: `docs/TODO.md` 第 990 行 R238 仍为 `- [ ]`，但 `docs/IMPLEMENTATION.md` 第 30 行声称 "docs/TODO.md — R238 标记完成"。

**证据**:
```
$ grep -n 'R238' docs/TODO.md
990:- [ ] **R238: 用户首次体验优化与遥测数据验证 FirstRunExperienceOpt**
```

**建议**: 将 `- [ ]` 改为 `- [x]`。

### P3: R238-2 telemetry 测试覆盖不完整（低）

**问题**: `R238-2: Telemetry 核心动作采集点覆盖` 套件中，仅对 5/10 个采集点执行了 `trackFeature` 调用并验证计数（ask_ai, ai_answer, bookmark_op, knowledge_query, search）。剩余 5 个（page_summarize, knowledge_save, screenshot_ask, bookmark_graph, onboarding_complete）仅验证了常量定义为 `typeof string`，未验证实际调用。

**建议**: 补充 5 个 `trackFeature` 测试用例，每个采集点至少验证一次调用和计数。

### P4: IMPLEMENTATION.md 设计决策表述不准确（低）

**问题**: IMPLEMENTATION.md 第 37 行写道：
> `onboardingCompleted: false` 确保更新后仍可触发引导（但 `shouldShowOnboarding` 只检查 key 是否存在，更新时不会覆盖已设的 true）

实际上 `onboardingCompleted: false` 仅在 `details.reason === 'install'` 时写入，`update` 不会触发此代码路径。该描述容易误导读者认为更新时也会写入 false。

**建议**: 修正为 "仅在首次安装时写入，更新事件不触发此代码路径"。

### P5: 无安全/质量问题（确认通过）

- ✅ 无硬编码密钥或 API Key
- ✅ 无 XSS 风险（纯数据模块，无 DOM 操作）
- ✅ 无 eval() 或动态代码执行
- ✅ storage 操作使用 try-catch 保护
- ✅ TELEMETRY_FEATURES 使用 Object.freeze 冻结
- ✅ 模块行数合规：onboarding.js 240 行 ≤ 400，first-run.js 236 行 ≤ 400

---

## 返工任务清单

| # | 优先级 | 任务 | 预计工作量 |
|---|--------|------|-----------|
| 1 | **P1** | 在 sidebar.js 中集成 first-run.js（导入、初始化、在 init() 中检查 feedback、在核心动作处调用 trackFeature） | 30min |
| 2 | **P2** | TODO.md R238 标记为 `[x]` | 1min |
| 3 | **P3** | test-r238 补充 5 个 telemetry 采集点的 trackFeature 调用测试（page_summarize/knowledge_save/screenshot_ask/bookmark_graph/onboarding_complete） | 10min |
| 4 | **P4** | IMPLEMENTATION.md 修正 install date 写入时机描述 | 5min |

---

## 已验证通过的变更

| 验证项 | 结果 | 详情 |
|--------|------|------|
| service-worker.js 安装时间戳 | ✅ | `onInstalled` + `install` reason → `pagewise_install_date` + `onboardingCompleted: false` 正确写入 |
| onboarding.js i18n 支持 | ✅ | `ONBOARDING_STEP_I18N` 映射、`ONBOARDING_STEP_DEFAULTS` 回退、`getLocalizedStepConfig()` + `options.t` 注入机制完整 |
| locale 文件完整性 | ✅ | zh-CN.json/en-US.json 均包含 4 步标题/描述 + features + privacy + sampleQuestions（完整双语） |
| i18n key 一致性 | ✅ | 步骤 ID（kebab-case）与 i18n key（camelCase）通过 `ONBOARDING_STEP_I18N` 正确映射 |
| 7 天 NPS 计时逻辑 | ✅ | 6天23小时→不弹出，7天→弹出，30天→仍可弹出，提交后→不弹出，跳过后→不弹出 |
| first-run.js 模块设计 | ✅ | 纯 ES Module、依赖注入、Object.freeze、JSDoc 完整、工厂函数模式 |
| 测试通过率 | ✅ | 34 pass / 0 fail (test-r238)；63 pass / 0 fail (test-onboarding + test-telemetry + test-feedback-collector) |
| 模块行数合规 | ✅ | onboarding.js 240 行、first-run.js 236 行，均 ≤ 400 行上限 |
| CHANGELOG.md 更新 | ✅ | `[3.2.0]` 区段包含完整 R238 变更记录 |
| IMPLEMENTATION.md 更新 | ✅ | 详细记录问题分析、修改内容、设计决策、验证结果 |

---

## 总结

R238 在**代码层面**完成了 onboarding i18n 扩展和 service-worker 安装时间戳修复，模块设计清晰、测试基本覆盖。但在**集成层面**存在关键缺陷：新建的 `first-run.js` 集成模块未被任何生产代码导入，导致 telemetry 采集和 feedback 弹窗在真实用户场景中不可用。这恰好是对原始需求"从未在真实用户场景验证"问题的回避而非解决。

**判定**: ⚠️ 有条件通过 — 需完成 P1（sidebar.js 集成 first-run.js）后方可关闭 R238。
