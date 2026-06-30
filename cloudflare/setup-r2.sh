#!/usr/bin/env bash
# Idempotent R2 bucket provisioning.
# Prerequisites: wrangler login, R2 enabled in CF dashboard.
# Usage: bash cloudflare/setup-r2.sh
set -euo pipefail

BUCKET="${CF_R2_BUCKET_NAME:-adk-artifacts}"

command -v wrangler >/dev/null 2>&1 || { echo "wrangler not found — run: npm i -g wrangler"; exit 1; }
wrangler whoami >/dev/null 2>&1 || { echo "Not logged in — run: wrangler login"; exit 1; }

echo "Checking bucket '${BUCKET}'..."
if wrangler r2 bucket list 2>/dev/null | grep -q "${BUCKET}"; then
  echo "Bucket '${BUCKET}' already exists."
else
  wrangler r2 bucket create "${BUCKET}"
  echo "Bucket '${BUCKET}' created."
fi

ACCOUNT_ID="$(wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)"

cat <<EOF

✅ Done. Set these Railway env vars:

  CF_ACCOUNT_ID=${ACCOUNT_ID}
  CF_R2_BUCKET_NAME=${BUCKET}
  CF_R2_ACCESS_KEY_ID=<from dashboard → R2 → Manage API tokens>
  CF_R2_SECRET_ACCESS_KEY=<same>

Then verify: uv run python cloudflare/verify-r2.py
EOF
