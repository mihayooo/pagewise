# 设计文档 — R215: 测试失败修复 TestFailureFixR215

> 迭代: R57 | 创建日期: 2026-05-20 | 复杂度: Simple

---

## 1. 问题根因分析

### 1.1 故障现场

```
$ npm run test:ci:lint
not ok 4 - 关键 lib 文件未使用变量审查
  └── not ok 1 - 所有 lib 文件中 _MS_PER_DAY 使用下划线前缀（有意未使用）
      at tests/test-r201-lint-warning-final.js:164
```

### 1.2 根因链

```
R212 (PostLaunchTelemetry) 新增 lib/feedback-collector.js
  → 引入 const MS_PER_DAY = 24 * 60 * 60 * 1000  (第 36 行)
  → 该常量非 export，且未使用 _ 下划线前缀
  → R159/R201 建立的 lint 规范测试扫描 lib/ 所有 .js 文件
    → 规则: const MS_PER_DAY = (无前缀) 必须是 export const MS_PER_DAY
    → feedback-collector.js 违反此约定
  → test-r201-lint-warning-final.js:164 断言失败
```

### 1.3 当前 `MS_PER_DAY` 使用全景

| 文件 | 写法 | 状态 |
|------|------|------|
| `lib/bookmark-spaced-repetition-constants.js:11` | `export const MS_PER_DAY = 86400000` | ✅ 合规（导出） |
| `lib/bookmark-spaced-repetition-methods.js:12` | `import { MS_PER_DAY, ... } from '...'` | ✅ 合规（消费导出） |
| `lib/bookmark-spaced-repetition.js:13,26` | `import/export { MS_PER_DAY, ... }` | ✅ 合规（重导出） |
| `lib/bookmark-learning-coach.js:44` | `const _MS_PER_DAY = 86400000` | ✅ 合规（下划线前缀） |
| `lib/bookmark-learning-goals.js:46` | `const _MS_PER_DAY = 86400000` | ✅ 合规（下划线前缀） |
| `lib/feedback-collector.js:36` | `const MS_PER_DAY = 24 * 60 * 60 * 1000` | ❌ **违规** |
| `lib/feedback-collector.js:142` | `/ MS_PER_DAY` (引用) | ❌ **违规**（跟随声明） |

---

## 2. 设计决策

### D-R215-1: 重命名策略 — 修改 feedback-collector.js vs 修改测试

| 维度 | 方案 A: 修改源文件（重命名常量） | 方案 B: 修改测试（放宽规则） |
|------|--------------------------------|---------------------------|
| 描述 | 将 `MS_PER_DAY` → `_MS_PER_DAY`，符合既有约定 | 修改 test-r201-lint-warning-final.js 为 feedback-collector.js 加白名单 |
| 对代码规范的影响 | 统一所有 lib 文件的私有常量命名约定 | 破坏 R201 建立的 lint 规范一致性 |
| 改动范围 | 1 个文件，2 处改动 | 1 个测试文件，新增条件排除 |
| 长期维护 | 后续新模块自动遵循约定 | 需记住白名单，增加维护负担 |

**✅ 选择方案 A：修改源文件**。
- 改动最小（2 处），纯重命名，零逻辑变更
- 统一项目命名约定，遵循既有先例（coach / goals 模块均用 `_MS_PER_DAY`）
- 测试断言正确，不应削弱测试来适应不规范的源码

### D-R215-2: 常量值是否需要统一

| 项目 | 当前值 |
|------|--------|
| `bookmark-spaced-repetition-constants.js` | `86400000` |
| `bookmark-learning-coach.js` | `86400000` |
| `bookmark-learning-goals.js` | `86400000` |
| `feedback-collector.js` | `24 * 60 * 60 * 1000` |

所有值在数学上等价（`24 × 60 × 60 × 1000 = 86,400,000`）。`feedback-collector.js` 使用表达式写法，语义更清晰（"24 小时 × 60 分 × 60 秒 × 1000 毫秒"）。

**✅ 保持当前表达式写法不变**。R215 范围仅限命名前缀修复，不涉及值的统一化。表达式写法本身语义更明确，且 `feedback-collector.js` 是独立模块，不依赖 `bookmark-spaced-repetition-constants.js` 的导出。

### D-R215-3: 是否需要引入共享常量模块

不引入。`feedback-collector.js` 是遥测/反馈模块，与书签间隔重复学习模块（spaced-repetition）域无关。从 `bookmark-spaced-repetition-constants.js` 导入 `MS_PER_DAY` 会引入不必要的模块耦合。各模块各自声明自己的时间常量，保持模块独立性。

---

## 3. 需要修改的文件

| # | 文件 | 变更类型 | 变更内容 |
|---|------|---------|---------|
| 1 | `lib/feedback-collector.js` | **修改** | 第 36 行: `const MS_PER_DAY` → `const _MS_PER_DAY` |
| 2 | `lib/feedback-collector.js` | **修改** | 第 142 行: `/ MS_PER_DAY` → `/ _MS_PER_DAY` |

**合计: 1 个文件，2 处改动。不新增任何文件。**

---

## 4. 详细变更设计

### 4.1 `lib/feedback-collector.js` — 第 36 行（常量声明）

**变更前**:
```js
/** 毫秒/天 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

**变更后**:
```js
/** 毫秒/天 */
const _MS_PER_DAY = 24 * 60 * 60 * 1000;
```

### 4.2 `lib/feedback-collector.js` — 第 142 行（常量引用）

**变更前**:
```js
const daysSinceInstall = (nowFn() - installDate) / MS_PER_DAY;
```

**变更后**:
```js
const daysSinceInstall = (nowFn() - installDate) / _MS_PER_DAY;
```

### 4.3 变更说明

- `_MS_PER_DAY` 是模块内部常量（`shouldShowPrompt()` 中计算天数差），不对外暴露
- ESLint 规则 `no-unused-vars` 配置了 `varsIgnorePattern: /^_/`，`_` 前缀使该常量被 lint 视为"有意未使用的变量"，不会触发警告
- `feedback-collector.js` 中 `MS_PER_DAY` 仅在上述两处出现（经 grep 确认），无遗漏

---

## 5. 新增的函数/类

**无新增函数或类**。本需求为纯变量重命名，不涉及功能代码变更。

---

## 6. 接口设计

**无接口变更**。`_MS_PER_DAY` 是模块内部私有常量，不在任何导出接口中。

### 6.1 FeedbackCollectorAPI 不受影响

`feedback-collector.js` 导出的公共 API（`createFeedbackCollector` / `_createFeedbackCollector`）签名和行为完全不变：

| 方法 | 行为 | 是否变化 |
|------|------|---------|
| `shouldShowPrompt()` | 检查安装满 7 天 + 未提交/跳过 | ❌ 不变 |
| `submitFeedback(score, comment)` | 存储 NPS 反馈 + 触发通知 | ❌ 不变 |
| `dismissPrompt()` | 标记跳过 | ❌ 不变 |
| `getNPSCategory(score)` | NPS 分类判定 | ❌ 不变 |
| `getFeedback()` | 读取反馈 | ❌ 不变 |
| `exportFeedback()` | 导出 JSON | ❌ 不变 |

---

## 7. 设计决策记录

| ID | 决策 | 原因 |
|----|------|------|
| D-R215-1 | 修改源文件（重命名常量）而非修改测试 | 统一项目命名约定，不削弱 R201 lint 规范 |
| D-R215-2 | 保持 `24 * 60 * 60 * 1000` 表达式写法 | 语义清晰，不在 R215 范围内做值统一化 |
| D-R215-3 | 不引入共享常量模块 | feedback-collector 与 spaced-repetition 域无关，保持模块独立 |

---

## 8. 验收标准与验证方案

| AC | 验收标准 | 验证命令 | 预期输出 |
|----|---------|---------|---------|
| AC-1 | `feedback-collector.js` 中 `MS_PER_DAY` 重命名为 `_MS_PER_DAY` | `grep -n "MS_PER_DAY" lib/feedback-collector.js` | 所有匹配项均带 `_` 前缀 |
| AC-2 | `test-r201-lint-warning-final.js:164` 断言通过 | `node --test tests/test-r201-lint-warning-final.js` | 17 pass / 0 fail |
| AC-3 | `npm run lint` 保持 0 errors / 0 warnings | `npm run lint` | `✔ 0 problems` |
| AC-4 | `npm run test:ci` 全量回归无新增失败 | `npm run test:ci` | pass 数 ≥ 7139, fail = 0（或仅 E2E 环境失败） |
| AC-5 | 功能行为不变 | `shouldShowPrompt()` 7 天计算逻辑 | 逻辑不变（纯变量重命名） |

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 重命名遗漏某处引用 | 极低 | 中 | `feedback-collector.js` 中仅 2 处使用 `MS_PER_DAY`（第 36、142 行），已 grep 确认 |
| 影响运行时行为 | 无 | — | 纯变量重命名，逻辑不变 |
| ESLint 对 `_MS_PER_DAY` 报新的 warning | 无 | — | `varsIgnorePattern: '^_'` 规则已在 R154/R159 中配置 |

---

## 10. 预估工作量

| 阶段 | 工作项 | 预估 |
|------|--------|------|
| 修改 | `lib/feedback-collector.js` 两处重命名 | ~1 min |
| 验证 | `npm run lint` + `node --test tests/test-r201-lint-warning-final.js` | ~1 min |
| 回归 | `npm run test:ci` 全量验证 | ~5 min |
| **合计** | | **~7 min** |

---

> 文档版本: v1.0 | 生成时间: 2026-05-20
> 飞轮迭代 R57 — PageWise Chrome Extension
