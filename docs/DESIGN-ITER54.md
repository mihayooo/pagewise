# 设计文档 — R156: 覆盖率基础设施修复 CoverageInfraFix

> 迭代: R54 | 创建日期: 2026-05-19 | 复杂度: Simple

---

## 1. 问题根因分析

### 1.1 故障现场

```
$ npm run test:coverage
> c8 --reporter=lcov --reporter=text-summary npm run test:ci
Error: EACCES: permission denied, unlink 'coverage/tmp/coverage-2522385-1779222221443-0.json'
```

### 1.2 文件系统状态

| 路径 | owner:group | 权限 | 说明 |
|------|------------|------|------|
| `coverage/` | `claude-user:claude-user` | `drwxrwxrwx` (777) | 目录本身可写 |
| `coverage/tmp/` | **`root:root`** | `drwxr-xr-x` (755) | c8 临时目录，owner 错误 |
| `coverage/tmp/*.json` (158 个) | **`root:root`** | `-rw-------` (600) | c8 覆盖率原始数据，仅 root 可读写 |
| `coverage/tmp_old/` | **`root:root`** | 同上 | 历史残留，可安全删除 |
| `coverage/tmp2/` | `claude-user:claude-user` | `drwxr-xr-x` (755) | 之前尝试的替代目录，冗余 |
| `coverage/lcov.info` | `claude-user:claude-user` | 正常 | 之前某次成功运行的产物 |
| `coverage/coverage-final.json` | `claude-user:claude-user` | 正常 | 同上 |

### 1.3 根因链

```
CI/Docker 容器以 root 身份运行 npm run test:coverage
  → c8 创建 coverage/tmp/ 目录及 JSON 文件 (owner=root, mode=600)
  → 本地开发机以 claude-user 身份再次运行
    → c8 尝试 unlink coverage/tmp/*.json (旧文件)
      → EACCES (claude-user 无法删除 root 的文件)
```

### 1.4 c8 行为说明

c8 的工作流程：
1. 运行前：清理 `tmpDir` 下的旧 `coverage-*.json`
2. 运行中：Node.js 子进程写入 V8 coverage 数据到 `tmpDir`
3. 运行后：读取 `tmpDir` 下所有 JSON，合并生成报告（lcov、text-summary 等）

**关键**: c8 **不会**自动创建 `tmpDir` 目录，如果目录存在但包含不可写的文件，就直接 EACCES。

---

## 2. 设计决策

### D-R156-1: 修复策略 — 方案 A vs 方案 B

| 维度 | 方案 A: preflight 清理 + 自定义 tmpDir | 方案 B: 删除整个 coverage/ + 重建 |
|------|---------------------------------------|----------------------------------|
| 描述 | 每次运行前 `rm -rf coverage/tmp`；在 `.c8rc` 中显式指定 `tmpDir` | 删除整个 `coverage/` 目录，让 c8 从零创建 |
| 优点 | 精确清理，保留 lcov.info 等产物；可复现维护 | 最彻底，零残留 |
| 缺点 | 需要改两处配置 | 每次运行丢失历史报告（本项目不需要保留） |
| CI 兼容性 | ✅ CI 全新环境，`rm -rf` 对不存在的路径无副作用 | ✅ 同左 |

**✅ 选择方案 A**:
- preflight `rm -rf coverage/tmp` 确保每次运行前 tmp 干净，无论本地是否有 root 残留
- 在 `.c8rc` 中添加 `tmpDir: "coverage/tmp"` 使路径显式化，方便后续维护者理解 c8 的临时文件位置
- 不清理整个 `coverage/` 目录，避免误删有用的报告产物

### D-R156-2: CI 覆盖率门禁 — c8 check-coverage vs 自定义脚本

| 维度 | `c8 check-coverage --lines 80` | 自定义 shell 脚本解析 text-summary |
|------|-------------------------------|-------------------------------------|
| 描述 | c8 原生子命令，读取最近一次覆盖率数据 | grep/awk 解析终端输出提取百分比 |
| 优点 | 零额外代码；支持 `--branches`/`--functions` 扩展 | 灵活 |
| 缺点 | 依赖 c8 内部实现（但 c8 是标准工具） | 容易因输出格式变化而 break；需要额外错误处理 |

**✅ 选择 `c8 check-coverage`**:
- c8 自 v8.0 起支持 `check-coverage` 子命令
- 语义明确：`--lines 80` 表示行覆盖率 ≥ 80% 才 pass
- 与 `test:coverage` 的 `c8` 包裹方式一致（共用 tmpDir 中的合并数据）

### D-R156-3: CI 结构 — 独立 job vs 追加到 test job

| 维度 | 独立 `coverage` job | 追加到现有 `test` job |
|------|--------------------|-----------------------|
| 并行性 | 与 lint、test 并行执行 | 在测试通过后串行执行 |
| 语义清晰度 | 职责单一：覆盖率报告 + 门禁 | test job 变长，职责混合 |
| CI 时间 | 不增加总体 pipeline 时间 | 增加 ~25s（覆盖率收集 + 门禁检查） |

**✅ 选择追加到 `test` job**:
- 覆盖率依赖测试结果，天然在测试之后
- 避免 `checkout` + `setup-node` + `npm install` 重复执行
- Simple 级需求，不需要独立 job 的复杂度
- 步骤结构：`Install deps` → `Run unit tests` → `Generate coverage report` → `Check coverage gate`

### D-R156-4: .gitignore 策略

`.gitignore` 已有 `coverage/` 规则排除整个目录，**不需要额外修改**。
`coverage/tmp/` 是 c8 运行时产物，已在排除范围内。
本次权限问题的根因是 root 残留文件，不是 git 追踪问题。

---

## 3. 需要修改的文件

| # | 文件 | 变更类型 | 变更内容 |
|---|------|---------|---------|
| 1 | `package.json` | **修改** | `test:coverage` 脚本添加 preflight `rm -rf coverage/tmp` |
| 2 | `.c8rc.json` | **修改** | 添加 `"tmpDir": "coverage/tmp"` 使路径显式化 |
| 3 | `.github/workflows/ci.yml` | **修改** | `test` job 新增 "Generate coverage" 和 "Coverage gate" 步骤 |
| 4 | `coverage/tmp/` | **清理** | 删除 root-owned 残留（`sudo rm -rf coverage/tmp`） |
| 5 | `coverage/tmp_old/` | **清理** | 删除 root-owned 残留（`sudo rm -rf coverage/tmp_old`） |
| 6 | `coverage/tmp2/` | **清理** | 删除冗余的 tmp2 目录 |

---

## 4. 详细变更设计

### 4.1 `package.json` — test:coverage 脚本

**变更前**:
```json
"test:coverage": "c8 --reporter=lcov --reporter=text-summary npm run test:ci"
```

**变更后**:
```json
"test:coverage": "rm -rf coverage/tmp && c8 --reporter=lcov --reporter=text-summary npm run test:ci && c8 check-coverage --lines 80"
```

**设计说明**:
- `rm -rf coverage/tmp` — preflight 清理，确保 tmp 目录干净（若不存在则静默跳过）
- `c8 check-coverage --lines 80` — 运行结束后立即做门禁检查，读取 c8 刚刚生成的覆盖率数据
- 三段用 `&&` 链接，任何一段失败则整体失败（exit code 传播）

### 4.2 `.c8rc.json` — 添加 tmpDir

**变更前**:
```json
{
  "include": ["lib/**/*.js"],
  "exclude": ["lib/pdf.min.mjs", "lib/pdf.worker.min.mjs", "lib/pdf.worker.mjs", "tests/**"],
  "reporter": ["lcov", "text-summary"],
  "all": true,
  "src": ["lib"]
}
```

**变更后**:
```json
{
  "include": ["lib/**/*.js"],
  "exclude": ["lib/pdf.min.mjs", "lib/pdf.worker.min.mjs", "lib/pdf.worker.mjs", "tests/**"],
  "reporter": ["lcov", "text-summary"],
  "all": true,
  "src": ["lib"],
  "tmpDir": "coverage/tmp"
}
```

**设计说明**:
- c8 默认使用 `coverage/tmp`，但显式声明可防止未来 c8 版本变更默认路径
- 路径与 preflight 清理保持一致，便于维护

### 4.3 `.github/workflows/ci.yml` — test job 追加覆盖率步骤

**变更前** (`test` job):
```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
    - name: Run unit tests (excluding E2E)
      run: |
        echo "运行 npm run test:ci ..."
        npm run test:ci 2>&1
```

**变更后**:
```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
    - name: Install dependencies
      run: npm install
    - name: Run unit tests (excluding E2E)
      run: |
        echo "运行 npm run test:ci ..."
        npm run test:ci 2>&1
    - name: Generate coverage report
      run: npm run test:coverage
    - name: Coverage gate (lines >= 80%)
      run: npx c8 check-coverage --lines 80
```

**设计说明**:
- **"Install dependencies"** 步骤: 原 test job 缺少 `npm install`（可能依赖隐式安装），显式化确保 c8 可用
- **"Generate coverage report"**: 运行 `npm run test:coverage`，该脚本已包含 preflight 清理 + c8 执行 + check-coverage。但为使 CI 步骤语义更清晰，将门禁检查拆为独立步骤
- **"Coverage gate"**: 单独运行 `npx c8 check-coverage --lines 80`，利用 `test:coverage` 步骤已生成的 `coverage/` 数据。如果覆盖率 < 80%，此步骤 exit code = 1，CI 失败
- **注意**: `test:coverage` 内部已含 `check-coverage`，所以 CI 中实际会检查两次。但拆分后 CI 日志更清晰——失败时可明确看到是"覆盖率报告生成"还是"门禁检查"出问题。如果觉得冗余，可从 `package.json` 的脚本中移除 check-coverage，仅在 CI 中执行

**最终方案**: 从 `package.json` 的 `test:coverage` 脚本中**不包含** `check-coverage`（该脚本仅负责生成报告），门禁检查**仅在 CI** 中执行。本地开发者运行 `npm run test:coverage` 可自由查看覆盖率但不被强制门禁。

修正后的 `package.json`:
```json
"test:coverage": "rm -rf coverage/tmp && c8 --reporter=lcov --reporter=text-summary npm run test:ci"
```

修正后的 CI 步骤:
```yaml
    - name: Generate coverage report
      run: npm run test:coverage
    - name: Coverage gate (lines >= 80%)
      run: npx c8 check-coverage --lines 80
```

---

## 5. 新增的函数/类

**无新增函数或类**。本需求为纯基础设施修复，不涉及业务代码变更。

---

## 6. 接口设计

### 6.1 npm scripts 接口

| 脚本名 | 用途 | 退出码 |
|--------|------|--------|
| `npm run test:coverage` | 生成覆盖率报告（lcov + text-summary） | 0 = 报告成功生成；非 0 = 运行失败 |
| `npx c8 check-coverage --lines 80` | 检查行覆盖率是否 ≥ 80% | 0 = 通过；非 0 = 未达标 |

### 6.2 CI Pipeline 流程图

```
push/PR → master
  ├─ lint job (并行)
  │   ├─ npm install
  │   ├─ node --check (语法检查)
  │   ├─ npm run lint (ESLint)
  │   └─ validate manifest.json
  │
  ├─ test job (并行)
  │   ├─ npm install
  │   ├─ npm run test:ci (单元测试)
  │   ├─ npm run test:coverage (生成覆盖率报告)
  │   └─ c8 check-coverage --lines 80 (覆盖率门禁)
  │
  └─ package-check job (needs: [lint, test])
      └─ check package size
```

### 6.3 c8 输出产物

| 产物 | 路径 | 格式 | 用途 |
|------|------|------|------|
| LCOV 报告 | `coverage/lcov.info` | LCOV 文本 | CI 上传、Codecov/Coveralls 集成 |
| HTML 报告 | `coverage/lcov-report/` | HTML | 本地浏览详细逐行覆盖情况 |
| 合并 JSON | `coverage/coverage-final.json` | Istanbul JSON | c8 check-coverage 读取、IDE 插件使用 |
| 终端摘要 | stdout (text-summary) | 文本 | 快速查看覆盖率百分比 |

---

## 7. 验收标准与验证方案

| AC | 验收标准 | 验证命令 | 预期输出 |
|----|---------|---------|---------|
| AC-1 | `npm run test:coverage` 成功执行，无 EACCES | `npm run test:coverage && echo OK` | `OK`，且 `coverage/lcov.info` 存在且非空 |
| AC-2 | `coverage/tmp/` 中无 root-owned 文件 | `find coverage/tmp -user root 2>/dev/null \| wc -l` | `0` |
| AC-3 | 行覆盖率 ≥ 80% | `npx c8 check-coverage --lines 80 && echo PASS` | `PASS` |
| AC-4 | CI 覆盖率门禁生效 | Push PR → 观察 CI test job | "Coverage gate" 步骤 green |
| AC-5 | 全量测试无回归 | `npm run test:ci` | 退出码 0，通过数不变 |

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CI 环境 c8 版本不支持 `check-coverage` | 极低 | 高 | c8 ≥8.0 已支持，`package.json` 锁定 `^10.1.3` |
| preflight `rm -rf` 在并发执行时竞争 | 极低 | 低 | CI job 单线程串行执行；本地不并发跑覆盖率 |
| 80% 门禁对新 PR 过严 | 低 | 低 | R52 已达 80.24% 基线；门槛可后续调整 |
| `c8 check-coverage` 读取的不是最新数据 | 极低 | 中 | `test:coverage` 和 `check-coverage` 在同一 job 中串行执行，共享文件系统 |

---

## 9. 设计决策记录

| ID | 决策 | 原因 |
|----|------|------|
| D-R156-1 | 选择 preflight 清理而非删除整个 coverage/ | 精确清理 tmp，保留有用的报告产物 |
| D-R156-2 | 使用 c8 原生 check-coverage 而非自定义解析脚本 | 零代码、标准化、可扩展到 branches/functions |
| D-R156-3 | 覆盖率步骤追加到 test job 而非独立 job | 避免重复 checkout/install；依赖关系自然 |
| D-R156-4 | 门禁仅在 CI 中执行，本地 test:coverage 不含门禁 | 本地开发者应能自由查看覆盖率而不被阻断 |
| D-R156-5 | .gitignore 不需要修改 | `coverage/` 已在排除列表中，根因是本地 root 残留 |

---

## 10. 预估工作量

| 阶段 | 工作项 | 预估 |
|------|--------|------|
| 清理 | `sudo rm -rf coverage/tmp coverage/tmp_old coverage/tmp2` | ~1 min |
| 配置 | 修改 `package.json`、`.c8rc.json`、`ci.yml` | ~5 min |
| 验证 | 本地运行 `npm run test:coverage` + `c8 check-coverage --lines 80` | ~5 min |
| 回归 | `npm run test:ci` 确认全量测试无回退 | ~5 min |
| **合计** | | **~16 min** |

---

> 文档生成: Plan Agent | 基于实测 `npm run test:coverage` 错误输出 + 文件系统权限分析 (2026-05-19)
