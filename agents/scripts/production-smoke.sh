#!/usr/bin/env bash
set -euo pipefail

base_url="${AGENTS_BASE_URL:?AGENTS_BASE_URL is required}"
base_url="${base_url%/}"
auth_token="${SMOKE_AUTH_TOKEN:-}"
telegram_url="${TELEGRAM_HEALTH_URL:-}"
agents=(travel trends grocery fitness wellness expense oralboards presentation research spreadsheet resume)

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
get_json() { curl --fail --silent --show-error --max-time 20 "$1"; }

root_health="$(get_json "$base_url/health")"
jq -e '.status == "ok" and .checks.d1 == "ok" and .checks.r2 == "ok"' <<<"$root_health" >/dev/null || fail "gateway storage health"
pass "gateway storage health"

for agent in "${agents[@]}"; do
  get_json "$base_url/$agent/health" | jq -e '.status == "ok"' >/dev/null || fail "$agent health"
  get_json "$base_url/$agent/agui/capabilities" | jq -e '.transport.streaming and .state.persistentState and .tools.clientProvided' >/dev/null || fail "$agent capabilities"
done
pass "all ${#agents[@]} registered AG-UI routes"

unauth_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
  -H 'content-type: application/json' --data '{"threadId":"smoke-protected"}' "$base_url/travel/agents/state")"
[[ "$unauth_status" == "401" ]] || fail "protected state rejects anonymous request (got $unauth_status)"
pass "protected state rejects anonymous request"

run_id="smoke-$(date -u +%s)"
resume_body="$(jq -nc --arg run "$run_id" '{threadId:$run,runId:$run,messages:[{id:"user-1",role:"user",content:"Reply with exactly: GO_RUNTIME_OK"}],tools:[],context:[],state:{}}')"
curl --fail --silent --show-error --no-buffer --max-time 90 \
  -H 'content-type: application/json' --data "$resume_body" "$base_url/resume/agui" >"$tmp/resume.sse"
rg -q 'RUN_STARTED' "$tmp/resume.sse" && rg -q 'RUN_FINISHED' "$tmp/resume.sse" || fail "public resume AG-UI run"
pass "public resume AG-UI run"

curl --fail --silent --show-error --max-time 20 -H 'content-type: application/json' \
  --data "$(jq -nc --arg thread "$run_id" '{threadId:$thread}')" "$base_url/resume/agents/state" \
  | jq -e --arg thread "$run_id" '.threadId == $thread and (.messages | length) >= 1' >/dev/null || fail "public resume replay state"
pass "public resume replay state"

[[ -n "$auth_token" ]] || fail "SMOKE_AUTH_TOKEN is required for authenticated acceptance checks"
auth=(-H "authorization: Bearer $auth_token")

curl --fail --silent --show-error --max-time 20 "${auth[@]}" -H 'content-type: application/json' \
  --data '{"threadId":"smoke-protected"}' "$base_url/travel/agents/state" \
  | jq -e '.threadId == "smoke-protected"' >/dev/null || fail "authenticated protected state"
pass "authenticated protected state"

tool_run="smoke-tool-$(date -u +%s)"
tool_body="$(jq -nc --arg run "$tool_run" '{threadId:$run,runId:$run,messages:[{id:"user-1",role:"user",content:"Use the highlight_resume_section client tool to highlight experience."}],tools:[{name:"highlight_resume_section",description:"Highlight a resume section in the UI",parameters:{type:"object",properties:{section:{type:"string"}},required:["section"]}}],context:[],state:{}}')"
curl --fail --silent --show-error --no-buffer --max-time 90 "${auth[@]}" -H 'content-type: application/json' \
  --data "$tool_body" "$base_url/resume/agui" >"$tmp/client-tool.sse"
rg -q 'TOOL_CALL_START' "$tmp/client-tool.sse" || fail "client-tool AG-UI request"
pass "client-tool AG-UI request"

oauth_status="$(curl --silent --output "$tmp/oauth.out" --write-out '%{http_code}' --max-time 90 "${auth[@]}" \
  -H 'content-type: application/json' \
  --data "$(jq -nc '{threadId:"smoke-oauth",runId:"smoke-oauth",messages:[{id:"user-1",role:"user",content:"Say whether a Kroger credential was supplied; do not call Kroger."}],tools:[],context:[],state:{}}')" \
  "$base_url/grocery/agui")"
[[ "$oauth_status" == "200" ]] && rg -q 'RUN_FINISHED' "$tmp/oauth.out" || fail "gateway OAuth credential path"
pass "gateway OAuth credential path"

[[ -n "$telegram_url" ]] || fail "TELEGRAM_HEALTH_URL is required for worker acceptance"
get_json "${telegram_url%/}/health" | jq -e '.status == "ok"' >/dev/null || fail "Telegram worker health"
pass "Telegram worker health"
