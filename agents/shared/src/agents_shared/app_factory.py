"""Shared FastAPI app + observability scaffolding for the ADK agents.

Every agent mounts an identical FastAPI sub-app (trace middleware, CORS,
the AG-UI `/agui` endpoint, and a `/health` check). This module owns that
boilerplate so each agent `main.py` only declares its domain logic.
"""

import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any

from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import BaseSessionService
from opentelemetry import trace
from opentelemetry.trace import Tracer

from .session_service import SessionServiceContainer, create_session_service

_DEBUG_ENV_VAR = "AGENTS_DEBUG_LOGGING"


def _debug_enabled() -> bool:
    return os.getenv(_DEBUG_ENV_VAR, "").strip().lower() in ("1", "true", "yes", "on")


def setup_agent_logging(name: str) -> logging.Logger:
    """Configure root logging once and return the agent's named logger.

    DEBUG (which surfaces ADK / LiteLLM / ag_ui_adk internals) is gated behind
    the `AGENTS_DEBUG_LOGGING` env var; otherwise logging stays at INFO.
    """
    level = logging.DEBUG if _debug_enabled() else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    for logger_name in ("google.adk", "litellm", "ag_ui_adk"):
        logging.getLogger(logger_name).setLevel(level)
    return logging.getLogger(name)


def setup_otel(default_service_name: str) -> Tracer:
    """Wire OTLP telemetry when the endpoint env var is present; return a tracer.

    Safe to call unconditionally — it no-ops without OTEL_EXPORTER_OTLP_ENDPOINT.
    """
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        from google.adk.telemetry.setup import maybe_set_otel_providers
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.sdk.resources import Resource

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

    return trace.get_tracer(default_service_name)


def get_agent_tracer(name: str) -> Tracer:
    """Return a named tracer without configuring OTEL providers."""
    return trace.get_tracer(name)


def streaming_state_mapping(
    *, state_key: str, tool: str, tool_argument: str
) -> PredictStateMapping:
    """Token-streaming state mapping with the flags every agent uses."""
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
    predict_state: list[PredictStateMapping] | None = None,
    session_service: BaseSessionService | None = None,
) -> ADKAgent:
    """ADKAgent with the standard service bundle every agent uses.

    Pass `session_service` to substitute a wrapper (e.g. request-state injection);
    everything else is identical across agents.
    """
    return ADKAgent(
        adk_agent=agent,
        session_service=session_service if session_service is not None else create_session_service(),
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        credential_service=InMemoryCredentialService(),
        session_timeout_seconds=3600,
        predict_state=predict_state,
    )


def create_agent_app(
    *,
    title: str,
    adk_agent: ADKAgent,
    extract_state_from_request: Callable[..., Awaitable[dict[str, Any]]],
    session_container: SessionServiceContainer | None = None,
    tracer: Tracer,
    health_handler: Callable[[], Awaitable[dict[str, Any]]] | None = None,
) -> FastAPI:
    """Build the standard agent FastAPI sub-app.

    Mounts the AG-UI endpoint at `/agui`, adds request tracing + permissive
    CORS, and exposes `/health` (defaults to the session DB connectivity check;
    pass `health_handler` to extend it, e.g. oralboards' bundled-DB check).
    """
    log = logging.getLogger(title)
    app = FastAPI(title=title)

    @app.middleware("http")
    async def trace_requests(request, call_next):
        if request.url.path.endswith("/health"):
            return await call_next(request)

        start = time.perf_counter()
        with tracer.start_as_current_span(
            f"{request.method} {request.url.path}",
            attributes={
                "http.request.method": request.method,
                "url.path": request.url.path,
                "url.scheme": request.url.scheme,
            },
        ) as span:
            try:
                response = await call_next(request)
            except Exception as exc:
                span.record_exception(exc)
                span.set_attribute("error.type", type(exc).__name__)
                log.exception(
                    "Unhandled error in %s %s",
                    request.method,
                    request.url.path,
                )
                raise

            span.set_attribute("http.response.status_code", response.status_code)
            span.set_attribute(
                "duration_ms",
                round((time.perf_counter() - start) * 1000, 2),
            )
            return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    add_adk_fastapi_endpoint(
        app,
        adk_agent,
        path="/agui",
        extract_state_from_request=extract_state_from_request,
    )

    async def _default_health() -> dict[str, Any]:
        if session_container is None:
            return {"status": "ok", "database": "not_configured"}
        return await session_container.check_database_connection()

    handler = health_handler or _default_health

    @app.get("/health")
    async def health():
        return await handler()

    return app
