#!/usr/bin/env bash
# Smoke-tests a Go gateway foundation image built from
# agents/Dockerfile:
#
#   1. static check — the image contains ./app/gateway and no Python, Node,
#      or uv binary anywhere in its filesystem.
#   2. runtime check — the image boots and serves process-only GET /live over
#      fake Cloudflare and provider credentials. The point of this script is
#      "binary starts, serves HTTP, contains no Python/Node"; production
#      readiness is covered separately against real D1 and R2 bindings.
#
# Usage: smoke-image.sh <image>
set -euo pipefail

image="${1:?usage: smoke-image.sh <image>}"
port="${SMOKE_IMAGE_PORT:-18099}"

container=""
runtime_name=""
cleanup() {
  if [[ -n "$runtime_name" ]]; then
    docker rm -f "$runtime_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$container" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== static image contents =="
container="$(docker create "$image")"
files="$(docker export "$container" | tar -tf -)"

grep -Eqx '(\./)?app/gateway' <<<"$files"
grep -Eqx '(\./)?app/migrate' <<<"$files"
if grep -Eq '(^|/)python3?$|(^|/)node$|(^|/)uv$' <<<"$files"; then
  echo "FAIL: image contains a Python/Node/uv binary" >&2
  exit 1
fi
echo "OK: ./app/gateway and ./app/migrate present, no Python/Node/uv binaries"

echo "== runtime liveness check (fake Cloudflare credentials) =="
runtime_name="agents-go-smoke-$$"
docker run -d --rm --name "$runtime_name" -p "${port}:8000" \
  -e APP_ENV=development \
  -e PORT=8000 \
  -e CF_ACCOUNT_ID=smoke-fake-account \
  -e CF_API_TOKEN=smoke-fake-token \
  -e CF_D1_DATABASE_ID=smoke-fake-database \
  -e CF_R2_BUCKET_NAME=smoke-fake-bucket \
  -e CF_R2_ACCESS_KEY_ID=smoke-fake-access-key \
  -e CF_R2_SECRET_ACCESS_KEY=smoke-fake-secret-key \
  -e OPENROUTER_API_KEY=smoke-fake-openrouter-key \
  -e GROQ_API_KEY=smoke-fake-groq-key \
  -e NVIDIA_NIM_API_KEY=smoke-fake-nvidia-key \
  -e MISTRAL_API_KEY=smoke-fake-mistral-key \
  -e GEMINI_API_KEY=smoke-fake-gemini-key \
  "$image" >/dev/null

status=""
body=""
for _ in $(seq 1 30); do
  if response="$(curl -sS --max-time 2 -w '\n%{http_code}' "http://localhost:${port}/live" 2>/dev/null)"; then
    status="${response##*$'\n'}"
    body="${response%$'\n'*}"
    break
  fi
  sleep 1
done

if [[ -z "$status" ]]; then
  echo "FAIL: gateway never responded on /live" >&2
  docker logs "$runtime_name" >&2 || true
  exit 1
fi

case "$status" in
  2??) ;;
  *)
    echo "FAIL: unexpected /live status $status" >&2
    echo "body: $body" >&2
    docker logs "$runtime_name" >&2 || true
    exit 1
    ;;
esac

if ! grep -q '"service":"agents-gateway"' <<<"$body"; then
  echo "FAIL: unexpected /live body: $body" >&2
  exit 1
fi

echo "OK: /live responded HTTP $status against fake D1/R2 credentials"
echo "SMOKE PASS"
