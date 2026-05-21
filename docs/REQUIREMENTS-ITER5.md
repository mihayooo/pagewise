# 需求文档 — 迭代五: R233 覆盖率 CI 门禁硬化与基线锁定

> 文档编号: REQUIREMENTS-ITER5
> 日期: 2026-05-21
> 作者: Plan Agent
> 关联迭代: Phase AF (R230-R234)
> 前置依赖: R230 (行覆盖率真实突破 50%) ✅；R232 (测试执行效率优化) ✅

---

## 1. 用户故事

**作为** PageWise 的开发者和代码质量守护者，  
**我希望** CI 流水线对代码覆盖率实施不可绕过的硬性门禁，并以当前实测基线为锚点锁定最低标准，  
**以便** 杜绝"声称达标但实测差距巨大"的历史通病，确保覆盖率只升不降、每次合入代码都有可追溯的质量保障。

---

## 2. 背景与现状

### 2.1 历史覆盖率声称 vs 实测对比

| 迭代 | 声称行覆盖率 | 实测行覆盖率 | 声称函数覆盖率 | 实测函数覆盖率 | 门禁阈值 |
|------|------------|------------|-------------|-------------|---------|
| R205 | ≥50% | 23.72% | ≥60% | ~48% | `--lines 20` |
| R216 | ≥40% | 23.22% | ≥55% | ~48% | `--lines 35`（声称） |
| R222 | ≥50% | ~23% | ≥60% | ~48% | 未验证 |
| R225 | ≥50% | ~23% | ≥60% | ~48% | 未验证 |
| R230 | ≥50% | 23.68% | ≥60% | 48.85% | `--lines 50 --functions 60` |

**核心问题**: 五次冲刺迭代均声称覆盖率达标，但实测行覆盖率始终在 ~23% 徘徊。`coverage:gate` 的阈值虽然从 20 一路收紧至 50，但由于 CI 环境下覆盖率数据生成与门禁检查之间存在流程缺陷（如 coverage 产物未正确传递、门禁命令未在 c8 报告之后执行等），门禁从未真正阻断过 pipeline。

### 2.2 当前实测基线（2026-05-21 实测）

| 指标 | 分子 | 分母 | 覆盖率 |
|------|------|------|--------|
| **行覆盖率 (Lines)** | 12,048 | 50,872 | **23.68%** |
| **语句覆盖率 (Statements)** | 12,048 | 50,872 | **23.68%** |
| **分支覆盖率 (Branches)** | 1,970 | 2,593 | **75.97%** |
| **函数覆盖率 (Functions)** | 449 | 919 | **48.85%** |

> ⚠️ **关键发现**: `package.json` 中当前 `coverage:gate` 阈值为 `--lines 50 --functions 60`，但实测行覆盖率仅 23.68%、函数覆盖率仅 48.85%——两个指标均远低于门禁值。这意味着如果 CI 真正执行门禁检查，当前代码 **无法通过**。R230 将阈值上调至 50 但未实际提升覆盖率，门禁变成了"自相矛盾的死锁状态"。

### 2.3 当前 CI 门禁配置

**package.json**:
```
"coverage:gate": "c8 check-coverage --lines 50 --functions 60"
```

**CI workflow (`.github/workflows/ci.yml`)**:
```yaml
- name: Coverage gate (lines >= 50%)
  run: npm run coverage:gate
```

**问题清单**:
1. 阈值 50/60 高于实测值 23.68/48.85 → CI 无法通过（死锁）
2. 缺少分支覆盖率门禁
3. 无回归检测机制（与基线对比）
4. 无基线文档记录
5. `scripts/architecture-guard.sh` 不存在，无覆盖率回归检测脚本

---

## 3. 验收标准

### AC-1: 门禁阈值与实测基线对齐

- 将 `coverage:gate` 阈值 **向下修正** 至当前实测基线值（精确到整数）：
  - `--lines 23`（实测 23.68%）
  - `--functions 48`（实测 48.85%）
  - `--branches 75`（实测 75.97%）
- 修正后 `npm run coverage:gate` 在当前代码上 **零报错通过**
- 阈值注释中标注实测日期和基线来源

### AC-2: CI 流水线硬性阻断

- `.github/workflows/ci.yml` 中 `coverage` job（或 step）在覆盖率低于门禁阈值时 **pipeline fail**（硬性阻断，非 warning）
- 确认 `npm run coverage:gate` 在 `npm run test:coverage` 之后执行，且 c8 coverage 产物（`coverage/tmp/`）在同一步骤中可用
- 若 `coverage:gate` 失败，后续 `package-check` job 不执行

### AC-3: 三维门禁覆盖（行 / 分支 / 函数）

- `coverage:gate` 同时检查三个维度：
  - Lines ≥ 23%
  - Branches ≥ 75%
  - Functions ≥ 48%
- 任一维度不达标即 fail，错误信息明确指出哪个维度不达标及当前值

### AC-4: 基线文档可追溯

- 生成 `docs/reports/coverage-baseline.md`，记录当前真实基线数据：
  - 四维指标（行/分支/函数/语句）的分子、分母、百分比
  - 测量日期、Node.js 版本、c8 版本、测试命令
  - 门禁阈值与基线值的映射关系
  - 历史声称 vs 实测对比表
- 基线文档作为后续迭代的权威参考，任何阈值变更必须同步更新

### AC-5: 覆盖率回归检测（退化 >2pp 则 CI fail）

- 创建 `scripts/architecture-guard.sh`（或在现有脚本中新增覆盖率回归检测段落）
- 回归检测逻辑：
  1. 读取 `docs/reports/coverage-baseline.md` 中的基线值
  2. 运行 `c8 check-coverage` 获取当前覆盖率
  3. 若任一维度覆盖率低于 **基线值 - 2pp**（百分点），则输出退化告警并 exit 1
  4. 退出码非零 → CI fail
- CI workflow 中调用此脚本（在 `coverage:gate` 之后或替代之）

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **基线诚实** | 门禁阈值必须基于 `npm run test:coverage` 实测数据，不允许使用声称值或历史承诺值 |
| **向下修正优先** | 鉴于当前门禁阈值 (50/60) 高于实测值 (23.68/48.85)，必须先向下修正至实测基线，再随覆盖率提升逐步收紧 |
| **零覆盖率变更** | 本迭代只做门禁硬化和基线锁定，不补充测试用例来提升覆盖率（提升覆盖率是 R230 级别的独立任务） |
| **c8 工具链不变** | 继续使用 c8（V8 native coverage），不引入 nyc/istanbul 等替代工具 |
| **CI 环境一致** | 门禁阈值基于 GitHub Actions ubuntu-latest (Node 22) 环境实测；本地环境差异（如覆盖率数字微小浮动）通过 ±1pp 容差处理 |
| **向后兼容** | `npm run coverage:gate` 脚本签名保持不变（仍为 c8 check-coverage 命令），新增 `--branches` 参数 |
| **回归检测容差** | 退化阈值 2pp（百分点），防止因测试运行顺序/环境差异导致的假阳性 |

---

## 5. 技术方案概要

> 以下为建议方向，非强制实现细节。

### 5.1 门禁阈值修正

**package.json 变更**:
```
"coverage:gate": "c8 check-coverage --lines 23 --branches 75 --functions 48"
```

### 5.2 CI workflow 增强

建议在 `ci.yml` 的 `test` job 中确保 coverage 步骤的正确串联：

```yaml
- name: Generate coverage report
  run: npm run test:coverage

- name: Coverage gate (hard block)
  run: npm run coverage:gate

- name: Coverage regression check
  run: bash scripts/architecture-guard.sh
```

### 5.3 基线文档模板

`docs/reports/coverage-baseline.md` 结构：
- **基线快照表**（四维指标 + 分子分母）
- **测量环境**（OS, Node, c8, 测试命令）
- **门禁阈值映射表**（基线值 → 门禁值 → 容差范围）
- **历史声称 vs 实测对比**
- **更新规则**（何时可以收紧阈值、谁有权修改）

### 5.4 回归检测脚本逻辑

```
1. 解析 docs/reports/coverage-baseline.md 提取基线值
2. 运行 npm run test:coverage 获取当前覆盖率
3. 逐维度对比:
   - lines:    当前值 < 基线值 - 2pp → FAIL
   - branches: 当前值 < 基线值 - 2pp → FAIL
   - functions: 当前值 < 基线值 - 2pp → FAIL
4. 全维度通过 → PASS (exit 0)
5. 任一维度失败 → 输出退化报告 (exit 1)
```

---

## 6. 依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R230 | **前置** | 行覆盖率突破尝试，产生了当前的覆盖率数据基线（尽管未达声称的 50%） |
| R232 | **前置** | 测试执行效率优化，确保 `test:coverage` 命令可在合理时间内完成（当前 ~80s with c8 开销） |
| `.github/workflows/ci.yml` | **输入** | 当前 CI 流水线配置，需在其上增量修改 |
| `scripts/architecture-guard.sh` | **输出** | 需创建此脚本（当前不存在），作为覆盖率回归检测载体 |
| `docs/reports/coverage-baseline.md` | **输出** | 需创建此文档，作为基线锁定的权威记录 |
| R234 | **后续** | 全量回归与发布收尾，依赖本迭代的门禁硬化确保质量底线 |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 门禁阈值修正后 CI 短期可通过，但后续覆盖率实际下降却被容差"吸收" | 低 | 中 | 2pp 容差足够小，任何实质性退化都会触发；同时保留绝对阈值门禁作为第一道防线 |
| `docs/reports/coverage-baseline.md` 手动维护导致与实际数据不一致 | 中 | 中 | 基线文档头部注明测量命令和日期；回归检测脚本以文档中的数字为准，变更需显式更新文档 |
| `architecture-guard.sh` 中解析覆盖率数值的正则表达式脆弱 | 中 | 低 | 使用 c8 的 `--reporter=json` 输出 JSON 解析而非 text-summary 正则匹配 |
| 覆盖率数据在 CI 与本地环境微小差异导致假阳性 | 低 | 低 | 2pp 容差已覆盖环境差异；可在 CI 中固定 Node 版本为 22 消除版本差异 |
| R230 声称的 "50% 行覆盖率" 与实测 23.68% 矛盾，修订基线可能引发争议 | 低 | 中 | 基线文档中明确记录历史声称 vs 实测对比，以数据说话 |

---

## 8. 验收检查清单

- [ ] `npm run coverage:gate` 在当前代码上零报错通过
- [ ] `coverage:gate` 包含 `--lines`、`--branches`、`--functions` 三个维度
- [ ] `coverage:gate` 失败时 `ci.yml` 中 pipeline 硬性 fail（package-check 不执行）
- [ ] `docs/reports/coverage-baseline.md` 已生成，包含四维指标和测量环境
- [ ] `scripts/architecture-guard.sh` 已创建，包含覆盖率回归检测逻辑
- [ ] 回归检测脚本在基线值退化 >2pp 时 exit 1
- [ ] CI workflow 中回归检测脚本在 `coverage:gate` 之后执行
- [ ] 基线文档中包含历史声称 vs 实测对比表
- [ ] `npm run lint` 0 errors / 0 warnings
- [ ] CHANGELOG.md 已更新 R233 条目

---

## 9. 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-05-21 | 初始版本 | Plan Agent |
