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


def a2a_request_converter(
    request: RequestContext,
    part_converter=convert_a2a_part_to_genai_part,
) -> AgentRunRequest:
    """Convert A2A requests while preserving Clerk user identity metadata."""
    run_request = convert_a2a_request_to_agent_run_request(request, part_converter)
    user_id = (request.metadata or {}).get("user_id")
    if user_id:
        run_request.user_id = str(user_id)
    return run_request


def create_a2a_agent_executor(runner: Runner) -> A2aAgentExecutor:
    return A2aAgentExecutor(
        runner=runner,
        config=A2aAgentExecutorConfig(request_converter=a2a_request_converter),
        force_new_version=True,
    )
