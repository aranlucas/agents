"""Shared ADKAgent wiring + observability for the ADK agents.

Agents construct their ``ADKAgent`` with ``build_adk_agent()`` then register
routes directly on the gateway app.
"""

import logging
import os
from typing import Any

from ag_ui_adk.config import PredictStateMapping
from google.adk.agents import LlmAgent
from google.adk.sessions import BaseSessionService
from opentelemetry import trace
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
) -> Any:
    from ag_ui_adk import ADKAgent

    return ADKAgent(
        adk_agent=agent,
        session_service=session_service or services.session_service,
        artifact_service=services.artifact_service,
        memory_service=services.memory_service,
        credential_service=services.credential_service,
        session_timeout_seconds=3600,
        predict_state=predict_state,
    )
