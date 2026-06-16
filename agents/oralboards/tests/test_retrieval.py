import asyncio

from oralboards_agent.agent import read_doc, search_docs


def test_search_docs_returns_known_results() -> None:
    result = asyncio.run(search_docs("pulpotomy"))

    assert result["results"]
    assert {
        "docid",
        "filepath",
        "title",
        "snippet",
        "collection",
    } <= result["results"][0].keys()


def test_search_docs_respects_collection_filter() -> None:
    result = asyncio.run(search_docs("pulpotomy", collection="aapd"))

    assert result["results"]
    assert {row["collection"] for row in result["results"]} == {"aapd"}


def test_search_docs_handles_fts_hostile_input() -> None:
    result = asyncio.run(search_docs('"pulpotomy"*'))

    assert isinstance(result["results"], list)


def test_read_doc_returns_body_for_known_filepath() -> None:
    result = asyncio.run(read_doc("aapd/bp-pulptherapy25.md"))

    assert result["filepath"] == "aapd/bp-pulptherapy25.md"
    assert result["collection"] == "aapd"
    assert "Pulp" in result["body"]


def test_read_doc_returns_error_for_unknown_filepath() -> None:
    result = asyncio.run(read_doc("aapd/does-not-exist.md"))

    assert result == {"status": "error", "error": "not found"}
