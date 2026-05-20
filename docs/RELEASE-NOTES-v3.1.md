# PageWise v3.1.0 Release Notes

> **Release Date**: May 20, 2026  
> **Codename**: ReleasePipeline  
> **Milestone**: R208 — from prototype to production-grade Chrome extension with standardized release pipeline

---

## 🎉 Overview

PageWise v3.1.0 builds upon the landmark v3.0.0 release (R92) with 116 additional rounds of iteration focused on **code quality**, **test coverage**, **module architecture optimization**, and **release automation**. This release establishes a standardized build and publish pipeline for Chrome Web Store submission.

---

## 🆕 What's New in v3.1.0

### 📦 Release Pipeline (R208)
- **Standardized build script** (`scripts/build.sh`): generates Chrome Web Store-ready .zip artifacts with whitelist-based file inclusion
- **Pre-publish self-check** (`scripts/publish-check.sh`): automated validation of version consistency, permissions audit, icon integrity, i18n completeness, and security checks
- **Screenshot guide** (`docs/SCREENSHOT-GUIDE.md`): comprehensive instructions for generating Chrome Web Store screenshots
- **Release notes** (this file): complete v3.0.0 → v3.1.0 changelog

### 📈 Test Coverage (R205)
- **Line coverage gate**: tightened from 20% to 50% (`coverage:gate --lines 50`)
- **Top-10 module test augmentation**: supplemented boundary and exception path tests for utils.js, sanitize.js, error-handler.js, cache-manager.js, and 6 more modules
- **Function coverage target**: ≥60%

### 🏗️ Module Architecture Optimization (R203, R206, R207)
- **Module splitting (Phase 11-12)**: all 14 lib files >400 lines reduced to ≤400 lines via re-export wrapper pattern
  - Phase 11: bookmark-spaced-repetition.js (528→400), architecture-health-monitor.js (498→400), bookmark-notifier.js (493→400), and 5 more
  - Phase 12: page-sense.js (447→400), utils.js (444→400), docmind-client.js (443→400), and 11 more
- **Module consolidation (R207)**: merged 3 overlapping module pairs with re-export wrappers for backward compatibility
  - bookmark-dedup.js → bookmark-duplicate-detector.js
  - bookmark-io.js → bookmark-import-export.js
  - Reduced total lib/ module count by 3+

### 🔧 Quality & Infrastructure (R190-R201)
- **Test failure fixes (R190, R200)**: fixed 17 failing test cases across multiple suites
- **ESLint zero warnings (R191, R201)**: achieved 0 errors / 0 warnings
- **Coverage infrastructure fix (R192, R195)**: resolved EACCES permission errors in coverage report generation
- **Test execution optimization (R198, R202)**: reduced test suite execution time from 45s to 24s (47% improvement)
- **Version sync (R197)**: unified package.json, manifest.json, and CHANGELOG.md version numbers to 3.1.0

---

## 📊 Statistics

| Metric | v3.0.0 | v3.1.0 | Change |
|--------|--------|--------|--------|
| Iteration rounds | R92 | R208 | +116 |
| Test cases | 6,887 | 7,000+ | +113+ |
| Test execution time | 45s | 24s | -47% |
| Line coverage gate | 20% | 50% | +30pp |
| lib/ modules >400 lines | 22 | 0 | -22 |
| lib/ total modules | 190 | 187 | -3 (consolidation) |
| ESLint warnings | 4 | 0 | -4 |

---

## 🔄 Changes from v3.0.0

### Architecture
- R203: 超大模块拆分十一期 — 8 个 >460 行 lib 文件拆分至 ≤400 行
- R206: 超大模块拆分十二期 — 剩余 14 个 >400 行 lib 文件全部拆分
- R207: 重叠模块合并 — 合并 Top-3 功能重叠模块对（-3 modules）

### Quality
- R205: 行覆盖率冲刺 — 覆盖率门禁从 20% 收紧至 50%
- R200: 测试失败修复 — 修复 6 个超时/断言失败用例
- R201: Lint 警告清零 — ESLint 0 errors / 0 warnings
- R202: 测试执行效率优化 — 全量测试 ≤25s

### Infrastructure
- R192/R195: 覆盖率基础设施修复 — 解决 EACCES 权限问题
- R197: 版本号统一 — package.json/manifest.json/CHANGELOG 对齐
- R198: 测试执行效率优化 — 47% 速度提升

### Release
- R208: 发布产物构建 — 标准化 build.sh + publish-check.sh + 截图指引 + 发布说明

---

## 🚀 Installation & Upgrade

### New Installation
1. Download `pagewise-v3.1.0-chrome.zip` from the release
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the extracted folder

### Chrome Web Store
1. Visit [Chrome Web Store](https://chrome.google.com/webstore) (search "PageWise")
2. Click "Add to Chrome"

### Build from Source
```bash
git clone <repository-url>
cd pagewise
bash scripts/build.sh chrome    # Build .zip artifact
bash scripts/publish-check.sh   # Pre-publish validation
```

### Upgrade from v3.0.0
- No migration needed — all data is stored locally in IndexedDB
- Existing bookmarks, conversations, and knowledge base entries are preserved
- New module architecture maintains backward compatibility via re-export wrappers

---

## 📋 Known Limitations

- `locales/` directory (legacy v2.4.0 format) still exists in the repository; only `_locales/` is included in the build artifact
- Puppeteer-based screenshot automation requires manual setup (see `docs/SCREENSHOT-GUIDE.md`)
- Firefox and Edge build variants available but not yet published to respective stores

---

## 🙏 Acknowledgments

This release represents 208 rounds of continuous iteration, demonstrating the power of AI-assisted development with Claude Code. Special thanks to the Chrome Extensions documentation team for comprehensive Manifest V3 guidance.

---

> **PageWise** — 智阅，让知识触手可及。
