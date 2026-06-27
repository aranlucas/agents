from google.adk.tools import FunctionTool

from ._bigquery_utils import run_bigquery_sql


def execute_bigquery_sql(sql: str) -> dict:
    """Execute bounded BigQuery SQL and return normalized rows."""
    return run_bigquery_sql(sql)


tool = FunctionTool(execute_bigquery_sql)
