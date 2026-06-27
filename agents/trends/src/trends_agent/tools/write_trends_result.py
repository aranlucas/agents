from google.adk.tools import FunctionTool, ToolContext

from ._bigquery_utils import clean_sql_query, normalize_bigquery_value


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


tool = FunctionTool(write_trends_result)
