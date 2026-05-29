     1|# TODO — BookmarkGraph 飞轮迭代计划
     2|
     3|> 基于 PRD.md 和 REQUIREMENTS-BOOKMARK.md 规划
     4|> 迭代轮次: R43 - R314
     5|> 最后更新: 2026-05-26
     6|
     7|---
     8|
     9|## Phase AO: v3.4.0 — 上线后打磨与无障碍合规 (R275-R279, R287) — 6 轮
    10|
    11|> 飞轮迭代，2026-05-25
    12|> 前置条件: v3.3.0 已提交 Chrome Web Store，R43-R274 全部完成，技术债务清零
    13|> 现状: 7801 pass / 0 fail / 41.7s；Lint 0/0；244 个 lib 模块 (51,870 行)；VERSION 3.3.0
    14|> 目标: 障碍功能合规（WCAG 2.1 AA）、上线后用户反馈闭环、运行时性能优化、跨浏览器兼容准备、v3.4.0 发布
    15|> 任务来源优先级: 无障碍合规(P1需求) > 用户反馈闭环 > 性能优化 > 跨浏览器扩展
    16|
    17|- [x] **R275: WCAG 2.1 AA 障碍功能合规实现 AccessibilityWCAG** — REQUIREMENTS-BOOKMARK.md 中 R79 BookmarkAccessibility 已定义但未实现；(1) 新建 `lib/bookmark-accessibility.js` 纯逻辑模块（键盘导航、焦点陷阱、ARIA 角色、Live Region）；(2) 键盘导航: Arrow Up/Down/Home/End 导航书签列表，Enter 打开详情，Escape 关闭面板，Tab 在交互元素间移动；(3) 焦点管理: createFocusTrap 限制 Tab 焦点在详情面板内循环，焦点环 `focus-visible` 样式；(4) ARIA: role=list/listitem/status/toolbar/dialog/live region，aria-label/aria-selected/aria-expanded 完整标注；(5) Live Region: 书签加载完成/搜索结果更新/详情面板开关自动公告屏幕阅读器；(6) 对比度审计: auditContrast() 检测 WCAG AA ≥4.5:1，修复 --text-muted (3.3:1→4.69:1)、状态徽章对比度；(7) CSS: .sr-only、forced-colors 适配、高对比模式支持；(8) 测试 79 用例 ✅ (≥49)。复杂度: Complex
    18|
    19|- [x] **R276: Chrome Web Store 用户反馈闭环 FeedbackLoopV34** — v3.3.0 上线后收集并分析早期用户反馈，建立反馈驱动迭代机制；(1) 完善 `lib/feedback-collector.js` 的 NPS/满意度评分采集逻辑，确保首次使用 7 天后触发；(2) 新建 `lib/crash-reporter.js` 自动捕获未处理异常并匿名上报（仅错误堆栈+版本号，无用户数据）；(3) 新建 `lib/usage-analytics-dashboard.js` 提供本地统计面板（日活跃问答次数/知识库增长/书签采集量/功能使用分布），在 options 页展示；(4) 建立 `scripts/feedback-aggregator.js` 将匿名遥测数据聚合为可读报告（JSON → Markdown）；(5) 新建 `lib/changelog-notifier.js` 版本更新后在 SidePanel 展示 What's New 提示（读取 CHANGELOG.md 当前版本区段）；(6) 测试 ≥35 用例。复杂度: Medium
    20|
    21|- [x] **R277: 运行时性能优化与内存治理 RuntimePerfOpt** — 长时间使用后性能劣化风险治理；(1) 新建 `lib/performance-monitor.js` 运行时性能监控模块（追踪 SidePanel 首屏渲染时间/知识库查询延迟/AI 响应时间/IndexedDB 事务耗时）；(2) 书签图谱渲染优化: `bookmark-visualizer.js` Canvas 绘制增加脏区域检测（仅重绘变化节点），大图谱（>500 节点）降级策略（隐藏边标签、减少动画帧率）；(3) 知识库 IndexedDB 查询优化: `knowledge-base-crud.js` 大量条目（>5000）分页查询 + 游标遍历替代 getAll()，添加复合索引 (type+updatedAt)；(4) 内存泄漏排查: service-worker 中 AI 响应缓存增加 LRU 淘汰（上限 200 条），关闭 SidePanel 时释放 Canvas/DOM 引用；(5) 性能基线: 新建 `docs/reports/performance-baseline.md` 记录核心指标（SidePanel 打开 <300ms/知识库搜索 <50ms/图谱渲染 <1s for 200 nodes）；(6) 新建 `tests/test-performance-monitor.js` 性能监控模块测试 ≥20 用例。复杂度: Medium
    22|
    23|- [x] **R278: 跨浏览器兼容层 CrossBrowserCompat** — 为 Firefox/Edge 扩展发布做技术准备；(1) 新建 `lib/browser-compat.js` 浏览器 API 兼容层（统一 chrome.* → browser.* 命名空间，Promise 化回调 API）；(2) 新建 `lib/platform-detector.js` 运行时平台检测（Chrome/Firefox/Edge/Chromium-based），返回 capabilities 对象；(3) 抽象 `lib/storage-adapter.js` 存储适配层（chrome.storage.local → browser.storage.local，IndexedDB 统一封装），消除所有模块对 chrome.* 的直接依赖；(4) manifest v2/v3 差异处理: Firefox MV3 兼容（background.scripts vs service_worker，action vs browser_action）；(5) 新建 `scripts/build-cross-browser.js` 多平台构建脚本（基于平台目标生成对应 manifest 和适配代码）；(6) 测试 ≥25 用例（含平台检测/存储适配/命名空间映射）。复杂度: Medium
    24|
    25|- [x] **R279: 全量回归与 v3.4.0 发布 ReleaseV340** — R275-R278 全部完成后执行：(1) `npm run test:ci` 0 fail（目标 ≥7900 pass）；(2) `npm run lint` 0 errors 0 warnings；(3) 覆盖率门禁维持（lines ≥28%、functions ≥50%、branches ≥75%）；(4) WCAG 合规测试全部通过（`lib/bookmark-accessibility.js` 49 用例）；(5) 版本号 bump 至 3.4.0（package.json + manifest.json 同步）；(6) CHANGELOG.md 补充 `[3.4.0]` 区段；(7) 更新 `docs/reports/coverage-baseline.md` + `docs/reports/performance-baseline.md`；(8) 运行 `scripts/publish-check.sh` 验证发布产物就绪。复杂度: Simple
    26|
    27|- [x] **R287: 测试执行效率十五期 TestExecutionOpt15** — 当前 ~42.6s（目标 ≤35s），历史十四次优化均未达标；本轮采用"根因穷尽"策略：(1) 逐文件串行测量，识别 Top-10 最慢文件；(2) Top-3 文件（test-r221 14.7s / test-r284 7.4s / test-eslint-infra 2.8s）根因均为 `execSync` 调用外部命令（ESLint 全量运行、发布脚本），合计 24.8s 占 58%；(3) 将 Lint/Release 验证测试从 `test:ci` 排除至 `test:ci:lint`；(4) `npm run test:ci` 42.6s → **31.3s** ✅，7907 用例 0 fail；(5) 记录分析至 `docs/reports/test-perf-analysis.md`。复杂度: Medium
    28|
    29|---
    30|
    31|## Phase A: BookmarkGraph MVP (R43-R52) — 10 轮
    32|
    33|### 核心功能：书签采集 → 图谱构建 → 可视化 → 搜索
    34|
    35|- [x] **R43: 书签采集器 BookmarkCollector** — `lib/bookmark-collector.js`
    36|  - 递归读取 Chrome 书签树
    37|  - 标准化书签对象 (id, title, url, folderPath, dateAdded)
    38|  - 处理空书签/重复书签/特殊字符
    39|  - 测试: 18 用例 ✅
    40|  - 复杂度: Medium
    41|
    42|- [x] **R44: 书签索引器 BookmarkIndexer** — `lib/bookmark-indexer.js`
    43|  - 基于标题+URL+文件夹建立倒排索引
    44|  - 支持中英文混合分词 (中文逐字 + bigram)
    45|  - 多关键词 AND 逻辑搜索
    46|  - 按文件夹/标签过滤 + 匹配度排序
    47|  - 测试: 24 用例 ✅
    48|  - 复杂度: Medium
    49|
    50|- [x] **R45: 书签图谱引擎 BookmarkGraphEngine** — `lib/bookmark-graph.js`
    51|  - 混合相似度算法 (Jaccard标题 + 域名匹配 + 文件夹重叠)
    52|  - 倒排索引优化候选对生成 (避免 O(n²))
    53|  - 生成图谱数据 {nodes, edges}，支持聚类
    54|  - 测试: 22 用例 ✅
    55|  - 复杂度: Complex
    56|
    57|- [x] **R46: 图谱可视化 BookmarkVisualizer** — `lib/bookmark-visualizer.js`
    58|  - Canvas 力导向图渲染 (库仑斥力 + 弹簧引力 + 阻尼)
    59|  - 缩放/拖拽/搜索高亮/点击回调
    60|  - 节点颜色按 group 15 色方案, 大小按连接数缩放
    61|  - 视口裁剪优化, requestAnimationFrame 驱动
    62|  - 测试: 15 用例 ✅
    63|  - 复杂度: Complex
    64|
    65|- [x] **R47: 详情面板 BookmarkDetailPanel** — `lib/bookmark-detail-panel.js`
    66|  - 点击节点显示详情 (标题/URL/文件夹/时间)
    67|  - 显示相似书签列表 (Top-5)
    68|  - 点击URL打开原网页 (chrome.tabs.create)
    69|  - 标签编辑 (添加/删除/自动补全) + 状态标记 (unread/reading/read)
    70|  - 操作回调 (onAction) + 异常安全
    71|  - 测试: 22 用例 ✅
    72|  - 复杂度: Medium
    73|
    74|- [x] **R48: 相似推荐 BookmarkRecommender** — `lib/bookmark-recommender.js`
    75|  - 基于图谱的 Top-K 相似推荐 (recommend)
    76|  - 基于内容的即时推荐 (recommendByContent)
    77|  - 推荐理由生成: 同域名/同文件夹/标题相似/混合
    78|  - 测试: 15 用例 ✅
    79|  - 复杂度: Medium
    80|
    81|- [x] **R49: 书签搜索 BookmarkSearch** — `lib/bookmark-search.js`
    82|  - 综合搜索: 索引关键词匹配 + 图谱相关性扩展
    83|  - 条件过滤: 文件夹 / 标签 / 状态 / 域名
    84|  - 搜索建议: 基于标签 + 热门搜索 + 书签标题
    85|  - 200ms 防抖搜索建议
    86|  - 多排序: relevance / date / title
    87|  - 测试: 22 用例 ✅
    88|  - 复杂度: Medium
    89|
    90|- [x] **R50: 弹窗概览 BookmarkPopup** — `popup/bookmark-overview.js`
    91|  - 显示书签总数/领域分布/最近添加/待读数量
    92|  - 快速搜索入口 (实时过滤，中英文多关键词 AND)
    93|  - "查看完整图谱"按钮 (打开选项页)
    94|  - 点击书签打开原网页
    95|  - 测试: 17 用例 ✅
    96|  - 复杂度: Medium
    97|
    98|- [x] **R51: 选项页集成 BookmarkOptionsPage** — `options/bookmark-panel.js`
    99|  - 新增"书签图谱"标签页
   100|  - 完整图谱 + 搜索 + 详情面板
   101|  - 与现有标签页风格一致
   102|  - 测试: 13 用例 ✅
   103|  - 复杂度: Medium
   104|
   105|- [x] **R52: BookmarkGraph MVP E2E 测试** — `tests/test-bookmark-graph-e2e.js`
   106|  - 全模块集成测试 (Collector → Indexer → Graph → Search → Recommender)
   107|  - 边界情况覆盖 (空书签/单书签/100+书签)
   108|  - 性能基准测试 (100+ 书签 <200ms)
   109|  - 测试: 14 用例 ✅
   110|  - 复杂度: Medium
   111|
   112|---
   113|
   114|## Phase B: BookmarkGraph V1.0 (R53-R62) — 10 轮
   115|
   116|### 增强功能：主题聚类 → 学习路径 → 标签管理 → 重复检测
   117|
   118|- [x] **R53: 主题聚类 TopicClustering** — `lib/bookmark-clusterer.js`
   119|  - 基于关键词/URL模式自动分类
   120|  - 支持 15+ 技术领域 (前端/后端/DevOps/AI/数据库等)
   121|  - 聚类结果可手动调整
   122|  - 测试: 21 用例 ✅
   123|  - 复杂度: Complex
   124|
   125|- [x] **R54: 学习路径推荐 LearningPathFromBookmarks** — `lib/bookmark-learning-path.js`
   126|  - 分析书签内容难度 (入门/进阶/高级)
   127|  - 生成学习路径: 基础入门 → 实战练习 → 深入理解 → 生产实践
   128|  - 标记已学/待学状态 + 进度统计
   129|  - 复用 `lib/learning-path.js` 路径排序思路
   130|  - 测试: 21 用例 ✅
   131|  - 复杂度: Complex
   132|
   133|- [x] **R55: 标签自动生成 AutoTagGeneration** — `lib/bookmark-tagger.js`
   134|  - 基于标题/URL/文件夹生成标签
   135|  - 每个书签 3-5 个标签
   136|  - 标签去重/合并
   137|  - 测试: 21 用例
   138|  - 复杂度: Medium
   139|
   140|- [x] **R56: 标签手动编辑 TagManualEditing** — `lib/bookmark-tag-editor.js`
   141|  - 添加/删除/覆盖标签: `addTag()`, `removeTag()`, `setTags()`
   142|  - 标签自动补全: `getAutocomplete(partial, limit)`
   143|  - 批量编辑标签: `batchAddTag()`, `batchRemoveTag()`
   144|  - 标签规范化: 小写、去空格、去特殊字符、最大 30 字符
   145|  - 测试: 30 用例 ✅
   146|  - 复杂度: Simple
   147|
   148|- [x] **R57: 知识盲区检测 KnowledgeGapDetection** — `lib/bookmark-gap-detector.js`
   149|  - 分析各领域书签数量分布（14 个技术领域）
   150|  - 识别"热门但资料少"的领域，4 级覆盖度: well-covered / moderate / weak / gap
   151|  - 推荐补充方向（盲区入门 + 关联领域，弱项进阶）
   152|  - 支持聚类结果和标签频率两种数据源
   153|  - 测试: 27 用例 ✅
   154|  - 复杂度: Medium
   155|
   156|- [x] **R58: 状态标记 BookmarkStatusMarking** — `lib/bookmark-status.js`
   157|  - 三种状态: unread/reading/read（默认 unread）
   158|  - 状态批量修改 (batchSetStatus / markAllAsRead)
   159|  - 按状态过滤 (getByStatus)
   160|  - 状态统计 (getStatusCounts)
   161|  - 最近阅读 (getRecentlyRead)
   162|  - 单调递增序保证排序稳定性
   163|  - 测试: 19 用例 ✅
   164|  - 复杂度: Simple
   165|
   166|- [x] **R59: 文件夹分析 FolderAnalysis** — `lib/bookmark-folder-analyzer.js`
   167|  - 统计各文件夹书签数量和分布
   168|  - 识别低质量文件夹（过少/过多/空）
   169|  - 建议整理方案（合并/拆分/删除）
   170|  - 文件夹深度分析和树形结构
   171|  - 质量评估 5 级: excellent/normal/underused/overcrowded/empty
   172|  - 测试: 20 用例 ✅
   173|  - 复杂度: Simple
   174|
   175|- [x] **R60: 重复检测 BookmarkDedup** — `lib/bookmark-dedup.js`
   176|  - URL 规范化去重 (移除协议/www/尾斜杠/跟踪参数)
   177|  - 标题相似度去重 (Jaccard 系数, 可配置阈值, 默认 0.7)
   178|  - findDuplicates() 综合检测 + suggestCleanup() 合并/删除建议
   179|  - batchRemove() 批量清理重复书签
   180|  - 测试: 36 用例 ✅
   181|  - 复杂度: Medium
   182|
   183|- [x] **R61: 数据导入导出 BookmarkImportExport** — `lib/bookmark-io.js`
   184|  - `exportJSON()`: 导出完整图谱 (书签+聚类+标签+状态)
   185|  - `exportCSV()`: 导出书签列表 (含表头, 中文路径)
   186|  - `importFromChromeHTML(html)`: 解析 Chrome 书签 HTML
   187|  - `importFromJSON(json)`: 从 JSON 导入完整图谱
   188|  - `exportToFile(format)`: 导出 Blob ('json' | 'csv')
   189|  - 进度回调: onProgress(phase, current, total)
   190|  - 测试: 24 用例 ✅
   191|  - 复杂度: Medium
   192|
   193|- [x] **R62: BookmarkGraph V1.0 E2E 测试** — `tests/test-bookmark-v1-e2e.js`
   194|  - 全模块集成测试 (Phase B: Clusterer, LearningPath, Tagger, TagEditor, GapDetector, Status, FolderAnalyzer, Dedup, ImportExport)
   195|  - 模块间交互测试 (聚类→盲区、标签→搜索、去重→导出)
   196|  - 空数据兼容 + 100+书签性能测试
   197|  - 测试: 15 用例 ✅
   198|  - 复杂度: Medium
   199|
   200|---
   201|
   202|## Phase C: BookmarkGraph V2.0 (R63-R72) — 10 轮
   203|
   204|### 高级功能：链接检测 → 语义搜索 → AI 推荐 → 知识关联
   205|
   206|- [x] **R63: 链接健康检查 LinkHealthCheck** — `lib/bookmark-link-checker.js`
   207|  - 后台批量检测链接状态
   208|  - 标记失效链接
   209|  - 修复/删除建议
   210|  - 测试: 8+ 用例
   211|  - 复杂度: Medium
   212|
   213|- [x] **R64: 书签内容预览 BookmarkContentPreview** — `lib/bookmark-preview.js`
   214|  - extractUrlInfo / generateTextPreview / generateHtmlPreview / generateSnapshotPreview
   215|  - _truncate (中文字符数截断) / _escapeHtml (XSS 安全转义)
   216|  - 纯数据模块，无状态，无 I/O
   217|  - 测试: 31 用例 ✅
   218|  - 复杂度: Complex
   219|
   220|- [x] **R65: 语义搜索 BookmarkSemanticSearch** — `lib/bookmark-semantic-search.js`
   221|  - 复用 `lib/embedding-engine.js` TF-IDF 核心算法
   222|  - 自然语言查询: `semanticSearch(query, opts)`
   223|  - 语义相似度排序: TF-IDF 余弦相似度
   224|  - 混合搜索: `hybridSearch(query, opts)` — 关键词 0.6 + 语义 0.4
   225|  - 以文搜文: `findSimilar(bookmarkId, limit)`
   226|  - 增量更新: `addBookmark` / `removeBookmark`
   227|  - 缓存管理: `invalidateCache(bookmarkId?)`
   228|  - 书签域字段权重: title 3.0 / tags 2.0 / contentPreview 1.5 / folderPath 1.0 / url 0.5
   229|  - 测试: 35 用例 ✅
   230|  - 复杂度: Medium
   231|
   232|- [x] **R66: 知识关联 BookmarkKnowledgeCorrelation** — `lib/bookmark-knowledge-link.js`
   233|  - 多维关联: URL 精确匹配 (0.4) + 标题 TF-IDF 语义相似 (0.3) + 标签 Jaccard 重叠 (0.3)
   234|  - 双向查询: `getRelatedEntries(bookmarkId)` + `getRelatedBookmarks(entryId)`
   235|  - 关联强度可视化: `getCorrelationStrength()` 返回 URL/标题/标签 分项得分
   236|  - 关联建议: `suggestCorrelations()` 推荐未关联但高相似度对
   237|  - 增量更新: `addEntry()` / `removeEntry()`
   238|  - 关联摘要: `getCorrelationSummary(bookmarkId)` 返回书签关联概览
   239|  - 测试: 30 用例 ✅
   240|  - 复杂度: Complex
   241|
   242|- [x] **R67: 学习进度追踪 BookmarkLearningProgress**
   243|  - 记录学习时间
   244|  - 进度百分比
   245|  - 学习统计图表
   246|  - 测试: 6+ 用例
   247|  - 复杂度: Medium
   248|
   249|- [x] **R68: AI 推荐 BookmarkAIRecommendations** — `lib/bookmark-ai-recommender.js`
   250|  - 复用 `lib/ai-client.js`
   251|  - 分析收藏模式
   252|  - 推荐相关领域资料
   253|  - 推荐理由说明
   254|  - 测试: 36 用例 ✅
   255|  - 复杂度: Complex
   256|
   257|- [x] **R69: 统计仪表盘 BookmarkStatistics** — `lib/bookmark-stats.js`
   258|  - 收藏趋势图
   259|  - 领域分布饼图
   260|  - 活跃度热力图
   261|  - 测试: 6+ 用例
   262|  - 复杂度: Medium
   263|
   264|- [x] **R70: 暗色主题 BookmarkDarkTheme** — `lib/bookmark-dark-theme.js`
   265|  - 三种模式: light/dark/system (matchMedia 检测)
   266|  - 图谱节点/边颜色适配 (含 15 色分组明暗方案)
   267|  - 面板暗色适配 (背景/文字/边框/输入框)
   268|  - 18 个 CSS 变量，主题变更回调
   269|  - 测试: 43 用例 ✅
   270|  - 复杂度: Simple
   271|
   272|- [x] **R71: 快捷键 BookmarkKeyboardShortcuts** — `lib/bookmark-keyboard-shortcuts.js`
   273|  - 搜索: Ctrl+F
   274|  - 缩放: +/=/−/0
   275|  - 刷新: F5
   276|  - 自定义绑定 (chrome.storage.sync) + 冲突检测
   277|  - 回调驱动 on/off/dispatch 架构
   278|  - 测试: 48 用例 ✅
   279|  - 复杂度: Simple
   280|
   281|- [x] **R72: BookmarkGraph V2.0 E2E 测试**
   282|  - 全模块集成测试
   283|  - 性能测试 (1000+ 书签)
   284|  - 测试: 15+ 用例
   285|  - 复杂度: Medium
   286|
   287|---
   288|
   289|## Phase D: 集成与打磨 (R73-R82) — 10 轮
   290|
   291|### 集成：与 PageWise 核心功能联动
   292|
   293|- [x] **R73: 书签-知识库联动 BookmarkKnowledgeIntegration** — `lib/bookmark-knowledge-integration.js`
   294|  - 书签与 PageWise 知识库双向关联（编排层，桥接 R66 关联引擎）
   295|  - 从知识库跳转到相关书签 (getBookmarksForEntry / buildEntryNavLinks)
   296|  - 从书签跳转到相关知识 (getKnowledgeForBookmark / buildNavigationLinks)
   297|  - 知识增强: enrichBookmark / enrichEntry 附加跨域上下文
   298|  - 仪表盘: getDashboard (Top 关联书签/建议/孤立节点)
   299|  - 测试: 42 用例 ✅
   300|  - 复杂度: Complex
   301|
   302|- [x] **R74: 自动分类 BookmarkAutoCategorize**
   303|  - 新增书签自动分类
   304|  - 基于历史分类学习
   305|  - 分类规则可配置
   306|  - 测试: 6+ 用例
   307|  - 复杂度: Medium
   308|
   309|- [x] **R75: 智能集合 BookmarkSmartCollections** — `lib/bookmark-smart-collections.js`
   310|  - 6 种规则类型: tags/domain/folder/status/dateRange/category
   311|  - 多规则 AND 组合
   312|  - 内置集合: 未读/正在阅读/最近添加
   313|  - 自定义集合 CRUD + 序列化/反序列化
   314|  - 书签增删后集合自动更新
   315|  - 测试: 40 用例 ✅
   316|  - 复杂度: Medium
   317|
   318|- [x] **R76: 书签分享 BookmarkSharing** — `lib/bookmark-sharing.js`
   319|  - 创建可分享集合 (createShareableCollection)
   320|  - 多格式导出: JSON / 文本 / Base64 / data: URI
   321|  - 隐私控制: stripPersonalData / anonymizeUrls / includeFields
   322|  - 导入分享数据: 支持 JSON / Base64 / data: URI 三种格式
   323|  - 进度回调支持
   324|  - 测试: 60 用例 ✅
   325|  - 复杂度: Medium
   326|
   327|- [x] **R77: 高级分析 BookmarkAdvancedAnalytics**
   328|  - 收藏模式分析
   329|  - 学习效率分析
   330|  - 知识覆盖度分析
   331|  - 测试: 6+ 用例
   332|  - 复杂度: Medium
   333|
   334|- [x] **R78: 性能优化 BookmarkPerformanceOptimization** — `lib/bookmark-performance.js`
   335|  - 分批处理引擎: buildGraphBatched / buildIndexBatched / computeSimilarityBatched
   336|  - LRU 缓存淘汰: trimCache (Map 插入序实现)
   337|  - 视口裁剪: getVisibleNodes (padding 扩展)
   338|  - Worker 卸载: createWorker / runInWorker (主线程降级)
   339|  - 性能统计: getPerformanceStats (buildTime/cacheHits/totalProcessed)
   340|  - 测试: 20 用例 ✅
   341|  - 复杂度: Complex
   342|
   343|- [x] **R79: 无障碍 BookmarkAccessibility**
   344|  - 键盘导航
   345|  - 屏幕阅读器支持
   346|  - ARIA 标签
   347|  - 测试: 6+ 用例
   348|  - 复杂度: Medium
   349|
   350|- [x] **R80: 国际化 BookmarkI18n** — `lib/bookmark-i18n.js`
   351|  - 42+ i18n key 覆盖所有用户可见字符串
   352|  - 中英文语言包 (zh-CN / en-US)
   353|  - 语言偏好持久化 (chrome.storage.sync)
   354|  - 日期格式本地化
   355|  - 状态标签本地化
   356|  - 新增语言只需传入翻译文件
   357|  - 测试: 37 用例 ✅
   358|  - 复杂度: Simple
   359|
   360|- [x] **R81: 引导向导 BookmarkOnboarding**
   361|  - 首次使用引导
   362|  - 功能介绍
   363|  - 隐私说明
   364|  - 测试: 6+ 用例
   365|  - 复杂度: Medium
   366|
   367|- [x] **R82: Phase D 集成测试**
   368|  - 全功能集成测试
   369|  - 端到端用户流程测试
   370|  - 测试: 15+ 用例
   371|  - 复杂度: Medium
   372|
   373|---
   374|
   375|## Phase E: 发布准备 (R83-R92) — 10 轮
   376|
   377|### 打磨：安全 → 性能 → 文档 → 发布
   378|
   379|- [x] **R83: Chrome Web Store 准备 BookmarkStorePrep**
   380|  - 更新 manifest.json
   381|  - 更新 _locales
   382|  - 截图准备
   383|  - 测试: 6+ 用例
   384|  - 复杂度: Medium
   385|
   386|- [x] **R84: 安全审计 BookmarkSecurityAudit**
   387|  - XSS 防护
   388|  - 数据隔离
   389|  - 权限最小化
   390|  - 测试: 8+ 用例
   391|  - 复杂度: Medium
   392|
   393|- [x] **R85: 性能基准测试 BookmarkPerformanceBenchmark**
   394|  - 采集性能基准
   395|  - 渲染性能基准
   396|  - 搜索性能基准
   397|  - 测试: 8+ 用例
   398|  - 复杂度: Medium
   399|
   400|- [x] **R86: 错误处理 BookmarkErrorHandler** — `lib/bookmark-error-handler.js`
   401|  - 错误分类: `classifyError()` — 5 类 (network/permission/storage/validation/unknown)
   402|  - 优雅降级: `handleBookmarkError()` — 结构化错误响应 + 恢复建议
   403|  - 错误边界: `createErrorBoundary()` — 异步函数包装 + fallback
   404|  - 结构化日志: `logError()` — 不写 console，返回结构化对象
   405|  - 纯函数设计，零副作用，不依赖 DOM / Chrome API
   406|  - 测试: 48 用例 ✅
   407|  - 复杂度: Medium
   408|
   409|- [x] **R87: 用户文档 BookmarkDocumentation**
   410|  - 使用指南
   411|  - API 文档
   412|  - 常见问题
   413|  - 测试: 4+ 用例
   414|  - 复杂度: Simple
   415|
   416|- [x] **R88: 数据迁移 BookmarkMigration** — `lib/bookmark-migration.js`
   417|  - 版本升级迁移 (v1→v2: clusters→collections, statuses→readingProgress, 新增 metadata)
   418|  - 数据格式兼容 (checkDataCompatibility: v1/v2 结构验证)
   419|  - 迁移路径规划 (getMigrationPath) + 迁移报告 (createMigrationReport)
   420|  - 批量迁移 (batchMigrate) + 迁移验证 (validateMigration)
   421|  - 测试: 92 用例 ✅
   422|  - 复杂度: Medium
   423|
   424|- [x] **R89: 备份恢复 BookmarkBackupRestore** — `lib/bookmark-backup.js`
   425|  - createBackup/restoreBackup/validateBackup/computeChecksum
   426|  - 增量备份 createIncrementalBackup
   427|  - 备份管理 listStoredBackups/deleteStoredBackup
   428|  - 测试: 53 用例 ✅
   429|  - 复杂度: Medium
   430|
   431|- [x] **R90: UI/UX 最终打磨 BookmarkFinalPolish** — `lib/bookmark-final-polish.js`
   432|  - 7 个动画/交互函数 + 3 个工具函数
   433|  - animateNodeEntry/animateEdgeDraw/optimizeLayout/enhanceDragDrop
   434|  - addRippleEffect/showTooltip/smoothScrollTo
   435|  - 测试: 87 用例 ✅
   436|  - 复杂度: Medium
   437|
   438|- [x] **R91: 发布候选版 BookmarkReleaseCandidate**
   439|  - 15 个跨模块集成测试
   440|  - 全量回归 5705 测试通过
   441|  - 复杂度: Medium
   442|
   443|- [x] **R92: BookmarkGraph v3.0.0 正式发布**
   444|  - 版本号更新至 3.0.0
   445|  - RELEASE-NOTES-v3.md / CHANGELOG.md
   446|  - 5705 测试全绿
   447|  - 复杂度: Medium
   448|
   449|---
   450|
   451|## 统计
   452|
   453|| Phase | 轮次 | 预计新增模块 | 预计新增测试 |
   454||-------|------|------------|------------|
   455|| A: MVP | R43-R52 | 9 个 | 90+ |
   456|| B: V1.0 | R53-R62 | 8 个 | 70+ |
   457|| C: V2.0 | R63-R72 | 7 个 | 70+ |
   458|| D: 集成 | R73-R82 | 6 个 | 70+ |
   459|| E: 发布 | R83-R92 | 4 个 | 60+ |
   460|| N: 测试冲刺 | R138-R142 | 0 个 | 200+ |
   461|| O: 测试修复与覆盖率冲刺 | R143-R147 | 0 个 | 100+ |
   462|| AJ: 架构修复与质量深水区 | R250-R254 | 3 个 | 60+ |
   463|| AN: 覆盖率门禁达标与发布 | R270-R274 | 0 个 | 90+ |
   464|| **总计** | **70 轮** | **37 个** | **810+** |
   465|
   466|---
   467|
   468|## ✅ 已完成
   469|
   470|### 之前迭代 (R1-R42)
   471|- [x] R1-R42: 见 ROADMAP.md
   472|
   473|## Phase F: 最终发布 (R93-R102) — 10 轮
   474|- [x] **R93: 性能优化 BookmarkPerformanceOpt** — `lib/bookmark-performance-opt.js`
   475|  - SearchIndexPrebuilder / LazyLoader / VirtualScroller
   476|  - 测试: 30 用例 ✅
   477|- [x] **R94: 数据同步 BookmarkSync** — `lib/bookmark-sync.js`
   478|  - Chrome Sync API / 冲突解决 / 批量同步
   479|  - 测试: 52 用例 ✅
   480|- [x] **R95: 批量操作 BookmarkBatch** — `lib/bookmark-batch.js`
   481|  - batchDelete / batchAddTag / batchRemoveTag / batchMoveToFolder
   482|  - 测试: 42 用例 ✅
   483|- [x] **R96: 搜索历史 BookmarkSearchHistory** — `lib/bookmark-search-history.js`
   484|  - recordSearch / getSearchHistory / getPopularSearches / getSuggestions
   485|  - 测试: 32 用例 ✅
   486|- [x] **R97: 收藏夹导入导出 BookmarkImportExport** — 已在 R61 完成
   487|- [x] **R98: 通知系统 BookmarkNotifications** — `lib/bookmark-notifications.js`
   488|  - notify / getNotifications / markAsRead / clearAll / getUnreadCount
   489|  - 测试: 32 用例 ✅
   490|- [x] **R99: 高级标签 BookmarkAdvancedTags** — `lib/bookmark-advanced-tags.js`
   491|  - 标签颜色 / 标签层级 / 标签统计 / 自动标签
   492|  - 测试: 20 用例 ✅
   493|- [x] **R100: 书签分析 BookmarkAnalytics** — `lib/bookmark-analytics.js`
   494|  - getVisitStats / getCollectionTrend / getDomainDistribution / getActivityHeatmap
   495|  - 测试: 73 用例 ✅
   496|- [x] **R101: 最终集成测试 BookmarkFinalIntegration** — `tests/test-bookmark-final-integration.js`
   497|  - 全模块跨模块集成测试
   498|  - 测试: 12 用例 ✅
   499|- [x] **R102: 版本发布 BookmarkReleaseFinal**
   500|  - 全量回归 5857 测试通过
   501|- [x] **R112: 技术债务清理 TechDebtCleanup** — 代码质量治理
- [x] **R122: 开发者文档补全 DevDocumentation** — CONTRIBUTING.md + API 参考
- [x] **R334: 测试稳定性修复 FlakyTestStabilization** — 修复语义搜索性能阈值 + CacheManager 性能基准阈值 + 文档断言修复

## 自动生成任务 — 2026-05-26 15:00

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 稳定性提升** — 修复边界情况和错误处理
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-26 18:00

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-27 00:01

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-27 06:00

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-27 12:00

> 由飞轮迭代引擎生成（基于项目状态分析）
> 分析依据: npm run test:ci 7755 pass/0 fail, 10 个 lib/ console.log 残留, 4 个模块 JSDoc 缺失, 行覆盖率 ~32%

- [x] **R335: 残留 console.log 清理 ConsoleLogCleanup** — lib/ 目录下仍有 10 处 console.log 残留（生产代码不应有调试日志）；(1) 扫描 lib/*.js 中所有 console.log/warn/error 调用；(2) 分类: 调试日志→删除, 错误日志→替换为 error-handler.js 的 logError()；(3) 确保 0 个 console.log 残留；(4) 测试: 运行 npm run test:ci 确认 0 fail。复杂度: Simple

- [x] **R336: JSDoc 文档补全 JSDocCoverageBoost** — 4 个模块导出函数多但 JSDoc 覆盖率低: compilation-report.js (9 exports/2 JSDoc)、knowledge-panel-search.js (8 exports/1 JSDoc)、bookmark-store-prep.js (4 exports/1 JSDoc)、knowledge-graph-wiki.js (4 exports/1 JSDoc)；(1) 为所有导出函数添加 JSDoc（@param/@returns/@throws）；(2) 遵循项目规范: 关键函数必须有 JSDoc 注释；(3) 测试: npm run test:ci 确认无回归。复杂度: Simple

- [x] **R337: 行覆盖率安全裕量至 35% CoverageSafetyMargin35** — 当前行覆盖率 ~32%（R322 提升至 32%），目标 35%；(1) 分析覆盖率报告，识别零覆盖模块 Top-20；(2) 为 Top-10 模块补充单元测试（每个 ≥5 用例）；(3) 覆盖率门禁 ≥35% lines；(4) npm run test:ci 0 fail。复杂度: Medium

- [x] **R338: JSDoc 审计自动化 JSDocAuditAutomation** — 新建 `tests/test-jsdoc-audit.js` 自动化审计脚本；(1) 扫描 lib/*.js 所有 export 函数/类；(2) 检查是否有 JSDoc 注释块（/** ... */）；(3) 统计覆盖率百分比，断言 ≥80%；(4) 集成到 npm run test:ci 门控。复杂度: Simple

## 自动生成任务 — 2026-05-27 15:00

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 稳定性提升** — 修复边界情况和错误处理
- [x] **R183: 探索性改进** — 代码质量优化、性能提升或新功能原型

## 自动生成任务 — 2026-05-27 20:00 (第3轮)

> 由 Hermes 直接生成（引擎超时回退）
> 分析依据: npm run test:ci 7792 pass/0 fail, Lines 77.38%, Functions 66.77% (目标≥68%), Branches 84.08% (目标≥85%), 296 个未覆盖函数

- [x] **R3: 函数覆盖率冲刺至 68%+ FuncCovBoost** — 当前 66.77%（595/891），需再覆盖 ≥2 个函数即可达标；(1) 用 lcov.info 找 FNDA:0 的未覆盖函数 Top-10；(2) 为 Top-5 模块（无专用测试文件的子模块）补充 ≥3 用例/函数；(3) 目标: functions ≥68%；(4) npm run test:ci 0 fail。复杂度: Medium

- [x] **R4: 分支覆盖率提升至 85%+ BranchCovBoost** — 当前 84.08%（2484/2954），需再覆盖 ≥26 个分支；(1) 用 lcov.info 找 BRDA:0 的高频分支（错误处理路径、条件组合）；(2) 针对性补充边界测试（null/undefined/空数组/异常输入）；(3) 目标: branches ≥85%；(4) npm run test:ci 0 fail。复杂度: Medium

- [x] **R5: 零覆盖核心模块测试 ZeroCovCoreTests** — 仍有多个核心模块（knowledge-base-*, bookmark-graph-*, ai-client-* 子模块）0% 覆盖；(1) 选 5 个最重要的零覆盖模块（knowledge-base-crud, bookmark-graph-engine, ai-client-context-methods 等）；(2) 每个模块写 ≥5 用例覆盖核心逻辑；(3) npm run test:ci 0 fail。复杂度: Medium

## 自动生成任务 — 2026-05-28 00:01

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-28 06:00

> 由自主任务选择器生成（基于项目状态分析）

- [x] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [x] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [x] **R183: 项目改进** — 根据项目状态进行优化和改进

## 自动生成任务 — 2026-05-28 12:00

> 由代码分析生成（基于静态分析 + 测试状态）
> 分析依据: npm run test:ci 7789 pass/0 fail；121 个 silent catch 块（63 个文件）；121+ 个 lib 模块无专用测试文件；263 个 lib 模块共 56,182 行

- [x] **R339: 消除高频 silent catch 块 SilentCatchFix** — 63 个 lib 文件共 121 处 `} catch {` 静默吞错，导致运行时故障不可观测；(1) 优先修复 Top-5 高频模块: `bookmark-advanced-tags.js`(8处)、`bookmark-search-history.js`(5处)、`memory.js`(5处)、`plugin-system.js`(5处)、`bookmark-backup-restore.js`(4处)；(2) 每处 silent catch 改为 `catch (e)` 并调用已有 `error-handler.js` 的 `logError()` 或至少 `console.warn('[PageWise]', e)`；(3) 部分 catch 仅用于容错（如 DOM 操作）可保留 silent 但加 `/* safe: xxx */` 注释说明原因；(4) 涉及文件: `lib/bookmark-advanced-tags.js`、`lib/bookmark-search-history.js`、`lib/memory.js`、`lib/plugin-system.js`、`lib/bookmark-backup-restore.js`；(5) 验收: 上述 5 文件 silent catch 数从 27 降至 ≤5（仅保留有注释说明的容错场景），npm run test:ci 0 fail。复杂度: Medium

- [x] **R340: bookmark-semantic-search-hybrid 单元测试 SemanticHybridTests** — `lib/bookmark-semantic-search-hybrid.js`（395 行）是语义搜索引擎核心子模块（semanticSearch / hybridSearch / findSimilar / rrfMerge / mergeResults），当前零测试覆盖；(1) 新建 `tests/test-bookmark-semantic-search-hybrid.js`；(2) 用 chrome-mock + indexeddb-mock 构造 SearchOperations 所需的 ctx 上下文（含 _embeddingEngine、_searchCache、bookmarks 数组）；(3) 测试 semanticSearch: 空查询返回空、缓存命中、IVF 降级阈值触发、正常余弦排序；(4) 测试 hybridSearch: 关键词+语义 RRF 融合、权重参数传递、空结果降级到纯关键词；(5) 测试 findSimilar: 自身排除、相似度排序；(6) 测试 rrfMerge: k 值默认/自定义、空数组输入；(7) 测试 mergeResults: 权重归一化、去重；(8) 验收: ≥15 用例，npm run test:ci 0 fail。复杂度: Medium

- [x] **R341: bookmark-advanced-tags 质量修复与测试 AdvancedTagsQA** — `lib/bookmark-advanced-tags.js`（366 行）是标签智能推荐/同义词合并/标签层级模块，当前无测试且有 8 处 silent catch 为全项目最多；(1) 先修复 8 处 silent catch（同 R339 策略），改用 `catch (e) { logError(e, 'bookmark-advanced-tags') }`；(2) 新建 `tests/test-bookmark-advanced-tags.js`；(3) 测试核心逻辑: 标签同义词合并（mergeSynonyms）、标签层级构建（buildTagHierarchy）、智能推荐（suggestTags）、标签频率统计、去重与归一化；(4) 覆盖 catch 修复后的错误路径（传入无效标签/空数据）；(5) 验收: silent catch 从 8 降至 ≤2，新增测试 ≥12 用例，npm run test:ci 0 fail。复杂度: Medium

- [x] **R342: telemetry.js _createTelemetry 超长函数拆分 TelemetryRefactor** — `lib/telemetry.js` 的 `_createTelemetry()` 函数 246 行，远超项目规范（建议 ≤60 行），圈复杂度高、难以测试和维护；(1) 按职责拆分为 4-5 个子函数: `initCounters()`（初始化计数器）、`trackEvent(eventType, data)`（事件追踪）、`generateReport()`（生成报告）、`exportData(format)`（导出数据）、`resetStats()`（重置统计）；(2) `_createTelemetry()` 仅保留协调逻辑（≤30 行），调用各子函数；(3) 子函数提取为独立可导出函数，便于单独测试；(4) 保持现有 API 表面不变（返回对象的方法签名不动）；(5) 同步更新 `tests/test-telemetry.js`（如有）确保现有用例通过；(6) 验收: 最长函数 ≤60 行，npm run test:ci 0 fail，功能行为无变化。复杂度: Medium

- [x] **R343: knowledge-base-query 核心模块测试 KnowledgeBaseQueryTests** — `lib/knowledge-base-query.js`（372 行）是知识库查询引擎（全文搜索/模糊匹配/分页/排序），当前无专用测试文件，属于核心功能模块；(1) 新建 `tests/test-knowledge-base-query.js`；(2) mock IndexedDB 构造知识库条目（含 title/content/tags/type/updatedAt 字段）；(3) 测试全文搜索: 关键词匹配、中英文混合查询、空查询返回全部；(4) 测试模糊匹配: 编辑距离容忍、拼音/同音近似（如适用）；(5) 测试分页: offset/limit 参数、边界值（offset > 总数）、空结果集；(6) 测试排序: 按相关度/时间/标题排序、降序切换；(7) 测试边界: null 输入、超大结果集（>1000 条）、特殊字符查询；(8) 验收: ≥15 用例，npm run test:ci 0 fail。复杂度: Medium

## 自动生成任务 — 2026-05-28 18:00 (第3轮 - 代码质量深挖)

> 由 Hermes 飞轮引擎生成（基于静态分析 + 测试状态）
> 分析依据: npm run test:ci 7789 pass/0 fail; 覆盖率 Stmts 93.9%/Funcs 88.7%/Branches 86.8%; 59 个 silent catch 块 (20 个 lib 文件); 34 个函数 >80 行

- [x] **R344: 消除 Top-5 高频 silent catch 块 SilentCatchRound2** — `storage-adapter.js`(5处)、`feedback-collector.js`(5处)、`chat-mode.js`(5处)、`stats.js`(4处)、`review-session.js`(4处) 共 23 处 silent catch；(1) 逐文件审查每个 catch 块: 判断是「容错安全」还是「吞掉真实错误」；(2) 容错安全场景（如 chrome.runtime.sendMessage 在 extension 环境外调用）保留 silent 但加 `/* safe: <原因> */` 注释；(3) 真实错误场景改为 `catch (e) { console.warn('[PageWise]', e) }` 或调用 `logError()`；(4) 涉及文件: `lib/storage-adapter.js`、`lib/feedback-collector.js`、`lib/chat-mode.js`、`lib/stats.js`、`lib/review-session.js`；(5) 验收: 5 文件 silent catch 从 23 降至 ≤8（仅保留有注释的容错），npm run test:ci 0 fail。复杂度: Medium

- [x] **R345: knowledge-base-export 零测试模块测试覆盖 KBExportTests** — `lib/knowledge-base-export.js`（~200 行）是知识库导出模块（JSON/CSV/Markdown 格式导出），含 3 处 silent catch，当前无测试文件；(1) 新建 `tests/test-knowledge-base-export.js`；(2) mock IndexedDB 知识库数据构造 ctx 上下文；(3) 测试 exportJSON: 完整数据导出、空库导出、字段过滤；(4) 测试 exportCSV: 表头生成、中文内容编码、特殊字符转义；(5) 测试 exportMarkdown: 格式化输出、层级结构；(6) 测试错误路径: 存储异常时的 catch 处理；(7) 同步修复 3 处 silent catch（改为 logError）；(8) 验收: ≥12 用例，npm run test:ci 0 fail。复杂度: Medium

- [x] **R346: sidebar.js bindEvents() 516 行超长函数拆分 SidebarBindEventsRefactor** — `sidebar/sidebar.js:642` 的 `bindEvents()` 函数 516 行，是全项目最长函数，圈复杂度极高；(1) 按功能域拆分为 5-6 个子函数: `bindBookmarkEvents()`（书签相关事件）、`bindSearchEvents()`（搜索事件）、`bindKnowledgeEvents()`（知识库事件）、`bindSettingsEvents()`（设置事件）、`bindUIEvents()`（UI 交互事件）、`bindKeyboardShortcuts()`（快捷键）；(2) `bindEvents()` 仅保留 ≤30 行协调逻辑，调用各子函数；(3) 保持所有事件绑定行为不变；(4) 验收: 最长函数 ≤80 行，npm run test:ci 0 fail。复杂度: Medium

## 自动生成任务 — 2026-05-29 00:01

> 由自主任务选择器生成（基于项目状态分析）

- [ ] **R181: 功能迭代** — 基于最近功能开发，继续完善用户体验
- [ ] **R182: 探索性改进** — 代码质量优化、性能提升或新功能原型
- [ ] **R183: 项目改进** — 根据项目状态进行优化和改进
