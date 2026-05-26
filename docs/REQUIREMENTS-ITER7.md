# REQUIREMENTS — R322: CoverageSafetyMargin32

> 迭代: R322
> 日期: 2026-05-26
> 复杂度: Medium（测试增强 + 门禁收紧）
> 阶段: Phase AX — 测试基线加固
> 前置迭代: R243（门禁对齐）、R256（CoverageInfraFixFinal）、R319（ReleaseV342Final）

---

## 1. 用户故事

作为 PageWise 维护者，我希望在引入 R320 新模块（bookmark-content-preview.js）之前，将行覆盖率门禁从 28% 提升至 30%，建立 ≥4pp 安全裕量，确保新功能不会使覆盖率跌破门禁线，从而维护 CI 流水线的稳定性和代码质量底线。

---

## 2. 现状分析

| 维度 | 基线实测值（R256/R319） | 当前门禁阈值 | 门禁裕量 | 目标门禁 | 目标裕量 |
|------|------------------------|-------------|---------|---------|---------|
| **Lines** | ~28% | 28% | **0pp** ⚠️ | **30%** | **2pp → 后续 R320 稀释后仍 ≥28%** |
| **Functions** | ~50% | 50% | **0pp** ⚠️ | ≥56% | ≥6pp |
| **Branches** | ~76% | 75% | +1pp | 75%（不变） | 保持 |

**核心风险**: 当前行覆盖率门禁（28%）与实测值零裕量，R320 新增 `bookmark-content-preview.js`（预估 300+ 行）将稀释覆盖率分母，极有可能使行覆盖率跌破 28% 门禁线导致 CI 全线红灯。

---

## 3. 验收标准

### AC1: 精确基线采集
- 运行 `npm run test:coverage` 获取四维度（行/函数/分支/语句）精确覆盖率
- 记录 c8 实测数据到 `docs/reports/coverage-baseline.md`，格式与现有基线文档一致
- 输出 `coverage/coverage-summary.json` 供后续对比

### AC2: 零覆盖高价值模块识别
- 分析 c8 HTML 报告，筛选出 Top-20 **行数 ≥150 且覆盖率为 0%** 的纯逻辑模块
- 优先覆盖以下核心模块（本次迭代必须涉及）：
  - `lib/ai-client-*.js` 系列（6 个文件，合计 852 行）
  - `lib/knowledge-base-crud.js`（298 行）
  - `lib/bookmark-graph-engine.js`（182 行）
  - `lib/bookmark-spaced-repetition.js`（184 行）
- 输出模块清单及其行数、当前覆盖率

### AC3: 边界用例编写
- 为 Top-15 模块编写边界测试用例，**每模块 ≥3 用例**，覆盖三个维度：
  - **正常路径**: 典型输入、预期输出验证
  - **异常路径**: 无效输入、错误类型、超时/网络失败模拟
  - **空数据**: 空数组、空对象、null/undefined 参数
- 新增用例总数 **≥50**
- 使用 `node:test` + `node:assert/strict` 框架，与现有测试规范一致

### AC4: 覆盖率达标
- 行覆盖率（Lines）≥ **32%**（相对当前 ~28% 建立 4pp 安全裕量）
- 函数覆盖率（Functions）≥ **56%**（相对当前 ~50% 建立 6pp 安全裕量）
- 分支覆盖率（Branches）保持 ≥ **75%**
- 验证方式: `npm run test:coverage && npm run coverage:gate` 全部通过

### AC5: 门禁阈值收紧
- 将 `package.json` 中 `coverage:gate` 的 `--lines` 参数从 **28 收紧至 30**
- 函数覆盖率门禁从 **50 收紧至 54**
- 分支覆盖率门禁 **75 保持不变**
- 收紧后运行 `npm run coverage:gate` 确认 CI 通过

### AC6: 基线文档更新
- 更新 `docs/reports/coverage-baseline.md`：
  - 基线快照表（四维度分子/分母/覆盖率）
  - 门禁阈值映射表（新增"目标值"列更新为 R322 实测值）
  - 历史门禁阈值演进表追加 R322 行
  - 测量环境信息更新（日期、Node 版本、测试用例总数）
- 文档末尾追加 R322 变更说明段落

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **覆盖率工具** | c8 ≥10.1.3（V8 native coverage，零插桩），不可引入 Istanbul/nyc |
| **测试框架** | `node:test` + `node:assert/strict`（Node.js ≥22 内置） |
| **覆盖率范围** | 仅 `lib/**/*.js`（见 `.c8rc.json` 的 include 配置），排除 `pdf.min.mjs` / `pdf.worker.min.mjs` / `pdf.worker.mjs` |
| **不修改源码** | 本次迭代仅新增测试文件，不修改任何 `lib/*.js` 源文件 |
| **不新增依赖** | 仅使用已有 devDependencies（c8、eslint） |
| **测试隔离** | 每个测试用例必须独立运行，不依赖全局状态或执行顺序 |
| **Mock 策略** | Chrome API 使用全局 mock（`globalThis.chrome`），IndexedDB 使用内存 shim，网络请求需 mock/拦截 |
| **CI 兼容** | 新增测试文件必须被 `npm run test:ci` 和 `npm run test:ci:coverage` 自动收录 |
| **执行时间** | 新增测试套件总执行时间 ≤30s（单文件 ≤10s） |

---

## 5. 依赖关系

### 5.1 前置依赖（必须在 R322 之前完成）
| 依赖 | 状态 | 说明 |
|------|------|------|
| R256 (CoverageInfraFixFinal) | ✅ 已完成 | c8 ENOENT 根因修复 |
| R319 (ReleaseV342Final) | ✅ 已完成 | v3.4.2 发布收尾 |
| R321 (ChangelogHygiene) | ✅ 已完成 | CHANGELOG 归档卫生 |

### 5.2 后续依赖（R322 完成后解锁）
| 依赖 | 说明 |
|------|------|
| R320 (BookmarkContentPreview) | 新模块引入将稀释覆盖率，R322 的 4pp 裕量为此缓冲 |

### 5.3 无代码冲突依赖
- R322 仅新增 `tests/test-r322-coverage-boost-*.js` 测试文件和修改 `package.json` 门禁参数
- 与 R320 的 `lib/bookmark-content-preview.js` 无文件冲突

---

## 6. 实施方案概要

### Step 1: 基线采集
运行 `npm run test:coverage`，记录四维度实测数据。

### Step 2: 模块分析
解析 `coverage/coverage-summary.json`，按 `lib/*.js` 排序，筛选零覆盖 + 高行数模块，输出 Top-20 清单。

### Step 3: 测试编写
为 Top-15 模块编写 ≥50 个边界用例，优先级：
1. **ai-client-*.js** — AI 核心链路，零覆盖风险最高
2. **knowledge-base-crud.js** — 知识库 CRUD，数据完整性关键
3. **bookmark-graph-engine.js** — 图谱引擎，算法密集
4. **bookmark-spaced-repetition.js** — 间隔重复，数学公式多
5. 其余高行数零覆盖模块

### Step 4: 验证达标
运行覆盖率门禁，确认 Lines ≥32%、Functions ≥56%。

### Step 5: 门禁收紧
修改 `package.json` → `coverage:gate` 阈值。

### Step 6: 文档更新
更新 `docs/reports/coverage-baseline.md`。

---

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 模块间依赖复杂，mock 困难 | 测试编写耗时超预期 | 优先测试纯函数路径，skip 需要复杂集成的路径 |
| c8 与 node:test 并行执行时覆盖率数据不完整 | 基线不准 | 使用 `--test-concurrency=1` 串行执行覆盖率测试 |
| 收紧门禁后 CI 红灯 | 合并受阻 | 先确认实测值 ≥30% 后再收紧，预留操作空间 |
| R320 并行开发引入新文件 | 分母变化影响目标 | 本次迭代锁定 lib 文件列表快照，目标按当前分母计算 |

---

## 8. 成功指标

| 指标 | 当前值 | 目标值 | 判定方式 |
|------|--------|--------|---------|
| 行覆盖率 | ~28% | ≥32% | `npm run coverage:gate` 通过 |
| 函数覆盖率 | ~50% | ≥56% | `npm run coverage:gate` 通过 |
| 分支覆盖率 | ~76% | ≥75% | `npm run coverage:gate` 通过 |
| 新增测试用例 | — | ≥50 | `test:ci:coverage` 输出统计 |
| 覆盖模块数 | — | Top-15 零覆盖模块 | c8 HTML 报告 |
| 门禁 `--lines` | 28 | 30 | `package.json` diff |
| 基线文档更新 | — | 四维度 + 历史表 | 文档审查 |

---

*文档生成于 2026-05-26 | 飞轮迭代 Phase AX | R322 CoverageSafetyMargin32*
