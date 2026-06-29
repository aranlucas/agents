from google.adk.tools import FunctionTool, ToolContext

from ._bigquery_utils import clean_sql_query


def begin_trends_query(
    tool_context: ToolContext, query: str, sql: str
) -> dict[str, object]:
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


tool = FunctionTool(begin_trends_query)
