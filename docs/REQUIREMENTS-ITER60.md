# 需求文档 — R162: 全量回归与发布收尾 ReleaseRegressionR55

> 迭代: R60 | 日期: 2026-05-19 | 复杂度: Simple

---

## 1. 用户故事

**作为** PageWise 项目发布管理者，**我希望** 在 R158-R161 全部模块拆分和代码清理完成后执行一次完整的质量门禁检查（测试、lint、覆盖率、变更记录），**以便** 确认代码库处于可发布状态并输出正式的发布候选版本号，给下游用户和贡献者一个可信赖的里程碑快照。

---

## 2. 现状分析

### 2.1 质量门禁现状

| 指标 | 当前状态 | 目标 | 差距 |
|------|----------|------|------|
| `npm run test:ci` | **6170 pass / 1 fail** | 0 fail | ⚠️ 1 处失败 |
| `npm run lint` | **0 errors / 21 warnings** | 0 errors / 0 warnings | ⚠️ 21 处警告 |
| 行覆盖率 (c8) | **22.15%** (10265/46334) | ≥80% | 🔴 差距巨大 |
| CHANGELOG.md | 最新条目为 v3.0.0 (2026-05-16)，缺少 R158-R161 记录 | 补齐 | ⚠️ 缺失 |
| 版本号 | 1.0.0 | 输出 RC 版本号 | 待定 |

### 2.2 失败测试根因

唯一失败的测试是 `R159: ESLint 0 warnings` 测试用例——它验证 `npm run lint` 输出 **0 warnings**，但当前实际有 21 个 `no-unused-vars` / `no-undef` 警告残余：

| 分类 | 数量 | 文件 |
|------|------|------|
| `no-undef` (Buffer) | 3 | bookmark-sharing.js (2), skill-store-community.js (1) |
| `no-unused-vars` (赋值未使用) | 15 | sidebar.js (7), options/options.js (1), wiki-query-prompts.js (2), skill-validator.js (1), skill-zip.js (1), bookmarks/bookmark-*.js (3) |
| `no-unused-vars` (参数未使用) | 2 | storage-adapter.js (1), utils.js (1) |
| `no-unused-vars` (解构未使用) | 1 | lib/i18n.js (1) |

**注意**: 这 21 个警告是 R159 阶段声称已清零但实际未完全消除的残余。R162 必须彻底修复，以解除测试失败的阻塞。

### 2.3 覆盖率分析

c8 报告行覆盖率 22.15% 远低于 R152 迭代时声称的 80.24%。可能原因：

1. R158-R161 模块拆分大量增加新文件（门面层 + 子模块），覆盖率分母（总源代码行数）从 ~25K 行膨胀至 ~46K 行。
2. 新拆分出的子模块未被现有测试覆盖（测试仍通过原门面层导入，部分新增文件完全不在测试执行路径上）。
3. c8 测量范围包含所有 `lib/` 文件（含 content script、popup、options 等非核心模块），而 `test:ci` 仅执行 `tests/test-*.js`。

R162 需要：
- 确认覆盖率度量方法与 `coverage:gate` (`c8 check-coverage --lines 80`) 一致。
- 若因模块拆分导致覆盖率分母扩大，需决定是**扩大测试覆盖范围**还是**调整覆盖率度量范围**（仅覆盖核心 lib 模块）。
- 最终以 `npm run coverage:gate` 通过为准。

### 2.4 CHANGELOG 缺口

CHANGELOG.md 当前最新条目为 `[3.0.0] - 2026-05-16`，以下迭代无记录：

| 迭代 | 提交摘要 | 变更类型 |
|------|----------|----------|
| R158 | sidebar.js 超大模块拆分落地 (7705 行 → 5 子模块) | 架构重构 |
| R159 | ESLint 警告清零 (43 → 0) | 代码质量 |
| R160 | 覆盖率基础设施修复 | 工程基础设施 |
| R161 | 超大 lib 文件拆分八期 (8 文件 ≤400 行) | 架构重构 |

---

## 3. 验收标准

### AC1：测试全量通过

- [ ] `npm run test:ci` 输出 **0 fail**。
- [ ] 若有 flaky test（间歇性失败），标记为 `skip` 并在 CHANGELOG 中记录。
- [ ] 确认测试用例数与 R161 完成时一致（≥6170 用例），不因修复而削减测试。

**验证命令**:
```bash
npm run test:ci
# 预期: # fail 0
```

### AC2：Lint 零警告

- [ ] `npm run lint` 输出 **0 errors / 0 warnings**。
- [ ] 21 个残余警告全部修复（删除未使用变量/导入/参数，或前缀 `_` 标记有意忽略项）。
- [ ] `Buffer` 未定义警告：在相关文件顶部添加 `/* global Buffer */` 注释或替换为 `btoa`/`Uint8Array` 方案。
- [ ] 修复后 `R159: ESLint 0 warnings` 测试用例自动通过。

**验证命令**:
```bash
npm run lint
# 预期: 0 problems (0 errors, 0 warnings)
```

### AC3：行覆盖率 ≥80%

- [ ] `npm run coverage:gate` 通过（`c8 check-coverage --lines 80`）。
- [ ] 若当前 c8 全量测量为 22.15%（含所有源文件），需排查差异原因并选择以下策略之一：
  - **策略 A**：扩大测试覆盖范围，为目标模块补充测试用例直至 80%。
  - **策略 B**：调整 c8 配置范围，仅度量核心 lib 模块（排除 content script / popup / options 等浏览器 UI 层代码），使分母合理化。
- [ ] 策略选择需在本文档的"设计决策"章节记录理由。
- [ ] 覆盖率结果输出到 `coverage/tmp/` 目录。

**验证命令**:
```bash
npm run test:coverage    # 生成覆盖率报告
npm run coverage:gate    # 门禁检查 ≥80%
```

### AC4：CHANGELOG 补齐 R158-R161

- [ ] 在 CHANGELOG.md 中新增 `[3.1.0-rc.1] - 2026-05-19` 版本条目。
- [ ] 按 Keep a Changelog 格式记录 R158-R161 变更：
  - **变更 (Changed)**: sidebar.js 拆分为 5 个子模块、8 个 lib 文件拆分至 ≤400 行。
  - **修复 (Fixed)**: ESLint 警告清零（21 处残余）。
  - **工程 (Infrastructure)**: 覆盖率基础设施修复。
- [ ] 条目使用中文，与现有 CHANGELOG 风格一致。

### AC5：发布候选版本号输出

- [ ] `package.json` 中 `version` 字段更新为 `3.1.0-rc.1`。
- [ ] 版本号遵循语义化版本规范：`MAJOR.MINOR.PATCH-rc.N`。
  - **MAJOR**: 3（沿用 v3.0.0 系列）
  - **MINOR**: 1（新增架构重构——sidebar 拆分 + lib 文件拆分）
  - **PATCH**: 0
  - **预发布标签**: rc.1
- [ ] 在 CHANGELOG 对应版本条目中注明"发布候选"字样。

---

## 4. 技术约束

### 4.1 修复优先级

按以下顺序执行修复，每步完成后验证：

```
① 修复 21 个 lint 警告 → npm run lint (0/0)
② 验证 R159 测试用例恢复通过 → npm run test:ci (0 fail)
③ 排查覆盖率差距 → 选择策略 A 或 B
④ 执行策略，达成 npm run coverage:gate 通过
⑤ 更新 CHANGELOG.md + package.json version
⑥ 最终全量验证
```

### 4.2 Lint 警告修复规范

- **未使用变量**: 若变量赋值后未读取，删除赋值；若赋值是解构的副作用，前缀 `_`。
- **未使用参数**: 回调函数签名中未使用的参数前缀 `_`（如 `(key, _value) =>`）。
- **`Buffer` 未定义**: 在 `.eslintrc` 或文件顶部声明 `/* global Buffer */`；或改用 `btoa()` / `atob()`。
- **禁止修改业务逻辑**: 仅做标记性修复，不改变任何运行时行为。

### 4.3 覆盖率度量规范

- 使用 `c8`（已在 devDependencies 中）作为唯一覆盖率工具。
- `coverage:gate` 脚本使用 `c8 check-coverage --lines 80` 作为硬门禁。
- 覆盖率报告格式: lcov (for CI) + text-summary (for terminal)。

### 4.4 版本号规范

- 预发布版本使用 `-rc.N` 后缀（不使用 `-alpha` / `-beta`）。
- RC 版本不发布到 Chrome Web Store，仅供内测验证。
- 若 RC 验证通过，后续发布 `3.1.0` 正式版本（去掉 `-rc.1`）。

### 4.5 禁止事项

- 禁止在本次迭代中新增功能代码。
- 禁止删除现有测试用例（除非测试本身有 bug）。
- 禁止修改 R158-R161 已完成的拆分结构。
- 禁止引入新的第三方依赖。

---

## 5. 依赖关系

### 5.1 上游依赖

| 依赖项 | 说明 | 状态 |
|--------|------|------|
| R158: sidebar.js 拆分落地 | sidebar 目录结构已稳定，但遗留 7 处 lint 警告 | ⚠️ 需收尾 |
| R159: ESLint 警告清零 | 声称 0 warnings 但实测 21 warnings | ❌ 未完成 |
| R160: 覆盖率基础设施修复 | c8 配置已修复，但覆盖率仅 22.15% | ⚠️ 需收尾 |
| R161: 超大 lib 文件拆分八期 | 8 个文件拆分完成，但可能增加了未覆盖代码 | ⚠️ 需收尾 |

**结论**: R158-R161 各自声称完成但均存在收尾缺口。R162 的核心使命是**补齐这些缺口，实现真正的质量门禁闭环**。

### 5.2 下游影响

| 受影响项 | 说明 |
|----------|------|
| Chrome Web Store 发布 | RC 通过后可推进正式发布 |
| 用户升级体验 | 3.1.0 版本需验证书签功能在新模块结构下的运行正常 |
| 后续迭代基线 | R162 确立的质量基线将成为后续迭代的起点 |

### 5.3 无并行任务

R162 是收尾迭代，所有子任务有严格串行依赖：lint 修复 → 测试通过 → 覆盖率达标 → 文档更新 → 版本号更新。

---

## 6. 设计决策记录

> 以下决策在实施过程中由 Agent 根据实际情况选择并记录。

### DEC-1: 覆盖率策略选择

| 选项 | 描述 | 适用条件 |
|------|------|----------|
| 策略 A: 扩大测试 | 为目标模块补充测试用例 | 差距可管理（≤50 个用例） |
| 策略 B: 调整范围 | c8 配置仅度量核心 lib 模块 | 差距过大，扩测试不可行 |

**待实施时决定**: R60 Agent 需先分析 `c8` 配置和实际测量范围，对比 R152 的 80.24% 测量方法，选择最合理的策略。

### DEC-2: Buffer 修复方案

| 选项 | 描述 | 影响 |
|------|------|------|
| 方案 A: global 声明 | `/* global Buffer */` | 最小改动，但可能掩盖环境兼容问题 |
| 方案 B: 替换 API | 用 `btoa()`/`Uint8Array` 替代 | 更规范，但改动量更大 |

---

## 7. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 覆盖率 22.15% → 80% 需大量补充测试 | 工作量可能超出 Simple 级别 | 中 | DEC-1 策略 B 可快速达标 |
| 修复 lint 警告时误触业务逻辑 | 回归测试失败 | 低 | 仅做标记性修复（前缀 `_`），不改逻辑 |
| R158-R161 拆分引入隐藏 bug | 测试通过但运行时异常 | 低 | R162 全量回归 + 覆盖率检查双重验证 |
| 版本号冲突（3.1.0-rc.1 已存在） | 发布流程阻塞 | 极低 | 首次 RC，不存在冲突 |

---

## 8. 验证清单

最终发布前逐项验证：

```bash
# 1. 测试全量通过
npm run test:ci
# 预期: # fail 0

# 2. Lint 零警告
npm run lint
# 预期: 0 problems (0 errors, 0 warnings)

# 3. 覆盖率门禁
npm run test:coverage
npm run coverage:gate
# 预期: Lines >= 80%

# 4. CHANGELOG 已更新
grep "3.1.0-rc.1" CHANGELOG.md
# 预期: 匹配

# 5. 版本号已更新
node -e "console.log(require('./package.json').version)"
# 预期: 3.1.0-rc.1

# 6. R159 测试恢复通过
npm run test:ci 2>&1 | grep "R159"
# 预期: ok (not "not ok")
```

---

*文档生成于 2026-05-19*
*遵循飞轮迭代流程 (flywheel-iteration)*
