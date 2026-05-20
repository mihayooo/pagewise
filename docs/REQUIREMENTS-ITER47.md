# REQUIREMENTS — R205: 行覆盖率冲刺 50% CoverageSprint50

> 迭代: R205
> 日期: 2026-05-20
> 复杂度: Medium（测试补充，无新业务逻辑）
> 阶段: 工程质量 — 测试覆盖率提升
> 影响范围: `tests/*.js`（新增/增强）+ `package.json`（门禁阈值）

---

## 1. 用户故事

作为 PageWise 的维护者，我发现当前行覆盖率仅 **22.17%**（10,212/46,056），`coverage:gate --lines 20` 门禁形同虚设——116 个模块（占总代码行 70%）完全零覆盖，任何重构都是盲飞。我需要集中一轮冲刺，将覆盖率提升至 50% 以上，让测试套件真正成为回归安全网，而非装饰品。

**数据基线**（2026-05-20 覆盖率报告）：

| 指标 | 当前值 | 目标值 | 缺口 |
|------|--------|--------|------|
| 行覆盖率 | 22.17%（10,212/46,056） | ≥50%（≥23,028 行） | **+12,816 行** |
| 函数覆盖率 | 49.6%（379/764） | ≥60%（≥459 函数） | **+80 函数** |
| 分支覆盖率 | 78.35%（1,709/2,181） | 维持（不退步） | 0 |
| 零覆盖模块数 | 116 / 174 | ≤60 | **-56 模块** |

---

## 2. 验收标准

### AC1: 未覆盖行 Top-20 模块分析与分层策略

- 输出**覆盖缺口分析文档**（内嵌在 PR 或 README 中），包含：
  - 未覆盖行 Top-20 模块列表（按未覆盖行数降序）
  - 每个模块标注：总行数、已覆盖行、未覆盖行、覆盖百分比、是否纯逻辑模块（无 `chrome.*` 依赖）、是否有对应测试文件
- 将 Top-20 模块分为三层：
  - **Tier 1 — 纯逻辑高 ROI**（无 Chrome API 依赖，可直接单测）：如 `memory.js`(358)、`conversation-store.js`(224)、`bookmark-graph-engine.js`(177)、`prompt-templates.js`(176)、`batch-summary.js`(482) 等
  - **Tier 2 — 已有测试但覆盖不足**（需增强）：如 `utils.js`(94 未覆盖)、`cache-manager.js`(143 未覆盖)、`i18n.js`(202 未覆盖)、`ai-client.js`(184 未覆盖)
  - **Tier 3 — 重度 Chrome API 依赖**（需 mock 或集成测试）：如 `page-sense.js`(447)、`chat-mode.js`(403)、`bookmark-keyboard-shortcuts.js`(380)

### AC2: Tier 1 模块测试补充（核心交付）

- 为 **至少 10 个 Tier 1 零覆盖模块**补充完整单元测试
- 优先选择未覆盖行数最多的纯逻辑模块，目标模块列表（按优先级排序）：
  1. `memory.js` — 358 行，用户画像存储/召回/加权，**0 chrome refs**
  2. `conversation-store.js` — 224 行，对话历史管理，**0 chrome refs**
  3. `bookmark-graph-engine.js` — 177 行，图谱引擎核心逻辑，**0 chrome refs**
  4. `prompt-templates.js` — 176 行，提示词模板系统，**6 chrome refs**（可 mock）
  5. `evolution.js` — 256 行，自进化信号处理，**2 chrome refs**（可 mock）
  6. `bookmark-gap-detector.js` — 364 行，知识盲区检测，**0 chrome refs**
  7. `bookmark-duplicate-detector.js` — 474 行，重复书签检测，**0 chrome refs**
  8. `bookmark-performance.js` — 464 行，性能基准测试模块，**0 chrome refs**
  9. `knowledge-base-export.js` — 导出逻辑，**0 chrome refs**
  10. `bookmark-folder-analyzer.js` — 377 行，文件夹分析，**0 chrome refs**
- 每个模块新增测试用例 ≥10 个，覆盖：
  - 正常路径（happy path）
  - 边界条件（空输入、单元素、超大集合、特殊字符）
  - 异常路径（null/undefined 参数、格式错误数据、存储异常）
- 每个新增测试文件遵循项目约定：`tests/test-<module-name>.js`

### AC3: Tier 2 已有测试模块覆盖增强

- 为 **至少 5 个已有测试但覆盖不足的模块**补充缺失的测试用例：
  1. `utils.js` — 当前 78.8%，补测剩余 94 行未覆盖分支
  2. `cache-manager.js` — 当前 52.8%，补测缓存失效/驱逐/并发路径
  3. `i18n.js` — 当前 51.7%，补测语言检测/回退/缺失 key 路径
  4. `ai-client.js` — 当前 42.3%，补测错误处理/重试/降级路径
  5. `cost-estimator.js` — 当前 55.8%，补测不同模型/计费边界
- 增强后每模块行覆盖率 ≥80%

### AC4: 覆盖率门禁收紧

- `package.json` 中 `coverage:gate` 脚本从 `c8 check-coverage --lines 20` 改为：
  ```
  c8 check-coverage --lines 50 --functions 60
  ```
- 门禁收紧后 `npm run test:ci && npm run coverage:gate` 必须通过
- 确保 `npm run test:ci` 全量回归 **0 失败**（不得引入新的测试失败）

### AC5: 覆盖率目标达成

- **行覆盖率** ≥50%（≥23,028 行）
- **函数覆盖率** ≥60%（≥459 函数）
- **分支覆盖率** 不低于当前 78.35%（不退步）
- 零覆盖模块数 ≤60（从 116 降至 60 以下）
- 测试执行时间不超过当前 45.4s 的 1.5 倍（≤68s）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 测试框架 | `node:test` + `node:assert/strict`，与项目全部 188 个测试文件一致 |
| 覆盖率工具 | `c8`（已配置 lcov + text-summary + html reporter），不变更工具链 |
| Mock 策略 | Chrome API 使用构造函数注入模式（依赖反转）或轻量 stub 对象，**不引入 sinon/jest 等外部 mock 库** |
| 纯 ES Module | 所有测试文件使用 `import` 语法，与 `package.json` 中 `"type": "module"` 一致 |
| 不修改业务代码 | 本迭代**只新增/增强测试文件**，不修改 `lib/` 下任何业务模块（除非修复明显 bug 以通过测试） |
| 零外部依赖 | 不新增任何 `devDependencies`，复用 `node:test` + `c8` |
| 并发执行 | 测试需支持 `--test-concurrency=8` 并行运行，测试间无共享状态 |
| R203 拆分兼容 | 部分大模块已在 R203 拆分为子模块（如 `bookmark-duplicate-detector.js` → `*-detect.js` + `*-utils.js`），测试需覆盖原始入口 + 拆分子模块 |
| 测试命名 | `test-<module-name>.js`，test 函数使用中文描述如 `test('memory.js: 空画像返回默认值', ...)` |

---

## 4. 依赖关系

### 前置依赖（已完成）
- **R203: 超大模块拆分十一期** — 模块结构已稳定，拆分后的子模块可独立测试
- **R202: 测试执行效率优化三期** — 测试基础设施（sharding、smoke subset、并发配置）已就绪
- **R199: E2E 学习闭环集成测试深化** — E2E 测试已覆盖，本次专注单元测试层

### 后续依赖（受本迭代影响）
- **R206+: 后续功能迭代** — 50% 门禁将成为新基线，后续 PR 必须维持 ≥50%
- **CI Pipeline** — `coverage:gate` 阈值收紧后，CI 将更早拦截覆盖率退步

### 风险与缓解

| 风险 | 概率 | 缓解策略 |
|------|------|----------|
| 12,816 行缺口太大，单轮无法达成 50% | 中 | AC2/AC3 保证最低覆盖增量；如缺口仍大，可放宽至 45% 并在 R206 追加 |
| 新增测试与已有测试冲突（共享全局状态） | 低 | 每个测试文件独立 setup/teardown，不依赖执行顺序 |
| Tier 2 模块 mock 复杂度高（Chrome API） | 中 | 优先使用构造函数注入 + stub，而非完整 mock Chrome API |
| 测试执行时间超 68s 预算 | 低 | 当前 6977 用例 / 45.4s，新增 ~200 用例预估增加 5-10s |

---

## 5. 验证计划

| 步骤 | 命令 | 预期结果 |
|------|------|----------|
| 全量测试 | `npm run test:ci` | 0 失败，≥7200 用例 |
| 覆盖率报告 | `npm run test:coverage` | lines ≥50%, functions ≥60% |
| 门禁检查 | `npm run coverage:gate` | 退出码 0（通过） |
| Smoke 子集 | `npm run test:smoke` | 0 失败 |
| 执行时间 | `time npm run test:ci` | ≤68s |

---

## 6. 非目标（Out of Scope）

- ❌ 不新增 E2E 测试（本次专注单元测试）
- ❌ 不修改 `lib/` 业务代码（除非 bugfix）
- ❌ 不引入新的测试依赖（sinon、jest 等）
- ❌ 不追求 100% 覆盖率（50% 是务实目标，Tier 3 重度 DOM/Chrome 模块留待后续）
- ❌ 不优化测试执行时间（R202 已处理）
