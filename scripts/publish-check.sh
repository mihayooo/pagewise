#!/bin/bash
# 智阅 PageWise — 发布前自检脚本 (R208)
# 用途：在上传 Chrome Web Store 前执行自动化检查
#
# 用法:
#   bash scripts/publish-check.sh
#
# 检查项:
#   1. manifest.json 与 package.json 版本一致性
#   2. 权限最小化审计（标注宽泛匹配）
#   3. 必需图标存在性（16/48/128 px, > 100 bytes）
#   4. _locales 完整性（zh_CN 与 en key 一致）
#   5. default_locale 目录存在
#   6. 无残留开发文件
#   7. 安全审计（eval/内联脚本/HTTPS）
#
# 退出码:
#   0 = 全部通过
#   1 = 存在 FAIL 项

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ── 颜色输出 ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
  echo -e "  ${GREEN}✓ PASS${NC} $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo -e "  ${RED}✗ FAIL${NC} $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

warn() {
  echo -e "  ${YELLOW}⚠ WARN${NC} $1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

info() {
  echo -e "  ${CYAN}ℹ INFO${NC} $1"
}

section() {
  echo ""
  echo -e "${BOLD}[$1]${NC} $2"
  echo "  ─────────────────────────────────"
}

# ── 读取版本号 ────────────────────────────────────────────────
read_json_field() {
  local file="$1"
  local field="$2"
  grep "\"$field\"" "$file" | head -1 | sed "s/.*\"$field\": *\"\([^\"]*\)\".*/\1/"
}

echo ""
echo "========================================="
echo "  智阅 PageWise — 发布前自检"
echo "========================================="

# ══════════════════════════════════════════
# 检查 1: manifest 版本一致性
# ══════════════════════════════════════════
section "1/7" "Manifest 版本一致性"

MANIFEST_VERSION=$(read_json_field manifest.json version)
PKG_VERSION=$(read_json_field package.json version)

if [ -z "$MANIFEST_VERSION" ]; then
  fail "无法从 manifest.json 读取 version"
elif [ -z "$PKG_VERSION" ]; then
  fail "无法从 package.json 读取 version"
elif [ "$MANIFEST_VERSION" = "$PKG_VERSION" ]; then
  pass "版本一致: manifest.json = package.json = $MANIFEST_VERSION"
else
  fail "版本不一致: manifest.json($MANIFEST_VERSION) ≠ package.json($PKG_VERSION)"
fi

# ══════════════════════════════════════════
# 检查 2: 权限最小化审计
# ══════════════════════════════════════════
section "2/7" "权限最小化审计"

# 提取 permissions
info "manifest.json 中声明的权限:"

PERM_LINE=$(grep -A 50 '"permissions"' manifest.json | head -20)
echo "$PERM_LINE" | while IFS= read -r line; do
  if echo "$line" | grep -q '"[a-zA-Z]'; then
    perm=$(echo "$line" | sed 's/.*"\([a-zA-Z_]*\)".*/\1/' | tr -d ',')
    if [ -n "$perm" ] && [ "$perm" != "permissions" ]; then
      echo "    • $perm"
    fi
  fi
done

# 检查 host_permissions
HOST_PERMS=$(grep -A 20 '"host_permissions"' manifest.json)
if echo "$HOST_PERMS" | grep -q '<all_urls>'; then
  warn "host_permissions 包含 <all_urls> — 请确认是否为最小权限"
else
  pass "host_permissions 未使用 <all_urls>"
fi

# 检查 content_scripts matches
if grep -q '"<all_urls>"' manifest.json; then
  warn "content_scripts 使用 <all_urls> 匹配 — 请确认是否必要"
else
  pass "content_scripts 未使用 <all_urls>"
fi

pass "权限审计完成（以上为人工确认项）"

# ══════════════════════════════════════════
# 检查 3: 必需图标存在
# ══════════════════════════════════════════
section "3/7" "必需图标存在"

ALL_ICONS_OK=true
# 检查图标: icon16.png, icon48.png, icon128.png
for size in 16 48 128; do
  icon="icons/icon${size}.png"
  if [ ! -f "$icon" ]; then
    fail "缺少图标: $icon"
    ALL_ICONS_OK=false
  else
    icon_size=$(wc -c < "$icon")
    if [ "$icon_size" -lt 100 ]; then
      fail "图标 $icon 文件过小 (${icon_size} bytes)，可能为空文件"
      ALL_ICONS_OK=false
    else
      pass "$icon 存在 (${icon_size} bytes)"
    fi
  fi
done

# 检查 manifest.json 中声明了图标
for size in 16 48 128; do
  if ! grep -q "icon${size}.png" manifest.json; then
    warn "manifest.json 中未声明 icon${size}.png"
  fi
done

# ══════════════════════════════════════════
# 检查 4: _locales 完整性
# ══════════════════════════════════════════
section "4/7" "国际化 (_locales) 完整性"

LOCALES_DIR="_locales"

if [ ! -d "$LOCALES_DIR" ]; then
  fail "_locales/ 目录不存在"
else
  # 检查 zh_CN 和 en 存在
  if [ ! -f "$LOCALES_DIR/zh_CN/messages.json" ]; then
    fail "缺少 $LOCALES_DIR/zh_CN/messages.json"
  else
    pass "zh_CN/messages.json 存在"
  fi

  if [ ! -f "$LOCALES_DIR/en/messages.json" ]; then
    fail "缺少 $LOCALES_DIR/en/messages.json"
  else
    pass "en/messages.json 存在"
  fi

  # 比较 key 一致性
  if [ -f "$LOCALES_DIR/zh_CN/messages.json" ] && [ -f "$LOCALES_DIR/en/messages.json" ]; then
    ZH_KEYS=$(node -e "const m=JSON.parse(require('fs').readFileSync('$LOCALES_DIR/zh_CN/messages.json','utf-8')); console.log(Object.keys(m).sort().join('\n'))" 2>/dev/null || echo "")
    EN_KEYS=$(node -e "const m=JSON.parse(require('fs').readFileSync('$LOCALES_DIR/en/messages.json','utf-8')); console.log(Object.keys(m).sort().join('\n'))" 2>/dev/null || echo "")

    if [ -n "$ZH_KEYS" ] && [ -n "$EN_KEYS" ]; then
      MISSING_IN_EN=$(comm -23 <(echo "$ZH_KEYS") <(echo "$EN_KEYS"))
      MISSING_IN_ZH=$(comm -13 <(echo "$ZH_KEYS") <(echo "$EN_KEYS"))

      if [ -n "$MISSING_IN_EN" ]; then
        fail "zh_CN 中有但 en 中缺少的 key: $MISSING_IN_EN"
      fi

      if [ -n "$MISSING_IN_ZH" ]; then
        fail "en 中有但 zh_CN 中缺少的 key: $MISSING_IN_ZH"
      fi

      if [ -z "$MISSING_IN_EN" ] && [ -z "$MISSING_IN_ZH" ]; then
        ZH_COUNT=$(echo "$ZH_KEYS" | wc -l)
        pass "zh_CN 与 en message key 完全一致 ($ZH_COUNT 个)"
      fi
    else
      warn "无法解析 messages.json 进行 key 比较"
    fi
  fi
fi

# ══════════════════════════════════════════
# 检查 5: default_locale 存在
# ══════════════════════════════════════════
section "5/7" "default_locale 目录存在"

DEFAULT_LOCALE=$(read_json_field manifest.json default_locale)

if [ -z "$DEFAULT_LOCALE" ]; then
  fail "manifest.json 中未定义 default_locale"
elif [ ! -d "$LOCALES_DIR/$DEFAULT_LOCALE" ]; then
  fail "default_locale ($DEFAULT_LOCALE) 目录不存在: $LOCALES_DIR/$DEFAULT_LOCALE/"
elif [ ! -f "$LOCALES_DIR/$DEFAULT_LOCALE/messages.json" ]; then
  fail "$LOCALES_DIR/$DEFAULT_LOCALE/messages.json 不存在"
else
  pass "default_locale '$DEFAULT_LOCALE' 目录和 messages.json 存在"
fi

# ══════════════════════════════════════════
# 检查 6: 无残留开发文件
# ══════════════════════════════════════════
section "6/7" "无残留开发文件检查"

# 检查 build.sh 的白名单（排除旧版 locales/）
if [ -d "locales" ]; then
  warn "项目中存在 locales/ 目录（旧版格式），打包时应确保不包含（只含 _locales/）"
else
  pass "无旧版 locales/ 目录"
fi

# 检查 build.sh 不复制 tests/docs/coverage/scripts
BUILD_CONTENT=$(cat scripts/build.sh 2>/dev/null || echo "")
if echo "$BUILD_CONTENT" | grep -q "INCLUDE_DIRS"; then
  pass "build.sh 使用白名单模式复制目录"
else
  warn "build.sh 未明确使用白名单模式"
fi

# 确认关键排除目录
for dir in tests docs coverage scripts node_modules; do
  if [ -d "$dir" ]; then
    info "$dir/ 存在于项目中（打包时应排除）"
  fi
done

pass "残留文件检查完成"

# ══════════════════════════════════════════
# 检查 7: 安全审计
# ══════════════════════════════════════════
section "7/7" "安全审计"

# 检查 eval 使用（只扫描发布级目录，排除测试和覆盖率）
EVAL_FILES=""
for f in $(find lib background content popup sidebar options skills -name "*.js" -not -path "*/test*" 2>/dev/null); do
  # 匹配 eval( 但排除注释行和字符串中的 eval
  if grep -n '^\s*[^/]*\beval\s*(' "$f" 2>/dev/null | grep -v '^\s*//' | grep -v 'no-eval' | grep -v 'disable.*eval' | grep -v 'preventEval\|evalPattern\|evalCount\|_eval\|isEval\|eval_' | head -1 > /dev/null 2>&1; then
    EVAL_FILES="$EVAL_FILES $(basename $f)"
  fi
done

if [ -n "$EVAL_FILES" ]; then
  warn "以下文件可能包含 eval() 调用（需人工确认）:$EVAL_FILES"
else
  pass "无 eval() 使用"
fi

# 检查内联脚本（排除 coverage/ 和 node_modules/）
INLINE_COUNT=0
for f in $(find . -name "*.html" -not -path "./node_modules/*" -not -path "./tests/*" -not -path "./docs/*" -not -path "./dist/*" -not -path "./coverage/*" 2>/dev/null); do
  if grep -q '<script' "$f" 2>/dev/null; then
    # Check for inline scripts (script tag without src=)
    if grep '<script' "$f" | grep -v 'src=' | grep -v 'type="importmap"' | grep -q '<script[> ]'; then
      INLINE_COUNT=$((INLINE_COUNT + 1))
      info "  内联脚本: $f"
    fi
  fi
done

if [ "$INLINE_COUNT" -gt 0 ]; then
  warn "发现 $INLINE_COUNT 个 HTML 文件包含内联脚本（MV3 不允许）"
else
  pass "无内联 <script> 标签"
fi

# 检查非 HTTPS 外部资源
HTTP_REFS=""
for f in $(find lib background content popup sidebar options skills -name "*.js" 2>/dev/null); do
  matches=$(grep -n 'http://' "$f" 2>/dev/null | grep -v 'localhost' | grep -v '127.0.0.1' | grep -v 'xmlns' | grep -v '@type' | grep -v '//' | grep -v 'http://www.w3.org' || true)
  if [ -n "$matches" ]; then
    HTTP_REFS="$HTTP_REFS\n$(basename $f)"
  fi
done

if [ -n "$HTTP_REFS" ]; then
  warn "发现非 HTTPS 外部资源引用（需人工确认）"
else
  pass "无非 HTTPS 外部资源引用"
fi

# ── 检查报告 ──────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  自检报告"
echo "========================================="
echo ""
echo -e "  ${GREEN}PASS${NC}: $PASS_COUNT"
echo -e "  ${RED}FAIL${NC}: $FAIL_COUNT"
echo -e "  ${YELLOW}WARN${NC}: $WARN_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo -e "${RED}${BOLD}存在 $FAIL_COUNT 个 FAIL 项，请修复后重试。${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}全部检查通过! ✅${NC}"
  echo ""
  echo "下一步:"
  echo "  bash scripts/build.sh chrome  # 生成 .zip 产物"
  echo "  然后上传至 https://chrome.google.com/webstore/devconsole"
  exit 0
fi
