from types import SimpleNamespace

from trends_agent.tools import clean_sql_query, write_trends_result


def test_clean_sql_query_strips_newlines_and_fences() -> None:
    assert clean_sql_query("SELECT *\nFROM foo\\n") == "SELECT * FROM foo"
    assert clean_sql_query("```sql\nSELECT 1\n```") == "SELECT 1"
    assert clean_sql_query("  SELECT 1  ") == "SELECT 1"


def test_clean_sql_query_removes_backslashes() -> None:
    assert clean_sql_query("SELECT\\n*\\nFROM foo") == "SELECT * FROM foo"


def test_write_trends_result_writes_markdown_to_state() -> None:
    ctx = SimpleNamespace(state={})
    result = write_trends_result(ctx, "SELECT * FROM foo LIMIT 10", "Top term: python")
    assert result == {"ok": True}
    assert "```sql" in ctx.state["result"]
    assert "SELECT * FROM foo LIMIT 10" in ctx.state["result"]
    assert "Top term: python" in ctx.state["result"]
    assert ctx.state["status"] == "ready"


def test_write_trends_result_overwrites_previous_result() -> None:
    ctx = SimpleNamespace(state={"result": "old", "status": "idle"})
    write_trends_result(ctx, "SELECT 1", "new insights")
    assert "new insights" in ctx.state["result"]
    assert ctx.state["status"] == "ready"
