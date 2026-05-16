#!/bin/bash

# Navigate to the agent directory
cd "$(dirname "$0")/../agent" || exit 1

# Activate the virtual environment
source .venv/bin/activate

# Keep uv cache inside a writable temp dir for sandboxed runs.
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/doctor-adk-uv-cache}"

# Run the agent
uv run main.py
