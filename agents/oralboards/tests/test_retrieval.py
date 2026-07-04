import asyncio
from types import SimpleNamespace

from oralboards_agent.tools._types import extract_passage
from oralboards_agent.tools.read_doc import read_doc
from oralboards_agent.tools.search_docs import MAX_SEARCH_CALLS, search_docs


def test_search_docs_returns_known_results() -> None:
    result = asyncio.run(search_docs(SimpleNamespace(state={}), "pulpotomy"))

    assert result["results"]
    assert {
        "docid",
        "filepath",
        "title",
        "snippet",
        "collection",
    } <= result["results"][0].keys()


def test_search_docs_respects_collection_filter() -> None:
    result = asyncio.run(
        search_docs(SimpleNamespace(state={}), "pulpotomy", collection="aapd")
    )

    assert result["results"]
    assert {row["collection"] for row in result["results"]} == {"aapd"}


def test_search_docs_handles_fts_hostile_input() -> None:
    result = asyncio.run(search_docs(SimpleNamespace(state={}), '"pulpotomy"*'))

    assert isinstance(result["results"], list)


def test_search_docs_enforces_hard_budget() -> None:
    context = SimpleNamespace(state={})
    for _ in range(MAX_SEARCH_CALLS):
        result = asyncio.run(search_docs(context, "pulpotomy"))
        assert result["status"] == "success"

    exhausted = asyncio.run(search_docs(context, "pulpotomy"))
    assert exhausted["status"] == "error"
    assert exhausted["results"] == []
    assert "budget exhausted" in exhausted["error"]


def test_search_docs_budget_resets_after_set_case() -> None:
    from oralboards_agent.tools.set_case import set_case

    context = SimpleNamespace(state={})
    for _ in range(MAX_SEARCH_CALLS):
        asyncio.run(search_docs(context, "pulpotomy"))

    set_case(context, "## Case\nA child.")
    result = asyncio.run(search_docs(context, "pulpotomy"))
    assert result["status"] == "success"


def test_read_doc_returns_body_for_known_filepath() -> None:
    result = asyncio.run(read_doc("aapd/bp-pulptherapy25.md"))

    assert result["filepath"] == "aapd/bp-pulptherapy25.md"
    assert result["collection"] == "aapd"
    assert "Pulp" in result["body"]


def test_search_docs_empty_query_after_cleaning() -> None:
    result = asyncio.run(search_docs(SimpleNamespace(state={}), '"***"'))
    assert result == {
        "status": "error",
        "results": [],
        "error": "query is empty after cleaning",
    }


def test_search_docs_invalid_collection() -> None:
    result = asyncio.run(
        search_docs(SimpleNamespace(state={}), "pulpotomy", collection="invalid")
    )
    assert result == {
        "status": "error",
        "results": [],
        "error": "unknown collection: invalid",
    }


def test_read_doc_filepath_without_slash() -> None:
    result = asyncio.run(read_doc("no-slash-file.md"))
    assert result == {"status": "error", "error": "not found"}


def test_extract_passage_fallback_on_no_match() -> None:
    body = "short body text"
    result = extract_passage(body, "zzzzz")
    assert result == body


def test_read_doc_returns_error_for_unknown_filepath() -> None:
    result = asyncio.run(read_doc("aapd/does-not-exist.md"))

    assert result == {"status": "error", "error": "not found"}
