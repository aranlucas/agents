import json
import os

from google.adk.tools import ToolContext


def clean_sql_query(text: str) -> str:
    return (
        text.replace("\\n", " ")
        .replace("\n", " ")
        .replace("\\", "")
        .replace("```sql", "")
        .replace("```", "")
        .strip()
    )


def execute_bigquery_sql(sql: str) -> str:
    """Execute a BigQuery SQL query and return results as a JSON string."""
    from google.cloud import bigquery

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    cleaned = clean_sql_query(sql)
    try:
        client = bigquery.Client(project=project)
        results = [dict(row) for row in client.query(cleaned).result()]
        if not results:
            return "Query returned no results."
        return (
            json.dumps(results, default=str)
            .replace("```sql", "")
            .replace("```", "")
        )
    except Exception as e:  # noqa: BLE001
        return f"Error executing BigQuery query: {e!s}"


def write_trends_result(tool_context: ToolContext, sql: str, insights: str) -> dict:
    """Format SQL + insights as markdown and persist to shared state."""
    md = f"## SQL Query\n\n```sql\n{sql}\n```\n\n---\n\n## Insights\n\n{insights}"
    tool_context.state["result"] = md
    tool_context.state["status"] = "ready"
    return {"ok": True}
