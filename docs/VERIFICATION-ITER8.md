# VERIFICATION.md — Iteration #8 Review

> **任务**: R111: 输入安全加固 InputSanitization
> **日期**: 2026-05-19
> **审查人**: Guard Agent (Claude)

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | `sanitize.js` 新模块实现完整（7 个函数 + 常量），但仅迁移了 `wiki-store.js` 1 处，任务描述要求"替换现有散落的 escapeHtml 调用为集中模块"，尚有 ≥5 个文件未迁移 |
| 代码质量 | ✅ | 新模块设计优秀：纯函数、null 安全、完整 JSDoc、ES Module 导出、黑名单+白名单双重 URL 校验、单引号转义补全 |
| 测试覆盖 | ✅ | `test-sanitize.js` 共 62 个用例、8 个 suite，全部通过（0 fail）。覆盖全部 7 个函数 + 综合安全 payload 测试 |
| 文档同步 | ❌ | `CHANGELOG.md` 未记录 R111；`TODO.md` 无 R111 条目 |

**总体评分: ⚠️ 有条件通过 — 模块本身质量上乘，但迁移未完成 + 文档缺失**

---

## 详细分析

### 1. 功能完整性 ⚠️

**已完成 ✅**:
- `lib/sanitize.js` — 新建集中净化模块，包含 7 个导出函数 + 2 个常量：
  - `escapeHtml` / `escapeHtmlAttr` — HTML 实体编码（XSS 防护）
  - `sanitizeUrl` — URL 协议校验（javascript:/vbscript:/data: 拦截）
  - `escapeSearchQuery` — 正则特殊字符 + HTML 字符双层转义
  - `truncate` — 文本截断
  - `sanitizeBookmarkTitle` — 书签标题净化 + 长度限制 (200)
  - `sanitizeTag` — 标签净化 + 长度限制 (50)
- `lib/wiki-store.js` — 已移除内联 `escapeHtml` / `escapeHtmlAttr`，改从 `./sanitize.js` 导入

**未完成 ❌**:
任务描述明确要求"替换现有散落的 escapeHtml 调用为集中模块"，但以下文件仍保留独立的 escapeHtml 实现，**未被迁移**：

| 文件 | 函数名 | 行号 | 安全差异 |
|------|--------|------|----------|
| `lib/contradiction-detector.js` | `escapeHtml(str)` | L581 | ❌ 缺少 `"` 和 `'` 转义 |
| `lib/compilation-report.js` | `escapeHtml(str)` | L544 | ❌ 缺少 `"` 和 `'` 转义 |
| `lib/bookmark-import-export.js` | `_escapeHtml(str)` / `_escapeAttr(str)` | L437/L451 | ❌ `_escapeHtml` 缺少 `'` 转义 |
| `lib/bookmark-preview.js` | `static _escapeHtml(str)` | L223 | ❌ 缺少 `'` 转义 |
| `lib/bookmark-core.js` | `static _escapeHtml(str)` | L283 | ❌ 缺少 `'` 转义 |
| `lib/error-handler.js` | `escapeHtmlSimple(str)` | L387 | ❌ 缺少 `'` 转义 |

> **安全风险**: 旧实现普遍缺少单引号 `'` → `&#39;` 转义。当转义内容被嵌入单引号属性上下文（如 `title='...'`）时存在 XSS 风险。新 `sanitize.js` 已修复此问题，但未迁移的旧代码仍在使用有漏洞的版本。

### 2. 代码质量 ✅

**新模块亮点**:
- ✅ 纯函数、零副作用、不依赖 DOM / Chrome API
- ✅ 所有函数对 `null` / `undefined` / 非字符串类型安全处理
- ✅ `sanitizeUrl` 黑名单 + 白名单双重校验，处理了大小写混淆、前导空白/制表符绕过
- ✅ `escapeSearchQuery` 先转义反斜杠再转义其他正则字符，顺序正确
- ✅ `sanitizeTag` 移除不安全字符而非仅编码，防御更彻底
- ✅ 两种导出方式：命名导出 + 默认导出对象

**小改进建议**:
- ⚠️ `sanitizeUrl` 白名单包含 `file:` 协议。虽然注释说明"Chrome 扩展可能需要"，但 `file://` 可读取本地文件，在浏览器 context 有信息泄露风险。建议在 JSDoc 中增加安全警告。
- ⚠️ `escapeHtml` 的替换顺序中 `&` 在最前，避免了双重转义。但 `sanitizeBookmarkTitle` 先 `escapeHtml` 再按 length 截断——转义后的实体（如 `&amp;` = 5 字符）会消耗更多长度配额，可能导致有效内容比预期短。这是一个边界 case，建议文档说明。

### 3. 测试覆盖 ✅

```
# tests 62
# suites 8
# pass 62
# fail 0
```

- ✅ 所有 7 个函数均有独立测试 suite
- ✅ null/undefined/空字符串边界覆盖
- ✅ 综合安全 suite（XSS payload、ReDoS、Unicode/emoji）
- ✅ wiki-store 既有测试 66 个全部通过，迁移未引入回归

**测试改进建议**:
- ⚠️ `sanitizeUrl` 缺少 `\x00javascript:alert(1)`（null byte 绕过）测试
- ⚠️ `sanitizeBookmarkTitle` 缺少含转义实体的超长输入测试（截断可能切在实体中间）

### 4. 文档同步 ❌

| 文档 | 状态 | 说明 |
|------|------|------|
| `CHANGELOG.md` | ❌ 未更新 | 缺少 R111 条目（应记录在"新增"或"安全"分类下） |
| `TODO.md` | ❌ 未更新 | 无 R111 相关条目 |

---

## 发现的问题

### P1 — 严重：迁移不完整

仅迁移了 `wiki-store.js` 1 处，但代码库中至少还有 **6 个文件** 保留独立的 `escapeHtml` 实现。这些旧实现存在共同缺陷：**缺少单引号 `'` → `&#39;` 转义**。当用户控制的内容被嵌入 HTML 属性上下文时，可被利用进行 XSS 注入。

### P2 — 中等：文档缺失

`CHANGELOG.md` 和 `TODO.md` 均未记录本次迭代。

### P3 — 低：sanitizeUrl file: 协议风险

`file:` 协议在白名单中，建议增加安全上下文注释或考虑移除。

---

## 返工任务清单

| # | 优先级 | 任务 | 详情 |
|---|--------|------|------|
| 1 | **P1** | 迁移剩余 escapeHtml 实现 | 将以下文件的 `escapeHtml` / `_escapeHtml` / `escapeHtmlSimple` 替换为 `import { escapeHtml } from './sanitize.js'`：<br>• `lib/contradiction-detector.js` (L581)<br>• `lib/compilation-report.js` (L544)<br>• `lib/bookmark-import-export.js` (L437, L451)<br>• `lib/bookmark-preview.js` (L223)<br>• `lib/bookmark-core.js` (L283)<br>• `lib/error-handler.js` (L387) |
| 2 | **P2** | 更新 CHANGELOG.md | 在 R111 迭代下记录：新增 `lib/sanitize.js` 统一净化模块 |
| 3 | **P2** | 更新 TODO.md | 标记 R111 完成状态（迁移完成后） |
| 4 | **P3** | 补充 sanitizeUrl 测试 | 增加 null byte 绕过测试：`\x00javascript:alert(1)` |
| 5 | **P3** | sanitizeBookmarkTitle 边界测试 | 增加含 `&amp;` 等转义实体的超长输入截断测试 |

---

## 结论

`lib/sanitize.js` **模块本身设计和实现质量优秀**，是正确的安全加固方向。但本次迭代**只完成了约 15% 的迁移工作**（1/7 文件），远未达到任务描述中"替换现有散落的 escapeHtml 调用为集中模块"的要求。需要在返工中完成剩余文件的迁移，才能关闭此任务。
