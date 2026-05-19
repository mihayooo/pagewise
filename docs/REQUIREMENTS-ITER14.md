# 需求文档 — Iteration 14: 健康检查报告更新

> 需求编号: R117
> 优先级: P1
> 迭代: R14 (飞轮迭代 R14)
> 日期: 2026-05-19
> 负责: Plan Agent
> 复杂度: Simple

---

## 一、背景与动机

### 问题陈述

PageWise 项目经过 R113 (CI 流水线修复)、R114 (测试覆盖空白填补)、R115 (测试套件瘦身)、R116 (大模块拆分重构) 四轮密集迭代后，项目健康指标发生了显著变化：

| 指标 | R113 之前 | R114/R115/R116 之后 (当前) | 差距 |
|------|-----------|--------------------------|------|
| lib 模块数 | ~90 | 134 | 模块拆分后激增 |
| 测试文件数 | ~100 | 135 | R114 补充了覆盖 |
| 无测试覆盖的 lib 模块 | 未统计 | **41 个** (30.6%) | 需要持续跟踪 |
| ESLint 问题数 | 未基线化 | **635** (2 error + 633 warn) | R113 修复了 CI 断言，但问题数需趋势监控 |
| 最大模块行数 | 1866 (knowledge-base.js) | 1096 (bookmark-graph.js) | R116 拆分见效，但仍需跟踪 |

**当前痛点：**

1. **`scripts/health-check.sh` 不存在** — 该脚本在任务描述中被引用但从未创建，无法提供项目健康快照
2. **测试覆盖空白不可见** — R114 虽补充了 15 个模块的测试，但仍有 41 个模块无测试，缺乏自动化检测手段
3. **ESLint 警告无趋势** — 当前 `--max-warnings 10000` 只是容错上限，无法看出警告是在增加还是减少
4. **大模块无排行** — R116 拆分后仍存在 1000+ 行模块，缺乏持续监控 Top-10 排行
5. **前序迭代断层** — R113/R114/R115/R116 的成果没有统一的健康仪表盘来验证是否生效

### 用户角色

| 角色 | 需求 |
|------|------|
| **开发者 (主要)** | 运行一次脚本即可看到项目全貌，决定下一步迭代方向 |
| **飞轮引擎 (iteration-engine.sh)** | 在迭代回顾阶段自动调用健康检查，生成报告附件 |
| **CI/CD** | 可集成到构建流程中，健康检查不通过时标黄/标红 |

---

## 二、用户故事

### US-1: 开发者运行健康检查获得项目全貌

> 作为一名 PageWise 开发者，我希望在终端运行 `bash scripts/health-check.sh` 后，立即获得一份包含测试覆盖空白、ESLint 警告趋势、大模块排行的综合健康报告，这样我不需要分别运行多个命令就能判断项目当前健康状态和下一步优化方向。

### US-2: 飞轮引擎在迭代回顾时自动生成报告

> 作为飞轮迭代引擎 (iteration-engine.sh)，我希望在每轮迭代的 Phase 5 (回顾) 自动调用 health-check.sh，将 HTML 报告存入 `docs/reports/` 目录，这样每轮迭代的健康状态变化可追溯。

---

## 三、验收标准

### AC-1: 测试覆盖空白检测

- [ ] 扫描 `lib/` 目录下所有 `.js` 文件（排除 `pdf.min.mjs`、`pdf.worker.min.mjs`、`pdf.worker.mjs` 等第三方/产物文件）
- [ ] 对每个 lib 模块，检查 `tests/test-<模块名>.js` 是否存在（匹配规则：文件名去掉 `.js` 后缀）
- [ ] 输出无测试覆盖的模块列表，格式为模块名 + 行数，按行数降序排列
- [ ] 报告底部汇总：`覆盖率 = 有测试模块数 / 总模块数 × 100%`
- [ ] **边界条件**：R116 拆分产生的新模块 (如 `knowledge-base-core.js`、`knowledge-base-crud.js`、`knowledge-base-query.js`、`knowledge-base-export.js`) 也应纳入扫描

### AC-2: ESLint 警告趋势统计

- [ ] 执行 `npx eslint . --max-warnings 10000 --format json` 获取结构化输出
- [ ] 解析 JSON 输出，统计 error 数、warning 数、按规则分类的 Top-5 告警规则
- [ ] 如果存在历史报告 (`docs/reports/` 中最近一份 HTML 报告)，提取上次的 warning/error 数并与本次对比，输出趋势箭头（↑ 增加 / ↓ 减少 / → 持平）
- [ ] **边界条件**：首次运行时无历史数据，趋势显示为 "首次运行，无历史基准"

### AC-3: 模块行数 Top-10 排行

- [ ] 使用 `wc -l lib/*.js` 统计所有 lib 模块行数
- [ ] 输出行数最多的 Top-10 模块，格式为 `排名 | 模块名 | 行数`
- [ ] 对超过 400 行的模块标记 ⚠️ 警告（R116 设定的目标阈值为 ≤400 行）
- [ ] **边界条件**：排除 `pdf.min.mjs`、`pdf.worker.min.mjs`、`pdf.worker.mjs` 等第三方文件

### AC-4: 双格式报告输出

- [ ] 同时输出 **Markdown** (`docs/reports/health-check-YYYY-MM-DD.md`) 和 **HTML** (`docs/reports/health-check-YYYY-MM-DD.html`)
- [ ] HTML 报告包含内联 CSS 样式，可直接在浏览器中打开查看（不依赖外部资源）
- [ ] HTML 报告包含：
  - 标题栏：项目名 + 检查时间 + 迭代编号
  - 三个区块：测试覆盖空白、ESLint 趋势、模块行数排行
  - 颜色编码：绿色 (良好) / 黄色 (警告) / 红色 (需关注)
  - 底部：总健康评分（综合三个维度的加权分数）
- [ ] Markdown 报告内容与 HTML 一致，适合在 GitHub/GitLab 中查看
- [ ] 终端同时输出精简摘要（不超过 30 行），包含关键数字和总评分

### AC-5: 与前序迭代衔接验证

- [ ] 验证 R113 衔接：脚本中 ESLint 命令使用与 `package.json` 一致的 `eslint . --max-warnings 10000` 格式
- [ ] 验证 R114 衔接：覆盖空白检测结果中，R114 补充的 15 个模块 (agent-loop、evolution、importer、graph-export、docmind-client、docmind-sync、selection-handler、selection-detector-global、selection-handler-global、selection-toolbar-global、explore-mode-global、core-flow-fix、bookmark-core、bookmark-import-export、bookmark-organize) 应显示为「有测试」
- [ ] 验证 R115 衔接：脚本执行不依赖已被清理的重复测试文件
- [ ] 验证 R116 衔接：Top-10 排行中 `knowledge-base.js` 行数应 ≤400（已被拆分）

---

## 四、技术约束

### 4.1 实现约束

| 约束 | 原因 |
|------|------|
| **纯 Bash 实现** | 与 `iteration-engine.sh`、`build.sh` 保持一致的技术栈，零依赖 |
| **不引入外部工具** | 仅使用 `bash`、`wc`、`sort`、`grep`、`awk`、`sed`、`npx eslint` 等项目已有工具 |
| **执行时间 ≤ 30 秒** | ESLint 是最慢的环节（当前约 10-15 秒），总耗时不应超过 30 秒 |
| **HTML 报告自包含** | 所有 CSS 内联，不引用外部样式表或 CDN 资源 |
| **向后兼容** | 脚本可独立运行，不强制依赖 `iteration-engine.sh` 的调用环境 |

### 4.2 文件结构

```
scripts/
  health-check.sh          # 主脚本 (新建)

docs/reports/
  health-check-YYYY-MM-DD.md    # Markdown 报告 (生成)
  health-check-YYYY-MM-DD.html  # HTML 报告 (生成)
```

### 4.3 脚本接口设计

```bash
# 基本用法 — 终端输出 + 文件报告
bash scripts/health-check.sh

# 带迭代编号（飞轮引擎调用时传入）
bash scripts/health-check.sh --iteration R14

# 静默模式（仅生成文件，不输出终端摘要）
bash scripts/health-check.sh --quiet

# 输出目录指定（默认 docs/reports/）
bash scripts/health-check.sh --output-dir /tmp/health
```

### 4.4 健康评分算法

```
总分 = 测试覆盖分 × 40% + ESLint 健康分 × 30% + 模块大小分 × 30%

测试覆盖分 = 覆盖率 × 100  (如 69.4% → 69.4 分)
ESLint 健康分 = max(0, 100 - error数×10 - warning数×0.1)
模块大小分 = max(0, 100 - 超标模块数×15)  (超标 = >400行)
```

---

## 五、依赖关系

### 5.1 上游依赖（已完成）

| 迭代 | 依赖内容 | 状态 |
|------|---------|------|
| **R113** | ESLint CI 命令格式修复 (`eslint . --max-warnings 10000`) | ✅ 已合并 |
| **R114** | 15 个模块补充了单元测试 | ✅ 已合并 |
| **R115** | 测试套件瘦身（减少 ~30% 测试文件） | ✅ 已合并 |
| **R116** | 大模块拆分（knowledge-base.js 等拆为 ≤400 行子模块） | ✅ 已合并 |

### 5.2 下游影响

| 组件 | 影响 |
|------|------|
| **iteration-engine.sh** | Phase 5 (回顾) 可调用 `health-check.sh --quiet` 自动生成报告附件 |
| **docs/reports/** | 新增健康检查报告文件，丰富迭代报告体系 |
| **CI/CD** | 后续可将健康评分接入质量门控（如评分 < 60 标红） |

### 5.3 无依赖项

- 不依赖 R117 之后的任何迭代任务
- 不依赖外部 npm 包或浏览器环境
- 不修改任何现有文件（纯新增脚本）

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| ESLint JSON 输出格式在版本升级后变化 | 低 | 中 | 使用 `--format json` 标准格式，解析时做防御性 null 检查 |
| 模块行数统计包含注释/空行 | 高 | 低 | 明确约定：行数统计包含所有行（含空行和注释），与 `wc -l` 行为一致 |
| R116 拆分后新增模块无测试文件 | 中 | 中 | AC-1 明确覆盖拆分后的新模块，报告中突出显示 |
| 历史报告文件不存在导致趋势分析失败 | 中 | 低 | AC-2 要求处理「首次运行」场景 |

---

## 七、非目标 (Out of Scope)

以下功能**不在本次迭代范围内**，避免范围蔓延：

1. ❌ 不重构 `iteration-engine.sh` 的回顾阶段逻辑（仅在文档中标注可调用点）
2. ❌ 不自动提交报告到 Git（保持脚本职责单一）
3. ❌ 不生成测试用例数统计（属于 R115 的范畴，已清理）
4. ❌ 不生成代码覆盖率报告（需要 c8 instrumented 运行，耗时 > 60s）
5. ❌ 不提供 Web Dashboard（HTML 报告是静态文件，足够满足需求）

---

## 八、验收场景示例

### 场景 1: 首次运行

```bash
$ bash scripts/health-check.sh

=== PageWise Health Check ===
时间: 2026-05-19

📋 测试覆盖空白: 41/134 模块无测试 (覆盖率: 69.4%)
   未覆盖 Top-5:
   1. bookmark-organize.js        — 806 行
   2. bookmark-store-prep.js      — 655 行
   3. bookmark-knowledge-link.js  — 643 行
   ...

⚠️  ESLint: 2 errors / 633 warnings (首次运行，无历史基准)
   Top-5 规则: no-unused-vars(520), eqeqeq(98), no-undef(15)

📊 模块行数 Top-10:
   1. bookmark-graph.js      — 1096 行 ⚠️
   2. knowledge-panel.js     —  907 行 ⚠️
   ...

🏆 健康评分: 58/100 (测试 27.8 + ESLint 36.7 + 模块 30.0)

报告已保存:
  docs/reports/health-check-2026-05-19.md
  docs/reports/health-check-2026-05-19.html
```

### 场景 2: 飞轮引擎自动调用

```bash
$ bash scripts/health-check.sh --iteration R14 --quiet
# 无终端输出，仅生成文件
# 返回码: 0 (健康评分 ≥ 60) 或 1 (健康评分 < 60)
```

---

## 九、需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R117 | 新建健康检查报告需求 |

---

*生成于 2026-05-19 | Plan Agent | 飞轮迭代 R14*
