# VERIFICATION.md — Iteration #10 Review (R283: E2E 冒烟测试稳定化)

> 审查人: Guard Agent
> 审查日期: 2026-05-25
> 任务: **R283: E2E 冒烟测试稳定化 E2ESmokeStable**
> 变更范围: `tests/e2e-chrome/helpers.js` (+243/-63), `docs/reports/2026-05-25-R10.md` (+36/-26)

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ✅ | CI 检测、自适应超时、指数退避重试、增强 onboarding 关闭全部实现，向后兼容无签名破坏 |
| 代码质量 | ⚠️ | 整体优秀，但有一处 `ElementHandle.click()` 可能不支持 `timeout` 选项（🟡P1），以及一处幽灵选择器 `.modal-backdrop` 在整个代码库中不存在（🟡P2） |
| 测试覆盖 | ❌ | **0 pass / 0 fail** — 变更未被任何测试执行验证，无法确认 CI 稳定化是否真正生效 |
| 文档同步 | ⚠️ | `docs/reports/2026-05-25-R10.md` 仍描述 R282（JSDoc 审计），未更新为 R283；CHANGELOG.md 未更新；TODO.md 不存在 |

**综合判定: ⚠️ 需返工** — 代码质量良好但测试未执行，文档未同步，存在一处 API 使用可疑问题。

---

## 详细审查

### ✅ 通过项

**1. CI 环境检测 (`isCI`)**
- 检测 7 个 CI 环境变量（CI、GITHUB\_ACTIONS、CONTINUOUS\_INTEGRATION、JENKINS\_URL、TRAVIS、CIRCLECI、GITLAB\_CI），覆盖主流 CI 平台
- 使用 `!!` 双重否定确保返回布尔值
- JSDoc 完整

**2. 自适应超时 (`getTimeout`)**
- 8 个超时场景全部定义，CI 与本地分离
- CI 超时倍数合理：SW 2x、selector \~2x、sidePanelLoad 2x、interaction \~2.7x
- 提供 fallback 默认值 `ci ? 15000 : 8000`
- 非调用方未知场景名时有默认兜底

**3. 重试机制 (`withRetry`)**
- 指数退避实现正确：`baseDelay * Math.pow(2, attempt - 1)` → 1s, 2s, 4s
- 重试间日志输出清晰，包含 attempt 计数和 delay 信息
- 所有尝试失败后抛出带有原始错误信息的 Error
- JSDoc 参数与实际签名完全一致

**4. Chrome 启动增强 (`launchChromeWithExtension`)**
- `withRetry` 正确包装了整个 launch + SW 等待逻辑
- 启动失败时正确调用 `context.close()` 清理后才重试（防止资源泄漏）
- 新增两个 CI 优化 Chrome 参数：`--disable-extensions-http-throttling`、`--disable-renderer-backgrounding`
- `maxRetries` 选项向下兼容（默认 3）
- 所有现有测试文件 `launchChromeWithExtension({ headless: true })` 调用不受影响

**5. Onboarding 关闭增强 (`dismissOnboarding`)**
- `#onboardingOverlay`、`#onboardingSkip` 选择器与 `sidebar/sidebar.html:785,801` 精确匹配
- `.onboarding-overlay` 类名与 `sidebar/sidebar.html:785` 的 `class="onboarding-overlay hidden"` 匹配
- 三层防御策略（点击跳过 → JS 隐藏 → 全选择器兜底）完整
- 超时全部使用自适应值

**6. 所有现有函数签名保持不变**
- `openSidePanel(context, extensionId)` — 不变
- `openPage(context, url)` — 不变
- `clickTab(page, tabName)` — 不变
- `waitForPanel(page, panelId)` — 不变
- `assertWithinBudget(actual, budget, label)` — 不变
- 全部 5 个测试文件的 import 和调用完全兼容

**7. 文件大小**
- helpers.js 396 行，刚好在 400 行限制以内（R280 拆分约束）

---

### 发现的问题

#### 🟡 P1 — `ElementHandle.click()` 的 `timeout` 参数可能无效

**位置:** `helpers.js:239`

```javascript
const skipBtn = await page.$('#onboardingSkip');
if (skipBtn) {
  await skipBtn.click({ timeout: interactionTimeout });  // ← 问题
}
```

`page.$()` 返回的 `ElementHandle` 的 `.click()` 方法**不支持 `timeout` 选项**（Playwright 文档中 `timeout` 仅适用于 `page.click()` 和 `locator.click()`）。当前代码中 `timeout` 会被静默忽略，不会抛错但也不会起到超时保护作用。

**建议修正:**
```javascript
// 方案 A: 使用 page.click() 代替 ElementHandle.click()
await page.click('#onboardingSkip', { timeout: interactionTimeout });

// 方案 B: 使用 Locator API
await page.locator('#onboardingSkip').click({ timeout: interactionTimeout });
```

**影响:** CI 环境中如果 skip 按钮点击挂起，无法被超时中断，可能导致测试无限等待（最终被外层 testOverall 超时杀死，但调试困难）。

---

#### 🟡 P2 — `.modal-backdrop` 幽灵选择器

**位置:** `helpers.js:258`

```javascript
const selectors = [
  '#onboardingOverlay',
  '.onboarding-overlay',
  '.modal-backdrop',    // ← 整个代码库中不存在
];
```

在整个代码库中搜索 `modal-backdrop` 无任何结果。此选择器为死代码，不影响运行时（`querySelector` 找不到元素时返回 `null`，`if (el)` 会跳过），但增加认知负担。

**建议:** 移除此行或添加注释说明是为未来兼容性预留。

---

#### 🟡 P1 — `assertWithinBudget` CI 阈值过于宽松

**位置:** `helpers.js:319-331`

```javascript
const effectiveBudget = isCI() ? budget * 4 : budget;  // CI: 4x
// ...
if (actual >= effectiveBudget * 4) {                    // "严重超预算" = budget * 16 (CI)
  throw new Error(`严重超预算 — ${msg}`);
}
```

在 CI 环境中：
- `effectiveBudget = budget * 4`
- "严重超预算" 触发阈值 = `effectiveBudget * 4 = budget * 16`
- 例：`assertWithinBudget(result, 3000, 'test')` 在 CI 中需要 result ≥ 48000ms 才抛错

**16 倍原始预算的阈值意味着 CI 中性能断言基本形同虚设。** 建议 CI 严重超预算阈值改为 `effectiveBudget * 2`（即 8x 原始预算）。

---

#### 🔴 P0 — 迭代报告未更新为 R283

**位置:** `docs/reports/2026-05-25-R10.md`

当前报告内容仍描述 R282（JSDoc 完整性审计），但本次实际变更是 R283（E2E 冒烟测试稳定化）。报告中的：
- "任务" 字段 = R282（应为 R283）
- "代码变更" 字段 = 19 个 lib 模块的 JSDoc 变更（应为 helpers.js 的 E2E 稳定化变更）
- "测试统计" = 0 pass / 0 fail（应反映 E2E 测试结果）

**说明:** 这可能是飞轮迭代报告的更新覆盖机制导致——R282 和 R283 共用 Iteration 10 的报告文件，R283 的变更应生成独立报告或在报告中追加 R283 section。

---

### ⚪ P2 — 建议改进（非阻塞）

1. **`isCI()` 结果缓存:** 每次调用 `getTimeout()` 都会重新调用 `isCI()` 读取环境变量。虽然性能影响极小（环境变量读取 <1μs），但可考虑在模块加载时缓存一次。

2. **Chrome profile 目录清理竞争:** 多个测试文件都在 `before()` 中调用 `cleanProfileDir()` 后立即 `launchChromeWithExtension()`。如果未来改为并行执行 test 文件，可能因目录删除-创建竞争而失败。当前为串行执行无此问题。

3. **`page.waitForTimeout()` 使用:** Playwright 官方文档建议避免 `waitForTimeout()`，改用条件等待。当前用于等待渲染/动画是合理的折衷，但 CI 超时放大后（如 renderDelay 1000ms → 仍可能不足），建议在后续迭代中考虑用 `page.waitForFunction()` 等待 DOM 稳定。

---

## 返工任务清单

| 优先级 | 任务 | 涉及文件 | 预估工作量 |
|--------|------|---------|-----------|
| 🔴 P0 | 更新 `docs/reports/2026-05-25-R10.md` 追加 R283 section 或生成独立 R283 报告 | `docs/reports/2026-05-25-R10.md` | 5 min |
| 🟡 P1 | 修正 `ElementHandle.click()` 为 `page.click()` 以使 timeout 生效 | `tests/e2e-chrome/helpers.js:238-239` | 2 min |
| 🟡 P1 | 调整 `assertWithinBudget` CI 严重超预算阈值为 `effectiveBudget * 2` | `tests/e2e-chrome/helpers.js:323` | 2 min |
| 🟡 P2 | 移除或注释 `.modal-backdrop` 幽灵选择器 | `tests/e2e-chrome/helpers.js:259` | 1 min |
| ⚪ P2 | 运行 E2E 测试验证 R283 变更确实稳定化生效 | — | 10 min |
| ⚪ P2 | 更新 CHANGELOG.md 记录 R283 E2E 稳定化 | `CHANGELOG.md` | 3 min |

**总计预估返工时间: ~23 分钟**

---

## 变更安全审查

| 检查项 | 结果 |
|--------|------|
| 硬编码密钥/密码 | ✅ 未发现 |
| XSS 风险 | ✅ `page.evaluate()` 仅操作 DOM class，无用户输入注入 |
| 路径遍历风险 | ✅ `EXTENSION_PATH` 基于 `import.meta.url` 解析，非用户输入 |
| 资源泄漏 | ✅ 启动失败时 `context.close()` 被正确调用 |
| 敏感信息日志 | ✅ 日志仅包含 attempt 计数和错误消息，无敏感数据 |

---

*本报告由 Guard Agent 自动生成，基于 `git diff` 逐行审查及跨文件一致性校验。*
