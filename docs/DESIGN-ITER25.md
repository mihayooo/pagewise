# 设计文档 — 迭代 25: R183 稳定性提升

> 日期: 2026-05-20
> 状态: 实现中

## 背景

项目现有 192 个 lib 模块、6422 个测试（3 个失败），存在以下稳定性隐患：

1. **coverage/tmp 权限问题**: `test-r156-coverage-infra.js` 中 3 个测试因 root 所有文件无法 `rmSync` 而 EACCES 失败
2. **边界数据处理缺失**: 多个模块缺乏对 null/undefined/非预期类型输入的防御性处理
3. **异步操作缺乏超时控制**: 关键异步操作（AI 调用、IndexedDB 读写）无超时保护
4. **缺少统一重试机制**: 各模块自实现重试逻辑或不重试

## 需求

1. **修复 3 个失败测试**: coverage/tmp 权限测试使用 shell 命令替代 Node.js fs API
2. **新建 `lib/stability-utils.js`**: 统一的防御性工具函数模块
3. **测试覆盖**: ≥30 用例覆盖所有工具函数
4. **零回归**: 全量测试通过，无新增失败

## 架构设计

### 新增模块: lib/stability-utils.js

```
┌─────────────────────────────────────────────────────────────────────┐
│ StabilityUtils (纯函数，零副作用，不依赖 DOM/Chrome API)            │
│                                                                     │
│ ── 类型安全 ──                                                      │
│   safeArray(val) → Array        确保返回数组（null/非数组 → []）     │
│   safeString(val) → string      确保返回字符串（null/非字符串 → ''） │
│   safeNumber(val, fallback) → number  确保返回有效数字               │
│   ensureArray(val) → Array      单值包装为数组，数组透传              │
│                                                                     │
│ ── 安全访问 ──                                                      │
│   safeGet(obj, path, fallback)  安全深度属性访问（支持 a.b.c 路径）  │
│   safeCall(fn, fallback, ...args) 安全函数调用（fn 非函数返回 fallback）│
│                                                                     │
│ ── 数值工具 ──                                                      │
│   clamp(val, min, max) → number 数值范围限制                        │
│   safeParseInt(val, fallback) → int  安全整数解析                    │
│   safeParseFloat(val, fallback) → float  安全浮点解析                │
│   safeDivide(a, b, fallback) → number  安全除法（防除零）            │
│                                                                     │
│ ── 异步工具 ──                                                      │
│   withTimeout(promise, ms, msg)  Promise 超时包装                    │
│   retryAsync(fn, retries, delay) 异步重试（指数退避）                │
│   safeAsync(fn, fallback)        异步错误边界                        │
│                                                                     │
│ ── 通用工具 ──                                                      │
│   debounce(fn, ms) → Function   防抖                                │
│   throttle(fn, ms) → Function   节流                                │
│   generateId(prefix?) → string  安全 ID 生成                        │
│   deepClone(obj) → any          深拷贝                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 修复 test-r156-coverage-infa.js

将 3 个 `rmSync` 调用改为 `execSync('rm -rf ...')`，避免 EACCES 权限问题。
Root 创建的文件通过 shell 的 `rm -rf` 在某些环境下可清理，若仍失败则 `skip` 测试。

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/stability-utils.js` — 防御性工具函数模块 |
| 新增 | `tests/test-stability-utils.js` — 稳定性工具测试 |
| 修改 | `tests/test-r156-coverage-infra.js` — 修复 3 个 EACCES 测试 |
| 修改 | `docs/IMPLEMENTATION.md` — 记录实现内容 |
| 修改 | `docs/CHANGELOG.md` — 记录变更 |
| 修改 | `docs/TODO.md` — 标记完成 |

## 技术决策

- **纯 ES Module**: 零依赖，可在任意上下文（Service Worker / Content Script / Sidebar）使用
- **纯函数**: 无副作用，所有函数接受输入返回输出，不修改输入数据
- **不替换现有函数**: stability-utils 作为新增工具层，不修改现有模块行为（向后兼容）
- **防御性默认值**: 所有 safe* 函数对无效输入返回安全默认值（空数组/空字符串/0/fallback），绝不抛异常
- **深拷贝使用 structuredClone**: 若可用则优先使用，否则 fallback 到 JSON 序列化
