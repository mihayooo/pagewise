# 需求文档 — R158: sidebar.js 超大模块拆分落地 SidebarModuleSplitActual

> 迭代: R56 | 日期: 2026-05-19 | 复杂度: Complex

---

## 1. 用户故事

**作为** PageWise 维护者，**我希望**将 sidebar.js 从 7705 行的巨石文件按职责实际拆分为 ≤400 行的子模块，**以便**代码可维护性提升、新开发者能快速定位职责域、且未来功能迭代不会因文件过大而降低开发效率。

> 注：R155 声称完成此拆分但 `wc -l` 实测 sidebar.js 仍为 7705 行，仅创建了 sidebar-settings.js(365行) 和 sidebar-utils.js(199行) 两个原型扩展文件，主文件从未被缩减。本次迭代是拆分的**实际落地**。

---

## 2. 现状分析

### 2.1 文件现状

| 文件 | 行数 | 状态 |
|------|------|------|
| `sidebar/sidebar.js` | 7705 | ❌ 未拆分（单体 SidebarApp 类） |
| `sidebar/sidebar-settings.js` | 365 | ⚠️ R155 创建，使用 `setupSettings()` 原型扩展，但 sidebar.js 中设置相关代码**未删除** |
| `sidebar/sidebar-utils.js` | 199 | ⚠️ R155 创建，使用 `setupUtils()` 原型扩展，但 sidebar.js 中工具函数**未删除** |

### 2.2 sidebar.js 职责分区（按代码行统计）

| 职责域 | 行数范围 | 对应子模块 |
|--------|----------|-----------|
| 构造函数 + imports + PROVIDERS | 1–267 (267行) | → sidebar.js 编排层 |
| 初始化 init() + DOM 绑定 | 268–1184 (917行) | → sidebar-init.js |
| 消息监听 | 1185–1324 (140行) | → sidebar.js 编排层 |
| 对话功能 + 对话分支 + 对话持久化 + 历史对话面板 | 2526–3238 + 6010–6271 (973行) | → sidebar-chat.js |
| 全文总结 + YouTube + API文档 + GitHub + PDF | 3239–4360 (1122行) | → sidebar-content-features.js |
| 代码执行沙箱 + 代码块复制 + 多标签页联合分析 | 5580–6540 (961行) | → sidebar-code.js |
| 知识库 + 知识图谱 + 高亮管理 + 学习路径 + 进化状态 | 4361–5404 (1044行) | → sidebar-knowledge.js |
| 书签面板 | 7152–7705 (554行) | → sidebar-bookmark.js |
| 日志面板 + Tab切换 + 页面上下文 + 技能面板 + 自定义技能管理 | 1325–2525 (1201行) | → sidebar-skills.js |
| 间隔复习 + Prompt模板 + 新手引导 + Toast通知 | 6541–7151 (611行) | → sidebar-extras.js |
| 设置 + 备份导出导入 + 提供商/Profile | 5405–6009 (605行) | → sidebar-settings.js（扩充已有文件） |
| 工具函数（escapeHtml, _highlightMatch 等） | 散布全文 | → sidebar-utils.js（扩充已有文件） |

### 2.3 Lint 警告

sidebar.js 当前存在 8 处 `no-unused-vars` 警告，需在拆分过程中同步清除。

---

## 3. 验收标准

### AC-1: sidebar.js 主文件 ≤ 400 行

`wc -l sidebar/sidebar.js` 输出 ≤ 400。sidebar.js 仅保留：
- 类定义骨架（constructor + init 协调 + destroy）
- import 声明
- 子模块 `setup()` 注册调用
- 消息监听桥接

### AC-2: 所有子模块文件 ≤ 400 行

每个从 sidebar.js 拆出的子模块文件均满足 `wc -l` ≤ 400 行。允许一个职责域拆为多个文件（如 `sidebar-chat-core.js` + `sidebar-chat-history.js`），但**禁止**为了凑行数将逻辑碎片化到不可理解的程度——每个文件须有清晰单一职责。

### AC-3: UI 行为不变

拆分后侧边栏全部 UI 功能回归无差异：
- 聊天对话（发送/接收/流式输出/多轮/分支）
- 知识库面板（列表/搜索/详情/图谱/高亮/学习路径）
- 书签面板（列表/搜索/详情/文件夹/统计）
- 设置面板（提供商/Profile/模型发现/备份导出导入）
- 技能系统（内置/自定义/商店/导入）
- 内容特性（YouTube/API文档/GitHub/PDF/代码沙箱/多标签页）
- 间隔复习/Prompt模板/新手引导/历史对话
- 所有 Toast 通知/日志面板/进化状态

### AC-4: 全量回归 0 fail

`npm run test:ci` 全量测试通过率 ≥ 拆分前基线（6157 pass / 0 fail），不允许引入新失败。

### AC-5: Lint 警告清零

`npm run lint` 中 sidebar/ 目录相关文件 0 errors / 0 warnings。特别是原 sidebar.js 中的 8 处 `no-unused-vars` 警告需全部消除（拆分后自然消除或主动清理残留）。

---

## 4. 技术约束

### 4.1 拆分模式

采用 R155 已建立的**原型扩展模式**（`setupXxx(SidebarApp)` 函数注入），保持一致性：

```javascript
// sidebar-chat.js
export function setupChat(SidebarApp) {
  SidebarApp.prototype.sendMessage = async function() { /* ... */ };
  // ...
}
```

```javascript
// sidebar.js（编排层）
import { setupChat } from './sidebar-chat.js';
import { setupKnowledge } from './sidebar-knowledge.js';
// ...
setupChat(SidebarApp);
setupKnowledge(SidebarApp);
// ...
const app = new SidebarApp();
```

### 4.2 依赖方向

- 子模块 → 不得 import 其他子模块（仅允许 import lib/ 层模块）
- 子模块间共享数据通过 `this`（SidebarApp 实例）访问
- sidebar.js 编排层统一 import 所有子模块并注册

### 4.3 拆分粒度原则

一个职责域超出 400 行时，必须二次拆分。但拆分边界应符合逻辑语义（如"对话核心逻辑" vs "对话历史管理"），而非机械地按行数切割。

### 4.4 Chrome API 依赖

sidebar.js 重度依赖 `chrome.runtime.onMessage`、`chrome.storage`、`chrome.tabs` 等 API。拆分后这些调用分散在子模块中，需确保：
- 每个子模块仅 import 自身需要的 lib/ 依赖
- 不引入循环依赖
- Chrome API mock 在测试中保持兼容

### 4.5 manifest.json

确认 `sidebar/sidebar.html` 中 `<script>` 标签或 `manifest.json` 中 `sidebar` 入口配置能正确加载拆分后的模块文件（ESM import 链）。

---

## 5. 依赖关系

### 5.1 前置依赖

| 依赖 | 说明 |
|------|------|
| R155 部分成果 | sidebar-settings.js(365行) 和 sidebar-utils.js(199行) 已创建，保留并扩充 |
| R154 Lint 基线 | ESLint 配置已就绪，`no-unused-vars` 规则为 `error` |

### 5.2 后续依赖

| 依赖方 | 说明 |
|--------|------|
| R159 Lint 警告清零 | R158 连带修复 sidebar.js 8 处警告后，R159 处理剩余 25 处 |
| R160 覆盖率修复 | 拆分后模块结构变更影响 c8 插桩路径，R160 需重新校准 |
| R161 lib 文件拆分 | R158 仅处理 sidebar/ 目录，lib/ 层 >400 行文件由 R161 负责 |

### 5.3 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 拆分后 import 链断裂导致侧边栏白屏 | 中 | 保留 sidebar.js 中所有 import 并逐个迁移验证 |
| 原型扩展模式下 `this` 绑定丢失 | 低 | 使用普通函数而非箭头函数定义 prototype 方法 |
| R155 创建的文件与新拆分产生重复代码 | 高 | 先审计 sidebar-settings.js / sidebar-utils.js 内容，合并去重后再拆分 |
| 拆分后行数仍 >400（与 R155 相同的失败模式） | 中 | 每个子模块 `wc -l` 实测验证，不允许 "声称完成但未实际执行" |
| DOM 引用（this.btnXxx）跨模块失效 | 中 | DOM 引用统一在 init() 中绑定，子模块通过 this 访问 |

---

## 6. 拆分方案预估

基于代码分区分析，建议的子模块文件清单：

| 文件名 | 职责 | 预估行数 |
|--------|------|----------|
| `sidebar.js` | 编排层：constructor + init + import + setup 注册 + 消息监听 | ≤400 |
| `sidebar-init.js` | init() 中的 DOM 绑定、事件监听初始化 | ≤400 |
| `sidebar-chat.js` | 对话核心：sendMessage、handleAIError、retry、skillCalls | ≤400 |
| `sidebar-chat-history.js` | 对话历史：持久化、历史面板、恢复、清除 | ≤400 |
| `sidebar-chat-features.js` | 对话特性：分支对话、全文总结、YouTube/API/GitHub/PDF | ≤400 |
| `sidebar-code.js` | 代码沙箱 + 代码块复制 + 多标签页联合分析 | ≤400 |
| `sidebar-knowledge.js` | 知识库列表/搜索/详情 + 知识图谱渲染 | ≤400 |
| `sidebar-knowledge-advanced.js` | 高亮管理 + 学习路径 + 进化状态 | ≤400 |
| `sidebar-bookmark.js` | 书签面板：列表/搜索/详情/文件夹/统计 | ≤400 |
| `sidebar-skills.js` | 技能面板 + 自定义技能管理 + 商店 | ≤400 |
| `sidebar-settings.js` | 设置/提供商/Profile/模型发现/备份（扩充已有文件） | ≤400 |
| `sidebar-utils.js` | 工具函数 + Toast + 日志面板 + 页面上下文（扩充已有文件） | ≤400 |
| `sidebar-extras.js` | 间隔复习 + Prompt模板 + 新手引导 | ≤400 |

**总计: 13 个文件（含 sidebar.js 编排层）**

> 注：此为预估方案，实现时允许根据实际代码结构调整合并/拆分，唯一硬约束是每个文件 ≤400 行。

---

## 7. 验证策略

1. **行数验证**：`wc -l sidebar/sidebar*.js` 全部 ≤ 400
2. **Lint 验证**：`npm run lint` sidebar/ 相关 0 errors / 0 warnings
3. **功能验证**：手动加载扩展，验证侧边栏全部面板/功能 UI 无异常
4. **回归验证**：`npm run test:ci` 6157+ pass / 0 fail
5. **导入链验证**：确认 `sidebar.html` 加载无 console 报错

---

*文档版本: v1.0 | 生成时间: 2026-05-19*
*飞轮迭代 R56 — PageWise Chrome Extension*
