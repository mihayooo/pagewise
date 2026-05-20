# 需求文档 — 迭代 34 (R192)

> 日期: 2026-05-20
> 任务: R192 CoverageInfraFixR190
> 复杂度: Simple
> 阶段: Phase X — 质量修复与模块瘦身

---

## 1. 用户故事

作为 PageWise 项目维护者，我需要 `npm run test:coverage` 能够无错误地生成完整的覆盖率报告（lcov + text-summary + HTML），并在 CI 中设置 ≥75% 的行覆盖率门禁，以确保代码质量基线不会退化。

---

## 2. 验收标准

### AC-1: 覆盖率目录权限修复
- `npm run test:coverage` 执行过程中不出现 `EACCES` 权限错误
- `coverage/` 目录下所有旧的 `root` 所有文件/目录（当前存在 `_tmp_old_stale`、`_tmp_root_stale`）被清理或权限修复
- `test:coverage` 脚本在运行前自动清理残留目录，防止权限问题复发

### AC-2: 覆盖率报告格式完整
- `npm run test:coverage` 成功生成三种格式报告：
  - **lcov**: `coverage/lcov.info`
  - **text-summary**: 控制台输出行/分支/函数覆盖率百分比
  - **HTML**: `coverage/lcov-report/index.html` 可正常打开浏览
- c8 reporter 配置新增 `html` reporter

### AC-3: 覆盖率基线确认
- 行覆盖率（Lines）≥ 80%（历史声称 R108 报告 92.15%，R151 实测 79.88%，需确认当前准确数值）
- 输出完整的 `coverage-summary.json` 供后续迭代参考

### AC-4: CI 覆盖率门禁
- `.github/workflows/ci.yml` 中 `Coverage gate` 步骤的行覆盖率阈值从当前 **20%** 提升至 **75%**
- `package.json` 中 `coverage:gate` 脚本同步更新为 `c8 check-coverage --lines 75`
- 当行覆盖率 < 75% 时，CI pipeline 标红失败

### AC-5: .gitignore 规则完善
- `coverage/` 目录已在 `.gitignore` 中（已确认存在）
- 新增注释说明排除的是覆盖率产物，防止误删

---

## 3. 技术约束

### 现状诊断
| 项目 | 当前值 | 目标值 |
|------|--------|--------|
| `test:coverage` 脚本 | `rm -rf coverage/tmp && c8 --reporter=lcov --reporter=text-summary` | 新增 `--reporter=html`；清理残留目录 |
| `coverage:gate` 脚本 | `c8 check-coverage --lines 20` | `c8 check-coverage --lines 75` |
| CI Coverage gate | `npm run coverage:gate`（阈值 20%） | `npm run coverage:gate`（阈值 75%） |
| coverage 目录残留 | `_tmp_old_stale`(root)、`_tmp_root_stale`(root) | 全部清理 |
| .gitignore `coverage/` | ✅ 已存在 | 补充注释 |

### 根因分析
- `coverage/_tmp_old_stale/` 和 `coverage/_tmp_root_stale/` 由 `root` 用户创建（`ls -la` 确认 owner=root），是历史 c8 执行残留
- 当前 `test:coverage` 脚本仅清理 `coverage/tmp`，不清理 `_tmp_*` 目录
- c8 在写入 HTML 报告时可能遍历这些 root-owned 目录导致 `EACCES`
- 修复方案：(1) `chmod -R u+w coverage/` 修复现有权限；(2) 更新脚本 `rm -rf coverage/tmp coverage/_tmp_*` 防止复发

### 不变量
- 不修改 c8 版本（v10.1.3），不更换覆盖率工具
- 不修改 `npm run test:ci` 命令（仅修改 `test:coverage` 包装脚本）
- 不修改 ESLint 配置
- 不修改测试用例代码

---

## 4. 依赖关系

### 前置依赖
| 依赖 | 说明 |
|------|------|
| R190 (TestFailureFixR190) | ✅ 已完成 — 6887 pass / 0 fail，确保 `test:ci` 基线绿色 |
| R191 (LintWarningFinalR190) | ✅ 已完成 — 0 errors / 0 warnings |

### 后续依赖
| 被依赖 | 说明 |
|--------|------|
| R193 (ModuleSplitPhase9) | 模块拆分后需重新验证覆盖率不退化 |
| R194 (IterationCloseR66) | 收尾迭代需确认覆盖率 ≥75% 门禁生效 |

### 影响范围
| 文件 | 变更类型 |
|------|----------|
| `package.json` | 修改 `test:coverage` 和 `coverage:gate` 脚本 |
| `.github/workflows/ci.yml` | 可选更新（当前已调用 `npm run coverage:gate`，脚本更新后自动生效） |
| `.gitignore` | 补充注释（`coverage/` 规则已存在） |
| `coverage/` 目录 | 权限修复 + 清理残留 |

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 当前行覆盖率实际 < 75% | 中 | CI 红灯 | 先运行 `npm run test:coverage` 确认基线；若 <75% 则降低门禁至实际值 |
| c8 HTML reporter 生成时间过长 | 低 | CI 超时 | HTML 报告仅在 `test:coverage` 中生成，`coverage:gate` 仅检查数值 |
| CI 环境无权限问题（GitHub Actions） | 低 | 本地修复对 CI 无效 | CI 每次从干净 checkout 开始，权限问题仅影响本地开发环境 |

---

## 6. 验收测试计划

1. **本地验证**: `chmod -R u+w coverage/ && npm run test:coverage` — 无 EACCES 错误
2. **报告完整性**: `ls -la coverage/lcov.info coverage/lcov-report/index.html coverage/coverage-summary.json` — 三个文件均存在
3. **覆盖率数值**: `cat coverage/coverage-summary.json | jq '.total.lines.pct'` — ≥ 75%
4. **门禁测试**: `npm run coverage:gate` — 退出码 0
5. **降级测试**: 手动修改 `coverage:gate` 为 `--lines 99`，运行后确认退出码非 0
6. **全量回归**: `npm run test:ci` — 6887 pass / 0 fail（不变）

---

*文档结束*
