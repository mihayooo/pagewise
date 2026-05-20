#!/bin/bash
# 智阅 PageWise — 版本号自动管理脚本 (R214)
# 用法: bash scripts/bump-version.sh [patch|minor|major|X.Y.Z] [--dry-run]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }

DRY_RUN=false
VERSION_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) VERSION_ARG="$1"; shift ;;
  esac
done

if [ -z "$VERSION_ARG" ]; then
  fail "缺少版本号参数"
  echo "用法: bash scripts/bump-version.sh [patch|minor|major|X.Y.Z] [--dry-run]"
  exit 1
fi

# 读取当前版本
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [ -z "$CURRENT_VERSION" ]; then
  fail "无法从 package.json 读取当前版本号"
  exit 1
fi
info "当前版本: v${CURRENT_VERSION}"

# 计算新版本号
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$VERSION_ARG" in
  patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
  major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  [0-9]*.[0-9]*.[0-9]*)
    if echo "$VERSION_ARG" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      NEW_VERSION="$VERSION_ARG"
    else
      fail "无效的版本号格式: $VERSION_ARG"; exit 1
    fi ;;
  *) fail "无效参数: $VERSION_ARG (应为 patch|minor|major|X.Y.Z)"; exit 1 ;;
esac

if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  fail "新版本号 ($NEW_VERSION) 不能等于当前版本号"; exit 1
fi
info "新版本号: v${NEW_VERSION}"

if [ "$DRY_RUN" = true ]; then
  warn "DRY RUN 模式 — 不会实际修改文件"
  echo "将执行以下变更:"
  echo "  package.json:  $CURRENT_VERSION → $NEW_VERSION"
  echo "  manifest.json: $CURRENT_VERSION → $NEW_VERSION"
  echo "  CHANGELOG.md:  插入 ## [$NEW_VERSION] 区段"
  exit 0
fi

# 更新 package.json
info "更新 package.json..."
sed -i "s/\"version\": *\"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json
ok "package.json updated to ${NEW_VERSION}"

# 更新 manifest.json
info "更新 manifest.json..."
sed -i "s/\"version\": *\"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" manifest.json
ok "manifest.json updated to ${NEW_VERSION}"

# 更新 CHANGELOG.md
TODAY=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [${NEW_VERSION}] - ${TODAY}\n\n### 新增\n- 版本 ${NEW_VERSION} 发布\n\n---\n"

info "更新 CHANGELOG.md..."
if [ -f "docs/CHANGELOG.md" ]; then
  FIRST_SEP=$(grep -n "^---$" docs/CHANGELOG.md | head -1 | cut -d: -f1)
  if [ -n "$FIRST_SEP" ]; then
    INSERT_LINE=$((FIRST_SEP + 1))
    sed -i "${INSERT_LINE}i\\${CHANGELOG_ENTRY}" docs/CHANGELOG.md
  else
    echo -e "${CHANGELOG_ENTRY}" | cat - docs/CHANGELOG.md > /tmp/_cl_tmp && mv /tmp/_cl_tmp docs/CHANGELOG.md
  fi
  ok "CHANGELOG.md updated with [${NEW_VERSION}] section"
else
  warn "docs/CHANGELOG.md 不存在，跳过"
fi

# 验证版本一致性
PKG_VER=$(grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
MAN_VER=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')

if [ "$PKG_VER" = "$NEW_VERSION" ] && [ "$MAN_VER" = "$NEW_VERSION" ]; then
  ok "版本一致性验证通过: package.json=$PKG_VER, manifest.json=$MAN_VER"
else
  fail "版本一致性验证失败: package.json=$PKG_VER, manifest.json=$MAN_VER"
  exit 1
fi

echo ""
echo "========================================="
echo "  版本升级完成: v${CURRENT_VERSION} → v${NEW_VERSION}"
echo "========================================="
echo ""
echo "下一步:"
echo "  git add -A && git commit -m 'chore: bump version to v${NEW_VERSION}'"
echo "  git tag v${NEW_VERSION}"
echo "  git push origin master --tags"
echo ""
