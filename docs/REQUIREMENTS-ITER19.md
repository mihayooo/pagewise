# 需求文档 — R122: 开发者文档补全 DevDocumentation

> 日期: 2026-05-19
> 飞轮迭代: R18 (第 19 轮迭代)
> 复杂度: Simple
> 状态: 📋 待开发

---

## 1. 背景与动机

PageWise 经过 121 轮飞轮迭代，已成长为一个包含 **136 个 lib/ 模块**、**139 个测试文件**、**537+ 测试用例**的大型 Chrome 扩展项目。但项目开发者文档严重滞后于代码增长：

- **CONTRIBUTING.md 不存在** — 新贡献者无从入手
- **README「开发指南」过于简略** — 仅 40 行，缺少环境搭建、调试技巧、发布流程
- **lib/ 无 API 文档** — 136 个模块的公共 API 仅靠源码 JSDoc 散落各处，无集中速查
- **无架构概览图** — README 中的 ASCII 架构图仅展示三层结构，未体现 136 个模块间的依赖关系与数据流
- **CI 流程未文档化** — GitHub Actions 的 lint → test → manifest 校验流程仅在 `.github/workflows/ci.yml` 中

**目标**: 为项目建立完整的开发者文档体系，降低新贡献者上手门槛至 **30 分钟内完成首次 PR**。

---

## 2. 用户故事

### US-1: 新贡献者快速上手

> 作为一名**首次接触 PageWise 的开发者**，我希望阅读 CONTRIBUTING.md 后能在 30 分钟内搭建开发环境、运行测试、提交第一个 PR，以便快速参与项目贡献。

### US-2: 理解项目架构

> 作为一名**需要修改 lib/ 模块的开发者**，我希望查看架构概览图和 lib/ API 速查表，以便快速定位目标模块、理解其职责边界和依赖关系，避免误修改。

---

## 3. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `CONTRIBUTING.md` 存在于项目根目录，包含开发环境搭建（Node 22+ / Chrome 114+ / ESLint / c8）、分支策略（master/main + feature 分支）、PR 流程（fork → branch → commit → test → PR → review）、测试规范（文件命名 `test-*.js`、node:test 框架、覆盖率 ≥92%）四个完整章节 | 文件存在 + 四个 H2 章节可验证 |
| AC-2 | `docs/ARCHITECTURE.md` 存在，包含：① 模块依赖关系图（lib/ 136 个模块按功能域分组，标注组间依赖方向）；② 数据流图（页面内容 → Content Script → Lib Layer → AI API → 知识库 → Sidebar UI 的完整链路）；③ 存储层概览（chrome.storage.sync/local/session + IndexedDB 各自用途） | 文件存在 + 含 Mermaid 或 ASCII 图表 |
| AC-3 | `docs/API-REFERENCE.md` 存在，覆盖 lib/ 中 **所有**公共模块（至少列出 136 个模块的：模块名、文件路径、职责一句话描述、导出的顶级函数/类名），核心模块（ai-client、knowledge-base、skill-engine、page-sense、memory、evolution）附带函数签名与参数说明 | 文件存在 + 模块覆盖率 = 100% |
| AC-4 | `README.md` 的「开发指南」章节扩展为完整指南，包含：开发环境搭建、调试技巧（Service Worker 调试、Content Script 调试、侧边栏调试）、发布流程（build.sh 各浏览器打包 + Chrome Web Store 提交）、新模块添加流程。原有「添加新技能」「添加新测试」内容保留 | README 中「开发指南」章节行数 ≥ 150 行 |
| AC-5 | 所有新建/修改的文档内部链接有效（相对路径可达）、无死链 | 手动验证所有 `](docs/` 和 `](#` 锚点链接 |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零代码修改** | 本次迭代仅产出文档（.md 文件），不修改任何 .js / .html / .css / .json 源码 |
| **零依赖引入** | 不引入新的 npm 依赖或工具链 |
| **Mermaid 兼容** | 架构图使用 Mermaid 语法（GitHub 原生渲染支持），若复杂度允许也可使用 ASCII art |
| **中英文** | 文档主体使用中文（与 README 风格一致），术语和代码示例保留英文 |
| **文档即代码** | API 速查表中的模块列表应可由脚本从 lib/ 目录和 JSDoc 注释半自动生成，但本次迭代允许手动编写 |
| **CI 不变** | 不修改 `.github/workflows/ci.yml` 或任何 CI 配置 |
| **向后兼容** | README 中原有的安装/使用/技能/架构章节内容不删减，仅扩展「开发指南」章节 |

---

## 5. 交付物清单

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| D1 | `CONTRIBUTING.md` | 新建 | 开发者贡献指南（环境搭建 / 分支策略 / PR 流程 / 测试规范） |
| D2 | `docs/ARCHITECTURE.md` | 新建 | 架构概览（模块分组依赖图 + 数据流图 + 存储层概览） |
| D3 | `docs/API-REFERENCE.md` | 新建 | lib/ 公共 API 速查表（136 个模块全覆盖） |
| D4 | `README.md` | 修改 | 扩展「开发指南」章节（环境搭建 / 调试 / 发布 / 新模块开发） |

---

## 6. 依赖关系

### 6.1 前置依赖

| 依赖 | 状态 | 说明 |
|------|------|------|
| lib/ 模块目录结构稳定 | ✅ 已满足 | 136 个模块文件已就位，R116/R120 大模块拆分已完成 |
| README.md 现有结构 | ✅ 已满足 | 当前 README 结构清晰，可增量扩展 |
| JSDoc 注释覆盖 | ⚠️ 部分满足 | 部分 lib/ 模块缺少完整 JSDoc，API 速查表需人工补充分析 |
| CI 配置稳定 | ✅ 已满足 | `.github/workflows/ci.yml` 已稳定运行 |

### 6.2 后续被依赖

| 被依赖方 | 影响 |
|---------|------|
| R123+ 后续迭代 | 新模块开发应同步更新 API 速查表 |
| 社区贡献者 | CONTRIBUTING.md 将作为 PR 审查的参考标准 |
| Release Notes | 发布流程文档化后，发布 checklist 可引用 CONTRIBUTING.md |

### 6.3 与已有文档的关系

| 已有文档 | 关系 |
|---------|------|
| `docs/REQUIREMENTS.md` | R122 独立于功能需求，属于工程基础设施类需求 |
| `docs/MULTI_BROWSER.md` | CONTRIBUTING.md 中「浏览器兼容性」章节将引用此文档 |
| `docs/DESIGN-ITER*.md` | 架构概览图可提炼各迭代设计文档中的模块关系 |
| `CHANGELOG.md` | R122 完成后将在此记录变更 |
| `docs/ROADMAP.md` | 开发者文档是工程健康度指标的一部分 |

---

## 7. 章节大纲（详细规范）

### 7.1 CONTRIBUTING.md 章节结构

```
# 贡献指南

## 快速开始
  - Fork + Clone 命令
  - Node.js 22+ / npm install
  - Chrome 加载已解压扩展步骤
  - 运行测试 (npm test)

## 开发环境搭建
  - 前置条件: Node.js 22+, Chrome 114+, Git
  - 克隆仓库 + npm install（仅 ESLint + c8）
  - Chrome 加载扩展 + 启用开发者模式
  - 热重载技巧（扩展管理页刷新按钮）

## 分支策略
  - master = 稳定发布分支
  - feat/* / fix/* / docs/* = 功能分支
  - 分支命名: feat/R{NNN}-{简述}（如 feat/R122-dev-docs）

## PR 流程
  - Fork → Branch → Commit → Push → PR
  - PR 模板要求（关联 Issue / 变更描述 / 测试截图）
  - CI 门禁: ESLint + 测试 + manifest 校验
  - Code Review 要求: 至少 1 人 approve

## 测试规范
  - 文件命名: tests/test-{module}.js
  - 框架: Node.js 内置 node:test + assert/strict
  - 覆盖率: 行覆盖率 ≥ 92%（c8）
  - Smoke test: 50 个核心用例 < 5s 通过
  - Flaky test 检测: scripts/detect-flaky.sh

## 代码风格
  - ESLint flat config (eslint.config.js)
  - ES Modules, const/let, 无 var
  - camelCase 变量/函数, PascalCase 类
  - JSDoc 注释: 所有导出函数必须有
  - Conventional Commits: feat/fix/docs/refactor/test

## 提交信息规范
  - 格式: <type>: <description>
  - type 列表: feat/fix/docs/refactor/test/chore/ci
  - 示例: feat: R122 补充开发者文档
```

### 7.2 ARCHITECTURE.md 章节结构

```
# 架构概览

## 整体架构图
  - 四层: Content Script → Lib Layer → AI API → Storage
  - Mermaid 或 ASCII 图表

## 模块分组
  - 核心 AI: ai-client, ai-cache, ai-gateway, agent-loop, evolution, memory
  - 知识库: knowledge-base(-core/-crud/-query/-export/-text-utils), knowledge-graph, knowledge-graph-layout, knowledge-graph-utils, knowledge-graph-wiki
  - 书签系统: bookmark-* (60+ 模块)
  - 页面感知: page-sense, pdf-extractor, selection-*, highlight-store
  - 技能系统: skill-engine, skill-store, skill-validator, custom-skills, plugin-system
  - UI/交互: message-renderer, onboarding, shortcuts, i18n, browser-compat
  - 工具: utils, sanitize, error-handler, stats, log-store, storage-adapter

## 数据流
  - 用户提问: 页面 DOM → content.js → sidebar.js → ai-client.js → AI API
  - 知识保存: AI 回答 → knowledge-base.js → IndexedDB
  - 书签采集: 浏览历史 → bookmark-collector.js → bookmark-indexer.js → bookmark-store
  - 记忆系统: 用户行为 → evolution.js → chrome.storage.local

## 存储层
  - chrome.storage.sync: 设置/API Key（跨设备）
  - chrome.storage.local: 进化状态/书签/偏好（本地持久）
  - chrome.storage.session: 临时对话上下文（24h 过期）
  - IndexedDB: 知识库/对话历史/书签数据（大容量结构化）
```

### 7.3 API-REFERENCE.md 结构

```
# lib/ 公共 API 速查表

> 自动生成于 2026-05-19 | 覆盖 136 个模块

## 使用说明
  - 所有模块均为 ES Module (export)
  - 导入方式: import { funcName } from '../lib/module-name.js'

## 模块列表

### 核心 AI
| 模块 | 路径 | 职责 | 导出 |
|------|------|------|------|
| ai-client | lib/ai-client.js | AI API 双协议客户端 | createAIClient, sendChat, streamChat |
| ... | ... | ... | ... |

### 知识库
...

### 书签系统
...（60+ 模块）

（每个模块一行，核心模块附函数签名展开说明）
```

### 7.4 README.md 「开发指南」扩展要点

在现有内容基础上扩展为以下子章节：

1. **开发环境搭建** — 详细的 Node/npm/Chrome 安装 + 加载扩展步骤
2. **调试指南** — Service Worker DevTools / Content Script 断点 / 侧边栏 Console
3. **发布流程** — build.sh 打包 → 版本号更新 → CHANGELOG → GitHub Release → 各商店提交
4. **新模块开发** — 目录选择 (lib/) / 命名 / 导出 / 测试 / JSDoc / 更新 API 速查表
5. **常见问题** — Service Worker 休眠 / Content Script 注入失败 / IndexedDB 版本升级

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| lib/ 136 个模块逐一梳理工作量大 | 中 | 交付延迟 | API 速查表第一版允许「一句话描述 + 导出名」粒度，核心模块才展开函数签名 |
| JSDoc 覆盖不全导致 API 文档信息不足 | 中 | 文档准确性 | 源码优先，无 JSDoc 的模块手动补充描述 |
| 架构图无法准确反映 136 模块间所有依赖 | 低 | 图表参考价值降低 | 按功能域分组（7-8 组），只画组间依赖，不画组内每个模块间依赖 |
| 文档维护成本 — 后续迭代可能使文档过时 | 中 | 长期可信度 | API 速查表头部标注生成日期；后续可引入脚本半自动生成 |

---

## 9. 成功指标

| 指标 | 目标值 | 测量方式 |
|------|-------|---------|
| CONTRIBUTING.md 存在且完整 | 4 个核心章节均存在 | 文件检查 |
| lib/ API 模块覆盖率 | 136/136 = 100% | 速查表模块数 / lib/ 目录文件数 |
| README「开发指南」行数 | ≥ 150 行 | wc -l 统计章节范围 |
| 文档内死链数 | 0 | 手动验证 |
| 新贡献者上手时间（目标） | ≤ 30 分钟 | 人工评估 |

---

## 10. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-19 | 初始创建 — R122 开发者文档补全需求 |
