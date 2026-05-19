# 需求文档 — 飞轮迭代 R21

> 日期: 2026-05-19
> 迭代: R124
> 作者: Plan Agent

---

## R124: ESLint 警告彻底清除 LintWarningZero

### 1. 用户故事

作为 **PageWise 项目的开发者**，我希望代码库的 ESLint 检查结果为零警告零错误，这样 CI 流水线可以将 lint 作为硬性门禁，防止代码质量退化，同时让所有警告都指向真正的潜在问题而非历史遗留噪音。

---

### 2. 验收标准

| # | 验收条件 | 验证方式 |
|---|---------|---------|
| AC-1 | `npm run lint` 输出 **0 errors, 0 warnings** | 命令行运行，exit code 0 |
| AC-2 | `no-unused-vars` 规则级别从 `warn` 收紧为 **`error`** | 检查 `eslint.config.js` 第 115 行规则配置 |
| AC-3 | 所有全量测试回归通过（`npm run test:ci` 0 fail），证明清理操作未引入功能回退 | CI 流水线绿灯 |
| AC-4 | `eqeqeq` 规则已无残留错误（当前 8 个 `!=`/`==` 残留在 `bookmark-advanced-search.js`） | ESLint 输出无 eqeqeq 错误 |
| AC-5 | 有意忽略的变量/参数已统一使用 `_` 前缀标记（符合 `argsIgnorePattern` / `varsIgnorePattern` / `caughtErrorsIgnorePattern`） | 代码审查 |

---

### 3. 现状分析

#### 3.1 问题规模

| 指标 | 数量 |
|------|------|
| 总 lint 问题 | 205 |
| `no-unused-vars` 警告 | **197** |
| `eqeqeq` 错误 | **8** |
| 涉及文件数 | **~51 个**（lib/ + background/ + content/ + popup/ + options/） |

#### 3.2 警告分类分布

| 类别 | 数量 | 典型模式 | 处理策略 |
|------|------|---------|---------|
| **未使用 catch 参数** | ~82 | `catch (e) { ... }` — `e` 未引用 | 重命名为 `_e` 或 `_` |
| **未使用变量/赋值** | ~62 | 解构后未用的字段、声明但未读的局部变量 | 删除声明，或 `_` 前缀标记 |
| **未使用函数/导出** | ~31 | 已定义但未调用的函数（如 `createFloatBtn`、`groupByFolder`） | 评估是否可删除；若为公共 API 则保留并 `_` 前缀或 `eslint-disable` 注释说明 |
| **未使用导入/常量** | ~19 | `import { DocMindClient }` 但未使用；`const TAG_COLORS = ...` 未引用 | 删除导入；或确认为预留 API 后加 `eslint-disable-next-line` 注释 |

#### 3.3 附带问题

`bookmark-advanced-search.js` 存在 **8 个 eqeqeq 错误**（`==` / `!=` 未替换为 `===` / `!==`），是 R119 清理的遗漏。本轮需一并修复。

---

### 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零行为变更** | 本轮仅做代码清理（删除/重命名），不允许引入新功能或改变运行时行为 |
| **API 向后兼容** | 已导出的公共函数不可删除。若为未来预留的导出，需用 `// eslint-disable-next-line no-unused-vars` 注释标记，并附说明 |
| **`_` 前缀规范** | 有意忽略的参数/变量统一使用 `_` 或 `_descriptiveName` 前缀（已配置 `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern` 为 `^_`） |
| **catch 参数最小化** | 无引用的 catch 参数使用 `catch (_e)` 或仅 `catch`（ES2019+ 允许省略 catch 绑定） |
| **测试文件已豁免** | `tests/**/*.js` 已在 ESLint 配置中关闭 `no-unused-vars`，本轮不需修改测试文件 |
| **ESLint flat config** | `eslint.config.js` 使用 ESM flat config 格式（ESLint v9+），修改规则级别仅需改一处 |

---

### 5. 实施策略

按优先级分批处理，每批修改后运行 `npm run test:ci` 确认无回退：

| 批次 | 范围 | 预计工作量 |
|------|------|-----------|
| **Batch 1** | catch 参数重命名 `e` → `_e`（82 处，纯机械替换） | 低 |
| **Batch 2** | 未使用变量/赋值删除或 `_` 前缀（62 处，需逐个审查是否可删） | 中 |
| **Batch 3** | 未使用函数/导入清理（50 处，需判断是否为公共 API 预留） | 中 |
| **Batch 4** | eqeqeq 残留修复（8 处，`bookmark-advanced-search.js`） | 低 |
| **Batch 5** | 收紧规则 + 最终验证 | 低 |

---

### 6. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| **R119** (eqeqeq 清理) | 前置已完成 | R119 将 eqeqeq 从 warn 改为 error，但遗漏了 8 处。本轮需补完 |
| **R123** (测试失败批量修复) | 前置已完成 | R123 确保测试基线绿色，本轮修改不会破坏已有测试 |
| **R125** (超大模块拆分收尾) | 后续 | 若本轮在大文件中发现可删除的死代码，可为 R125 减少行数 |
| **R126** (循环依赖消除) | 后续 | 未使用的导入可能是循环依赖的残留，清理后有助于 R126 分析 |
| **CI 流水线** | 并行 | R113 已将 ESLint 集成到 CI，规则收紧后 CI 自动执行更严格门禁 |

---

### 7. 风险与缓解

| 风险 | 可能性 | 缓解措施 |
|------|--------|---------|
| 误删"看似未使用但实际通过动态方式引用"的导出 | 低 | 搜索全局引用确认后再删；保留的用 `eslint-disable` 注释并附说明 |
| catch 参数改为 `_e` 后影响错误日志 | 极低 | 大部分 catch 块本身不引用该参数；若引用则不修改 |
| 规则收紧后 CI 合入新 PR 时出现 lint 失败 | 中 | 渐进收紧：先清除所有警告 → 确认 0 warning → 再改规则为 error → 二次验证 |

---

### 8. 成功指标

| 指标 | 目标值 |
|------|--------|
| `npm run lint` warnings | **0** |
| `npm run lint` errors | **0** |
| `npm run test:ci` failures | **0** |
| 涉及修改文件数 | ~51 个 |
| 新增/修改代码行数 | < 200 行（主要是删除和重命名） |

---

### 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-19 | 初始版本，基于 lint 输出 205 problems (8 errors, 197 warnings) 分析 |
