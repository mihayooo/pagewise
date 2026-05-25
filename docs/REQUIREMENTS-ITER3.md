# 需求文档 — R266: 行覆盖率门禁达标冲刺

> **迭代编号**: R266 (CoverageGatePassR265)
> **所属阶段**: Phase AM — 测试修复与覆盖率门禁达标 (R265-R269)
> **优先级**: P0 — 门禁阻塞项
> **复杂度**: Medium
> **创建日期**: 2026-05-25
> **状态**: 📋 待开发

---

## 1. 用户故事

**作为一名** PageWise 项目维护者，**我希望** 代码行覆盖率通过 CI 门禁阈值（≥28%），**以便** PR 合并流程不被覆盖率门禁阻断，确保代码质量基线可持续。

**补充故事：** 作为一名开发者，**我希望** R163-R186 学习闭环模块群拥有单元测试覆盖，**以便** 在重构这些模块时有信心不引入回归。

---

## 2. 背景与现状

### 2.1 覆盖率现状（2026-05-25 实测）

| 指标 | 当前值 | 门禁阈值 | 差距 | 状态 |
|------|--------|---------|------|------|
| **行覆盖率** | 22.46% (11,652/51,871) | ≥28% | **−5.54pp** | ❌ 未达标 |
| **函数覆盖率** | 50.43% | ≥50% | +0.43pp | ✅ 刚过线 |
| **分支覆盖率** | 78.64% | ≥75% | +3.64pp | ✅ 达标 |

### 2.2 核心问题

- 行覆盖率 22.46% 距门禁 28% 差距 5.54pp，需新增覆盖约 **2,870 行**
- 247 个 lib 模块中，大量模块在测试中从未被 `import` 加载，c8 无法插桩统计
- R163-R186 学习闭环模块群（Phase S-W 产物）是零覆盖重灾区

### 2.3 历史冲刺回顾

历史 R205、R216、R222、R225、R230、R236、R241、R245、R251、R258 共 10 次覆盖率冲刺均未能将行覆盖率稳定提升至 ≥28%。根因始终相同：**零覆盖模块在测试中从未被 `import` 加载，c8 V8 原生覆盖率无法统计未加载模块**。本轮必须确保测试通过 `import` 加载目标模块。

---

## 3. 验收标准

### AC-1: 行覆盖率门禁通过
- `npm run coverage:gate` 三项门禁全部通过
- 行覆盖率实测值 ≥28%（非声称值，以 `c8 report --reporter=text-summary` 输出为准）
- 与前一基线 (22.46%) 对比确认无退化

### AC-2: 函数覆盖率稳固
- 函数覆盖率实测值 ≥53%（从当前 50.43% 提升 2.57pp，确保余量）
- 新增测试必须通过 `import` 加载目标模块并直接调用未覆盖函数

### AC-3: 新增用例数量
- 新增测试用例 ≥50 个
- 每个新测试文件覆盖的目标模块必须通过 `import` 加载（不可仅 mock），确保 c8 可插桩
- 测试必须全部通过：`node --test tests/test-*.js` 0 fail

### AC-4: 学习闭环模块重点覆盖
- 以下 R163-R186 学习闭环模块中，至少 **10 个**模块新增测试覆盖：
  - `bookmark-spaced-repetition.js` (+constants/methods)
  - `bookmark-learning-coach.js` (+constants/helpers)
  - `bookmark-learning-goals.js`
  - `bookmark-weekly-digest.js` (+report/stats)
  - `bookmark-highlight-archive.js` (+core/toast)
  - `bookmark-user-profile.js` (+io)
  - `bookmark-knowledge-packs.js` (+core/io/utils)
  - `telemetry.js`
  - `feedback-collector.js`
  - `bookmark-analytics-advanced.js`
  - `bookmark-tag-analytics.js`
- 每个被覆盖模块 ≥5 个用例

### AC-5: 全量回归无退化
- `npm run test:ci` 0 fail（当前 7800 pass，新增后应 ≥7850 pass）
- `npm run lint` 0 errors 0 warnings
- 已有测试不可因新增 import 被破坏

---

## 4. 技术方案概要

### 4.1 策略：零覆盖模块批量激活

1. **精确识别**：运行 `c8 report --reporter=json`，按 `total - covered` 降序排列，输出零覆盖模块 Top-30
2. **筛选**：从 Top-30 中筛选**纯逻辑/无 Chrome API 强依赖**模块（工厂函数注入 mock storage 即可测试）
3. **批量编写测试**：为 Top-15 模块编写测试文件，每模块 ≥5 用例
4. **确保 c8 插桩**：测试文件必须通过 `import` 加载目标模块（不可仅定义 mock 无 import）

### 4.2 重点模块清单

#### 第一梯队：高行数零覆盖模块（优先补测）

| 模块 | 预估行数 | Chrome API 依赖 | 测试策略 |
|------|---------|----------------|---------|
| `bookmark-spaced-repetition.js` | ~528行 | storage | 工厂注入 mock storage |
| `bookmark-spaced-repetition-methods.js` | ~200行 | 无 | 直接测试 |
| `bookmark-spaced-repetition-constants.js` | ~50行 | 无 | 直接测试 |
| `bookmark-learning-coach.js` | ~416行 | storage | 工厂注入 mock |
| `bookmark-learning-coach-helpers.js` | ~150行 | 无 | 直接测试 |
| `bookmark-learning-coach-constants.js` | ~50行 | 无 | 直接测试 |
| `bookmark-learning-goals.js` | ~300行 | storage | 工厂注入 mock |
| `bookmark-weekly-digest.js` | ~580行 | storage | 工厂注入 mock |
| `bookmark-weekly-digest-report.js` | ~150行 | 无 | 直接测试 |
| `bookmark-weekly-digest-stats.js` | ~150行 | 无 | 直接测试 |
| `bookmark-highlight-archive.js` | ~549行 | storage | 工厂注入 mock |
| `bookmark-highlight-archive-core.js` | ~200行 | 无 | 直接测试 |
| `bookmark-highlight-archive-toast.js` | ~100行 | 无 | 直接测试 |
| `bookmark-user-profile.js` | ~535行 | storage | 工厂注入 mock |
| `bookmark-user-profile-io.js` | ~100行 | 无 | 直接测试 |

#### 第二梯队：中等行数零覆盖模块

| 模块 | 预估行数 | 测试策略 |
|------|---------|---------|
| `bookmark-knowledge-packs.js` | ~624行 | 工厂注入 mock |
| `bookmark-knowledge-packs-core.js` | ~200行 | 直接测试 |
| `bookmark-knowledge-packs-io.js` | ~150行 | 直接测试 |
| `knowledge-packs-utils.js` | ~100行 | 直接测试 |
| `telemetry.js` | ~200行 | mock storage |
| `feedback-collector.js` | ~150行 | mock storage |
| `bookmark-analytics-advanced.js` | ~200行 | 直接测试 |
| `bookmark-tag-analytics.js` | ~150行 | 直接测试 |

### 4.3 测试文件组织

- 新增测试文件统一放入 `tests/coverage-boost/` 子目录
- 命名规范：`test-r266-<module-name>.js`
- 从 `test:ci` 排除，通过 `test:ci:coverage` 单独执行（避免拖慢主测试流）
- 每个测试文件结构：
  ```javascript
  import { describe, it, beforeEach } from 'node:test';
  import assert from 'node:assert/strict';
  // 必须 import 目标模块，确保 c8 可插桩
  import { TargetModule } from '../lib/target-module.js';
  // ... test cases
  ```

---

## 5. 技术约束

### 5.1 c8 插桩要求（硬性约束）
- **所有测试必须通过 ES Module `import` 加载目标模块**，否则 c8 V8 native coverage 无法统计
- 不可仅 mock 对象而无 import——这会导致模块行数不计入分母，覆盖率计算失真
- Chrome API 依赖模块需通过工厂函数注入 mock（`createModule({ storage: mockStorage })`）

### 5.2 Chrome API Mock 约束
- Chrome API 依赖（`chrome.storage.local`、`chrome.storage.sync`、`chrome.tabs` 等）必须通过 `globalThis.chrome` mock 注入
- 复用现有 mock 模式（参考 `tests/helpers/` 目录下的 mock 框架）

### 5.3 模块拆分约束
- 如发现目标模块 >400 行，需先拆分再补测试（遵循历史 ≤400 行限制）
- 拆分采用 re-export 模式保持 API 向后兼容

### 5.4 测试质量约束
- 不可仅测试 trivial getter/setter，需覆盖核心业务逻辑分支
- 每个用例必须有明确的 `assert` 断言
- 异常路径（输入非法值、空数据）至少覆盖 1 条

### 5.5 门禁阈值对齐
- 测试完成后，`coverage:gate --lines` 阈值应从 28 收紧至实际达成值（如 ≥28% 则维持或收紧至 30）
- `coverage:gate --functions` 阈值从 50 收紧至 53
- `coverage:gate --branches` 维持 75 不变

---

## 6. 依赖关系

### 6.1 前置依赖
| 依赖项 | 状态 | 说明 |
|--------|------|------|
| R265 测试失败修复 | ✅ 完成 | BookmarkLinkChecker throttle 测试 + getDueCards 默认值断言修复 |
| R256 覆盖率基础设施修复 | ✅ 完成 | coverage/tmp ENOENT 修复 |
| c8 覆盖率工具链 | ✅ 可用 | `npm run test:coverage` 和 `npm run coverage:gate` 可正常运行 |

### 6.2 后续依赖
| 被依赖方 | 关系 | 说明 |
|----------|------|------|
| R267 测试执行效率十二期 | 下游 | R266 新增测试文件可能影响执行时间，R267 需将新增文件从 `test:ci` 隔离 |
| R269 全量回归发布 | 下游 | R266 门禁达标是 v3.3.0 发布的硬性前置条件 |

### 6.3 模块间依赖图

```
R266 (覆盖率门禁达标)
├── 依赖 → R265 (测试修复) ✅
├── 依赖 → R256 (覆盖率基础设施) ✅
├── 被依赖 → R267 (测试效率优化)
├── 被依赖 → R269 (发布收尾)
└── 涉及模块 → R163-R186 学习闭环模块群
    ├── bookmark-spaced-repetition.js → spaced-repetition.js (基础算法)
    ├── bookmark-learning-coach.js → bookmark-learning-goals.js (目标系统)
    ├── bookmark-weekly-digest.js → bookmark-gap-detector.js (盲区检测)
    ├── bookmark-highlight-archive.js → highlight-store.js (选区存储)
    ├── bookmark-user-profile.js → bookmark-clusterer.js (领域分类)
    └── bookmark-knowledge-packs.js → bookmark-io.js (导入导出)
```

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| 零覆盖模块有隐式 Chrome API 依赖导致 mock 复杂 | 中 | 阻塞 | 按"纯逻辑 > 有 mock 模式 > Chrome API 重度依赖"优先级排序 |
| 新增 import 引入副作用（全局状态污染） | 低 | 测试不稳 | 每个测试用 `beforeEach` 重置全局状态 |
| 函数覆盖率 50.43% 刚过线，新增模块可能稀释 | 中 | 门禁失败 | 确保新增测试直接调用目标函数，不依赖间接覆盖 |
| 覆盖率门禁阈值与实测不匹配（历史反复出现） | 高 | 门禁形同虚设 | 完成后以 `c8 report` 实测值为准更新门禁阈值 |

---

## 8. 度量与验收

### 8.1 量化指标

| 指标 | 当前基线 | 目标值 | 验收方式 |
|------|---------|--------|---------|
| 行覆盖率 | 22.46% | ≥28% | `c8 report --reporter=text-summary` |
| 函数覆盖率 | 50.43% | ≥53% | `c8 report --reporter=text-summary` |
| 分支覆盖率 | 78.64% | ≥75% (维持) | `c8 report --reporter=text-summary` |
| 新增用例数 | 0 | ≥50 | `npm run test:ci` 用例数差值 |
| 覆盖模块数 | 0 | ≥10 | 新增测试文件数 |
| 全量回归 | 7800 pass / 0 fail | ≥7850 pass / 0 fail | `npm run test:ci` |

### 8.2 验收检查清单

- [ ] `npm run test:coverage` 无报错，覆盖率报告正常生成
- [ ] `npm run coverage:gate` 三项门禁全部通过
- [ ] 行覆盖率实测 ≥28%（`c8 report` 实测，非声称）
- [ ] 函数覆盖率实测 ≥53%
- [ ] 新增 ≥50 个测试用例
- [ ] ≥10 个 R163-R186 学习闭环模块获得测试覆盖
- [ ] `npm run test:ci` 0 fail
- [ ] `npm run lint` 0 errors 0 warnings
- [ ] `docs/reports/coverage-baseline.md` 已更新

---

## 9. 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-25 | 初始版本，基于 R266 任务描述创建 |
