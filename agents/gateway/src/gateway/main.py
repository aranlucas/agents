"""Gateway — single FastAPI app with per-agent AG-UI routes."""

import logging
import os
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from agents_shared.clerk_auth import ClerkAuthMiddleware, clerk_auth_enabled
from agents_shared.dependencies import (
    AgentServices,
    AgentServicesDep,
    create_agent_services,
)
from agents_shared.rate_limit import set_rate_limit_engine
from agents_shared.session_service import check_database_connection
from dotenv import load_dotenv
from excalidraw_agent.main import register as register_excalidraw
from expense_agent.main import register as register_expense
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fitness_agent.main import register as register_fitness
from grocery_agent.main import register as register_grocery
from opentelemetry import trace
from opentelemetry.propagate import extract as otel_extract
from opentelemetry.trace import Tracer
from oralboards_agent.main import register as register_oralboards
from presentation_agent.main import register as register_presentation
from research_agent.main import register as register_research
from resume_agent.main import register as register_resume
from spreadsheet_agent.main import register as register_spreadsheet
from starlette.responses import Response
from travel_agent.main import register as register_travel
from trends_agent.main import register as register_trends
from wellness_agent.main import register as register_wellness

from .telegram_link import router as telegram_link_router


def setup_otel(default_service_name: str) -> Tracer:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return trace.get_tracer(default_service_name)

    import litellm
    from opentelemetry import _logs, metrics
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
        OTLPMetricExporter,
    )
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
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

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    _logs.set_logger_provider(logger_provider)

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())],
    )
    metrics.set_meter_provider(meter_provider)

    SQLAlchemyInstrumentor().instrument()
    litellm.callbacks = ["otel"]

    return trace.get_tracer(default_service_name)


load_dotenv()
tracer = setup_otel("agents-gateway")

log = logging.getLogger("gateway")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield


def register_agents(app: FastAPI, services: AgentServices) -> None:
    app.state.services = services
    set_rate_limit_engine(services.engine)

    for register_agent in (
        register_excalidraw,
        register_travel,
        register_trends,
        register_grocery,
        register_fitness,
        register_wellness,
        register_expense,
        register_oralboards,
        register_presentation,
        register_research,
        register_spreadsheet,
        register_resume,
    ):
        register_agent(app, services)


_allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in _allowed_origins.split(",") if o.strip()] or ["*"]

app = FastAPI(title="Agents Gateway", lifespan=_lifespan)
register_agents(app, create_agent_services())
app.include_router(telegram_link_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

if clerk_auth_enabled():
    app.add_middleware(
        ClerkAuthMiddleware,
        public_prefixes=("/resume", "/telegram/link"),
    )


@app.middleware("http")
async def trace_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.url.path.endswith("/health"):
        return await call_next(request)

    start = time.perf_counter()
    context = otel_extract(dict[str, str](request.headers))
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        context=context,
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


@app.get("/health")
async def health(services: AgentServicesDep):
    return await check_database_connection(services.engine)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)  # noqa: S104
