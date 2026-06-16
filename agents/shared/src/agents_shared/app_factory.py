"""Shared ADKAgent wiring + observability for the ADK agents.

Agents construct their ``ADKAgent`` with ``build_adk_agent()`` then register
routes directly on the gateway app.
"""

import logging
import os
from collections.abc import Awaitable, Callable

import ag_ui_adk.adk_agent as _adk_agent_module
import litellm
from ag_ui.core.types import RunAgentInput
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from fastapi import APIRouter, FastAPI, Request
from google.adk.agents import LlmAgent
from google.adk.sessions import BaseSessionService
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import Tracer

from .dependencies import AgentServices

_DEBUG_ENV_VAR = "AGENTS_DEBUG_LOGGING"


_original_stream_events = _adk_agent_module.ADKAgent._stream_events


async def _patched_stream_events(self, execution):
    """Wrap _stream_events to cancel the background ADK task on generator close.

    When the HTTP client disconnects (stop button), sse-starlette cancels the
    SSE response stream, which calls aclose() on the async generator chain.
    Without cancellation the background ``_run_adk_in_background`` task keeps
    running to completion, wasting resources and potentially racing with the
    next run on the same thread.
    """
    try:
        async for event in _original_stream_events(self, execution):
            yield event
    finally:
        if not execution.is_complete:
            await execution.cancel()


_adk_agent_module.ADKAgent._stream_events = _patched_stream_events


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
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return trace.get_tracer(default_service_name)

    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
        OTLPSpanExporter,
    )
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", default_service_name),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        },
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    SQLAlchemyInstrumentor().instrument()
    litellm.callbacks = ["otel"]

    return trace.get_tracer(default_service_name)


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
    async def health(services: AgentServicesDep):
        if health_check is not None:
            return await health_check(services.engine)
        return await check_database_connection(services.engine)

    app.include_router(router, prefix=prefix)
