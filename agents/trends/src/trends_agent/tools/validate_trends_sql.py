from google.adk.tools import FunctionTool

from ._bigquery_utils import clean_sql_query


def validate_trends_sql(sql: str) -> dict[str, object]:
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


tool = FunctionTool(validate_trends_sql)
