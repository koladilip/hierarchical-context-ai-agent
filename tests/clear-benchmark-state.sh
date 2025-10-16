#!/bin/bash
# tests/clear-benchmark-state.sh
# Clear benchmark state and old reports to start fresh

echo "🧹 Clearing benchmark state..."

# Remove state file
if [ -f ".benchmark-state.json" ]; then
  rm .benchmark-state.json
  echo "✅ Removed .benchmark-state.json"
else
  echo "ℹ️  No state file found"
fi

# Count and show old reports
report_count=$(ls -1 benchmark-report-*.json 2>/dev/null | wc -l | tr -d ' ')
quick_report_count=$(ls -1 quick-benchmark-*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$report_count" -gt 0 ] || [ "$quick_report_count" -gt 0 ]; then
  echo ""
  echo "📊 Found reports:"
  [ "$report_count" -gt 0 ] && echo "   - $report_count full benchmark reports"
  [ "$quick_report_count" -gt 0 ] && echo "   - $quick_report_count quick benchmark reports"
  echo ""
  read -p "Delete old reports? (y/N): " confirm
  
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    [ "$report_count" -gt 0 ] && rm benchmark-report-*.json
    [ "$quick_report_count" -gt 0 ] && rm quick-benchmark-*.json
    echo "✅ Deleted old reports"
  else
    echo "ℹ️  Kept old reports"
  fi
else
  echo "ℹ️  No old reports found"
fi

echo ""
echo "✨ Ready for fresh benchmark run!"

