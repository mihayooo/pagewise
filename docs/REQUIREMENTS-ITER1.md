# REQUIREMENTS — Iteration 1

## 任务
修复 `getWeeklyStats` 单元测试的 day-of-week flaky bug

## 用户故事
作为开发者，我希望测试套件在任何一天运行都能全部通过，避免 CI/CD 因日期变化而间歇性失败。

## 验收标准
1. `test-review-session.js` 中 `getWeeklyStats` 的 3 个测试在周一至周日任何一天运行都通过
2. 测试覆盖的行为不变（本周统计、7天前排除、无数据零值）
3. 不修改生产代码 `lib/review-session.js` 的逻辑
4. `node --test tests/test-review-session.js` 零失败
5. 全量测试 `node --test tests/test-*.js` 总通过数不减少

## 技术约束
- 使用 `node:test` + `node:assert/strict`
- 不能引入外部 mock 库
- 测试必须自包含，不依赖系统时区以外的环境

## 依赖关系
- 无外部依赖
- 涉及文件: `tests/test-review-session.js` (测试) + `lib/review-session.js` (参考，不修改)
