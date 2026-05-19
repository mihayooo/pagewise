# 需求文档 — R154: ESLint 警告清零

> 迭代: R52 | 创建日期: 2026-05-19 | 复杂度: Simple

---

## 1. 用户故事

作为 **PageWise 维护者**，我希望代码库的 ESLint 检查结果达到 0 errors / 0 warnings，以便将 lint 质量门禁收严至零容忍，杜绝未使用变量/导入/参数的隐性技术债持续累积。

---

## 2. 现状分析

### 2.1 当前 lint 状态

| 指标 | 值 |
|------|-----|
| Errors | 0 |
| Warnings | 43 |
| 规则分布 | `no-unused-vars` × 40、`no-undef` (Buffer) × 3 |
| 涉及文件数 | 21 个源文件 |
| 当前 `--max-warnings` | 10000（形同虚设） |

### 2.2 警告分布明细

| 文件 | 数量 | 规则 | 类型 |
|------|------|------|------|
| `sidebar/sidebar.js` | 8 | no-unused-vars | 未使用赋值 (`messageEl` ×3, `knowledgeToolbar`, `swiping`, `listAttrs`, `itemAttrs`, `app`) |
| `lib/bookmark-sharing.js` | 2 | no-undef | `Buffer` 未声明 |
| `lib/page-sense.js` | 4 | no-unused-vars | 未使用参数 (`ctx` ×3, `skillEngine`) |
| `lib/evolution.js` | 2 | no-unused-vars | 未使用参数 (`signal` ×2) |
| `lib/evolution-signals.js` | 3 | no-unused-vars | 未使用导入 (`analyzeStylePreference`, `analyzeRetrievalEffectiveness`, `analyzeSkillPatterns`) |
| `lib/importer.js` | 1 | no-unused-vars | 未使用赋值 (`headHandle`) |
| `lib/git-repo.js` | 1 | no-unused-vars | 未使用参数 (`filename`) |
| `lib/knowledge-base-export.js` | 1 | no-unused-vars | 未使用参数 (`i`) |
| `lib/knowledge-graph-layout.js` | 1 | no-unused-vars | 未使用赋值 (`sort`) |
| `lib/offline-answer-store.js` | 1 | no-unused-vars | 未使用参数 (`nodeMap`) |
| `lib/bookmark-sharing.js` | 1 | no-unused-vars | 未使用参数 (`reject`) |
| `lib/plugin-system-utils.js` | 2 | no-unused-vars | 未使用导入 (`saveSkill`, `deleteSkill`) |
| `lib/skill-store-community.js` | 4 | no-unused-vars + no-undef | 未使用导入 (`getSkillById`, `deleteSkill`)、未使用赋值 (`PAGEWISE_VERSION`, `manifest`)、`Buffer` 未声明 |
| `lib/skill-store.js` | 1 | no-unused-vars | 未使用导入 (`getAllSkills`) |
| `lib/skill-validator.js` | 1 | no-unused-vars | 未使用赋值 (`inBlock`) |
| `lib/skill-zip.js` | 1 | no-unused-vars | 未使用赋值 (`uncompressedSize`) |
| `lib/storage-adapter.js` | 1 | no-unused-vars | 未使用参数 (`result`) |
| `lib/utils.js` | 1 | no-unused-vars | 未使用参数 (`currentUrl`) |
| `lib/wiki-query-prompts.js` | 2 | no-unused-vars | 未使用赋值 (`id` ×2) |
| `options/options.js` | 2 | no-unused-vars | 未使用赋值 (`aiGatewaySection`)、未使用参数 (`gateway`) |
| `popup/bookmark-overview.js` | 1 | no-unused-vars | 未使用导入 (`getStatusLabels`) |
| `scripts/test-shard.js` | 1 | no-unused-vars | 未使用导入 (`basename`) |

> **注意**: 任务描述中提到 options.js 有 7 处警告，实测仅 2 处。实际分布以本表为准。

---

## 3. 验收标准

| # | 验收标准 | 验证方法 |
|---|---------|---------|
| AC-1 | `npm run lint` 输出 0 errors / 0 warnings | 执行命令，检查输出包含 `✖ 0 problems (0 errors, 0 warnings)` |
| AC-2 | `eslint.config.js` 中 `--max-warnings` 收紧为 0（或移除该参数） | 检查 `package.json` 的 `lint` 脚本不含 `--max-warnings 10000` |
| AC-3 | 所有 43 处警告均通过删除代码或 `_` 前缀有意忽略得到解决 | `grep` 确认无残留的未使用变量/参数（不带 `_` 前缀）|
| AC-4 | 修复不引入新的 no-undef 错误（尤其是 `Buffer` 场景需正确处理） | lint 输出 0 errors |
| AC-5 | 全量测试回归无新增失败（`npm test` 通过率不变） | 执行测试套件 |

---

## 4. 技术约束

### 4.1 修复策略优先级

按风险从低到高：

1. **删除未使用的导入** — 仅影响 import 语句，零运行时风险
   - `lib/evolution-signals.js` 3 个未使用函数导入
   - `lib/plugin-system-utils.js` 2 个未使用导入
   - `lib/skill-store-community.js` 2 个未使用导入
   - `lib/skill-store.js` 1 个未使用导入
   - `popup/bookmark-overview.js` 1 个未使用导入
   - `scripts/test-shard.js` 1 个未使用导入

2. **删除未使用的赋值** — 需逐个确认赋值的副作用（如函数调用）仅保留副作用部分
   - `sidebar/sidebar.js` 8 处
   - `lib/skill-store-community.js` 2 处
   - `lib/wiki-query-prompts.js` 2 处
   - 其余 5 个文件各 1 处

3. **参数前缀 `_` 标记** — 不改变函数签名（API 兼容），仅重命名
   - `lib/page-sense.js`: `ctx` → `_ctx`, `skillEngine` → `_skillEngine`
   - `lib/evolution.js`: `signal` → `_signal`
   - 其余 5 个文件各 1 个未使用参数

4. **`Buffer` no-undef 修复** — 两种方案择一：
   - **方案 A**: 在 `lib/bookmark-sharing.js` 和 `lib/skill-store-community.js` 头部添加 `/* global Buffer */` 注释
   - **方案 B**: 在 `eslint.config.js` 的全局变量中添加 `Buffer: 'readonly'`
   - **方案 C**: 改为显式 `import { Buffer } from 'buffer'`（Chrome 扩展环境需验证可行性）
   - **推荐方案 A**: 最小侵入性，仅影响实际使用 Buffer 的文件

### 4.2 禁止事项

- **不得删除有副作用的函数调用** — 例如 `document.getElementById('x')` 的返回值虽未使用，但调用本身可能触发 DOM 查询的副作用，需保留调用并丢弃返回值
- **不得修改函数签名的外部行为** — `_` 前缀仅用于标记意图，不影响调用方
- **不得因清零 lint 而降低规则严格程度** — 现有 `warn` 级别规则不得降为 `off`

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| ESLint v9+ flat config | 前置条件 | 项目已使用 `eslint.config.js`（ESM 格式） |
| `no-unused-vars` 规则已有 `argsIgnorePattern: '^_'` | 前置条件 | 已支持 `_` 前缀忽略，无需修改规则配置 |
| `npm test` 全量测试套件 | 验证依赖 | 修复后需回归确认无副作用 |
| 无外部依赖 | — | 纯代码清理，不涉及新包安装 |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 删除未使用赋值时误删有副作用的表达式 | 低 | 中 | 逐行审查赋值右侧是否有函数调用，有副作用则保留调用并丢弃返回值 |
| `Buffer` 在 Chrome 扩展 content script 中不可用 | 低 | 低 | 方案 A 仅添加注释标记，不改变运行时行为 |
| `_` 前缀参数在已有测试中被引用 | 极低 | 低 | 测试文件的 `no-unused-vars` 已设为 `off`，不受影响 |

---

## 7. 预估工作量

| 阶段 | 工作项 | 预估 |
|------|--------|------|
| 修复 | 逐文件修复 43 处警告 | ~30 min |
| 验证 | `npm run lint` + `npm test` | ~5 min |
| 收紧 | 修改 `package.json` lint 脚本 | ~1 min |
| **合计** | | **~36 min** |

---

> 文档生成: Plan Agent | 基于实测 `npm run lint` 输出 (2026-05-19)
