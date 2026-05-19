# 需求文档 — R131: 无障碍功能补全 AccessibilityComplete

> 迭代: R28
> 日期: 2026-05-19
> 复杂度: Medium
> 需求编号: R79（补全实施）
> 模块文件: `lib/bookmark-accessibility.js`（当前 598 行）
> 测试文件: `tests/test-bookmark-accessibility.js`（当前 49 用例）

---

## 1. 用户故事

### US-1: 键盘用户可完全操作书签面板

> 作为一名键盘用户（因肢体障碍或效率偏好不使用鼠标），我希望仅通过键盘（Tab/Shift+Tab 切换焦点、Arrow 键浏览列表、Enter 打开、Escape 关闭）就能完成书签面板的所有核心操作——搜索、浏览列表、查看详情、关闭面板——无需触碰鼠标。

### US-2: 屏幕阅读器用户获得完整语义信息

> 作为一名视障用户使用屏幕阅读器（NVDA/VoiceOver）浏览书签面板时，我希望每个交互元素都有清晰的 aria-label，操作结果通过 live region 实时播报（如"已加载 15 个书签""搜索结果 3 条""详情面板已打开"），让我能独立使用知识库功能。

---

## 2. 验收标准

### AC1: 键盘导航补全（KeyboardNav）

当前 `createKeyHandler()` 已支持 Arrow Up/Down/Left/Right、Home、End、Enter、Escape。需补全：

- **Tab/Shift+Tab 支持**: 当焦点在书签列表中时，Tab 键应跳转到下一个可聚焦 UI 区域（如搜索框、文件夹导航），Shift+Tab 反向跳转；不在列表项间循环
- **disabled 状态守卫**: 当 `isEnabled() === false` 时，`createKeyHandler` 返回的处理器对**所有按键**均不做 `preventDefault()`，不干预浏览器默认行为
- **空列表守卫**: `items` 数组为空时，Enter/Arrow/Home/End 均静默忽略（当前已有，需确认测试覆盖）
- **onNavigate 回调一致性**: Arrow Left/Right 应产生与 Arrow Up/Down 相同的 `direction` 参数（'up'/'down'），当前 Left='up'、Right='down' 需保持一致

### AC2: 焦点陷阱补全（FocusTrap）

当前 `createFocusTrap()` 已实现 activate/deactivate + Tab 循环。需补全：

- **单元素边界**: 容器内只有 1 个可聚焦元素时，Tab 和 Shift+Tab 均应保持焦点在该元素上，不跳出容器
- **deactivate 恢复焦点**: deactivate 后焦点应回到 activate 之前的元素（当前已实现，需确认 `previousFocus` 为 null 时不抛异常）
- **重复 activate 幂等**: 连续调用 `activate()` 多次应等效于调用一次，不重复注册事件监听器（当前已实现，需确认测试覆盖）
- **容器为空守卫**: 容器内无可聚焦元素时，activate 不抛异常，Tab 键被 preventDefault

### AC3: ARIA 属性与 Live Region 补全（ARIA）

当前已实现 `getBookmarkListAriaAttrs`、`getBookmarkItemAriaAttrs`、`getLiveRegionAttrs`、`getFolderNavAriaAttrs`、`getStatusAriaAttrs`、`getDetailPanelAriaAttrs`、`getSearchBoxAriaAttrs`。需补全：

- **Announcer `this` 绑定修复**: `createAnnouncer()` 返回对象的 `announce()` 方法中 `this._enabled` 检查错误——`this` 指向 announcer 对象而非 BookmarkAccessibility 实例。需将外层 `_enabled` 引用捕获到闭包变量，改为 `self._enabled`
- **Announcer disabled 守卫**: 当 `isEnabled() === false` 时，`announce()` 静默忽略（不设置 textContent）
- **Announcer 重复创建守卫**: 同一 container 多次调用 `createAnnouncer()` 应复用已有 live region 元素，不重复创建
- **详情面板 ARIA 模态属性**: `getDetailPanelAriaAttrs()` 已返回 `aria-modal: true`，确认此属性在测试中被断言

### AC4: 颜色对比度审计补全（ContrastAudit）

当前 `auditContrast()` 已审计 14 组预定义色彩对。需补全：

- **动态色彩对注入**: 新增 `static setContrastPairs(pairs)` 方法，允许调用方追加或替换待审计色彩对（支持暗色主题审计）
- **失败项过滤便捷方法**: 新增 `static getFailingPairs()` 方法，返回所有 `passes === false` 的色彩对（简化审计报告生成）
- **审计报告摘要**: `auditContrast()` 返回值增加摘要统计：`{ results: [...], total: number, passing: number, failing: number }`（向后兼容：如果调用方使用 `forEach` 遍历原数组，需注意此为 breaking change——**方案选择**: 新增 `auditContrastSummary()` 方法而非修改原返回值，保持向后兼容）

### AC5: 测试覆盖 ≥ 49 用例

- 当前 49 用例全部通过（零回归）
- 为 AC1-AC4 中的新增功能/修复补充测试用例：
  - Tab/Shift+Tab 跳转行为（2 用例）
  - disabled 状态下键盘事件不干预（1 用例）
  - FocusTrap 单元素边界（1 用例）
  - FocusTrap 重复 activate 幂等（1 用例）
  - Announcer `this` 绑定修复验证（1 用例）
  - Announcer disabled 守卫（1 用例）
  - `setContrastPairs()` 动态注入（2 用例）
  - `getFailingPairs()` 过滤（2 用例）
  - `auditContrastSummary()` 摘要（2 用例）
- 目标: ≥ 62 用例，全部通过

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包（如 axe-core、pa11y）；对比度计算使用自有 WCAG 2.1 算法 |
| 纯逻辑模块 | 不直接操作 DOM；所有 DOM 交互通过回调/属性注入模式与 UI 层解耦 |
| 不依赖 Chrome API | 业务逻辑层，Chrome API 由 UI 层（popup/sidebar）注入 |
| 向后兼容 | 所有已有导出（`BookmarkAccessibility`、`ARIA_ROLES`、`FOCUS_TRAP_SELECTORS`、`KEYBOARD_NAV_KEYS`、`hexToRgb`、`getContrastRatio`、`meetsWCAG_AA`）保持不变；已有 49 用例零回归 |
| 行数约束 | 修复后文件应 ≤ 400 行（R130 模块拆分目标），若超出则将颜色工具函数拆分到 `lib/a11y-color-utils.js` |
| WCAG 2.1 AA 标准 | 对比度 ≥ 4.5:1（正常文本）/ ≥ 3:1（大文本 ≥18pt 或 14pt bold）；遵循 WAI-ARIA 1.2 规范 |
| 测试框架 | `node:test` + `node:assert/strict`，与项目测试规范一致 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| BookmarkI18n (R80) | `lib/bookmark-i18n.js` | ✅ 已实现 | ARIA label 字符串应引用 i18n key 而非硬编码中文（当前硬编码"书签列表，共 N 个书签"等字符串，R131 保持现状不改 i18n 集成，留作后续优化） |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| BookmarkDetailPanel (R47) | 详情面板使用 `createFocusTrap()` + `getDetailPanelAriaAttrs()` |
| BookmarkPopup (R50) | 书签列表使用 `createKeyHandler()` + `getBookmarkListAriaAttrs()` + `getBookmarkItemAriaAttrs()` |
| BookmarkOptionsPage (R51) | 选项页搜索框使用 `getSearchBoxAriaAttrs()`；对比度审计结果展示 |
| ThemeManager | 暗色主题切换后调用 `setContrastPairs()` 更新色彩对 |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| DOM 环境 | `createFocusTrap()` 和 `createAnnouncer()` 需要 DOM 容器对象（`querySelectorAll`、`addEventListener`、`appendChild` 接口）；Node.js 测试中使用 mock 对象 |
| 浏览器 Live Region 支持 | `aria-live="polite"` 依赖浏览器/屏幕阅读器实现；本模块只保证生成正确的 DOM 属性，不保证所有屏幕阅读器行为一致 |

---

## 5. 问题清单（Bug Fix）

| 编号 | 问题 | 位置 | 严重度 | 修复方案 |
|------|------|------|--------|----------|
| BUG-1 | `createAnnouncer().announce()` 中 `this._enabled` 指向错误（指向 announcer 对象而非 BookmarkAccessibility 实例） | 第 509 行 | **高** | 在 `createAnnouncer` 方法顶部 `const self = this`，将 `this._enabled` 改为 `self._enabled` |
| BUG-2 | Tab 键未在 `createKeyHandler` 中处理，浏览器默认 Tab 行为可能将焦点移出列表区域 | 第 211 行 switch | 中 | 当焦点在列表中且非最后一个元素时，不拦截 Tab（让浏览器处理自然跳转）；仅在需要时显式处理 |

---

## 6. 不在范围内 (Out of Scope)

| 项目 | 原因 | 归属 |
|------|------|------|
| ARIA label 国际化（中英文切换） | 当前硬编码中文字符串，i18n 集成由 R80 BookmarkI18n 负责 | R80 |
| 高对比度模式 (forced-colors) 完整支持 | 当前已有 CSS `forced-colors` 媒体查询基础支持，完整适配需 UI 层配合 | 后续迭代 |
| 语音控制 / Switch Access 支持 | 属于独立的辅助技术范畴 | 后续迭代 |
| `lib/bookmark-accessibility.js` 拆分到 ≤400 行 | 当前 598 行，R131 新增功能可能使行数增加；若超出 640 行则由 R130 二期统一处理拆分 | R130 |
| 暗色主题对比度对的完整定义 | R131 提供 `setContrastPairs()` 注入能力，具体暗色主题色彩对定义由 ThemeManager 负责 | ThemeManager |

---

## 7. 输出文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `lib/bookmark-accessibility.js` | Bug 修复（announcer `this` 绑定）+ 新增 `setContrastPairs` / `getFailingPairs` / `auditContrastSummary` |
| 修改 | `tests/test-bookmark-accessibility.js` | 补充 ≥13 个新用例，总 ≥62 用例 |
| 修改 | `docs/CHANGELOG.md` | 新增 R131 条目 |
| 修改 | `docs/TODO.md` | 标记 R131 状态 |

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 行数增长超出 640 行阈值 | 中 | 低 | 仅新增 3 个方法 + bug 修复，预计增量 < 50 行（598 → ~648）；若超出则拆分颜色工具到独立文件 |
| `auditContrastSummary()` 返回值结构变更被误用为原 `auditContrast()` | 低 | 中 | 使用新方法名而非修改已有方法返回值，零 breaking change |
| Tab 键行为在不同浏览器中不一致 | 低 | 低 | 本模块仅在 `createKeyHandler` 中做最小拦截（disabled 守卫），Tab 跳转由浏览器原生处理 |
| Mock DOM 环境下 Live Region 行为与真实浏览器不同 | 中 | 低 | 测试使用纯 JS mock 对象验证逻辑正确性；真实浏览器行为由 E2E 测试覆盖（不在本迭代范围） |

---

## 变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R131 | 初始创建 — 无障碍功能补全需求文档（基于 R79 补全实施） |
