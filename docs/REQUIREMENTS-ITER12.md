# 需求文档 — R327: 行覆盖率安全裕量巩固 30% CoverageSafetyMargin30

> 版本: 1.0
> 日期: 2026-05-26
> 迭代: Phase AY 第 3 轮 (R327)
> 复杂度: Medium
> 前序迭代: R326 (ReleaseV343Landing)、R322 (CoverageSafetyMargin32)

---

## 1. 背景与动机

### 1.1 现状分析

R256 基线数据显示项目行覆盖率 **24.89%**，而门禁阈值为 **≥28%**——这意味着当前门禁对行覆盖率的约束实际是"名义有效、实测未达标"。R322 曾将行覆盖率目标设为 32% 并补充了用例，但后续迭代（R323 新建 `bookmark-statistics.js` 384 行、R325 测试修复）可能引入新代码拉低了覆盖率。

| 维度 | R256 基线 | 当前门禁 | R327 目标 | 安全裕量 |
|------|----------|---------|----------|---------|
| Lines | 24.89% | ≥ 28% | **≥ 30%** | 2pp |
| Statements | 24.89% | (同 Lines) | ≥ 30% | 2pp |
| Functions | 49.79% | ≥ 50% | **≥ 53%** | 3pp |
| Branches | 75.83% | ≥ 75% | ≥ 75% | 0pp（已达标） |

### 1.2 问题清单

1. **行覆盖率门禁零安全裕量** — 门禁阈值 28% 与声称基线 28% 完全重合，任何新代码引入都会导致门禁临界失败
2. **R320 `bookmark-preview.js` (236 行) 测试覆盖不足** — 虽有 `test-bookmark-preview.js`，但需确认核心路径已被覆盖
3. **R323 `bookmark-statistics.js` (384 行) 为新增模块** — 测试断言在 R325 才修复，需确认实际覆盖率
4. **大量零覆盖高价值模块** — `bookmark-learning-goals.js`(367 行)、`bookmark-io-standalone.js`(362 行)、`bookmark-migration-runner.js`(349 行) 等 >150 行纯逻辑模块完全无测试
5. **函数覆盖率仅 ~50%** — 需提升至 53% 以获得 3pp 安全裕量

### 1.3 目标

将行覆盖率从 ~28% 提升至 **≥30%**，函数覆盖率从 ~50% 提升至 **≥53%**，建立 ≥2pp 安全裕量，使门禁不再处于临界状态。

---

## 2. 用户故事

> **作为** PageWise 的维护者，
> **我希望** 行覆盖率门禁阈值 30% 背后有真实的 ≥30% 实测数据支撑，且函数覆盖率门禁有 ≥3pp 安全裕量，
> **以便** 后续迭代新增代码不会因零安全裕量而频繁触发门禁临界失败，测试资产真正保护核心逻辑。

---

## 3. 验收标准

### AC-1: 精确基线测量

- 运行 `npm run test:coverage` 获取四维度精确覆盖率数据（Lines / Statements / Functions / Branches）
- 记录实测值到 `docs/reports/coverage-baseline.md` 基线快照
- 与 R256 基线（24.89% lines / 49.79% functions / 75.83% branches）对比，确认增量
- 验证命令:
  ```bash
  npm run test:coverage
  # 检查 coverage/coverage-summary.json 四维度数值
  ```

### AC-2: 零覆盖高价值模块分析与优先级排序

- 从 c8 报告中提取零覆盖模块，按行数排序，筛选 >150 行纯逻辑模块，输出 **Top-20 清单**
- 优先级排序:
  - **P0**: R323 新建 `bookmark-statistics.js` (384 行) + R320 新建 `bookmark-preview.js` (236 行) — 确保近期迭代新增模块有测试
  - **P1**: 其他 >300 行零覆盖模块 — `bookmark-learning-goals.js`(367 行)、`bookmark-io-standalone.js`(362 行)、`bookmark-migration-runner.js`(349 行)、`bookmark-tag-editor-v2.js`(345 行)
  - **P2**: 200-300 行零覆盖模块
- 输出至 `docs/reports/coverage-baseline.md` 附录

### AC-3: Top-10 模块补充边界用例 ≥30

- 为 Top-10 零覆盖高价值模块补充测试用例:
  - 每个模块 **≥ 3 个用例**
  - 每个模块覆盖三类路径:
    1. **正常路径** — 典型输入、期望输出
    2. **异常路径** — 无效输入、错误条件、边界值
    3. **空数据** — 空数组/null/undefined 输入
- 新增用例总数 **≥ 30**
- 所有新增用例 `npm run test:ci` 通过（0 fail）

### AC-4: 覆盖率达标且门禁收紧

- 行覆盖率实测值 **≥ 30%**（2pp 安全裕量）
- 函数覆盖率实测值 **≥ 53%**（3pp 安全裕量）
- 分支覆盖率维持 **≥ 75%**（不退化）
- 将 `package.json` 中 `coverage:gate --lines` 从 **28 收紧至 30**:
  ```bash
  npm run coverage:gate  # 三项全部通过
  ```
- 验证命令:
  ```bash
  npm run test:coverage && npm run coverage:gate
  ```

### AC-5: 基线文档更新

- 更新 `docs/reports/coverage-baseline.md`:
  - 基线快照表更新为 R327 实测值（四维度分子/分母/覆盖率）
  - 门禁阈值映射表更新: Lines 28% → 30%、Functions 50% → 53%
  - 历史演进表新增 R327 行
  - 新增"R327 零覆盖模块 Top-20 清单"附录
- 验证: 文档中 Lines 门禁阈值为 30%

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 覆盖率工具 | c8 (V8 native coverage, 零插桩)，版本 ^10.1.3 |
| 测试框架 | Node.js 内置 `node --test`，不引入 Jest/Mocha 等第三方框架 |
| 测试命令 | `npm run test:ci:coverage`（单并发，确保覆盖率数据准确） |
| 门禁命令 | `npm run coverage:gate`（c8 check-coverage） |
| 不修改功能代码 | 本轮仅新增测试用例 + 更新门禁阈值 + 更新基线文档，不修改 lib/ 下任何功能模块 |
| 单文件独立性 | 每个新增测试文件可独立运行（`node --test tests/test-xxx.js`） |
| 模拟策略 | 纯逻辑模块直接调用函数；涉及浏览器 API（chrome.*）使用 mock/stub |
| 测试命名规范 | 新测试文件遵循 `tests/test-<module-name>.js` 命名规范 |
| 分支覆盖率不退化 | 新增用例不得导致分支覆盖率低于 75% 门禁 |

---

## 5. 依赖关系

```
R325 (TestFailureFlushR325) ──→ R326 (ReleaseV343Landing) ──→ R327 (CoverageSafetyMargin30)
                                         │
                                    v3.4.3 已发布
```

| 方向 | 依赖 | 说明 |
|------|------|------|
| **前置** | R326 | ReleaseV343Landing — v3.4.3 版本发布落地，test:ci 7513 pass / 0 fail，门禁 ≥28% 有效 |
| **前置** | R325 | TestFailureFlushR325 — 测试红灯已清零，bookmark-statistics.js 模块已创建 |
| **前置** | R323 | BookmarkStatisticsDashboard — `bookmark-statistics.js` 模块已实现，需确保测试覆盖 |
| **前置** | R320 | BookmarkContentPreview — `bookmark-preview.js` 模块已实现，需确保测试覆盖 |
| **并行** | c8 覆盖率报告 | `npm run test:coverage` 生成的 `coverage/coverage-summary.json` 用于零覆盖模块分析 |
| **后续** | R328 | 后续迭代可在 30% 基线上继续提升（目标 35%） |

---

## 6. 非功能需求

| 维度 | 当前值 (R256 基线) | R327 目标值 |
|------|-------------------|------------|
| 行覆盖率 | 24.89% | ≥ 30% |
| 函数覆盖率 | 49.79% | ≥ 53% |
| 分支覆盖率 | 75.83% | ≥ 75%（不退化） |
| 门禁 Lines | ≥ 28% | **≥ 30%** |
| 门禁 Functions | ≥ 50% | **≥ 53%** |
| 门禁 Branches | ≥ 75% | ≥ 75%（不变） |
| 安全裕量 Lines | 0pp (28% 门禁 vs ~28% 实测) | ≥ 2pp |
| 安全裕量 Functions | ~0pp | ≥ 3pp |
| 新增测试用例数 | — | ≥ 30 |
| test:ci 结果 | 7513 pass / 0 fail | ≥ 7513 pass / 0 fail |

---

## 7. 零覆盖模块 Top-20 初步分析

> 以下基于文件行数和是否有对应 `tests/test-*.js` 文件推断。精确排名以 `npm run test:coverage` 实测 c8 报告为准。

| 优先级 | 模块 | 行数 | 当前测试 | 建议用例数 |
|--------|------|------|---------|-----------|
| P0 | `bookmark-statistics.js` | 384 | test-bookmark-statistics.js (R325 修复) | 5（验证覆盖率） |
| P0 | `bookmark-preview.js` | 236 | test-bookmark-preview.js | 5（验证覆盖率） |
| P1 | `bookmark-learning-goals.js` | 367 | ❌ 无 | 5 |
| P1 | `bookmark-io-standalone.js` | 362 | ❌ 无 | 5 |
| P1 | `bookmark-migration-runner.js` | 349 | ❌ 无 | 5 |
| P1 | `bookmark-tag-editor-v2.js` | 345 | ❌ 无 | 5 |
| P2 | `wiki-store-funcs.js` | 327 | ❌ 无 | 4 |
| P2 | `docmind-client.js` | 316 | ❌ 无 | 4 |
| P2 | `bookmark-documentation-data.js` | 316 | ❌ 无 | 4 |
| P2 | `bookmark-knowledge-packs-core.js` | 313 | ❌ 无 | 4 |
| P2 | `bookmark-user-profile-io.js` | 310 | ❌ 无 | 4 |
| P2 | `knowledge-base-crud.js` | 298 | ❌ 无 | 4 |
| P2 | `importer.js` | 296 | ❌ 无 | 3 |
| P2 | `bookmark-learning-coach.js` | 296 | ❌ 无 | 3 |
| P2 | `page-sense-dom.js` | 294 | ❌ 无 | 3 |
| P2 | `bookmark-highlight-archive-core.js` | 291 | ❌ 无 | 3 |
| P2 | `knowledge-base-export.js` | 280 | ❌ 无 | 3 |
| P2 | `message-renderer-dom.js` | 278 | ❌ 无 | 3 |
| P2 | `bookmark-clusterer-core.js` | 272 | ❌ 无 | 3 |
| P2 | `auto-classifier-store.js` | 271 | ❌ 无 | 3 |

> ⚠️ 精确的零覆盖排名取决于 c8 实测报告。上表中"❌ 无"表示 tests/ 目录下无对应的 test 文件，但该模块可能被其他测试间接覆盖。

---

## 8. 实施策略（概要）

### Phase 1: 基线测量 (≤0.5 轮)
- 运行 `npm run test:coverage` 获取精确四维度基线
- 解析 c8 报告，生成零覆盖高价值模块 Top-20 清单
- 与 R256 基线对比，确认增量/退化

### Phase 2: 用例补充 (≤3 轮)
- 按优先级 P0 → P1 → P2 逐模块补充测试用例
- P0（R320/R323 模块）优先: 确认现有测试覆盖核心路径，补充缺失边界用例
- P1（>300 行零覆盖模块）: 新建测试文件，每个模块 ≥5 用例
- P2（200-300 行零覆盖模块）: 新建测试文件，每个模块 ≥3 用例
- 每轮结束运行 `npm run test:ci` 确认 0 fail

### Phase 3: 门禁收紧与文档更新 (≤0.5 轮)
- 运行 `npm run test:coverage` 确认行覆盖率 ≥30%、函数覆盖率 ≥53%
- 修改 `package.json` 中 `coverage:gate --lines 28` → `--lines 30`、`--functions 50` → `--functions 53`
- 运行 `npm run coverage:gate` 确认三项全部通过
- 更新 `docs/reports/coverage-baseline.md` 基线快照 + 门禁阈值 + 历史演进
- 全量回归: `npm run test:ci` 确认 0 fail

---

## 9. 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 零覆盖模块依赖浏览器 API（chrome.*），mock 复杂度高 | 单模块用例开发时间超预期 | 优先处理纯逻辑函数（无 chrome.* 依赖），对浏览器 API 依赖函数使用简单 stub |
| 新增用例导致 test:ci 耗时增加 | 当前 25.3s，接近 35s 目标上限 | 控制单文件用例数（≤10），避免 execSync 类慢测试 |
| 覆盖率提升不及预期（30% 目标太高） | 门禁收紧后 CI 立即失败 | 先实测再决定收紧幅度；若 30% 不可达，设为 29%（1pp 裕量）并记录原因 |
| R323 新模块（384 行）拉低整体覆盖率 | 门禁退化 | Phase 2 第一时间覆盖 R323 模块 |
| c8 报告中部分模块为 UI/DOM 操作（无法在 Node.js 测试） | 测试覆盖率上限受约束 | 仅统计纯逻辑函数覆盖率，UI 函数标记为已排除 |

---

*文档生成于 2026-05-26，遵循飞轮迭代流程 (flywheel-iteration)*
