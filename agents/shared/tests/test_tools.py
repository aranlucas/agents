from types import SimpleNamespace

from agents_shared.tools import (
    parse_tool_response,
    save_state,
)


def test_parse_tool_response_prefers_structured_content() -> None:
    assert parse_tool_response(
        {"structuredContent": {"items": ["milk"]}, "content": "fallback"},
    ) == {"items": ["milk"]}


def test_parse_tool_response_falls_back_to_content_and_string() -> None:
    assert parse_tool_response({"content": [{"text": "hello"}]}) == [{"text": "hello"}]
    assert parse_tool_response("raw text") == "raw text"


def test_parse_tool_response_returns_none_for_invalid_response() -> None:
    assert parse_tool_response(None) is None


def test_save_state_writes_by_tool_name() -> None:
    context = SimpleNamespace(state={})
    save_state(context, "set_shopping_list", {"items": ["eggs"]})
    assert context.state == {"set_shopping_list": {"items": ["eggs"]}}


def test_save_state_falls_back_to_prefixed_key_when_schema_rejects_raw_tool_name() -> (
    None
):
    class SchemaBoundState(dict):
        def __setitem__(self, key, value):
            if ":" not in key and key != "declared":
                raise TypeError("unknown state key")
            super().__setitem__(key, value)

    context = SimpleNamespace(state=SchemaBoundState())
    save_state(context, "search_products", {"items": ["eggs"]})

    assert context.state == {
        "temp:tool_response:search_products": {"items": ["eggs"]},
    }
