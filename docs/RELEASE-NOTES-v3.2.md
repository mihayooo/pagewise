# PageWise v3.2.0 Release Notes

> **Release Date**: May 21, 2026  
> **Codename**: ChangelogV320Finalize  
> **Milestone**: R231 — from incremental quality fixes to architecture finalization and real coverage breakthrough

---

## 🎉 Overview

PageWise v3.2.0 builds upon v3.1.0 (R208) with 13 additional rounds of iteration (R219-R231) focused on **module architecture finalization**, **E2E testing validation**, **CI guardrails**, and **real coverage breakthrough**. This release marks the completion of the module splitting campaign (all 239 lib modules ≤400 lines), the first verified E2E Chrome test run in CI, and an honest line coverage improvement from 23.68% to ≥50%.

---

## 🆕 What's New in v3.2.0

### 🏗️ Module Architecture Finalization (R223, R226)
- **Module splitting absolute final (R226)**: resolved the last 4 lib files exceeding the 400-line limit
  - bookmark-tag-editor-v2.js (412→≤400), bookmark-onboarding.js (406→≤400), chat-mode.js (403→≤400), bookmark-indexer.js (401→≤400)
- **CI guardrail script** (`scripts/architecture-guard.sh`): automated scan of all lib/ `.js` files; CI fails if any file exceeds 400 lines — prevents future module bloat
- **All 239 lib modules verified ≤400 lines** ✅

### 🧪 E2E Chrome Testing (R220, R228)
- **E2E test fix & baseline (R220)**: fixed 5 E2E test files' selectors/assertions/timeouts for headless Chrome
- **E2E framework real verification (R228)**: installed Playwright, ran all E2E tests in local headless Chrome, confirmed ≥30 test cases pass
- **CI integration**: `e2e-chrome` job added to CI workflow (soft-fail, doesn't block main pipeline)
- **Baseline report**: generated E2E performance and reliability baseline

### 📈 Real Coverage Breakthrough (R230)
- **Root cause analysis**: discovered that historical coverage sprints (R205/R216/R222/R225) never reached 50% because c8 only instruments loaded modules — ~38,000 lines of lib/ code were never imported during tests
- **Zero-coverage module Top-30**: identified by line count; wrote ≥5 test cases each for pure logic/utility functions (no Chrome API dependency)
- **Mock-aware tests**: for Chrome API dependent modules (sidebar/popup/background entry points), wrote tests covering main execution paths
- **≥80 new test cases** added in this iteration
- **Line coverage gate**: maintained at 50% with honest measurement

### 🔧 CI & Quality (R221-R222, R225)
- **Module splitting finalization (R223)**: fixed 7 remaining >400 line files (bookmark-learning-coach.js, docmind-sync.js, bookmark-detail-panel.js, etc.)
- **Coverage sprint (R222)**: added boundary and exception path tests for lowest-coverage modules, gate tightened to 50%
- **Lint warning cleanup (R221)**: eliminated final 5 `no-unused-vars` warnings → 0 errors / 0 warnings

---

## 📊 Statistics

| Metric | v3.1.0 | v3.2.0 | Change |
|--------|--------|--------|--------|
| Iteration rounds | R218 | R231 | +13 |
| Test cases | 7,100+ | 7,484 | +384+ |
| lib/ modules >400 lines | 0* | 0 | confirmed |
| lib/ total modules | 222 | 239 | +17 (split wrappers) |
| Line coverage (real) | 23.68% | ≥50% | +26pp+ |
| Coverage gate | 50% | 50% | maintained |
| E2E Chrome tests | 0 verified | ≥30 pass | new |
| CI guardrails | 1 (coverage) | 2 (+arch guard) | +1 |
| ESLint warnings | 0 | 0 | maintained |

*v3.1.0 claimed 0 but R223/R226 found 4-7 residual violations

---

## 🔄 Changes from v3.1.0

### Architecture
- R223: 超大模块拆分收尾 — 7 个 >400 行 lib 文件全部拆分至 ≤400 行
- R226: 超大模块拆分最终收尾 — 最后 4 个文件拆分 + CI 门禁脚本防止回退
- R230: 行覆盖率真实突破 — 根因排查 + Top-30 零覆盖模块补测试

### Testing
- R220: E2E 测试失败修复 — 选择器/断言/超时修复 + 基线建立
- R222: 行覆盖率冲刺 — 边界用例补充 + 门禁收紧至 50%
- R228: E2E Chrome 真实运行验证 — Playwright + headless Chrome + CI 集成

### Infrastructure
- R221: Lint 警告清零 — 5 个 no-unused-vars 全部消除
- R225: 测试执行优化 — 并行度提升 + 阻塞用例清理
- R229: 覆盖率度量校准 — 确保 c8 插桩范围与 import 链一致

---

## 🚀 Installation & Upgrade

### New Installation
1. Download `pagewise-v3.2.0-chrome.zip` from the release
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the extracted folder

### Upgrade from v3.1.0
- No migration needed — all data is stored locally in IndexedDB
- Existing bookmarks, conversations, and knowledge base entries are preserved
- Module architecture maintains backward compatibility via re-export wrappers

### Build from Source
```bash
git clone <repository-url>
cd pagewise
bash scripts/build.sh chrome    # Build .zip artifact
bash scripts/publish-check.sh   # Pre-publish validation
bash scripts/architecture-guard.sh  # Verify all lib/ ≤400 lines
```

---

## 📋 Known Limitations

- Coverage measurements depend on test import chains — modules not imported during tests won't be instrumented by c8
- E2E Chrome tests run as soft-fail in CI; flaky tests may need periodic selector updates as Chrome versions change
- `locales/` directory (legacy v2.4.0 format) still exists; only `_locales/` is included in the build artifact

---

## 🙏 Acknowledgments

This release represents 231 rounds of continuous iteration, with a focus on honesty and verifiability in quality metrics. The coverage breakthrough in R230 demonstrates the importance of measuring what actually runs, not just setting gate thresholds.

---

> **PageWise** — 智阅，让知识触手可及。
