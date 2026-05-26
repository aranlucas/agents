from unittest.mock import MagicMock

from a2a.types import Message, Role, TextPart

from agent_common.a2a import (
    apply_a2a_auth_metadata_to_state,
    a2a_request_converter,
    create_a2a_agent_executor,
)
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor


def test_a2a_request_converter_uses_metadata_user_id():
    request = MagicMock()
    request.call_context = None
    request.context_id = "ctx-abc"
    request.metadata = {"user_id": "user_123"}
    request.message = Message(
        messageId="msg-1",
        role=Role.user,
        parts=[TextPart(text="hello")],
    )

    run_request = a2a_request_converter(request)

    assert run_request.user_id == "user_123"
    assert run_request.session_id == "ctx-abc"
    assert run_request.new_message.parts[0].text == "hello"


def test_a2a_request_converter_maps_auth_metadata_to_state_delta():
    request = MagicMock()
    request.call_context = None
    request.context_id = "ctx-abc"
    request.metadata = {
        "user_id": "user_123",
        "kroger_access_token": "kroger-token",
        "strava_access_token": "strava-token",
    }
    request.message = Message(
        messageId="msg-1",
        role=Role.user,
        parts=[TextPart(text="hello")],
    )

    run_request = a2a_request_converter(request)

    assert run_request.state_delta == {
        "user_id": "user_123",
        "kroger_connected": True,
        "temp:kroger_token": "kroger-token",
        "strava_connected": True,
        "temp:strava_token": "strava-token",
    }


def test_apply_a2a_auth_metadata_to_state_hydrates_callback_state():
    callback_context = MagicMock()
    callback_context.state = {}
    callback_context._invocation_context.run_config.custom_metadata = {
        "a2a_metadata": {
            "user_id": "user_123",
            "kroger_access_token": "kroger-token",
            "strava_access_token": "strava-token",
        }
    }

    state_delta = apply_a2a_auth_metadata_to_state(callback_context)

    assert state_delta == {
        "user_id": "user_123",
        "kroger_connected": True,
        "temp:kroger_token": "kroger-token",
        "strava_connected": True,
        "temp:strava_token": "strava-token",
    }
    assert callback_context.state == state_delta


def test_apply_a2a_auth_metadata_to_state_marks_missing_tokens_disconnected():
    callback_context = MagicMock()
    callback_context.state = {
        "kroger_connected": True,
        "temp:kroger_token": "old-kroger-token",
        "strava_connected": True,
        "temp:strava_token": "old-strava-token",
    }
    callback_context._invocation_context.run_config.custom_metadata = {
        "a2a_metadata": {
            "kroger_access_token": "",
            "strava_access_token": "",
        }
    }

    state_delta = apply_a2a_auth_metadata_to_state(callback_context)

    assert state_delta == {
        "kroger_connected": False,
        "temp:kroger_token": "",
        "strava_connected": False,
        "temp:strava_token": "",
    }
    assert callback_context.state["kroger_connected"] is False
    assert callback_context.state["temp:kroger_token"] == ""
    assert callback_context.state["strava_connected"] is False
    assert callback_context.state["temp:strava_token"] == ""


def test_create_a2a_agent_executor_uses_adk_executor():
    runner = MagicMock()

    executor = create_a2a_agent_executor(runner)

    assert isinstance(executor, A2aAgentExecutor)
