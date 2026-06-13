"""Read-only sqlite search DB plumbing for the oral-boards agent."""

import logging
import sqlite3
from pathlib import Path

log = logging.getLogger("oralboards_agent.db")

VALID_COLLECTIONS = {"abpd", "aapd", "cody"}

DB_PATH = Path(__file__).resolve().parent / "data" / "search.sqlite"


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
