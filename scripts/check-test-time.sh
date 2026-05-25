#!/usr/bin/env bash
# =============================================================================
# check-test-time.sh — R296: 测试执行性能回归防火墙 TestPerfRegressionWall
# =============================================================================
# 包装 npm run test:ci，捕获执行时间，与阈值比较。
# 若耗时超过阈值则 exit 1（CI 硬性阻断），防止未来退化。
#
# 用法:
#   bash scripts/check-test-time.sh          # 使用默认阈值 37s
#   TEST_TIME_THRESHOLD=50 bash scripts/check-test-time.sh  # 自定义阈值
#
# 环境变量:
#   TEST_TIME_THRESHOLD — 阈值（秒），默认 37
#
# 退出码:
#   0 = 测试通过且耗时 ≤ 阈值
#   1 = 测试失败或耗时 > 阈值
#   2 = 脚本参数/环境错误
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# --- 阈值配置 ---
THRESHOLD="${TEST_TIME_THRESHOLD:-37}"

# 验证阈值是正整数
if ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]] || [ "$THRESHOLD" -le 0 ]; then
  echo "❌ 错误: TEST_TIME_THRESHOLD 必须是正整数，当前值: '$THRESHOLD'"
  exit 2
fi

echo "========================================================"
echo "  测试执行性能回归防火墙 (TestPerfRegressionWall)"
echo "  R296: 阈值 = ${THRESHOLD}s"
echo "========================================================"
echo ""

# --- 计时执行 test:ci ---
START_TIME=$(date +%s)

# 执行 test:ci，保留完整输出（不吞输出），捕获 exit code
set +e
npm run test:ci 2>&1
TEST_EXIT_CODE=$?
set -e

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "========================================================"
echo "  执行结果"
echo "========================================================"
echo "  test:ci exit code : $TEST_EXIT_CODE"
echo "  执行时间          : ${ELAPSED}s"
echo "  阈值              : ${THRESHOLD}s"
echo "========================================================"

# --- 判定 ---
if [ "$TEST_EXIT_CODE" -ne 0 ]; then
  echo ""
  echo "❌ test:ci 测试失败 (exit code: $TEST_EXIT_CODE)"
  exit 1
fi

if [ "$ELAPSED" -gt "$THRESHOLD" ]; then
  echo ""
  echo "❌ 性能回归! 执行时间 ${ELAPSED}s 超过阈值 ${THRESHOLD}s (超出 $((ELAPSED - THRESHOLD))s)"
  echo "   请检查新增测试文件是否应归类到 test:ci:coverage 或 test:ci:release"
  exit 1
fi

echo ""
echo "✅ 性能门禁通过 — 执行时间 ${ELAPSED}s ≤ 阈值 ${THRESHOLD}s"
exit 0
