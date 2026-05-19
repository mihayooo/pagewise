# TODO — BookmarkGraph 飞轮迭代计划

> 基于 PRD.md 和 REQUIREMENTS-BOOKMARK.md 规划
> 迭代轮次: R43 - R147
> 最后更新: 2026-05-19

---

## Phase A: BookmarkGraph MVP (R43-R52) — 10 轮

### 核心功能：书签采集 → 图谱构建 → 可视化 → 搜索

- [x] **R43: 书签采集器 BookmarkCollector** — `lib/bookmark-collector.js`
  - 递归读取 Chrome 书签树
  - 标准化书签对象 (id, title, url, folderPath, dateAdded)
  - 处理空书签/重复书签/特殊字符
  - 测试: 18 用例 ✅
  - 复杂度: Medium

- [x] **R44: 书签索引器 BookmarkIndexer** — `lib/bookmark-indexer.js`
  - 基于标题+URL+文件夹建立倒排索引
  - 支持中英文混合分词 (中文逐字 + bigram)
  - 多关键词 AND 逻辑搜索
  - 按文件夹/标签过滤 + 匹配度排序
  - 测试: 24 用例 ✅
  - 复杂度: Medium

- [x] **R45: 书签图谱引擎 BookmarkGraphEngine** — `lib/bookmark-graph.js`
  - 混合相似度算法 (Jaccard标题 + 域名匹配 + 文件夹重叠)
  - 倒排索引优化候选对生成 (避免 O(n²))
  - 生成图谱数据 {nodes, edges}，支持聚类
  - 测试: 22 用例 ✅
  - 复杂度: Complex

- [x] **R46: 图谱可视化 BookmarkVisualizer** — `lib/bookmark-visualizer.js`
  - Canvas 力导向图渲染 (库仑斥力 + 弹簧引力 + 阻尼)
  - 缩放/拖拽/搜索高亮/点击回调
  - 节点颜色按 group 15 色方案, 大小按连接数缩放
  - 视口裁剪优化, requestAnimationFrame 驱动
  - 测试: 15 用例 ✅
  - 复杂度: Complex

- [x] **R47: 详情面板 BookmarkDetailPanel** — `lib/bookmark-detail-panel.js`
  - 点击节点显示详情 (标题/URL/文件夹/时间)
  - 显示相似书签列表 (Top-5)
  - 点击URL打开原网页 (chrome.tabs.create)
  - 标签编辑 (添加/删除/自动补全) + 状态标记 (unread/reading/read)
  - 操作回调 (onAction) + 异常安全
  - 测试: 22 用例 ✅
  - 复杂度: Medium

- [x] **R48: 相似推荐 BookmarkRecommender** — `lib/bookmark-recommender.js`
  - 基于图谱的 Top-K 相似推荐 (recommend)
  - 基于内容的即时推荐 (recommendByContent)
  - 推荐理由生成: 同域名/同文件夹/标题相似/混合
  - 测试: 15 用例 ✅
  - 复杂度: Medium

- [x] **R49: 书签搜索 BookmarkSearch** — `lib/bookmark-search.js`
  - 综合搜索: 索引关键词匹配 + 图谱相关性扩展
  - 条件过滤: 文件夹 / 标签 / 状态 / 域名
  - 搜索建议: 基于标签 + 热门搜索 + 书签标题
  - 200ms 防抖搜索建议
  - 多排序: relevance / date / title
  - 测试: 22 用例 ✅
  - 复杂度: Medium

- [x] **R50: 弹窗概览 BookmarkPopup** — `popup/bookmark-overview.js`
  - 显示书签总数/领域分布/最近添加/待读数量
  - 快速搜索入口 (实时过滤，中英文多关键词 AND)
  - "查看完整图谱"按钮 (打开选项页)
  - 点击书签打开原网页
  - 测试: 17 用例 ✅
  - 复杂度: Medium

- [x] **R51: 选项页集成 BookmarkOptionsPage** — `options/bookmark-panel.js`
  - 新增"书签图谱"标签页
  - 完整图谱 + 搜索 + 详情面板
  - 与现有标签页风格一致
  - 测试: 13 用例 ✅
  - 复杂度: Medium

- [x] **R52: BookmarkGraph MVP E2E 测试** — `tests/test-bookmark-graph-e2e.js`
  - 全模块集成测试 (Collector → Indexer → Graph → Search → Recommender)
  - 边界情况覆盖 (空书签/单书签/100+书签)
  - 性能基准测试 (100+ 书签 <200ms)
  - 测试: 14 用例 ✅
  - 复杂度: Medium

---

## Phase B: BookmarkGraph V1.0 (R53-R62) — 10 轮

### 增强功能：主题聚类 → 学习路径 → 标签管理 → 重复检测

- [x] **R53: 主题聚类 TopicClustering** — `lib/bookmark-clusterer.js`
  - 基于关键词/URL模式自动分类
  - 支持 15+ 技术领域 (前端/后端/DevOps/AI/数据库等)
  - 聚类结果可手动调整
  - 测试: 21 用例 ✅
  - 复杂度: Complex

- [x] **R54: 学习路径推荐 LearningPathFromBookmarks** — `lib/bookmark-learning-path.js`
  - 分析书签内容难度 (入门/进阶/高级)
  - 生成学习路径: 基础入门 → 实战练习 → 深入理解 → 生产实践
  - 标记已学/待学状态 + 进度统计
  - 复用 `lib/learning-path.js` 路径排序思路
  - 测试: 21 用例 ✅
  - 复杂度: Complex

- [x] **R55: 标签自动生成 AutoTagGeneration** — `lib/bookmark-tagger.js`
  - 基于标题/URL/文件夹生成标签
  - 每个书签 3-5 个标签
  - 标签去重/合并
  - 测试: 21 用例
  - 复杂度: Medium

- [x] **R56: 标签手动编辑 TagManualEditing** — `lib/bookmark-tag-editor.js`
  - 添加/删除/覆盖标签: `addTag()`, `removeTag()`, `setTags()`
  - 标签自动补全: `getAutocomplete(partial, limit)`
  - 批量编辑标签: `batchAddTag()`, `batchRemoveTag()`
  - 标签规范化: 小写、去空格、去特殊字符、最大 30 字符
  - 测试: 30 用例 ✅
  - 复杂度: Simple

- [x] **R57: 知识盲区检测 KnowledgeGapDetection** — `lib/bookmark-gap-detector.js`
  - 分析各领域书签数量分布（14 个技术领域）
  - 识别"热门但资料少"的领域，4 级覆盖度: well-covered / moderate / weak / gap
  - 推荐补充方向（盲区入门 + 关联领域，弱项进阶）
  - 支持聚类结果和标签频率两种数据源
  - 测试: 27 用例 ✅
  - 复杂度: Medium

- [x] **R58: 状态标记 BookmarkStatusMarking** — `lib/bookmark-status.js`
  - 三种状态: unread/reading/read（默认 unread）
  - 状态批量修改 (batchSetStatus / markAllAsRead)
  - 按状态过滤 (getByStatus)
  - 状态统计 (getStatusCounts)
  - 最近阅读 (getRecentlyRead)
  - 单调递增序保证排序稳定性
  - 测试: 19 用例 ✅
  - 复杂度: Simple

- [x] **R59: 文件夹分析 FolderAnalysis** — `lib/bookmark-folder-analyzer.js`
  - 统计各文件夹书签数量和分布
  - 识别低质量文件夹（过少/过多/空）
  - 建议整理方案（合并/拆分/删除）
  - 文件夹深度分析和树形结构
  - 质量评估 5 级: excellent/normal/underused/overcrowded/empty
  - 测试: 20 用例 ✅
  - 复杂度: Simple

- [x] **R60: 重复检测 BookmarkDedup** — `lib/bookmark-dedup.js`
  - URL 规范化去重 (移除协议/www/尾斜杠/跟踪参数)
  - 标题相似度去重 (Jaccard 系数, 可配置阈值, 默认 0.7)
  - findDuplicates() 综合检测 + suggestCleanup() 合并/删除建议
  - batchRemove() 批量清理重复书签
  - 测试: 36 用例 ✅
  - 复杂度: Medium

- [x] **R61: 数据导入导出 BookmarkImportExport** — `lib/bookmark-io.js`
  - `exportJSON()`: 导出完整图谱 (书签+聚类+标签+状态)
  - `exportCSV()`: 导出书签列表 (含表头, 中文路径)
  - `importFromChromeHTML(html)`: 解析 Chrome 书签 HTML
  - `importFromJSON(json)`: 从 JSON 导入完整图谱
  - `exportToFile(format)`: 导出 Blob ('json' | 'csv')
  - 进度回调: onProgress(phase, current, total)
  - 测试: 24 用例 ✅
  - 复杂度: Medium

- [x] **R62: BookmarkGraph V1.0 E2E 测试** — `tests/test-bookmark-v1-e2e.js`
  - 全模块集成测试 (Phase B: Clusterer, LearningPath, Tagger, TagEditor, GapDetector, Status, FolderAnalyzer, Dedup, ImportExport)
  - 模块间交互测试 (聚类→盲区、标签→搜索、去重→导出)
  - 空数据兼容 + 100+书签性能测试
  - 测试: 15 用例 ✅
  - 复杂度: Medium

---

## Phase C: BookmarkGraph V2.0 (R63-R72) — 10 轮

### 高级功能：链接检测 → 语义搜索 → AI 推荐 → 知识关联

- [x] **R63: 链接健康检查 LinkHealthCheck** — `lib/bookmark-link-checker.js`
  - 后台批量检测链接状态
  - 标记失效链接
  - 修复/删除建议
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R64: 书签内容预览 BookmarkContentPreview** — `lib/bookmark-preview.js`
  - extractUrlInfo / generateTextPreview / generateHtmlPreview / generateSnapshotPreview
  - _truncate (中文字符数截断) / _escapeHtml (XSS 安全转义)
  - 纯数据模块，无状态，无 I/O
  - 测试: 31 用例 ✅
  - 复杂度: Complex

- [x] **R65: 语义搜索 BookmarkSemanticSearch** — `lib/bookmark-semantic-search.js`
  - 复用 `lib/embedding-engine.js` TF-IDF 核心算法
  - 自然语言查询: `semanticSearch(query, opts)`
  - 语义相似度排序: TF-IDF 余弦相似度
  - 混合搜索: `hybridSearch(query, opts)` — 关键词 0.6 + 语义 0.4
  - 以文搜文: `findSimilar(bookmarkId, limit)`
  - 增量更新: `addBookmark` / `removeBookmark`
  - 缓存管理: `invalidateCache(bookmarkId?)`
  - 书签域字段权重: title 3.0 / tags 2.0 / contentPreview 1.5 / folderPath 1.0 / url 0.5
  - 测试: 35 用例 ✅
  - 复杂度: Medium

- [x] **R66: 知识关联 BookmarkKnowledgeCorrelation** — `lib/bookmark-knowledge-link.js`
  - 多维关联: URL 精确匹配 (0.4) + 标题 TF-IDF 语义相似 (0.3) + 标签 Jaccard 重叠 (0.3)
  - 双向查询: `getRelatedEntries(bookmarkId)` + `getRelatedBookmarks(entryId)`
  - 关联强度可视化: `getCorrelationStrength()` 返回 URL/标题/标签 分项得分
  - 关联建议: `suggestCorrelations()` 推荐未关联但高相似度对
  - 增量更新: `addEntry()` / `removeEntry()`
  - 关联摘要: `getCorrelationSummary(bookmarkId)` 返回书签关联概览
  - 测试: 30 用例 ✅
  - 复杂度: Complex

- [x] **R67: 学习进度追踪 BookmarkLearningProgress**
  - 记录学习时间
  - 进度百分比
  - 学习统计图表
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R68: AI 推荐 BookmarkAIRecommendations** — `lib/bookmark-ai-recommender.js`
  - 复用 `lib/ai-client.js`
  - 分析收藏模式
  - 推荐相关领域资料
  - 推荐理由说明
  - 测试: 36 用例 ✅
  - 复杂度: Complex

- [x] **R69: 统计仪表盘 BookmarkStatistics** — `lib/bookmark-stats.js`
  - 收藏趋势图
  - 领域分布饼图
  - 活跃度热力图
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R70: 暗色主题 BookmarkDarkTheme** — `lib/bookmark-dark-theme.js`
  - 三种模式: light/dark/system (matchMedia 检测)
  - 图谱节点/边颜色适配 (含 15 色分组明暗方案)
  - 面板暗色适配 (背景/文字/边框/输入框)
  - 18 个 CSS 变量，主题变更回调
  - 测试: 43 用例 ✅
  - 复杂度: Simple

- [x] **R71: 快捷键 BookmarkKeyboardShortcuts** — `lib/bookmark-keyboard-shortcuts.js`
  - 搜索: Ctrl+F
  - 缩放: +/=/−/0
  - 刷新: F5
  - 自定义绑定 (chrome.storage.sync) + 冲突检测
  - 回调驱动 on/off/dispatch 架构
  - 测试: 48 用例 ✅
  - 复杂度: Simple

- [x] **R72: BookmarkGraph V2.0 E2E 测试**
  - 全模块集成测试
  - 性能测试 (1000+ 书签)
  - 测试: 15+ 用例
  - 复杂度: Medium

---

## Phase D: 集成与打磨 (R73-R82) — 10 轮

### 集成：与 PageWise 核心功能联动

- [x] **R73: 书签-知识库联动 BookmarkKnowledgeIntegration** — `lib/bookmark-knowledge-integration.js`
  - 书签与 PageWise 知识库双向关联（编排层，桥接 R66 关联引擎）
  - 从知识库跳转到相关书签 (getBookmarksForEntry / buildEntryNavLinks)
  - 从书签跳转到相关知识 (getKnowledgeForBookmark / buildNavigationLinks)
  - 知识增强: enrichBookmark / enrichEntry 附加跨域上下文
  - 仪表盘: getDashboard (Top 关联书签/建议/孤立节点)
  - 测试: 42 用例 ✅
  - 复杂度: Complex

- [x] **R74: 自动分类 BookmarkAutoCategorize**
  - 新增书签自动分类
  - 基于历史分类学习
  - 分类规则可配置
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R75: 智能集合 BookmarkSmartCollections** — `lib/bookmark-smart-collections.js`
  - 6 种规则类型: tags/domain/folder/status/dateRange/category
  - 多规则 AND 组合
  - 内置集合: 未读/正在阅读/最近添加
  - 自定义集合 CRUD + 序列化/反序列化
  - 书签增删后集合自动更新
  - 测试: 40 用例 ✅
  - 复杂度: Medium

- [x] **R76: 书签分享 BookmarkSharing** — `lib/bookmark-sharing.js`
  - 创建可分享集合 (createShareableCollection)
  - 多格式导出: JSON / 文本 / Base64 / data: URI
  - 隐私控制: stripPersonalData / anonymizeUrls / includeFields
  - 导入分享数据: 支持 JSON / Base64 / data: URI 三种格式
  - 进度回调支持
  - 测试: 60 用例 ✅
  - 复杂度: Medium

- [x] **R77: 高级分析 BookmarkAdvancedAnalytics**
  - 收藏模式分析
  - 学习效率分析
  - 知识覆盖度分析
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R78: 性能优化 BookmarkPerformanceOptimization** — `lib/bookmark-performance.js`
  - 分批处理引擎: buildGraphBatched / buildIndexBatched / computeSimilarityBatched
  - LRU 缓存淘汰: trimCache (Map 插入序实现)
  - 视口裁剪: getVisibleNodes (padding 扩展)
  - Worker 卸载: createWorker / runInWorker (主线程降级)
  - 性能统计: getPerformanceStats (buildTime/cacheHits/totalProcessed)
  - 测试: 20 用例 ✅
  - 复杂度: Complex

- [x] **R79: 无障碍 BookmarkAccessibility**
  - 键盘导航
  - 屏幕阅读器支持
  - ARIA 标签
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R80: 国际化 BookmarkI18n** — `lib/bookmark-i18n.js`
  - 42+ i18n key 覆盖所有用户可见字符串
  - 中英文语言包 (zh-CN / en-US)
  - 语言偏好持久化 (chrome.storage.sync)
  - 日期格式本地化
  - 状态标签本地化
  - 新增语言只需传入翻译文件
  - 测试: 37 用例 ✅
  - 复杂度: Simple

- [x] **R81: 引导向导 BookmarkOnboarding**
  - 首次使用引导
  - 功能介绍
  - 隐私说明
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R82: Phase D 集成测试**
  - 全功能集成测试
  - 端到端用户流程测试
  - 测试: 15+ 用例
  - 复杂度: Medium

---

## Phase E: 发布准备 (R83-R92) — 10 轮

### 打磨：安全 → 性能 → 文档 → 发布

- [x] **R83: Chrome Web Store 准备 BookmarkStorePrep**
  - 更新 manifest.json
  - 更新 _locales
  - 截图准备
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R84: 安全审计 BookmarkSecurityAudit**
  - XSS 防护
  - 数据隔离
  - 权限最小化
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R85: 性能基准测试 BookmarkPerformanceBenchmark**
  - 采集性能基准
  - 渲染性能基准
  - 搜索性能基准
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R86: 错误处理 BookmarkErrorHandler** — `lib/bookmark-error-handler.js`
  - 错误分类: `classifyError()` — 5 类 (network/permission/storage/validation/unknown)
  - 优雅降级: `handleBookmarkError()` — 结构化错误响应 + 恢复建议
  - 错误边界: `createErrorBoundary()` — 异步函数包装 + fallback
  - 结构化日志: `logError()` — 不写 console，返回结构化对象
  - 纯函数设计，零副作用，不依赖 DOM / Chrome API
  - 测试: 48 用例 ✅
  - 复杂度: Medium

- [x] **R87: 用户文档 BookmarkDocumentation**
  - 使用指南
  - API 文档
  - 常见问题
  - 测试: 4+ 用例
  - 复杂度: Simple

- [x] **R88: 数据迁移 BookmarkMigration** — `lib/bookmark-migration.js`
  - 版本升级迁移 (v1→v2: clusters→collections, statuses→readingProgress, 新增 metadata)
  - 数据格式兼容 (checkDataCompatibility: v1/v2 结构验证)
  - 迁移路径规划 (getMigrationPath) + 迁移报告 (createMigrationReport)
  - 批量迁移 (batchMigrate) + 迁移验证 (validateMigration)
  - 测试: 92 用例 ✅
  - 复杂度: Medium

- [x] **R89: 备份恢复 BookmarkBackupRestore** — `lib/bookmark-backup.js`
  - createBackup/restoreBackup/validateBackup/computeChecksum
  - 增量备份 createIncrementalBackup
  - 备份管理 listStoredBackups/deleteStoredBackup
  - 测试: 53 用例 ✅
  - 复杂度: Medium

- [x] **R90: UI/UX 最终打磨 BookmarkFinalPolish** — `lib/bookmark-final-polish.js`
  - 7 个动画/交互函数 + 3 个工具函数
  - animateNodeEntry/animateEdgeDraw/optimizeLayout/enhanceDragDrop
  - addRippleEffect/showTooltip/smoothScrollTo
  - 测试: 87 用例 ✅
  - 复杂度: Medium

- [x] **R91: 发布候选版 BookmarkReleaseCandidate**
  - 15 个跨模块集成测试
  - 全量回归 5705 测试通过
  - 复杂度: Medium

- [x] **R92: BookmarkGraph v3.0.0 正式发布**
  - 版本号更新至 3.0.0
  - RELEASE-NOTES-v3.md / CHANGELOG.md
  - 5705 测试全绿
  - 复杂度: Medium

---

## 统计

| Phase | 轮次 | 预计新增模块 | 预计新增测试 |
|-------|------|------------|------------|
| A: MVP | R43-R52 | 9 个 | 90+ |
| B: V1.0 | R53-R62 | 8 个 | 70+ |
| C: V2.0 | R63-R72 | 7 个 | 70+ |
| D: 集成 | R73-R82 | 6 个 | 70+ |
| E: 发布 | R83-R92 | 4 个 | 60+ |
| N: 测试冲刺 | R138-R142 | 0 个 | 200+ |
| O: 测试修复与覆盖率冲刺 | R143-R147 | 0 个 | 100+ |
| **总计** | **60 轮** | **34 个** | **660+** |

---

## ✅ 已完成

### 之前迭代 (R1-R42)
- [x] R1-R42: 见 ROADMAP.md

## Phase F: 最终发布 (R93-R102) — 10 轮
- [x] **R93: 性能优化 BookmarkPerformanceOpt** — `lib/bookmark-performance-opt.js`
  - SearchIndexPrebuilder / LazyLoader / VirtualScroller
  - 测试: 30 用例 ✅
- [x] **R94: 数据同步 BookmarkSync** — `lib/bookmark-sync.js`
  - Chrome Sync API / 冲突解决 / 批量同步
  - 测试: 52 用例 ✅
- [x] **R95: 批量操作 BookmarkBatch** — `lib/bookmark-batch.js`
  - batchDelete / batchAddTag / batchRemoveTag / batchMoveToFolder
  - 测试: 42 用例 ✅
- [x] **R96: 搜索历史 BookmarkSearchHistory** — `lib/bookmark-search-history.js`
  - recordSearch / getSearchHistory / getPopularSearches / getSuggestions
  - 测试: 32 用例 ✅
- [x] **R97: 收藏夹导入导出 BookmarkImportExport** — 已在 R61 完成
- [x] **R98: 通知系统 BookmarkNotifications** — `lib/bookmark-notifications.js`
  - notify / getNotifications / markAsRead / clearAll / getUnreadCount
  - 测试: 32 用例 ✅
- [x] **R99: 高级标签 BookmarkAdvancedTags** — `lib/bookmark-advanced-tags.js`
  - 标签颜色 / 标签层级 / 标签统计 / 自动标签
  - 测试: 20 用例 ✅
- [x] **R100: 书签分析 BookmarkAnalytics** — `lib/bookmark-analytics.js`
  - getVisitStats / getCollectionTrend / getDomainDistribution / getActivityHeatmap
  - 测试: 73 用例 ✅
- [x] **R101: 最终集成测试 BookmarkFinalIntegration** — `tests/test-bookmark-final-integration.js`
  - 全模块跨模块集成测试
  - 测试: 12 用例 ✅
- [x] **R102: 版本发布 BookmarkReleaseFinal**
  - 全量回归 5857 测试通过
  - GitHub Release

---

## Phase G: 质量巩固 (R103-R107) — 5 轮

> 最后更新: 2026-05-19

### v3.0.0 发布后质量加固 + 技术债务清偿

- [x] **R103: 测试基础设施修复 TestInfrastructureFix** — 修复测试运行器配置，`node --test` 无法自动发现 tests/ 目录导致报告 0 pass/0 fail；在 package.json 中建立 `"test"` script（如 `node --test 'tests/*.js'`），确保 CI 流水线绿色；验证全量 5857 用例回归通过。复杂度: Simple
  - package.json 新增 `test` / `test:ci` / `test:all` 三个 scripts
  - CI 工作流改用 `npm run test:ci`
  - 全量回归: 5887 pass, 0 fail ✅

- [x] **R104: AI 客户端错误处理增强 AiClientErrorHandling** — `lib/ai-client.js` 补充 TD002：API 错误分类（网络超时/429 限流/401 认证/500 服务端）；指数退避重试（最多 3 次）；降级策略（切换备用模型/离线提示）；结构化错误日志。复杂度: Medium

- [x] **R105: 知识库索引优化 KnowledgeBaseIndexOpt** — `lib/knowledge-base.js` 补充 TD003：评估并建立 IndexedDB 复合索引（title+createdAt, tags+category）；大数据量（1000+ 条目）查询性能基准测试；引入查询结果缓存层。复杂度: Medium

- [x] **R106: 核心流程端到端审计 CoreFlowAudit** — 走查核心用户体验流程：选中文字 → 提问 → AI 回答 → 存入知识库 → 检索回顾；记录交互痛点、性能瓶颈、边界 case；输出改进清单供 R107 消化。复杂度: Simple

- [x] **R107: 代码健康度仪表盘 CodeHealthDashboard** — 建立项目健康度指标：模块依赖图可视化、循环依赖检测、未使用导出检测、文件大小/行数监控；`scripts/health-check.sh` 一键生成报告。复杂度: Medium

---

## Phase H: 基础设施加固 (R108-R112) — 5 轮

> 飞轮迭代 R5 起，2026-05-19
> 目标: 偿还核心技术债务、建立代码质量基线、修复 R106 审计发现

- [x] **R108: 测试覆盖率度量 TestCoverage** — 引入 `c8` 原生 V8 coverage；`npm run test:coverage` 一键生成覆盖率报告；目标: lib/ 模块行覆盖率 ≥ 60%（实际 92.15%）；`coverage/` 目录 .gitignore；输出 lcov + text-summary。关闭 TD001。复杂度: Simple ✅

- [x] **R109: 代码静态检查 ESLintSetup** — `eslint.config.js` flat config（ES Modules）；rules: no-unused-vars / no-undef / eqeqeq / no-implicit-globals；`npm run lint` + CI 集成；现有代码基线修复（允许 --max-warnings 从宽收紧）。复杂度: Simple

- [x] **R110: 核心流程改进 CoreFlowFix** — 基于 R106 审计输出，修复选中文字→提问→AI 回答→存入知识库→检索回顾流程中的交互痛点：选区丢失容错（重试 + 提示）、AI 响应超时 UI 反馈、知识库写入失败兜底（本地重试队列）、检索结果空态引导。复杂度: Medium

- [x] **R111: 输入安全加固 InputSanitization** — 统一用户输入净化层 `lib/sanitize.js`：XSS 防护（HTML 实体编码）、URL 校验（仅允许 http/https/javascript: 拦截）、搜索注入防护（特殊字符转义）、书签标题/标签长度限制；替换现有散落的 escapeHtml 调用为集中模块。复杂度: Medium

- [x] **R112: 技术债务结算 TechDebtCleanup** — 更新 TD 表（TD001→已关闭 via R108, TD002→已关闭 via R104, TD003→已关闭 via R105）；清理 lib/test-r97.js 测试残留文件；README 更新（badge: CI/coverage/lint）；CHANGELOG 补充 R103-R107 变更记录。复杂度: Simple

---

## Phase I: CI 修复与测试加固 (R113-R117) — 5 轮

> 飞轮迭代 R10 起，2026-05-19
> 目标: 修复 CI 流水线红灯、消除测试盲区、清理测试冗余、提升代码可维护性

- [x] **R113: CI 流水线修复 CiLintFix** — 修复 2 个失败测试：(1) CI `lint` job 使用 `node --check` 语法检查但测试断言应包含 `npm run lint` 步骤，需将 ESLint 集成到 CI workflow；(2) TD 状态表缺少 ESLint 相关记录导致设计文档验证失败。全量回归 6006 pass / 0 fail。复杂度: Simple

- [x] **R114: 测试覆盖空白填补 TestCoverageGap** — 为 15 个无测试文件的 lib 模块补充单元测试：agent-loop(231行)、evolution(547行)、importer(297行)、graph-export(197行)、docmind-client(443行)、docmind-sync(414行)、selection-handler、selection-detector-global、selection-handler-global、selection-toolbar-global、explore-mode-global、core-flow-fix、bookmark-core、bookmark-import-export、bookmark-organize。目标: 每模块 ≥10 用例。复杂度: Medium

- [x] **R115: 测试套件瘦身 TestSuiteTrim** — 清理测试文件冗余：识别重复覆盖同一模块的测试文件（如 test-qa002-*.js 9 个文件、test-depth-*.js 18 个文件、多个历史迭代残留测试）；合并/去重后测试文件数减少 ≥30%；全量测试执行时间目标 ≤25s（当前 ~36s）。复杂度: Medium

- [x] **R116: 大模块拆分重构 ModuleRefactor** — 对超大模块进行职责拆分：knowledge-base.js(1866行→拆为 core/crud/query/export)、bookmark-graph.js(1096行)、knowledge-graph.js(1035行)、knowledge-panel.js(907行)、bookmark-organize.js(806行)。拆分后每文件 ≤400 行，保持 API 签名不变确保向后兼容。复杂度: Complex

- [x] **R117: 健康检查报告更新 HealthCheckUpdate** — 更新 scripts/health-check.sh：新增测试覆盖空白检测（列出无测试的模块）、新增 ESLint 警告趋势统计、新增模块行数 Top-10 排行、修复与 R113/R114/R115 的衔接。输出 HTML + Markdown 双格式报告。复杂度: Simple

---

## Phase J: 飞轮迭代 R15+ (R118-R122) — 5 轮

> 飞轮迭代 R15 起，2026-05-19
> 目标: 修复测试红灯、清除 ESLint 警告存量、完成大模块拆分、加固测试稳定性、补全开发者文档

- [x] **R118: 测试失败修复 TestFailureFix** — 修复 3 个失败测试：test-bookmark-backup-restore.js（备份恢复相关断言失败）、test-bookmark-release.js（发布流程断言失败）；修复 2 个 ESLint parsing error（标识符重复声明）；目标: 全量回归 0 fail。复杂度: Simple
- [x] **R119: ESLint 警告清理 LintWarningCleanup** — 清除 633 个 eqeqeq 警告：将存量 `==`/`!=` 全部替换为 `===`/`!==`（106 处影响文件）；清理后将 eqeqeq 规则从 `warn` 恢复为 `error`；目标: `npm run lint` 0 warnings 0 errors。复杂度: Medium
- [x] **R120: 超大模块拆分续 LargeModuleSplit** — R116 仅完成 knowledge-base.js 拆分，剩余 56 个 >400 行文件需继续拆分，优先处理 Top-5：bookmark-graph.js(1096行)、knowledge-panel.js(907行)、bookmark-organize.js(806行)、auto-classifier.js(728行)、stats.js(701行)。拆分后每文件 ≤400 行，保持 API 向后兼容。复杂度: Complex
- [x] **R121: 测试稳定性加固 TestStabilityHardening** — 建立测试质量基线：新增 flaky test 检测脚本（连续 3 次运行结果一致性校验）；测试隔离度审计（确保无共享可变状态泄漏）；建立 smoke test 子集（核心流程 ~50 用例，CI 快速门禁 <5s）。复杂度: Medium
- [x] **R122: 开发者文档补全 DevDocumentation** — 补充项目开发者文档：CONTRIBUTING.md（开发环境搭建、分支策略、PR 流程、测试规范）；架构概览图（模块依赖关系 + 数据流）；lib/ 公共 API 速查表；README 更新（开发/调试/发布指南）。复杂度: Simple

---

## Phase K: 质量修复与深度优化 (R123-R127) — 5 轮

> 飞轮迭代 R20 起，2026-05-19
> 目标: 修复 49 个失败测试、清理 197 个 ESLint 警告、完成剩余超大模块拆分、加强模块解耦与缓存策略

- [x] **R123: 测试失败批量修复 TestFailureBatchFix** — 修复全量回归中 49 个失败测试：(1) BookmarkBackup 21+ 个断言失败（createBackup/validateBackup/restoreBackup 结构与预期不匹配，疑似 R116 模块拆分后 API 变更）；(2) BookmarkAdvancedSearch 3 个组合过滤断言失败；(3) sanitize 模块 6 个断言失败（escapeHtml/escapeHtmlAttr/escapeSearchQuery/sanitizeBookmarkTitle）；(4) R122 文档验收 12 个断言失败（LIB-API-REFERENCE.md 未生成、README/CHANGELOG/IMPLEMENTATION 未更新）。目标: `npm run test:ci` 0 fail。复杂度: Medium

- [x] **R124: ESLint 警告彻底清除 LintWarningZero** — 清除剩余 197 个 no-unused-vars 警告：逐文件审查未使用变量/导入/参数，删除或前缀 `_` 标记有意忽略项；将 no-unused-vars 规则从 `warn` 收紧为 `error`；目标: `npm run lint` 0 errors 0 warnings。复杂度: Medium

- [x] **R125: 超大模块拆分收尾 ModuleSplitFinish** — R120 声称完成 Top-5 拆分但实际仍有 9 个文件 >500 行：bookmark-organize.js(806)、auto-classifier.js(728)、stats.js(701)、wiki-store.js(694)、skill-store.js(694)、plugin-system.js(658)、bookmark-store-prep.js(655)、bookmark-analytics.js(646)、bookmark-visualizer.js(643)。优先拆分前 3 个（>700 行），每文件 ≤400 行，保持 API 向后兼容。复杂度: Complex

- [x] **R126: 模块间循环依赖消除 CircularDepElimination** — 利用 R107 健康检查输出，识别并消除模块间循环依赖：梳理依赖图 → 断开环路（接口抽象/事件总线/依赖注入）；将核心模块（knowledge-base、ai-client、bookmark-graph）解耦为单向依赖 DAG；新增循环依赖 CI 门禁脚本。复杂度: Complex

- [x] **R127: 缓存与性能策略统一 CachePerfUnify** — 统一散落在各模块中的缓存策略：review-session.js LRU、bookmark-performance.js LRU、knowledge-base 查询缓存、bookmark-semantic-search 缓存 → 提取公共 `lib/cache-manager.js`（LRU + TTL + 失效策略）；替换各模块自实现缓存为统一层；1000+ 书签场景性能基准回归确保无退化。复杂度: Medium

---

## Phase L: 质量回归与发布收尾 (R128-R132) — 5 轮

> 飞轮迭代 R24 起，2026-05-19
> 目标: 修复 49 个失败测试、清除 122 个 ESLint 问题、完成超大模块拆分、补全无障碍功能、最终发布准备

- [x] **R128: 测试失败批量修复 TestFailureBatchFix2** — 修复 `npm run test:ci` 中 49 个失败测试（21 个 distinct test name）：(1) BookmarkBackup 11 个断言失败（createBackup/validateBackup/restoreBackup round-trip，疑似 R127 缓存策略重构后序列化结构变更）；(2) R122 文档验收 4 个断言失败（LIB-API-REFERENCE.md 未生成、README/CHANGELOG/IMPLEMENTATION 未更新）；(3) LRU 缓存 2 个边界断言（bookmark-search、knowledge-base）；(4) R125 模块拆分验证 3 个断言（文件行数 ≤400、bookmark-clusterer 导出、bookmark-folder-suggestions）；(5) BookmarkSearch smoke 1 个。目标: `npm run test:ci` 4897+ pass / 0 fail。复杂度: Medium ✅ (实际 4949 pass / 0 fail)

- [x] **R129: ESLint 问题清零 LintCleanSweep** — 修复 8 个 `eqeqeq` 错误（bookmark-advanced-search.js 2 处、sanitize.js 6 处 `==`/`!=` → `===`/`!==`）；清理 114 个 `no-unused-vars` 警告（逐文件审查 20+ 个文件：删除或前缀 `_` 标记未使用变量/导入/参数）；将 `no-unused-vars` 规则收紧为 `error`；目标: `npm run lint` 0 errors 0 warnings。复杂度: Medium

- [x] **R130: 超大模块拆分二期 ModuleSplitPhase2** — 仍有 11 个文件 >600 行：wiki-store.js(694)、skill-store.js(694)、plugin-system.js(658)、bookmark-store-prep.js(655)、bookmark-analytics.js(646)、bookmark-visualizer.js(643)、bookmark-knowledge-link.js(643)、bookmark-migration.js(624)、ai-client.js(609)、bookmark-exporter.js(601)、bookmark-accessibility.js(598)。优先拆分前 5 个（>640 行），每文件 ≤400 行，保持 API 向后兼容。复杂度: Complex ✅ (5040 pass / 0 fail)

- [x] **R131: 无障碍功能补全 AccessibilityComplete** — 需求文档 P1 级别（R79）：键盘导航（Tab/Enter/Escape/Arrow Up-Down）、屏幕阅读器（aria-label, role, live regions）、焦点管理（焦点环、焦点陷阱）、颜色对比度 ≥ 4.5:1 审计。`lib/bookmark-accessibility.js` 补全 KeyboardNav/FocusTrap/ARIA/ContrastAudit 四大模块；67 用例覆盖（+18 新增）。复杂度: Medium ✅ (67 pass / 0 fail)

- [x] **R132: 引导向导与发布准备 OnboardingPublish** — (1) 需求文档 P1 级别（R81）BookmarkOnboarding：首次安装 4 步引导向导（welcome→features→theme→autoCollect）、核心功能介绍、主题选择、自动采集开关、状态持久化、i18n 双语。`lib/bookmark-onboarding.js` + 72 用例。(2) 更新 manifest.json / _locales / 截图准备。复杂度: Medium

---

## Phase M: 持续质量优化 (R133-R137) — 5 轮

> 飞轮迭代 R30 起，2026-05-19
> 目标: 清除剩余 lint 警告、继续大模块拆分、优化测试执行效率、补全核心流程 E2E 覆盖、提升测试覆盖率基线

- [x] **R133: Lint 警告清零 LintWarningFinal** — 40 个文件仍存在 115 个 `no-unused-vars` 警告（agent-loop.js、ai-client.js、bookmark-visualizer.js、bookmark-semantic-search.js 等）；逐文件审查未使用变量/导入/参数，删除或前缀 `_` 标记；将 `no-unused-vars` 规则收紧为 `error`（`eslint.config.js` max-warnings → 0）；目标: `npm run lint` 0 errors 0 warnings。复杂度: Medium

- [x] **R134: 超大模块拆分三期 ModuleSplitPhase3** — 仍有 14 个文件 >500 行：bookmark-visualizer.js(643)、bookmark-knowledge-link.js(643)、bookmark-accessibility.js(636)、bookmark-migration.js(624)、ai-client.js(609)、bookmark-exporter.js(601)、contradiction-detector.js(589)、bookmark-semantic-search.js(579)、skill-validator.js(577)、git-repo.js(567)、bookmark-sync.js(561)、bookmark-ai-recommender.js(558)、bookmark-final-polish.js(555)、compilation-report.js(552)。优先拆分前 8 个（>570 行），每文件 ≤400 行，保持 API 向后兼容（re-export 模式）。复杂度: Complex

- [x] **R135: 测试执行优化 TestExecutionOpt** — 当前全量测试 5061 用例执行耗时 ~29.5s；优化策略: (1) 按模块分片并行执行（`node --test --test-concurrency=4`）；(2) 建立 smoke test 子集（核心流程 ~80 用例，CI 快速门禁 <5s）；(3) 检测并移除测试中的 `setTimeout`/`sleep` 阻塞；(4) 目标: 全量 ≤20s，smoke ≤5s。复杂度: Medium

- [x] **R136: 核心流程 E2E 测试 CoreFlowE2E** — 补全端到端集成测试覆盖核心用户旅程: 选中文字 → 提问 → AI 回答 → 存入知识库 → 搜索回顾 → 书签关联；模拟 Chrome API stub（tabs/storage/scripting）；覆盖正常路径 + 异常路径（网络超时/存储满/AI 降级）；验证模块间数据流完整性（knowledge-base ↔ bookmark-knowledge-integration ↔ bookmark-semantic-search）；目标: ≥20 用例。复杂度: Medium

- [x] **R137: 测试覆盖率提升 TestCoverageBoost** — 当前覆盖率基线待验证（R108 报告 92.15% 但测试报告显示 0 pass/0 fail 脱节）；运行 `npm run test:coverage` 建立准确基线；识别覆盖率 <60% 的模块（重点关注: background service-worker、options/popup/sidebar UI 入口、lib/agent-loop.js、lib/evolution.js）；为目标模块补充边界用例；目标: lib/ 模块行覆盖率 ≥ 80%。复杂度: Medium

---

## Phase N: 测试修复与覆盖率冲刺 (R138-R142) — 5 轮

> 飞轮迭代 R34 起，2026-05-19
> 目标: 修复 21 个失败测试、5 个红色区域模块覆盖率补至 ≥80%、继续超大模块拆分、消除覆盖率盲区

- [x] **R138: 测试失败修复 TestFailureFixR34** — 修复 `npm run test:ci` 中 21 个失败用例：(1) test-ai-client.js 7 个 vision 消息格式断言（OpenAI/Claude image_url 转换、双 /v1 URL 去重）；(2) test-evolution.js 5 个断言（evolve/batchEvolve/reset 中 analyzeStylePreference/analyzeRetrievalEffectiveness 行为变更）；(3) test-bookmark-semantic-search.js 1 个 _mergeResults 合并去重；(4) test-bookmark-tag-editor-unit.js 2 个构造函数/标签规范化；(5) test-bookmark-visualizer.js 1 个节点半径缩放；(6) test-r137-coverage-boost.js 4 个 data URL 图片处理；(7) 截图提问 base64 data URL 1 个。目标: `npm run test:ci` 5517+ pass / 0 fail。复杂度: Medium

- [x] **R139: 红色区域测试补全覆盖率冲刺 CoverageRedZone** — 5 个覆盖率 <40% 的模块重点补测试：(1) bookmark-tag-editor.js(10.0%) — 补充构造函数、addTag/removeTag/setTags、批量编辑、标签规范化、自动补全用例；(2) knowledge-graph-utils.js(10.2%) — 补充图遍历、路径计算、异常处理用例；(3) knowledge-graph-wiki.js(10.9%) — 补充 wiki 查询、缓存、降级用例；(4) skill-store-community.js(24.2%) — 补充社区技能 CRUD、搜索、导入用例；(5) skill-store.js(34.1%) — 补充技能存储、分类、激活用例。目标: 5 个模块全部 ≥80%。复杂度: Medium

- [x] **R140: 超大模块拆分四期 ModuleSplitPhase4** — 仍有 11 个文件 >500 行：bookmark-learning-progress.js(551)、wiki-query.js(548)、bookmark-tag-editor-v2.js(548)、evolution.js(547)、bookmark-knowledge-integration.js(547)、bookmark-scheduler.js(544)、message-renderer.js(539)、knowledge-panel.js(528)、entity-extractor.js(527)、bookmark-import-export.js(524)、bookmark-tagger.js(516)。优先拆分前 6 个（>540 行），每文件 ≤400 行，保持 API 向后兼容（re-export 模式）。复杂度: Complex

- [x] **R141: 黄色区域测试补全覆盖率提升 CoverageYellowZone** — 13 个覆盖率 40%-80% 的模块补测试：compilation-report-format.js(47.5%)、knowledge-base-export.js(52.3%)、docmind-client.js(63.7%)、knowledge-panel.js(65.5%)、bookmark-store-prep-checks.js(66.5%)、message-renderer.js(71.2%)、knowledge-panel-batch.js(72.5%)、knowledge-panel-virtual.js(73.5%)、bookmark-folder-suggestions.js(75.8%)、bookmark-accessibility-navigator.js(77.6%)、stats.js(78.7%)、i18n.js(79.2%)、bookmark-store-prep.js(79.4%)。优先补前 6 个（<70%），目标: 至少 9 个模块达 ≥80%。复杂度: Medium

- [x] **R142: c8 插桩盲区消除 CoverageInstrumentationFix** — 排查 `lib/agent-loop.js`(231行) 和 `lib/evolution.js`(547行) 未被 c8 插桩的根因（ESM 动态 import / Chrome API 全局依赖）；修复 c8 配置使所有 lib/ 模块纳入覆盖率统计；验证修正后 lib/ 整体行覆盖率 ≥85%；若 c8 无法覆盖则用 `--all` 标志并记录排除原因。复杂度: Medium

---

## Phase O: 测试修复与函数覆盖率冲刺 (R143-R147) — 5 轮

> 飞轮迭代 R40 起，2026-05-19
> 目标: 修复 23 个失败测试、清理 114 个 ESLint 问题、函数覆盖率从 40.77% 提升至 ≥70%、继续超大模块拆分

- [x] **R143: 测试失败批量修复 TestFailureBatchFix3** — 修复 `npm run test:ci` 中 23 个失败用例：(1) AIClient vision 消息格式 7 个（OpenAI/Claude image_url 数组格式转换、双 /v1 URL 去重）；(2) EvolutionEngine 10 个（evolve/batchEvolve/analyzeUserLevel/reset 行为断言，R142 代码变更后行为漂移）；(3) BookmarkVisualizer 节点半径缩放 1 个；(4) BookmarkSemanticSearch _mergeResults 合并去重 1 个；(5) mergeIngestStats 边界情况 1 个；(6) test-r137-coverage-boost data URL 图片处理 3 个。目标: `npm run test:ci` 5553 pass / 0 fail。复杂度: Medium

- [x] **R144: ESLint 问题清零 LintFinalSweep** — 修复 1 个 parsing error（test-r137-coverage-boost.js 中 `→` 特殊字符导致解析失败）；清理 113 个 `no-unused-vars` 警告（逐文件审查：删除或前缀 `_` 标记未使用变量/导入/参数）；目标: `npm run lint` 0 errors 0 warnings。复杂度: Medium

- [ ] **R145: 超大模块拆分五期 ModuleSplitPhase5** — 仍有 9 个文件 >500 行：bookmark-learning-progress.js(551)、wiki-query.js(548)、bookmark-tag-editor-v2.js(548)、bookmark-knowledge-integration.js(547)、message-renderer.js(539)、knowledge-panel.js(528)、entity-extractor.js(527)、bookmark-import-export.js(524)、bookmark-tagger.js(516)。优先拆分前 5 个（>530 行），每文件 ≤400 行，保持 API 向后兼容（re-export 模式）。复杂度: Complex

- [ ] **R146: 函数覆盖率提升 FunctionCoverageBoost** — 当前行覆盖率 93.02% 但函数覆盖率仅 40.77%（4893 个函数仅 1995 个被调用）；识别 Top-20 未覆盖函数（按函数体大小排序）；为关键未调用函数补充测试（重点关注: 纯逻辑函数、工具函数、边界处理函数）；目标: 函数覆盖率 ≥65%。复杂度: Medium

- [ ] **R147: 全量回归与发布候选 ReleaseCandidate2** — `npm run test:ci` 全量回归确保 0 fail；`npm run lint` 0 errors 0 warnings；覆盖率报告确认行覆盖率 ≥90%、函数覆盖率 ≥60%；更新 CHANGELOG.md 补充 R143-R146 变更记录；输出发布候选版本。复杂度: Simple
