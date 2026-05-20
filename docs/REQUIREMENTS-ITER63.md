# 需求文档 — R226: 超大模块拆分最终收尾 ModuleSplitAbsoluteFinal

> 版本: 1.0
> 日期: 2026-05-20
> 迭代: 飞轮迭代 R63 (R226)
> 复杂度: Simple
> 前序迭代: R223 (ModuleSplitFinal)、R224 (IterationCloseR71)

---

## 1. 背景与动机

### 1.1 现状分析

R223 声称完成全部 13 个文件拆分，`architecture-metrics.md` 第 91 行亦声明「所有 lib 文件均 ≤400 行」。但实测仍有 **4 个 lib 文件略超 400 行上限**：

| 文件 | 当前行数 | 超出 | 拆分难度 |
|------|---------|------|----------|
| `lib/bookmark-tag-editor-v2.js` | 412 | +12 | 需提取辅助函数 |
| `lib/bookmark-onboarding.js` | 406 | +6 | 需提取配置/常量 |
| `lib/chat-mode.js` | 403 | +3 | 极小拆分 |
| `lib/bookmark-indexer.js` | 401 | +1 | 极小拆分 |

同时，`architecture-metrics.md` 引用的 `scripts/architecture-guard.sh` **实际不存在**，当前无自动化手段防止文件再次膨胀。CI 流水线 (`ci.yml`) 也没有行数门禁步骤。

此外，`architecture-metrics.md` 中的 lib 模块数记录为 222，而实际 `find lib -name '*.js' | wc -l` 返回 **235**，存在 13 个模块的差距。

### 1.2 问题清单

1. **4 个文件仍超 400 行** — R223 拆分未彻底，遗留尾巴
2. **无 CI 门禁** — `scripts/architecture-guard.sh` 缺失，`scripts/check-file-size.sh` 不存在，文件膨胀无自动拦截
3. **架构指标不准确** — `architecture-metrics.md` 模块数 222 vs 实际 235，拆分历程缺少 Phase 13-final 记录

### 1.3 目标

彻底完成模块拆分收尾（4 个文件 → ≤400 行），新增 CI 门禁脚本防止未来膨胀，修正架构文档，实现「拆分 + 防守」闭环。

---

## 2. 用户故事

> **作为** PageWise 项目的架构治理负责人，
> **我希望** 将最后 4 个略超 400 行的 lib 文件拆分至 ≤400 行，并建立 CI 自动门禁，
> **以便** 所有 235 个 lib 模块严格遵守 400 行上限，且未来任何新增代码都无法突破此约束。

---

## 3. 验收标准

### AC-1: 4 个目标文件全部 ≤ 400 行

| 文件 | 目标行数 | 拆分策略 |
|------|---------|----------|
| `bookmark-tag-editor-v2.js` | ≤ 400 | 提取辅助/格式化函数至 `bookmark-tag-editor-v2-utils.js` |
| `bookmark-onboarding.js` | ≤ 400 | 提取配置常量/引导步骤定义至 `bookmark-onboarding-config.js` |
| `chat-mode.js` | ≤ 400 | 提取辅助逻辑至 `chat-mode-utils.js` |
| `bookmark-indexer.js` | ≤ 400 | 提取辅助函数至 `bookmark-indexer-utils.js` |

验证命令：
```bash
for f in lib/bookmark-tag-editor-v2.js lib/bookmark-onboarding.js lib/chat-mode.js lib/bookmark-indexer.js; do
  lines=$(wc -l < "$f")
  echo "$f: $lines lines"
  [ "$lines" -le 400 ] || exit 1
done
```

### AC-2: API 向后兼容（re-export 模式）

每个拆分出的新文件，其公开 API 必须在原文件中以 re-export 方式暴露。其他模块的 `import` 路径无需修改。

验证方式：
- `grep -r "from.*bookmark-tag-editor-v2" lib/ tests/` 中所有引用路径不需变更
- 同理验证其余 3 个文件
- 全量测试回归 0 fail（见 AC-4）

### AC-3: 新增 `scripts/check-file-size.sh` CI 门禁脚本

脚本功能要求：
- **扫描范围**: `lib/` 目录下所有 `*.js` 文件
- **行数阈值**: 400 行（硬编码常量，便于后续调整）
- **退出码**: 若存在任意 >400 行文件，exit 1（CI fail）；否则 exit 0
- **输出**: 列出所有违规文件的路径和行数，格式清晰可读
- **集成**: 在 `package.json` 新增 `"check:file-size": "bash scripts/check-file-size.sh"`，并在 CI workflow 中调用

验证命令：
```bash
# 当前应全部通过（4 个文件已拆分）
npm run check:file-size  # exit 0

# 手动验证：临时增加某文件至 401 行，应 exit 1
```

### AC-4: 全量回归 0 fail

执行 `npm run test:ci`，结果要求：
- **失败数 = 0**
- **通过数 ≥ 7088**（R223 后基线）
- 测试通过率 = 100%

### AC-5: `docs/architecture-metrics.md` 更新

| 指标 | 当前值 | 更新为 |
|------|-------|--------|
| 迭代轮次 | R209 | R226 (R63) |
| lib 模块数 | 222 | 235 + 拆分新增（实际 `find lib -name '*.js' \| wc -l`） |
| 拆分历程 | Phase 12 (R206) | 补充 Phase 13 (R223) + Phase 14 (R226) |
| 单文件上限 | ≤400 行 | 保持，但门禁脚本改为 `scripts/check-file-size.sh` |
| 模块上限 | ≤220 个 | 更新为 ≤240 个（当前实际 235+） |
| 代码质量基线行 | `scripts/architecture-guard.sh` | 更正为 `scripts/check-file-size.sh` |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| API 向后兼容 | 严格使用 re-export 模式，所有现有 `import` 路径不得变更 |
| 最小化拆分 | 4 个文件仅超出 1-12 行，拆分应精准提取，避免过度拆分导致模块碎片化 |
| 不引入新功能 | 本轮仅做文件拆分 + CI 门禁 + 文档更新，不新增业务逻辑 |
| 不修改测试 | 拆分后现有测试应全部通过，不需修改测试文件（re-export 保证） |
| 新文件命名 | 拆分子模块遵循 `{原模块名}-{子功能}.js` 命名惯例（如 `-utils.js`、`-config.js`） |
| 脚本可移植性 | `check-file-size.sh` 使用 POSIX sh 语法（非 bash 特有），兼容 CI Linux 环境 |
| 行数计算 | 使用 `wc -l` 计算，包含空行和注释（与项目既有标准一致） |
| Git 规范 | commit message 遵循 conventional commits 格式 |

---

## 5. 依赖关系

```
R223 (ModuleSplitFinal) ──→ R226 (ModuleSplitAbsoluteFinal) ──→ R227 (后续迭代)
```

| 方向 | 依赖 | 说明 |
|------|------|------|
| 前置 | R223 | ModuleSplitFinal — 完成了 7/11 个文件拆分，遗留 4 个尾巴 |
| 前置 | R224 | IterationCloseR71 — 确认全量回归基线 7088+ 用例 |
| 后续 | CI 流水线 | `check-file-size.sh` 需被 `ci.yml` 调用，成为长期门禁 |
| 后续 | R227+ | 未来所有迭代的模块变更自动受 400 行门禁约束 |

---

## 6. 非功能需求

| 维度 | 要求 |
|------|------|
| 执行时间 | `check-file-size.sh` 执行时间 ≤ 2s（纯文本扫描） |
| 测试执行 | `npm run test:ci` ≤ 30s（R202 基线为 24s） |
| 模块数量 | 拆分后 lib 模块总数 ≤ 245（235 基线 + 最多 4 个新子模块 + 余量） |
| 可追溯性 | 迭代报告 `docs/reports/2026-05-20-R63.md` 更新 |

---

## 7. 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 拆分导致 import 路径失效 | 测试失败 | re-export 模式保证 API 不变，回归验证 |
| 过度拆分（如 chat-mode.js 仅超 3 行） | 模块碎片化 | 精准提取最小逻辑单元，不为拆而拆 |
| check-file-size.sh 在不同 shell 环境下行为差异 | CI 失败 | 使用 POSIX sh 语法，CI 环境测试 |
| architecture-metrics.md 更新引入错误数据 | 文档误导 | 使用脚本实际统计，不手动估算 |
| 拆分新增模块影响覆盖率指标 | 覆盖率下降 | 新模块如有未覆盖行，补充基本测试 |

---

*文档生成于 2026-05-20，遵循飞轮迭代流程 (flywheel-iteration)*
