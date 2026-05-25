# 需求文档 — R298: 用户数据驱动迭代机制 DataDrivenIteration

> 需求编号: R298
> 优先级: P1 (产品决策基础设施)
> 迭代: 飞轮迭代 R10
> 日期: 2026-05-25
> 复杂度: Medium

---

## 一、背景与动机

### 问题陈述

v3.4.0 已发布，但团队**从未收集过真实用户行为数据**，所有产品决策完全基于假设而非数据：

| 维度 | 现状 | 风险 |
|------|------|------|
| 遥测采集 | `lib/telemetry.js`（R212）已实现完整的 `trackFeature` / `trackError` / `recordMetric` API，但 **sidebar.js 和 service-worker.js 均未 import 该模块**，5 个核心动作无一触发记录 | 无法回答"用户最常用什么功能"、"AI 回答失败率多少" |
| 采集点覆盖 | `lib/first-run.js` 定义了 `TELEMETRY_FEATURES`（ask_ai / ai_answer / bookmark_op / knowledge_query / search / page_summarize / knowledge_save / screenshot_ask / bookmark_graph / onboarding_complete），但 **仅 `onboarding_complete` 一个被实际调用**，其余 9 个是死常量 | 采集点形同虚设 |
| NPS 反馈 | `lib/feedback-collector.js`（R276）已实现 `shouldShowPrompt` / `submitFeedback` / 7 天触发 / 低分引导帮助改进 / 高分引导 CWS 评价，但 **sidebar.js 从未调用 `shouldShowPrompt`**，用户从未看到过 NPS 弹窗 | 无法获取用户满意度信号 |
| 数据分析 | 不存在任何从 `chrome.storage.local` 遥测数据生成产品洞察的工具 | 数据即使采集了也无法转化为可行动的改进清单 |

**一句话总结**：R212 和 R276 交付了采集基础设施，但管道从未接入，数据从未流动。

### 背景依据

- `sidebar/sidebar.js`（~3000 行）：核心 UI 入口，负责选中即问、AI 回答展示、书签操作、知识库查询、搜索——**5 个核心动作全部在此文件中发生，但零 telemetry 调用**
- `background/service-worker.js`：仅记录安装时间戳（R238），未集成 telemetry 或 feedback-collector
- `lib/log-store.js` 有独立的 `recordMetric` 用于日志级别性能记录，与 `lib/telemetry.js` 的业务级遥测是两个独立系统，不可混用

---

## 二、用户故事

> 作为 PageWise 的产品负责人，我希望基于真实用户行为数据（而非假设）做出功能优先级决策，以便将开发资源投入到用户真正高频使用的功能上，同时快速发现并修复高频错误。

> 作为 PageWise 的用户，我希望在使用 7 天后被适度询问使用体验（NPS 评分），以便我的反馈能帮助产品改进，同时好的体验能被更多人发现。

---

## 三、验收标准

### AC-1: 5 个核心遥测采集点全部接入 sidebar.js

- [ ] `sidebar/sidebar.js` 正确 import `telemetry` 模块（或通过 `first-run.js` 代理注入）
- [ ] 以下 5 个核心动作在用户实际操作时触发 `telemetry.trackFeature()`：
  1. **选中即问** (`ask_ai`) — 用户通过右键菜单或划词发起提问时
  2. **AI 回答** (`ai_answer`) — AI 回答成功渲染完成时
  3. **书签操作** (`bookmark_op`) — 用户创建/编辑/删除书签时
  4. **知识库查询** (`knowledge_query`) — 用户在知识库面板搜索/浏览时
  5. **搜索** (`search`) — 用户使用搜索功能时
- [ ] AI 调用失败时触发 `telemetry.trackError('ai_call', { message })` 
- [ ] `telemetry.isEnabled() === false` 时所有 track 调用静默返回、不写入 storage
- [ ] 验证方式：`const summary = await telemetry.getSummary(); assert(summary.features.ask_ai > 0)`

### AC-2: NPS 反馈弹窗在 sidebar 中正确触发

- [ ] `sidebar/sidebar.js` 在初始化流程中调用 `feedback.shouldShowPrompt()`
- [ ] 条件满足时（安装 ≥7 天 + 未提交过 + 未跳过）在 UI 中展示 NPS 评分弹窗（0-10 分）
- [ ] 低分（0-6）：提交后触发"帮助改进"引导（复用 `feedback-collector.js` 的 `_sendNotification` 逻辑）
- [ ] 高分（9-10）：提交后引导至 Chrome Web Store 评价链接
- [ ] 被动分（7-8）：提交后无额外操作
- [ ] 用户可跳过（`dismissPrompt`），跳过 7 天内不再弹出

### AC-3: 新建 `lib/user-insight-analyzer.js` — 从遥测数据生成产品洞察

- [ ] 新模块 `lib/user-insight-analyzer.js`，工厂函数模式（`createInsightAnalyzer(storage)`）
- [ ] 纯 ES Module，无 DOM / Chrome API 依赖，通过依赖注入 storage 接口
- [ ] 实现以下 4 个分析维度：
  1. **功能使用频率排名** — `getFeatureRanking()`：从 `pagewise_telemetry.features` 读取并按使用次数降序排列，返回 `[{feature, count, percentage}]`
  2. **核心路径完成率** — `getFunnelCompletion()`：计算 "选中→提问→获得回答→归档" 四步漏斗，返回每步转化率
  3. **日活/周活趋势** — `getDAUWATrend()`：基于 `pagewise_telemetry` 中的日期标记（需在 telemetry 中新增每日活跃记录），返回最近 30 天 DAU 和最近 12 周 WAU 数组
  4. **错误率 Top-5** — `getTopErrors(limit=5)`：从 `pagewise_telemetry.errors` 读取，按 `total` 降序取前 5
- [ ] 提供 `generateInsightReport()` 汇总方法，返回完整 JSON 对象包含以上 4 个维度 + 生成时间戳

### AC-4: 用户洞察报告模板

- [ ] 新建 `docs/reports/user-insight-template.md`
- [ ] 模板包含以下章节引导：
  1. **功能热度榜** — 如何从 `generateInsightReport()` 中提取功能使用排名
  2. **核心路径漏斗** — 如何解读转化率、哪些环节有瓶颈
  3. **活跃度趋势** — 如何从 DAU/WAU 判断增长/留存
  4. **错误率 Top-5** — 如何从错误数据制定修复优先级
  5. **可行动改进清单模板** — 基于以上数据填写的表格模板（功能 | 数据证据 | 改进方案 | 优先级）
- [ ] 模板附带示例数据（使用合理的虚构数据填充），便于理解输出格式

### AC-5: 测试覆盖 ≥20 用例

- [ ] 新建 `tests/test-user-insight-analyzer.js`
- [ ] 使用 `node:test` + `node:assert/strict`，ESM 风格
- [ ] 覆盖以下场景（≥20 用例）：
  - `getFeatureRanking()`: 空数据 / 单功能 / 多功能排序 / 百分比计算 / 未知键忽略
  - `getFunnelCompletion()`: 完整路径 / 某步零转化 / 部分路径 / 100% 转化
  - `getDAUWATrend()`: 无数据 / 单日活跃 / 多日活跃 / 周边界
  - `getTopErrors()`: 空错误 / 低于 limit / 超过 limit / 排序正确性
  - `generateInsightReport()`: 汇总输出完整性 / 时间戳存在 / 各维度字段存在
- [ ] 所有用例通过 `npm run test:ci`

---

## 四、技术约束

### TC-1: 依赖注入模式

- `lib/user-insight-analyzer.js` 必须使用工厂函数 + 依赖注入模式（`createInsightAnalyzer(storage)`），与 `lib/telemetry.js` 和 `lib/feedback-collector.js` 保持一致
- 不直接引用 `chrome.storage.local`，便于单元测试

### TC-2: 遥测数据存储在同一 storage key

- 遥测数据使用已有的 `pagewise_telemetry` storage key（`lib/telemetry.js` 定义）
- 如需新增活跃度日期标记（AC-3 第 3 项），应在现有 `TelemetryData` 结构中扩展新字段（如 `dailyActive: { '2026-05-25': 1 }`），不得新建独立 storage key
- 新增字段需在 `_normalize()` 函数中做向后兼容处理（旧数据缺失该字段时返回空对象）

### TC-3: sidebar.js 集成不引入循环依赖

- sidebar.js 已 import 了 `log-store.js`，新增 `telemetry.js` import 不得创建循环依赖
- 如 telemetry.js 与 sidebar.js 有间接依赖风险，应通过 first-run.js 作为中间层注入

### TC-4: 隐私与合规

- 所有数据纯本地存储（`chrome.storage.local`），不上传任何服务器——保持 R212 设计约束
- 用户可通过 `telemetry.setEnabled(false)` 一键关闭遥测
- 遥测关闭后，NPS 弹窗仍应正常工作（反馈收集独立于遥测开关）

### TC-5: 性能影响最小化

- telemetry `trackFeature()` 调用的额外延迟 ≤ 5ms（异步写入 storage，不阻塞 UI 渲染）
- sidebar.js 中的 telemetry 调用使用 fire-and-forget 模式（`telemetry.trackFeature(x).catch(() => {})`），不 await
- NPS 弹窗检查（`shouldShowPrompt`）仅在 sidebar 初始化时执行一次，不重复轮询

### TC-6: 测试基础设施

- 新增测试文件使用 ESM `import` + `node:test` + `node:assert/strict`
- mock storage 使用 `createMockStorage()` 工厂函数（与现有 test-telemetry.js / test-feedback-collector.js 保持一致）
- 测试不得依赖真实 Chrome API

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R212 (PostLaunchTelemetry) | 前置依赖 | `lib/telemetry.js` 已实现，本次任务是将其接入 sidebar.js 真实环境 |
| R276 (FeedbackCollector) | 前置依赖 | `lib/feedback-collector.js` 已实现，本次任务是将其接入 sidebar.js NPS 弹窗流程 |
| R238 (FirstRunExperienceOpt) | 前置依赖 | `lib/first-run.js` 定义了 `TELEMETRY_FEATURES` 常量和 telemetry 代理注入，本次复用该模式 |
| `lib/log-store.js` | 无依赖（但需区分） | log-store 的 `recordMetric` 是日志级性能记录，与 telemetry 的业务级遥测是两个独立系统，本次任务不修改 log-store |

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 |
|------|------|
| 远程数据上报 | 本扩展坚持本地优先设计，数据不上传服务器 |
| 实时仪表盘 UI | R298 生成静态报告模板，不构建可视化仪表盘（未来迭代） |
| A/B 测试框架 | 需要远程控制能力，超出本地扩展范围 |
| 修改 `lib/telemetry.js` 核心 API | 现有 API 设计完善，仅需扩展 DAU 记录字段 |
| 修改 `lib/feedback-collector.js` 核心逻辑 | 现有 NPS 逻辑正确，仅需在 sidebar 中接入调用 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| sidebar.js import telemetry 引发循环依赖 | 中 | 高（sidebar 崩溃） | TC-3 要求通过 first-run.js 注入；实现前做依赖图分析 |
| DAU 标记导致 storage 写入过于频繁 | 低 | 中（性能抖动） | 限制每日仅写入一次（当天首次 trackFeature 时标记），使用内存去重 |
| NPS 弹窗频率过高影响用户体验 | 低 | 中（差评） | 复用 feedback-collector.js 已有的 7 天延迟 + dismissed 机制，不再额外加频 |
| 现有 7887+ 测试因 sidebar.js 变更而 fail | 中 | 中（CI 红灯） | sidebar.js 集成改动通过 mock storage 隔离验证；新增 20 用例通过后再做端到端验证 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 核心采集点接入 | 5/5 核心动作触发 trackFeature | grep sidebar.js 确认 5 处 `trackFeature` 调用 |
| NPS 弹窗可触发 | shouldShowPrompt 在 sidebar 初始化中被调用 | 代码审查 + 测试验证 |
| Insight Analyzer 可用 | generateInsightReport() 返回含 4 个维度的完整 JSON | 单元测试验证 |
| 测试用例数 | ≥ 20 新增用例全部通过 | `npm run test:ci` ≥ 7907 pass / 0 fail |
| 报告模板 | user-insight-template.md 包含 5 个章节 + 示例数据 | 文档审查 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-25 | 初始化 R298 需求文档 |
