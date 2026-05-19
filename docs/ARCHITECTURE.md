# 架构概览 — 智阅 PageWise

> 最后更新: 2026-05-19
> 适用版本: v3.0.0+

---

## 分层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser Extension (Manifest V3)               │
│                     Chrome / Firefox / Edge / Brave               │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Content      │  │  Sidebar     │  │  Background          │   │
│  │  Script       │  │  Panel       │  │  Service Worker      │   │
│  │              │  │  (Main UI)   │  │                      │   │
│  │  DOM 提取     │  │  对话 UI     │  │  右键菜单            │   │
│  │  选中文本     │  │  技能面板    │  │  消息路由            │   │
│  │  高亮定位     │  │  知识库      │  │  Side Panel 管理     │   │
│  │  PDF 降级     │  │  复习系统    │  │  PDF.js 处理         │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │                │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐   │
│  │                        Lib Layer (130+ 模块)                │   │
│  │  纯 JavaScript ES Modules，无 DOM / 浏览器 API 依赖        │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                     │
│  ┌──────────────────────────┴────────────────────────────────┐   │
│  │                      Storage Layer                         │   │
│  │                                                            │   │
│  │  chrome.storage.sync     设置 / API Key / 自定义绑定       │   │
│  │  chrome.storage.local    进化状态 / 复习会话 / 通知        │   │
│  │  chrome.storage.session  对话历史（24h 过期）              │   │
│  │  IndexedDB               知识库 / 对话历史 / 高亮          │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  AI API          │
                      │  Claude/OpenAI/  │
                      │  DeepSeek/Ollama │
                      └──────────────────┘
```

### 层级职责

| 层级 | 职责 | 特征 |
|------|------|------|
| **UI 层** | 用户交互、渲染、事件处理 | 依赖 DOM / Chrome UI API |
| **Lib 层** | 核心业务逻辑、算法、数据处理 | 纯 JS，可独立测试 |
| **Storage 层** | 持久化、同步、缓存 | 通过 storage-adapter.js 统一抽象 |
| **AI 层** | 大模型调用 | 通过 ai-client.js 双协议封装 |

---

## 核心模块依赖关系

```
                        ┌─────────────────┐
                        │   sidebar.js    │ (UI 编排层)
                        └────────┬────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                     ▼
   ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │   ai-client    │  │  skill-engine   │  │  page-sense      │
   │   ai-cache     │  │  custom-skills  │  │  selection-*     │
   └───────┬────────┘  └────────┬────────┘  └──────────────────┘
           │                    │
           ▼                    ▼
   ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │  memory        │  │  agent-loop     │  │  evolution       │
   └───────┬────────┘  └─────────────────┘  └──────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    Data Layer                             │
   │                                                          │
   │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
   │  │ knowledge-base│  │conversation- │  │highlight-     │  │
   │  │ (CRUD/Query/ │  │store (IDB)   │  │store (IDB)    │  │
   │  │  Export/Core)│  │              │  │               │  │
   │  └──────┬───────┘  └──────────────┘  └───────────────┘  │
   │         │                                                │
   │         ▼                                                │
   │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
   │  │knowledge-    │  │embedding-    │  │spaced-        │  │
   │  │graph         │  │engine        │  │repetition     │  │
   │  │(layout/wiki/ │  │(TF-IDF)     │  │(SM-2)         │  │
   │  │ utils)       │  │              │  │               │  │
   │  └──────────────┘  └──────────────┘  └───────────────┘  │
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │                 BookmarkGraph 子系统 (60+ 模块)           │
   │                                                          │
   │  Collector → Indexer → GraphEngine → Visualizer          │
   │       ↓          ↓          ↓            ↓               │
   │  Clusterer   Search    Recommender   DetailPanel         │
   │       ↓          ↓          ↓                            │
   │  LearningPath  SemanticSearch  KnowledgeLink             │
   │       ↓          ↓          ↓                            │
   │  GapDetector  SmartCollections  AIRecommender            │
   │       ↓          ↓          ↓                            │
   │  Status      Dedup        ImportExport                   │
   │  Sync        Backup       Migration                     │
   │  I18n        DarkTheme    Accessibility                  │
   │  Onboarding  ErrorHandler PerformanceOpt                 │
   └──────────────────────────────────────────────────────────┘
```

---

## 核心数据流

### 1. AI 问答流程

```
用户输入 → sidebar.js
  → page-sense.js (页面类型识别)
  → memory.js (知识召回 + 用户画像)
  → ai-client.js → AI API
    ├── ai-cache.js (缓存检查)
    └── 流式响应 → message-renderer.js (渲染)
  → knowledge-base.js (自动保存，如启用)
  → evolution.js (隐式反馈收集)
```

### 2. 知识库流程

```
知识写入:
  AI 回答 → knowledge-base-crud.js → IndexedDB
  导入文件 → importer.js → knowledge-base-crud.js → IndexedDB

知识检索:
  搜索输入 → knowledge-base-query.js (全文搜索 + 标签过滤)
          → embedding-engine.js (语义搜索)
          → knowledge-graph.js (关联扩展)

知识导出:
  knowledge-base-export.js → Markdown / JSON
  entity-extractor.js → Obsidian 笔记 (AI 辅助)
```

### 3. 复习流程

```
复习开始 → spaced-repetition.js (获取到期卡片)
  → review-session.js (会话管理)
  → 用户评分 → calculateNextReview (SM-2 算法)
  → review-session.recordCard (记录)
  → 会话结束 → saveSession (持久化到 chrome.storage.local)
```

### 4. 书签图谱流程

```
Chrome 书签树 → BookmarkCollector (递归采集)
  → BookmarkIndexer (倒排索引)
  → BookmarkGraphEngine (相似度计算 + 图谱构建)
  → BookmarkVisualizer (Canvas 力导向图渲染)
  → BookmarkClusterer (主题聚类)
  → BookmarkSearch (综合搜索)
  → BookmarkSemanticSearch (语义搜索, TF-IDF)
  → BookmarkKnowledgeCorrelation (与知识库关联)
```

---

## 工具模块

| 模块 | 职责 | 被引用次数 |
|------|------|-----------|
| `utils.js` | 通用工具 (设置、Markdown、防抖、节流、生成 ID) | 最高 |
| `storage-adapter.js` | 存储抽象层 (sync/local 自动降级) | 高 |
| `sanitize.js` | 输入净化 (XSS、URL、搜索注入) | 高 |
| `error-handler.js` | 全局错误分类 + 重试 + 降级 | 中 |
| `i18n.js` | 国际化基础 (注册/切换/翻译) | 中 |
| `cost-estimator.js` | AI Token 用量估算 | 低 |
| `log-store.js` | 结构化日志存储 | 低 |

---

## 存储层详细设计

### Storage 选型

| 数据类型 | 存储方案 | 理由 |
|---------|---------|------|
| API 设置 / 偏好 | `chrome.storage.sync` | 跨设备同步 |
| 进化状态 | `chrome.storage.local` | 本地持久，大容量 |
| 对话历史 | `chrome.storage.session` | 会话级，24h 过期 |
| 知识库 | `IndexedDB` | 结构化查询，全文搜索 |
| 对话归档 | `IndexedDB` (conversation-store) | 持久存储 |
| 高亮标注 | `IndexedDB` (highlight-store) | 按 URL 索引 |
| 复习会话 | `chrome.storage.local` | 最多 100 条 |

### storage-adapter.js 抽象

```javascript
// 统一 API，自动降级 sync → local
await storageGet(keys)     // 读取
await storageSet(items)    // 写入
await storageRemove(keys)  // 删除
isSyncStorage()            // 检查当前后端
getStorageBackend()        // 获取后端名称 ('sync' | 'local')
```

---

## 模块分类索引

### AI 与对话

| 模块 | 功能 |
|------|------|
| `ai-client.js` | Claude / OpenAI 双协议封装，流式 + 非流式 |
| `ai-cache.js` | LRU 内存缓存 (FNV-1a 哈希，TTL 过期) |
| `ai-gateway.js` | AI 网关路由 |
| `chat-mode.js` | 对话模式管理 |
| `conversation-store.js` | 对话历史 IndexedDB 持久化 |
| `message-renderer.js` | Markdown 渲染 + 代码高亮 |
| `cost-estimator.js` | Token 用量估算 |

### 知识库

| 模块 | 功能 |
|------|------|
| `knowledge-base.js` | 知识库入口 (聚合子模块) |
| `knowledge-base-core.js` | IndexedDB 初始化 + 连接管理 |
| `knowledge-base-crud.js` | CRUD 操作 |
| `knowledge-base-query.js` | 全文搜索 + 标签过滤 |
| `knowledge-base-export.js` | Markdown / JSON 导出 |
| `knowledge-base-text-utils.js` | 文本处理工具 |
| `knowledge-graph.js` | 知识关联图谱 (聚合子模块) |
| `knowledge-graph-layout.js` | 力导向布局算法 |
| `knowledge-graph-wiki.js` | Wiki 图谱数据 |
| `knowledge-graph-utils.js` | 图谱工具函数 |
| `knowledge-panel.js` | 知识库面板 UI |
| `embedding-engine.js` | TF-IDF 向量引擎 |
| `entity-extractor.js` | AI 实体/概念提取 |

### 技能系统

| 模块 | 功能 |
|------|------|
| `skill-engine.js` | 技能注册、发现、执行 |
| `skill-store.js` | 技能持久化存储 |
| `skill-validator.js` | 技能配置校验 |
| `skill-zip.js` | 技能打包/解包 |
| `custom-skills.js` | 用户自定义技能 CRUD |
| `plugin-system.js` | 插件系统扩展 |

### 学习系统

| 模块 | 功能 |
|------|------|
| `spaced-repetition.js` | SM-2 间隔复习算法 |
| `review-session.js` | 复习会话管理 |
| `learning-path.js` | 学习路径生成 |
| `page-summarizer.js` | 页面总结 |

### 页面交互

| 模块 | 功能 |
|------|------|
| `page-sense.js` | 页面类型识别 (6 种) |
| `selection-detector.js` | 选区检测 |
| `selection-handler.js` | 选区事件处理 |
| `selection-toolbar.js` | 浮动工具栏 |
| `highlight-store.js` | 高亮存储 (IndexedDB) |
| `selection-detector-global.js` | 全局选区检测 |
| `selection-handler-global.js` | 全局选区处理 |
| `selection-toolbar-global.js` | 全局工具栏 |
| `explore-mode.js` | 探索模式 |
| `explore-mode-global.js` | 全局探索模式 |
| `pdf-extractor.js` | PDF 文本提取 (pdf.js) |

### 记忆与进化

| 模块 | 功能 |
|------|------|
| `memory.js` | 用户画像 + 知识召回 |
| `evolution.js` | 隐式反馈 + 策略调优 |
| `agent-loop.js` | 任务分解 + 规划执行 |

### 书签图谱 (BookmarkGraph 子系统)

| 模块 | 功能 |
|------|------|
| `bookmark-collector.js` | Chrome 书签树采集 |
| `bookmark-indexer.js` | 倒排索引构建 |
| `bookmark-graph.js` | 图谱引擎 (相似度 + 聚类) |
| `bookmark-visualizer.js` | Canvas 力导向渲染 |
| `bookmark-search.js` | 综合搜索 |
| `bookmark-semantic-search.js` | TF-IDF 语义搜索 |
| `bookmark-recommender.js` | 图谱推荐 |
| `bookmark-ai-recommender.js` | AI 智能推荐 |
| `bookmark-clusterer.js` | 主题聚类 (14 领域) |
| `bookmark-tagger.js` | 自动标签生成 |
| `bookmark-tag-editor.js` | 标签手动编辑 |
| `bookmark-status.js` | 阅读状态管理 |
| `bookmark-dedup.js` | 重复检测清理 |
| `bookmark-io.js` | 数据导入导出 |
| `bookmark-knowledge-link.js` | 书签-知识库关联 |
| `bookmark-knowledge-integration.js` | 联动编排层 |
| `bookmark-learning-path.js` | 书签学习路径 |
| `bookmark-gap-detector.js` | 知识盲区检测 |
| `bookmark-smart-collections.js` | 智能集合 |
| `bookmark-sharing.js` | 书签分享 |
| `bookmark-analytics.js` | 收藏统计分析 |
| `bookmark-i18n.js` | 书签国际化 |
| `bookmark-dark-theme.js` | 暗色主题 |
| `bookmark-keyboard-shortcuts.js` | 快捷键 |
| `bookmark-performance.js` | 性能优化器 |
| `bookmark-error-handler.js` | 错误处理 |
| `bookmark-migration.js` | 数据迁移 |
| `bookmark-backup.js` | 备份恢复 |
| `bookmark-sync.js` | 跨设备同步 |
| `bookmark-notifications.js` | 通知系统 |
| `bookmark-accessibility.js` | 无障碍 |

### 基础设施

| 模块 | 功能 |
|------|------|
| `utils.js` | 通用工具函数 |
| `storage-adapter.js` | 存储抽象层 |
| `sanitize.js` | 输入净化 |
| `error-handler.js` | 全局错误处理 |
| `i18n.js` | 国际化基础 |
| `i18n-detector.js` | 语言检测 |
| `browser-compat.js` | 浏览器兼容层 |
| `onboarding.js` | 新手引导 |
| `shortcuts.js` | 全局快捷键 |
| `context-menu.js` | 右键菜单 |
| `stats.js` | 使用统计 |
| `log-store.js` | 日志存储 |
| `importer.js` | 多格式导入 |
| `prompt-templates.js` | Prompt 模板管理 |

---

## 设计原则

1. **零运行时依赖**：不引入 npm 包，保持 Chrome 扩展轻量
2. **ES Modules**：原生 ESM，MV3 原生支持，无需构建
3. **纯函数优先**：lib/ 层尽可能使用纯函数，方便测试
4. **依赖注入**：Chrome API / Storage / AI Client 通过参数注入，便于 mock
5. **渐进增强**：功能降级而非崩溃（如 IndexedDB 不可用时降级）
6. **向后兼容**：模块拆分保持 API 签名不变
