# 需求文档 — 迭代 39: 版本号统一与 CHANGELOG 补全

> 任务编号: R197
> 迭代编号: ITER39
> 日期: 2026-05-20
> 复杂度: Simple
> 优先级: P0（阻塞发布流程）

---

## 1. 背景与问题

当前项目存在严重的版本号不一致问题：

| 文件 | 当前版本 | 说明 |
|------|---------|------|
| `package.json` | `1.0.0` | ⚠️ 严重滞后，未反映 R93-R196 的 100+ 轮飞轮迭代 |
| `manifest.json` | `3.0.0` | ✅ 已于 2026-05-16 里程碑更新 |
| `CHANGELOG.md` | `[3.0.0] - 2026-05-16` | ⚠️ 无 3.0.0 之后的增量变更记录 |

R93-R196 期间完成了大量实质性变更（模块拆分十期、覆盖率基础设施修复、测试失败批量修复、ESLint 多轮清零），但均未记录在 CHANGELOG 中，导致发布流程缺乏可追溯性。

---

## 2. 用户故事

**作为** PageWise 项目的维护者 / 发布工程师，
**我希望** 所有版本元数据（package.json、manifest.json、CHANGELOG.md）保持一致且完整记录增量变更，
**以便** 任何团队成员（或自动化 CI 流程）都能准确判断当前发布版本及历史变更内容。

---

## 3. 验收标准

### AC-1: package.json 版本号更新为 3.1.0
- [ ] `package.json` 的 `version` 字段从 `"1.0.0"` 更新为 `"3.1.0"`
- [ ] 版本号采用语义化版本（SemVer）：`MAJOR.MINOR.PATCH`
  - `3` = 与 `manifest.json` 里程碑版本对齐
  - `1` = 反映 R93-R196 的增量功能迭代（模块拆分、基础设施修复、质量提升）
  - `0` = 无破坏性变更（breaking change）

### AC-2: CHANGELOG.md 补充 [3.1.0] 区段
- [ ] 在 `CHANGELOG.md` 顶部（`[3.0.0]` 之前）插入 `[3.1.0] - 2026-05-20` 区段
- [ ] 区段格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 规范
- [ ] 内容涵盖以下变更分类：

#### 变更内容（R93-R194 摘要）

**架构（Architecture）**
- 超大模块拆分九期（R193）：拆分 6 个 >530 行的 lib 文件至 ≤400 行（bookmark-knowledge-packs、bookmark-weekly-digest、bookmark-highlight-archive、bookmark-knowledge-integration、message-renderer、bookmark-user-profile），保持 API 向后兼容（re-export 模式）

**修复（Fixed）**
- 覆盖率基础设施修复（R192）：修复 coverage 目录权限 EACCES 导致 HTML 报告生成失败；添加 .gitignore 规则排除旧报告；CI 新增行覆盖率 <75% 门禁
- 测试失败批量修复：修复 R190 系列测试断言失败（BookmarkBackup 序列化结构变更、LRU 缓存边界断言、模块拆分验证断言等）

**质量（Quality）**
- ESLint 警告清零：多轮清理 no-unused-vars 警告（R191 系列），收紧 no-unused-vars 规则为 `error`

### AC-3: manifest.json 版本一致性
- [ ] `manifest.json` 的 `version` 字段确认为 `"3.1.0"`（与 package.json 一致）
- [ ] 验证 `manifest.json` 仍为合法 JSON（无语法错误）
- [ ] 验证 `manifest_version: 3` 未被意外修改

### AC-4: 迭代报告
- [ ] 创建 `docs/reports/2026-05-20-R39.md` 迭代报告
- [ ] 报告包含：轮次、任务、飞轮迭代流程各阶段状态
- [ ] 报告反映本次版本同步的实际执行结果

### AC-5: 无功能回归
- [ ] `npm run test:ci` 全量测试 0 fail
- [ ] `npm run lint` 无新增错误
- [ ] 版本号变更不引入任何功能性代码变更（纯元数据更新）

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 语义化版本 | 版本号必须遵循 SemVer 2.0.0 规范 |
| Keep a Changelog | CHANGELOG 格式遵循 Keep a Changelog 规范，使用中文描述 |
| 零功能变更 | 本次迭代仅修改元数据文件，不包含任何功能性代码变更 |
| 向后兼容 | 3.1.0 相对 3.0.0 无破坏性变更 |
| 三文件同步 | package.json、manifest.json、CHANGELOG.md 三处版本必须一致 |
| manifest.json 合法性 | manifest.json 必须通过 JSON 语法校验（Chrome Web Store 提交前置条件） |

---

## 5. 依赖关系

### 前置依赖（已满足）
| 依赖项 | 状态 | 说明 |
|--------|------|------|
| R193 模块拆分九期 | ✅ 已完成 | commit `ab19f6b` |
| R192 覆盖率基础设施修复 | ✅ 已完成 | commit `cb539ea` |
| R196 模块拆分十期 | ✅ 已完成 | commit `5ae1c37` |

### 被依赖（后续迭代）
| 依赖方 | 说明 |
|--------|------|
| Chrome Web Store 发布流程 | manifest.json 版本必须正确才能提交新版本 |
| CI/CD 版本门禁 | 如未来添加版本一致性校验脚本，依赖三文件同步 |
| R198+ 后续迭代 | 后续迭代的 CHANGELOG 条目将追加在 3.1.0 之后 |

### 无外部依赖
- 不依赖任何 npm 包更新
- 不依赖 Chrome API 变更
- 不依赖外部服务

---

## 6. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | `version: "1.0.0"` → `"3.1.0"` |
| `manifest.json` | 修改 | `version: "3.0.0"` → `"3.1.0"` |
| `CHANGELOG.md` | 修改 | 顶部插入 `[3.1.0] - 2026-05-20` 区段 |
| `docs/reports/2026-05-20-R39.md` | 新建 | 迭代报告 |

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CHANGELOG 遗漏关键变更 | 中 | 低 | 基于 git log 逐条核实 R93-R196 提交 |
| manifest.json 校验失败 | 低 | 高 | 修改后运行 `JSON.parse()` 校验 |
| 测试意外失败 | 低 | 中 | 纯元数据变更，不影响运行时逻辑 |

---

## 8. 不包含（Out of Scope）

- 不回溯补充 R93-R196 每轮迭代的独立 CHANGELOG 条目（仅按分类汇总）
- 不修改 `docs/REQUIREMENTS.md` 的版本标记
- 不创建 Git tag（由后续发布流程统一处理）
- 不更新 `package-lock.json`（版本号变更不触发 lock 文件更新）
