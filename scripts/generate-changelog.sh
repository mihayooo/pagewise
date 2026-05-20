#!/bin/bash
# 智阅 PageWise — CHANGELOG 自动生成脚本 (R214)
# 从 git log 解析 conventional commits 生成 CHANGELOG 条目
# 用法:
#   bash scripts/generate-changelog.sh                    # 从上次 tag 到 HEAD
#   bash scripts/generate-changelog.sh v3.0.0 v3.1.0     # 指定范围
#   bash scripts/generate-changelog.sh --unreleased       # 所有未发布 commit
#   bash scripts/generate-changelog.sh --output CHANGELOG.md

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }

FROM_REF=""; TO_REF="HEAD"; OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unreleased)
      FROM_REF=$(git tag --sort=-v:refname | head -1)
      [ -z "$FROM_REF" ] && FROM_REF=$(git rev-list --max-parents=0 HEAD | head -1)
      shift ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    *)
      if [ -z "$FROM_REF" ]; then FROM_REF="$1"
      else TO_REF="$1"; fi; shift ;;
  esac
done

if [ -z "$FROM_REF" ]; then
  FROM_REF=$(git tag --sort=-v:refname | head -1)
  [ -z "$FROM_REF" ] && FROM_REF=$(git rev-list --max-parents=0 HEAD | head -1)
fi

info "生成 CHANGELOG: ${FROM_REF}..${TO_REF}"

LOG_RANGE="${FROM_REF}..${TO_REF}"
[ "$FROM_REF" = "$TO_REF" ] && LOG_RANGE="$FROM_REF"

COMMITS=$(git log "$LOG_RANGE" --pretty=format:"%H|%s|%an|%ad" --date=short 2>/dev/null || echo "")
[ -z "$COMMITS" ] && { info "没有找到 commit 记录"; exit 0; }

FEAT=""; FIX=""; REFACTOR=""; PERF=""; DOCS=""; TEST_=""; CHORE=""; CI_=""; OTHER=""

while IFS='|' read -r hash subject author date; do
  echo "$subject" | grep -q "^Merge " && continue
  if echo "$subject" | grep -qE '^(feat|fix|refactor|perf|docs|test|chore|ci)[:(]'; then
    TYPE=$(echo "$subject" | sed 's/^\([a-z]*\).*/\1/')
    DESC=$(echo "$subject" | sed 's/^[a-z]*[^:]*: *//')
  else
    TYPE="other"; DESC="$subject"
  fi
  SHORT=$(echo "$hash" | cut -c1-7)
  ENTRY="- ${DESC} (\`${SHORT}\`)"
  case "$TYPE" in
    feat)     FEAT="${FEAT}${ENTRY}\n" ;;
    fix)      FIX="${FIX}${ENTRY}\n" ;;
    refactor) REFACTOR="${REFACTOR}${ENTRY}\n" ;;
    perf)     PERF="${PERF}${ENTRY}\n" ;;
    docs)     DOCS="${DOCS}${ENTRY}\n" ;;
    test)     TEST_="${TEST_}${ENTRY}\n" ;;
    chore)    CHORE="${CHORE}${ENTRY}\n" ;;
    ci)       CI_="${CI_}${ENTRY}\n" ;;
    *)        OTHER="${OTHER}${ENTRY}\n" ;;
  esac
done <<< "$COMMITS"

TODAY=$(date +%Y-%m-%d)
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
OUTPUT="## [${VERSION}] - ${TODAY}\n"

[ -n "$FEAT" ]     && OUTPUT="${OUTPUT}\n### 新增\n$(echo -e "$FEAT")\n"
[ -n "$FIX" ]      && OUTPUT="${OUTPUT}\n### 修复\n$(echo -e "$FIX")\n"
[ -n "$REFACTOR" ] && OUTPUT="${OUTPUT}\n### 重构\n$(echo -e "$REFACTOR")\n"
[ -n "$PERF" ]     && OUTPUT="${OUTPUT}\n### 性能优化\n$(echo -e "$PERF")\n"
[ -n "$DOCS" ]     && OUTPUT="${OUTPUT}\n### 文档\n$(echo -e "$DOCS")\n"
[ -n "$TEST_" ]    && OUTPUT="${OUTPUT}\n### 测试\n$(echo -e "$TEST_")\n"
[ -n "$CI_" ]      && OUTPUT="${OUTPUT}\n### CI/CD\n$(echo -e "$CI_")\n"
[ -n "$CHORE" ]    && OUTPUT="${OUTPUT}\n### 其他\n$(echo -e "$CHORE")\n"
[ -n "$OTHER" ]    && OUTPUT="${OUTPUT}\n### 未分类\n$(echo -e "$OTHER")\n"
OUTPUT="${OUTPUT}\n---\n"

if [ -n "$OUTPUT_FILE" ]; then
  echo -e "$OUTPUT" > "$OUTPUT_FILE"
  ok "CHANGELOG 已写入: $OUTPUT_FILE"
else
  echo -e "$OUTPUT"
fi
