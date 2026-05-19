# R44: 全量回归与发布候选 ReleaseCandidate2

> 版本: v3.1.0-rc2  
> 日期: 2026-05-19  
> 复杂度: Simple  
> 依赖: R143-R146 (v3.0.0 之后的 4 轮质量加固迭代)

---

## 1. 用户故事

作为 PageWise 的发布管理者，我需要在 R143-R146 四轮质量加固迭代（测试修复、Lint 清零、模块拆分、函数覆盖率提升）全部合并后，执行一次完整的全量回归验证，并补齐 CHANGELOG 变更记录，以输出可交付的 v3.1.0 发布候选版本。

作为 PageWise 的用户，我需要确认这个发布候选版本在所有自动化质量门禁（测试、Lint、覆盖率）上均达标，确保新版本不会引入回归缺陷。

---

## 2. 验收标准

### AC-1: 全量测试回归 — 0 fail
- 执行 `npm run test:ci` 全量回归测试
- **必须**: 测试通过数 ≥5500（参照 W20 周报 5857 基线，允许 R145 模块拆分导致少量用例结构变动）
- **必须**: 测试失败数 = 0
- **必须**: 测试退出码 = 0
- 输出完整测试统计（通过/失败/跳过/总套件数）

### AC-2: Lint 质量门禁 — 0 errors 0 warnings
- 执行 `npm run lint`
- **必须**: 错误数 = 0
- **必须**: 警告数 = 0（R144 已将 max-warnings 收紧，验证无新增）
- **必须**: 退出码 = 0

### AC-3: 覆盖率报告达标
- 执行 `npm run test:coverage`（c8 插桩 + lcov + text-summary）
- **必须**: 行覆盖率 (Lines) ≥ 90%（R142 后基线 93.02%）
- **必须**: 函数覆盖率 (Functions) ≥ 60%（R146 目标从 40.77% 提升至 ≥65%，此处取发布门禁阈值 60%）
- 输出覆盖率 summary 表，附到发布报告

### AC-4: CHANGELOG.md 补充 R143-R146 变更记录
- 在 CHANGELOG.md 中 `## [3.0.0]` 之上新增 `## [3.1.0] - 2026-05-19` 章节
- 必须覆盖以下 4 项变更（参照迭代报告 docs/reports/）：
  - **R143 TestFailureBatchFix3**: 修复 23 个失败用例（AIClient vision 格式 7 个、EvolutionEngine 行为漂移 10 个、BookmarkVisualizer 半径 1 个、BookmarkSemanticSearch 去重 1 个、mergeIngestStats 边界 1 个、data URL 图片 3 个）
  - **R144 LintFinalSweep**: 修复 1 个 parsing error（特殊字符）、清理 113 个 no-unused-vars 警告、收紧 max-warnings 策略
  - **R145 ModuleSplitPhase5**: 拆分 5 个 >530 行超大模块（bookmark-learning-progress、wiki-query、bookmark-tag-editor-v2、bookmark-knowledge-integration、message-renderer），每文件 ≤400 行，re-export 向后兼容
  - **R146 FunctionCoverageBoost**: 函数覆盖率从 40.77% 提升至 ≥65%，补充 Top-20 未覆盖函数的测试
- 格式遵循 Keep a Changelog 规范，分类为 `修复` / `变更` / `测试`

### AC-5: 发布候选版本标记
- package.json version 字段更新为 `3.1.0-rc2`（或提交 message 标注 RC2）
- 输出发布候选报告到 `docs/RELEASE-NOTES-v3.1.0-rc2.md`，包含：
  - 版本号、日期、变更摘要
  - 质量门禁结果（测试通过数、Lint 结果、覆盖率数字）
  - 与 v3.0.0 的对比亮点

---

## 3. 技术约束

| 约束项 | 说明 |
|--------|------|
| 测试框架 | Node.js 内置 test runner (`node --test`)，零外部依赖 |
| 覆盖率工具 | c8 v10.x（lcov + text-summary reporter） |
| Lint 工具 | ESLint v9.x (`eslint . --max-warnings 10000`，实际目标 0 warnings) |
| 模块系统 | ES Modules (`"type": "module"`) |
| 无构建步骤 | 纯 JS，不引入 TypeScript / Webpack / Rollup |
| 运行环境 | Node.js（测试），Chrome Extension Manifest V3（运行时） |
| CHANGELOG 格式 | [Keep a Changelog](https://keepachangelog.com/zh-CN/) 中文版 |
| 版本号语义 | [Semantic Versioning](https://semver.org/)，RC 后缀 `-rc2` |
| Git 规范 | 提交 message 包含迭代编号（R147）和中文描述 |

---

## 4. 依赖关系

### 上游依赖（已完成）
| 迭代 | 任务 | 状态 | 影响 |
|------|------|------|------|
| R40 (R143) | TestFailureBatchFix3 | ✅ | 测试 0 fail 的前提 |
| R41 (R144) | LintFinalSweep | ✅ | Lint 0 warnings 的前提 |
| R42 (R145) | ModuleSplitPhase5 | ✅ | 模块拆分后需回归验证兼容性 |
| R43 (R146) | FunctionCoverageBoost | ✅ | 函数覆盖率数据的来源 |

### 下游产物（本迭代输出）
| 产物 | 用途 |
|------|------|
| `docs/RELEASE-NOTES-v3.1.0-rc2.md` | 发布候选说明文档 |
| `CHANGELOG.md` 更新 | v3.1.0 变更记录 |
| `package.json` version 字段 | RC 版本标识 |
| 覆盖率报告 (text-summary) | 质量门禁证据 |

### 风险项
1. **R145 模块拆分可能引入回归**: re-export 模式若不完整会导致测试 import 失败 → AC-1 覆盖
2. **R146 新增测试可能不稳定**: 函数覆盖率测试若依赖执行顺序可能 flaky → AC-1 多次运行验证
3. **c8 对 ESM 动态 import 覆盖盲区**: R142 已标记部分模块，覆盖率可能略低于实际 → 记录排除模块清单

---

## 5. 执行计划

| 步骤 | 命令 | 预期结果 |
|------|------|----------|
| 1. Lint 检查 | `npm run lint` | 0 errors, 0 warnings |
| 2. 全量测试 | `npm run test:ci` | ≥5500 pass, 0 fail |
| 3. 覆盖率报告 | `npm run test:coverage` | Lines ≥90%, Functions ≥60% |
| 4. 更新 CHANGELOG | 编辑 CHANGELOG.md | 新增 v3.1.0 章节 |
| 5. 更新版本号 | 编辑 package.json | `"version": "3.1.0-rc2"` |
| 6. 输出 RC 报告 | 创建 RELEASE-NOTES-v3.1.0-rc2.md | 包含全部质量门禁数据 |

---

*文档生成于 2026-05-19*  
*飞轮迭代 R44 — 需求阶段*
