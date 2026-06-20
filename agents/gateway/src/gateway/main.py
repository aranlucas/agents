"""Gateway — single FastAPI app with per-agent AG-UI routes."""

import logging
import os
import time

from a2ui_agent.main import register as register_a2ui
from agents_shared.app_factory import setup_otel
from agents_shared.clerk_auth import ClerkAuthMiddleware, clerk_auth_enabled
from agents_shared.dependencies import (
    AgentServices,
    AgentServicesDep,
    create_agent_services,
)
from agents_shared.session_service import check_database_connection
from dotenv import load_dotenv
from expense_agent.main import register as register_expense
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fitness_agent.main import register as register_fitness
from grocery_agent.main import register as register_grocery
from opentelemetry.propagate import extract as otel_extract
from oralboards_agent.main import register as register_oralboards
from oralboards_agent.workflow_main import register as register_oralboards_v2
from presentation_agent.main import register as register_presentation
from research_agent.main import register as register_research
from resume_agent.main import register as register_resume
from spreadsheet_agent.main import register as register_spreadsheet
from travel_agent.main import register as register_travel
from wellness_agent.main import register as register_wellness

load_dotenv()
tracer = setup_otel("agents-gateway")

log = logging.getLogger("gateway")


def register_agents(app: FastAPI, services: AgentServices) -> None:
    app.state.services = services

    for register_agent in (
        register_travel,
        register_grocery,
        register_fitness,
        register_wellness,
        register_expense,
        register_a2ui,
        register_oralboards,
        register_oralboards_v2,
        register_presentation,
        register_research,
        register_spreadsheet,
        register_resume,
    ):
        register_agent(app, services)


_allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in _allowed_origins.split(",") if o.strip()] or ["*"]

app = FastAPI(title="Agents Gateway")
register_agents(app, create_agent_services())

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

if clerk_auth_enabled():
    app.add_middleware(ClerkAuthMiddleware, public_prefixes=("/resume",))


@app.middleware("http")
async def trace_requests(request, call_next):
    if request.url.path.endswith("/health"):
        return await call_next(request)

    start = time.perf_counter()
    context = otel_extract(dict(request.headers))
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
