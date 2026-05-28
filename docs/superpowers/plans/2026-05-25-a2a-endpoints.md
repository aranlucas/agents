# A2A Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add A2A protocol endpoints to all three agents (travel, grocery, fitness) sharing the same in-memory session service with the existing AG-UI endpoint.

**Architecture:** Each agent's FastAPI app gains A2A routes at `/` (JSON-RPC) and `/.well-known/agent-card.json` (agent card) by wiring `a2a-sdk` v1.0.x's `add_a2a_routes_to_fastapi` into the existing app. A shared `InMemorySessionService` instance is passed to both `ADKAgent` (AG-UI path) and the A2A `Runner`, so both protocols operate on the same in-memory session store. AG-UI moves from `path="/"` to `path="/agui"`. A single generic `ADKAgentExecutor` class lives in each agent's `utils.py`.

**Tech Stack:** `a2a-sdk>=1.0.3`, `google-adk>=1.34.1`, FastAPI, `google.adk.runners.Runner`, `google.adk.sessions.InMemorySessionService`

---

## File Map

| File                               | Change                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `agents/travel/pyproject.toml`     | Add `a2a-sdk>=1.0.3`                                                                     |
| `agents/grocery/pyproject.toml`    | Add `a2a-sdk>=1.0.3`                                                                     |
| `agents/fitness/pyproject.toml`    | Add `a2a-sdk>=1.0.3`                                                                     |
| `agents/travel/utils.py`           | Add `ADKAgentExecutor` class                                                             |
| `agents/grocery/utils.py`          | Add `ADKAgentExecutor` class                                                             |
| `agents/fitness/utils.py`          | Add `ADKAgentExecutor` class                                                             |
| `agents/travel/main.py`            | Shared session svc, A2A runner + routes, move AG-UI to `/agui`, fix `ResourceAttributes` |
| `agents/grocery/main.py`           | Same pattern                                                                             |
| `agents/fitness/main.py`           | Same pattern                                                                             |
| `agents/travel/tests/test_a2a.py`  | New — smoke tests for A2A routes                                                         |
| `agents/grocery/tests/test_a2a.py` | New                                                                                      |
| `agents/fitness/tests/test_a2a.py` | New                                                                                      |
| `apps/web/.env.example`            | `*_AGENT_URL` → `…/agui`                                                                 |
| `apps/web/.env.local`              | Same                                                                                     |

---

## Task 1: Add `a2a-sdk>=1.0.3` to all three agents

**Files:**

- Modify: `agents/travel/pyproject.toml`
- Modify: `agents/grocery/pyproject.toml`
- Modify: `agents/fitness/pyproject.toml`

- [ ] **Step 1: Add dependency to all three pyproject.toml files**

In each file, add `"a2a-sdk>=1.0.3"` to the `dependencies` list. Keep `google-adk>=1.34.1` as-is (no `[a2a]` extra needed — we use a2a-sdk directly).

`agents/travel/pyproject.toml` — add one line to `dependencies`:

```toml
[project]
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "python-dotenv",
  "pydantic",
  "google-adk>=1.34.1",
  "google-genai",
  "ag-ui-adk",
  "litellm",
  "a2a-sdk>=1.0.3",
  "opentelemetry-api",
  "opentelemetry-sdk",
  "opentelemetry-instrumentation-sqlite3",
  "opentelemetry-instrumentation-google-genai>=0.7b1",
  "opentelemetry-instrumentation-vertexai>=2.0b0",
]
```

Same addition for `agents/grocery/pyproject.toml` and `agents/fitness/pyproject.toml` (their dependency lists differ in MCP packages; just add `"a2a-sdk>=1.0.3"` alongside the others).

- [ ] **Step 2: Install in all three venvs**

```bash
cd /path/to/agents/agents/travel && uv sync
cd /path/to/agents/agents/grocery && uv sync
cd /path/to/agents/agents/fitness && uv sync
```

Expected: each `uv sync` installs `a2a-sdk 1.0.3` (or latest 1.0.x) without conflicts.

- [ ] **Step 3: Verify import works in each venv**

```bash
cd agents/travel && .venv/bin/python -c "from a2a.server.routes import add_a2a_routes_to_fastapi; print('ok')"
cd agents/grocery && .venv/bin/python -c "from a2a.server.routes import add_a2a_routes_to_fastapi; print('ok')"
cd agents/fitness && .venv/bin/python -c "from a2a.server.routes import add_a2a_routes_to_fastapi; print('ok')"
```

Expected: `ok` for each.

- [ ] **Step 4: Commit**

```bash
git add agents/travel/pyproject.toml agents/grocery/pyproject.toml agents/fitness/pyproject.toml
git commit -m "chore: add a2a-sdk>=1.0.3 to all three agents"
```

---

## Task 2: Add `ADKAgentExecutor` to all three `utils.py` files

The executor is identical in all three agents — it wraps any ADK `Runner` generically. Add it to `utils.py` in each agent directory.

**Files:**

- Modify: `agents/travel/utils.py`
- Modify: `agents/grocery/utils.py`
- Modify: `agents/fitness/utils.py`

- [ ] **Step 1: Write the failing test (travel)**

Create `agents/travel/tests/test_a2a.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_executor_creates_session_when_missing(monkeypatch):
    """Executor creates an ADK session if context_id has no existing session."""
    from utils import ADKAgentExecutor

    runner = MagicMock()
    runner.app_name = "test_agent"
    runner.session_service = AsyncMock()
    runner.session_service.get_session = AsyncMock(return_value=None)
    runner.session_service.create_session = AsyncMock()

    async def fake_run(**kwargs):
        event = MagicMock()
        event.is_final_response.return_value = True
        event.content.parts = [MagicMock(text="Done")]
        yield event

    runner.run_async = fake_run

    context = MagicMock()
    context.current_task = None
    context.context_id = "ctx-abc"

    from a2a.helpers import new_text_message
    context.message = new_text_message("hello")

    queue = AsyncMock()
    queue.enqueue_event = AsyncMock()

    executor = ADKAgentExecutor(runner)
    await executor.execute(context, queue)

    runner.session_service.create_session.assert_called_once_with(
        app_name="test_agent",
        user_id="a2a_user",
        session_id="ctx-abc",
    )


@pytest.mark.asyncio
async def test_executor_skips_session_creation_when_exists():
    """Executor does not create a session if one already exists."""
    from utils import ADKAgentExecutor

    runner = MagicMock()
    runner.app_name = "test_agent"
    runner.session_service = AsyncMock()
    runner.session_service.get_session = AsyncMock(return_value=object())  # existing session
    runner.session_service.create_session = AsyncMock()

    async def fake_run(**kwargs):
        event = MagicMock()
        event.is_final_response.return_value = True
        event.content.parts = [MagicMock(text="Result")]
        yield event

    runner.run_async = fake_run

    context = MagicMock()
    context.current_task = None
    context.context_id = "ctx-existing"

    from a2a.helpers import new_text_message
    context.message = new_text_message("query")

    queue = AsyncMock()
    queue.enqueue_event = AsyncMock()

    executor = ADKAgentExecutor(runner)
    await executor.execute(context, queue)

    runner.session_service.create_session.assert_not_called()
```

- [ ] **Step 2: Run test to confirm ImportError (ADKAgentExecutor not yet defined)**

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py -v 2>&1 | head -20
```

Expected: `ImportError: cannot import name 'ADKAgentExecutor' from 'utils'`

- [ ] **Step 3: Add `ADKAgentExecutor` to `agents/travel/utils.py`**

Append to the bottom of the existing file:

```python
from a2a.helpers import get_message_text, new_task_from_user_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types.a2a_pb2 import TaskState
from google.adk.runners import Runner
from google.genai import types as genai_types


class ADKAgentExecutor(AgentExecutor):
    """Wraps an ADK Runner as an A2A AgentExecutor.

    Based on the a2a-python helloworld sample pattern.
    Uses context_id as the ADK session_id and a fixed user_id of "a2a_user".
    """

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

        user_id = "a2a_user"
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

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Copy the same block to grocery and fitness utils.py**

The `ADKAgentExecutor` class and its imports are identical. Append the same block (Step 3 code) verbatim to `agents/grocery/utils.py` and `agents/fitness/utils.py`.

Then copy the test file:

```bash
cp agents/travel/tests/test_a2a.py agents/grocery/tests/test_a2a.py
cp agents/travel/tests/test_a2a.py agents/fitness/tests/test_a2a.py
```

- [ ] **Step 6: Run tests in all three agents**

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py -v
cd agents/fitness && .venv/bin/python -m pytest tests/test_a2a.py -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/travel/utils.py agents/grocery/utils.py agents/fitness/utils.py \
        agents/travel/tests/test_a2a.py agents/grocery/tests/test_a2a.py agents/fitness/tests/test_a2a.py
git commit -m "feat: add ADKAgentExecutor to all three agents"
```

---

## Task 3: Wire A2A into travel `main.py`

**Files:**

- Modify: `agents/travel/main.py`
- Modify: `agents/travel/tests/test_a2a.py` (add route smoke tests)

- [ ] **Step 1: Add route smoke tests to `agents/travel/tests/test_a2a.py`**

Append to the existing test file:

```python
def test_agent_card_route():
    """A2A agent card is served at the well-known URL."""
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Travel Planning Agent"
    assert body["version"] == "1.0.0"


def test_a2a_rpc_route_exists():
    """POST / returns an A2A error (not 404), proving the route is registered."""
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    """AG-UI endpoint is at /agui, not /."""
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    # /agui exists (not 404)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
    # old root is no longer the AG-UI handler — POST / goes to A2A, not AG-UI
    r2 = client.post("/", json={"type": "RunAgentInput"})
    assert "name" not in r2.json()  # A2A error, not AG-UI agent list
```

- [ ] **Step 2: Run tests — expect failure (routes not wired yet)**

```bash
cd agents/travel && .venv/bin/python -m pytest tests/test_a2a.py::test_agent_card_route -v
```

Expected: FAIL with 404.

- [ ] **Step 3: Update imports in `agents/travel/main.py`**

Replace the existing import block. Changes:

- Remove `from opentelemetry.semconv.resource import ResourceAttributes`
- Add a2a-sdk imports, ADK service imports, `ADKAgentExecutor` from utils

The new import section (replace everything up through the `load_dotenv()` call):

```python
"""Collab Studio — Trip Planning agent backend."""

import datetime
import logging
import os
import time

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import (
    add_a2a_routes_to_fastapi,
    create_agent_card_routes,
    create_jsonrpc_routes,
)
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.adk.utils import instructions_utils
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from utils import ADKAgentExecutor, trvl_toolset, shared_after_tool_callback

load_dotenv()
```

- [ ] **Step 4: Fix `ResourceAttributes` deprecation in `_setup_otel`**

In `_setup_otel()`, replace the two `ResourceAttributes.*` references with string literals:

```python
def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "travel-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()
```

Also remove the `from opentelemetry.semconv.resource import ResourceAttributes` import line added in Step 3 (it was kept as a placeholder — delete it now).

- [ ] **Step 5: Add shared session service, A2A runner, and agent card function**

Insert the following block immediately after `COLLAB_PREDICT_STATE = [...]` and before `adk_collab_agent = ADKAgent(...)`:

```python
# ---------------------------------------------------------------------------
# Shared in-memory session service — used by both AG-UI and A2A paths.
# ---------------------------------------------------------------------------
_shared_session_svc = InMemorySessionService()

# A2A runner — same LlmAgent and session store as AG-UI, no extra process.
_a2a_runner = Runner(
    app_name=collab_trip_agent.name,
    agent=collab_trip_agent,
    artifact_service=InMemoryArtifactService(),
    session_service=_shared_session_svc,
    memory_service=InMemoryMemoryService(),
    credential_service=InMemoryCredentialService(),
)


def _a2a_agent_card() -> AgentCard:
    host = os.getenv("RAILWAY_PUBLIC_DOMAIN") or f"localhost:{os.getenv('PORT', '8000')}"
    scheme = "https" if os.getenv("RAILWAY_PUBLIC_DOMAIN") else "http"
    return AgentCard(
        name="Travel Planning Agent",
        description=(
            "Co-plans multi-day trips with real flight, hotel, and destination data. "
            "Produces a structured day-by-day itinerary."
        ),
        version="1.0.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        supported_interfaces=[
            AgentInterface(protocol_binding="JSONRPC", url=f"{scheme}://{host}/")
        ],
        skills=[
            AgentSkill(
                id="trip_planning",
                name="Trip Planning",
                description="Plans multi-day trips: flights, hotels, itinerary, budget.",
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )
```

- [ ] **Step 6: Pass shared session service to `adk_collab_agent`**

Update the `ADKAgent` constructor to pass the shared session service:

```python
adk_collab_agent = ADKAgent(
    adk_agent=collab_trip_agent,
    user_id="demo_user",
    session_service=_shared_session_svc,
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=COLLAB_PREDICT_STATE,
)
```

- [ ] **Step 7: Wire A2A routes and move AG-UI to `/agui`**

After the `app.add_middleware(CORSMiddleware, ...)` call, add the A2A route registration and move AG-UI:

```python
# A2A — JSON-RPC at POST / and agent card at GET /.well-known/agent-card.json
_a2a_card = _a2a_agent_card()
_a2a_handler = DefaultRequestHandler(
    agent_executor=ADKAgentExecutor(_a2a_runner),
    task_store=InMemoryTaskStore(),
    agent_card=_a2a_card,
)
add_a2a_routes_to_fastapi(
    app,
    agent_card_routes=create_agent_card_routes(_a2a_card),
    jsonrpc_routes=create_jsonrpc_routes(_a2a_handler, "/"),
)

# AG-UI — moved from "/" to "/agui"
add_adk_fastapi_endpoint(app, adk_collab_agent, path="/agui")
```

Remove the old `add_adk_fastapi_endpoint(app, adk_collab_agent, path="/")` line.

- [ ] **Step 8: Run all travel tests**

```bash
cd agents/travel && .venv/bin/python -m pytest tests/ -v
```

Expected: all tests PASS, including the three new route smoke tests.

- [ ] **Step 9: Commit**

```bash
git add agents/travel/main.py agents/travel/tests/test_a2a.py
git commit -m "feat(travel): add A2A endpoint at / and move AG-UI to /agui"
```

---

## Task 4: Wire A2A into grocery `main.py`

**Files:**

- Modify: `agents/grocery/main.py`
- Modify: `agents/grocery/tests/test_a2a.py`

- [ ] **Step 1: Add route smoke tests to `agents/grocery/tests/test_a2a.py`**

Append (same pattern as travel, different agent name):

```python
def test_agent_card_route():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Grocery Planning Agent"


def test_a2a_rpc_route_exists():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
```

- [ ] **Step 2: Run — expect failure (routes not wired yet)**

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/test_a2a.py::test_agent_card_route -v
```

Expected: FAIL with 404.

- [ ] **Step 3: Update imports in `agents/grocery/main.py`**

Replace the import section (remove `ResourceAttributes`, add a2a-sdk + ADK service imports + `ADKAgentExecutor`):

```python
"""Grocery Planning Agent — Meal Planner MCP + ADK + AG-UI shared-state pattern."""

import json
import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import (
    add_a2a_routes_to_fastapi,
    create_agent_card_routes,
    create_jsonrpc_routes,
)
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmResponse, LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource

from utils import ADKAgentExecutor, meal_planner_toolset, shared_after_tool_callback

load_dotenv()
```

- [ ] **Step 4: Fix `ResourceAttributes` in `_setup_otel`**

```python
def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "grocery-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()
```

- [ ] **Step 5: Add shared session service, A2A runner, and agent card function**

Insert after `GROCERY_PREDICT_STATE = [...]` and before `adk_grocery_agent = ADKAgent(...)`:

```python
# ---------------------------------------------------------------------------
# Shared in-memory session service — used by both AG-UI and A2A paths.
# ---------------------------------------------------------------------------
_shared_session_svc = InMemorySessionService()

_a2a_runner = Runner(
    app_name=grocery_agent.name,
    agent=grocery_agent,
    artifact_service=InMemoryArtifactService(),
    session_service=_shared_session_svc,
    memory_service=InMemoryMemoryService(),
    credential_service=InMemoryCredentialService(),
)


def _a2a_agent_card() -> AgentCard:
    host = os.getenv("RAILWAY_PUBLIC_DOMAIN") or f"localhost:{os.getenv('PORT', '8001')}"
    scheme = "https" if os.getenv("RAILWAY_PUBLIC_DOMAIN") else "http"
    return AgentCard(
        name="Grocery Planning Agent",
        description=(
            "Plans meals and shopping lists with live Kroger product data, "
            "pantry tracking, and weekly deals."
        ),
        version="1.0.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        supported_interfaces=[
            AgentInterface(protocol_binding="JSONRPC", url=f"{scheme}://{host}/")
        ],
        skills=[
            AgentSkill(
                id="grocery_planning",
                name="Grocery Planning",
                description="Creates meal plans and shopping lists from live Kroger data.",
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )
```

- [ ] **Step 6: Pass shared session service to `adk_grocery_agent`**

```python
adk_grocery_agent = ADKAgent(
    adk_agent=grocery_agent,
    user_id="demo_user",
    session_service=_shared_session_svc,
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=GROCERY_PREDICT_STATE,
)
```

- [ ] **Step 7: Wire A2A routes and move AG-UI to `/agui`**

After `app.add_middleware(CORSMiddleware, ...)`:

```python
# A2A routes
_a2a_card = _a2a_agent_card()
_a2a_handler = DefaultRequestHandler(
    agent_executor=ADKAgentExecutor(_a2a_runner),
    task_store=InMemoryTaskStore(),
    agent_card=_a2a_card,
)
add_a2a_routes_to_fastapi(
    app,
    agent_card_routes=create_agent_card_routes(_a2a_card),
    jsonrpc_routes=create_jsonrpc_routes(_a2a_handler, "/"),
)

# AG-UI — moved from "/" to "/agui"
add_adk_fastapi_endpoint(
    app,
    adk_grocery_agent,
    path="/agui",
    extract_state_from_request=extract_kroger_auth_state,
)
```

Remove the old `add_adk_fastapi_endpoint(app, adk_grocery_agent, path="/", extract_state_from_request=extract_kroger_auth_state)` line.

- [ ] **Step 8: Run all grocery tests**

```bash
cd agents/grocery && .venv/bin/python -m pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add agents/grocery/main.py agents/grocery/tests/test_a2a.py
git commit -m "feat(grocery): add A2A endpoint at / and move AG-UI to /agui"
```

---

## Task 5: Wire A2A into fitness `main.py`

**Files:**

- Modify: `agents/fitness/main.py`
- Modify: `agents/fitness/tests/test_a2a.py`

- [ ] **Step 1: Add route smoke tests to `agents/fitness/tests/test_a2a.py`**

Append:

```python
def test_agent_card_route():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Fitness Training Agent"


def test_a2a_rpc_route_exists():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
```

- [ ] **Step 2: Run — expect failure**

```bash
cd agents/fitness && .venv/bin/python -m pytest tests/test_a2a.py::test_agent_card_route -v
```

Expected: FAIL with 404.

- [ ] **Step 3: Update imports in `agents/fitness/main.py`**

Replace the import section:

```python
"""Fitness Training Agent — Strava + objective research + AG-UI shared state."""

import datetime
import logging
import os
import time
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import (
    add_a2a_routes_to_fastapi,
    create_agent_card_routes,
    create_jsonrpc_routes,
)
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import InMemoryCredentialService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource

from utils import ADKAgentExecutor, shared_after_tool_callback, web_search_toolset

load_dotenv()
```

- [ ] **Step 4: Fix `ResourceAttributes` in `_setup_otel`**

```python
def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "fitness-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()
```

- [ ] **Step 5: Add shared session service, A2A runner, and agent card function**

Insert after `FITNESS_PREDICT_STATE = [...]` and before `adk_fitness_agent = ADKAgent(...)`:

```python
# ---------------------------------------------------------------------------
# Shared in-memory session service — used by both AG-UI and A2A paths.
# ---------------------------------------------------------------------------
_shared_session_svc = InMemorySessionService()

_a2a_runner = Runner(
    app_name=fitness_agent.name,
    agent=fitness_agent,
    artifact_service=InMemoryArtifactService(),
    session_service=_shared_session_svc,
    memory_service=InMemoryMemoryService(),
    credential_service=InMemoryCredentialService(),
)


def _a2a_agent_card() -> AgentCard:
    host = os.getenv("RAILWAY_PUBLIC_DOMAIN") or f"localhost:{os.getenv('PORT', '8002')}"
    scheme = "https" if os.getenv("RAILWAY_PUBLIC_DOMAIN") else "http"
    return AgentCard(
        name="Fitness Training Agent",
        description=(
            "Builds weekly training plans from Strava activity history and "
            "research on outdoor objectives like hiking and mountaineering."
        ),
        version="1.0.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        supported_interfaces=[
            AgentInterface(protocol_binding="JSONRPC", url=f"{scheme}://{host}/")
        ],
        skills=[
            AgentSkill(
                id="training_planning",
                name="Training Planning",
                description="Creates weekly training plans from Strava data and objective research.",
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )
```

- [ ] **Step 6: Pass shared session service to `adk_fitness_agent`**

```python
adk_fitness_agent = ADKAgent(
    adk_agent=fitness_agent,
    user_id="demo_user",
    session_service=_shared_session_svc,
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=FITNESS_PREDICT_STATE,
)
```

- [ ] **Step 7: Wire A2A routes and move AG-UI to `/agui`**

After `app.add_middleware(CORSMiddleware, ...)`:

```python
# A2A routes
_a2a_card = _a2a_agent_card()
_a2a_handler = DefaultRequestHandler(
    agent_executor=ADKAgentExecutor(_a2a_runner),
    task_store=InMemoryTaskStore(),
    agent_card=_a2a_card,
)
add_a2a_routes_to_fastapi(
    app,
    agent_card_routes=create_agent_card_routes(_a2a_card),
    jsonrpc_routes=create_jsonrpc_routes(_a2a_handler, "/"),
)

# AG-UI — moved from "/" to "/agui"
add_adk_fastapi_endpoint(
    app,
    adk_fitness_agent,
    path="/agui",
    extract_state_from_request=extract_strava_auth_state,
)
```

Remove the old `add_adk_fastapi_endpoint(app, adk_fitness_agent, path="/", extract_state_from_request=extract_strava_auth_state)` line.

- [ ] **Step 8: Run all fitness tests**

```bash
cd agents/fitness && .venv/bin/python -m pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add agents/fitness/main.py agents/fitness/tests/test_a2a.py
git commit -m "feat(fitness): add A2A endpoint at / and move AG-UI to /agui"
```

---

## Task 6: Update frontend env vars

AG-UI moved from `<base>/` to `<base>/agui`. Update the env files the frontend uses to connect to the agents.

**Files:**

- Modify: `apps/web/.env.example`
- Modify: `apps/web/.env.local`

- [ ] **Step 1: Update `.env.example`**

```bash
# agents/web/.env.example — Agent URLs section
TRAVEL_AGENT_URL=http://localhost:8000/agui
GROCERY_AGENT_URL=http://localhost:8001/agui
FITNESS_AGENT_URL=http://localhost:8002/agui
```

(All other lines unchanged.)

- [ ] **Step 2: Update `.env.local` with same URL changes**

Same three lines as `.env.example` — update the localhost URLs to include `/agui`.

- [ ] **Step 3: Verify frontend still connects**

Start each agent locally (in separate terminals), then start the Next.js dev server and confirm the web UI loads and an agent responds.

```bash
# Terminal 1
cd agents/travel && .venv/bin/python -m uvicorn main:app --port 8000

# Terminal 2
cd agents/grocery && .venv/bin/python -m uvicorn main:app --port 8001

# Terminal 3
cd agents/fitness && .venv/bin/python -m uvicorn main:app --port 8002

# Terminal 4
cd apps/web && pnpm dev
```

Open http://localhost:3000 and send one message to a agent. Confirm it replies.

Also verify A2A cards are reachable:

```bash
curl http://localhost:8000/.well-known/agent-card.json | python3 -m json.tool
curl http://localhost:8001/.well-known/agent-card.json | python3 -m json.tool
curl http://localhost:8002/.well-known/agent-card.json | python3 -m json.tool
```

Expected: each returns a JSON agent card with `"name"` and `"skills"`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/.env.example apps/web/.env.local
git commit -m "chore: update agent URLs to /agui after A2A route move"
```

---

## Self-Review

**Spec coverage:**

- ✅ A2A at `/` — `create_jsonrpc_routes(_a2a_handler, "/")` in Tasks 3–5
- ✅ Agent card at `/.well-known/agent-card.json` — `create_agent_card_routes` in Tasks 3–5
- ✅ AG-UI moved to `/agui` — `path="/agui"` in Tasks 3–5
- ✅ Shared `InMemorySessionService` — `_shared_session_svc` passed to both `ADKAgent` and `Runner`
- ✅ Simple executor based on a2a-python samples — `ADKAgentExecutor` in Task 2
- ✅ `a2a-sdk>=1.0.3` (not `google-adk[a2a]`) — Task 1
- ✅ `ResourceAttributes` deprecation fixed — Tasks 3–5
- ✅ Frontend env vars updated — Task 6
- ✅ Tests for executor (Task 2) and route smoke tests (Tasks 3–5)

**Placeholder scan:** No TBDs. All code blocks are complete. Import paths verified against installed ADK 1.34.1 source.

**Type consistency:**

- `ADKAgentExecutor` defined in Task 2, imported in Tasks 3–5 via `from utils import ADKAgentExecutor` ✓
- `_shared_session_svc: InMemorySessionService` used consistently in both `ADKAgent(session_service=...)` and `Runner(session_service=...)` ✓
- Agent card name in test assertions matches `_a2a_agent_card()` return value ✓ (`"Travel Planning Agent"`, `"Grocery Planning Agent"`, `"Fitness Training Agent"`)
