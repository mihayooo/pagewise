/**
 * KnowledgePanel 共享类型定义
 *
 * R126 提取: 消除 knowledge-panel-batch.js → knowledge-panel.js 的
 * JSDoc @this {import('./knowledge-panel.js').KnowledgePanel} 反向引用,
 * 使依赖方向变为单向 DAG:
 *
 *   knowledge-panel-types.js  ← (被引用)
 *         ↑            ↑
 *   knowledge-panel.js   knowledge-panel-batch.js
 *         |
 *   knowledge-panel-virtual.js
 *
 * @module knowledge-panel-types
 */

/**
 * @typedef {Object} KnowledgePanelContext
 * @property {boolean}   selectMode        - 是否处于选择模式
 * @property {Set}       selectedIds       - 选中的条目 ID 集合
 * @property {string|null} selectedEntryId  - 当前详情展示的条目 ID
 * @property {string|null} activeTag        - 当前活跃标签
 * @property {string|null} activeLanguage   - 当前活跃语言过滤
 * @property {Object}    memory            - MemorySystem 实例
 * @property {HTMLElement} knowledgeList    - 知识列表容器
 * @property {HTMLElement} knowledgeDetail  - 知识详情容器
 * @property {HTMLElement} batchToolbar     - 批量操作工具栏
 * @property {HTMLElement} batchFloatingBar - 浮动批量操作栏
 * @property {HTMLElement} batchCount       - 批量计数显示
 * @property {HTMLElement} batchFloatingCount - 浮动批量计数
 * @property {HTMLElement} batchSelectAll   - 全选复选框
 * @property {HTMLElement} btnSelectMode    - 选择模式按钮
 * @property {HTMLElement} emptyKnowledge   - 空状态元素
 * @property {HTMLElement} tagFilter        - 标签过滤器
 * @property {HTMLElement} searchInput      - 搜索输入框
 * @property {Object}      _currentEntries - 当前过滤后的条目列表
 * @property {Function}    showToast       - 提示消息方法
 * @property {Function}    addSystemMessage - 添加系统消息方法
 * @property {Function}    escapeHtml      - HTML 转义方法
 * @property {Function}    downloadFile    - 文件下载方法
 * @property {Function}    loadKnowledgeList  - 重新加载列表
 * @property {Function}    loadKnowledgeTags  - 重新加载标签
 * @property {Function}    updateBatchCount   - 更新批量计数
 * @property {Function}    toggleSelectMode   - 切换选择模式
 */
