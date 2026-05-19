# 设计文档 — R52 迭代设计

> 迭代: R52 | 创建日期: 2026-05-19

---

## R154: ESLint 警告清零 LintWarningZeroR53

### 1. 目标

将 `npm run lint` 从 0 errors / 43 warnings 收敛为 0 errors / 0 warnings，并将 `package.json` lint 脚本的 `--max-warnings` 从 10000 收紧为 0，建立零容忍质量门禁。

### 2. 设计决策

#### D-R154-1: Buffer 修复策略 — 文件级 `/* global */` 注释

| 选项 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A. 文件级 `/* global Buffer */`** ✅ | 仅在 `bookmark-sharing.js` 和 `skill-store-community.js` 头部添加 | 最小侵入性；不影响其他文件；显式标记意图 | 需要在 2 个文件各加一行注释 |
| B. eslint.config.js 全局声明 | 在 `globals` 中添加 `Buffer: 'readonly'` | 一处修改 | 全局掩盖其他文件可能误用 Buffer 的风险 |
| C. 显式 `import { Buffer } from 'buffer'` | 改为 ES Module import | 最"正规" | Chrome 扩展 content script 环境无 Node.js `buffer` 模块，需 polyfill |

**选择 A**：这两个文件已使用 `typeof btoa` / `typeof atob` 做运行时能力检测，`Buffer` 仅作为 fallback。`/* global Buffer */` 仅消除 ESLint 的 `no-undef` 警告，不改变运行时行为，且明确告知后续维护者此处依赖全局 `Buffer`。

#### D-R154-2: 未使用赋值修复策略 — 逐个审查副作用

43 处警告中，12 处为"赋值但未使用"（`no-unused-vars` 对 `vars` 的检测）。修复策略按副作用存在与否分两类：

| 情况 | 策略 | 示例 |
|------|------|------|
| 赋值右侧有 DOM/IO 副作用（如 `addAIMessage()`、`getElementById()`） | 删除变量绑定，保留函数调用 | `const messageEl = this.addAIMessage(...)` → `this.addAIMessage(...)` |
| 赋值右侧为纯数据提取（如 `getBookmarkListAriaAttrs()`） | 前缀 `_` 标记有意忽略，保留 getter 调用（确保 side-effect 一致） | `const listAttrs = ...` → `const _listAttrs = ...` |
| 赋值右侧为纯计算，返回值完全未被读取 | 删除整个语句 | `const sort = (obj) => ...`（dead code helper） |

#### D-R154-3: 未使用参数修复策略 — `_` 前缀

已有 ESLint 规则 `argsIgnorePattern: '^_'`，因此：

- 保留函数签名长度不变（调用方无需修改）
- 仅重命名参数名，加 `_` 前缀
- 对 `varsIgnorePattern: '^_'` 同样适用

#### D-R154-4: 未使用导入修复策略 — 删除 import 语句中的未使用绑定

| 情况 | 策略 |
|------|------|
| 整个 import 只有一个绑定且未使用 | 删除整行 import |
| import 中部分绑定未使用但该文件有 `export { ... } from` 保留 re-export | 删除 import 语句，保留 `export ... from` 语句（两者独立） |
| import 中部分绑定未使用且无 re-export | 仅删除未使用的绑定名 |

#### D-R154-5: max-warnings 收紧策略

| 变更项 | 变更前 | 变更后 |
|--------|--------|--------|
| `package.json` lint 脚本 | `eslint . --max-warnings 10000` | `eslint . --max-warnings 0` |
| 含义 | 允许最多 10000 条警告（形同虚设） | 0 容忍：任何警告都会导致 lint 退出码非零 |

---

### 3. 修改文件清单（22 个文件）

#### 3.1 配置文件（1 个）

| 文件 | 变更内容 |
|------|----------|
| `package.json` | lint 脚本 `--max-warnings 10000` → `--max-warnings 0` |

#### 3.2 删除未使用导入（10 个文件，共 11 处）

| 文件 | 行 | 删除的导入 | 原因 |
|------|----|-----------|------|
| `lib/evolution.js` | 10 | `analyzeStylePreference`, `analyzeRetrievalEffectiveness`, `analyzeSkillPatterns` | import 未使用；同文件 `export { ... } from` re-export 保留（两条语句独立） |
| `lib/plugin-system-utils.js` | 13 | `saveSkill`, `deleteSkill` | 整行删除（仅这两个绑定） |
| `lib/skill-store-community.js` | 12 | `getSkillById`, `deleteSkill` | 删除 2 个未使用绑定，保留同行的 `createZip` 等（如有）；若整行只有这 2 个绑定则删除整行 |
| `lib/skill-store.js` | 9 | `getAllSkills` | 从 import 中删除该绑定 |
| `popup/bookmark-overview.js` | 18 | `getStatusLabels` | 从 import 中删除该绑定 |
| `scripts/test-shard.js` | 14 | `basename` | 从 `{ join, basename }` 中删除 `basename` |

#### 3.3 删除未使用赋值 — 有副作用保留调用（7 个文件，共 12 处）

| 文件 | 行 | 变量 | 右值是否有副作用 | 修复方式 |
|------|----|------|-----------------|----------|
| `sidebar/sidebar.js` | 1881 | `messageEl` | 是（`addAIMessage()` 创建 DOM） | 删除变量绑定，保留 `this.addAIMessage(content);` |
| `sidebar/sidebar.js` | 3698 | `messageEl` | 是（同上） | 同上 |
| `sidebar/sidebar.js` | 3928 | `messageEl` | 是（同上） | 同上 |
| `sidebar/sidebar.js` | 4696 | `knowledgeToolbar` | 是（`closest()` DOM 查询） | 删除整行（返回值及后续无引用） |
| `sidebar/sidebar.js` | 6169 | `swiping` | 否 | 删除 `let swiping = false;`；将后续 touchmove 中 `swiping = true;` 也删除（变量完全未读取） |
| `sidebar/sidebar.js` | 7346 | `listAttrs` | 是（getter 方法调用） | `const listAttrs = ...` → `const _listAttrs = ...`；后续 `.listItemCount` 等赋值改为 `_listAttrs.xxx` |
| `sidebar/sidebar.js` | 7361 | `itemAttrs` | 是（getter 方法调用） | `const itemAttrs = ...` → `const _itemAttrs = ...` |
| `sidebar/sidebar.js` | 7705 | `app` | 是（`new SidebarApp()` 构造函数） | `const app = new SidebarApp();` → `new SidebarApp();` |
| `lib/git-repo.js` | 32 | `headHandle` | 是（`getFileHandle()` 可能创建文件） | `const headHandle = ...` → 保留调用但删除绑定 |
| `lib/skill-store-community.js` | 17 | `PAGEWISE_VERSION` | 否（字面量赋值） | 删除整行 `const PAGEWISE_VERSION = '2.0.0';` |
| `lib/skill-store-community.js` | 159 | `manifest` | 是（从函数返回值解构） | `const { files, manifest } = ...` → `const { files } = ...`（manifest 未使用） |
| `lib/wiki-query-prompts.js` | 89,111 | `id` | 否（`.map()` 回调中解构） | `([id, p])` → `([_id, p])` 或 `([, p])`（推荐后者更惯用） |
| `lib/knowledge-base-export.js` | 42 | `sort` | 否（纯函数定义，dead code） | 删除整行（函数定义后从未被调用） |
| `lib/skill-validator.js` | 101 | `inBlock` | 否 | 删除 `inBlock = false` 和 `inBlock = true` 赋值语句（变量从未被读取） |
| `lib/skill-zip.js` | 274 | `uncompressedSize` | 否（从二进制数据读取） | 删除该行 |

#### 3.4 参数前缀 `_`（7 个文件，共 10 处）

| 文件 | 行 | 参数名 → 新名 | 函数 |
|------|----|-------------|------|
| `lib/evolution-signals.js` | 119 | `signal` → `_signal` | `onRepeatedQuestion` |
| `lib/evolution-signals.js` | 137 | `signal` → `_signal` | `onPositiveFeedback`（注：需确认行 137 对应的函数名） |
| `lib/page-sense.js` | 108 | `ctx` → `_ctx` | `detect` 方法内部回调 |
| `lib/page-sense.js` | 124 | `ctx` → `_ctx` | `extract` 方法内部回调 |
| `lib/page-sense.js` | 259 | `skillEngine` → `_skillEngine` | `suggestSkills` 方法 |
| `lib/page-sense.js` | 368 | `ctx` → `_ctx` | `buildSummary` 方法 |
| `lib/importer.js` | 58 | `filename` → `_filename` | `parseJSON` |
| `lib/importer.js` | 268 | `i` → `_i` | `.map()` 回调 |
| `lib/knowledge-graph-layout.js` | 156 | `nodeMap` → `_nodeMap` | `buildTooltipText` |
| `lib/offline-answer-store.js` | 217 | `reject` → `_reject` | Promise 构造函数回调 |
| `lib/storage-adapter.js` | 72 | `result` → `_result` | `chrome.storage.sync.get` 回调 |
| `lib/utils.js` | 336 | `currentUrl` → `_currentUrl` | `loadConversation` |
| `options/options.js` | 447 | `gateway` → `_gateway` | `showConflict` |

#### 3.5 `/* global Buffer */` 声明（2 个文件）

| 文件 | 行 | 变更 |
|------|----|------|
| `lib/bookmark-sharing.js` | 文件头部（模块注释后、import 前） | 添加 `/* global Buffer */` |
| `lib/skill-store-community.js` | 文件头部（模块注释后、import 前） | 添加 `/* global Buffer */` |

---

### 4. 逐文件修复方案详细说明

#### 4.1 `sidebar/sidebar.js`（8 处警告 — 最大修改文件）

```
行 1881: const messageEl = this.addAIMessage(content);
修复:   this.addAIMessage(content);

行 3698: const messageEl = this.addAIMessage(display);
修复:   this.addAIMessage(display);

行 3928: const messageEl = this.addAIMessage(display);
修复:   this.addAIMessage(display);

行 4696: const knowledgeToolbar = this.searchInput?.closest('.knowledge-toolbar');
修复:   删除整行（knowledgeToolbar 及后续均无引用）

行 6169: let swiping = false;
修复:   删除此行。同时删除 touchmove 中的 swiping = true; 语句。
        swiping 变量在 touchstart/touchmove/touchend 中被赋值但从未被读取，
        是完全的 dead code。触摸滑动逻辑仅依赖 diff 计算，不依赖 swiping 标志。

行 7346: const listAttrs = this._bookmarkA11y.getBookmarkListAriaAttrs(...)
修复:   const _listAttrs = this._bookmarkA11y.getBookmarkListAriaAttrs(...)
        后续 _listAttrs.listItemCount = ... 保持不变（仅变量名改为 _listAttrs）

行 7361: const itemAttrs = this._bookmarkA11y.getBookmarkItemAriaAttrs(...)
修复:   const _itemAttrs = this._bookmarkA11y.getBookmarkItemAriaAttrs(...)

行 7705: const app = new SidebarApp();
修复:   new SidebarApp();
```

#### 4.2 `lib/evolution.js`（3 处警告）

```js
// 行 10: 删除 import 中的 3 个未使用绑定
import { batchEvolve, analyzeUserLevel } from './evolution-batch.js';
// 删除: analyzeStylePreference, analyzeRetrievalEffectiveness, analyzeSkillPatterns

// 行 15 的 re-export 保持不变（export ... from 独立于 import）
export { batchEvolve, analyzeStylePreference, analyzeRetrievalEffectiveness, analyzeSkillPatterns, analyzeUserLevel } from './evolution-batch.js';
```

#### 4.3 `lib/skill-store-community.js`（4 处警告）

```
文件头部: 添加 /* global Buffer */

行 12: import { getSkillById, deleteSkill } from './custom-skills.js'
修复:   删除整行（仅这两个绑定，均未使用）

行 17: const PAGEWISE_VERSION = '2.0.0'
修复:   删除整行

行 159: const { files, manifest } = await this.fetchFromGitHub(...)
修复:   const { files } = await this.fetchFromGitHub(...)
```

#### 4.4 `lib/page-sense.js`（4 处警告）

```
行 108: detect: (ctx) => {  →  detect: (_ctx) => {
行 124: extract: (ctx) => {  →  extract: (_ctx) => {
行 259: suggestSkills(pageContext, skillEngine)  →  suggestSkills(pageContext, _skillEngine)
行 368: buildSummary(types, ctx)  →  buildSummary(types, _ctx)
```

#### 4.5 `options/options.js`（2 处警告）

```
行 201: const aiGatewaySection = document.getElementById('aiGatewaySection');
修复:   document.getElementById('aiGatewaySection');  // 保留 DOM 查询副作用，丢弃返回值

行 447: function showConflict(conflict, gateway) {
修复:   function showConflict(conflict, _gateway) {
```

#### 4.6 `lib/wiki-query-prompts.js`（2 处警告）

```
行 89:  for (const [id, p] of pageMap)  →  for (const [, p] of pageMap)
行 111: for (const [id, p] of pageMap)  →  for (const [, p] of pageMap)
```

#### 4.7 其余单处警告文件（各 1 处）

| 文件 | 行 | 修复 |
|------|----|------|
| `lib/bookmark-sharing.js` | 文件头部 | 添加 `/* global Buffer */` |
| `lib/git-repo.js` | 32 | `const headHandle = await ...` → `await fs.getFileHandle('.git/HEAD', { create: true })` |
| `lib/importer.js` | 58 | `filename` → `_filename` |
| `lib/importer.js` | 268 | `i` → `_i` |
| `lib/knowledge-base-export.js` | 42 | 删除 `const sort = (obj) => ...` 整行（dead code helper） |
| `lib/knowledge-graph-layout.js` | 156 | `nodeMap` → `_nodeMap` |
| `lib/offline-answer-store.js` | 217 | `reject` → `_reject` |
| `lib/plugin-system-utils.js` | 13 | 删除 `import { saveSkill, deleteSkill } from './custom-skills.js'` 整行 |
| `lib/skill-store.js` | 9 | `getAllSkills` → 删除（从 import 中移除） |
| `lib/skill-validator.js` | 101 | 删除 `inBlock = false` 和 `inBlock = true` 赋值 |
| `lib/skill-zip.js` | 274 | 删除 `const uncompressedSize = readU32(data, pos + 24)` |
| `lib/storage-adapter.js` | 72 | `result` → `_result` |
| `lib/utils.js` | 336 | `currentUrl` → `_currentUrl` |
| `popup/bookmark-overview.js` | 18 | 从 import 中删除 `getStatusLabels` |
| `scripts/test-shard.js` | 14 | 从 `{ join, basename }` 中删除 `basename` |

---

### 5. 新增的函数/类

**无。** 本次任务为纯代码清理，不新增任何函数或类。

### 6. 接口设计

**无接口变更。** 所有修复对外部 API（函数签名、导出模块）保持完全兼容：

- 参数 `_` 前缀不影响调用方（位置参数绑定）
- re-export 语句独立于 import 语句，删除 import 不影响 re-export 的对外 API
- 删除的变量均为文件内部局部变量，不涉及模块导出

### 7. 修复执行顺序

建议按风险从低到高分批执行：

| 批次 | 内容 | 文件数 | 风险 |
|------|------|--------|------|
| 1 | 删除未使用导入 | 6 | 极低（仅删除 import 绑定） |
| 2 | 参数 `_` 前缀 | 9 | 低（不改变运行时行为） |
| 3 | `/* global Buffer */` + eslint.config.js 不变 | 2 | 低（仅添加注释） |
| 4 | 删除未使用赋值 — dead code | 5 | 低（变量从未被读取） |
| 5 | 删除未使用赋值 — 保留副作用调用 | 3 | 中（需确认无遗漏副作用） |
| 6 | `package.json` max-warnings 收紧 | 1 | 低（最终验证步骤） |

每批次执行后建议 `npm run lint` 验证当前进度。

### 8. 验证方案

```bash
# 步骤 1: lint 清零验证
npm run lint
# 预期: ✖ 0 problems (0 errors, 0 warnings)

# 步骤 2: 全量测试回归
npm test
# 预期: 所有测试通过，无新增 failure

# 步骤 3: max-warnings 门禁验证
grep 'max-warnings' package.json
# 预期: "lint": "eslint . --max-warnings 0"
```

### 9. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 删除未使用赋值时误删有副作用的表达式 | 低 | 中 | 逐个审查赋值右侧；有 DOM/IO 调用的保留调用、仅删绑定 |
| `swiping` 删除后触摸滑动逻辑异常 | 极低 | 低 | `swiping` 从未被读取，滑动逻辑仅依赖 `diff` 计算 |
| `_` 前缀参数在已有测试中按名引用 | 极低 | 低 | 测试文件 `no-unused-vars: 'off'`，且测试通过 `()` 位置参数调用 |
| `Buffer` 在 content script 环境不存在 | 无 | 无 | `/* global Buffer */` 仅消除 lint 警告，不改变运行时；原有代码已有 `typeof btoa` 检测保护 |

---

> 文档生成: Plan Agent | 基于实测 `npm run lint` 输出 (2026-05-19)
