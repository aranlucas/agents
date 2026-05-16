#!/bin/bash

[ "$VERCEL" = "1" ] && exit 0

cd "$(dirname "$0")/../agent" || exit 1

export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/doctor-adk-uv-cache}"

uv sync
