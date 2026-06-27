import logging
import os
from datetime import date, datetime, time
from decimal import Decimal

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


def run_bigquery_sql(sql: str) -> dict:
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
        return {"ok": True, "columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception:  # noqa: BLE001
        log.exception("Google Trends BigQuery execution failed")
        return {"ok": False, "error": "BigQuery query failed."}
