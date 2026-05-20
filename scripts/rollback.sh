#!/bin/bash
# 智阅 PageWise — 版本回滚脚本 (R214)
# 用法:
#   bash scripts/rollback.sh v3.1.0          # 回滚到 v3.1.0
#   bash scripts/rollback.sh --list           # 列出可回滚版本
#   bash scripts/rollback.sh --current        # 显示当前版本
#   bash scripts/rollback.sh --dry-run v3.1.0 # 预览模式

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }

DRY_RUN=false; ACTION=""; TARGET_VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) ACTION="list"; shift ;;
    --current) ACTION="current"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) TARGET_VERSION="$1"; shift ;;
  esac
done

# 列出可回滚版本
if [ "$ACTION" = "list" ]; then
  echo ""; echo "可回滚版本列表:"; echo "─────────────────────────────────────"
  git tag --sort=-v:refname | grep '^v' | while read -r tag; do
    DATE=$(git log -1 --format=%ad --date=short "$tag" 2>/dev/null || echo "unknown")
    echo "  $tag  ($DATE)"
  done
  echo ""
  CURRENT=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  echo "当前版本: v${CURRENT}"; echo ""; exit 0
fi

# 显示当前版本
if [ "$ACTION" = "current" ]; then
  CURRENT=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  echo "当前版本: v${CURRENT}"; exit 0
fi

# 回滚流程
if [ -z "$TARGET_VERSION" ]; then
  fail "缺少目标版本参数"
  echo "用法: bash scripts/rollback.sh v3.1.0"; exit 1
fi

echo "$TARGET_VERSION" | grep -q '^v' || TARGET_VERSION="v${TARGET_VERSION}"

if ! git tag -l "$TARGET_VERSION" | grep -q "$TARGET_VERSION"; then
  fail "Tag $TARGET_VERSION 不存在"
  echo "可用版本:"; git tag --sort=-v:refname | head -10; exit 1
fi

CURRENT_VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
info "当前版本: v${CURRENT_VERSION}"
info "回滚目标: ${TARGET_VERSION}"

if [ "$DRY_RUN" = true ]; then
  warn "DRY RUN 模式 — 不会实际执行回滚"
  echo "将执行以下步骤:"
  echo "  1. git checkout ${TARGET_VERSION}"
  echo "  2. bash scripts/publish-check.sh"
  echo "  3. bash scripts/build.sh chrome"
  echo "  4. 上传 dist/*.zip 到 Chrome Web Store"
  echo "  5. git checkout master"
  exit 0
fi

CURRENT_BRANCH=$(git branch --show-current)
info "保存当前分支: ${CURRENT_BRANCH}"

info "切换到 ${TARGET_VERSION}..."
git checkout "$TARGET_VERSION"

info "运行发布前检查..."
if bash scripts/publish-check.sh; then
  ok "发布前检查通过"
else
  warn "发布前检查有警告，继续回滚流程"
fi

info "构建 .zip 产物..."
bash scripts/build.sh chrome

info "切回原分支: ${CURRENT_BRANCH}..."
git checkout "$CURRENT_BRANCH"

echo ""
echo "========================================="
echo "  回滚构建完成"
echo "========================================="
echo ""
echo "产物位置: dist/"
ls -lh dist/*.zip 2>/dev/null || echo "  (无产物)"
echo ""
echo "下一步操作:"
echo "  1. 在 Chrome Web Store Developer Dashboard 上传 dist/ 中的 .zip"
echo "  2. 设置发布比例为 100%（全量回滚）"
echo "  3. 提交审核"
echo "  4. 通知用户已回滚到 ${TARGET_VERSION}"
echo ""

echo "恢复到最新版本:"
echo "  git checkout ${CURRENT_BRANCH}"
echo ""
