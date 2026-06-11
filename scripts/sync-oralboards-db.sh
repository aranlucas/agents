#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DB="${ROOT_DIR}/../oral-boards/search.sqlite"
TARGET_DB="${ROOT_DIR}/agents/oralboards/data/search.sqlite"

if [[ ! -f "${SOURCE_DB}" ]]; then
  echo "Missing source database: ${SOURCE_DB}" >&2
  exit 1
fi

mkdir -p "$(dirname "${TARGET_DB}")"
cp "${SOURCE_DB}" "${TARGET_DB}"
echo "Synced ${SOURCE_DB} -> ${TARGET_DB}"
