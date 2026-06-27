# pyright: reportPrivateUsage=false
"""Tests for the shared ADKAgent/app wiring helpers."""

import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

from agents_shared.app_factory import (
    build_adk_agent,
    debug_enabled,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.tools import (
    ProviderThrottle,
    RateLimit,
    get_current_date,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm


def _dummy_agent() -> LlmAgent:
    return LlmAgent(
        name="dummy_agent",
        model=LiteLlm(model="cerebras/gpt-oss-120b"),
        instruction="hi",
    )


def _mock_services():
    return AgentServices(
        session_service=MagicMock(),
        artifact_service=MagicMock(),
        memory_service=MagicMock(),
        credential_service=MagicMock(),
        engine=MagicMock(),
    )


def test_build_adk_agent_wires_default_services():
    services = _mock_services()
    adk = build_adk_agent(_dummy_agent(), services=services)
    assert adk._static_app_name == "dummy_agent"
    assert adk._session_manager._timeout == 3600


def test_build_adk_agent_resumes_session_from_thread_id():
    services = _mock_services()
    adk = build_adk_agent(_dummy_agent(), services=services)
    assert adk._session_manager._use_thread_id_as_session_id is True


def test_build_adk_agent_accepts_session_service_override():
    services = _mock_services()
    custom_session = MagicMock()
    adk = build_adk_agent(
        _dummy_agent(),
        services=services,
        session_service=custom_session,
    )
    assert adk._session_manager._session_service._inner is custom_session


def test_build_adk_agent_forwards_predict_state():
    services = _mock_services()
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    adk = build_adk_agent(_dummy_agent(), services=services, predict_state=[mapping])
    assert adk._predict_state == [mapping]


def test_build_adk_agent_defaults_predict_state_to_none():
    services = _mock_services()
    assert build_adk_agent(_dummy_agent(), services=services)._predict_state is None


def test_streaming_state_mapping_sets_streaming_flags():
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    assert mapping.state_key == "plan"
    assert mapping.tool == "set_plan"
    assert mapping.tool_argument == "plan"
    assert mapping.emit_confirm_tool is False
    assert mapping.stream_tool_call is True


async def test_provider_hook_strips_reasoning_content():
    hook = ProviderThrottle({})
    data = {
        "model": "mistral/mistral-medium-latest",
        "messages": [
            {"role": "user", "content": "question"},
            {
                "role": "assistant",
                "content": "answer",
                "reasoning_content": "private chain of thought",
            },
        ],
    }

    result = await hook.async_pre_call_hook(None, None, data, "completion")

    assert result["messages"] == [
        {"role": "user", "content": "question"},
        {"role": "assistant", "content": "answer"},
    ]


async def test_provider_hook_admits_request_under_rpm_limit():
    hook = ProviderThrottle({"gemini": RateLimit(rpm=100)})
    data = {"model": "gemini/gemini-3.1-flash-lite", "messages": []}
    result = await hook.async_pre_call_hook(None, None, data, "completion")
    assert result is data


async def test_provider_hook_skips_throttle_for_unknown_model():
    hook = ProviderThrottle({"gemini": RateLimit(rpm=100)})
    data = {"model": "cerebras/gpt-oss-120b", "messages": []}
    result = await hook.async_pre_call_hook(None, None, data, "completion")
    assert result is data


def test_get_current_date_returns_iso_keys():
    result = get_current_date()
    assert "date" in result and "weekday" in result and "month" in result
    import datetime

    datetime.date.fromisoformat(result["date"])


def test_strip_thinking_removes_thought_true_parts():
    thought_part = SimpleNamespace(thought=True)
    regular_part = SimpleNamespace(thought=False, text="hello")
    content = SimpleNamespace(parts=[thought_part, regular_part])
    llm_request = SimpleNamespace(contents=[content])

    result = strip_thinking_before_model(None, llm_request)

    assert result is None
    assert content.parts == [regular_part]


def test_on_model_error_callback_logs_and_returns_none():
    ctx = SimpleNamespace(agent_name="test_agent")
    req = SimpleNamespace(model="test-model")
    result = on_model_error_callback(ctx, req, ValueError("boom"))
    assert result is None


def test_debug_enabled_true_when_env_set(monkeypatch):
    monkeypatch.setenv("AGENTS_DEBUG_LOGGING", "true")
    assert debug_enabled() is True


def test_setup_agent_logging_sets_debug_level(monkeypatch):
    monkeypatch.setenv("AGENTS_DEBUG_LOGGING", "1")
    logger = setup_agent_logging("test.debug.logger")
    assert logger.name == "test.debug.logger"
    assert logging.getLogger("google.adk").level == logging.DEBUG


# ---------------------------------------------------------------------------
# stop_on_terminal_text
# ---------------------------------------------------------------------------


def _make_response(
    *, role="model", parts=None, partial=None, finish_reason=None, error_message=None
):
    from google.adk.models.llm_response import LlmResponse
    from google.genai import types

    content = types.Content(role=role, parts=parts or []) if parts is not None else None
    return LlmResponse(
        content=content,
        partial=partial,
        finish_reason=finish_reason,
        error_message=error_message,
    )


def _ctx_with_invocation():
    inv = SimpleNamespace(end_invocation=False)
    return SimpleNamespace(agent_name="test", _invocation_context=inv), inv


def _ctx_no_invocation():
    return SimpleNamespace(agent_name="test")


def test_stop_on_terminal_text_returns_none_on_empty_content():
    from agents_shared.tools import stop_on_terminal_text

    ctx = _ctx_no_invocation()
    resp = _make_response(parts=None)
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_skips_partial():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx = _ctx_no_invocation()
    part = types.Part(text="hello")
    resp = _make_response(parts=[part], partial=True)
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_skips_non_stop_finish_reason():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx = _ctx_no_invocation()
    part = types.Part(text="hello")
    resp = _make_response(parts=[part], finish_reason=None)
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_skips_function_call_response():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx = _ctx_no_invocation()
    fc_part = types.Part(function_call=types.FunctionCall(name="my_tool", args={}))
    resp = _make_response(parts=[fc_part], finish_reason=types.FinishReason.STOP)
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_skips_mixed_text_and_function_call():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx = _ctx_no_invocation()
    text_part = types.Part(text="hello")
    fc_part = types.Part(function_call=types.FunctionCall(name="my_tool", args={}))
    resp = _make_response(
        parts=[text_part, fc_part], finish_reason=types.FinishReason.STOP
    )
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_sets_end_invocation_on_text_only():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx, inv = _ctx_with_invocation()
    part = types.Part(text="final answer")
    resp = _make_response(parts=[part], finish_reason=types.FinishReason.STOP)
    result = stop_on_terminal_text(ctx, resp)
    assert result is None
    assert inv.end_invocation is True


def test_stop_on_terminal_text_degrades_without_invocation_context():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx = _ctx_no_invocation()
    part = types.Part(text="final answer")
    resp = _make_response(parts=[part], finish_reason=types.FinishReason.STOP)
    assert stop_on_terminal_text(ctx, resp) is None


def test_stop_on_terminal_text_skips_non_model_role():
    from agents_shared.tools import stop_on_terminal_text
    from google.genai import types

    ctx, inv = _ctx_with_invocation()
    part = types.Part(text="hello")
    resp = _make_response(
        role="user", parts=[part], finish_reason=types.FinishReason.STOP
    )
    assert stop_on_terminal_text(ctx, resp) is None
    assert inv.end_invocation is False


def test_stop_on_terminal_text_logs_error_message_on_empty_content():
    from agents_shared.tools import stop_on_terminal_text

    ctx = _ctx_no_invocation()
    resp = _make_response(parts=None, error_message="something went wrong")
    assert stop_on_terminal_text(ctx, resp) is None


# ---------------------------------------------------------------------------
# RateLimitStore
# ---------------------------------------------------------------------------


async def test_rate_limit_store_round_trip():
    from agents_shared.tools import RateLimitStore
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    store = RateLimitStore(engine)
    try:
        await store.ensure_table()

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-x", "2026-06-27", 3
        )
        assert ok is True

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-x", "2026-06-27", 3
        )
        assert ok is True

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-x", "2026-06-27", 3
        )
        assert ok is True

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-x", "2026-06-27", 3
        )
        assert ok is False

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-x", "2026-06-28", 3
        )
        assert ok is True

        ok = await store.check_and_increment(
            "nvidia_nim", "nvidia_nim/model-y", "2026-06-27", 3
        )
        assert ok is True
    finally:
        await engine.dispose()
