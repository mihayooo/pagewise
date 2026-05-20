# VERIFICATION.md — Iteration #34 Review

> 任务: R192 CoverageInfraFixR190
> 审查日期: 2026-05-20
> 审查员: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | AC-4 未实现：覆盖率门禁阈值为 20%（需求要求 75%），root-owned 残留目录未清理 |
| 代码质量 | ✅ | 配置变更有据可查，脚本逻辑清晰，设计文档完整 |
| 测试覆盖 | ⚠️ | 23 用例全通过，但测试将 20% 阈值写为"合理"（D-R192-c 决策），与需求矛盾未在测试中体现 |
| 文档同步 | ❌ | CHANGELOG.md 未记录 R192 变更；TODO.md R192 未勾选完成 |

---

## 发现的问题

### 🔴 P0 — AC-4 未满足：覆盖率门禁阈值 20% vs 需求要求 75%

**需求 (REQUIREMENTS-ITER34.md AC-4)**:
> `.github/workflows/ci.yml` 中 `Coverage gate` 步骤的行覆盖率阈值从当前 **20%** 提升至 **75%**
> `package.json` 中 `coverage:gate` 脚本同步更新为 `c8 check-coverage --lines 75`
> 当行覆盖率 < 75% 时，CI pipeline 标红失败

**实际实现**:
- `package.json`: `coverage:gate` 仍为 `c8 check-coverage --lines 20`
- `.github/workflows/ci.yml`: 步骤名改为 `Coverage gate (lines >= 20%)`

**设计文档 D-R192-c 的解释**: 当前实测行覆盖率仅 22.17%，若门禁设为 75% CI 必然失败，因此门禁"临时设为实际基线值"。

**问题**: 设计文档声称这是有意识的决策，但需求文档 AC-4 未被同步修订。AC 仍然是 75%。这不是"有意识的降级"，而是**需求未满足**。若设计决策合理，必须正式修订需求文档 AC-4 的阈值并注明原因。

### 🔴 P1 — root-owned 残留目录未清理

**需求 (AC-1)**:
> `coverage/` 目录下所有旧的 `root` 所有文件/目录（当前存在 `_tmp_old_stale`、`_tmp_root_stale`）被清理或权限修复

**现状**:
```
drwxr-xr-x 2 root root 12288 May 19 20:09 _tmp_old_stale
drwxr-xr-x 2 root root 16384 May 19 20:24 _tmp_root_stale
```

这些目录仍然存在且仍为 root:root 所有。实现中 `test:coverage` 脚本添加了 `rm -rf coverage/_tmp_*` 清理（下次执行时生效），但本次变更并未执行 `chmod -R u+w coverage/` 或 `rm -rf` 来清理已有残留。

**注意**: `rm -rf` 在父目录（`coverage/`，权限 777）可写时即使子目录为 root 也能删除。因此 `test:coverage` 脚本确实能在下次运行时清理它们。但需求明确要求"当前存在"的目录被清理，这一步骤显然被跳过了。

### 🟡 P2 — CHANGELOG.md 未记录 R192

diff 显示 CHANGELOG.md 仅添加了 R190 的条目，**未包含 R192 的任何变更记录**（test:coverage 脚本更新、c8rc.json reporter 新增 html、CI 门禁步骤名更新等）。

### 🟡 P3 — TODO.md R192 未标记完成

TODO.md 中 R192 仍为 `- [ ]`，未勾选为 `- [x]`。

### 🟡 P4 — 实际行覆盖率 22.17%，与历史声称 ≥80% 严重脱节

`coverage-summary.json` 实测数据:
- **Lines: 22.17%** (10212/46056)
- Branches: 78.35%
- Functions: 49.6%

这与历史声称的 ≥80%（R108: 92.15%, R151: 79.88%）存在巨大差距。设计文档将此归因于 `c8 --all` 统计了所有 lib/ 文件（含未被任何测试覆盖的模块）。这是已知问题，但应在 CHANGELOG 中明确记录为技术债务。

### 🟢 P5 — 测试断言弱化

`test-coverage-infra.js` 第 115-121 行的门禁测试:
```javascript
it('coverage:gate 门禁阈值设置合理（D-R192-c: 临时基线，后续提升至 75%）', () => {
  // ...
  assert.ok(threshold >= 20, `...`)
})
```
断言 `threshold >= 20` 过于宽松——即使阈值设为 0 也会通过。若需求为 75%，断言应为 `threshold >= 75`。

---

## 返工任务清单

| # | 优先级 | 任务 | 说明 |
|---|--------|------|------|
| 1 | 🔴 P0 | 修订需求或实现 75% 门禁 | **选项 A**: 修改 `coverage:gate` 为 `--lines 75`，接受 CI 红灯（当前 22.17%），在 R194 中通过补测试拉升覆盖率；**选项 B**: 正式修订 REQUIREMENTS-ITER34.md AC-4 将 75% 改为 20%，注明原因（D-R192-c）并记录为技术债务。当前状态（需求说 75%、实现为 20%）不可接受。 |
| 2 | 🔴 P1 | 执行残留目录清理 | 运行 `rm -rf coverage/_tmp_old_stale coverage/_tmp_root_stale` 清理 root-owned 残留，或在提交说明中记录已在运行时执行 |
| 3 | 🟡 P2 | 更新 CHANGELOG.md | 在 `[Unreleased]` 下添加 R192 变更条目：test:coverage 脚本扩展（_tmp_* 清理 + html reporter）、.c8rc.json reporter 更新、CI 门禁步骤名更新、.gitignore 注释补充 |
| 4 | 🟡 P3 | 更新 TODO.md | 将 R192 的 `- [ ]` 改为 `- [x]`，添加完成备注 |
| 5 | 🟢 P5 | 收紧测试断言 | 若最终门禁确定为 75%，将 `assert.ok(threshold >= 20)` 改为 `assert.ok(threshold >= 75)` |

---

## 逐项验收核对

| AC | 需求 | 状态 | 说明 |
|----|------|------|------|
| AC-1 | EACCES 修复 + 残留清理 | ⚠️ 部分通过 | 脚本已扩展清理路径（`_tmp_*`），但残留目录当前未被清理 |
| AC-2 | 三种格式报告生成 | ✅ 通过 | lcov + text-summary + html 均已配置；lcov.info 和 index.html 文件存在 |
| AC-3 | 行覆盖率基线确认 | ⚠️ 部分通过 | 基线已确认为 22.17%，但远低于需求的 ≥80%；设计文档有记录 |
| AC-4 | CI 门禁 ≥75% | ❌ 未通过 | 阈值为 20%，与需求 75% 不一致 |
| AC-5 | .gitignore 注释 | ✅ 通过 | 注释已补充，内容清晰 |

---

## 测试结果

| 指标 | 值 |
|------|-----|
| 测试文件 | tests/test-coverage-infra.js |
| 总用例 | 23 |
| 通过 | 23 |
| 失败 | 0 |
| 耗时 | ~230ms |

所有测试通过，但测试本身未验证 AC-4 的 75% 阈值要求（断言仅检查 >= 20%）。

---

## 总结

R192 的核心基础设施修复（清理路径扩展、html reporter、.gitignore 注释）实现质量良好，测试覆盖充分。但存在两个关键未决问题：

1. **覆盖率门禁阈值**：需求要求 75%，实现为 20%，且需求文档未同步修订——这是需求-实现不一致，必须二选一解决。
2. **残留目录清理**：root-owned 目录仍在磁盘上，虽脚本已防止复发，但需求要求的即时清理未执行。

建议：在合并前修复 P0（二选一）和 P1，并补充 P2/P3 的文档同步。

---

*审查完成于 2026-05-20*
