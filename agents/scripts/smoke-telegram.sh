#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: smoke-telegram.sh <image>}"
port="${SMOKE_TELEGRAM_PORT:-18098}"
container="$(docker create "$image")"
runtime_name=""
cleanup() {
  [[ -z "$runtime_name" ]] || docker rm -f "$runtime_name" >/dev/null 2>&1 || true
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

files="$(docker export "$container" | tar -tf -)"
grep -Eqx '(\./)?app/telegram' <<<"$files"
grep -Eqx '(\./)?app/migrate' <<<"$files"
if grep -Eq '(^|/)python3?$|(^|/)node$|(^|/)uv$' <<<"$files"; then
  echo "FAIL: Telegram image contains Python, Node, or uv" >&2
  exit 1
fi

runtime_name="agents-telegram-smoke-$$"
docker run -d --rm --name "$runtime_name" -p "${port}:8080" \
  -e APP_ENV=development \
  -e PORT=8080 \
  -e CF_ACCOUNT_ID=smoke-fake-account -e CF_API_TOKEN=smoke-fake-token \
  -e CF_D1_DATABASE_ID=smoke-fake-database -e CF_R2_BUCKET_NAME=smoke-fake-bucket \
  -e CF_R2_ACCESS_KEY_ID=smoke-fake-access -e CF_R2_SECRET_ACCESS_KEY=smoke-fake-secret \
  -e MISTRAL_API_KEY=smoke-fake-mistral -e TELEGRAM_BOT_TOKEN=smoke:fake-token \
  "$image" >/dev/null

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
