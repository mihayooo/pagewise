# 需求文档 — R160: 覆盖率基础设施修复与行覆盖率回升 CoverageInfraAndBoost

> 迭代: R58 | 日期: 2026-05-19 | 复杂度: Medium

---

## 1. 用户故事

**作为** PageWise 项目维护者，**我希望** `npm run test:coverage` 能准确度量所有源码模块的测试覆盖率，且行覆盖率从当前 22.17% 回升至 ≥80%、函数覆盖率 ≥60%，**以便** 后续迭代有可信的质量门禁，防止"声称达标实际未达"的脱节问题再次发生。

---

## 2. 现状分析

### 2.1 覆盖率数据

| 指标 | 当前值 | 目标值 | 差距 |
|------|--------|--------|------|
| 行覆盖率 | 22.17% (10,212 / 46,056) | ≥ 80% | +26,633 行 |
| 函数覆盖率 | 待测 | ≥ 60% | — |

### 2.2 根因排查

经初步分析，覆盖率 22.17% 与历史声称的 ≥80% 严重脱节，存在以下三类根因：

#### 根因 A：c8 插桩范围过窄 — 入口文件未纳入

当前 `.c8rc.json` 配置：
```json
{
  "include": ["lib/**/*.js"],
  "all": true,
  "src": ["lib"]
}
```

**问题**: `include` 仅覆盖 `lib/` 目录，而 Chrome 扩展的四大入口文件群完全未被插桩：

| 目录 | 文件 | 行数 | 说明 |
|------|------|------|------|
| `sidebar/` | sidebar.js, sidebar-settings.js, sidebar-utils.js | 8,269 | 侧边栏主入口 |
| `options/` | options.js, bookmark-panel.js | 1,278 | 选项页入口 |
| `popup/` | popup.js, bookmark-overview.js | 672 | 弹出窗口入口 |
| `background/` | service-worker.js | 332 | 后台 Service Worker |
| **合计** | — | **10,551** | — |

这些入口文件大量 import `lib/` 下的模块，但自身逻辑未被覆盖率统计覆盖。即使 lib 模块覆盖率被间接拉高，入口文件的 10,551 行始终以 0% 计入分母，形成结构性拖累。

#### 根因 B：51 个 lib 模块完全无测试

通过文件名匹配排查，发现 **51 个 lib 文件**（共 10,987 行）在 `tests/` 目录下无对应测试文件。主要无测试模块（按行数排序前 20）：

| 文件 | 行数 | 职责域 |
|------|------|--------|
| bookmark-knowledge-integration.js | 547 | 书签-知识库集成 |
| docmind-client.js | 443 | 文档智能客户端 |
| docmind-sync.js | 414 | 文档智能同步 |
| bookmark-tag-editor-v2.js | 412 | 标签编辑器 v2 |
| core-flow-fix.js | 384 | 核心流程修复 |
| knowledge-base-crud.js | 381 | 知识库 CRUD |
| knowledge-base-query.js | 371 | 知识库查询 |
| plugin-system-utils.js | 336 | 插件系统工具 |
| bookmark-migration-runner.js | 327 | 书签迁移运行器 |
| skill-store-community.js | 304 | 技能商店社区 |
| importer.js | 297 | 导入器 |
| bookmark-import-export-io.js | 285 | 书签导入导出 IO |
| knowledge-base-export.js | 279 | 知识库导出 |
| auto-classifier-store.js | 271 | 自动分类存储 |
| wiki-store-funcs.js | 262 | Wiki 存储函数 |
| bookmark-final-polish-interactions.js | 262 | 书签打磨交互 |
| knowledge-panel-virtual.js | 260 | 知识面板虚拟滚动 |
| bookmark-graph-visualizer.js | 241 | 书签图谱可视化 |
| git-repo-objects.js | 238 | Git 仓库对象 |
| bookmark-analytics-advanced.js | 236 | 高级分析 |

#### 根因 C：已有测试文件覆盖深度不足

123 个有对应测试的 lib 文件（35,068 行）仅贡献 10,212 行覆盖（约 29%），说明大量测试只覆盖了 happy path 的表层，未触达条件分支、错误处理、边界场景。

### 2.3 c8 配置其他潜在问题

1. **`--all` 标志已存在**于 `.c8rc.json`（`"all": true`），但需确认 c8 是否正确将其应用——可 c8 CLI 未显式传 `--all` 时，config 文件中设置是否被正确读取。
2. **ESM 动态 import**: sidebar.js 使用 `await import()` 动态加载子模块（R158 拆分后），c8 在 Node.js 测试环境下对动态 import 的插桩行为可能有盲区。
3. **Chrome API 依赖**: 入口文件大量依赖 `chrome.*` API，现有 `helpers/setup.js` 中的 mock 可能不完整，导致测试无法真正执行到入口文件的核心逻辑。
4. **exclude 列表**: 当前排除了 `lib/pdf.min.mjs` 等 3 个 PDF 库文件（合理），但需确认是否有其他第三方 vendor 文件不应计入分母。

---

## 3. 验收标准

### AC1：c8 配置覆盖全部源码

- [ ] `.c8rc.json` 的 `include` 字段应覆盖 `lib/**/*.js`、`sidebar/**/*.js`、`options/**/*.js`、`popup/**/*.js`、`background/**/*.js`。
- [ ] `--all` 标志在 c8 运行时确实生效（未被测试的文件以 0% 计入统计）。
- [ ] 确认 c8 正确插桩 ESM 模块（含 dynamic import），可通过抽样检查 lcov 报告中的文件列表验证。
- [ ] 排除列表（`exclude`）仅包含第三方 vendor 文件和测试目录，不包含任何项目自有源码。

### AC2：行覆盖率 ≥ 80%

- [ ] `npm run test:coverage` 输出 `Lines` ≥ 80%。
- [ ] `npm run coverage:gate`（`c8 check-coverage --lines 80`）通过（exit code 0）。
- [ ] 覆盖率数据真实可信——不通过缩小分母（删除源码/过度排除）达成，而是通过增加测试覆盖分子。

### AC3：函数覆盖率 ≥ 60%

- [ ] `npm run test:coverage` 输出 `Functions` ≥ 60%。
- [ ] 在 `coverage:gate` 脚本中同时加入函数覆盖率检查：`c8 check-coverage --lines 80 --functions 60`。

### AC4：入口文件覆盖率可度量

- [ ] sidebar.js、options.js、popup.js、background/service-worker.js 出现在 lcov 报告中。
- [ ] 这些入口文件至少有基础的冒烟测试（导入成功、核心函数可调用、无 runtime error）。

### AC5：CI 脚本一致性

- [ ] `test:coverage` 脚本的 c8 参数与 `.c8rc.json` 配置一致，不出现"config 设了一套、CLI 另传一套"的冲突。
- [ ] `coverage:gate` 门禁脚本可被后续 CI pipeline 直接调用，exit code 表达成功/失败。

---

## 4. 技术约束

### 4.1 不得缩小分母

禁止通过以下手段人为提高覆盖率百分比：
- 从 `include` 中移除自有源码文件
- 将源码文件重命名为 `.mjs` 以绕过 `*.js` 通配
- 删除无测试的源码文件（这些文件是功能资产）

### 4.2 Chrome API Mock 策略

- 入口文件测试必须在 Node.js 环境运行，不得依赖真实 Chrome 浏览器。
- 需扩展 `tests/helpers/setup.js` 中的 `chrome` mock，至少覆盖：
  - `chrome.storage`（local/sync/session）
  - `chrome.tabs`
  - `chrome.runtime`（sendMessage / onMessage / getURL）
  - `chrome.sidePanel`
  - `chrome.contextMenus`
  - `chrome.bookmarks`
- mock 粒度：返回合理的默认值（空对象/空数组），不要求完全模拟 Chrome 行为。

### 4.3 ESM 兼容

- 所有新测试文件使用 ESM（`import`/`export`），与现有测试风格一致。
- 使用 Node.js 原生 `node:test` 测试框架，不得引入 Jest/Mocha 等额外框架。

### 4.4 c8 版本锁定

- 当前 c8 版本 `^10.1.3`，若存在已知 bug 影响 ESM 插桩，可固定到具体 patch 版本。

### 4.5 性能约束

- `npm run test:coverage` 全量运行时间不超过 120 秒（当前纯测试约 60 秒）。
- 不得为了覆盖率而添加 sleep / 等待型测试。

---

## 5. 依赖关系

### 5.1 上游依赖

| 依赖项 | 说明 | 状态 |
|--------|------|------|
| R158: sidebar.js 拆分 | sidebar/ 目录结构已稳定（sidebar.js + 2 子模块） | ✅ 已完成 |
| R159: ESLint 警告清零 | 代码中不应有 lint 警告干扰测试运行 | ✅ 已完成 |
| `.c8rc.json` 存在 | c8 配置文件已创建 | ✅ 存在但需修复 |
| `tests/helpers/setup.js` | Chrome mock 基础设施 | ✅ 存在但需扩展 |

### 5.2 下游影响

| 受影响项 | 说明 |
|----------|------|
| CI Pipeline | `coverage:gate` 将成为质量门禁步骤 |
| 后续所有迭代 | 覆盖率下降会阻塞合并 |
| 飞轮迭代流程 | 验证阶段可自动检查覆盖率达标 |

### 5.3 并行可能性

本任务分两个可并行的子方向：

- **子方向 A（基础设施）**: 修复 c8 配置、扩展 Chrome mock、添加入口文件冒烟测试。前置，约 1 小时。
- **子方向 B（测试补充）**: 为 51 个无测试文件补充单元测试、深化现有测试覆盖深度。后置，依赖 A 完成后才能看到准确数字，但编写测试本身可提前开始。

---

## 6. 实施策略建议

### Phase 1：基础设施修复（优先）

1. 修复 `.c8rc.json`，扩展 `include` 至所有源码目录。
2. 确认 `--all` 标志正确生效。
3. 运行 `npm run test:coverage` 获取修复后的真实基线。
4. 根据真实基线调整后续测试补充的优先级。

### Phase 2：入口文件冒烟测试

1. 为 sidebar.js、options.js、popup.js、service-worker.js 各添加 1 个冒烟测试（import 成功 + 导出函数存在）。
2. 扩展 Chrome mock 覆盖入口文件所需 API。

### Phase 3：高优先级无测试模块覆盖

按行数 × 功能重要性排序，优先覆盖：
- 知识库相关（knowledge-base-crud、knowledge-base-query、knowledge-base-export）— 核心功能
- 书签核心（bookmark-knowledge-integration、bookmark-tag-editor-v2）— 核心功能
- 导入导出（importer、bookmark-import-export-io）— 用户高频操作

### Phase 4：现有测试深化

对已测试但覆盖率低的文件，补充：
- 错误处理分支
- 边界条件（空输入、超大输入）
- 配置项组合

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| c8 对 ESM dynamic import 插桩有盲区 | 入口文件覆盖率虚低 | Phase 1 抽样验证 lcov；若有 bug 则切换至 Istanbul/nyc |
| 入口文件强依赖 Chrome API | 无法在 Node.js 中执行核心逻辑 | Phase 2 扩展 mock；接受入口文件覆盖率可能低于 lib |
| 80% 目标过于激进 | 迭代超时 | Phase 1 获取真实基线后，若差距过大可调整为 60% 作为本期目标，80% 作为下期 |
| 新增测试影响现有测试 | 回归 | 每批测试添加后运行 `npm run test:ci` 确认 0 fail |

---

*文档生成于 2026-05-19*
*遵循飞轮迭代流程 (flywheel-iteration)*
