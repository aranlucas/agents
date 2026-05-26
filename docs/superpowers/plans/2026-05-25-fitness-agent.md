# Fitness Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fitness training agent that signs users in with Clerk, syncs connected Strava activity, researches outdoor objectives, and writes weekly training plans to shared state.

**Architecture:** Add a third ADK/FastAPI agent under `agents/fitness`, expose it through the existing CopilotKit runtime as `fitness`, and add a `/fitness` Next.js page that writes Clerk-synced Strava token state into the agent. The agent owns Strava fetching, objective research, plan writing, and health checks.

**Tech Stack:** Python 3.14, Google ADK, ag-ui-adk, FastAPI, LiteLLM, httpx, MCP `McpToolset`, Next.js 16, CopilotKit v2, Clerk, TypeScript workspace types, Docker Compose.

---

## File Structure

- Create `agents/fitness/main.py`: fitness ADK agent, state tools, Strava fetch tool, MCP toolset wiring, FastAPI app.
- Create `agents/fitness/utils.py`: shared response parsing callback and web search MCP toolset factory.
- Create `agents/fitness/tests/test_fitness_tools.py`: unit tests for activity normalization, missing token behavior, and tool state writes.
- Create `agents/fitness/pyproject.toml`: package metadata and dependencies.
- Create `agents/fitness/Dockerfile`: container runtime for the fitness service.
- Create `agents/fitness/railway.json`: Railway deployment config.
- Create `agents/fitness/.env.example`: local env example for the agent.
- Modify `docker-compose.yml`: add `fitness` and web search MCP services.
- Modify `.env.example`: add fitness and web search env vars.
- Modify `apps/web/.env.example`: add `FITNESS_AGENT_URL`.
- Modify `apps/web/src/env.ts`: validate `FITNESS_AGENT_URL`.
- Modify `apps/web/src/app/api/copilotkit/route.ts`: register `fitness` `HttpAgent`.
- Create `apps/web/src/app/api/strava/token/route.ts`: Clerk token lookup for connected Strava account.
- Modify `packages/types/src/index.ts`: add `FitnessState` and activity types.
- Create `apps/web/src/app/fitness/page.tsx`: fitness dashboard and CopilotKit integration.
- Optionally modify `apps/web/src/app/page.tsx`: add a link/card to the new fitness surface if the landing page lists agents.

---

## Task 1: Shared Fitness Types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add the fitness types**

Append this block to `packages/types/src/index.ts`:

```ts
// Fitness agent state — matches what agents/fitness writes to ADK shared state
export type FitnessStatus = 'idle' | 'syncing' | 'planning' | 'ready'

export type FitnessActivity = {
  id: string
  name: string
  sport_type?: string
  start_date?: string
  distance_m?: number
  moving_time_s?: number
  elapsed_time_s?: number
  total_elevation_gain_m?: number
  average_heartrate?: number
  perceived_effort?: number
}

export type FitnessState = {
  strava_connected?: boolean
  strava_token?: string
  activities?: FitnessActivity[]
  activities_synced_at?: string
  objective_research?: string
  training_plan?: string
  status?: FitnessStatus
  review_summary?: string
}
```

- [ ] **Step 2: Verify TypeScript can parse the package**

Run:

```bash
pnpm --filter @agents/types exec tsc --noEmit
```

Expected: command exits `0`.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat: add fitness state types"
```

---

## Task 2: Fitness Agent Tool Tests

**Files:**
- Create: `agents/fitness/tests/__init__.py`
- Create: `agents/fitness/tests/test_fitness_tools.py`

- [ ] **Step 1: Create the test package**

Create `agents/fitness/tests/__init__.py` as an empty file.

- [ ] **Step 2: Write tests for the local tool behavior**

Create `agents/fitness/tests/test_fitness_tools.py`:

```python
from unittest.mock import Mock

import pytest

import main


class DummyToolContext:
    def __init__(self, state: dict | None = None):
        self.state = state or {}


def test_normalize_activity_keeps_training_fields():
    activity = main.normalize_strava_activity(
        {
            "id": 123,
            "name": "Hill repeats",
            "sport_type": "Run",
            "start_date": "2026-05-24T15:00:00Z",
            "distance": 8046.7,
            "moving_time": 2700,
            "elapsed_time": 3000,
            "total_elevation_gain": 420.5,
            "average_heartrate": 146.2,
            "perceived_exertion": 7,
        }
    )

    assert activity == {
        "id": "123",
        "name": "Hill repeats",
        "sport_type": "Run",
        "start_date": "2026-05-24T15:00:00Z",
        "distance_m": 8046.7,
        "moving_time_s": 2700,
        "elapsed_time_s": 3000,
        "total_elevation_gain_m": 420.5,
        "average_heartrate": 146.2,
        "perceived_effort": 7,
    }


@pytest.mark.asyncio
async def test_fetch_activities_requires_connected_strava():
    context = DummyToolContext({"strava_connected": False})

    result = await main.fetch_activities(context)

    assert result == {
        "ok": False,
        "reason": "strava_not_connected",
        "message": "Connect Strava before syncing activities.",
    }
    assert context.state["status"] == "idle"


@pytest.mark.asyncio
async def test_fetch_activities_writes_normalized_state(monkeypatch):
    response = Mock()
    response.json.return_value = [
        {
            "id": 456,
            "name": "Long hike",
            "sport_type": "Hike",
            "start_date": "2026-05-20T12:00:00Z",
            "distance": 12000,
            "moving_time": 10800,
            "elapsed_time": 12000,
            "total_elevation_gain": 900,
        }
    ]
    response.raise_for_status.return_value = None

    class DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url, headers, params):
            assert url == "https://www.strava.com/api/v3/athlete/activities"
            assert headers == {"Authorization": "Bearer token-123"}
            assert params["per_page"] == 30
            return response

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda timeout: DummyClient())
    context = DummyToolContext(
        {"strava_connected": True, "strava_token": "token-123"}
    )

    result = await main.fetch_activities(context)

    assert result["ok"] is True
    assert result["count"] == 1
    assert context.state["activities"] == [
        {
            "id": "456",
            "name": "Long hike",
            "sport_type": "Hike",
            "start_date": "2026-05-20T12:00:00Z",
            "distance_m": 12000,
            "moving_time_s": 10800,
            "elapsed_time_s": 12000,
            "total_elevation_gain_m": 900,
        }
    ]
    assert context.state["activities_synced_at"]
    assert context.state["status"] == "planning"


def test_set_training_plan_writes_state():
    context = DummyToolContext()

    result = main.set_training_plan(context, "## Week plan\n- Run easy")

    assert result == {"ok": True, "length": 23}
    assert context.state["training_plan"] == "## Week plan\n- Run easy"
    assert context.state["status"] == "planning"
```

- [ ] **Step 3: Run tests to verify they fail before implementation**

Run:

```bash
cd agents/fitness && uv run pytest -q
```

Expected: FAIL because `agents/fitness/main.py` does not exist yet.

- [ ] **Step 4: Commit**

```bash
git add agents/fitness/tests
git commit -m "test: define fitness agent tool behavior"
```

---

## Task 3: Fitness Agent Backend

**Files:**
- Create: `agents/fitness/main.py`
- Create: `agents/fitness/utils.py`
- Create: `agents/fitness/pyproject.toml`
- Create: `agents/fitness/.env.example`

- [ ] **Step 1: Create package metadata**

Create `agents/fitness/pyproject.toml`:

```toml
[project]
name = "fitness-agent"
version = "0.1.0"
description = "Fitness training agent powered by Google ADK + CopilotKit AG-UI"
requires-python = ">=3.14"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "python-dotenv",
  "pydantic",
  "httpx",
  "google-adk>=1.33.0",
  "google-genai",
  "ag-ui-adk",
  "litellm",
  "opentelemetry-api",
  "opentelemetry-sdk",
  "opentelemetry-instrumentation-sqlite3",
  "opentelemetry-instrumentation-google-genai>=0.4b0",
  "opentelemetry-instrumentation-vertexai>=2.0b0",
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "httpx"]

[project.scripts]
app = "main:app"

[tool.setuptools]
py-modules = ["main", "utils"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create utility module**

Create `agents/fitness/utils.py`:

```python
"""Shared utilities for the fitness agent."""

import os
from typing import Any, Optional

from mcp import StdioServerParameters
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
)

BRAVE_SEARCH_MCP_PACKAGE = "@brave/brave-search-mcp-server"


def web_search_toolset() -> McpToolset:
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=[
                    "-y",
                    BRAVE_SEARCH_MCP_PACKAGE,
                ],
                env={"BRAVE_API_KEY": os.getenv("BRAVE_API_KEY", "")},
            ),
            timeout=30.0,
        ),
        use_mcp_resources=True,
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict | str]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (KeyError, TypeError, AttributeError):
        return None


def save_state(
    tool_context: ToolContext, tool_name: str, structured_content: Any
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    save_state(tool_context, tool.name, parse_tool_response(tool_response))

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response
```

- [ ] **Step 3: Create the fitness agent**

Create `agents/fitness/main.py`:

```python
"""Fitness Training Agent — Strava + objective research + AG-UI shared state."""

import datetime
import os
import time
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from utils import shared_after_tool_callback, web_search_toolset

load_dotenv()

STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"

_DEFAULT_STATE: dict[str, Any] = {
    "strava_connected": False,
    "strava_token": "",
    "activities": [],
    "activities_synced_at": "",
    "objective_research": "",
    "training_plan": "",
    "status": "idle",
    "review_summary": "",
}


def _setup_otel() -> None:
    if not (
        os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: os.getenv(
                "OTEL_SERVICE_NAME", "fitness-agent"
            ),
            ResourceAttributes.SERVICE_VERSION: os.getenv(
                "RAILWAY_GIT_COMMIT_SHA", "dev"
            ),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("fitness-agent")


def normalize_strava_activity(activity: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "id": str(activity.get("id", "")),
        "name": activity.get("name") or "Untitled activity",
        "sport_type": activity.get("sport_type") or activity.get("type"),
        "start_date": activity.get("start_date"),
        "distance_m": activity.get("distance"),
        "moving_time_s": activity.get("moving_time"),
        "elapsed_time_s": activity.get("elapsed_time"),
        "total_elevation_gain_m": activity.get("total_elevation_gain"),
        "average_heartrate": activity.get("average_heartrate"),
        "perceived_effort": activity.get("perceived_exertion"),
    }
    return {key: value for key, value in mapping.items() if value not in (None, "")}


def summarize_activities(activities: list[dict[str, Any]]) -> dict[str, Any]:
    distance_m = sum(float(a.get("distance_m") or 0) for a in activities)
    moving_time_s = sum(int(a.get("moving_time_s") or 0) for a in activities)
    elevation_m = sum(float(a.get("total_elevation_gain_m") or 0) for a in activities)
    sport_counts: dict[str, int] = {}
    for activity in activities:
        sport = str(activity.get("sport_type") or "Activity")
        sport_counts[sport] = sport_counts.get(sport, 0) + 1

    return {
        "activity_count": len(activities),
        "distance_km": round(distance_m / 1000, 1),
        "moving_hours": round(moving_time_s / 3600, 1),
        "elevation_m": round(elevation_m),
        "sport_counts": sport_counts,
    }


async def fetch_activities(
    tool_context: ToolContext,
    per_page: int = 30,
    before: Optional[int] = None,
    after: Optional[int] = None,
) -> dict:
    """Fetch recent Strava activities and write normalized activity state."""
    token = tool_context.state.get("strava_token") or ""
    connected = bool(tool_context.state.get("strava_connected")) and bool(token)
    if not connected:
        tool_context.state["status"] = "idle"
        return {
            "ok": False,
            "reason": "strava_not_connected",
            "message": "Connect Strava before syncing activities.",
        }

    tool_context.state["status"] = "syncing"
    params: dict[str, Any] = {"per_page": max(1, min(per_page, 100))}
    if before is not None:
        params["before"] = before
    if after is not None:
        params["after"] = after

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                STRAVA_ACTIVITIES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        tool_context.state["status"] = "idle"
        status_code = exc.response.status_code
        reason = "strava_unauthorized" if status_code in (401, 403) else "strava_api_error"
        return {"ok": False, "reason": reason, "status_code": status_code}
    except httpx.HTTPError as exc:
        tool_context.state["status"] = "idle"
        return {"ok": False, "reason": "strava_network_error", "message": str(exc)}

    activities = [normalize_strava_activity(item) for item in response.json()]
    synced_at = datetime.datetime.now(datetime.UTC).isoformat()
    summary = summarize_activities(activities)

    tool_context.state["activities"] = activities
    tool_context.state["activities_synced_at"] = synced_at
    tool_context.state["status"] = "planning"

    return {"ok": True, "count": len(activities), "synced_at": synced_at, "summary": summary}


def set_objective_research(tool_context: ToolContext, research: str) -> dict:
    """Write curated outdoor objective research to shared state."""
    tool_context.state["objective_research"] = research
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(research)}


def set_training_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write the complete weekly training plan to shared state."""
    tool_context.state["training_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the weekly training plan as ready."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


def on_before_agent(callback_context: CallbackContext):
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    state = callback_context.state
    connected = bool(state.get("strava_connected") and state.get("strava_token"))
    activity_count = len(state.get("activities") or [])
    synced_at = state.get("activities_synced_at") or ""

    prefix = f"""Current fitness state:
- Strava connected: {connected}
- Synced activities: {activity_count}
- Activities synced at: {synced_at or "never"}

If Strava is connected and you are about to create or revise a training plan,
call fetch_activities first when activities are missing or stale.

"""
    original = llm_request.config.system_instruction or ""
    llm_request.config.system_instruction = prefix + str(original)
    return None


def after_model_modifier(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> Optional[LlmResponse]:
    if (
        llm_response.content
        and llm_response.content.parts
        and llm_response.content.role == "model"
        and llm_response.content.parts[0].text
    ):
        callback_context._invocation_context.end_invocation = True
    return None


_INSTRUCTION = """\
You are a practical fitness training partner.

Plan weekly training from the user's recent Strava history when available.
Support endurance workouts, gym strength, stretching, recovery, and preparation
for hiking or mountaineering objectives.

Workflow:
1. If Strava is connected and you are creating or revising a plan, call
   fetch_activities first when the activity snapshot is missing or stale.
2. For hiking or mountaineering objectives, use web search tools to find current
   route, access, permit, seasonal, and weather context. Then call
   set_objective_research with a concise sourced summary.
3. Write plans to state with set_training_plan. Do not paste the full plan into
   chat as the source of truth.
4. Include weekly goals, workout days, gym sessions, mobility, stretching,
   recovery guidance, and objective-specific prep.
5. When the plan is complete, call mark_plan_ready.

Be conservative with progression, specific about recovery, and clear about
assumptions when Strava or objective context is unavailable.
"""


fitness_agent = LlmAgent(
    name="fitness_agent",
    model=LiteLlm(
        model=os.getenv("AGENT_MODEL", "mistral/mistral-small-latest"),
        fallbacks=["openrouter/owl-alpha", "nvidia_nim/deepseek-ai/deepseek-v4-flash"],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=after_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        fetch_activities,
        set_objective_research,
        set_training_plan,
        mark_plan_ready,
        AGUIToolset(),
        web_search_toolset(),
    ],
)

FITNESS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="training_plan",
        tool="set_training_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

adk_fitness_agent = ADKAgent(
    adk_agent=fitness_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=FITNESS_PREDICT_STATE,
)

app = FastAPI(title="Fitness Training Agent")


@app.middleware("http")
async def trace_requests(request, call_next):
    if request.url.path == "/health":
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
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute(
            "duration_ms", round((time.perf_counter() - start) * 1000, 2)
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(app, adk_fitness_agent, path="/")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

- [ ] **Step 4: Create the agent env example**

Create `agents/fitness/.env.example`:

```env
PORT=8002
AGENT_MODEL=mistral/mistral-small-latest
BRAVE_API_KEY=
OTEL_SERVICE_NAME=fitness-agent
OTEL_EXPORTER_OTLP_ENDPOINT=
```

- [ ] **Step 5: Run the agent tests**

Run:

```bash
cd agents/fitness && uv run pytest -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/fitness
git commit -m "feat: add fitness agent backend"
```

---

## Task 4: Agent Deployment Wiring

**Files:**
- Create: `agents/fitness/Dockerfile`
- Create: `agents/fitness/railway.json`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Create the Dockerfile**

Create `agents/fitness/Dockerfile`:

```dockerfile
FROM python:3.14.5-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates nodejs npm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/

WORKDIR /app

COPY . ./

RUN uv pip install --system -e .

EXPOSE 8002

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002}"]
```

- [ ] **Step 2: Create Railway config**

Create `agents/fitness/railway.json`:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 3: Add Docker Compose service**

Modify `docker-compose.yml` to include:

```yaml
  fitness:
    build:
      context: ./agents/fitness
    ports:
      - "8002:8002"
    env_file:
      - path: ./.env
        required: false
      - path: ./agents/fitness/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: fitness-agent
      PORT: 8002
```

- [ ] **Step 4: Add root env examples**

Add to `.env.example`:

```env
FITNESS_AGENT_URL=http://localhost:8002/
EXPO_PUBLIC_FITNESS_AGENT_URL=http://localhost:8002/

BRAVE_API_KEY=...
```

- [ ] **Step 5: Verify Docker Compose parses**

Run:

```bash
docker compose config >/tmp/agents-compose.yml
```

Expected: command exits `0`.

- [ ] **Step 6: Commit**

```bash
git add agents/fitness/Dockerfile agents/fitness/railway.json docker-compose.yml .env.example
git commit -m "feat: wire fitness agent services"
```

---

## Task 5: Web Runtime And Env Wiring

**Files:**
- Modify: `apps/web/src/env.ts`
- Modify: `apps/web/src/app/api/copilotkit/route.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add `FITNESS_AGENT_URL` to env validation**

In `apps/web/src/env.ts`, add `FITNESS_AGENT_URL` to the `server` schema and `runtimeEnv`:

```ts
FITNESS_AGENT_URL: z.string().url(),
```

```ts
FITNESS_AGENT_URL: process.env.FITNESS_AGENT_URL,
```

- [ ] **Step 2: Register the fitness agent**

In `apps/web/src/app/api/copilotkit/route.ts`, add:

```ts
fitness: new HttpAgent({
  url: env.FITNESS_AGENT_URL,
  debug: env.COPILOTKIT_DEBUG,
}),
```

inside the `agents` object.

- [ ] **Step 3: Update web env example**

Add to `apps/web/.env.example`:

```env
FITNESS_AGENT_URL=http://localhost:8002/
```

- [ ] **Step 4: Run a web build check**

Run:

```bash
pnpm --filter web build
```

Expected: with required local env values present, build exits `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/env.ts apps/web/src/app/api/copilotkit/route.ts apps/web/.env.example
git commit -m "feat: register fitness agent in web runtime"
```

---

## Task 6: Strava Token Route

**Files:**
- Create: `apps/web/src/app/api/strava/token/route.ts`

- [ ] **Step 1: Create the token route**

Create `apps/web/src/app/api/strava/token/route.ts`:

```ts
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const STRAVA_PROVIDER = "custom_strava";
const isDevelopment = process.env.NODE_ENV !== "production";

function getErrorDetails(error: unknown) {
  if (!isDevelopment) return undefined;
  if (error && typeof error === "object") {
    const err = error as {
      clerkError?: boolean;
      status?: number;
      errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
      message?: string;
    };

    return {
      clerkError: err.clerkError,
      status: err.status,
      message: err.message,
      errors: err.errors?.map(({ code, message, longMessage }) => ({
        code,
        message,
        longMessage,
      })),
    };
  }

  return { message: String(error) };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ connected: false, token: null }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const account = user.externalAccounts.find(
      ({ provider }) =>
        provider === STRAVA_PROVIDER || provider === `oauth_${STRAVA_PROVIDER}`,
    );
    const { data: tokens } = await client.users.getUserOauthAccessToken(
      userId,
      STRAVA_PROVIDER as never,
    );

    const token = tokens[0]?.token ?? null;
    return NextResponse.json({
      connected: !!token,
      token,
      ...(isDevelopment
        ? {
            debug: {
              provider: STRAVA_PROVIDER,
              externalAccount: account
                ? {
                    provider: account.provider,
                    providerUserId: account.providerUserId,
                    approvedScopes: account.approvedScopes,
                    verificationStatus: account.verification?.status,
                  }
                : null,
              tokenCount: tokens.length,
            },
          }
        : {}),
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      token: null,
      ...(isDevelopment
        ? { debug: { provider: STRAVA_PROVIDER, error: getErrorDetails(error) } }
        : {}),
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript route syntax**

Run:

```bash
pnpm --filter web build
```

Expected: route compiles when required env values are present.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/strava/token/route.ts
git commit -m "feat: add strava token route"
```

---

## Task 7: Fitness Web Page

**Files:**
- Create: `apps/web/src/app/fitness/page.tsx`

- [ ] **Step 1: Create the `/fitness` page**

Create `apps/web/src/app/fitness/page.tsx`:

```tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  CopilotSidebar,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { Streamdown } from "streamdown";
import { Activity, Dumbbell, Mountain, RefreshCw } from "lucide-react";

import type { FitnessActivity, FitnessState, FitnessStatus } from "@agents/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STRAVA_PROVIDER = "custom_strava";
const STRAVA_STRATEGY = "oauth_custom_strava";

const STATUS_META: Record<
  FitnessStatus,
  { label: string; dotClass: string; chipClass: string }
> = {
  idle: {
    label: "No plan yet",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-soft)] bg-[var(--bg-soft)]",
  },
  syncing: {
    label: "Syncing",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
  },
  planning: {
    label: "Planning",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
  },
  ready: {
    label: "Ready",
    dotClass: "bg-[var(--success)]",
    chipClass: "text-[var(--success)] bg-[var(--success-soft)]",
  },
};

function StravaGate({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
        <Activity className="h-6 w-6 text-[var(--accent-strong)]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--ink)]">
          Connect Strava
        </h2>
        <p className="max-w-sm text-sm text-[var(--ink-mute)]">
          The fitness agent uses your recent activity history to adapt weekly
          training, recovery, and mountain objective prep.
        </p>
      </div>
      <Button onClick={onConnect} disabled={connecting} size="lg">
        {connecting ? "Connecting..." : "Connect Strava"}
      </Button>
    </div>
  );
}

function FitnessPageInner() {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState(false);

  const connectStrava = useReverification(async () => {
    if (!user) return;
    const existingAccount = user.externalAccounts.find(
      ({ provider }) => provider === STRAVA_PROVIDER,
    );

    const account = existingAccount
      ? await existingAccount.reauthorize({ redirectUrl: window.location.href })
      : await user.createExternalAccount({
          strategy: STRAVA_STRATEGY,
          redirectUrl: window.location.href,
        });
    const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
    if (redirectUrl) window.location.assign(redirectUrl);
  });

  const { agent } = useAgent({
    agentId: "fitness",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const state = (agent?.state ?? {}) as FitnessState;
  const activities = state.activities ?? [];
  const trainingPlan = state.training_plan ?? "";
  const objectiveResearch = state.objective_research ?? "";
  const status = (state.status ?? "idle") as FitnessStatus;
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = Boolean(agent?.isRunning);
  const stravaConnected = state.strava_connected ?? false;

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Plan next week",
        message: "Sync my Strava activities and plan next week of training.",
      },
      {
        title: "Gym + mobility",
        message: "Add two gym sessions and daily mobility to this week.",
      },
      {
        title: "Mountain objective",
        message:
          "Research Mount Shasta conditions and adapt my training week toward that objective.",
      },
      {
        title: "Recovery focus",
        message:
          "Adapt this week around recovery while keeping my long-term mountain goal moving.",
      },
    ],
    available: "always",
  });

  useEffect(() => {
    if (!agent || !isLoaded || !user) return;

    fetch("/api/strava/token")
      .then((r) => r.json())
      .then(({ connected, token }: { connected: boolean; token: string | null }) => {
        const current = (agent.state ?? {}) as FitnessState;
        agent.setState({
          ...current,
          strava_connected: connected,
          strava_token: token ?? undefined,
        });
      })
      .catch(() => {
        const current = (agent.state ?? {}) as FitnessState;
        agent.setState({
          ...current,
          strava_connected: false,
          strava_token: undefined,
        });
      });
  }, [agent, isLoaded, user]);

  const handleConnect = async () => {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      await connectStrava();
    } catch (err) {
      console.error("Connect failed:", err);
      setConnecting(false);
    }
  };

  const totals = useMemo(() => summarizeActivities(activities), [activities]);

  return (
    <main className="flex min-h-full flex-col">
      <header className="glass sticky top-0 z-20 border-b border-[var(--border-soft)] px-4 pb-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 shadow-md">
              <Mountain className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-[var(--ink)] md:text-xl">
                Fitness Studio
              </h1>
              <p className="mt-0.5 hidden text-xs text-[var(--ink-mute)] sm:block">
                Weekly training from Strava history and mountain objectives.
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "h-auto gap-2 border-transparent px-3 py-1.5 text-[11px]",
              meta.chipClass,
            )}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
            {isRunning ? "Working..." : meta.label}
          </Badge>
        </div>
      </header>

      {!stravaConnected ? (
        <StravaGate onConnect={handleConnect} connecting={connecting} />
      ) : (
        <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <SummaryCard totals={totals} syncedAt={state.activities_synced_at} />
            <ActivitiesCard activities={activities} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <PlanCard plan={trainingPlan} isStreaming={isRunning} />
            <ResearchCard research={objectiveResearch} />
          </div>
        </div>
      )}

      <CopilotSidebar
        agentId="fitness"
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Fitness Planner",
          chatInputPlaceholder: "Plan training, sync Strava, research objectives...",
        }}
      />
    </main>
  );
}

function summarizeActivities(activities: FitnessActivity[]) {
  return activities.reduce(
    (acc, activity) => {
      acc.count += 1;
      acc.distanceKm += (activity.distance_m ?? 0) / 1000;
      acc.hours += (activity.moving_time_s ?? 0) / 3600;
      acc.elevationM += activity.total_elevation_gain_m ?? 0;
      return acc;
    },
    { count: 0, distanceKm: 0, hours: 0, elevationM: 0 },
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex-row items-center gap-2 border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--ink-mute)]">{children}</p>;
}

function SummaryCard({
  totals,
  syncedAt,
}: {
  totals: { count: number; distanceKm: number; hours: number; elevationM: number };
  syncedAt?: string;
}) {
  return (
    <SectionCard title="Recent load" icon={<RefreshCw className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Activities" value={totals.count.toString()} />
        <Metric label="Distance" value={`${totals.distanceKm.toFixed(1)} km`} />
        <Metric label="Time" value={`${totals.hours.toFixed(1)} h`} />
        <Metric label="Gain" value={`${Math.round(totals.elevationM)} m`} />
      </div>
      {syncedAt && (
        <p className="mt-3 text-xs text-[var(--ink-mute)]">
          Synced {new Date(syncedAt).toLocaleString()}
        </p>
      )}
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
      <div className="text-[11px] uppercase text-[var(--ink-mute)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}

function ActivitiesCard({ activities }: { activities: FitnessActivity[] }) {
  return (
    <SectionCard title="Activities" icon={<Activity className="h-4 w-4" />}>
      {activities.length === 0 ? (
        <EmptyHint>Ask the agent to sync recent Strava activities.</EmptyHint>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {activities.slice(0, 8).map((activity) => (
            <li key={activity.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-[var(--ink)]">
                  {activity.name}
                </span>
                <span className="shrink-0 text-xs text-[var(--ink-mute)]">
                  {activity.sport_type ?? "Activity"}
                </span>
              </div>
              <div className="mt-1 flex gap-3 text-xs text-[var(--ink-mute)]">
                {activity.distance_m !== undefined && (
                  <span>{(activity.distance_m / 1000).toFixed(1)} km</span>
                )}
                {activity.total_elevation_gain_m !== undefined && (
                  <span>{Math.round(activity.total_elevation_gain_m)} m gain</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PlanCard({
  plan,
  isStreaming,
}: {
  plan: string;
  isStreaming: boolean;
}) {
  return (
    <SectionCard title="Weekly plan" icon={<Dumbbell className="h-4 w-4" />}>
      {plan ? (
        <div className="text-sm text-[var(--ink-soft)] streamdown-markdown">
          <Streamdown>{plan}</Streamdown>
        </div>
      ) : (
        <EmptyHint>
          Ask the agent to build a week from your recent training.
        </EmptyHint>
      )}
      {isStreaming && (
        <div className="mt-3 text-xs text-[var(--accent-strong)]">writing...</div>
      )}
    </SectionCard>
  );
}

function ResearchCard({ research }: { research: string }) {
  if (!research) return null;
  return (
    <SectionCard title="Objective research" icon={<Mountain className="h-4 w-4" />}>
      <div className="text-sm text-[var(--ink-soft)] streamdown-markdown">
        <Streamdown>{research}</Streamdown>
      </div>
    </SectionCard>
  );
}

export default function FitnessPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="fitness"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <FitnessPageInner />
    </CopilotKit>
  );
}
```

- [ ] **Step 2: Build check**

Run:

```bash
pnpm --filter web build
```

Expected: page compiles when required env values are present.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/fitness/page.tsx
git commit -m "feat: add fitness web page"
```

---

## Task 8: Landing Page Link

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Inspect the landing page**

Run:

```bash
sed -n '1,260p' apps/web/src/app/page.tsx
```

Expected: identify the existing list or cards for travel and grocery.

- [ ] **Step 2: Add a fitness entry**

Add a third entry pointing to `/fitness` with display text `Fitness Studio` and description `Build weekly training from Strava history and mountain objectives.` Use the same component pattern as travel and grocery.

- [ ] **Step 3: Build check**

Run:

```bash
pnpm --filter web build
```

Expected: page compiles when required env values are present.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: link fitness studio from home"
```

---

## Task 9: End-To-End Verification

**Files:**
- No code changes unless verification finds a defect.

- [ ] **Step 1: Run Python tests**

Run:

```bash
cd agents/fitness && uv run pytest -q
```

Expected: PASS.

- [ ] **Step 2: Validate Docker Compose config**

Run:

```bash
docker compose config >/tmp/agents-compose.yml
```

Expected: command exits `0`.

- [ ] **Step 3: Run web build**

Run with local env populated:

```bash
pnpm --filter web build
```

Expected: build exits `0`.

- [ ] **Step 4: Health check the fitness agent**

Run:

```bash
docker compose up --build fitness
```

In another terminal:

```bash
curl -fsS http://localhost:8002/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: no uncommitted implementation changes remain. Pre-existing unrelated worktree changes are still present and untouched.
