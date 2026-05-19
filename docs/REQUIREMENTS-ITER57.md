# 需求文档 — R159: ESLint 警告清零 LintWarningFinalR55

> 迭代: R57 | 日期: 2026-05-19 | 复杂度: Simple

---

## 1. 用户故事

**作为** PageWise 维护者，**我希望**将 `npm run lint` 输出中的 33 条 warnings 全部清零（0 errors / 0 warnings），**以便**项目达到零警告基线，后续提交若引入新警告可被 CI 立即捕获，且代码库中不存在未使用变量/导入等技术债。

---

## 2. 现状分析

### 2.1 Lint 警告分布

当前 `npm run lint` 输出: **0 errors / 33 warnings**。

按规则分类：

| 规则 | 数量 | 说明 |
|------|------|------|
| `no-unused-vars` | 30 | 未使用的变量/导入/参数 |
| `no-undef` | 3 | 未定义的 `Buffer` 全局变量（Chrome 扩展环境中无 `Buffer`） |

### 2.2 逐文件警告清单

#### sidebar/ 目录（20 处）

**sidebar/sidebar.js** — 8 处 `no-unused-vars`

| 行号 | 变量 | 类型 | 修复建议 |
|------|------|------|----------|
| 1881 | `messageEl` | assigned but unused | 删除赋值或前缀 `_` |
| 3698 | `messageEl` | assigned but unused | 删除赋值或前缀 `_` |
| 3928 | `messageEl` | assigned but unused | 删除赋值或前缀 `_` |
| 4696 | `knowledgeToolbar` | assigned but unused | 删除赋值或前缀 `_` |
| 6169 | `swiping` | assigned but unused | 删除赋值或前缀 `_` |
| 7346 | `listAttrs` | assigned but unused | 删除赋值或前缀 `_` |
| 7361 | `itemAttrs` | assigned but unused | 删除赋值或前缀 `_` |
| 7705 | `app` | assigned but unused | 删除赋值或前缀 `_` |

**sidebar/sidebar-utils.js** — 8 处 `no-unused-vars`

| 行号 | 变量 | 类型 | 说明 |
|------|------|------|------|
| 4:10 | `logInfo` | imported but unused | R158 拆分后未被 sidebar-utils.js 本文件使用 |
| 4:19 | `logWarn` | imported but unused | 同上 |
| 4:28 | `logError` | imported but unused | 同上 |
| 4:38 | `logDebug` | imported but unused | 同上 |
| 4:48 | `getLogs` | imported but unused | 同上 |
| 4:85 | `exportLogs` | imported but unused | 同上 |
| 4:111 | `getRecentMetrics` | imported but unused | 同上 |
| 4:129 | `getPerformanceStats` | imported but unused | 同上 |

> **根因分析**: R158 将日志/指标相关函数拆入 sidebar-utils.js 时，import 了 logger 的全部 API 但仅实际使用了部分。这些 import 应当删除——被其他子模块需要的 logger API 应在那些子模块中直接 import，而非通过 sidebar-utils.js 转发。

**sidebar/sidebar-settings.js** — 4 处 `no-unused-vars`

| 行号 | 变量 | 类型 | 说明 |
|------|------|------|------|
| 7:24 | `matchShortcut` | imported but unused | 键盘快捷键匹配函数，拆分后未在此文件使用 |
| 8:32 | `clearLogStore` | imported but unused | 日志清除函数 |
| 8:59 | `recordMetric` | imported but unused | 指标记录函数 |
| 8:112 | `clearMetrics` | imported but unused | 指标清除函数 |

> **根因分析**: 同 sidebar-utils.js，R158 拆分时 import 了可能需要的 API 但未实际使用。

#### lib/ 目录（10 处）

**lib/bookmark-sharing.js** — 2 处 `no-undef`

| 行号 | 变量 | 说明 |
|------|------|------|
| 355 | `Buffer` | Chrome 扩展环境无 Node.js `Buffer` 全局对象 |
| 368 | `Buffer` | 同上 |

**lib/skill-store-community.js** — 1 处 `no-undef`

| 行号 | 变量 | 说明 |
|------|------|------|
| 53 | `Buffer` | 同上 |

**lib/wiki-query-prompts.js** — 2 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 89 | `id` | assigned but unused（解构赋值） |
| 111 | `id` | assigned but unused（解构赋值） |

**lib/skill-validator.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 101 | `inBlock` | assigned but unused |

**lib/skill-zip.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 274 | `uncompressedSize` | assigned but unused |

**lib/storage-adapter.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 72 | `result` | function arg unused |

**lib/utils.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 336 | `currentUrl` | function arg unused |

#### 其他目录（3 处）

**options/options.js** — 2 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 201 | `aiGatewaySection` | assigned but unused |
| 447 | `gateway` | function arg unused |

**popup/bookmark-overview.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 18 | `getStatusLabels` | imported but unused |

**scripts/test-shard.js** — 1 处 `no-unused-vars`

| 行号 | 变量 | 类型 |
|------|------|------|
| 14 | `basename` | imported but unused |

---

## 3. 验收标准

### AC-1: `npm run lint` 输出 0 errors / 0 warnings

```bash
$ npm run lint
# 输出行:
# ✔ 0 problems (0 errors, 0 warnings)
```

不允许使用 `--max-warnings` 参数掩盖。`package.json` 中 lint 脚本的 `--max-warnings 10000` 参数应更新为 `--max-warnings 0`。

### AC-2: 修复方式符合规范

对每处警告，采用以下优先级修复：

1. **真正未使用的导入/变量** → 直接删除
2. **暂时未使用但后续迭代需要的导入** → 不允许保留，删除后在需要时重新 import
3. **函数参数未使用但签名需要保持兼容** → 前缀 `_`（如 `result` → `_result`）
4. **解构中未使用的字段** → 用 `_` 占位（如 `{ id: _, name }` 或移除解构）
5. **`no-undef` (Buffer)** → 添加 `/* global Buffer */` 注释（如果确实在 Chrome 扩展环境中通过 polyfill 可用）或替换为 `Uint8Array` / `btoa` 等 Web API

### AC-3: 不引入功能回归

所有修复仅涉及删除未使用代码或添加 `_` 前缀，不得修改任何已使用变量的行为逻辑。`npm run test:ci` 全量测试 0 fail。

### AC-4: sidebar-utils.js / sidebar-settings.js 的 import 精简

R158 拆分后这两个文件遗留了大量"可能用到但实际未使用"的 import。本次必须彻底审查每个 import 的实际使用情况：
- 文件内未调用的 import → 删除
- 需要该 import 的子模块 → 在该子模块中自行 import

### AC-5: `package.json` lint 脚本收紧

```json
// 修改前
"lint": "eslint . --max-warnings 10000"
// 修改后
"lint": "eslint . --max-warnings 0"
```

确保未来任何新引入的警告都会导致 `npm run lint` 失败。

---

## 4. 技术约束

### 4.1 修复范围

- **只做 lint 修复**，不做功能变更、重构或代码风格调整
- 每处修复尽量最小化 diff（一行改动解决一个警告）
- 禁止批量 `_` 前缀——每处必须审查是否可以直接删除

### 4.2 `no-undef` (Buffer) 处理策略

`lib/bookmark-sharing.js` 和 `lib/skill-store-community.js` 中的 `Buffer` 引用：
- 若用于 Base64 编码/解码 → 替换为 `btoa()` / `atob()` 或 Web `TextEncoder`
- 若用于二进制数据操作 → 替换为 `Uint8Array` + `ArrayBuffer`
- 若确需 Node.js `Buffer`（如 zip 操作）→ 在文件顶部添加 `/* global Buffer */` 并确认 polyfill 已注入
- **不允许**简单添加 `eslint-disable` 注释来隐藏警告

### 4.3 sidebar.js 的 8 处警告

R158 拆分后 sidebar.js 仍有 8 处警告。逐个审查：
- `messageEl`（3 处）：可能是 DOM 元素赋值后未使用，确认是否为副作用赋值（如 `messageEl = container.querySelector(...)` 用于后续使用）——若是真未使用则删除；若是 R158 拆分残留则清理
- `knowledgeToolbar`、`swiping`、`listAttrs`、`itemAttrs`、`app`：同理逐个审查

### 4.4 验证流程

1. 修复前记录基线：`npm run lint 2>&1 | tail -1` → 33 warnings
2. 逐文件修复，每修复一个文件立即 `npx eslint <file>` 验证该文件 0 warnings
3. 全部修复后：`npm run lint` → 0 warnings
4. 全量回归：`npm run test:ci` → 0 fail

---

## 5. 依赖关系

### 5.1 前置依赖

| 依赖 | 说明 |
|------|------|
| R158 拆分落地 | sidebar.js 超大模块拆分已完成，子模块文件已创建（sidebar-utils.js / sidebar-settings.js 等），R158 未清理其遗留的 import 警告 |
| R154 Lint 配置 | ESLint 规则已就绪（`no-unused-vars` 的 `varsIgnorePattern: /^_/` 已配置） |
| R157 lib 拆分七期 | lib/ 层文件已拆分完成（bookmark-sharing.js、skill-store-community.js 等已就位） |

### 5.2 后续依赖

| 依赖方 | 说明 |
|--------|------|
| CI Lint 卡口 | `--max-warnings 0` 生效后，任何新代码引入警告将阻断合并 |
| R160 覆盖率修复 | Lint 清零不影响覆盖率，但删除未使用代码可能微调覆盖率指标 |

### 5.3 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 删除"看似未使用"的 import 导致运行时缺失 | 低 | 逐文件 `grep` 确认变量确实在文件内无引用后再删除 |
| `Buffer` 替换为 Web API 后二进制处理异常 | 低 | 保留现有测试用例覆盖 zip/base64 场景，回归验证 |
| sidebar.js 中 `messageEl` 等变量是副作用赋值（修改 DOM） | 中 | 逐个审查赋值语句的右侧表达式，确认是否有 DOM 副作用 |
| `--max-warnings 0` 后后续迭代被阻断 | 低 | 本迭代目标就是 0 warnings，不应再出现 |

---

## 6. 修复清单总览

| # | 文件 | 警告数 | 规则 | 预估修复方式 |
|---|------|--------|------|-------------|
| 1 | sidebar/sidebar.js | 8 | no-unused-vars | 逐个审查：删除未使用赋值或前缀 `_` |
| 2 | sidebar/sidebar-utils.js | 8 | no-unused-vars | 删除未使用的 logger import |
| 3 | sidebar/sidebar-settings.js | 4 | no-unused-vars | 删除未使用的 import |
| 4 | lib/bookmark-sharing.js | 2 | no-undef | Buffer → Web API 或 global 声明 |
| 5 | lib/skill-store-community.js | 1 | no-undef | Buffer → Web API 或 global 声明 |
| 6 | lib/wiki-query-prompts.js | 2 | no-unused-vars | 解构中 `_` 占位或删除 |
| 7 | lib/skill-validator.js | 1 | no-unused-vars | 删除或前缀 `_` |
| 8 | lib/skill-zip.js | 1 | no-unused-vars | 删除或前缀 `_` |
| 9 | lib/storage-adapter.js | 1 | no-unused-vars | 参数前缀 `_result` |
| 10 | lib/utils.js | 1 | no-unused-vars | 参数前缀 `_currentUrl` |
| 11 | options/options.js | 2 | no-unused-vars | 删除 `aiGatewaySection`，参数前缀 `_gateway` |
| 12 | popup/bookmark-overview.js | 1 | no-unused-vars | 删除未使用的 import |
| 13 | scripts/test-shard.js | 1 | no-unused-vars | 删除未使用的 `basename` import |
| | **合计** | **33** | | |

---

## 7. 验证策略

```bash
# 1. 修复前基线
npm run lint 2>&1 | tail -1
# 预期: ✖ 33 problems (0 errors, 33 warnings)

# 2. 逐文件验证（示例）
npx eslint sidebar/sidebar.js
npx eslint sidebar/sidebar-utils.js
# 每个文件: 0 problems

# 3. 全量 lint
npm run lint
# 预期: ✔ 0 problems (0 errors, 0 warnings)

# 4. 全量回归
npm run test:ci
# 预期: 0 fail（允许 pass 数微调，因删除代码可能减少少量测试覆盖）

# 5. lint 脚本确认
node -e "const p=require('./package.json'); console.log(p.scripts.lint)"
# 预期: eslint . --max-warnings 0
```

---

*文档版本: v1.0 | 生成时间: 2026-05-19*
*飞轮迭代 R57 — PageWise Chrome Extension*
