#!/bin/bash
# 智阅 PageWise — Chrome Web Store 发布产物构建脚本 (R208)
# 用途：生成可直接上传到 Chrome Web Store 的 .zip 文件
#
# 用法:
#   bash scripts/build.sh              # 默认 Chrome
#   bash scripts/build.sh chrome       # Chrome
#   bash scripts/build.sh firefox      # Firefox
#   bash scripts/build.sh edge         # Edge
#   bash scripts/build.sh all          # 所有浏览器
#
# 产物: dist/pagewise-v{VERSION}-{browser}.zip
# 包含: manifest.json, background/, content/, popup/, options/,
#       sidebar/, lib/, skills/, icons/, _locales/
# 排除: tests/, docs/, coverage/, scripts/, locales/(旧版),
#       node_modules/, *.md, package.json, eslint.config.js 等

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ── 颜色输出 ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }

# ── 浏览器参数 ────────────────────────────────────────────────
BROWSER="${1:-chrome}"
BROWSER=$(echo "$BROWSER" | tr '[:upper:]' '[:lower:]')

case "$BROWSER" in
  chrome|firefox|edge|all) ;;
  *)
    echo "错误: 不支持的浏览器 '$BROWSER'"
    echo "用法: bash scripts/build.sh [chrome|firefox|edge|all]"
    exit 1
    ;;
esac

# ── 读取版本号 ────────────────────────────────────────────────
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  fail "无法从 manifest.json 读取版本号"
  exit 1
fi
info "版本号: v${VERSION}"

# ── 发布级目录白名单 ──────────────────────────────────────────
# 只复制这些目录到 .zip 产物中
INCLUDE_DIRS=(
  "icons"
  "background"
  "content"
  "popup"
  "sidebar"
  "options"
  "lib"
  "skills"
  "_locales"
)

# ── 打包单个浏览器 ────────────────────────────────────────────
build_browser() {
  local target="$1"
  local manifest_src=""
  local zip_name=""
  local temp_dir="$DIST_DIR/pagewise-${target}-build"
  local zip_path=""

  case "$target" in
    chrome)
      manifest_src="manifest.json"
      zip_name="pagewise-v${VERSION}-chrome.zip"
      ;;
    firefox)
      manifest_src="manifest.firefox.json"
      zip_name="pagewise-v${VERSION}-firefox.zip"
      ;;
    edge)
      manifest_src="manifest.edge.json"
      zip_name="pagewise-v${VERSION}-edge.zip"
      ;;
  esac

  zip_path="$DIST_DIR/$zip_name"

  echo ""
  echo "========================================="
  echo "打包 $target 版本 (v${VERSION})..."
  echo "========================================="
  echo ""

  # 检查 manifest 文件是否存在
  if [ ! -f "$manifest_src" ]; then
    fail "$manifest_src 不存在"
    return 1
  fi

  # 清理并创建临时目录
  rm -rf "$temp_dir"
  mkdir -p "$temp_dir"

  # 复制 manifest
  cp "$manifest_src" "$temp_dir/manifest.json"

  # 复制发布级目录（白名单模式）
  info "复制扩展文件（白名单模式）..."
  for dir in "${INCLUDE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      cp -r "$dir" "$temp_dir/"
      info "  ✓ $dir/"
    else
      warn "  ✗ $dir/ 不存在，跳过"
    fi
  done

  # 清理非必要文件（OS 生成 / 备份）
  info "清理非必要文件..."
  find "$temp_dir" -name ".DS_Store" -delete 2>/dev/null || true
  find "$temp_dir" -name "Thumbs.db" -delete 2>/dev/null || true
  find "$temp_dir" -name "*.bak" -delete 2>/dev/null || true
  find "$temp_dir" -name "*.tmp" -delete 2>/dev/null || true
  find "$temp_dir" -name "*.map" -delete 2>/dev/null || true

  # 移除 lib 中的非 Chrome 用途文件
  rm -f "$temp_dir/lib/pdf.worker.mjs" 2>/dev/null || true

  # 统计打包内容
  local file_count=$(find "$temp_dir" -type f | wc -l)
  local total_size=$(du -sb "$temp_dir" | cut -f1)
  info "文件数量: $file_count, 原始大小: $(numfmt --to=iec $total_size 2>/dev/null || echo "${total_size} bytes")"

  # 打包 zip
  if command -v zip &> /dev/null; then
    cd "$temp_dir"
    zip -r -q "$zip_path" .
    cd "$PROJECT_DIR"
  else
    fail "需要 zip 命令来打包"
    rm -rf "$temp_dir"
    return 1
  fi

  # 清理临时目录
  rm -rf "$temp_dir"

  # 输出结果
  local zip_size=$(stat -c%s "$zip_path" 2>/dev/null || stat -f%z "$zip_path" 2>/dev/null || wc -c < "$zip_path")
  echo ""
  ok "打包完成!"
  echo "  📦 文件: $zip_path"
  echo "  📊 大小: $(numfmt --to=iec $zip_size 2>/dev/null || echo "${zip_size} bytes")"

  # 体积检查 (Chrome Web Store 限制 10MB)
  local max_size=10485760  # 10MB
  if [ "$zip_size" -le "$max_size" ]; then
    ok "体积检查: ✅ ≤ 10MB"
  else
    fail "体积检查: ❌ > 10MB (Chrome Web Store 限制)"
  fi

  # 计算哈希
  if command -v sha256sum &> /dev/null; then
    local sha256=$(sha256sum "$zip_path" | cut -d' ' -f1)
    echo "  🔐 SHA-256: $sha256"
  fi

  echo ""
}

# ── 主流程 ────────────────────────────────────────────────────

echo ""
echo "========================================="
echo "  智阅 PageWise — 发布构建工具 (R208)"
echo "========================================="

DIST_DIR="$PROJECT_DIR/dist"

if [ "$BROWSER" = "all" ]; then
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  build_browser "chrome"
  build_browser "firefox"
  build_browser "edge"
  echo "========================================="
  echo "所有浏览器打包完成!"
  echo "========================================="
  echo ""
  echo "输出文件:"
  ls -lh "$DIST_DIR"/*.zip
else
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  build_browser "$BROWSER"
fi

echo ""
echo "下一步:"
echo "  1. 运行 bash scripts/publish-check.sh 执行发布前自检"
echo "  2. 在 Chrome 中加载测试: chrome://extensions → 开发者模式 → 加载已解压扩展程序"
echo "  3. 上传至 Chrome Web Store: https://chrome.google.com/webstore/devconsole"
echo ""
