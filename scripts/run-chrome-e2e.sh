#!/bin/bash
# scripts/run-chrome-e2e.sh — R211 真实 Chrome E2E 测试运行脚本
#
# 用法:
#   npm run test:chrome-e2e
#   ./scripts/run-chrome-e2e.sh [--headed] [--filter=<pattern>]
#
# 环境要求:
#   - Node.js >= 18
#   - Chrome / Chromium 浏览器
#   - playwright (npm devDependency)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "  R211: 真实 Chrome 环境 E2E 验证"
echo "========================================="
echo ""

# 检查 Chrome 是否可用
CHROME_PATH=""
if command -v google-chrome &>/dev/null; then
  CHROME_PATH="google-chrome"
elif command -v chromium-browser &>/dev/null; then
  CHROME_PATH="chromium-browser"
elif command -v chromium &>/dev/null; then
  CHROME_PATH="chromium"
fi

if [ -z "$CHROME_PATH" ]; then
  echo "❌ 未找到 Chrome/Chromium 浏览器"
  echo "   请安装 Chrome: https://www.google.com/chrome/"
  exit 1
fi

echo "✅ Chrome 路径: $(which $CHROME_PATH)"
echo "   版本: $($CHROME_PATH --version 2>/dev/null || echo 'unknown')"
echo ""

# 检查 Playwright 是否可用
if ! npx playwright --version &>/dev/null; then
  echo "❌ Playwright 未安装，正在安装..."
  npm install --save-dev playwright
fi

echo "✅ Playwright 版本: $(npx playwright --version 2>/dev/null || echo 'unknown')"
echo ""

# 清理旧的 profile
rm -rf "$PROJECT_DIR/.chrome-profile-r211" 2>/dev/null || true

# 解析参数
HEADED=""
FILTER=""
for arg in "$@"; do
  case $arg in
    --headed)
      HEADED="--headed"
      ;;
    --filter=*)
      FILTER="${arg#*=}"
      ;;
  esac
done

# 运行测试
echo "🚀 开始 E2E Chrome 测试..."
echo ""

TEST_FILES="tests/e2e-chrome/test-*.js"
if [ -n "$FILTER" ]; then
  TEST_FILES="tests/e2e-chrome/test-*${FILTER}*.js"
fi

# 使用 node --test 运行 (因为测试使用 node:test 的 describe/it)
EXIT_CODE=0
node --test --test-concurrency=1 --test-timeout=60000 $TEST_FILES 2>&1 || EXIT_CODE=$?

echo ""
echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "  ✅ E2E Chrome 测试全部通过"
else
  echo "  ❌ E2E Chrome 测试存在失败 (exit code: $EXIT_CODE)"
fi
echo "========================================="

# 清理 profile
rm -rf "$PROJECT_DIR/.chrome-profile-r211" 2>/dev/null || true

exit $EXIT_CODE
