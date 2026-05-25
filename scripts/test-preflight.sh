#!/usr/bin/env bash
# =============================================================================
# test-preflight.sh — R295: Test Infrastructure Reliability Preflight
# =============================================================================
# 在 test:ci 执行前运行预检，确保测试基础设施就绪。
# 预检失败标记为基础设施错误而非测试失败。
#
# 检查项:
#   1. Node.js 版本 ≥ 18
#   2. node_modules/.package-lock.json 存在
#   3. 所有 test-*.js 文件可 import（无语法错误）
#   4. .c8rc.json 可解析
#   5. manifest.json 可解析
#   6. package.json scripts 必需项完整
#   7. test:ci 命令非空
#   8. lib/ 目录包含核心模块
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

PASS=0
FAIL=0
WARN=0

# ---------- helpers ----------
pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN + 1)); }

echo "========================================================"
echo "  测试基础设施预检 (Test Infrastructure Preflight)"
echo "  R295: TestInfraReliability"
echo "========================================================"
echo ""

# ---------- 1. Node.js 版本 ≥ 18 ----------
echo "▸ [1/8] 检查 Node.js 版本 ..."
if ! command -v node &>/dev/null; then
  fail "node 命令不可用"
else
  NODE_VERSION=$(node -v | sed 's/^v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 18 ] 2>/dev/null; then
    pass "Node.js 版本: $(node -v) (≥ 18 ✓)"
  else
    fail "Node.js 版本 $(node -v) 低于 18，测试需要 Node.js ≥ 18"
  fi
fi

# ---------- 2. node_modules/.package-lock.json 存在 ----------
echo "▸ [2/8] 检查 node_modules 依赖安装 ..."
if [ -f "node_modules/.package-lock.json" ]; then
  pass "node_modules/.package-lock.json 存在"
else
  fail "node_modules/.package-lock.json 不存在 — 请先运行 npm install"
fi

# 必需依赖检查
for dep in eslint c8; do
  if [ -d "node_modules/$dep" ]; then
    pass "依赖 $dep 已安装"
  else
    fail "依赖 $dep 未安装"
  fi
done

# ---------- 3. test-*.js 语法检查（采样） ----------
echo "▸ [3/8] 检查测试文件语法（采样验证） ..."
SYNTAX_FAIL=0
SYNTAX_COUNT=0
# 采样 20 个测试文件
for f in $(find tests -name 'test-*.js' -not -name 'test-e2e-*' -not -path 'tests/e2e/*' -not -path 'tests/e2e-chrome/*' | sort | head -20); do
  SYNTAX_COUNT=$((SYNTAX_COUNT + 1))
  if ! node --check "$f" 2>/dev/null; then
    fail "语法错误: $f"
    SYNTAX_FAIL=$((SYNTAX_FAIL + 1))
  fi
done
if [ "$SYNTAX_FAIL" -eq 0 ]; then
  pass "采样 $SYNTAX_COUNT 个测试文件语法检查全部通过"
else
  fail "$SYNTAX_FAIL/$SYNTAX_COUNT 个测试文件语法检查失败"
fi

# ---------- 4. .c8rc.json 可解析 ----------
echo "▸ [4/8] 检查 .c8rc.json 配置 ..."
if [ -f ".c8rc.json" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('.c8rc.json','utf8'))" 2>/dev/null; then
    pass ".c8rc.json 可解析"
  else
    fail ".c8rc.json 不是合法 JSON"
  fi
else
  fail ".c8rc.json 文件不存在"
fi

# ---------- 5. manifest.json 可解析 ----------
echo "▸ [5/8] 检查 manifest.json ..."
if [ -f "manifest.json" ]; then
  MANIFEST_OK=$(node -e "
    try {
      const m = JSON.parse(require('fs').readFileSync('manifest.json','utf8'));
      const required = ['manifest_version','name','version','permissions'];
      const missing = required.filter(f => !m[f]);
      if (missing.length > 0) { console.error('missing: ' + missing.join(',')); process.exit(1); }
      if (m.manifest_version !== 3) { console.error('manifest_version != 3'); process.exit(1); }
      console.log('ok');
    } catch(e) { console.error(e.message); process.exit(1); }
  " 2>&1) || true
  if [ "$MANIFEST_OK" = "ok" ]; then
    pass "manifest.json 合法 (MV3)"
  else
    fail "manifest.json 验证失败: $MANIFEST_OK"
  fi
else
  fail "manifest.json 不存在"
fi

# ---------- 6. package.json scripts 必需项完整 ----------
echo "▸ [6/8] 检查 package.json scripts ..."
REQUIRED_SCRIPTS="test:ci lint coverage:gate"
ALL_SCRIPTS_OK=true
for script in $REQUIRED_SCRIPTS; do
  SCRIPT_VAL=$(node -e "
    const p = JSON.parse(require('fs').readFileSync('package.json','utf8'));
    console.log(p.scripts['$script'] || '');
  " 2>/dev/null)
  if [ -z "$SCRIPT_VAL" ]; then
    fail "package.json 缺少 script: $script"
    ALL_SCRIPTS_OK=false
  fi
done
if [ "$ALL_SCRIPTS_OK" = "true" ]; then
  pass "package.json 包含所有必需 scripts: $REQUIRED_SCRIPTS"
fi

# ---------- 7. test:ci 命令非空且可扩展 ----------
echo "▸ [7/8] 验证 test:ci 命令可执行 ..."
TEST_CI_CMD=$(node -e "
  const p = JSON.parse(require('fs').readFileSync('package.json','utf8'));
  console.log(p.scripts['test:ci'] || '');
" 2>/dev/null)
if [ -n "$TEST_CI_CMD" ]; then
  # 验证命令包含 find + 测试路径
  if echo "$TEST_CI_CMD" | grep -q "find tests"; then
    pass "test:ci 命令包含 find tests（可动态发现测试文件）"
  else
    warn "test:ci 命令可能不包含动态文件发现"
  fi
  # 检查命令长度（防误删）
  CMD_LEN=${#TEST_CI_CMD}
  if [ "$CMD_LEN" -gt 20 ]; then
    pass "test:ci 命令长度 $CMD_LEN 字符（≥ 20 ✓）"
  else
    fail "test:ci 命令过短 ($CMD_LEN 字符)，可能被截断"
  fi
else
  fail "test:ci 命令为空"
fi

# ---------- 8. lib/ 目录包含核心模块 ----------
echo "▸ [8/8] 检查 lib/ 核心模块 ..."
CORE_MODULES="utils.js ai-client.js bookmark-indexer.js bookmark-graph.js storage-adapter.js"
MISSING_MODULES=""
for mod in $CORE_MODULES; do
  if [ ! -f "lib/$mod" ]; then
    MISSING_MODULES="$MISSING_MODULES $mod"
  fi
done
if [ -z "$MISSING_MODULES" ]; then
  LIB_COUNT=$(ls lib/*.js 2>/dev/null | wc -l)
  pass "lib/ 核心模块完整 ($LIB_COUNT 个文件)"
else
  fail "lib/ 缺少核心模块:$MISSING_MODULES"
fi

# =============================================================================
echo ""
echo "========================================================"
echo "  预检结果: $PASS 通过 / $FAIL 失败 / $WARN 警告"
echo "========================================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "🚨 测试基础设施预检失败 — 请修复上述问题后重试。"
  echo "   提示: 预检失败属于基础设施错误，不是测试失败。"
  exit 1
else
  echo ""
  echo "✅ 测试基础设施预检通过 — 可以安全运行 test:ci。"
  exit 0
fi
