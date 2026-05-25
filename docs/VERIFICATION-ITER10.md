# VERIFICATION.md — Iteration #10 Review

**任务**: R291: 覆盖率基础设施配置防漂移 CoverageConfigDriftGuard  
**审查时间**: 2026-05-25  
**审查人**: Guard Agent  

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ✅ | 8/8 验收标准全部实现并验证通过 |
| 代码质量 | ⚠️ | `validate-c8-config.sh` 与 `architecture-guard.sh` Part 4 存在逻辑重复；未发现安全问题 |
| 测试覆盖 | ✅ | 新增 test-r291 共 28 用例 + 旧测试更新 5 用例，全部 102 用例通过（3 个测试文件） |
| 文档同步 | ⚠️ | TODO.md R291 未标记 `[x]`；CHANGELOG.md 未补充 R291 记录 |

---

## 逐项验收标准检查

### AC-1: .c8rc.json tmpDir 与 test:coverage 脚本一致 ✅

**变更**: `.c8rc.json` 的 `tmpDir` 从 `"/tmp/c8_r289"`（外部 /tmp 路径）修正为 `"coverage/tmp"`（项目内相对路径）。

```
-  "tmpDir": "/tmp/c8_r289"
+  "tmpDir": "coverage/tmp"
```

**验证**: `test:coverage` 脚本 `clean-coverage.js && mkdir -p coverage/tmp && c8 ...` 中 `mkdir -p coverage/tmp` 与 `c8rc.tmpDir` 完全一致。  
**测试**: `test-r291-coverage-config-drift-guard.js` AC-1 组 3 用例全部通过。

### AC-2: .c8rc.json reporter 从实际文件读取验证 ✅

**验证**: reporter 数组 `["lcov", "text-summary", "html"]` 包含所有必需 reporter。  
**测试**: AC-2 组 4 用例（数组类型、lcov、text-summary、html）全部通过。

### AC-3: .c8rc.json include 覆盖 lib/ ✅

**变更**: 两个测试文件从硬编码 `assert.deepEqual(config.include, ['lib/**/*.js'])` 改为结构断言：

```js
// 旧: 硬编码精确匹配 — 配置变更即红灯
assert.deepEqual(config.include, ['lib/**/*.js']);

// 新: 结构断言 — 容忍配置模式变更
const hasLibPattern = c8rc.include.some(p =>
  typeof p === 'string' && p.includes('lib/') && (p.includes('*.js') || p.includes('**'))
);
assert.ok(hasLibPattern, ...);
```

**覆盖文件**: `tests/test-coverage-infra.js`（1 处）、`tests/test-r156-coverage-infra.js`（3 处：include/exclude/src）。  
**测试**: 全部通过。

### AC-4: scripts/validate-c8-config.sh 存在且包含关键字段验证 ✅

**新增文件**: `scripts/validate-c8-config.sh`（167 行，`-rwxrwxr-x`）

验证项：
1. `.c8rc.json` 文件存在性
2. JSON 合法性
3. `tmpDir` 不指向外部 `/tmp` 路径
4. `reporter` 包含 `lcov` + `text-summary` + `html`
5. `include` 覆盖 `lib/`
6. `exclude` 包含 `tests`
7. `all` 设为 `true`
8. `tmpDir` 与 `test:coverage` 脚本中 `mkdir -p` 一致性

**运行结果**: 10 passed, 0 failed ✅

### AC-5: scripts/architecture-guard.sh 集成 c8 配置验证 ✅

**新增**: Part 4（+59 行）在 `architecture-guard.sh` 中直接嵌入 c8 配置验证逻辑。

验证项：
- `.c8rc.json` 存在 + JSON 合法性
- `tmpDir` 不指向外部 `/tmp`
- `reporter` 包含 `lcov` + `text-summary`
- `include` 覆盖 `lib/`

**运行结果**: Part 4 5/5 passed ✅（注意 Part 3 因 `coverage/tmp` 目录不存在报 1 fail，属预存问题）

### AC-6: test:coverage 脚本防御性 mkdir -p ✅

**验证**: `package.json` 中 `test:coverage` 为：
```
node scripts/clean-coverage.js && mkdir -p coverage/tmp && c8 --reporter=lcov --reporter=text-summary --reporter=html npm run test:ci:coverage
```

`mkdir -p coverage/tmp` 在 `c8` 之前执行，顺序正确。  
**测试**: AC-6 组 2 用例全部通过。

### AC-7: c8 配置断言从 .c8rc.json 读取（非硬编码）✅

**变更摘要**:
| 文件 | 旧断言 | 新断言 |
|------|--------|--------|
| test-coverage-infra.js | `c8rc.include.includes('lib/**/*.js')` | `c8rc.include.some(p => p.includes('lib/') && ...)` |
| test-r156-coverage-infra.js | `assert.deepEqual(config.include, ['lib/**/*.js'])` | `Array.isArray + some()` |
| test-r156-coverage-infra.js | `assert.deepEqual(config.src, ['lib'])` | `Array.isArray + includes('lib')` |
| test-r156-coverage-infra.js | `config.exclude.includes('tests/**')` | `config.exclude.some(p => p.includes('tests'))` |

**新增**: `test-r291-coverage-config-drift-guard.js` AC-7 组 3 用例验证结构正确性。

### AC-8: validate-c8-config.sh 验证完整性 ✅

**测试**: AC-8 组 3 用例（tmpDir 验证、exit code、set -euo pipefail）全部通过。

---

## 发现的问题

### ⚠️ 问题 1: validate-c8-config.sh 与 architecture-guard.sh Part 4 逻辑重复

`validate-c8-config.sh` 和 `architecture-guard.sh` Part 4 执行了几乎相同的验证逻辑（JSON 解析、tmpDir 检查、reporter 检查、include 检查），均通过独立 `node -e` 调用实现。

**风险**: 未来若增加新的 c8 配置校验项，需同步修改两处脚本，增加遗漏风险（即 R291 试图防止的配置漂移问题的另一种形式）。

**建议**: `architecture-guard.sh` Part 4 改为调用 `validate-c8-config.sh`：
```bash
# Part 4: c8 Config Drift Guard (R291)
if [ -f "$PROJECT_ROOT/scripts/validate-c8-config.sh" ]; then
  bash "$PROJECT_ROOT/scripts/validate-c8-config.sh" && pass "c8 config drift guard" || fail "c8 config drift guard"
else
  fail "validate-c8-config.sh not found"
fi
```

**严重程度**: 低（功能正确，维护性次优）

### ⚠️ 问题 2: TODO.md R291 未标记完成

`docs/TODO.md` 第 1345 行 R291 仍为 `- [ ]`（未勾选），应更新为 `- [x]`。

**严重程度**: 低（文档同步遗漏）

### ⚠️ 问题 3: CHANGELOG.md 未补充 R291 记录

`CHANGELOG.md` 中无 R291 相关条目。按项目规范（Keep a Changelog），应至少在 "### Added" 或 "### Fixed" 下补充：
> - **c8 配置防漂移**：修复 `.c8rc.json tmpDir` 指向外部 `/tmp` 问题，新增 `validate-c8-config.sh` CI 门禁脚本

**严重程度**: 低（文档同步遗漏）

### ℹ️ 信息 4: architecture-guard.sh Part 3 可能误报

Part 3（R256）检查 `coverage/tmp` 目录是否存在。在未运行过 `test:coverage` 的 CI 环境中该目录不存在会导致 fail。Part 4（R291）仅验证配置文件，不受此影响。这是预存问题，不在 R291 范围内，但建议后续迭代修复（改为在 guard 中创建临时目录或放宽检查）。

---

## 返工任务清单

| 优先级 | 任务 | 指向 |
|--------|------|------|
| P2 | TODO.md R291 标记为 `[x]` | 文档同步 |
| P2 | CHANGELOG.md 补充 R291 记录 | 文档同步 |
| P3 | architecture-guard.sh Part 4 改为调用 validate-c8-config.sh，消除重复 | 维护性 |

---

## 测试运行结果

| 测试文件 | 用例数 | 通过 | 失败 |
|----------|--------|------|------|
| `tests/test-r291-coverage-config-drift-guard.js` | 28 | 28 | 0 |
| `tests/test-coverage-infra.js` | 43 | 43 | 0 |
| `tests/test-r156-coverage-infra.js` | 31 | 31 | 0 |
| `scripts/validate-c8-config.sh` | 10 | 10 | 0 |
| **合计** | **112** | **112** | **0** |

---

## 结论

R291 功能实现完整，核心修复（`.c8rc.json tmpDir` 从 `/tmp/c8_r289` 改为 `coverage/tmp`）正确解决了配置漂移根因。新增的 `validate-c8-config.sh` 和 `test-r291-coverage-config-drift-guard.js` 提供了全面的防护网。测试改为结构断言的策略正确，将未来配置变更引起的误报降至最低。

存在 3 个 P2/P3 级文档/维护性问题，不阻塞合入但建议在本次迭代或下一轮中修复。

**审查结论**: ✅ **通过**（附 3 项改进建议）
