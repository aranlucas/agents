#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: smoke-telegram.sh <image>}"
port="${SMOKE_TELEGRAM_PORT:-18098}"
container="$(docker create "$image")"
runtime_name=""
tmp="$(mktemp -d)"
cleanup() {
  [[ -z "$runtime_name" ]] || docker rm -f "$runtime_name" >/dev/null 2>&1 || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

files="$(docker export "$container" | tar -tf -)"
grep -Eqx '(\./)?app/agents' <<<"$files"
if grep -Eq '(^|/)(sh|bash|dash|ash|zsh|csh|tcsh|ksh|fish|busybox|python([0-9]+(\.[0-9]+)*)?|pypy[0-9]*|node(js)?|deno|bun|uv|perl([0-9.]+)?|ruby([0-9.]+)?|php([0-9.]+)?|lua([0-9.]+)?|tclsh([0-9.]+)?|pwsh|powershell)(\.exe)?$' <<<"$files"; then
  echo "FAIL: Telegram image contains a shell or scripting runtime" >&2
  exit 1
fi

image_user="$(docker image inspect --format '{{.Config.User}}' "$image")"
case "$image_user" in
  nonroot | nonroot:nonroot | 65532 | 65532:65532) ;;
  *)
    echo "FAIL: Telegram image runs as '$image_user', expected non-root user 65532" >&2
    exit 1
    ;;
esac

for binary in agents; do
  docker cp "$container:/app/$binary" "$tmp/$binary"
  if ! file "$tmp/$binary" | grep -q 'statically linked'; then
    echo "FAIL: /app/$binary is not statically linked" >&2
    file "$tmp/$binary" >&2
    exit 1
  fi
done
echo "OK: static agents binary, non-root image, no scripting runtimes"

runtime_name="agents-telegram-smoke-$$"
# The worker builds the same agents as the gateway, including the trends
# BigQuery client, so it needs an ephemeral service-account key.
private_key="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
google_credentials="$(jq -nc --arg private_key "$private_key" '{
  type: "service_account", project_id: "smoke-project", private_key_id: "smoke",
  private_key: $private_key, client_email: "smoke@smoke-project.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token"
}')"
docker run -d --rm --name "$runtime_name" -p "${port}:8080" \
  -e APP_ENV=development \
  -e PORT=8080 \
  -e OPENROUTER_API_KEY=smoke-fake-openrouter -e GROQ_API_KEY=smoke-fake-groq \
  -e NVIDIA_NIM_API_KEY=smoke-fake-nvidia -e MISTRAL_API_KEY=smoke-fake-mistral \
  -e GEMINI_API_KEY=smoke-fake-gemini -e GOOGLE_APPLICATION_CREDENTIALS_JSON="$google_credentials" \
  -e TELEGRAM_BOT_TOKEN=smoke:fake-token \
  "$image" telegram >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://localhost:${port}/live" | grep -q '"status":"ok"'; then
    echo "SMOKE PASS"
    exit 0
  fi
  sleep 1
done
docker logs "$runtime_name" >&2 || true
echo "FAIL: Telegram liveness endpoint did not become ready" >&2
exit 1
