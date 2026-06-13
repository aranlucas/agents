"""Repository packaging uses one root Python project."""

import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_agents_do_not_have_nested_pyproject_files():
    nested = sorted(path.relative_to(REPO_ROOT) for path in (REPO_ROOT / "agents").glob("*/pyproject.toml"))

    assert nested == []


def test_root_pyproject_is_not_a_uv_workspace():
    data = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text())

    assert "workspace" not in data.get("tool", {}).get("uv", {})
    assert "sources" not in data.get("tool", {}).get("uv", {})
