# 需求文档 — 迭代 32 (R189)

> 日期: 2026-05-20
> 模块: `lib/message-renderer.js` (539 行)
> 新增测试文件: `tests/test-message-renderer-unit.js`

---

## 1. 用户故事

作为一名 PageWise 开发者，我希望 `message-renderer.js` 模块拥有完整的单元测试覆盖，
以便在重构或新增功能时能快速发现回归缺陷，确保消息渲染系统的可靠性。

---

## 2. 现状分析

### 已有测试文件

| 文件 | 用例数 | 覆盖范围 |
|------|--------|----------|
| `test-message-renderer-e2e.js` | 36 | 消息创建/存储/DOM 构建/handleMessageAction/destroy/边界 |
| `test-message-renderer-lazy.js` | 19 | 懒渲染上限/IntersectionObserver/sentinel/reset |

### 未覆盖的方法/逻辑

以下方法在现有测试中 **完全未被直接测试**：

| # | 方法 | 行号 | 说明 |
|---|------|------|------|
| 1 | `_injectQuoteAttributes()` | 368-395 | 扫描 `<code>` 和 `<blockquote>` 注入 `data-quote`、绑定点击事件 |
| 2 | `_sendLocateAndHighlight()` | 401-414 | 向 content script 发送 `locateAndHighlight` 消息 |
| 3 | `injectCodeBlockRunButtons()` | 421-456 | 为可运行代码块注入独立运行按钮 |
| 4 | `extractRunnableCodeBlocks()` | 463-471 | 从 Markdown 中提取 HTML/JavaScript 代码块 |
| 5 | `updateAIMessage()` | 250-254 | 更新已有 AI 消息内容（流式场景） |
| 6 | `reset()` | 477-515 | 重置渲染器：清空消息、断开 observer、重建 sentinel |
| 7 | `showLoading()` | 267-283 | 显示加载指示器 |

此外，`_buildAIElement()` 中 `hasRunnableCode` 正则的匹配逻辑（如 html 代码块、混合大小写）也需要更细粒度的断言。

---

## 3. 验收标准

### AC1: `extractRunnableCodeBlocks` 测试覆盖
- 提取 JavaScript 代码块（` ```javascript\n...\n``` `）
- 提取 HTML 代码块（` ```html\n...\n``` `）
- 不提取 Python/TypeScript 等不支持的语言
- 空内容返回空数组
- 多个代码块全部提取且顺序正确
- 代码块内含特殊字符（`<`, `>`, `&`）不被破坏

### AC2: `_injectQuoteAttributes` 测试覆盖
- 行内 `<code>` 元素获得 `data-quote` 属性和 `pw-quote-link` class
- `<pre><code>` 中的 code **不**获得 `data-quote`（仅行内 code）
- `<blockquote>` 获得 `data-quote` 属性，截取前 200 字符
- 空文本的 `<code>` / `<blockquote>` 不注入属性
- 点击触发 `_sendLocateAndHighlight`

### AC3: `_sendLocateAndHighlight` 测试覆盖
- 正常发送消息到 `chrome.tabs.sendMessage` 并传递正确参数
- 发送失败时调用 `addSystemMessage` 显示提示
- 返回 `success: false` 时显示「未在页面中找到该内容」
- 空文本不发送消息

### AC4: `injectCodeBlockRunButtons` 测试覆盖
- 为 JavaScript 代码块注入运行按钮
- 为 HTML 代码块注入运行按钮
- 非 JS/HTML 的代码块不注入按钮
- 点击运行按钮触发 `_executeCodeSandbox`
- 无代码块时为 no-op

### AC5: `updateAIMessage` & `showLoading` & `reset` 覆盖
- `updateAIMessage` 更新 `.message-bubble` 内容并调用 `renderMarkdown`
- `showLoading` 创建包含 thinking-dots 的 DOM 元素
- `reset` 后 `getMessageCount()` 返回 0，observer 重建

---

## 4. 技术约束

1. **测试框架**: Node.js 内置 `node:test` + `node:assert/strict`（与项目一致）
2. **无外部依赖**: 不引入 Jest / Mocha / Chai
3. **DOM Mock**: 复用现有 `MockElement` / `MockIntersectionObserver` 模式，需扩展以支持 `setAttribute`、`classList`、嵌套 `querySelector`
4. **Chrome API Mock**: `chrome.tabs.sendMessage` 需可控返回值，覆盖成功/失败/异常三种路径
5. **导入路径**: `import { MessageRenderer, MAX_RENDERED, LOAD_BATCH } from '../lib/message-renderer.js'`
6. **`renderMarkdown` Mock**: 由于 `utils.js` 依赖 chrome storage，测试中需 mock `renderMarkdown` 或提供可控的替代实现
7. **目标用例数**: ≥ 25 个 `it()` 用例
8. **运行命令**: `node --test tests/test-message-renderer-unit.js`

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| `lib/message-renderer.js` | 被测模块 | 主要目标，539 行 |
| `lib/utils.js` | 运行时依赖 | `renderMarkdown()` 函数，被 `_buildAIElement` 和 `updateAIMessage` 调用 |
| `tests/test-message-renderer-e2e.js` | 参考 | 复用 Mock 模式（MockElement / IntersectionObserver） |
| `tests/test-message-renderer-lazy.js` | 参考 | 复用懒渲染测试的辅助函数 |

---

## 6. 测试分组规划

```
describe('MessageRenderer — 单元测试', () => {
  describe('extractRunnableCodeBlocks', () => { /* 5-6 用例 */ });
  describe('_injectQuoteAttributes', () => { /* 4-5 用例 */ });
  describe('_sendLocateAndHighlight', () => { /* 3-4 用例 */ });
  describe('injectCodeBlockRunButtons', () => { /* 4-5 用例 */ });
  describe('updateAIMessage', () => { /* 2-3 用例 */ });
  describe('showLoading', () => { /* 2 用例 */ });
  describe('reset', () => { /* 3-4 用例 */ });
});
```

预估总用例: **~25-30 个**

---

## 7. 不在范围内

- 不修改 `lib/message-renderer.js` 源码
- 不修改现有 `test-message-renderer-e2e.js` 或 `test-message-renderer-lazy.js`
- 不涉及集成测试或 E2E 测试
- 不涉及代码覆盖率报告配置
