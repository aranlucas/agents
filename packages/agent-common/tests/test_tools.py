from types import SimpleNamespace

import pytest
from agent_common.tools import (
    parse_tool_response,
    save_state,
    shared_after_tool_callback,
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


@pytest.mark.asyncio
async def test_shared_after_tool_callback_removes_structured_content_from_response() -> None:
    context = SimpleNamespace(state={})
    tool = SimpleNamespace(name="lookup")
    result = await shared_after_tool_callback(
        tool,
        {},
        context,
        {"content": [{"text": "shown"}], "structuredContent": {"secret": True}},
    )
    assert context.state["lookup"] == {"secret": True}
    assert result == {"content": [{"text": "shown"}]}


@pytest.mark.asyncio
async def test_shared_after_tool_callback_returns_original_response_without_content_pair() -> None:
    context = SimpleNamespace(state={})
    tool = SimpleNamespace(name="lookup")
    response = {"structuredContent": {"ok": True}}
    result = await shared_after_tool_callback(tool, {}, context, response)
    assert context.state["lookup"] == {"ok": True}
    assert result is response
