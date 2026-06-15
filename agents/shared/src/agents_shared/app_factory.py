"""Shared ADKAgent wiring + observability for the ADK agents.

Agents construct their ``ADKAgent`` with ``build_adk_agent()`` then register
routes directly on the gateway app.
"""

import logging
import os
from collections.abc import Awaitable, Callable

import litellm
from ag_ui.core.types import RunAgentInput
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from fastapi import APIRouter, FastAPI, Request
from google.adk.agents import LlmAgent
from google.adk.sessions import BaseSessionService
from google.adk.telemetry.setup import maybe_set_otel_providers
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import Tracer

from .dependencies import AgentServices

_DEBUG_ENV_VAR = "AGENTS_DEBUG_LOGGING"


def _debug_enabled() -> bool:
    return os.getenv(_DEBUG_ENV_VAR, "").strip().lower() in ("1", "true", "yes", "on")


def setup_agent_logging(name: str) -> logging.Logger:
    level = logging.DEBUG if _debug_enabled() else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    for logger_name in ("google.adk", "litellm", "ag_ui_adk"):
        logging.getLogger(logger_name).setLevel(level)
    return logging.getLogger(name)


def setup_otel(default_service_name: str) -> Tracer:
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        resource = Resource.create(
            {
                "service.name": os.getenv("RAILWAY_SERVICE_NAME", default_service_name),
                "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
                "deployment.environment": os.getenv(
                    "RAILWAY_ENVIRONMENT_NAME",
                    "local",
                ),
                "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
                "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
            },
        )
        maybe_set_otel_providers(otel_resource=resource)
        SQLAlchemyInstrumentor().instrument()
        litellm.callbacks = ["otel"]

    return trace.get_tracer(default_service_name)


def get_agent_tracer(name: str) -> Tracer:
    return trace.get_tracer(name)


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
    agent: LlmAgent,
    *,
    services: AgentServices,
    session_service: BaseSessionService | None = None,
    predict_state: list[PredictStateMapping] | None = None,
) -> ADKAgent:
    return ADKAgent(
        adk_agent=agent,
        session_service=session_service or services.session_service,
        artifact_service=services.artifact_service,
        memory_service=services.memory_service,
        credential_service=services.credential_service,
        session_timeout_seconds=3600,
        predict_state=predict_state,
    )


def add_agent_routes(
    app: FastAPI,
    *,
    prefix: str,
    adk_agent: ADKAgent,
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

    router = APIRouter()
    add_adk_fastapi_endpoint(
        router,
        adk_agent,
        path="/agui",
        extract_state_from_request=extract_state_from_request,  # type: ignore[arg-type]
    )

    @router.get("/health")
    async def health(services: AgentServicesDep):
        if health_check is not None:
            return await health_check(services.engine)
        return await check_database_connection(services.engine)

    app.include_router(router, prefix=prefix)
