#!/usr/bin/env bash
set -euo pipefail

service="${1:?usage: measure-rss.sh SERVICE ENVIRONMENT WINDOW}"
environment="${2:?usage: measure-rss.sh SERVICE ENVIRONMENT WINDOW}"
window="${3:-15m}"
output="${RSS_OUTPUT:-.tmp/railway-rss-${service}-$(date -u +%Y%m%dT%H%M%SZ).json}"
mkdir -p "$(dirname "$output")"
railway metrics --service "$service" --environment "$environment" --memory --raw --since "$window" --json >"$output"
max="$(jq -er '[.measurements.MEMORY_USAGE_GB[]?.value] | if length == 0 then error("no memory samples") else max end' "$output")"
awk -v max="$max" 'BEGIN { if (max >= 0.4) { printf "FAIL: maximum RSS %.3f GB (must be < 0.4 GB)\n", max > "/dev/stderr"; exit 1 } printf "PASS: maximum RSS %.3f GB\n", max }'
echo "raw metrics: $output"
