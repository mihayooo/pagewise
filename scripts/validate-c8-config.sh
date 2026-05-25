#!/usr/bin/env bash
# =============================================================================
# validate-c8-config.sh — R291: CoverageConfigDriftGuard
# =============================================================================
# CI 门禁脚本: 解析 .c8rc.json 并验证关键字段
# 防止覆盖率配置"声明 vs 实际"漂移问题复发
# (历史 R192/R195/R256/R261 四次修复均因配置漂移复发)
#
# 验证项:
#   1. tmpDir 路径配置正确（不指向外部 /tmp）
#   2. reporter 列表包含 lcov + text-summary
#   3. include 覆盖 lib/
#   4. exclude 包含 tests
#   5. all 设为 true
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/.c8rc.json"

PASS=0
FAIL=0

# ---------- helpers ----------
pass() { echo "✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ $1"; FAIL=$((FAIL + 1)); }

echo "=== R291: c8 Configuration Drift Guard ==="
echo ""

# ---------- 0. 文件存在性 ----------
if [ ! -f "$CONFIG_FILE" ]; then
  fail ".c8rc.json not found at $CONFIG_FILE"
  echo ""
  echo "============================="
  echo "Guard Results: $PASS passed, $FAIL failed"
  echo "============================="
  exit 1
fi

pass ".c8rc.json exists"

# ---------- 1. JSON 合法性 ----------
if ! node -e "JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'))" 2>/dev/null; then
  fail ".c8rc.json is not valid JSON"
  echo ""
  echo "============================="
  echo "Guard Results: $PASS passed, $FAIL failed"
  echo "============================="
  exit 1
fi

pass ".c8rc.json is valid JSON"

# ---------- 2. tmpDir 验证 ----------
# R291: tmpDir 不应指向外部 /tmp 路径（防止 CI 环境漂移）
TMPDIR_VALUE=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  console.log(c.tmpDir || '');
" 2>/dev/null)

if [ -z "$TMPDIR_VALUE" ]; then
  fail "tmpDir is empty or not configured"
elif echo "$TMPDIR_VALUE" | grep -qE '^/tmp/'; then
  fail "tmpDir points to external /tmp path: $TMPDIR_VALUE (should be 'coverage/tmp')"
else
  pass "tmpDir configured correctly: $TMPDIR_VALUE"
fi

# ---------- 3. reporter 验证 ----------
# 必须包含 lcov + text-summary
REPORTERS=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  if (Array.isArray(c.reporter)) console.log(c.reporter.join(','));
  else console.log('');
" 2>/dev/null)

if echo "$REPORTERS" | grep -q "lcov"; then
  pass "reporter includes lcov"
else
  fail "reporter missing lcov (got: $REPORTERS)"
fi

if echo "$REPORTERS" | grep -q "text-summary"; then
  pass "reporter includes text-summary"
else
  fail "reporter missing text-summary (got: $REPORTERS)"
fi

if echo "$REPORTERS" | grep -q "html"; then
  pass "reporter includes html"
else
  fail "reporter missing html (got: $REPORTERS)"
fi

# ---------- 4. include 验证 ----------
# 必须覆盖 lib/
INCLUDE_VALUE=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  if (Array.isArray(c.include)) console.log(c.include.join(','));
  else console.log('');
" 2>/dev/null)

if echo "$INCLUDE_VALUE" | grep -q "lib/"; then
  pass "include covers lib/"
else
  fail "include does not cover lib/ (got: $INCLUDE_VALUE)"
fi

# ---------- 5. exclude 验证 ----------
EXCLUDE_VALUE=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  if (Array.isArray(c.exclude)) console.log(c.exclude.join(','));
  else console.log('');
" 2>/dev/null)

if echo "$EXCLUDE_VALUE" | grep -q "tests"; then
  pass "exclude includes tests"
else
  fail "exclude does not include tests (got: $EXCLUDE_VALUE)"
fi

# ---------- 6. all 验证 ----------
ALL_VALUE=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  console.log(c.all === true ? 'true' : 'false');
" 2>/dev/null)

if [ "$ALL_VALUE" = "true" ]; then
  pass "all is set to true"
else
  fail "all is not true (got: $ALL_VALUE)"
fi

# ---------- 7. tmpDir 与 test:coverage 脚本一致性 ----------
# R291: 确保 test:coverage 创建的目录与 tmpDir 一致
if [ "$TMPDIR_VALUE" = "coverage/tmp" ] || [ "$TMPDIR_VALUE" = "./coverage/tmp" ]; then
  TEST_COVERAGE=$(node -e "
    const p = JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/package.json','utf8'));
    console.log(p.scripts['test:coverage'] || '');
  " 2>/dev/null)

  if echo "$TEST_COVERAGE" | grep -q "mkdir -p coverage/tmp"; then
    pass "tmpDir consistent with test:coverage mkdir -p"
  else
    fail "tmpDir is '$TMPDIR_VALUE' but test:coverage does not create coverage/tmp"
  fi
else
  pass "tmpDir uses custom path: $TMPDIR_VALUE (skipping test:coverage consistency check)"
fi

# =============================================================================
echo ""
echo "============================="
echo "c8 Config Guard: $PASS passed, $FAIL failed"
echo "============================="

if [ "$FAIL" -gt 0 ]; then
  echo "🚨 c8 config drift guard FAILED — see above for details."
  exit 1
else
  echo "✅ c8 config drift guard PASSED."
  exit 0
fi
