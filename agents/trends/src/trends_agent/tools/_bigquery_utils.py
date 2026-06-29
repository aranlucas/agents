import logging
import os
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import TypeAdapter, ValidationError

log = logging.getLogger(__name__)

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]
_OBJECT_DICT = TypeAdapter(dict[str, object])
_OBJECT_LIST = TypeAdapter(list[object])


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
    try:
        mapping = _OBJECT_DICT.validate_python(value)
    except ValidationError:
        mapping = None
    if mapping is not None:
        return {key: normalize_bigquery_value(item) for key, item in mapping.items()}
    if isinstance(value, (list, tuple)):
        items = _OBJECT_LIST.validate_python(value)
        return [normalize_bigquery_value(item) for item in items]
    return str(value)


def run_bigquery_sql(sql: str) -> dict[str, object]:
    """Execute bounded BigQuery SQL and return normalized rows."""
    from google.cloud import bigquery

    try:
        result = (
            bigquery.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT"))
            .query(clean_sql_query(sql))
            .result()
        )
        columns = [field.name for field in result.schema]
        rows: list[dict[str, JsonValue]] = []
        for row in _OBJECT_LIST.validate_python(result):
            mapping = _OBJECT_DICT.validate_python(row)
            rows.append(
                {key: normalize_bigquery_value(value) for key, value in mapping.items()}
            )
        return {"ok": True, "columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception:  # noqa: BLE001
        log.exception("Google Trends BigQuery execution failed")
        return {"ok": False, "error": "BigQuery query failed."}
