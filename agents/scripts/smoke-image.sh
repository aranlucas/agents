#!/usr/bin/env bash
# Smoke-tests a Go gateway foundation image built from
# agents/Dockerfile:
#
#   1. image policy — the runtime binaries are statically linked, the image
#      runs as non-root, and no shell or scripting runtime is present.
#   2. runtime check — the image boots and serves process-only GET /live over
#      fake Cloudflare and provider credentials. The point of this script is
#      "binary starts, serves HTTP, contains no scripting runtime"; production
#      readiness is covered separately against real D1 and R2 bindings.
#
# Usage: smoke-image.sh <image>
set -euo pipefail

image="${1:?usage: smoke-image.sh <image>}"
port="${SMOKE_IMAGE_PORT:-18099}"

container=""
runtime_name=""
tmp=""
google_credentials=""
cleanup() {
  if [[ -n "$runtime_name" ]]; then
    docker rm -f "$runtime_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$container" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  if [[ -n "$tmp" ]]; then
    rm -rf "$tmp"
  fi
}
trap cleanup EXIT

echo "== static image contents =="
container="$(docker create "$image")"
files="$(docker export "$container" | tar -tf -)"
tmp="$(mktemp -d)"

grep -Eqx '(\./)?app/gateway' <<<"$files"
grep -Eqx '(\./)?app/migrate' <<<"$files"
if grep -Eq '(^|/)(sh|bash|dash|ash|zsh|csh|tcsh|ksh|fish|busybox|python([0-9]+(\.[0-9]+)*)?|pypy[0-9]*|node(js)?|deno|bun|uv|perl([0-9.]+)?|ruby([0-9.]+)?|php([0-9.]+)?|lua([0-9.]+)?|tclsh([0-9.]+)?|pwsh|powershell)(\.exe)?$' <<<"$files"; then
  echo "FAIL: image contains a shell or scripting runtime" >&2
  exit 1
fi

image_user="$(docker image inspect --format '{{.Config.User}}' "$image")"
case "$image_user" in
  nonroot | nonroot:nonroot | 65532 | 65532:65532) ;;
  *)
    echo "FAIL: image runs as '$image_user', expected non-root user 65532" >&2
    exit 1
    ;;
esac

for binary in gateway migrate; do
  docker cp "$container:/app/$binary" "$tmp/$binary"
  if ! file "$tmp/$binary" | grep -q 'statically linked'; then
    echo "FAIL: /app/$binary is not statically linked" >&2
    file "$tmp/$binary" >&2
    exit 1
  fi
done
echo "OK: static gateway/migrate binaries, non-root image, no scripting runtimes"

echo "== runtime liveness check (fake Cloudflare credentials) =="
runtime_name="agents-go-smoke-$$"
# The gateway validates BigQuery credentials at startup. Generate an ephemeral
# service-account key so the smoke exercises the production startup path
# without storing or contacting a real GCP identity.
private_key="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
google_credentials="$(jq -nc --arg private_key "$private_key" '{
  type: "service_account",
  project_id: "smoke-project",
  private_key_id: "smoke",
  private_key: $private_key,
  client_email: "smoke@smoke-project.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/smoke%40smoke-project.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
}')"
docker run -d --name "$runtime_name" -p "${port}:8000" \
  -e APP_ENV=development \
  -e PORT=8000 \
  -e CF_ACCOUNT_ID=smoke-fake-account \
  -e CF_API_TOKEN=smoke-fake-token \
  -e CF_D1_DATABASE_ID=smoke-fake-database \
  -e CF_R2_BUCKET_NAME=smoke-fake-bucket \
  -e CF_R2_ACCESS_KEY_ID=smoke-fake-access-key \
  -e CF_R2_SECRET_ACCESS_KEY=smoke-fake-secret-key \
  -e CEREBRAS_API_KEY=smoke-fake-cerebras-key \
  -e OPENROUTER_API_KEY=smoke-fake-openrouter-key \
  -e GROQ_API_KEY=smoke-fake-groq-key \
  -e NVIDIA_NIM_API_KEY=smoke-fake-nvidia-key \
  -e MISTRAL_API_KEY=smoke-fake-mistral-key \
  -e GEMINI_API_KEY=smoke-fake-gemini-key \
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON="$google_credentials" \
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
