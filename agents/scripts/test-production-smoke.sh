#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
server_log="$(mktemp)"
default_output="$(mktemp)"
url_only_output="$(mktemp)"
full_output="$(mktemp)"
missing_output="$(mktemp)"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  rm -f "$server_log" "$default_output" "$url_only_output" "$full_output" "$missing_output"
}
trap cleanup EXIT

node "$script_dir/production-smoke-test-server.mjs" >"$server_log" 2>&1 &
server_pid=$!

base_url=""
for _ in $(seq 1 50); do
  candidate=""
  if read -r candidate <"$server_log" && [[ "$candidate" == http://* ]]; then
    base_url="$candidate"
    break
  fi
  sleep 0.1
done
[[ -n "$base_url" ]] || {
  cat "$server_log" >&2
  exit 1
}

run_smoke() {
  env AGENTS_BASE_URL="$base_url" SMOKE_AUTH_TOKEN=smoke-token "$@" \
    bash "$script_dir/production-smoke.sh"
}

run_smoke >"$default_output"
grep -q 'PASS: all 13 registered AG-UI routes' "$default_output"
grep -q 'SKIP: Telegram worker readiness' "$default_output"

run_smoke TELEGRAM_HEALTH_URL="$base_url/telegram" >"$url_only_output"
grep -q 'SKIP: Telegram worker readiness' "$url_only_output"

run_smoke REQUIRE_TELEGRAM_HEALTH=1 TELEGRAM_HEALTH_URL="$base_url/telegram" >"$full_output"
grep -q 'PASS: Telegram worker readiness' "$full_output"

if run_smoke REQUIRE_TELEGRAM_HEALTH=1 >"$missing_output" 2>&1; then
  echo "FAIL: missing Telegram URL unexpectedly passed" >&2
  exit 1
fi
grep -q 'TELEGRAM_HEALTH_URL is required when REQUIRE_TELEGRAM_HEALTH=1' "$missing_output"

echo "PASS: production smoke gateway-only and Telegram opt-in profiles"
