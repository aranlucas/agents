"""Shared ADKAgent wiring + observability for the ADK agents.

Agents construct their ``ADKAgent`` with ``build_adk_agent()`` then register
routes directly on the gateway app.
"""

import logging
import os
from collections.abc import Awaitable, Callable

from ag_ui.core.types import RunAgentInput
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from fastapi import APIRouter, FastAPI, Request
from google.adk.agents import BaseAgent
from google.adk.apps import App
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.sessions import BaseSessionService

from .dependencies import AgentServices

_DEBUG_ENV_VAR = "AGENTS_DEBUG_LOGGING"


def debug_enabled() -> bool:
    return os.getenv(_DEBUG_ENV_VAR, "").strip().lower() in ("1", "true", "yes", "on")


def setup_agent_logging(name: str) -> logging.Logger:
    level = logging.DEBUG if debug_enabled() else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    for logger_name in ("google.adk", "litellm", "ag_ui_adk"):
        logging.getLogger(logger_name).setLevel(level)
    return logging.getLogger(name)


def streaming_state_mapping(
    *, state_key: str, tool: str, tool_argument: str
) -> PredictStateMapping:
    return PredictStateMapping(
        state_key=state_key,
        tool=tool,
        tool_argument=tool_argument,
        emit_confirm_tool=False,
        stream_tool_call=True,
    )


def build_adk_agent(
    agent: BaseAgent,
    *,
    services: AgentServices,
    session_service: BaseSessionService | None = None,
    predict_state: list[PredictStateMapping] | None = None,
    plugins: list[BasePlugin] | None = None,
) -> ADKAgent:
    app = App(
        name=agent.name,
        root_agent=agent,
        plugins=plugins or [],
    )
    return ADKAgent.from_app(
        app,
        session_service=session_service or services.session_service,
        artifact_service=services.artifact_service,
        memory_service=services.memory_service,
        credential_service=services.credential_service,
        session_timeout_seconds=3600,
        predict_state=predict_state,
        # Bind the ADK session id to the AG-UI thread_id so every agent resumes
        # the same persisted session for a given thread instead of relying on an
        # in-memory cache + O(n) list_sessions scan that is lost on gateway
        # restarts.
        use_thread_id_as_session_id=True,
    )


def build_adk_agent_from_app(
    app: App,
    *,
    services: AgentServices,
    predict_state: list[PredictStateMapping] | None = None,
) -> ADKAgent:
    """Like build_adk_agent() but wraps an ADK App, enabling App-level features
    such as EventsCompactionConfig, plugins, and resumability."""
    return ADKAgent.from_app(
        app,
        session_service=services.session_service,
        artifact_service=services.artifact_service,
        memory_service=services.memory_service,
        credential_service=services.credential_service,
        session_timeout_seconds=3600,
        predict_state=predict_state,
        use_thread_id_as_session_id=True,
    )


def add_agent_routes(
    app: FastAPI,
    *,
    prefix: str,
    adk_agent: ADKAgent,
    services: AgentServices,
    extract_state_from_request: Callable[
        [Request, RunAgentInput],
        Awaitable[dict[str, object]],
    ],
    health_check: Callable[..., Awaitable[dict[str, object]]] | None = None,
) -> None:
    """Register one gateway-scoped agent router.

    ``ag-ui-adk`` also registers an experimental ``/agents/state`` endpoint.
    Mounting a router per agent keeps that endpoint scoped under the agent
    prefix instead of creating duplicate root routes in the gateway.

    ``health_check``, if supplied, receives ``services.engine`` as its sole
    argument and can gate on agent-specific startup state before falling back
    to the standard DB probe.  Omit it to use the default DB probe.
    """
    from .dependencies import AgentServicesDep
    from .session_service import check_database_connection

    app.state.services = services

    router = APIRouter()
    add_adk_fastapi_endpoint(
        router,
        adk_agent,
        path="/agui",
        extract_state_from_request=extract_state_from_request,  # type: ignore[arg-type]
    )

    @router.get("/health")
    async def health(services: AgentServicesDep):  # pyright: ignore[reportUnusedFunction]
        if health_check is not None:
            return await health_check(services.engine)
        return await check_database_connection(services.engine)

    app.include_router(router, prefix=prefix)
