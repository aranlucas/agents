"""Shared A2A executor factory for ADK runners."""

from a2a.server.agent_execution.context import RequestContext
from google.adk.a2a.converters.part_converter import convert_a2a_part_to_genai_part
from google.adk.a2a.converters.request_converter import (
    AgentRunRequest,
    convert_a2a_request_to_agent_run_request,
)
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.a2a.executor.config import A2aAgentExecutorConfig
from google.adk.runners import Runner


def _auth_state_delta_from_metadata(metadata: dict) -> dict:
    state_delta = {}

    kroger_token = metadata.get("kroger_access_token")
    if kroger_token:
        state_delta["kroger_connected"] = True
        state_delta["temp:kroger_token"] = str(kroger_token)

    strava_token = metadata.get("strava_access_token")
    if strava_token:
        state_delta["strava_connected"] = True
        state_delta["temp:strava_token"] = str(strava_token)

    return state_delta


def a2a_request_converter(
    request: RequestContext,
    part_converter=convert_a2a_part_to_genai_part,
) -> AgentRunRequest:
    """Convert A2A requests while preserving Clerk user identity metadata."""
    run_request = convert_a2a_request_to_agent_run_request(request, part_converter)
    metadata = request.metadata or {}
    user_id = metadata.get("user_id")
    if user_id:
        run_request.user_id = str(user_id)
    auth_state_delta = _auth_state_delta_from_metadata(metadata)
    if auth_state_delta:
        run_request.state_delta = {
            **(run_request.state_delta or {}),
            **auth_state_delta,
        }
    return run_request


def create_a2a_agent_executor(runner: Runner) -> A2aAgentExecutor:
    return A2aAgentExecutor(
        runner=runner,
        config=A2aAgentExecutorConfig(request_converter=a2a_request_converter),
        force_new_version=True,
    )
