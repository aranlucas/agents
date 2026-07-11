#!/usr/bin/env bash
set -euo pipefail

if find agents -type f -name '*.py' -print -quit | grep -q .; then
  echo "Python runtime file remains under agents" >&2
  exit 1
fi

if rg -n 'uvicorn|python-telegram-bot|google\.adk|ADK_SESSION_DB_PATH' \
  agents/Dockerfile agents/Dockerfile.telegram agents/cmd package.json .github/workflows; then
  echo "legacy runtime dependency remains" >&2
  exit 1
fi

if rg -n 'github\.com/berriai|litellm' agents/go.mod agents/go.sum; then
  echo "external LiteLLM dependency remains" >&2
  exit 1
fi

echo "Go-only runtime guard passed"
