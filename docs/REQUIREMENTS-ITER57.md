# 需求文档 — R215: 测试失败修复 TestFailureFixR215

> 迭代: R57 | 日期: 2026-05-20 | 复杂度: Simple

---

## 1. 用户故事

**作为** PageWise 维护者，**我希望**修复 `lib/feedback-collector.js` 中未加下划线前缀的 `MS_PER_DAY` 常量，**以便** `test-r201-lint-warning-final.js:164` 的 lint 规范断言通过，`npm run test:ci:lint` 恢复 0 fail。

---

## 2. 现状分析

### 2.1 失败现象

运行 `npm run test:ci:lint` 时，`test-r201-lint-warning-final.js` 第 164 行断言失败：

```
not ok 4 - 关键 lib 文件未使用变量审查
  └── not ok 1 - 所有 lib 文件中 _MS_PER_DAY 使用下划线前缀（有意未使用）
```

### 2.2 根因

R212（PostLaunchTelemetry）在 `lib/feedback-collector.js` 中新增了 `MS_PER_DAY` 常量（第 36 行）：

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

该常量**不带下划线前缀**且**未导出**。R159/R201 建立的 lint 规范测试扫描 `lib/` 目录下所有 `.js` 文件，规则为：

- `const MS_PER_DAY =`（无前缀）→ 必须是 `export const MS_PER_DAY`，否则断言失败
- 非导出的模块内常量 → 应使用 `_MS_PER_DAY` 前缀

项目中已有两处正确的先例：
- `lib/bookmark-learning-coach.js`：`const _MS_PER_DAY = 86400000;` ✅
- `lib/bookmark-learning-goals.js`：`const _MS_PER_DAY = 86400000;` ✅

`feedback-collector.js` 是 R212 新增模块，引入时未遵循此约定。

### 2.3 影响范围

| 项目 | 值 |
|------|-----|
| 失败文件 | `tests/test-r201-lint-warning-final.js:164` |
| 源文件 | `lib/feedback-collector.js` |
| 涉及常量 | `MS_PER_DAY`（第 36 行声明，第 142 行使用） |
| 引入迭代 | R212 PostLaunchTelemetry |
| 当前 CI 状态 | `npm run test:ci:lint` 1 fail / 16 pass |

---

## 3. 验收标准

### AC-1: `MS_PER_DAY` 重命名为 `_MS_PER_DAY`

在 `lib/feedback-collector.js` 中：
- 第 36 行：`const MS_PER_DAY` → `const _MS_PER_DAY`
- 第 142 行：`/ MS_PER_DAY` → `/ _MS_PER_DAY`

所有引用同步更新，不允许遗漏。

### AC-2: `test-r201-lint-warning-final.js:164` 断言通过

```bash
node --test tests/test-r201-lint-warning-final.js
# 预期: 17 pass / 0 fail
```

### AC-3: `npm run lint` 保持 0/0

```bash
npm run lint
# 预期: ✔ 0 problems (0 errors, 0 warnings)
```

本次修改仅涉及常量重命名，不应引入新的 lint 问题。

### AC-4: `npm run test:ci` 全量回归无新增失败

```bash
npm run test:ci
# 预期: pass 数 ≥ 7139，fail 数 = 6（仅 E2E Chrome 环境依赖型失败，非本次引入）
```

> **注意**: 当前 `test:ci` 的 6 个 fail 均为 `tests/e2e-chrome/` 目录下的环境依赖型失败（需要真实 Chrome 浏览器，headless CI 中 `page.goto` 被 `ERR_BLOCKED_BY_CLIENT` 阻断）。这些失败**不在本次修复范围内**，与 R215 无关。

### AC-5: 功能行为不变

`MS_PER_DAY` → `_MS_PER_DAY` 是纯重命名，`feedback-collector.js` 的所有功能行为完全不变：
- `shouldShowPrompt()` 的 7 天计算逻辑不变
- `submitFeedback()` 不变
- 导出和通知逻辑不变

---

## 4. 技术约束

### 4.1 修改范围

- **仅修改 1 个源文件**：`lib/feedback-collector.js`（2 处改动：声明 + 使用）
- **不得修改任何测试文件**——测试断言已就绪，修复源文件即可
- **不得修改功能逻辑**——仅变量重命名

### 4.2 命名约定

ESLint 规则 `no-unused-vars` 配置了 `varsIgnorePattern: /^_/`，因此 `_MS_PER_DAY` 作为模块内部使用的常量不会触发 "assigned but unused" 警告。此约定已在项目中广泛使用：

| 文件 | 写法 | 状态 |
|------|------|------|
| `lib/bookmark-learning-coach.js` | `const _MS_PER_DAY` | ✅ 合规 |
| `lib/bookmark-learning-goals.js` | `const _MS_PER_DAY` | ✅ 合规 |
| `lib/bookmark-spaced-repetition-constants.js` | `export const MS_PER_DAY` | ✅ 合规（导出） |
| `lib/feedback-collector.js` | `const MS_PER_DAY` | ❌ 违规 → 需修复 |

### 4.3 不涉及的文件

| 文件 | 原因 |
|------|------|
| `tests/test-r201-lint-warning-final.js` | 测试断言已正确，无需修改 |
| `lib/bookmark-spaced-repetition-constants.js` | 使用 `export const MS_PER_DAY`，符合导出例外规则 |
| 其他 `lib/` 文件 | 已合规 |

---

## 5. 依赖关系

### 5.1 前置依赖

| 依赖 | 说明 |
|------|------|
| R212 PostLaunchTelemetry | `lib/feedback-collector.js` 由 R212 引入，R212 是本次修复的问题源头 |
| R159/R201 Lint 规范测试 | `test-r201-lint-warning-final.js` 建立了 `MS_PER_DAY` 命名规范，是断言的依据 |
| R154 ESLint 配置 | `varsIgnorePattern: /^_/` 规则已配置，`_` 前缀可抑制 `no-unused-vars` |

### 5.2 后续依赖

| 依赖方 | 说明 |
|--------|------|
| CI 流水线 | 修复后 `test:ci:lint` 恢复 0 fail，CI 绿灯 |
| 后续迭代 | 若未来新增类似时间常量，需遵循 `_` 前缀或 `export` 规范 |

### 5.3 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 重命名遗漏某处引用 | 极低 | `feedback-collector.js` 仅 2 处使用 `MS_PER_DAY`，全文 grep 确认 |
| 影响运行时行为 | 无 | 纯变量重命名，逻辑不变；现有单元测试覆盖 `shouldShowPrompt()` |
| 其他 lib 文件存在类似问题 | 低 | 本次 CI 全量回归可暴露 |

---

## 6. 修复清单

| # | 文件 | 行号 | 当前值 | 修复值 |
|---|------|------|--------|--------|
| 1 | `lib/feedback-collector.js` | 36 | `const MS_PER_DAY = 24 * 60 * 60 * 1000` | `const _MS_PER_DAY = 24 * 60 * 60 * 1000` |
| 2 | `lib/feedback-collector.js` | 142 | `… / MS_PER_DAY` | `… / _MS_PER_DAY` |
| | **合计** | | **2 处改动** | |

---

## 7. 验证策略

```bash
# 1. 修复前：确认失败
node --test tests/test-r201-lint-warning-final.js
# 预期: 16 pass / 1 fail (line 164)

# 2. 执行修复（2 处改动）

# 3. 修复后：lint 规范测试
node --test tests/test-r201-lint-warning-final.js
# 预期: 17 pass / 0 fail

# 4. 修复后：lint 检查
npm run lint
# 预期: ✔ 0 problems (0 errors, 0 warnings)

# 5. 修复后：CI 全量回归
npm run test:ci
# 预期: pass 数 ≥ 7139, fail 数 = 6 (仅 E2E 环境失败，非相关)

# 6. 功能验证
node --test tests/test-feedback-collector.js
# 预期: 全部通过（如有独立测试文件）
```

---

*文档版本: v1.0 | 生成时间: 2026-05-20*
*飞轮迭代 R57 — PageWise Chrome Extension*
