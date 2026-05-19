# VERIFICATION.md — Iteration #44 Review (R147: ReleaseCandidate2)

> 审查日期: 2026-05-19  
> 审查人: Guard Agent  
> 迭代: R44 — 全量回归与发布候选 ReleaseCandidate2

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 11 个测试失败（目标 0 fail）；CHANGELOG 未更新；Release Notes 文件未生成；package.json 版本未更新 |
| 代码质量 | ⚠️ | 新增方法 `systemPrompt` 默认值与既有 `buildRequest()` 不一致；方法名遮蔽模块级导入函数名（不影响运行但易混淆） |
| 测试覆盖 | ❌ | 行覆盖率 79.85% < 90% 目标；Lint 87 warnings > 0 目标 |
| 文档同步 | ❌ | CHANGELOG.md 未补充 R143-R146 变更记录；`docs/RELEASE-NOTES-v3.1.0-rc2.md` 未生成 |

**总评: ❌ 未通过 — 多项验收标准不达标，不可作为发布候选**

---

## 详细审查

### 1. AC-1: 全量测试回归 — ❌ FAIL

```
# tests 5562
# suites 1160
# pass 5551
# fail 11        ← 要求 0 fail
# cancelled 0
# skipped 0
```

**11 个失败用例明细:**

| # | 测试套件 | 失败用例 | 错误类型 | 可能原因 |
|---|----------|----------|----------|----------|
| 1 | BookmarkSemanticSearch | `_mergeResults 正确合并去重结果` | TypeError: `_mergeResults is not a function` | R145 模块拆分后私有方法可能未正确暴露 |
| 2 | BookmarkVisualizer | `节点半径按连接数缩放 — 高连接数节点更大` | TypeError: `_nodeRadius is not a function` | R145 模块拆分后私有方法可能未正确暴露 |
| 3 | mergeIngestStats | `generatedAt 空字符串不覆盖` | testCodeFailure | 边界条件处理逻辑缺陷 |
| 4 | EvolutionEngine.evolve() | `进化日志记录 previousValue` | testCodeFailure | 行为漂移（R143 已标记 EvolutionEngine 为已知不稳定区域） |
| 5-7 | EvolutionEngine.batchEvolve() | `analyzeStylePreference 在成功回答较多时调整` | testCodeFailure | 同上 |
| 6-7 | EvolutionEngine.batchEvolve() | `analyzeStylePreference 短回答偏好 concise` / `analyzeRetrievalEffectiveness 检测检索不准` | testCodeFailure | 同上 |
| 8-11 | EvolutionEngine.analyzeUserLevel() / reset() | 多个用例 | testCodeFailure | EvolutionEngine 系列共 7 个失败 |

**关键观察:**
- #1、#2 明确是 R145 (ModuleSplitPhase5) 引入的回归：拆分后私有方法 `_mergeResults`、`_nodeRadius` 在子模块中不可访问
- #3 是 R143 (TestFailureBatchFix3) 声称已修复但实际未修复的用例
- #4-#11 全部属于 EvolutionEngine，该模块在 R143 中被标记为"行为漂移"不稳定区域

### 2. AC-2: Lint 质量门禁 — ❌ FAIL (warnings)

```
✖ 87 problems (0 errors, 87 warnings)
```

- 错误: 0 ✅
- 警告: 87 ❌ (目标 0)
- 警告类型: 全部为 `no-unused-vars`（未使用变量/参数/导入）

R144 (LintFinalSweep) 声称已将 max-warnings 收紧，但当前仍有 87 个 warning。推测 R145 模块拆分可能引入了新的未使用导入，或 R144 的清理未完整覆盖所有文件。

### 3. AC-3: 覆盖率报告 — ⚠️ 部分达标

```
Statements : 79.85% ( 37044/46391 )
Branches   : 85.22% ( 7630/8953 )
Functions  : 87.1%  ( 1526/1752 )  ✅ ≥60%
Lines      : 79.85% ( 37044/46391 ) ❌ <90%
```

| 指标 | 要求 | 实际 | 状态 |
|------|------|------|------|
| 行覆盖率 | ≥90% | 79.85% | ❌ 差距 10.15 个百分点 |
| 函数覆盖率 | ≥60% | 87.1% | ✅ 超额达标 |

行覆盖率 79.85% 明显低于 R142 后基线 93.02%，可能原因：
- c8 对 ESM 动态 import 存在覆盖盲区
- R145 模块拆分后产生新的未覆盖路径（拆出的子模块可能缺少独立测试）

### 4. AC-4: CHANGELOG.md — ❌ 未执行

CHANGELOG.md 中**没有任何 R143-R146 的变更记录**，也没有 `## [3.1.0]` 章节。AC-4 完全未被实现。

### 5. AC-5: 发布候选版本标记 — ❌ 未执行

- `package.json` version 仍为 `"1.0.0"`（未更新为 `3.1.0-rc2`）
- `docs/RELEASE-NOTES-v3.1.0-rc2.md` 文件**不存在**

---

## 代码变更审查 (lib/ai-client.js)

### 新增内容
新增两个 AIClient 类方法：`buildOpenAIRequest(messages, options)` 和 `buildClaudeRequest(messages, options)`，作为请求构建的便利包装器。

### 问题 1: systemPrompt 默认值不一致 — ⚠️

```javascript
// 既有 buildRequest() (line 156):
const systemPrompt = options.systemPrompt || this.getSystemPrompt()

// 新增 buildOpenAIRequest() (line 173):
systemPrompt: options.systemPrompt || ''    // ← 空字符串

// 新增 buildClaudeRequest() (line 186):
systemPrompt: options.systemPrompt || ''    // ← 空字符串
```

既有的 `buildRequest()` 在未提供 systemPrompt 时会回退到 `this.getSystemPrompt()`，而新方法回退到空字符串 `''`。如果调用方不显式传入 systemPrompt，新方法会发出**无系统提示的请求**，导致 AI 行为不一致。

**建议:** 统一为 `options.systemPrompt || this.getSystemPrompt()`。

### 问题 2: 方法名遮蔽导入名 — ⚠️ 低风险

```javascript
import { buildOpenAIRequest, buildClaudeRequest, ... } from './ai-client-request.js'

class AIClient {
  buildOpenAIRequest(messages, options) {
    return buildOpenAIRequest(opts)  // 调用的是导入的函数，非 this.buildOpenAIRequest
  }
}
```

JavaScript 作用域规则下，方法体内的 `buildOpenAIRequest` 引用的是模块级导入函数而非 `this.buildOpenAIRequest`，因此**不会导致无限递归**。但这种同名遮蔽在代码维护时极易引起混淆。

**建议:** 重命名类方法为 `buildOpenAIPayload` / `buildClaudePayload`，或在调用时使用别名导入。

---

## 返工任务清单

| 优先级 | 任务 | 对应 AC | 预估复杂度 |
|--------|------|---------|-----------|
| **P0** | 修复 11 个失败测试（BookmarkSemanticSearch、BookmarkVisualizer 的私有方法访问；mergeIngestStats 边界；EvolutionEngine 系列 7 个） | AC-1 | Medium |
| **P0** | 修复 87 个 lint warnings（no-unused-vars），确保 `npm run lint` 输出 0 warnings | AC-2 | Simple |
| **P0** | 提升行覆盖率至 ≥90%（当前 79.85%，需补约 4700 行覆盖）或记录豁免模块清单并获得审批 | AC-3 | Complex |
| **P1** | 在 CHANGELOG.md 中新增 `## [3.1.0] - 2026-05-19` 章节，覆盖 R143-R146 四项变更 | AC-4 | Simple |
| **P1** | 更新 package.json version 为 `3.1.0-rc2` | AC-5 | Trivial |
| **P1** | 创建 `docs/RELEASE-NOTES-v3.1.0-rc2.md` 发布候选报告 | AC-5 | Simple |
| **P2** | 修复 `buildOpenAIRequest` / `buildClaudeRequest` 的 systemPrompt 默认值（改用 `this.getSystemPrompt()`） | 代码质量 | Trivial |
| **P2** | 考虑重命名类方法避免遮蔽导入函数名 | 代码质量 | Trivial |

---

## 结论

**本次迭代 R147 (ReleaseCandidate2) 未能完成既定目标。** 5 项验收标准中有 4 项明确不达标（AC-1 测试、AC-2 Lint、AC-4 CHANGELOG、AC-5 发布标记），1 项部分不达标（AC-3 覆盖率）。Git diff 中仅包含 `lib/ai-client.js` 的 26 行新增代码，未发现任何 CHANGELOG、Release Notes 或 package.json 的变更，说明 AC-4 和 AC-5 完全未被实施。

**建议:** 将 11 个失败测试和 87 个 lint warnings 作为 R148 的首要任务，待测试/CI 全绿后再执行发布候选流程。

---

*审查生成于 2026-05-19 | Guard Agent | 迭代 #44*