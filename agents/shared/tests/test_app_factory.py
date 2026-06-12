"""Tests for the shared ADKAgent/app wiring helpers."""

from agents_shared.app_factory import build_adk_agent, streaming_state_mapping
from agents_shared.tools import build_model
from google.adk.agents import LlmAgent


def _dummy_agent() -> LlmAgent:
    return LlmAgent(name="dummy_agent", model=build_model(), instruction="hi")


def test_build_adk_agent_wires_default_services():
    adk = build_adk_agent(_dummy_agent())
    assert adk._session_manager._timeout == 3600
    assert adk._artifact_service is not None
    assert adk._memory_service is not None
    assert adk._credential_service is not None
    assert adk._session_manager is not None


def test_build_adk_agent_accepts_session_service_override():
    from agents_shared.session_service import create_session_service

    svc = create_session_service()
    adk = build_adk_agent(_dummy_agent(), session_service=svc)
    # session_service is wrapped in RequestStateSessionService; verify the inner service
    assert adk._session_manager._session_service._inner is svc


def test_build_adk_agent_forwards_predict_state():
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    adk = build_adk_agent(_dummy_agent(), predict_state=[mapping])
    assert adk._predict_state == [mapping]


def test_streaming_state_mapping_sets_streaming_flags():
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    assert mapping.state_key == "plan"
    assert mapping.tool == "set_plan"
    assert mapping.tool_argument == "plan"
    assert mapping.emit_confirm_tool is False
    assert mapping.stream_tool_call is True
