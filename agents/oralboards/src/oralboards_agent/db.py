"""Read-only sqlite search DB plumbing for the oral-boards agent."""

import logging
import os
import sqlite3
from importlib import resources
from pathlib import Path

log = logging.getLogger("oralboards_agent.db")

VALID_COLLECTIONS = {"abpd", "aapd", "cody"}


def _default_db_path() -> Path:
    package_db = resources.files("oralboards_agent").joinpath("data/search.sqlite")
    if package_db.is_file():
        return Path(str(package_db))
    return Path(__file__).resolve().parents[2] / "data" / "search.sqlite"


DB_PATH = Path(os.getenv("ORALBOARDS_SEARCH_DB", str(_default_db_path())))


def validate_db() -> str:
    if not DB_PATH.exists():
        message = f"Oral boards search DB missing: {DB_PATH}"
        log.error(message)
        return message

    try:
        with connect() as conn:
            conn.execute("select 1 from documents limit 1").fetchone()
            conn.execute("select 1 from documents_fts limit 1").fetchone()
    except sqlite3.Error as exc:
        message = f"Oral boards search DB unreadable: {exc}"
        log.exception(message)
        return message

    return ""


def connect() -> sqlite3.Connection:
    uri = f"file:{DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


DB_STARTUP_ERROR = validate_db()
