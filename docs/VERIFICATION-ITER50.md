# VERIFICATION.md — Iteration #50 Review

> **任务**: R208: Chrome Web Store 发布产物构建 ReleaseBuildPipeline  
> **审查日期**: 2026-05-20  
> **审查范围**: scripts/publish-check.sh (unstaged changes), docs/RELEASE-NOTES-v3.1.md (untracked), docs/SCREENSHOT-GUIDE.md (untracked)  
> **迭代轮次**: #50

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | R208 五项 AC 中大部分已在上一 auto-commit 中实现；本轮 diff 仅为 publish-check.sh 的小幅打磨，但存在一个 **严重逻辑 Bug** 使 HTTPS 检查完全失效 |
| 代码质量 | ❌ | `grep -v '//'` 会过滤掉所有含 `//` 的 URL（即所有 URL），导致非 HTTPS 外部资源检查永远空通过；eval 检查降级为 warn 削弱了安全门禁 |
| 测试覆盖 | ⚠️ | tests/test-r208-release-build.js 存在（418 行，覆盖 AC-1~AC-5），但未在本轮执行验证（报告: 0 pass / 0 fail） |
| 文档同步 | ❌ | CHANGELOG.md 未更新 v3.1.0/R208 条目；TODO.md 中 R208 仍为 `- [ ]` 未勾选；RELEASE-NOTES-v3.1.md 和 SCREENSHOT-GUIDE.md 均为 untracked 未提交 |

---

## 变更清单

本轮实际变更（`git diff scripts/publish-check.sh`）共 13 行插入 / 11 行删除：

| 变更 | 行 | 描述 | 评价 |
|------|-----|------|------|
| 新增注释 | +135 | `# 检查图标: icon16.png, icon48.png, icon128.png` | ✅ 无害，改善可读性 |
| eval 检查排除测试路径 | +262 | `find ... -not -path "*/test*"` | ✅ 正确，避免扫描测试文件产生误报 |
| eval 检查正则细化 | +264 | 更精确的 `grep` + 排除变量名 `_eval`/`evalCount` 等 | ✅ 合理，减少假阳性 |
| eval 结果降级为 warn | +270 | `fail → warn` | ⚠️ 降低了安全门禁严格度 |
| 内联脚本排除 coverage/ | +277 | 新增 `-not -path "./coverage/*"` | ✅ 正确 |
| importmap 排除 | +280 | `grep -v 'type="importmap"'` | ✅ 正确，MV3 允许 importmap |
| **HTTP 检查 bug** | +296 | `grep -v '//'` | ❌ **严重 Bug** |
| HTTP 结果 bug 修复 | +298 | `$HTTP_REREFS → $HTTP_REFS` (typo fix) | ✅ 正确修复 |
| HTTP 检查缩窄为仅 JS | +295 | 移除 `-o -name "*.html"` | ⚠️ HTML 文件中的 HTTP 引用被遗漏 |

---

## 发现的问题

### 🔴 BUG-1: HTTPS 引用检查完全失效（严重）

**位置**: `scripts/publish-check.sh` 第 296 行

```bash
matches=$(grep -n 'http://' "$f" 2>/dev/null | grep -v 'localhost' | grep -v '127.0.0.1' | grep -v 'xmlns' | grep -v '@type' | grep -v '//' | grep -v 'http://www.w3.org' || true)
```

**问题**: `grep -v '//'` 会排除**所有包含 `//` 的行**。由于 `http://` 本身就包含 `//`，`grep -n 'http://'` 匹配到的每一行都会被 `grep -v '//'` 过滤掉。结果：**该检查永远返回空，无论是否存在非 HTTPS 引用。**

**验证**:
```bash
$ echo 'http://evil.com' | grep -v '//'
(exit code 1, no output — all URLs filtered)
```

**修复建议**: 删除 `grep -v '//'` 这一行。如需排除注释中的 URL，应使用更精确的模式如 `grep -v '^\s*//'` 或 `grep -v '^\s*\*'`。

### 🟡 WARN-1: eval 检查从 FAIL 降级为 WARN

**位置**: 第 270 行

```bash
# 旧: fail "以下文件包含 eval() 使用: $EVAL_FILES"
# 新: warn "以下文件可能包含 eval() 调用（需人工确认）:$EVAL_FILES"
```

**影响**: 即使代码中存在真正的 `eval()` 调用，publish-check.sh 也不会失败（exit 0），绕过了安全门禁。建议保留 `fail` 但改善消息，或增加 `--strict` 模式选项。

### 🟡 WARN-2: HTTP 检查缩窄范围 — 遗漏 HTML 文件

**位置**: 第 295 行

```bash
# 旧: find ... -name "*.js" -o -name "*.html"
# 新: find ... -name "*.js"
```

**影响**: HTML 文件中的非 HTTPS 引用（如 `<script src="http://...">`、`<link href="http://...">`）不再被检测。MV3 的 CSP 策略会阻止这些引用，但作为自检工具应当覆盖。

### 🟡 WARN-3: 核心变更文件未提交

**状态**: 工作树中存在未提交的变更：

| 文件 | 状态 | 说明 |
|------|------|------|
| `scripts/publish-check.sh` | Modified (unstaged) | 本轮改动未 staged/committed |
| `docs/RELEASE-NOTES-v3.1.md` | Untracked | 未加入 git |
| `docs/SCREENSHOT-GUIDE.md` | Untracked | 未加入 git |

这些文件应该被提交以确保可追溯性。

### 🟡 WARN-4: TODO.md 中 R208 未勾选

**位置**: `docs/TODO.md` 第 876 行

```markdown
- [ ] **R208: Chrome Web Store 发布产物构建 ReleaseBuildPipeline**
```

应改为 `- [x]` 表示已完成。

### 🟡 WARN-5: CHANGELOG.md 未更新 v3.1.0

`CHANGELOG.md` 当前最新条目为 `[3.0.0] - 2026-05-16`。RELEASE-NOTES-v3.1.md 存在但独立于 CHANGELOG.md。应将 R208 的关键变更摘要同步到 CHANGELOG.md 中。

### 🟢 INFO-1: 测试未执行

报告中测试通过/失败均为 0，说明测试套件 `tests/test-r208-release-build.js` 未在本轮验证中执行。建议执行：
```bash
node --test tests/test-r208-release-build.js
```

---

## 返工任务清单

| # | 优先级 | 任务 | 负责 |
|---|--------|------|------|
| 1 | 🔴 P0 | **修复 HTTPS 检查 bug**: 删除 `grep -v '//'` 或替换为 `grep -v '^\s*//'`（排除注释行） | 实现者 |
| 2 | 🟡 P1 | **eval 检查恢复为 FAIL**: 保留 fail 退出码，但可增加 `--allow-eval` 标志或改为人工确认后 fail | 实现者 |
| 3 | 🟡 P1 | **HTTP 检查恢复 HTML 扫描**: 将 `-name "*.html"` 加回 find 命令 | 实现者 |
| 4 | 🟡 P1 | **提交所有变更**: `git add scripts/publish-check.sh docs/RELEASE-NOTES-v3.1.md docs/SCREENSHOT-GUIDE.md && git commit` | 实现者 |
| 5 | 🟡 P2 | **更新 TODO.md**: R208 条目标记为 `[x]` | 实现者 |
| 6 | 🟡 P2 | **更新 CHANGELOG.md**: 新增 `[3.1.0] - 2026-05-20` 条目，汇总 R203-R208 变更 | 实现者 |
| 7 | 🟢 P3 | **执行测试**: `node --test tests/test-r208-release-build.js` 并验证全量回归 0 fail | 实现者 |

---

## 逐项验收标准检查

| AC | 描述 | 状态 | 说明 |
|----|------|------|------|
| AC-1 | build.sh 生成发布级 .zip | ✅ | 已在上一 auto-commit 中实现，白名单模式、zip 打包、体积校验均完整 |
| AC-2 | publish-check.sh 发布前自检 | ⚠️ | 7 项检查均存在，但 HTTPS 检查因 bug 失效，eval 降级为 warn |
| AC-3 | SCREENSHOT-GUIDE.md 截图指引 | ✅ | 181 行，内容完整（尺寸要求、5 个截图场景、命名规范、操作步骤） |
| AC-4 | RELEASE-NOTES-v3.1.md 发布说明 | ✅ | 124 行，涵盖 R203-R208 全部迭代摘要、统计对比表 |
| AC-5 | .zip 产物可在 Chrome 加载运行 | ⚠️ | 未实际验证（测试未执行），但 build.sh 逻辑正确、白名单完整 |

---

## 总结

本轮变更幅度较小（24 行 diff），主要对 publish-check.sh 的安全审计模块进行打磨。**存在一个严重逻辑 Bug**（HTTPS 检查完全失效）需要 P0 修复。此外，多处文档同步缺失（CHANGELOG、TODO）和未提交文件影响发布流程的完整性。建议修复 P0 后重新验证，再提交最终产物。
