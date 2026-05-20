# REQUIREMENTS-ITER8.md — R172: 离线内容缓存 OfflineContentCache

> 迭代: R172
> 日期: 2026-05-20
> 角色: Plan Agent
> 复杂度: Complex

---

## 背景与动机

PageWise 的书签系统（BookmarkGraph）已覆盖采集→图谱→搜索→推荐→复习的完整链路，但所有书签内容依赖在线访问。用户在断网、弱网或原始页面被删除/改版时无法回溯阅读记录。离线内容缓存填补这一缺口，将"收藏即归档"理念从 URL 引用升级为全文快照，同时为离线搜索提供数据基础，增强知识库的可靠性与独立性。

---

## 1. 用户故事

### US-1: 离线阅读
> 作为一名经常收藏技术文章的用户，我希望已读/已收藏的书签页面正文能自动缓存到本地，这样在断网或原始页面被删除后，我仍然可以回顾原文内容。

### US-2: 离线搜索
> 作为一名知识工作者，我希望离线状态下也能对已缓存的书签内容进行全文搜索，这样不受网络条件限制即可快速定位信息。

### US-3: 缓存管理
> 作为一名存储敏感的用户，我希望能查看缓存的存储用量、按域名或时间范围清理缓存，这样我可以控制扩展占用的磁盘空间。

---

## 2. 验收标准

| # | 标准 | 说明 |
|---|------|------|
| AC-1 | 正文提取与持久化 | 对指定 URL 调用 Readability 算法提取正文，生成结构化快照（title / textContent / excerpt / siteName / cachedAt / url / wordCount），存入 IndexedDB 独立 objectStore `offline-cache`。已存在则跳过（幂等）。 |
| AC-2 | 离线全文检索 | 缓存写入时同步更新 `BookmarkSemanticSearch` 的 TF-IDF 索引（将 `textContent` 作为 `contentPreview` 字段），使离线搜索命中率等同于在线搜索。 |
| AC-3 | LRU 淘汰与用量管理 | 缓存条目超过 500 篇时自动按最近访问时间淘汰最旧条目；提供 `getStorageUsage()` 返回 `{ usedBytes, maxBytes, percentUsed }`；用量 ≥ 80% 时触发 warning 回调。支持手动按域名/时间范围批量清除。 |
| AC-4 | 自动后台缓存 | 书签状态变更为 `read` 或被用户收藏时，通过 `BookmarkPerformanceOptimizer` 的分批处理机制在后台静默缓存页面正文，不阻塞 UI 线程。 |
| AC-5 | 缓存状态 UI | 书签详情面板展示缓存状态标记：`✅ 已缓存` / `⬜ 未缓存` / `⚠️ 缓存过期`（超过 30 天未重新访问视为过期），并提供「立即缓存」手动触发按钮。 |
| AC-6 | 导出集成 | `BookmarkImportExport.exportJSON()` 中每条书签对象增加 `offlineContent` 字段（含 excerpt + cachedAt），导入时可选恢复离线缓存。 |
| AC-7 | 测试覆盖 | 单元测试 ≥ 25 用例，覆盖正文提取、缓存写入/读取/淘汰、离线搜索、状态查询、导出集成、边界条件。 |

---

## 3. 功能详述

### 3.1 模块结构

新建 `lib/bookmark-offline-cache.js`，导出 `BookmarkOfflineCache` 类。

```
BookmarkOfflineCache
├── cache(url)                     — 提取并缓存指定 URL
├── getCached(url)                 — 读取缓存（命中则更新 lastAccessedAt）
├── isCached(url)                  — 查询状态: 'cached' | 'expired' | 'missing'
├── removeCached(url)              — 删除单条缓存
├── batchCache(urls, options)      — 分批缓存（复用 BookmarkPerformanceOptimizer）
├── clearByDomain(domain)          — 按域名清除
├── clearByDateRange(from, to)     — 按时间范围清除
├── getStorageUsage()              — 存储用量统计
├── getCacheStats()                — 缓存统计（总数/已缓存/过期/总字数）
├── _extractContent(url)           — Readability 正文提取（内部方法）
├── _evictLRU()                    — LRU 淘汰（内部方法）
└── _syncToSearchIndex(cachedItem) — 同步 TF-IDF 索引（内部方法）
```

### 3.2 数据模型

```javascript
// IndexedDB objectStore: 'offline-cache'
{
  url: string,              // 主键
  title: string,
  textContent: string,      // 提取后的纯文本正文
  excerpt: string,          // 前 200 字摘要
  siteName: string,
  wordCount: number,
  cachedAt: number,         // Date.now()
  lastAccessedAt: number,   // 最近读取时间（LRU 依据）
  expiresAt: number,        // cachedAt + 30*24*60*60*1000
  contentHash: string       // textContent 的简易哈希，用于变更检测
}
```

### 3.3 LRU 淘汰策略

- 硬上限: 500 篇
- 淘汰优先级: `lastAccessedAt` 最早 → 同时间则 `wordCount` 最小优先
- `getCached()` 命中时刷新 `lastAccessedAt`
- 存储用量按 `textContent.length * 2`（UTF-16）估算，上限 50 MB

### 3.4 过期判定

- 默认 TTL: 30 天
- `isCached(url)` 返回值:
  - 存在且未过期 → `'cached'`
  - 存在但超过 TTL → `'expired'`（仍可读取，但 UI 显示警告）
  - 不存在 → `'missing'`

### 3.5 自动缓存触发条件

| 触发事件 | 来源 | 行为 |
|----------|------|------|
| 书签状态 → `read` | `bookmark-status-tracker.js` 事件 | 调用 `cache(url)` |
| 用户手动收藏 | `bookmark-collector.js` | 调用 `cache(url)` |
| 用户手动触发 | 详情面板「立即缓存」按钮 | 调用 `cache(url)` |

### 3.6 导出格式扩展

`exportJSON()` 输出中每条书签新增可选字段:

```javascript
{
  // ...existing fields...
  offlineContent: {
    excerpt: "前200字...",
    cachedAt: 1716192000000,
    wordCount: 2840
  }
}
```

导入时若 `offlineContent` 存在，提示用户是否恢复离线缓存（需重新 fetch 原文写入 IndexedDB）。

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 纯前端 | Chrome Extension MV3，不依赖 npm / 打包工具 |
| Readability 实现 | 使用 Mozilla Readability.js 算法的精简移植版，内联于模块中（或复用项目已有的页面提取逻辑 R001），不额外引入外部库 |
| IndexedDB | 新建独立 objectStore `offline-cache`，不修改现有 DB schema；使用版本号升级机制 |
| Content Script 通信 | 正文提取需在页面上下文执行，通过 `chrome.runtime.sendMessage` 从 service worker 请求 content script 提取 |
| 内存安全 | 单条 `textContent` 上限 100,000 字符（超限截断），防止大页面撑爆内存 |
| 不阻塞 UI | 批量缓存使用 `requestIdleCallback` 或 `setTimeout` 分片，单批 ≤ 5 篇 |
| 权限 | 不需要新增 `permissions`，复用现有 `activeTab` + `storage` 权限 |

---

## 5. 依赖关系

| 依赖模块 | 复用点 | 集成方式 |
|----------|--------|----------|
| `lib/bookmark-semantic-search.js` | TF-IDF 索引构建 / 更新 | 缓存写入后调用 `buildIndex()` 或增量更新 `_documentVectors` |
| `lib/bookmark-performance.js` (`BookmarkPerformanceOptimizer`) | 分批处理调度 | 复用 `buildGraphBatched` 相同的 chunk 机制进行 `batchCache` |
| `lib/bookmark-io.js` (`BookmarkImportExport`) | 导出/导入 | 扩展 `exportJSON`/`importFromJSON` 增加 `offlineContent` 字段 |
| `lib/bookmark-status-tracker.js` | 状态变更事件 | 监听 `read`/`favorite` 状态变更，触发自动缓存 |
| `lib/bookmark-detail-panel.js` | UI 状态标记 | 详情面板新增缓存状态展示与手动缓存按钮 |
| R001 页面内容提取 | Readability 正文提取策略 | 复用或移植提取逻辑到 service worker 环境 |

---

## 6. 里程碑与排期

| 阶段 | 内容 | 预估 |
|------|------|------|
| M1 | IndexedDB schema + Readability 提取 + `cache()` / `getCached()` | 1 轮 |
| M2 | LRU 淘汰 + 存储用量统计 + 过期判定 | 1 轮 |
| M3 | 自动缓存（事件监听 + 分批处理）+ 详情面板 UI | 1 轮 |
| M4 | 离线搜索索引同步 + 导出集成 + 测试 25 用例 | 1 轮 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 跨域 fetch 失败（CORS） | 无法提取正文 | Content script 在页面上下文 DOM 直接提取；不可注入页面（chrome://）标记为不可缓存 |
| IndexedDB 存储配额 | Chrome 限制 ~60% 磁盘空间 | 500 篇硬上限 + 100K 字符/篇截断，实际峰值 ≈ 100MB 远低于配额 |
| Readability 对 SPA 页面提取质量差 | 缓存内容碎片化 | 对 SPA 页面降级为 DOM innerText 提取 + 兜底 |
| 大量书签首次批量缓存 | 长时间占用资源 | 分批 + requestIdleCallback + 可暂停/恢复 |

---

## 8. 非目标 (Out of Scope)

- ❌ 图片/视频等富媒体离线缓存（仅文本）
- ❌ 页面 CSS/JS 完整快照（非 ArchiveBox）
- ❌ 云端同步离线缓存（R014 独立需求）
- ❌ PDF 离线缓存（R022 独立需求）

---

*Plan Agent 生成 | 2026-05-20*
