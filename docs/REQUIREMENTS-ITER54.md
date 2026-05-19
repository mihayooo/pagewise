# 需求文档 — R156: 覆盖率基础设施修复

> 迭代: R54 | 创建日期: 2026-05-19 | 复杂度: Simple

---

## 1. 用户故事

作为 **PageWise 维护者**，我希望 `npm run test:coverage` 能可靠地生成覆盖率报告，以便 CI 流水线具备覆盖率质量门禁，防止测试覆盖回退。

---

## 2. 现状分析

### 2.1 问题现象

| 指标 | 值 |
|------|-----|
| 命令 | `npm run test:coverage` |
| 错误 | `EACCES: permission denied, unlink 'coverage/tmp/coverage-*.json'` |
| 根因 | `coverage/tmp/` 目录及内部文件由 `root` 创建（`drwxr-xr-x root:root`，文件 `-rw------- root:root`），当前用户 `claude-user` 无权删除 |
| 影响 | c8 无法清理上次运行的临时覆盖率数据，导致整个覆盖率报告生成失败 |

### 2.2 详细根因

| 层面 | 说明 |
|------|------|
| `coverage/tmp/` 目录 | owner = `root`，权限 `755`（目录可进入但文件不可写） |
| `coverage/tmp/*.json` 文件 | owner = `root`，权限 `600`（仅 root 可读写） |
| c8 行为 | 每次运行前尝试 `unlink` tmp 下旧 JSON 文件，因权限不足而抛出 EACCES |
| `.c8rc` 配置 | 未指定自定义 `tmpDir`，c8 默认使用 `coverage/tmp/` |
| `.gitignore` | 已排除 `coverage/`，但本地残留的 root-owned 文件不受 git 管控 |

### 2.3 CI 现状

| CI 任务 | 覆盖率相关 | 门禁 |
|---------|-----------|------|
| `lint` | 无 | ESLint 有门禁 |
| `test` | 仅运行测试，不生成覆盖率报告 | 无覆盖率门禁 |
| `package-check` | 无 | 仅检查包体积 |

**结论**: CI 完全没有覆盖率报告生成和质量门禁，即使本地修复了权限问题，覆盖率回退也不会被捕获。

---

## 3. 验收标准

| # | 验收标准 | 验证方法 |
|---|---------|---------|
| AC-1 | `npm run test:coverage` 成功执行，无 EACCES 错误，生成 `coverage/lcov.info` 和终端 `text-summary` 输出 | 执行命令，检查 exit code = 0 且 `coverage/lcov.info` 文件存在且非空 |
| AC-2 | `coverage/tmp/` 中不再残留 root-owned 文件；引入清理机制防止同类问题复发 | `find coverage/tmp -user root` 返回空；检查是否有 preflight 清理或自定义 tmpDir |
| AC-3 | 行覆盖率基线 ≥ 80% | `text-summary` 输出中 `Lines` 行百分比 ≥ 80% |
| AC-4 | CI 流水线新增覆盖率报告生成 + 门禁：行覆盖率 < 80% 则 pipeline 失败 | Push 一个降低覆盖率的 commit 观察 CI 是否 fail；提交正常代码 CI pass |
| AC-5 | 全量测试回归无新增失败（`npm run test:ci` 通过率不变） | 执行测试套件，通过数/总数与修复前一致 |

---

## 4. 技术约束

### 4.1 修复方案

按优先级排序：

1. **方案 A（推荐）: 清理 root 残留 + preflight 脚本 + 自定义 tmpDir**
   - 手动/脚本清理 `coverage/tmp/` 中的 root-owned 文件（`sudo rm -rf coverage/tmp` 或 `sudo chown -R $(whoami) coverage/`）
   - 在 `package.json` 的 `test:coverage` 脚本中添加 preflight 清理步骤：`rm -rf coverage/tmp`，确保每次运行前 tmp 目录干净
   - 在 `.c8rc` 中显式设置 `tmpDir` 为 `coverage/tmp`（明确路径，方便维护）

2. **方案 B: 全局清理 + 重建**
   - `rm -rf coverage/` 删除整个目录，让 c8 从零创建
   - 配合 preflight 脚本防止复发
   - 风险最低，但丢失历史覆盖率数据（本项目不需要保留）

### 4.2 CI 门禁实现

- 在 `.github/workflows/ci.yml` 的 `test` job 中，**在测试步骤之后**追加覆盖率步骤：
  - 运行 `npm run test:coverage`
  - 解析 `text-summary` 输出或 `coverage/lcov.info`，提取行覆盖率百分比
  - 若 < 80%，`exit 1` 使 pipeline 失败
- **建议方式**: 使用 `c8 check-coverage` 子命令（`c8 check-coverage --lines 80`），c8 原生支持门禁检查，无需额外解析逻辑

### 4.3 禁止事项

- **不得修改 c8 的 include/exclude 规则** — 覆盖范围由 `.c8rc` 已定义（`lib/**/*.js`，排除 pdf worker 等），本次不变更
- **不得为了过门禁而编写无意义的测试** — 80% 基线是底线，后续迭代 R52 已冲刺到 80%+，本次仅确保不回退
- **不得引入新的 npm 依赖** — c8 自带 `check-coverage` 命令，无需额外工具

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| c8 v10.x | 已有依赖 | `package.json` 已声明 `c8: ^10.1.3`，支持 `check-coverage` 命令 |
| `.c8rc` 配置文件 | 已有 | 已定义 include/exclude/reporter，本次可能添加 `tmpDir` 配置 |
| `.github/workflows/ci.yml` | 已有 | 需修改以添加覆盖率 job |
| `npm run test:ci` | 已有 | 覆盖率依赖测试套件正常通过 |
| R52 覆盖率冲刺（80%+）| 前置完成 | 行覆盖率已在 R52 迭代中达到 80.24%，本次修复基础设施使之可验证 |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CI 环境无 root 权限清理本地残留 | 不适用 | — | CI 是全新环境，不存在此问题；仅本地开发机受影响 |
| preflight `rm -rf` 误删其他文件 | 极低 | 低 | 仅清理 `coverage/tmp` 而非整个 `coverage/` |
| 80% 门禁在某些 PR 中过于严格 | 低 | 低 | 仅检查行覆盖率，函数覆盖率不设硬门禁；R52 已达 80.24% 基线 |
| c8 `check-coverage` 与 node --test 的 exit code 冲突 | 极低 | 中 | 测试步骤与门禁步骤分开，先确保测试通过再检查覆盖率 |

---

## 7. 预估工作量

| 阶段 | 工作项 | 预估 |
|------|--------|------|
| 清理 | `sudo rm -rf coverage/tmp` 清理 root 残留 | ~1 min |
| 修复 | `package.json` 添加 preflight 清理 + `.c8rc` 配置 tmpDir | ~5 min |
| 验证 | 本地运行 `npm run test:coverage` 确认报告生成 + 覆盖率 ≥80% | ~5 min |
| CI | 修改 `ci.yml` 添加 coverage job + `c8 check-coverage --lines 80` | ~10 min |
| 回归 | `npm run test:ci` 确认全量测试无回退 | ~5 min |
| **合计** | | **~26 min** |

---

## 8. 变更范围预估

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `package.json` | 修改 | `test:coverage` 脚本添加 preflight `rm -rf coverage/tmp` |
| `.c8rc` | 可能修改 | 添加 `tmpDir` 明确路径（可选，增强可维护性） |
| `.github/workflows/ci.yml` | 修改 | 新增 `coverage` job 或在 `test` job 中追加覆盖率步骤 |
| `coverage/tmp/` | 清理 | 删除 root-owned 残留文件 |

---

> 文档生成: Plan Agent | 基于实测 `npm run test:coverage` 错误输出 + 项目现状分析 (2026-05-19)
