#!/usr/bin/env bash
# =============================================================================
# export_data.sh — Export all Supabase tables/views to CSV
# Usage: bash docs/exports/export_data.sh
# =============================================================================

SUPABASE_URL="https://psaidbntrvrzodurnisz.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYWlkYm50cnZyem9kdXJuaXN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg0MTE2NCwiZXhwIjoyMDkyNDE3MTY0fQ.R5pyhHhBlNN0Ezi60MRf2xGmMm8bwrTn_dyvbIWWNmM"
OUTPUT="$(dirname "$0")/data"

mkdir -p "$OUTPUT"

declare -A ROW_COUNTS

export_table() {
  local TABLE="$1"
  local FILENAME="${2:-$1}"
  echo -n "  Exporting $TABLE ... "
  HTTP_STATUS=$(curl -s -o "${OUTPUT}/${FILENAME}.csv" -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/${TABLE}?select=*&limit=2000" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Accept: text/csv")

  if [ "$HTTP_STATUS" = "200" ]; then
    LINES=$(wc -l < "${OUTPUT}/${FILENAME}.csv")
    ROWS=$(( LINES - 1 ))  # subtract header
    ROW_COUNTS["$FILENAME"]=$ROWS
    echo "OK — $ROWS rows"
  else
    BODY=$(cat "${OUTPUT}/${FILENAME}.csv")
    echo "ERROR HTTP $HTTP_STATUS — $BODY"
    ROW_COUNTS["$FILENAME"]="ERROR $HTTP_STATUS"
  fi
}

echo "=== SuccessionOS Data Export — $(date '+%Y-%m-%d %H:%M:%S') ==="
echo ""
echo "Exporting tables..."
export_table "employees"
export_table "departments"
export_table "key_positions"
export_table "succession_plans"
export_table "user_profiles"
export_table "assessment_cycles"
export_table "assessment_criteria"
export_table "assessment_scores"
export_table "assessment_summary"
export_table "external_scores"
export_table "score_weight_config"
export_table "career_roadmaps"
export_table "approval_requests"
export_table "approval_steps"
export_table "audit_logs"
export_table "idp_plans"
export_table "employee_extras"
export_table "mentoring_pairs"
export_table "calibration_sessions"
export_table "assessment_display_config"

echo ""
echo "Exporting views..."
export_table "v_employees" "VIEW_v_employees"
export_table "v_nine_box"  "VIEW_v_nine_box"

echo ""
echo "=== Summary ==="
for KEY in "${!ROW_COUNTS[@]}"; do
  printf "  %-35s %s rows\n" "$KEY" "${ROW_COUNTS[$KEY]}"
done | sort

echo ""
echo "Export complete. Files saved to: $OUTPUT"
