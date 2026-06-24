import logging
import os
from datetime import date, datetime, time
from decimal import Decimal

from google.adk.tools import ToolContext

log = logging.getLogger(__name__)

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]


def clean_sql_query(text: str) -> str:
    return (
        text.replace("\\n", " ")
        .replace("\n", " ")
        .replace("\\", "")
        .replace("```sql", "")
        .replace("```", "")
        .strip()
    )


def normalize_bigquery_value(value: object) -> JsonValue:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): normalize_bigquery_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize_bigquery_value(item) for item in value]
    return str(value)


def validate_trends_sql(sql: str) -> dict:
    cleaned = clean_sql_query(sql)
    if not cleaned:
        return {
            "ok": False,
            "error": "The Trends SQL generator did not return a query.",
        }
    if not cleaned.lstrip().upper().startswith(("SELECT", "WITH")):
        return {
            "ok": False,
            "error": "The Trends SQL generator returned an unsupported statement.",
        }
    if "LIMIT" not in cleaned.upper():
        return {
            "ok": False,
            "error": "The Trends SQL generator returned an unbounded query.",
        }
    return {"ok": True, "sql": cleaned}


def execute_bigquery_sql(sql: str) -> dict:
    """Execute bounded BigQuery SQL and return normalized rows."""
    from google.cloud import bigquery

    try:
        result = (
            bigquery.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT"))
            .query(clean_sql_query(sql))
            .result()
        )
        columns = [field.name for field in result.schema]
        rows = [
            {
                str(key): normalize_bigquery_value(value)
                for key, value in dict(row).items()
            }
            for row in result
        ]
        return {
            "ok": True,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
        }
    except Exception:  # noqa: BLE001
        log.exception("Google Trends BigQuery execution failed")
        return {"ok": False, "error": "BigQuery query failed."}


def begin_trends_query(tool_context: ToolContext, query: str, sql: str) -> dict:
    tool_context.state.update(
        {
            "query": query,
            "generated_sql": clean_sql_query(sql),
            "columns": [],
            "rows": [],
            "insights": "",
            "status": "querying",
            "error": "",
        }
    )
    return {"ok": True, "status": "querying"}


def write_trends_result(
    tool_context: ToolContext,
    query: str,
    sql: str,
    columns: list[str],
    rows: list[dict],
    insights: str,
    error: str = "",
) -> dict:
    normalized_rows = [normalize_bigquery_value(row) for row in rows]
    status = "error" if error else "ready" if normalized_rows else "empty"
    tool_context.state.update(
        {
            "query": query,
            "generated_sql": clean_sql_query(sql),
            "columns": columns,
            "rows": normalized_rows,
            "insights": insights,
            "status": status,
            "error": error,
        }
    )
    return {"ok": not error, "status": status, "row_count": len(normalized_rows)}


def set_trends_verification(tool_context: ToolContext, verification: str) -> dict:
    """Append web-search verification notes to the trends insights in state."""
    existing = str(tool_context.state.get("insights") or "").rstrip()
    section = f"## Verification\n\n{verification}"
    tool_context.state["insights"] = f"{existing}\n\n{section}" if existing else section
    tool_context.state["status"] = "ready"
    return {"ok": True}
