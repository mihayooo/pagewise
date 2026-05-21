#!/usr/bin/env bash
# =============================================================================
# architecture-guard.sh — CI Architecture Guard
# =============================================================================
# R226: 超大模块行数门禁（lib/ 下 .js 文件 ≤400 行）
# R233: 覆盖率回归检测（与基线对比，退化 >2pp 则 CI fail）
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

# ---------- helpers ----------
pass() { echo "✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ $1"; FAIL=$((FAIL + 1)); }

# =============================================================================
# Part 1: Module Size Guard (R226)
# =============================================================================
echo "=== Part 1: Module Size Guard (lib/ ≤ 400 lines) ==="

MAX_LINES=400
OVERSIZED=()

while IFS= read -r -d '' file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$MAX_LINES" ]; then
    OVERSIZED+=("$(basename "$file") ($lines lines)")
  fi
done < <(find "$PROJECT_ROOT/lib" -name "*.js" -print0 2>/dev/null)

if [ ${#OVERSIZED[@]} -eq 0 ]; then
  pass "All lib/ modules ≤ $MAX_LINES lines"
else
  for item in "${OVERSIZED[@]}"; do
    fail "Module exceeds $MAX_LINES lines: $item"
  done
fi

# =============================================================================
# Part 2: Coverage Regression Detection (R233)
# =============================================================================
echo ""
echo "=== Part 2: Coverage Regression Detection (tolerance: 2pp) ==="

BASELINE_FILE="$PROJECT_ROOT/docs/reports/coverage-baseline.md"
REGRESSION_TOLERANCE=2  # percentage points

if [ ! -f "$BASELINE_FILE" ]; then
  echo "⚠️  Baseline file not found: $BASELINE_FILE"
  echo "   Skipping regression detection."
else
  # Parse baseline values from coverage-baseline.md
  # Expected format in the file: | Lines      | 12,048 | 50,872 | **23.68%** |
  parse_baseline() {
    local metric="$1"
    local value
    value=$(grep -A0 "^| $metric " "$BASELINE_FILE" | grep -oP '\*\*\K[0-9]+\.[0-9]+(?=%\*\*)' | head -1)
    if [ -z "$value" ]; then
      # fallback: try non-bold format
      value=$(grep -A0 "^| $metric " "$BASELINE_FILE" | grep -oP '[0-9]+\.[0-9]+%' | head -1 | tr -d '%')
    fi
    echo "$value"
  }

  BASELINE_LINES=$(parse_baseline "Lines")
  BASELINE_BRANCHES=$(parse_baseline "Branches")
  BASELINE_FUNCTIONS=$(parse_baseline "Functions")

  if [ -z "$BASELINE_LINES" ] || [ -z "$BASELINE_BRANCHES" ] || [ -z "$BASELINE_FUNCTIONS" ]; then
    echo "⚠️  Could not parse baseline values from $BASELINE_FILE"
    echo "   Lines=$BASELINE_LINES Branches=$BASELINE_BRANCHES Functions=$BASELINE_FUNCTIONS"
    echo "   Skipping regression detection."
  else
    echo "Baseline: Lines=${BASELINE_LINES}%  Branches=${BASELINE_BRANCHES}%  Functions=${BASELINE_FUNCTIONS}%"

    # Generate current coverage data using c8's JSON reporter
    COVERAGE_JSON="$PROJECT_ROOT/coverage/coverage-summary.json"
    if [ ! -f "$COVERAGE_JSON" ]; then
      echo "⚠️  Coverage summary not found at $COVERAGE_JSON"
      echo "   Run 'npm run test:coverage' first. Skipping regression detection."
    else
      # Parse current values from coverage-summary.json (ESM-compatible)
      read_current() {
        node --input-type=module -e "
          import fs from 'node:fs';
          const data = JSON.parse(fs.readFileSync('$COVERAGE_JSON', 'utf8'));
          console.log(data.total.$1.pct);
        " 2>/dev/null
      }

      CURRENT_LINES=$(read_current "lines")
      CURRENT_BRANCHES=$(read_current "branches")
      CURRENT_FUNCTIONS=$(read_current "functions")

      if [ -z "$CURRENT_LINES" ] || [ -z "$CURRENT_BRANCHES" ] || [ -z "$CURRENT_FUNCTIONS" ]; then
        echo "⚠️  Could not parse current coverage from JSON. Skipping regression detection."
      else
        echo "Current:  Lines=${CURRENT_LINES}%  Branches=${CURRENT_BRANCHES}%  Functions=${CURRENT_FUNCTIONS}%"

        # Compare using awk for floating-point arithmetic
        check_regression() {
          local metric="$1"
          local baseline="$2"
          local current="$3"
          local threshold
          threshold=$(awk "BEGIN { printf \"%.2f\", $baseline - $REGRESSION_TOLERANCE }")

          local regressed
          regressed=$(awk "BEGIN { print ($current < $threshold) ? 1 : 0 }")

          if [ "$regressed" -eq 1 ]; then
            fail "$metric regression: current ${current}% < baseline ${baseline}% - ${REGRESSION_TOLERANCE}pp (${threshold}%)"
          else
            pass "$metric: ${current}% ≥ ${threshold}% (baseline ${baseline}% - ${REGRESSION_TOLERANCE}pp)"
          fi
        }

        check_regression "Lines" "$BASELINE_LINES" "$CURRENT_LINES"
        check_regression "Branches" "$BASELINE_BRANCHES" "$CURRENT_BRANCHES"
        check_regression "Functions" "$BASELINE_FUNCTIONS" "$CURRENT_FUNCTIONS"
      fi
    fi
  fi
fi

# =============================================================================
# Part 3: Coverage Infrastructure Guard (R256)
# =============================================================================
echo ""
echo "=== Part 3: Coverage Infrastructure Guard (R256) ==="

COVERAGE_TMP_DIR="$PROJECT_ROOT/coverage/tmp"

if [ -d "$COVERAGE_TMP_DIR" ]; then
  pass "coverage/tmp directory exists"
else
  fail "coverage/tmp directory does not exist — run 'mkdir -p coverage/tmp' or 'npm run test:coverage'"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================="
echo "Guard Results: $PASS passed, $FAIL failed"
echo "============================="

if [ "$FAIL" -gt 0 ]; then
  echo "🚨 Architecture guard FAILED — see above for details."
  exit 1
else
  echo "✅ Architecture guard PASSED."
  exit 0
fi
