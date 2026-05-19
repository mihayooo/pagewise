# lib/ 公共 API 速查表

> 智阅 PageWise 核心库模块 API 参考文档
> 最后更新: 2026-05-19

---

## utils.js

通用工具函数库。

| 函数 | 说明 |
|------|------|
| `getSettings()` → `Promise<Settings>` | 获取扩展设置 |
| `saveSettings(settings)` → `Promise<void>` | 保存扩展设置 |
| `truncate(text, maxLength)` → `string` | 截断文本到指定长度 |
| `formatTime(dateStr)` → `string` | 格式化时间字符串 |
| `renderMarkdown(text)` → `string` | 渲染 Markdown 为 HTML |
| `highlightCode(code, lang)` → `string` | 代码语法高亮 |
| `debounce(fn, delay)` → `function` | 防抖函数 |
| `throttle(fn, interval)` → `function` | 节流函数 |
| `generateId()` → `string` | 生成唯一 ID |
| `saveConversation(history, url)` → `Promise<void>` | 保存对话历史 |
| `loadConversation(url)` → `Promise<Array>` | 加载对话历史 |
| `clearConversation()` → `Promise<void>` | 清除对话历史 |
| `detectPageLanguage(text)` → `string` | 检测页面语言 |

## ai-client.js

AI API 客户端 — 支持 Claude / OpenAI / DeepSeek / Ollama。

| 导出 | 说明 |
|------|------|
| `class AIClient` | AI 客户端类 |
| `AIClient.sendMessage(messages, options)` → `Promise<Response>` | 发送消息 |
| `AIClient.streamMessage(messages, options)` → `AsyncGenerator` | 流式输出 |
| `estimateTokens(text)` → `number` | 估算 token 数量 |
| `estimateMessagesTokens(messages)` → `number` | 估算消息 token 数量 |

## knowledge-base.js

知识库 — IndexedDB 存储、CRUD、全文搜索。

| 方法 | 说明 |
|------|------|
| `addEntry(entry)` → `Promise<Entry>` | 添加条目 |
| `getEntry(id)` → `Promise<Entry>` | 获取条目 |
| `updateEntry(id, data)` → `Promise<Entry>` | 更新条目 |
| `deleteEntry(id)` → `Promise<void>` | 删除条目 |
| `searchEntries(query, options)` → `Promise<Array>` | 搜索条目 |
| `getAllEntries()` → `Promise<Array>` | 获取所有条目 |
| `getCategories()` → `Promise<Array>` | 获取分类列表 |
| `exportEntries(format)` → `Promise<string>` | 导出条目 |

## skill-engine.js

技能引擎 — 技能注册、发现、执行。

| 方法 | 说明 |
|------|------|
| `class SkillEngine` | 技能引擎类 |
| `registerSkill(skill)` → `void` | 注册技能 |
| `getSkills()` → `Array` | 获取所有技能 |
| `matchSkills(pageInfo)` → `Array` | 匹配页面技能 |
| `executeSkill(skillId, context)` → `Promise<Result>` | 执行技能 |

## spaced-repetition.js

间隔重复学习系统。

| 函数 | 说明 |
|------|------|
| `DIFFICULTY_MAP` | 难度映射常量 |
| `initializeReviewData()` → `Object` | 初始化复习数据 |
| `calculateNextReview(quality, currentData)` → `Object` | 计算下次复习时间 |
| `getDueCards(entries, limit)` → `Array` | 获取待复习卡片 |
| `formatReviewDate(timestamp)` → `string` | 格式化复习日期 |
| `getDueCardCount(entries)` → `number` | 获取待复习数量 |
| `getReviewStreak()` → `number` | 获取连续复习天数 |
| `recordReviewDay()` → `void` | 记录复习日 |

## memory.js

记忆系统 — 用户画像、知识召回、偏好学习。

| 方法 | 说明 |
|------|------|
| `class MemorySystem` | 记忆系统类 |
| `addMemory(content, type)` → `Promise<void>` | 添加记忆 |
| `recall(query, limit)` → `Promise<Array>` | 召回相关记忆 |
| `getProfile()` → `Promise<Object>` | 获取用户画像 |
| `updatePreference(key, value)` → `Promise<void>` | 更新偏好 |

## bookmark-graph.js

书签图谱引擎 — 相似度计算、图谱构建。

| 方法 | 说明 |
|------|------|
| `class BookmarkGraphEngine` | 图谱引擎类 |
| `buildGraph(bookmarks)` → `Object` | 构建图谱 |
| `findSimilar(bookmarkId, limit)` → `Array` | 查找相似书签 |
| `getClusters()` → `Array` | 获取聚类结果 |

## bookmark-collector.js

书签采集器 — 递归读取 Chrome 书签树。

| 方法 | 说明 |
|------|------|
| `class BookmarkCollector` | 采集器类 |
| `collect()` → `Promise<Array>` | 采集所有书签 |
| `normalizeBookmark(node)` → `Object` | 标准化书签对象 |

## bookmark-indexer.js

书签索引器 — 倒排索引、中英文分词。

| 方法 | 说明 |
|------|------|
| `class BookmarkIndexer` | 索引器类 |
| `buildIndex(bookmarks)` → `void` | 构建索引 |
| `search(query)` → `Array` | 搜索书签 |
| `addBookmark(bookmark)` → `void` | 增量添加 |
| `removeBookmark(id)` → `void` | 增量删除 |

## bookmark-search.js

书签搜索 — 综合搜索、条件过滤、搜索建议。

| 方法 | 说明 |
|------|------|
| `class BookmarkSearch` | 搜索类 |
| `search(query, options)` → `Array` | 综合搜索 |
| `getSuggestions(partial)` → `Array` | 获取搜索建议 |
| `filterByFolder(folder)` → `Array` | 按文件夹过滤 |
| `filterByTag(tag)` → `Array` | 按标签过滤 |

## bookmark-dedup.js

书签去重 — URL 规范化、标题相似度检测。

| 方法 | 说明 |
|------|------|
| `class BookmarkDedup` | 去重类 |
| `findDuplicates()` → `Array` | 查找重复书签 |
| `suggestCleanup(duplicates)` → `Array` | 清理建议 |
| `batchRemove(ids)` → `Promise<void>` | 批量删除 |

## bookmark-backup.js

书签备份 — 创建、验证、恢复。

| 函数 | 说明 |
|------|------|
| `BACKUP_FORMAT_VERSION` | 备份格式版本常量 |
| `SUPPORTED_VERSIONS` | 支持的版本列表 |
| `computeChecksum(str)` → `string` | 计算校验和 |
| `createBackup(bookmarks, options)` → `Object` | 创建备份 |
| `validateBackup(backupData)` → `Object` | 验证备份 |
| `restoreBackup(backupData)` → `Object` | 恢复备份 |

## bookmark-i18n.js

书签国际化 — 中英文语言包。

| 导出 | 说明 |
|------|------|
| `BOOKMARK_I18N_KEYS` | i18n key 常量 |
| `bookmarkZhCN` | 中文语言包 |
| `bookmarkEnUS` | 英文语言包 |
| `registerBookmarkLocale(options)` → `void` | 注册语言 |
| `getStatusLabel(status, locale)` → `string` | 获取状态标签 |
| `formatDateByLocale(timestamp, locale)` → `string` | 本地化日期 |
| `createBookmarkT(locale)` → `function` | 创建翻译函数 |

## bookmark-keyboard-shortcuts.js

书签快捷键 — 自定义绑定、冲突检测。

| 导出 | 说明 |
|------|------|
| `DEFAULT_GRAPH_SHORTCUTS` | 默认快捷键映射 |
| `GRAPH_SHORTCUT_LABELS` | 快捷键标签 |
| `class BookmarkKeyboardShortcuts` | 快捷键管理类 |
| `bind(key, callback)` → `void` | 绑定快捷键 |
| `unbind(key)` → `void` | 解绑快捷键 |

## bookmark-semantic-search.js

语义搜索 — TF-IDF 余弦相似度、混合搜索。

| 方法 | 说明 |
|------|------|
| `semanticSearch(query, options)` → `Array` | 语义搜索 |
| `hybridSearch(query, options)` → `Array` | 混合搜索 |
| `findSimilar(bookmarkId, limit)` → `Array` | 以文搜文 |
| `addBookmark(bookmark)` → `void` | 增量更新 |
| `invalidateCache(bookmarkId?)` → `void` | 缓存管理 |

## embedding-engine.js

嵌入引擎 — TF-IDF 向量化、余弦相似度。

| 方法 | 说明 |
|------|------|
| `buildIndex(documents)` → `void` | 构建索引 |
| `search(query, limit)` → `Array` | 向量搜索 |
| `tokenize(text)` → `Array` | 分词 |
| `computeTFIDF(tokens)` → `Map` | 计算 TF-IDF |

## learning-path.js

学习路径 — 难度分析、路径生成。

| 方法 | 说明 |
|------|------|
| `generatePath(entries)` → `Array` | 生成学习路径 |
| `analyzeDifficulty(entry)` → `string` | 分析难度 |
| `trackProgress(pathId, entryId)` → `void` | 追踪进度 |

## page-sense.js

页面感知 — 页面类型检测、内容提取。

| 方法 | 说明 |
|------|------|
| `detectPageType()` → `string` | 检测页面类型 |
| `extractContent()` → `Object` | 提取页面内容 |
| `getSelectedText()` → `string` | 获取选中文本 |

## plugin-system.js

插件系统 — 插件注册、生命周期管理。

| 方法 | 说明 |
|------|------|
| `registerPlugin(plugin)` → `void` | 注册插件 |
| `unregisterPlugin(id)` → `void` | 注销插件 |
| `getPlugins()` → `Array` | 获取所有插件 |
| `executePlugin(id, context)` → `Promise<Result>` | 执行插件 |

## error-handler.js

错误处理 — 错误分类、优雅降级。

| 函数 | 说明 |
|------|------|
| `classifyError(error)` → `string` | 错误分类 |
| `handleError(error)` → `Object` | 错误处理 |
| `createErrorBoundary(fn)` → `function` | 错误边界包装 |

## cost-estimator.js

成本估算 — Token 计费、费用预估。

| 函数 | 说明 |
|------|------|
| `estimateCost(tokens, model)` → `number` | 估算费用 |
| `formatCost(cost)` → `string` | 格式化费用 |

## sanitize.js

输入安全 — XSS 防护、URL 校验。

| 函数 | 说明 |
|------|------|
| `escapeHtml(str)` → `string` | HTML 实体编码 |
| `escapeHtmlAttr(str)` → `string` | 属性值编码 |
| `escapeSearchQuery(str)` → `string` | 搜索注入防护 |
| `sanitizeBookmarkTitle(title)` → `string` | 书签标题净化 |
| `validateUrl(url)` → `boolean` | URL 校验 |

## cache-manager.js

缓存管理 — LRU + TTL + 失效策略。

| 方法 | 说明 |
|------|------|
| `get(key)` → `any` | 获取缓存 |
| `set(key, value, ttl?)` → `void` | 设置缓存 |
| `delete(key)` → `void` | 删除缓存 |
| `clear()` → `void` | 清除所有缓存 |
| `size()` → `number` | 缓存大小 |

## message-renderer.js

消息渲染 — Markdown 渲染、代码高亮。

| 函数 | 说明 |
|------|------|
| `renderMessage(content)` → `string` | 渲染消息 |
| `renderCodeBlock(code, lang)` → `string` | 渲染代码块 |

## knowledge-graph.js

知识图谱 — 节点/边管理、布局算法。

| 方法 | 说明 |
|------|------|
| `addNode(node)` → `void` | 添加节点 |
| `addEdge(from, to, weight)` → `void` | 添加边 |
| `getNeighbors(nodeId)` → `Array` | 获取邻居节点 |
| `layout()` → `Object` | 图谱布局 |

## bookmark-recommender.js

书签推荐 — 基于图谱的相似推荐。

| 方法 | 说明 |
|------|------|
| `recommend(bookmarkId, limit)` → `Array` | 推荐相似书签 |
| `recommendByContent(content, limit)` → `Array` | 基于内容推荐 |
| `getRecommendReason(bookmark, candidate)` → `string` | 推荐理由 |

## bookmark-visualizer.js

图谱可视化 — Canvas 力导向图渲染。

| 方法 | 说明 |
|------|------|
| `render(container, graphData)` → `void` | 渲染图谱 |
| `zoom(factor)` → `void` | 缩放 |
| `highlightNode(id)` → `void` | 高亮节点 |
| `destroy()` → `void` | 销毁实例 |

## bookmark-sharing.js

书签分享 — 创建可分享集合、多格式导出。

| 方法 | 说明 |
|------|------|
| `createShareableCollection(bookmarks, name)` → `Object` | 创建分享集合 |
| `exportAsJSON(collection)` → `string` | JSON 导出 |
| `exportAsText(collection)` → `string` | 文本导出 |
| `importShareData(data)` → `Object` | 导入分享数据 |

## bookmark-io.js

书签导入导出 — JSON/CSV/HTML 格式。

| 函数 | 说明 |
|------|------|
| `exportJSON(data)` → `string` | 导出 JSON |
| `exportCSV(bookmarks)` → `string` | 导出 CSV |
| `importFromChromeHTML(html)` → `Array` | 从 Chrome HTML 导入 |
| `importFromJSON(json)` → `Object` | 从 JSON 导入 |

## bookmark-gap-detector.js

知识盲区检测 — 领域覆盖度分析。

| 方法 | 说明 |
|------|------|
| `detectGaps(bookmarks, clusters)` → `Array` | 检测盲区 |
| `getCoverageLevels()` → `Object` | 获取覆盖度 |
| `suggestTopics(gaps)` → `Array` | 推荐补充方向 |

## bookmark-tag-editor.js

标签编辑 — 手动/批量标签管理。

| 方法 | 说明 |
|------|------|
| `addTag(bookmarkId, tag)` → `void` | 添加标签 |
| `removeTag(bookmarkId, tag)` → `void` | 删除标签 |
| `setTags(bookmarkId, tags)` → `void` | 覆盖标签 |
| `getAutocomplete(partial, limit)` → `Array` | 标签自动补全 |
| `batchAddTag(ids, tag)` → `void` | 批量添加标签 |

## bookmark-status.js

状态标记 — unread/reading/read。

| 函数 | 说明 |
|------|------|
| `setStatus(bookmarkId, status)` → `void` | 设置状态 |
| `getByStatus(status)` → `Array` | 按状态过滤 |
| `getStatusCounts()` → `Object` | 状态统计 |
| `markAllAsRead()` → `void` | 全部标记已读 |

## bookmark-folder-analyzer.js

文件夹分析 — 质量评估、整理建议。

| 函数 | 说明 |
|------|------|
| `analyzeFolders(bookmarks)` → `Object` | 分析文件夹 |
| `getQualityLevel(folder)` → `string` | 质量评估 |
| `suggestCleanup(folders)` → `Array` | 整理建议 |

---

*本文档由 R122 自动生成，覆盖 lib/ 核心模块的公共 API。*
