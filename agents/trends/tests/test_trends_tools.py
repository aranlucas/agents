from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from trends_agent import tools


def test_normalize_bigquery_value_recurses_and_preserves_numeric_values() -> None:
    assert tools.normalize_bigquery_value(
        {
            "week": date(2026, 6, 22),
            "captured_at": datetime(2026, 6, 23, 10, 30),
            "score": Decimal("98.5"),
            "nested": [Decimal("4"), None],
        }
    ) == {
        "week": "2026-06-22",
        "captured_at": "2026-06-23T10:30:00",
        "score": 98.5,
        "nested": [4, None],
    }


def test_execute_bigquery_sql_returns_columns_rows_and_count(monkeypatch) -> None:
    class FakeResult(list):
        schema = [SimpleNamespace(name="term"), SimpleNamespace(name="score")]

    class FakeQuery:
        def result(self):
            return FakeResult([{"term": "python", "score": 100}])

    class FakeClient:
        def __init__(self, project):
            assert project == "test-project"

        def query(self, sql):
            assert sql == "SELECT term, score FROM trends LIMIT 100"
            return FakeQuery()

    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setattr("google.cloud.bigquery.Client", FakeClient)

    assert tools.execute_bigquery_sql(
        "```sql\nSELECT term, score FROM trends LIMIT 100\n```"
    ) == {
        "ok": True,
        "columns": ["term", "score"],
        "rows": [{"term": "python", "score": 100}],
        "row_count": 1,
    }


def test_execute_bigquery_sql_hides_provider_error(monkeypatch) -> None:
    class FailingClient:
        def __init__(self, project):
            raise RuntimeError("secret project detail")

    monkeypatch.setattr("google.cloud.bigquery.Client", FailingClient)
    assert tools.execute_bigquery_sql("SELECT 1 LIMIT 100") == {
        "ok": False,
        "error": "BigQuery query failed.",
    }


def test_validate_trends_sql_rejects_missing_or_unbounded_sql() -> None:
    assert tools.validate_trends_sql("") == {
        "ok": False,
        "error": "The Trends SQL generator did not return a query.",
    }
    assert tools.validate_trends_sql("DELETE FROM trends LIMIT 100") == {
        "ok": False,
        "error": "The Trends SQL generator returned an unsupported statement.",
    }
    assert tools.validate_trends_sql("SELECT * FROM trends") == {
        "ok": False,
        "error": "The Trends SQL generator returned an unbounded query.",
    }
    assert tools.validate_trends_sql("SELECT * FROM trends LIMIT 100") == {
        "ok": True,
        "sql": "SELECT * FROM trends LIMIT 100",
    }


def test_begin_and_write_trends_result_update_state_in_order() -> None:
    context = SimpleNamespace(state={})

    assert tools.begin_trends_query(context, "top searches", "SELECT 1") == {
        "ok": True,
        "status": "querying",
    }
    assert context.state["status"] == "querying"

    result = tools.write_trends_result(
        context,
        query="top searches",
        sql="SELECT 1",
        columns=["term", "score"],
        rows=[{"term": "python", "score": 100}],
        insights="Python leads the result.",
    )
    assert result == {"ok": True, "status": "ready", "row_count": 1}
    assert context.state == {
        "query": "top searches",
        "generated_sql": "SELECT 1",
        "columns": ["term", "score"],
        "rows": [{"term": "python", "score": 100}],
        "insights": "Python leads the result.",
        "status": "ready",
        "error": "",
    }


def test_write_trends_result_distinguishes_empty_and_error() -> None:
    empty = SimpleNamespace(state={})
    assert (
        tools.write_trends_result(empty, "q", "SELECT 1", ["term"], [], "No matches.")[
            "status"
        ]
        == "empty"
    )

    failed = SimpleNamespace(state={})
    assert (
        tools.write_trends_result(
            failed, "q", "SELECT 1", [], [], "", error="BigQuery query failed."
        )["status"]
        == "error"
    )
    assert failed.state["error"] == "BigQuery query failed."


def test_set_trends_verification_appends_section_to_insights() -> None:
    context = SimpleNamespace(state={"insights": "Python leads.", "status": "ready"})
    assert tools.set_trends_verification(context, "Confirmed by launch news.") == {
        "ok": True
    }
    assert context.state["status"] == "ready"
    assert context.state["insights"] == (
        "Python leads.\n\n## Verification\n\nConfirmed by launch news."
    )


def test_set_trends_verification_creates_section_when_insights_empty() -> None:
    context = SimpleNamespace(state={})
    tools.set_trends_verification(context, "No web context found.")
    assert context.state["insights"] == "## Verification\n\nNo web context found."
    assert context.state["status"] == "ready"
