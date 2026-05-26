from unittest.mock import MagicMock

from a2a.types import Message, Role, TextPart

from agent_common.a2a import a2a_request_converter, create_a2a_agent_executor
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
        "kroger_connected": True,
        "temp:kroger_token": "kroger-token",
        "strava_connected": True,
        "temp:strava_token": "strava-token",
    }


def test_create_a2a_agent_executor_uses_adk_executor():
    runner = MagicMock()

    executor = create_a2a_agent_executor(runner)

    assert isinstance(executor, A2aAgentExecutor)
