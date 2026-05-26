# Wellness Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `wellness` orchestrator agent that plans next week's meals and workouts by calling grocery and fitness over A2A, with shared SQLite-backed ADK sessions and Clerk user identity propagated through AG-UI and A2A.

**Architecture:** Add a fourth ADK/FastAPI service under `agents/wellness`. Create shared session and identity helpers in each Python agent, switch all agents from `InMemorySessionService` to a factory that returns `SqliteSessionService` for local paths or `DatabaseSessionService` for Turso/libSQL SQLAlchemy URLs, update AG-UI extractors to return Clerk `user_id`, and update the A2A executor to read `user_id` from metadata. The web runtime forwards Clerk identity and registers wellness.

**Tech Stack:** Python 3.14, Google ADK `SqliteSessionService`, ag-ui-adk, a2a-sdk, FastAPI, LiteLLM, httpx, Next.js 16, CopilotKit v2, Clerk, pnpm, Docker Compose.

---

## File Structure

- Create `agents/wellness/pyproject.toml`: wellness Python dependencies.
- Create `agents/wellness/Dockerfile`: Docker image matching existing agents.
- Create `agents/wellness/railway.json`: Railway service config.
- Create `agents/wellness/utils.py`: A2A client helpers, shared A2A executor, and shared callback helpers.
- Create `agents/wellness/main.py`: wellness ADK agent, state tools, A2A routes, AG-UI route, health route.
- Create `agents/wellness/tests/test_wellness_tools.py`: A2A client and state tool tests.
- Create `agents/wellness/tests/test_a2a.py`: route and executor tests.
- Modify `agents/travel/main.py`, `agents/grocery/main.py`, `agents/fitness/main.py`: use SQLite sessions and Clerk identity extraction.
- Modify `agents/travel/utils.py`, `agents/grocery/utils.py`, `agents/fitness/utils.py`: read A2A `user_id` from metadata.
- Modify `agents/*/tests/test_a2a.py`: assert metadata user ID behavior.
- Modify `apps/web/src/app/api/copilotkit/route.ts`: read Clerk `auth()` and forward `x-clerk-user-id`; register wellness.
- Modify `apps/web/src/env.ts`: add `WELLNESS_AGENT_URL`.
- Modify `packages/types/src/index.ts`: add wellness state types.
- Modify `docker-compose.yml`: add wellness service and shared SQLite volume mounts.
- Optionally create `apps/web/src/app/wellness/page.tsx`: minimal wellness UI using existing page patterns.

## Task 1: Shared SQLite Session Helper

**Files:**
- Modify: `agents/travel/main.py`
- Modify: `agents/grocery/main.py`
- Modify: `agents/fitness/main.py`
- Test: `agents/grocery/tests/test_session_identity.py`

- [ ] **Step 1: Write failing tests for SQLite session path creation and Clerk extraction**

Create `agents/grocery/tests/test_session_identity.py`:

```python
from pathlib import Path

from starlette.datastructures import Headers


class Request:
    def __init__(self, headers: dict[str, str]):
        self.headers = Headers(headers)


def test_create_session_service_uses_sqlite_and_creates_parent(tmp_path, monkeypatch):
    import main

    db_path = tmp_path / "nested" / "adk_sessions.sqlite"
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(db_path))

    service = main.create_session_service()

    assert service.__class__.__name__ == "SqliteSessionService"
    assert db_path.parent.exists()


def test_extract_kroger_auth_state_includes_clerk_user_id():
    import main

    state = main.extract_identity_state(Request({"x-clerk-user-id": "user_123"}))

    assert state["user_id"] == "user_123"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/test_session_identity.py -v
```

Expected: FAIL because `create_session_service` and `extract_identity_state` are missing.

- [ ] **Step 3: Implement minimal helpers in `agents/grocery/main.py`**

Add imports:

```python
from pathlib import Path
from google.adk.sessions.sqlite_session_service import SqliteSessionService
```

Add constants and helpers near the auth constants:

```python
CLERK_USER_ID_HEADER = "x-clerk-user-id"


def _default_session_db_path() -> str:
    return str((Path(__file__).resolve().parents[2] / ".data" / "adk_sessions.sqlite"))


def create_session_service() -> SqliteSessionService:
    db_path = Path(os.getenv("ADK_SESSION_DB_PATH", _default_session_db_path()))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(db_path))


def extract_identity_state(request) -> dict:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}
```

Update `extract_kroger_auth_state` to start with identity:

```python
async def extract_kroger_auth_state(request, input_data) -> dict:
    state = extract_identity_state(request)
    token = request.headers.get(KROGER_TOKEN_HEADER) or ""
    if not token:
        return {**state, "kroger_connected": False}
    return {**state, "kroger_connected": True, KROGER_TOKEN_STATE_KEY: token}
```

Replace:

```python
_shared_session_svc = InMemorySessionService()
```

with:

```python
_shared_session_svc = create_session_service()
```

Remove `user_id="demo_user"` from `ADKAgent(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/test_session_identity.py -v
```

Expected: PASS.

- [ ] **Step 5: Apply the same helper pattern to travel and fitness**

In `agents/travel/main.py` and `agents/fitness/main.py`, add the same `CLERK_USER_ID_HEADER`, `_default_session_db_path`, `create_session_service`, and `extract_identity_state` helpers. Replace each `_shared_session_svc = InMemorySessionService()` with `_shared_session_svc = create_session_service()`. Remove static `user_id="demo_user"` from each `ADKAgent(...)`.

For fitness, update `extract_strava_auth_state`:

```python
async def extract_strava_auth_state(request, input_data) -> dict[str, Any]:
    state = extract_identity_state(request)
    token = request.headers.get(STRAVA_TOKEN_HEADER) or ""
    if not token:
        log.warning("No Strava token in request headers — agent will run without Strava access")
        return {**state, "strava_connected": False}
    return {**state, "strava_connected": True, STRAVA_TOKEN_STATE_KEY: token}
```

For travel, add an extractor:

```python
async def extract_travel_identity_state(request, input_data) -> dict:
    return extract_identity_state(request)
```

and pass it to `add_adk_fastapi_endpoint(..., extract_state_from_request=extract_travel_identity_state)`.

- [ ] **Step 6: Run existing Python route tests**

Run:

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py -v
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py tests/test_session_identity.py -v
cd agents/fitness && .venv/bin/python -m pytest tests/test_a2a.py tests/test_fitness_tools.py -v
```

Expected: PASS.

## Task 2: A2A Executor User Identity

**Files:**
- Modify: `agents/travel/utils.py`
- Modify: `agents/grocery/utils.py`
- Modify: `agents/fitness/utils.py`
- Test: `agents/grocery/tests/test_a2a.py`

- [ ] **Step 1: Add failing assertion for metadata user ID**

In each `agents/*/tests/test_a2a.py`, update the existing executor test request context so `context.metadata` returns `{"user_id": "user_123"}` and change the assertion from `user_id="a2a_user"` or `user_id="demo_user"` to:

```python
user_id="user_123"
```

If the test uses a simple mock, set:

```python
context.metadata = {"user_id": "user_123"}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py -v
```

Expected: FAIL because `ADKAgentExecutor` still uses a hardcoded user ID.

- [ ] **Step 3: Update executor implementation**

In `agents/travel/utils.py`, `agents/grocery/utils.py`, and `agents/fitness/utils.py`, replace:

```python
user_id = "demo_user"
```

or:

```python
user_id = "a2a_user"
```

with:

```python
user_id = str(context.metadata.get("user_id") or "anonymous")
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py -v
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py -v
cd agents/fitness && .venv/bin/python -m pytest tests/test_a2a.py -v
```

Expected: PASS.

## Task 3: Wellness A2A Client Helpers

**Files:**
- Create: `agents/wellness/pyproject.toml`
- Create: `agents/wellness/utils.py`
- Test: `agents/wellness/tests/test_wellness_tools.py`

- [ ] **Step 1: Create wellness dependency file**

Create `agents/wellness/pyproject.toml`:

```toml
[project]
name = "wellness-agent"
version = "0.1.0"
description = "Wellness planning orchestrator powered by Google ADK + A2A + CopilotKit AG-UI"
requires-python = ">=3.14"
dependencies = [
  "a2a-sdk>=1.0.3",
  "ag-ui-adk>=0.1.0",
  "fastapi>=0.124.0",
  "google-adk>=1.34.1",
  "httpx>=0.28.0",
  "litellm>=1.80.0",
  "opentelemetry-api",
  "opentelemetry-exporter-otlp-proto-http",
  "opentelemetry-instrumentation-fastapi",
  "opentelemetry-instrumentation-sqlite3",
  "opentelemetry-sdk",
  "python-dotenv>=1.0.1",
  "uvicorn[standard]>=0.38.0",
]

[dependency-groups]
dev = [
  "pytest>=9.0.0",
  "pytest-asyncio>=1.3.0",
]
```

- [ ] **Step 2: Install wellness dependencies**

Run:

```bash
cd agents/wellness && uv sync
```

Expected: dependencies install and `.venv` is created.

- [ ] **Step 3: Write failing tests for A2A request metadata**

Create `agents/wellness/tests/test_wellness_tools.py`:

```python
import pytest


class State(dict):
    pass


class ToolContext:
    def __init__(self):
        self.state = State(user_id="user_123")


@pytest.mark.asyncio
async def test_call_a2a_agent_sends_user_id_metadata(monkeypatch):
    import utils

    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "result": {
                    "artifacts": [
                        {"parts": [{"text": "delegated plan"}]}
                    ]
                }
            }

    class Client:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json):
            captured["url"] = url
            captured["json"] = json
            return Response()

    monkeypatch.setattr(utils.httpx, "AsyncClient", Client)

    text = await utils.call_a2a_agent(
        url="http://agent:8001/",
        prompt="Plan meals",
        user_id="user_123",
        context_id="thread_abc",
    )

    assert text == "delegated plan"
    assert captured["json"]["params"]["metadata"]["user_id"] == "user_123"
    assert captured["json"]["params"]["message"]["contextId"] == "thread_abc"
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
cd agents/wellness && .venv/bin/python -m pytest tests/test_wellness_tools.py -v
```

Expected: FAIL because `utils.py` is missing.

- [ ] **Step 5: Implement `agents/wellness/utils.py`**

Create `agents/wellness/utils.py`:

```python
"""Wellness agent utilities for A2A delegation and shared callbacks."""

from __future__ import annotations

import os
from typing import Any, Optional
from uuid import uuid4

import httpx
from a2a.helpers import get_message_text, new_task_from_user_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState
from google.adk.runners import Runner
from google.adk.tools import BaseTool, ToolContext
from google.genai import types as genai_types

GROCERY_AGENT_A2A_URL = os.getenv("GROCERY_AGENT_A2A_URL", "http://grocery:8001/")
FITNESS_AGENT_A2A_URL = os.getenv("FITNESS_AGENT_A2A_URL", "http://fitness:8002/")


def parse_tool_response(tool_response: dict | str) -> Optional[dict | str]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (KeyError, TypeError, AttributeError):
        return None


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    tool_context.state[tool.name] = parse_tool_response(tool_response)
    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response


async def call_a2a_agent(
    *,
    url: str,
    prompt: str,
    user_id: str,
    context_id: str,
) -> str:
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid4()),
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"text": prompt}],
                "messageId": str(uuid4()),
                "contextId": context_id,
            },
            "metadata": {"user_id": user_id},
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(str(data["error"]))
    result = data.get("result") or {}
    for artifact in result.get("artifacts") or []:
        for part in artifact.get("parts") or []:
            text = part.get("text")
            if text:
                return text
    return str(result)


class ADKAgentExecutor(AgentExecutor):
    """Wraps an ADK Runner as an A2A AgentExecutor."""

    def __init__(self, runner: Runner) -> None:
        self._runner = runner

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task
        if task is None:
            task = new_task_from_user_message(context.message)
            await event_queue.enqueue_event(task)

        updater = TaskUpdater(
            event_queue=event_queue,
            task_id=task.id,
            context_id=task.context_id,
        )
        await updater.update_status(TaskState.TASK_STATE_WORKING)

        user_id = str(context.metadata.get("user_id") or "anonymous")
        session_id = context.context_id

        existing = await self._runner.session_service.get_session(
            app_name=self._runner.app_name,
            user_id=user_id,
            session_id=session_id,
        )
        if existing is None:
            await self._runner.session_service.create_session(
                app_name=self._runner.app_name,
                user_id=user_id,
                session_id=session_id,
            )

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=get_message_text(context.message))],
        )

        reply = ""
        async for event in self._runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                reply = event.content.parts[0].text or ""
                break

        await updater.add_artifact(parts=[new_text_part(text=reply)])
        await updater.complete()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("Cancel not supported")
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
cd agents/wellness && .venv/bin/python -m pytest tests/test_wellness_tools.py -v
```

Expected: PASS.

## Task 4: Wellness Agent Service

**Files:**
- Create: `agents/wellness/main.py`
- Create: `agents/wellness/tests/test_a2a.py`

- [ ] **Step 1: Write route smoke tests**

Create `agents/wellness/tests/test_a2a.py`:

```python
from fastapi.testclient import TestClient


def test_health_route():
    import main

    client = TestClient(main.app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_a2a_agent_card_route_exists():
    import main

    client = TestClient(main.app)

    response = client.get("/.well-known/agent-card.json")

    assert response.status_code == 200
    assert response.json()["name"] == "Wellness Planning Agent"


def test_a2a_rpc_route_exists():
    import main

    client = TestClient(main.app)

    response = client.post("/", json={"jsonrpc": "2.0", "id": "1", "method": "unknown"})

    assert response.status_code in (200, 400, 422)
    assert response.status_code != 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd agents/wellness && .venv/bin/python -m pytest tests/test_a2a.py -v
```

Expected: FAIL because `main.py` is missing.

- [ ] **Step 3: Implement `agents/wellness/main.py`**

Create `agents/wellness/main.py` with the same structure as grocery and fitness. Include:

```python
"""Wellness Planning Agent — A2A orchestrator for meals and workouts."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource

from utils import (
    ADKAgentExecutor,
    FITNESS_AGENT_A2A_URL,
    GROCERY_AGENT_A2A_URL,
    call_a2a_agent,
    shared_after_tool_callback,
)

load_dotenv()

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("wellness_agent")

CLERK_USER_ID_HEADER = "x-clerk-user-id"

_DEFAULT_STATE: dict[str, Any] = {
    "status": "idle",
    "meal_plan": "",
    "workout_plan": "",
    "weekly_plan": "",
    "review_summary": "",
    "last_delegation": {},
    "user_id": "",
}


def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return
    from google.adk.telemetry.setup import maybe_set_otel_providers
    resource = Resource.create({
        "service.name": os.getenv("RAILWAY_SERVICE_NAME", "wellness-agent"),
        "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
        "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
    })
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()


def _default_session_db_path() -> str:
    return str((Path(__file__).resolve().parents[2] / ".data" / "adk_sessions.sqlite"))


def create_session_service() -> SqliteSessionService:
    db_path = Path(os.getenv("ADK_SESSION_DB_PATH", _default_session_db_path()))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(db_path))


def extract_identity_state(request) -> dict:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


async def extract_wellness_state(request, input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext):
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
    return None


def before_model_modifier(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    state = {key: callback_context.state.get(key, default) for key, default in _DEFAULT_STATE.items()}
    llm_request.config.system_instruction = (
        "Current wellness state:\n"
        + json.dumps(state, indent=2, default=str)
        + "\n\n"
        + str(llm_request.config.system_instruction or "")
    )
    return None


def after_model_modifier(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    if llm_response.content and llm_response.content.parts and llm_response.content.role == "model" and llm_response.content.parts[0].text:
        callback_context._invocation_context.end_invocation = True
    return None


async def request_meal_plan(tool_context: ToolContext, preferences: str = "") -> dict:
    user_id = str(tool_context.state.get("user_id") or "anonymous")
    prompt = "Plan next week's meals for this user. Return a concise but complete weekly meal plan."
    if preferences:
        prompt += f"\n\nPreferences and constraints:\n{preferences}"
    tool_context.state["status"] = "delegating"
    text = await call_a2a_agent(
        url=GROCERY_AGENT_A2A_URL,
        prompt=prompt,
        user_id=user_id,
        context_id=f"wellness-grocery-{user_id}",
    )
    tool_context.state["meal_plan"] = text
    tool_context.state["last_delegation"] = {"grocery": "ok"}
    return {"ok": True, "meal_plan": text}


async def request_workout_plan(tool_context: ToolContext, goal: str = "") -> dict:
    user_id = str(tool_context.state.get("user_id") or "anonymous")
    prompt = "Plan next week's workouts for this user. Return a concise but complete weekly workout plan."
    if goal:
        prompt += f"\n\nTraining goal and constraints:\n{goal}"
    tool_context.state["status"] = "delegating"
    text = await call_a2a_agent(
        url=FITNESS_AGENT_A2A_URL,
        prompt=prompt,
        user_id=user_id,
        context_id=f"wellness-fitness-{user_id}",
    )
    tool_context.state["workout_plan"] = text
    current = tool_context.state.get("last_delegation") or {}
    tool_context.state["last_delegation"] = {**current, "fitness": "ok"}
    return {"ok": True, "workout_plan": text}


def set_weekly_wellness_plan(tool_context: ToolContext, plan: str) -> dict:
    tool_context.state["weekly_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict:
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
```

Then define `_INSTRUCTION`, `wellness_agent`, `WELLNESS_PREDICT_STATE`, `_shared_session_svc`, `_a2a_runner`, `_a2a_agent_card`, `adk_wellness_agent`, FastAPI routes, and `uvicorn` runner following the exact grocery/fitness pattern. Use `app_name="wellness_agent"` via the `LlmAgent` name and omit static `user_id`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd agents/wellness && .venv/bin/python -m pytest tests/test_wellness_tools.py tests/test_a2a.py -v
```

Expected: PASS.

## Task 5: Web Runtime Identity and Wellness Registration

**Files:**
- Modify: `apps/web/src/app/api/copilotkit/route.ts`
- Modify: `apps/web/src/env.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Modify web runtime to forward Clerk user ID**

In `apps/web/src/app/api/copilotkit/route.ts`, import Clerk auth:

```ts
import { auth } from "@clerk/nextjs/server";
```

Add:

```ts
const CLERK_USER_ID_HEADER = "x-clerk-user-id";
```

Inside `agents: async () => {`, add:

```ts
const { userId } = await auth();
const identityHeaders = userId ? { [CLERK_USER_ID_HEADER]: userId } : {};
```

Merge `identityHeaders` into travel, grocery, fitness, and wellness `HttpAgent` headers.

Add:

```ts
wellness: new HttpAgent({
  url: env.WELLNESS_AGENT_URL,
  debug: env.COPILOTKIT_DEBUG,
  headers: identityHeaders,
}),
```

- [ ] **Step 2: Add env var**

In `apps/web/src/env.ts`, add `WELLNESS_AGENT_URL` to `server` and `runtimeEnv`:

```ts
WELLNESS_AGENT_URL: z.string().url(),
```

and:

```ts
WELLNESS_AGENT_URL: process.env.WELLNESS_AGENT_URL,
```

- [ ] **Step 3: Add wellness types**

In `packages/types/src/index.ts`, add:

```ts
export type WellnessStatus = 'idle' | 'delegating' | 'planning' | 'ready'

export type WellnessState = {
  status?: WellnessStatus
  meal_plan?: string
  workout_plan?: string
  weekly_plan?: string
  review_summary?: string
  last_delegation?: Record<string, unknown>
  user_id?: string
}
```

- [ ] **Step 4: Run type checks**

Run:

```bash
pnpm --filter web lint
pnpm --filter types build
```

Expected: PASS, or if these scripts do not exist, run `pnpm -r typecheck` and document the available verification command.

## Task 6: Docker Compose and Service Files

**Files:**
- Create: `agents/wellness/Dockerfile`
- Create: `agents/wellness/railway.json`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create service files**

Copy the Dockerfile pattern from `agents/fitness/Dockerfile` into `agents/wellness/Dockerfile`, changing only service-specific defaults if present.

Create `agents/wellness/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 2: Update Compose**

In `docker-compose.yml`, add `/data` volume mounts and `ADK_SESSION_DB_PATH` to all agents:

```yaml
    volumes:
      - adk-session-data:/data
    environment:
      ADK_SESSION_DB_PATH: /data/adk_sessions.sqlite
```

Add wellness:

```yaml
  wellness:
    build:
      context: ./agents/wellness
    ports:
      - "8003:8003"
    env_file:
      - path: ./.env
        required: false
      - path: ./agents/wellness/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: wellness-agent
      PORT: 8003
      ADK_SESSION_DB_PATH: /data/adk_sessions.sqlite
      GROCERY_AGENT_A2A_URL: http://grocery:8001/
      FITNESS_AGENT_A2A_URL: http://fitness:8002/
    volumes:
      - adk-session-data:/data

volumes:
  adk-session-data:
```

- [ ] **Step 3: Validate Compose config**

Run:

```bash
docker compose config >/tmp/agents-compose.yml
```

Expected: command exits 0.

## Task 7: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run focused Python tests**

Run:

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py -v
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py tests/test_session_identity.py tests/test_grocery_auth.py -v
cd agents/fitness && .venv/bin/python -m pytest tests/test_a2a.py tests/test_fitness_tools.py -v
cd agents/wellness && .venv/bin/python -m pytest tests/test_wellness_tools.py tests/test_a2a.py -v
```

Expected: PASS.

- [ ] **Step 2: Run JS verification**

Run:

```bash
pnpm --filter web lint
pnpm --filter types build
```

Expected: PASS, or record missing scripts and run the closest available repo verification.

- [ ] **Step 3: Validate Docker config**

Run:

```bash
docker compose config >/tmp/agents-compose.yml
```

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff --stat
git diff --check
```

Expected: no whitespace errors and only scoped wellness/session/identity changes.
