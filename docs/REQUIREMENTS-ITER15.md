# 需求文档 — R118: 测试失败修复 TestFailureFix

> 迭代: 飞轮 R15 (Phase J)
> 日期: 2026-05-19
> 复杂度: Simple

---

## 1. 用户故事

**作为** PageWise 项目的维护者，
**我希望** 全量测试回归绿灯、ESLint 零解析错误，
**以便** 后续迭代（R119-R122）在一个稳定的基线上推进，不再被历史遗留的语法错误阻断。

---

## 2. 背景与问题分析

### 2.1 当前状态

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 全量测试 pass | 4628 | 4630 |
| 全量测试 fail | **2** | **0** |
| 测试文件数 | 776 | 776（不变） |
| ESLint 解析错误 | **2**（SyntaxError 导致文件无法解析） | 0 |

### 2.2 根因分析

两个失败均由 **R115 (TestSuiteTrim)** 合并测试文件时清理不彻底导致：

**问题 1：`tests/test-bookmark-backup-restore.js`（1131 行）**
- 行 32 声明了 `function bm(id, title, url, folderPath, tags)`
- 行 645 再次声明了同名 `function bm(...)` —— 来自被合并的另一个测试文件
- ES Module 在严格模式下不允许重复函数声明 → `SyntaxError: Identifier 'bm' has already been declared`
- 导致整个文件 53 个用例全部未执行（报告 0 pass）

**问题 2：`tests/test-bookmark-release.js`（813 行）**
- 行 10 有 `import { describe, it } from 'node:test'`
- 行 413 再次出现 `import { describe, it, beforeEach } from 'node:test'` —— 来自被合并的 `test-bookmark-rc.js` 的头部残留
- ES Module 不允许重复 `import` 声明 → `SyntaxError: Identifier 'describe' has already been declared`
- 导致整个文件 15+ 个用例全部未执行

> **注**：这两个 SyntaxError 同时也是 ESLint 无法解析文件的原因（ESLint parsing error），因此本任务修复 2 个 SyntaxError = 修复 2 个 ESLint parsing error + 修复 2 个测试文件。

---

## 3. 验收标准

| # | 验收标准 | 验证方式 |
|---|----------|----------|
| AC-1 | `npm test` 输出 **# fail 0**，全量回归 0 失败 | `npm test 2>&1 \| grep "# fail"` |
| AC-2 | `node --test tests/test-bookmark-backup-restore.js` 通过，53 用例全绿 | 单文件运行，检查 `# pass 53` |
| AC-3 | `node --test tests/test-bookmark-release.js` 通过，15+ 用例全绿 | 单文件运行，检查 `# pass ≥15` |
| AC-4 | `npm run lint` 对这两个文件无 parsing error | `eslint tests/test-bookmark-backup-restore.js tests/test-bookmark-release.js` 无 fatal 错误 |
| AC-5 | 修改仅限测试文件，不变更任何 `lib/` 源码 | `git diff --name-only` 仅显示 `tests/` 目录 |

---

## 4. 技术方案约束

### 4.1 修复范围（仅限测试文件）

| 文件 | 问题 | 修复方式 |
|------|------|----------|
| `tests/test-bookmark-backup-restore.js` | 行 645 重复声明 `function bm(...)` | 删除第二个 `bm` 函数声明（行 639-647），复用行 32 已有的 `bm`；或重命名为 `bm2`/`createTestBookmark` |
| `tests/test-bookmark-release.js` | 行 413 重复 `import { describe, it, beforeEach } from 'node:test'` | 删除行 413-414 的重复 import，保留行 10 的原始 import（如有 `beforeEach` 需求，合并到行 10） |

### 4.2 约束

- **不修改 `lib/` 源码**：所有修复仅针对 `tests/` 目录
- **不删除测试用例**：合并入的用例全部保留，仅修复声明冲突
- **不改变测试语义**：断言逻辑和覆盖范围不变
- **不新增文件**：在现有文件内修复
- **遵循 R115 合并模式**：保留 `// R115 merge:` 注释风格

### 4.3 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 删除重复声明后，被合并模块的变量作用域失效 | 个别用例引用不到变量 | 确认被删除的声明在文件内有等价定义 |
| 合并后的测试套件共享可变状态 | 用例间相互干扰 | 运行前确认 `beforeEach` 正确重置状态 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R115 (TestSuiteTrim) | 前置 | 问题是 R115 合并遗留，需理解合并上下文 |
| R116 (ModuleRefactor) | 无直接影响 | 但拆分后的模块结构决定 import 路径 |
| R119 (LintWarningCleanup) | 后续依赖 | 本任务修复 parsing error 后，R119 才能清理剩余 eqeqeq 警告 |
| R121 (TestStabilityHardening) | 后续依赖 | 本任务 0 fail 是建立 flaky test 检测基线的前提 |

---

## 6. 预期产出

- `tests/test-bookmark-backup-restore.js` — 修复重复 `bm` 声明，53 用例全部通过
- `tests/test-bookmark-release.js` — 修复重复 `import`，所有用例全部通过
- 全量回归: **4630 pass / 0 fail**
- ESLint: 对这两个文件 **0 parsing error**

---

## 7. 不在范围内

- ESLint `eqeqeq` / `no-unused-vars` 等 warning 清理 → R119
- 其他测试文件的质量审查 → R121
- 任何 `lib/` 源码修改

---

*文档版本: v1.0 | 作者: Plan Agent | 日期: 2026-05-19*
