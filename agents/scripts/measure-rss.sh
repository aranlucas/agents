#!/usr/bin/env bash
set -euo pipefail

service="${1:?usage: measure-rss.sh SERVICE ENVIRONMENT WINDOW}"
environment="${2:?usage: measure-rss.sh SERVICE ENVIRONMENT WINDOW}"
window="${3:?usage: measure-rss.sh SERVICE ENVIRONMENT WINDOW}"
output="${RSS_OUTPUT:-agents/.tmp/railway-rss-${service}-$(date -u +%Y%m%dT%H%M%SZ).json}"
mkdir -p "$(dirname "$output")"
railway metrics --service "$service" --environment "$environment" --since "$window" --json >"$output"
max="$(jq '[.. | objects | select(has("measurement")) | select(.measurement == "MEMORY_USAGE_GB") | .value] | max // 999' "$output")"
awk -v max="$max" 'BEGIN { if (max >= 0.4) { printf "FAIL: maximum RSS %.3f GB (must be < 0.4 GB)\n", max > "/dev/stderr"; exit 1 } printf "PASS: maximum RSS %.3f GB\n", max }'
echo "raw metrics: $output"
