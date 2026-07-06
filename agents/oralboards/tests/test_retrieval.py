import asyncio
import re
import sqlite3
from types import SimpleNamespace

import pytest
from oralboards_agent.tools._types import anchor_passage, extract_passage
from oralboards_agent.tools.read_doc import read_doc
from oralboards_agent.tools.search_docs import (
    MAX_SEARCH_CALLS,
    SEARCH_CALL_COUNT_KEY,
    search_docs,
)


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


def test_search_docs_returns_diversified_candidate_pool() -> None:
    # "sedation" ranks aapd docs in every top-5 slot; cody matches exist further
    # down. The reranking LLM must see them in a single call.
    result = asyncio.run(search_docs(SimpleNamespace(state={}), "sedation"))

    rows = result["results"]
    assert len(rows) >= 8
    assert len({row["collection"] for row in rows}) >= 2


def test_search_docs_results_carry_descending_scores() -> None:
    rows = asyncio.run(search_docs(SimpleNamespace(state={}), "pulpotomy"))["results"]

    scores = [row["score"] for row in rows]
    assert scores
    assert all(isinstance(score, float) for score in scores)
    assert scores == sorted(scores, reverse=True)


def test_search_docs_passage_covers_matched_region() -> None:
    # The passage must contain at least one term FTS5 actually matched (marked
    # «…» in the snippet), so the LLM judges relevance from the match region,
    # not the top of the document.
    rows = asyncio.run(
        search_docs(SimpleNamespace(state={}), "treating intruded teeth")
    )["results"]

    checked = 0
    for row in rows:
        marked = {m.lower() for m in re.findall(r"«([^»]+)»", row["snippet"])}
        if not marked:
            continue
        checked += 1
        assert any(term in row["passage"].lower() for term in marked), row["filepath"]
    assert checked


def test_search_docs_sqlite_error_does_not_consume_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import oralboards_agent.tools.search_docs as search_docs_module

    def boom() -> sqlite3.Connection:
        raise sqlite3.Error("db exploded")

    monkeypatch.setattr(search_docs_module, "connect", boom)
    context = SimpleNamespace(state={})

    result = asyncio.run(search_docs_module.search_docs(context, "pulpotomy"))

    assert result["status"] == "error"
    assert context.state.get(SEARCH_CALL_COUNT_KEY, 0) == 0


def test_anchor_passage_uses_snippet_match_not_raw_query() -> None:
    # Query says "splinting"; the body only contains the stemmed surface form
    # "splinted", so raw substring search misses. The snippet marks the term
    # FTS5 matched — the passage must center there.
    body = (
        "intro filler. " * 60
        + "The tooth was splinted flexibly for two weeks after repositioning. "
        + "tail filler. " * 60
    )
    snippet = " … The tooth was «splinted» flexibly for two weeks … "

    passage = anchor_passage(body, snippet, "splinting avulsed incisors")

    assert "splinted" in passage


def test_anchor_passage_falls_back_to_query_words() -> None:
    body = (
        "opening context. " * 40 + "management of avulsion injuries here. " + "x " * 40
    )
    passage = anchor_passage(body, "unrelated snippet text", "avulsion management")
    assert "avulsion" in passage


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
