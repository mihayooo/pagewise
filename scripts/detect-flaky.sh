#!/usr/bin/env bash
# ==============================================================================
# detect-flaky.sh — Flaky Test Detection Script (R121)
#
# 连续运行 N 次测试（默认 3 次），比较结果一致性。
# 若某测试在部分运行中通过、部分失败，则标记为 flaky。
#
# 用法:
#   bash scripts/detect-flaky.sh              # 默认 3 次
#   bash scripts/detect-flaky.sh --runs 5     # 自定义次数
#   bash scripts/detect-flaky.sh --test-cmd "npm run test:ci"  # 自定义测试命令
#   bash scripts/detect-flaky.sh --output report.md            # 输出文件
#
# 输出: Markdown 格式报告（stdout 或指定文件）
# 退出码: 0 = 无 flaky, 1 = 发现 flaky, 2 = 参数错误
# ==============================================================================

set -euo pipefail

RUNS=3
TEST_CMD="npm run test 2>&1"
OUTPUT=""
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- 参数解析 ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs)    RUNS="$2"; shift 2 ;;
    --test-cmd) TEST_CMD="$2"; shift 2 ;;
    --output)  OUTPUT="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--runs N] [--test-cmd CMD] [--output FILE]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
  echo "Error: --runs must be a positive integer" >&2
  exit 2
fi

cd "$PROJECT_ROOT"

TMPDIR_RUN=$(mktemp -d)
trap 'rm -rf "$TMPDIR_RUN"' EXIT

echo "🔍 Flaky Test Detection: running tests $RUNS times..." >&2

# --- 运行 N 次测试 ---
for i in $(seq 1 "$RUNS"); do
  echo "  Run $i/$RUNS..." >&2
  RESULT_FILE="$TMPDIR_RUN/run-$i.txt"
  # 运行测试，捕获输出
  eval "$TEST_CMD" > "$RESULT_FILE" 2>&1 || true
  # 提取统计
  PASS=$(grep -oP '# pass \K\d+' "$RESULT_FILE" || echo "0")
  FAIL=$(grep -oP '# fail \K\d+' "$RESULT_FILE" || echo "0")
  DURATION=$(grep -oP '# duration_ms \K[0-9.]+' "$RESULT_FILE" || echo "0")
  echo "    pass=$PASS fail=$FAIL duration=${DURATION}ms" >&2
done

# --- 提取失败测试列表 ---
extract_failures() {
  local file="$1"
  grep "^not ok" "$file" 2>/dev/null | sed 's/^not ok [0-9]* - //' | sort
}

# --- 比较结果 ---
declare -A TEST_OUTCOMES  # test_name -> "pass" or "fail"
declare -A TEST_FAIL_COUNTS
FLAKY_TESTS=()
STABLE_FAILS=()
ALL_PASS=0
CONSISTENT=true

# 用临时文件收集每次的失败列表
for i in $(seq 1 "$RUNS"); do
  extract_failures "$TMPDIR_RUN/run-$i.txt" > "$TMPDIR_RUN/failures-$i.txt"
done

# 合并所有失败测试名称
cat "$TMPDIR_RUN"/failures-*.txt | sort -u > "$TMPDIR_RUN/all-failures.txt" 2>/dev/null || true

# 对每个曾失败的测试，检查各次运行结果
while IFS= read -r test_name; do
  [[ -z "$test_name" ]] && continue
  fail_count=0
  for i in $(seq 1 "$RUNS"); do
    if grep -qF "$test_name" "$TMPDIR_RUN/failures-$i.txt" 2>/dev/null; then
      ((fail_count++))
    fi
  done
  if [[ "$fail_count" -gt 0 ]] && [[ "$fail_count" -lt "$RUNS" ]]; then
    # 部分通过部分失败 → flaky
    FLAKY_TESTS+=("$test_name (fail: $fail_count/$RUNS)")
    CONSISTENT=false
  elif [[ "$fail_count" -eq "$RUNS" ]]; then
    # 每次都失败 → 稳定失败
    STABLE_FAILS+=("$test_name")
  fi
done < "$TMPDIR_RUN/all-failures.txt"

# --- 检查是否所有次运行的通过数一致 ---
FIRST_PASS=$(grep -oP '# pass \K\d+' "$TMPDIR_RUN/run-1.txt" || echo "0")
for i in $(seq 2 "$RUNS"); do
  CUR_PASS=$(grep -oP '# pass \K\d+' "$TMPDIR_RUN/run-$i.txt" || echo "0")
  if [[ "$CUR_PASS" != "$FIRST_PASS" ]]; then
    CONSISTENT=false
  fi
done

# --- 生成报告 ---
NOW=$(date '+%Y-%m-%d %H:%M:%S')

REPORT="# Flaky Test Detection Report\n\n"
REPORT+="> Generated: $NOW\n"
REPORT+="> Runs: $RUNS\n\n"

if [[ ${#FLAKY_TESTS[@]} -eq 0 ]]; then
  REPORT+="## ✅ No Flaky Tests Detected\n\n"
  REPORT+="All $RUNS runs produced consistent results.\n\n"
else
  REPORT+="## ⚠️ Flaky Tests Found: ${#FLAKY_TESTS[@]}\n\n"
  REPORT+="| # | Test Name | Fail Rate |\n"
  REPORT+="|---|-----------|----------|\n"
  idx=1
  for ft in "${FLAKY_TESTS[@]}"; do
    name="${ft% (fail: *}"
    rate="${ft#*(fail: }"
    rate="${rate%)}"
    REPORT+="| $idx | $name | $rate |\n"
    ((idx++))
  done
  REPORT+="\n"
fi

if [[ ${#STABLE_FAILS[@]} -gt 0 ]]; then
  REPORT+="## ❌ Stable Failures: ${#STABLE_FAILS[@]}\n\n"
  idx=1
  for sf in "${STABLE_FAILS[@]}"; do
    REPORT+="$idx. $sf\n"
    ((idx++))
  done
  REPORT+="\n"
fi

REPORT+="## Run Summary\n\n"
REPORT+="| Run | Pass | Fail | Duration (ms) |\n"
REPORT+="|-----|------|------|---------------|\n"
for i in $(seq 1 "$RUNS"); do
  P=$(grep -oP '# pass \K\d+' "$TMPDIR_RUN/run-$i.txt" || echo "0")
  F=$(grep -oP '# fail \K\d+' "$TMPDIR_RUN/run-$i.txt" || echo "0")
  D=$(grep -oP '# duration_ms \K[0-9.]+' "$TMPDIR_RUN/run-$i.txt" || echo "0")
  REPORT+="| $i | $P | $F | $D |\n"
done

REPORT_STR=$(echo -e "$REPORT")

if [[ -n "$OUTPUT" ]]; then
  echo "$REPORT_STR" > "$OUTPUT"
  echo "📄 Report written to: $OUTPUT" >&2
else
  echo "$REPORT_STR"
fi

# --- 退出码 ---
if [[ ${#FLAKY_TESTS[@]} -gt 0 ]]; then
  echo "⚠️ ${#FLAKY_TESTS[@]} flaky test(s) detected!" >&2
  exit 1
else
  echo "✅ No flaky tests." >&2
  exit 0
fi
