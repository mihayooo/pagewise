# 需求文档 — R186: 核心模块测试补全 ai-client 系列

> 迭代: R29
> 日期: 2026-05-20
> 复杂度: Medium
> 需求编号: R186
> 模块文件: `lib/ai-client-context.js`(272行)、`lib/ai-client-stream.js`(96行)、`lib/ai-client-tokens.js`(36行)
> 当前测试: 无独立测试文件（现有覆盖散见于 `test-context-aware-ai.js` 50 用例与 `test-token-estimation.js` 10 用例，均从 `ai-client.js` 重导出间接覆盖，非模块级直接导入）

---

## 1. 用户故事

### US-1: 开发者可依赖独立模块级测试保障 ai-client 子模块质量

> 作为 PageWise 的维护开发者，我希望 `ai-client-context.js`、`ai-client-stream.js`、`ai-client-tokens.js` 各自拥有独立的单元测试文件（≥20 用例/模块），以便在拆分或重构 ai-client 子模块时能快速发现回归，不必依赖集成测试间接覆盖。

### US-2: 流式解析模块获得可复现的纯逻辑测试

> 作为开发者，我希望 `ai-client-stream.js` 的 Claude SSE 和 OpenAI SSE 流式解析逻辑能通过 mock ReadableStream 在 Node.js 环境中被完整测试，确保各种边界情况（空流、错误事件、`[DONE]` 信号、多行缓冲、非 JSON 行跳过）均有断言覆盖，而非仅靠 E2E 测试隐式验证。

---

## 2. 验收标准

### AC1: `ai-client-context.js` — 独立测试文件 ≥20 用例

创建 `tests/test-ai-client-context.js`，直接 `import { ... } from '../lib/ai-client-context.js'`，覆盖所有 6 个导出函数：

| 函数 | 当前覆盖（散见） | 需补充用例 | 测试要点 |
|------|-----------------|-----------|---------|
| `getContextAwareSystemPrompt()` | 6 用例 (test-context-aware-ai.js) | ≥4 | ① 传入空对象 `{}` 等效于无参 ② 多书签（>3）时仅取前 3 条 ③ 书签无 tags/summary 时的 null-safe ④ `generic` 页面类型不附加页面提示 |
| `buildContextAwarePrompt()` | 5 用例 | ≥5 | ① `pageContent` 为 null/undefined 时不抛异常 ② `content` 超 8000 字符时截断 ③ `codeBlocks` 含 lang 空值时 fallback 为 `text` ④ `siteName` 为空时不输出来源行 ⑤ `codeBlocks` 超 5 个时仅取前 5 |
| `buildKnowledgeRefSection()` | 0 独立用例 | ≥4 | ① 空 refs 返回空字符串 ② 单条 ref 格式正确（序号+标题+摘要+来源） ③ `maxLength` 截断行为 ④ ref 缺少 url/summary 时的 fallback |
| `buildExplainTermPrompt()` | 4 用例 | ≥3 | ① term 为纯空格时返回空 ② pageContent 全空对象 `{}` 时不抛异常 ③ 恰好 500 字符时不截断 |
| `trimConversationHistory()` | 5 用例 | ≥2 | ① `maxRounds=1` 时仅保留最后 2 条 ② 非数组输入返回空数组 |
| `sanitizeContent()` | 5 用例 | ≥3 | ① `<<<指令>>>` 标记被移除 ② 连续 `---` 行尾（非换行）被移除 ③ 非字符串输入返回空字符串 |

**总用例目标**: ≥20（含上述新增 + 可选边界用例）

### AC2: `ai-client-stream.js` — 独立测试文件 ≥20 用例

创建 `tests/test-ai-client-stream.js`，直接 `import { parseClaudeStream, parseOpenAIStream } from '../lib/ai-client-stream.js'`。

**核心挑战**: 两个函数均为 `async function*`（异步生成器），需 mock `Response` 对象的 `body.getReader()` 接口。测试 helper 需要构造符合 `ReadableStream` 语义的 mock reader。

| 函数 | 用例规划 | 测试要点 |
|------|---------|---------|
| `parseClaudeStream()` | ≥10 | ① 正常 content_block_delta 事件 yield 文本 ② 多行合并后解析 ③ `[DONE]` 信号终止生成器 ④ error 事件抛出 classified 错误 ⑤ 非 JSON 行静默跳过 ⑥ 空流（零 chunk）不抛异常 ⑦ buffer 跨 chunk 拼接 ⑧ 多个 delta 事件依次 yield ⑨ 类型非 content_block_delta 的事件被忽略 ⑩ 错误事件中 error.message 缺失时 fallback |
| `parseOpenAIStream()` | ≥10 | ① 正常 choices[0].delta.content yield 文本 ② 多行合并后解析 ③ `[DONE]` 信号终止 ④ choices 为空数组时不 yield ⑤ delta.content 为 undefined 时不 yield ⑥ 非 JSON 行跳过 ⑦ 空流不抛异常 ⑧ buffer 跨 chunk ⑨ 多 chunk 连续 yield ⑩ `choices[0]` 不存在时不抛异常 |

**Mock 策略**: 创建 `tests/helpers/stream-mock.js` 提供 `createMockResponse(chunks)` 工具函数，将字符串数组模拟为 `ReadableStream` 的 chunk 序列。此 helper 为本迭代新增，可被后续流式测试复用。

### AC3: `ai-client-tokens.js` — 独立测试文件 ≥20 用例

创建 `tests/test-ai-client-tokens.js`，直接 `import { estimateTokens, estimateMessagesTokens } from '../lib/ai-client-tokens.js'`。

| 函数 | 当前覆盖（散见） | 需补充用例 | 测试要点 |
|------|-----------------|-----------|---------|
| `estimateTokens()` | ~5 用例 (test-token-estimation.js, test-context-aware-ai.js) | ≥10 | ① 空字符串返回 0 ② null/undefined/数字类型返回 0 ③ 纯英文 ④ 纯中文 ⑤ 中英混合 ⑥ 单字符边界 `ceil(1/3)=1` ⑦ 长字符串（10000字符）精度 ⑧ 含换行/制表符 ⑨ 含 emoji（多字节字符） ⑩ 含空白字符串 |
| `estimateMessagesTokens()` | ~5 用例 | ≥10 | ① 空数组返回 0 ② 非数组输入返回 0 ③ 单条消息含 role 开销 4 ④ 多条消息累加 ⑤ content 为 null/非字符串时按 0 处理 ⑥ 10 条长对话 ⑦ content 为空字符串 ⑧ role 字段不影响计算（仅 content） ⑨ 含 system 消息 ⑩ 含空 role 消息 |

**总用例目标**: ≥20（确保直接从 `ai-client-tokens.js` 导入，而非从 `ai-client.js` 重导出）

### AC4: 测试基础设施 — 流式 mock helper

创建 `tests/helpers/stream-mock.js`：

- `createMockResponse(chunks: string[])` → 构造含 `body.getReader()` 的 mock Response 对象
- 每个 chunk 模拟 `ReadableStream` 的 `reader.read()` 返回 `{ done: false, value }` 后以 `{ done: true }` 结束
- 支持 UTF-8 TextDecoder 语义（`Uint8Array` 编码）

### AC5: 全量测试零回归

- `npm run test:ci` 通过（≥6118 现有用例 + 新增 ≥60 用例）
- 3 个新测试文件各自独立运行均通过: `node --test tests/test-ai-client-context.js`, `node --test tests/test-ai-client-stream.js`, `node --test tests/test-ai-client-tokens.js`
- 新增用例不依赖 Chrome API mock 或 IndexedDB mock（纯函数测试）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 测试框架 | `node:test`（`describe` / `it`） + `node:assert/strict`，与项目全部测试文件一致 |
| 纯 ES Module | 所有测试文件使用 `import` 语法，项目 `package.json` 已设置 `"type": "module"` |
| 零外部依赖 | 不引入任何第三方测试库（如 sinon、jest-mock）；流式 mock 使用原生 `ReadableStream` 语义手写 |
| 直接导入 | 测试文件直接 `import from '../lib/ai-client-*.js'`，不经过 `ai-client.js` 重导出（避免集成耦合） |
| 现有用例零回归 | `test-context-aware-ai.js` 和 `test-token-estimation.js` 现有 60 用例全部保持通过（不排除存在合理重叠） |
| 无 DOM 依赖 | `ai-client-context.js` 和 `ai-client-tokens.js` 为纯逻辑模块，无需 DOM mock；`ai-client-stream.js` 仅需 mock `Response.body.getReader()` |
| 文件命名 | `tests/test-ai-client-context.js`、`tests/test-ai-client-stream.js`、`tests/test-ai-client-tokens.js`（符合 `test-*.js` 命名规范，被 `npm run test:ci` 自动发现） |
| helper 复用 | 流式 mock helper 放在 `tests/helpers/stream-mock.js`，与现有 `tests/helpers/setup.js`、`tests/helpers/chrome-mock.js` 同级 |
| `classifyAIError` 依赖 | `ai-client-stream.js` 导入 `error-handler.js` 的 `classifyAIError`；测试中该函数会真实执行（无需 mock，它是纯函数） |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| error-handler | `lib/error-handler.js` | ✅ 已实现 | `ai-client-stream.js` 第 10 行 `import { classifyAIError }`，测试中无需 mock（纯函数，无副作用） |
| ai-client-context-methods | `lib/ai-client-context-methods.js` | ✅ 已实现 | **不在本迭代测试范围内**（此文件由 AIClient 类方法层使用，已有集成测试覆盖） |

### 下游消费者（输出）

| 模块 | 使用方式 | 影响 |
|------|----------|------|
| ai-client.js | 重导出 `estimateTokens` / `estimateMessagesTokens`（来自 `ai-client-tokens.js`） | 无影响（仅新增测试，不修改源码） |
| ai-client.js | 使用 `parseClaudeStream` / `parseOpenAIStream`（来自 `ai-client-stream.js`） | 无影响 |
| ai-client-context-methods.js | 导入 `ai-client-context.js` 的 4 个函数 | 无影响 |
| test-context-aware-ai.js | 已有覆盖 | 可能有合理重叠，两套测试共存不冲突 |
| test-token-estimation.js | 已有覆盖（从 `ai-client.js` 重导出） | 可能有合理重叠，两套测试共存不冲突 |

### 间接依赖

| 依赖 | 说明 |
|------|------|
| Node.js ≥18 | `node:test` 需要 Node.js 18+；`ReadableStream` 全局对象在 Node.js 18+ 可用（stream/web） |
| 浏览器 API polyfill | `ai-client-stream.js` 中 `response.body.getReader()` 和 `TextDecoder` 在 Node.js 18+ 原生支持 |

---

## 5. 不在范围内 (Out of Scope)

| 项目 | 原因 | 归属 |
|------|------|------|
| `ai-client-context-methods.js` 独立测试 | 该文件的 3 个函数（`askAboutPageWithContextFn`、`askAboutPageWithContextStreamFn`、`explainTermFn`）已在 `test-context-aware-ai.js` 中通过 AIClient 实例方法间接覆盖，且它主要是组合调用 `ai-client-context.js` 的函数 + `chat/chatStream` 注入 | 后续迭代 |
| `ai-client-request.js` 独立测试 | 非本迭代范围 | 后续迭代 |
| `ai-client-prompts.js` 独立测试 | 非本迭代范围 | 后续迭代 |
| 源码修改 | R186 纯测试补全，不修改任何 `lib/` 下源码 | — |
| E2E / 浏览器集成测试 | 本迭代仅覆盖 Node.js 环境下的纯逻辑单元测试 | 已有 `test-e2e-qa.js` |
| `ai-client.js` 主模块测试 | 主模块已有 `test-ai-client.js` 和 `test-ai-client-e2e.js` 覆盖 | 现有 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 流式 mock 复杂度高 | 中 | 中 | 创建可复用 `stream-mock.js` helper；仅 mock `body.getReader()` + `TextDecoder`，不追求完整 ReadableStream 语义 |
| 与现有测试用例重叠 | 高 | 低 | 重叠不冲突（两套测试独立运行均可通过）；新测试直接从子模块导入，旧测试从主模块导入，验证路径不同 |
| Node.js 版本兼容 | 低 | 中 | `node:test` 和 `ReadableStream` 需 Node.js 18+；项目 CI 已使用 Node.js 20+，无兼容风险 |
| `classifyAIError` 内部变化导致流测试失败 | 低 | 低 | 测试中断言 classified 字段存在性即可，不深度依赖错误分类的具体结构 |

---

## 7. 输出文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `tests/test-ai-client-context.js` | ai-client-context.js 独立单元测试（≥20 用例） |
| 新建 | `tests/test-ai-client-stream.js` | ai-client-stream.js 独立单元测试（≥20 用例） |
| 新建 | `tests/test-ai-client-tokens.js` | ai-client-tokens.js 独立单元测试（≥20 用例） |
| 新建 | `tests/helpers/stream-mock.js` | 流式 Response mock 工具（支持 `ReadableStream` + `getReader()` 语义） |
| 修改 | `docs/CHANGELOG.md` | 新增 R186 条目 |
| 修改 | `docs/TODO.md` | 标记 R186 状态（如有） |

---

## 变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R186 | 初始创建 — ai-client 系列核心模块测试补全需求文档 |
