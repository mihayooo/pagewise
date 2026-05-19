# 设计文档 — R108: 测试覆盖率度量 TestCoverage

> 迭代: R108 (Phase H 第 1 轮，飞轮迭代 R5)
> 日期: 2026-05-19
> 复杂度: Simple
> 关闭: TD001

---

## 一、目标概述

为 PageWise 项目引入基于 V8 原生覆盖率的测试度量能力，通过 `c8` 工具实现：

1. `npm run test:coverage` 一键生成覆盖率报告
2. `lib/` 模块行覆盖率 (line coverage) ≥ 60%
3. 输出 `lcov` + `text-summary` 两种格式
4. `coverage/` 目录加入 `.gitignore`
5. 更新 TD001 状态为"已关闭"

---

## 二、背景与现状

### 2.1 当前测试基础设施

| 项目 | 现状 |
|------|------|
| 测试框架 | Node.js 内置 test runner (`node:test`) — D004 |
| 测试脚本 | `npm run test` / `test:ci` / `test:all` (R103 建立) |
| 测试文件 | 193 个 `tests/test-*.js` |
| lib 模块 | 120 个 `lib/*.js` 文件 |
| 全量测试 | 5887+ 用例通过 |
| CI | GitHub Actions `ci.yml` — lint + test + package-check |
| 覆盖率 | **无** — TD001 记录"无测试覆盖" |
| Node.js | v22.22.2 (V8 原生 coverage 支持完善) |

### 2.2 技术债务

> **TD001**: 无测试覆盖 — 高优先级 — 待解决

项目已有 5800+ 测试用例，但从未引入覆盖率度量工具。TD001 的真实含义是"无覆盖率可量化"而非"无测试"。本次迭代将精确解决这一缺口。

---

## 三、设计决策

| ID | 决策 | 原因 |
|----|------|------|
| D108-1 | 使用 `c8` 而非 `istanbul/nyc` | c8 直接使用 V8 引擎原生 coverage 数据，零插桩、零性能损失；nyc 需要 instrument 源码对 ESM 支持不完善；c8 是 Node.js 生态的现代标准 |
| D108-2 | `c8` 安装为 `devDependencies` | 仅开发/CI 使用，不进入生产扩展包 |
| D108-3 | `test:ci` 作为覆盖率基线脚本 | `test:ci` 排除了 E2E 测试（需要浏览器环境），是覆盖率度量的合理范围；不含 E2E 避免虚假低覆盖 |
| D108-4 | 覆盖率门槛设为 `lib/` 行覆盖率 ≥ 60% | 120 个 lib 模块已有 5800+ 测试，60% 是当前合理基线而非过高目标；仅约束 `lib/` 而非全局，因为 `sidebar/`、`content/` 依赖 DOM 环境覆盖率天然偏低 |
| D108-5 | 输出 lcov + text-summary 双格式 | lcov 是 CI 集成/Codecov/Coveralls 的标准格式；text-summary 提供快速 CLI 可读概览 |
| D108-6 | 不在此轮集成 CI 覆盖率检查门禁 | R108 目标是建立度量基线；将覆盖率强制门禁留到后续迭代（当基线稳定后再收紧），避免首次引入就阻断 CI |
| D108-7 | `coverage/` 使用 `.gitignore` 而非 `.git/info/exclude` | `.gitignore` 是团队协作的标准做法，所有贡献者自动忽略构建产物 |

---

## 四、文件变更清单

### 4.1 修改的文件

| 文件 | 变更类型 | 变更内容 |
|------|----------|----------|
| `package.json` | 修改 | 添加 `devDependencies.c8`；添加 `scripts.test:coverage` 脚本 |
| `.gitignore` | 修改 | 添加 `coverage/` 目录 |
| `docs/DESIGN.md` | 修改 | TD001 状态更新：`待解决` → `已关闭 (via R108)` |

### 4.2 无新增文件

本次迭代不新增任何 `.js` 文件。纯基础设施配置变更。

---

## 五、详细设计

### 5.1 `package.json` 变更

**新增 devDependency:**

```json
{
  "devDependencies": {
    "c8": "^10.1.0"
  }
}
```

选型理由: c8@10.x 是最新稳定版，原生支持 Node.js 22 + ESM (type: "module")。

**新增 script:**

```
"test:coverage": "c8 --reporter=lcov --reporter=text-summary npm run test:ci"
```

### 5.2 c8 配置策略

**不创建 `.c8rc.json` 或 `c8` 配置文件。** 原因:
- 仅一个脚本 (`test:coverage`)，配置量少，内联到 CLI 参数即可
- 避免引入额外配置文件增加维护负担
- 保持与项目"无构建工具、最小配置"的设计哲学一致 (D002)

**内联参数说明:**

| 参数 | 作用 |
|------|------|
| `--reporter=lcov` | 输出 `coverage/lcov.info`，标准格式供 CI/第三方工具消费 |
| `--reporter=text-summary` | 输出文本摘要到 stdout，快速查看覆盖率百分比 |
| `--src=lib/` | **不使用此参数** — 让 c8 报告所有被覆盖文件，后续在 CLI 输出中人工关注 `lib/` 行覆盖率 |

**默认行为说明:**
- c8 默认输出到 `coverage/` 目录
- c8 默认生成 `coverage/lcov.info` (lcov) + stdout summary
- c8 使用 V8 的 `--coverage` flag 自动收集，无需修改测试运行方式

### 5.3 `.gitignore` 变更

追加一行:

```
# Test coverage
coverage/
```

添加位置: 在现有 "Node" (`node_modules/`) 段落之后、"Chrome extension" 段落之前。

### 5.4 覆盖率门槛说明

**目标: `lib/` 模块行覆盖率 ≥ 60%**

这是一个 **度量基线目标**，非 CI 强制门禁。执行方式:

1. `npm run test:coverage` 运行后，CLI `text-summary` 输出包含全局覆盖率
2. 运行后检查 `coverage/lcov.info` 中 `lib/` 文件的行覆盖率数据
3. 如果 `lib/` 行覆盖率 < 60%，在迭代报告中标注并分析未覆盖模块

**不在本轮设置 `--check-coverage` 门禁的原因:**
- 首次引入需要先观测当前基线
- 强制门槛可能导致需要大量补写测试，偏离 R108 的"建立度量"目标
- 待基线数据稳定后，在 R112 或后续迭代中逐步收紧

---

## 六、接口设计

### 6.1 用户接口 (npm scripts)

```
npm run test           — 运行测试（不变）
npm run test:ci        — CI 模式运行测试（不变）
npm run test:coverage  — 运行测试 + 生成覆盖率报告（新增）
```

### 6.2 输出格式

**text-summary (stdout 示例):**

```
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   65.43 |    52.17 |   61.28 |   65.43 |
 lib/     |   68.92 |    55.33 |   64.71 |   68.92 |
----------|---------|----------|---------|---------|
```

**lcov 文件:** `coverage/lcov.info` — 标准 LCOV 格式

**HTML 报告:** c8 默认也会生成 `coverage/index.html`（交互式浏览，可选打开）

### 6.3 目录结构

```
pagewise/
├── coverage/              ← 自动生成，已 .gitignore
│   ├── lcov.info          ← LCOV 格式覆盖率数据
│   ├── index.html         ← 交互式 HTML 报告
│   └── ...
├── .gitignore             ← 添加 coverage/
├── package.json           ← 添加 devDependencies + script
└── docs/DESIGN.md         ← TD001 状态更新
```

---

## 七、与现有架构的关系

```
                    开发者 / CI
                        │
                        ▼
              npm run test:coverage
                        │
                   ┌────┴────┐
                   │   c8    │  ← V8 --coverage 收集
                   │ (devDep)│
                   └────┬────┘
                        │
                        ▼
              node --test 'tests/*.js'   ← 现有测试运行 (不变)
                        │
                   ┌────┴────┐
                   │ 测试用例 │  ← 193 个 test 文件 (不变)
                   └────┬────┘
                        │
                   ┌────┴────┐
                   │  lib/   │  ← 120 个模块 (不变)
                   │  src/   │
                   └────┬────┘
                        │
                   ┌────┴────┐
                   │coverage/│  ← 输出目录 (新增)
                   └─────────┘
```

c8 作为 **外层包装器** 包裹现有测试运行，零侵入:
- 不修改任何测试文件
- 不修改任何源码文件
- 不修改现有 npm scripts

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| c8 与 Node.js 22 不兼容 | 低 | 高 | c8@10.x 明确支持 Node.js 22；安装后立即验证 |
| 覆盖率 < 60% 基线 | 中 | 低 | 非阻断性目标；记录真实基线，后续迭代改进 |
| coverage/ 体积过大影响仓库 | 低 | 低 | .gitignore 已排除；coverage/ 是纯文本通常 < 5MB |
| E2E 测试污染覆盖率数据 | 低 | 中 | 使用 `test:ci` 作为基线（已排除 E2E） |

---

## 九、验收标准

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | `npm run test:coverage` 正确执行 | CLI 无错误退出，text-summary 输出可见 |
| 2 | `coverage/lcov.info` 文件生成 | `ls -la coverage/lcov.info` 存在且非空 |
| 3 | text-summary 在 stdout 输出 | 运行后可见 File/Stmts/Branch/Funcs/Lines 表格 |
| 4 | `coverage/` 在 `.gitignore` 中 | `git status` 不显示 coverage/ 文件 |
| 5 | `c8` 在 devDependencies 中 | `package.json` 中存在 `"c8": "^10.1.0"` |
| 6 | TD001 状态已更新 | `docs/DESIGN.md` 中 TD001 行显示"已关闭 (via R108)" |
| 7 | 现有测试全部通过 | `npm run test:ci` 5887+ 用例零失败 |

---

## 十、实施步骤

1. **安装依赖**: `npm install --save-dev c8`
2. **添加 script**: `package.json` 中添加 `test:coverage`
3. **更新 `.gitignore`**: 添加 `coverage/`
4. **验证运行**: `npm run test:coverage` — 确认 lcov + text-summary 输出
5. **检查基线**: 读取 text-summary 输出，记录 lib/ 行覆盖率数值
6. **更新 DESIGN.md**: TD001 标记为已关闭
7. **全量回归**: `npm run test:ci` 确认无回归

---

## 十一、设计决策记录

### D108-1: c8 vs nyc vs istanbul

| 工具 | V8 原生 | ESM 支持 | 插桩开销 | 维护状态 |
|------|---------|----------|----------|----------|
| **c8** ✅ | 是 | 原生 | 无 | 活跃 |
| nyc (istanbul) | 否 | 需配置 | 有 | 维护模式 |
| istanbul | 否 | 不支持 | 有 | 停滞 |

### D108-2: 为何不创建 .c8rc.json

- 项目设计哲学: 无构建工具 (D002)
- 单一脚本使用 c8，配置量不值得独立文件
- CLI 参数即文档，可读性好

### D108-3: 为何不设 CI 门禁

- 首次引入 = 建立基线，非建立壁垒
- 避免"覆盖率焦虑"导致写无意义测试
- 后续迭代可逐步引入 `--check-coverage --branches 50` 等门禁

---

*设计文档完成于 2026-05-19*
