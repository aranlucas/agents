"""Helpers for managing normalized active trip state."""

from __future__ import annotations

import time
from typing import Any


def merge_active_trip(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
    *,
    now: int | None = None,
) -> dict[str, Any]:
    """Merge a normalized trip patch without dropping existing sections."""
    merged: dict[str, Any] = dict(current or {})
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    merged["updated_at"] = int(time.time()) if now is None else now
    return merged
