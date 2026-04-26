#!/bin/bash

[ "$VERCEL" = "1" ] && exit 0

cd "$(dirname "$0")/../agent" || exit 1

uv sync
