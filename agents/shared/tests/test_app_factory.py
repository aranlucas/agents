"""Tests for the shared ADKAgent/app wiring helpers."""

from unittest.mock import MagicMock

from agents_shared.app_factory import build_adk_agent, streaming_state_mapping
from agents_shared.dependencies import AgentServices
from agents_shared.tools import _ProviderThrottle, build_model
from google.adk.agents import LlmAgent


def _dummy_agent() -> LlmAgent:
    return LlmAgent(name="dummy_agent", model=build_model(), instruction="hi")


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


def test_build_model_uses_current_free_agent_model_chain():
    model = build_model()
    fallbacks = model._additional_args["fallbacks"]

    assert model.model == "cerebras/gpt-oss-120b"
    assert fallbacks == [
        "mistral/mistral-medium-latest",
        "nvidia_nim/deepseek-ai/deepseek-v4-flash",
        "openrouter/openrouter/free",
        "gemini/gemini-3.1-flash-lite",
        "gemini/gemini-3.5-flash",
    ]

    fallbacks.append("mutated")
    assert "mutated" not in build_model()._additional_args["fallbacks"]


async def test_provider_hook_strips_reasoning_content_before_fallback_calls():
    hook = _ProviderThrottle({})
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
