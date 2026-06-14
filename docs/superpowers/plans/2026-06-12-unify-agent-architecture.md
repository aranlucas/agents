# Unify Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent package follows one identical two-file layout (`agent.py` = domain, `main.py` = ~25-line wiring) on top of shared helpers, with zero copy-pasted infrastructure and an executable conformance test that keeps it that way.

**Architecture:** Extend `agents_shared` with four small helper groups — `build_adk_agent()` (the ADKAgent + in-memory-services bundle), a `state.py` module (state initializer, JSON-state instruction provider, token-auth request extractors), a promoted `TempStateSessionService`, and `streaming_state_mapping()`. Then migrate each of the seven agents to the standard layout, delete dead code (`AGENT_PUBLIC_URL`), align dependency pins, and add a structure-conformance test plus updated AGENTS.md recipe.

**Tech Stack:** Python 3.12, google-adk 2.2.0, ag-ui-adk, FastAPI, pydantic, pytest, Ruff (via `pnpm lint:py`), uv workspace.

---

## Environment setup (read first)

The repo venv lives in the main checkout but you are editing the worktree. Run all Python commands like this so they exercise **worktree** code:

```bash
cd /Users/lucas/Projects/agents/.claude/worktrees/focused-ritchie-b20999
export PY=/Users/lucas/Projects/agents/.venv/bin/python
export PYTHONPATH=$(ls -d agents/*/src | tr '\n' ':')
```

Sanity-check before starting: `$PY -c "import wellness_agent.main as m; print(m.__file__)"` must print a path inside `.claude/worktrees/focused-ritchie-b20999`.

Test command used throughout: `$PY -m pytest agents/shared/tests agents/gateway/tests -q`
Lint command: `$PY -m ruff check agents` (same rule set as `pnpm lint:py`).

## Target layout (the contract every agent ends with)

```
agents/<name>/src/<name>_agent/
  __init__.py
  agent.py      # state model, domain tools, instructions, callbacks, build_agent()
  toolsets.py   # (only if the agent has MCP/web toolset builders; renamed from utils.py)
  db.py         # (oralboards only: sqlite plumbing)
  main.py       # wiring ONLY: build_adk_agent + create_agent_app + predict-state; exports `app`
```

`main.py` must NOT contain: `ADKAgent(`, `InMemory*Service`, `logging.basicConfig`, `AGENT_PUBLIC_URL`, state models, tools, or instructions. Task 11 enforces this with a test.

---

### Task 1: `build_adk_agent()` and `streaming_state_mapping()` in app_factory

Every agent currently hand-builds `ADKAgent` + 4 in-memory services + `session_timeout_seconds=3600` (~15 lines × 7) and a `PredictStateMapping` with the same two flags. Centralize both.

**Files:**

- Modify: `agents/shared/src/agents_shared/app_factory.py`
- Create: `agents/shared/tests/test_app_factory.py`

- [ ] **Step 1: Write the failing tests**

Create `agents/shared/tests/test_app_factory.py`:

```python
"""Tests for the shared ADKAgent/app wiring helpers."""

from agents_shared.app_factory import build_adk_agent, streaming_state_mapping
from agents_shared.tools import build_model
from google.adk.agents import LlmAgent


def _dummy_agent() -> LlmAgent:
    return LlmAgent(name="dummy_agent", model=build_model(), instruction="hi")


def test_build_adk_agent_wires_default_services():
    adk = build_adk_agent(_dummy_agent())
    assert adk.session_timeout_seconds == 3600
    assert adk._artifact_service is not None
    assert adk._memory_service is not None
    assert adk._credential_service is not None
    assert adk._session_service is not None


def test_build_adk_agent_accepts_session_service_override():
    from agents_shared.session_service import create_session_service

    svc = create_session_service()
    adk = build_adk_agent(_dummy_agent(), session_service=svc)
    assert adk._session_service is svc


def test_build_adk_agent_forwards_predict_state():
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    adk = build_adk_agent(_dummy_agent(), predict_state=[mapping])
    assert adk._predict_state == [mapping]


def test_streaming_state_mapping_sets_streaming_flags():
    mapping = streaming_state_mapping(
        state_key="plan", tool="set_plan", tool_argument="plan"
    )
    assert mapping.state_key == "plan"
    assert mapping.tool == "set_plan"
    assert mapping.tool_argument == "plan"
    assert mapping.emit_confirm_tool is False
    assert mapping.stream_tool_call is True
```

NOTE: the `adk._session_service` / `adk._predict_state` attribute names are a guess — before finalizing the test, check the real attribute names with `$PY -c "from ag_ui_adk import ADKAgent; import inspect; print(inspect.signature(ADKAgent.__init__))"` and `$PY -c "import ag_ui_adk, inspect; print(inspect.getsource(ag_ui_adk.ADKAgent.__init__))"`, and adjust the assertions to whatever ADKAgent actually stores. Asserting on the constructor's stored attributes is the point; the exact names follow the library.

- [ ] **Step 2: Run tests to verify they fail**

Run: `$PY -m pytest agents/shared/tests/test_app_factory.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_adk_agent'`

- [ ] **Step 3: Implement the helpers**

Add to `agents/shared/src/agents_shared/app_factory.py` (after the imports, extend the import block too):

```python
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from google.adk.agents import LlmAgent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import BaseSessionService

from .session_service import SessionServiceContainer, create_session_service
```

```python
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

    Pass `session_service` to substitute a wrapper (e.g. wellness'
    TempStateSessionService); everything else is identical across agents.
    """
    return ADKAgent(
        adk_agent=agent,
        session_service=session_service or create_session_service(),
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        credential_service=InMemoryCredentialService(),
        session_timeout_seconds=3600,
        predict_state=predict_state,
    )
```

If `ADKAgent.__init__` rejects `predict_state=None`, use `**({"predict_state": predict_state} if predict_state is not None else {})` instead — check the signature from Step 1's inspect output. Verify `BaseSessionService` import path with `$PY -c "from google.adk.sessions import BaseSessionService"`; if it fails, use the path ag_ui_adk itself imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `$PY -m pytest agents/shared/tests/test_app_factory.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add agents/shared/src/agents_shared/app_factory.py agents/shared/tests/test_app_factory.py
git commit -m "feat(shared): add build_adk_agent and streaming_state_mapping helpers"
```

---

### Task 2: Promote `TempStateSessionService` into agents_shared

Wellness defines `_TempStateSessionService` privately ([wellness main.py:112-127]) but it is generic infrastructure: it forwards `temp:` keys from injected request state into invocation temp state. Move it next to the other session plumbing.

**Files:**

- Modify: `agents/shared/src/agents_shared/session_service.py`
- Test: `agents/shared/tests/test_session_service_temp_state.py` (create)

- [ ] **Step 1: Write the failing test**

Create `agents/shared/tests/test_session_service_temp_state.py`:

```python
"""TempStateSessionService forwards temp: keys into invocation temp state."""

from agents_shared.invocation_state import get_invocation_temp
from agents_shared.session_service import TempStateSessionService


class _FakeInner:
    """Stand-in for the wrapped session service's _inject hook."""

    def _inject(self, session, key):
        return session


class _FakeSession:
    def __init__(self, state):
        self.state = state


def test_inject_forwards_temp_keys():
    svc = TempStateSessionService.__new__(TempStateSessionService)
    session = _FakeSession({"temp:kroger_token": "tok-123", "user_id": "u1"})

    # Call the temp-forwarding logic directly against a fake parent result.
    result = TempStateSessionService._inject(svc, session, "temp:kroger_token")

    assert result is session
    assert get_invocation_temp("temp:kroger_token", {}) == "tok-123"
```

NOTE: this test bypasses `__init__` because `RequestStateSessionService` wraps a real service. Before finalizing, read `$PY -c "import ag_ui_adk.request_state_service as m, inspect; print(inspect.getsource(m.RequestStateSessionService._inject))"` — if the parent `_inject` needs real construction, instead construct `TempStateSessionService(create_session_service())` and test through the public path the wellness agent already exercises. Match the existing wellness behavior exactly; do not change semantics while moving.

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest agents/shared/tests/test_session_service_temp_state.py -v`
Expected: FAIL with `ImportError: cannot import name 'TempStateSessionService'`

- [ ] **Step 3: Move the class**

Add to `agents/shared/src/agents_shared/session_service.py` (copy the body verbatim from `agents/wellness/src/wellness_agent/main.py:112-127`, renamed public):

```python
from ag_ui_adk.request_state_service import RequestStateSessionService

from .invocation_state import set_invocation_temp_state


class TempStateSessionService(RequestStateSessionService):
    """Sets invocation temp state when temp: keys are injected into a session."""

    def _inject(self, session, key):
        session = super()._inject(session, key)
        if session is not None:
            state = session.state
            state_dict = state.to_dict() if hasattr(state, "to_dict") else state
            temp = {
                k: v
                for k, v in state_dict.items()
                if isinstance(k, str) and k.startswith("temp:")
            }
            if temp:
                set_invocation_temp_state(temp)
        return session
```

Do NOT delete the wellness copy yet — that happens in Task 6 so each task stays independently green.

- [ ] **Step 4: Run tests to verify they pass**

Run: `$PY -m pytest agents/shared/tests/test_session_service_temp_state.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/shared/src/agents_shared/session_service.py agents/shared/tests/test_session_service_temp_state.py
git commit -m "feat(shared): promote TempStateSessionService from wellness"
```

---

### Task 3: `agents_shared/state.py` — state initializer, instruction provider, token-auth extractors

Three patterns are duplicated near-verbatim across agents:

1. `on_before_agent` backfilling `_DEFAULT_STATE` (7 copies), sometimes flipping a `*_connected` flag from a temp token (fitness, grocery).
2. `build_dynamic_instruction` dumping state JSON with an optional auth notice (grocery, wellness, a2ui, oralboards).
3. `extract_*_state` reading token headers into temp state (grocery, fitness, wellness) or identity-only passthroughs (travel, a2ui, oralboards, resume).

**Files:**

- Create: `agents/shared/src/agents_shared/state.py`
- Create: `agents/shared/tests/test_state_helpers.py`

- [ ] **Step 1: Write the failing tests**

Create `agents/shared/tests/test_state_helpers.py`:

```python
"""Tests for the shared state-initializer / instruction / extractor factories."""

import asyncio
from types import SimpleNamespace

from agents_shared.state import (
    KROGER_AUTH,
    STRAVA_AUTH,
    TokenAuth,
    make_extract_state,
    make_state_initializer,
    make_state_instruction_provider,
)
from pydantic import BaseModel


class DemoState(BaseModel):
    status: str = "idle"
    plan: str = ""
    kroger_connected: bool = False


def test_initializer_backfills_missing_keys_only():
    init = make_state_initializer(DemoState)
    ctx = SimpleNamespace(state={"status": "ready"})
    init(ctx)
    assert ctx.state["status"] == "ready"  # existing value untouched
    assert ctx.state["plan"] == ""
    assert ctx.state["kroger_connected"] is False


def test_initializer_flips_connected_flag_from_temp_token():
    init = make_state_initializer(
        DemoState, token_flags={"temp:kroger_token": "kroger_connected"}
    )
    ctx = SimpleNamespace(state={"temp:kroger_token": "tok"})
    init(ctx)
    assert ctx.state["kroger_connected"] is True


def test_instruction_provider_dumps_state_and_notice():
    provider = make_state_instruction_provider(
        "demo",
        DemoState,
        notice=lambda s: "" if s["kroger_connected"] else "\n\nNOT CONNECTED",
    )
    ctx = SimpleNamespace(state={"status": "ready", "plan": "p"})
    text = asyncio.run(provider(ctx))
    assert text.startswith("Current demo state:\n")
    assert '"status": "ready"' in text
    assert text.endswith("NOT CONNECTED")


def test_extract_state_identity_only():
    extract = make_extract_state()
    request = SimpleNamespace(headers={"x-clerk-user-id": "user_1"})
    state = asyncio.run(extract(request, None))
    assert state == {"user_id": "user_1"}


def test_extract_state_with_token_auth():
    extract = make_extract_state(KROGER_AUTH, STRAVA_AUTH)
    request = SimpleNamespace(
        headers={"x-clerk-user-id": "user_1", "x-kroger-access-token": "ktok"}
    )
    state = asyncio.run(extract(request, None))
    assert state["user_id"] == "user_1"
    assert state["kroger_connected"] is True
    assert state["temp:kroger_token"] == "ktok"
    assert state["strava_connected"] is False
    assert "temp:strava_token" not in state


def test_token_auth_constants():
    assert KROGER_AUTH == TokenAuth(
        "x-kroger-access-token", "temp:kroger_token", "kroger_connected"
    )
    assert STRAVA_AUTH == TokenAuth(
        "x-strava-access-token", "temp:strava_token", "strava_connected"
    )
```

NOTE: `make_state_initializer`'s temp-token lookup uses `get_invocation_temp(state_key, state)` exactly like fitness/grocery do today — confirm what `get_invocation_temp` does with a plain dict by reading `agents/shared/src/agents_shared/invocation_state.py` (28 lines) and adapt the second test's fake state if it reads contextvars rather than the passed mapping.

- [ ] **Step 2: Run tests to verify they fail**

Run: `$PY -m pytest agents/shared/tests/test_state_helpers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents_shared.state'`

- [ ] **Step 3: Implement `agents_shared/state.py`**

```python
"""Factories for the shared per-agent state patterns.

Every agent declares a pydantic state model; these helpers derive the
backfill callback, the per-turn JSON state instruction, and the request
state extractor from it so agents don't copy the loops around.
"""

import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, NamedTuple

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from pydantic import BaseModel

from .invocation_state import get_invocation_temp
from .tools import extract_identity_state


class TokenAuth(NamedTuple):
    """Header → temp-state-key → connected-flag mapping for an OAuth token."""

    header: str
    state_key: str
    connected_flag: str


KROGER_AUTH = TokenAuth("x-kroger-access-token", "temp:kroger_token", "kroger_connected")
STRAVA_AUTH = TokenAuth("x-strava-access-token", "temp:strava_token", "strava_connected")


def make_state_initializer(
    state_model: type[BaseModel],
    token_flags: dict[str, str] | None = None,
) -> Callable[[CallbackContext], None]:
    """before_agent_callback that backfills model defaults into session state.

    `token_flags` maps a temp-state token key to the connected flag it implies
    (e.g. {"temp:kroger_token": "kroger_connected"}).
    """
    defaults = state_model().model_dump()
    flags = token_flags or {}

    def on_before_agent(callback_context: CallbackContext) -> None:
        for state_key, flag in flags.items():
            if get_invocation_temp(state_key, callback_context.state):
                callback_context.state[flag] = True
        for key, default in defaults.items():
            if key not in callback_context.state:
                callback_context.state[key] = default

    return on_before_agent


def make_state_instruction_provider(
    label: str,
    state_model: type[BaseModel],
    notice: Callable[[dict[str, Any]], str] | None = None,
) -> Callable[[ReadonlyContext], Awaitable[str]]:
    """Async instruction provider rendering the state snapshot (+optional notice)."""
    defaults = state_model().model_dump()

    async def provider(context: ReadonlyContext) -> str:
        state = {key: context.state.get(key, default) for key, default in defaults.items()}
        try:
            state_json = json.dumps(state, indent=2, default=str)
        except (TypeError, ValueError):
            state_json = "{}"
        extra = notice(state) if notice else ""
        return f"Current {label} state:\n{state_json}{extra}"

    return provider


def make_extract_state(
    *token_auths: TokenAuth,
) -> Callable[[Any, Any], Awaitable[dict[str, Any]]]:
    """extract_state_from_request handler: Clerk identity + optional token auth."""

    async def extract(request: Any, _input_data: Any) -> dict[str, Any]:
        state: dict[str, Any] = extract_identity_state(request)
        for auth in token_auths:
            token = request.headers.get(auth.header) or ""
            if token_auths:
                state[auth.connected_flag] = bool(token)
            if token:
                state[auth.state_key] = token
        return state

    return extract
```

(Drop the redundant inner `if token_auths:` — set the flag unconditionally inside the loop; it only runs when auths were passed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `$PY -m pytest agents/shared/tests/test_state_helpers.py -v`
Expected: 6 PASS

- [ ] **Step 5: Run full suite + lint**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`
Expected: all pass, no lint errors

- [ ] **Step 6: Commit**

```bash
git add agents/shared/src/agents_shared/state.py agents/shared/tests/test_state_helpers.py
git commit -m "feat(shared): state initializer, instruction provider, token-auth extractor factories"
```

---

### Task 4: Migrate grocery to the standard layout (template migration)

**Files:**

- Create: `agents/grocery/src/grocery_agent/agent.py`
- Rename: `agents/grocery/src/grocery_agent/utils.py` → `toolsets.py`
- Rewrite: `agents/grocery/src/grocery_agent/main.py`

- [ ] **Step 1: Rename utils.py**

```bash
git mv agents/grocery/src/grocery_agent/utils.py agents/grocery/src/grocery_agent/toolsets.py
```

- [ ] **Step 2: Create `agent.py`**

Move these symbols verbatim from the current `main.py` into `agent.py` (with imports they need): `KROGER_TOKEN_HEADER`, `KROGER_TOKEN_STATE_KEY` (delete both afterward — superseded by `KROGER_AUTH`), `GroceryState`, `set_shopping_list`, `update_cart`, `update_pantry`, `set_meal_plan`, `set_weekly_deals`, `mark_list_ready`, `_INSTRUCTION`, `build_agent`. Delete `_DEFAULT_STATE`, `on_before_agent`, `build_dynamic_instruction`, `extract_kroger_auth_state`, and the `AGENT_PUBLIC_URL`/`_railway_domain` block entirely — all replaced by shared factories. Inside `agent.py`, replace the deleted callbacks in `build_agent` with:

```python
from agents_shared.state import KROGER_AUTH, make_state_initializer, make_state_instruction_provider


def _kroger_notice(state: dict) -> str:
    if state.get("kroger_connected"):
        return ""
    return (
        "\n\nKROGER NOT CONNECTED: Do not call any MCP tools. "
        "Tell the user their Kroger account isn't connected and they need to "
        "click 'Connect Kroger' in the UI to continue. Do not plan meals or "
        "generate shopping lists."
    )


def build_agent(*, mode: str | None = None, include_contents: str = "default") -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="grocery_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        mode=mode,
        include_contents=include_contents,
        state_schema=GroceryState,
        static_instruction=_INSTRUCTION,
        instruction=make_state_instruction_provider("grocery", GroceryState, notice=_kroger_notice),
        before_agent_callback=make_state_initializer(
            GroceryState, token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag}
        ),
        after_tool_callback=shared_after_tool_callback,
        tools=[
            set_shopping_list,
            update_cart,
            update_pantry,
            set_meal_plan,
            set_weekly_deals,
            mark_list_ready,
            get_current_date,
            AGUIToolset(),
            meal_planner_toolset(),
        ],
    )
```

`agent.py` keeps the module docstring `"""Grocery agent domain: state, tools, instructions."""`, imports `meal_planner_toolset` from `.toolsets`, and `AGUIToolset` from `ag_ui_adk`.

- [ ] **Step 3: Rewrite `main.py` as wiring only**

Full new content of `agents/grocery/src/grocery_agent/main.py`:

```python
"""Grocery Planning Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import KROGER_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("grocery_agent")

GROCERY_PREDICT_STATE = [
    streaming_state_mapping(state_key="meal_plan", tool="set_meal_plan", tool_argument="plan"),
]

grocery_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Grocery Planning Agent",
    adk_agent=build_adk_agent(grocery_agent, predict_state=GROCERY_PREDICT_STATE),
    extract_state_from_request=make_extract_state(KROGER_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("grocery-agent"),
)
```

- [ ] **Step 4: Fix cross-package imports**

Wellness imports `from grocery_agent.main import build_agent as build_grocery_agent` — change it to `from grocery_agent.agent import build_agent as build_grocery_agent` in `agents/wellness/src/wellness_agent/main.py`. Also grep for any other importer: `grep -rn "grocery_agent" agents --include="*.py" | grep -v grocery/src`.

- [ ] **Step 5: Run tests + lint**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`
Expected: all pass. If `test_agent_imports.py` asserts symbols on `grocery_agent.main` that moved (e.g. `build_agent`), update the test to import from `grocery_agent.agent` — that's the new contract.

- [ ] **Step 6: Commit**

```bash
git add -A agents/grocery agents/wellness agents/shared
git commit -m "refactor(grocery): standard agent.py/main.py layout on shared helpers"
```

---

### Task 5: Migrate fitness

Same shape as Task 4 with two domain-specific keepers: the Brave-throttle callback and a custom (non-JSON-dump) dynamic instruction.

**Files:**

- Create: `agents/fitness/src/fitness_agent/agent.py`
- Rename: `agents/fitness/src/fitness_agent/utils.py` → `toolsets.py`
- Rewrite: `agents/fitness/src/fitness_agent/main.py`

- [ ] **Step 1: Rename utils.py**

```bash
git mv agents/fitness/src/fitness_agent/utils.py agents/fitness/src/fitness_agent/toolsets.py
```

- [ ] **Step 2: Create `agent.py`**

Move verbatim from current `main.py`: `STRAVA_ACTIVITIES_URL`, `FitnessState`, `normalize_strava_activity`, `summarize_activities`, `fetch_activities`, `set_objective_research`, `set_training_plan`, `mark_plan_ready`, the `_WEB_SEARCH_MIN_INTERVAL_S`/`_web_search_lock`/`_last_web_search_at`/`throttle_web_search` block (with its rate-limit comment), `build_dynamic_instruction` (KEEP — its custom bullet format and `get_invocation_temp` connected-check are domain logic, not the generic JSON dump), `_INSTRUCTION`, and `build_agent`. Delete `STRAVA_TOKEN_HEADER`, `STRAVA_TOKEN_STATE_KEY` (use `STRAVA_AUTH.header` / `STRAVA_AUTH.state_key` from `agents_shared.state` everywhere they appeared, including inside `fetch_activities` and `build_dynamic_instruction`), `on_before_agent`, `extract_strava_auth_state`, `_DEFAULT_STATE`, and the `AGENT_PUBLIC_URL` block.

In `build_agent`, replace `before_agent_callback=on_before_agent` with:

```python
        before_agent_callback=make_state_initializer(
            FitnessState, token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag}
        ),
```

Everything else in `build_agent` (including `before_tool_callback=throttle_web_search` and `instruction=build_dynamic_instruction`) stays as-is. `log = logging.getLogger("fitness_agent")` at top of `agent.py` (plain `logging.getLogger`, not `setup_agent_logging` — root config belongs to main.py).

- [ ] **Step 3: Rewrite `main.py`**

Full new content of `agents/fitness/src/fitness_agent/main.py`:

```python
"""Fitness Training Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("fitness_agent")

FITNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="training_plan", tool="set_training_plan", tool_argument="plan"
    ),
]

fitness_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Fitness Training Agent",
    adk_agent=build_adk_agent(fitness_agent, predict_state=FITNESS_PREDICT_STATE),
    extract_state_from_request=make_extract_state(STRAVA_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("fitness-agent"),
)
```

- [ ] **Step 4: Fix wellness import**

In `agents/wellness/src/wellness_agent/main.py`: `from fitness_agent.agent import build_agent as build_fitness_agent`.

- [ ] **Step 5: Run tests + lint**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`
Expected: pass (update `test_agent_imports.py` references from `fitness_agent.main` to `fitness_agent.agent` where they target moved symbols)

- [ ] **Step 6: Commit**

```bash
git add -A agents/fitness agents/wellness agents/shared
git commit -m "refactor(fitness): standard agent.py/main.py layout on shared helpers"
```

---

### Task 6: Migrate wellness

**Files:**

- Create: `agents/wellness/src/wellness_agent/agent.py`
- Rewrite: `agents/wellness/src/wellness_agent/main.py`

- [ ] **Step 1: Create `agent.py`**

Move verbatim: `WellnessState`, `set_weekly_wellness_plan`, `mark_plan_ready`, `_INSTRUCTION`, and the `wellness_agent = LlmAgent(...)` construction wrapped into a `build_agent()` function for symmetry with the other agents:

```python
def build_agent() -> LlmAgent:
    return LlmAgent(
        name="wellness_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=WellnessState,
        static_instruction=_INSTRUCTION,
        instruction=make_state_instruction_provider("wellness", WellnessState),
        sub_agents=[build_fitness_agent(mode="task"), build_grocery_agent(mode="task")],
        before_agent_callback=make_state_initializer(WellnessState),
        after_tool_callback=shared_after_tool_callback,
        tools=[
            get_current_date,
            set_weekly_wellness_plan,
            mark_plan_ready,
            AGUIToolset(),
        ],
    )
```

with `from fitness_agent.agent import build_agent as build_fitness_agent` and `from grocery_agent.agent import build_agent as build_grocery_agent`. Delete from the old main.py: the private `_TempStateSessionService` (now shared), `extract_identity_state`/`extract_wellness_state` (replaced by `make_extract_state(KROGER_AUTH, STRAVA_AUTH)`), `on_before_agent`, `build_dynamic_instruction`, `_DEFAULT_STATE`, all five header/state-key constants, and the `AGENT_PUBLIC_URL` block.

- [ ] **Step 2: Rewrite `main.py`**

Full new content:

```python
"""Wellness Planning Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import (
    SessionServiceContainer,
    TempStateSessionService,
    create_session_service,
)
from agents_shared.state import KROGER_AUTH, STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("wellness_agent")

WELLNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="weekly_plan", tool="set_weekly_wellness_plan", tool_argument="plan"
    ),
]

wellness_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Wellness Planning Agent",
    adk_agent=build_adk_agent(
        wellness_agent,
        predict_state=WELLNESS_PREDICT_STATE,
        session_service=TempStateSessionService(create_session_service()),
    ),
    extract_state_from_request=make_extract_state(KROGER_AUTH, STRAVA_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("wellness-agent"),
)
```

- [ ] **Step 3: Run tests + lint**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`
Expected: pass — pay attention to `test_wellness_uses_task_mode_sub_agents` (in shared or gateway tests); update its import path if it reads `wellness_agent.main` internals that moved to `agent.py`.

- [ ] **Step 4: Commit**

```bash
git add -A agents/wellness agents/shared agents/gateway
git commit -m "refactor(wellness): standard layout; shared TempStateSessionService and extractors"
```

---

### Task 7: Migrate travel

**Files:**

- Create: `agents/travel/src/travel_agent/agent.py`
- Rename: `agents/travel/src/travel_agent/utils.py` → `toolsets.py`
- Rewrite: `agents/travel/src/travel_agent/main.py`

- [ ] **Step 1: Rename and split**

```bash
git mv agents/travel/src/travel_agent/utils.py agents/travel/src/travel_agent/toolsets.py
```

Move to `agent.py`: `TravelState`, all state tools (`set_trip_meta`, `write_itinerary`, and the rest defined between the callbacks and the LlmAgent — enumerate them by reading current main.py:100-260), the TRAVELER_BRIEF/instruction text and any `instructions_utils` usage, and the `LlmAgent` construction wrapped as `build_agent()`. Replace `on_before_agent` with `make_state_initializer(TravelState)`. Delete `extract_travel_identity_state` (use `make_extract_state()`).

- [ ] **Step 2: Rewrite `main.py`**

```python
"""Collab Studio · Trip Planning agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("travel_agent")

COLLAB_PREDICT_STATE = [
    streaming_state_mapping(state_key="itinerary", tool="write_itinerary", tool_argument="body"),
    streaming_state_mapping(state_key="flights", tool="write_itinerary", tool_argument="flights"),
]

collab_trip_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Collab Studio · Trip Planning",
    adk_agent=build_adk_agent(collab_trip_agent, predict_state=COLLAB_PREDICT_STATE),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("travel-agent"),
)
```

(Note: tracer name was `"agents-agent"` before — clearly a copy-paste bug; use `"travel-agent"`.)

- [ ] **Step 3: Run tests + lint, then commit**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`
Expected: pass

```bash
git add -A agents/travel
git commit -m "refactor(travel): standard agent.py/main.py layout on shared helpers"
```

---

### Task 8: Migrate a2ui

**Files:**

- Create: `agents/a2ui/src/a2ui_agent/agent.py`
- Rewrite: `agents/a2ui/src/a2ui_agent/main.py`

- [ ] **Step 1: Create `agent.py`**

Move: `A2UIState`, `remember_surface`, `_STATIC_INSTRUCTION`, and the `LlmAgent` construction wrapped as `build_agent()` with `instruction=make_state_instruction_provider("A2UI showcase", A2UIState)` and `before_agent_callback=make_state_initializer(A2UIState)`. Delete `extract_demo_state`, `on_before_agent`, `build_dynamic_instruction`, `_DEFAULT_STATE`.

- [ ] **Step 2: Rewrite `main.py`**

```python
"""A2UI Showcase Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("a2ui_agent")

a2ui_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="A2UI Showcase Agent",
    adk_agent=build_adk_agent(a2ui_agent),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("a2ui-agent"),
)
```

- [ ] **Step 3: Run tests + lint, then commit**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`

```bash
git add -A agents/a2ui
git commit -m "refactor(a2ui): standard agent.py/main.py layout on shared helpers"
```

---

### Task 9: Migrate oralboards (adds `db.py`)

**Files:**

- Create: `agents/oralboards/src/oralboards_agent/db.py`
- Create: `agents/oralboards/src/oralboards_agent/agent.py`
- Rewrite: `agents/oralboards/src/oralboards_agent/main.py`

- [ ] **Step 1: Create `db.py`**

Move verbatim: `VALID_COLLECTIONS`, `_default_db_path`, `DB_PATH`, `_validate_db`, `_connect`, `DB_STARTUP_ERROR` (rename privates to public `connect`, `validate_db` since they now cross module boundaries; keep behavior identical, including the read-only `?mode=ro` URI). Module logger: `log = logging.getLogger("oralboards_agent.db")`.

- [ ] **Step 2: Create `agent.py`**

Move: `OralBoardsState`, `_clean_query`, every search/case tool defined in current main.py between lines ~110-300 (enumerate by reading the file), `build_dynamic_instruction` ONLY if its DB-availability notice can't be expressed as a `notice=` lambda — it depends on `DB_STARTUP_ERROR`, so keep it but reimplement via the shared provider:

```python
def _db_notice(_state: dict) -> str:
    if not DB_STARTUP_ERROR:
        return ""
    return (
        "\n\nSEARCH DB UNAVAILABLE: the reference database failed to load. "
        "Tell the user case search is degraded and avoid citing sources."
    )
```

(Match the EXACT current notice text from main.py — read it before writing; the text above is a placeholder shape, the real text must be copied from the existing `build_dynamic_instruction` body.) Then `instruction=make_state_instruction_provider("oral boards", OralBoardsState, notice=_db_notice)` and `before_agent_callback=make_state_initializer(OralBoardsState)`. Wrap the `LlmAgent` as `build_agent()`. Delete the `AGENT_PUBLIC_URL` block.

- [ ] **Step 3: Rewrite `main.py`**

```python
"""Oral Boards Examiner Agent — wiring (see agent.py / db.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent
from .db import DB_STARTUP_ERROR

load_dotenv()

log = setup_agent_logging("oralboards_agent")


oralboards_agent = build_agent()
_session_container = SessionServiceContainer()


async def _health() -> dict:
    session_health = await _session_container.check_database_connection()
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return session_health


app = create_agent_app(
    title="Oral Boards Examiner Agent",
    adk_agent=build_adk_agent(oralboards_agent, predict_state=ORALBOARDS_PREDICT_STATE),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("oralboards-agent"),
    health_handler=_health,
)
```

- [ ] **Step 4: Run tests + lint, then commit**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`

```bash
git add -A agents/oralboards
git commit -m "refactor(oralboards): standard layout with db.py split"
```

---

### Task 10: Migrate resume

**Files:**

- Create: `agents/resume/src/resume_agent/agent.py`
- Rewrite: `agents/resume/src/resume_agent/main.py`

- [ ] **Step 1: Create `agent.py`**

Move: `_RESUME` (the `resume.md` read), `_INSTRUCTION`, `ResumeState`, `build_agent()` with `before_agent_callback=make_state_initializer(ResumeState)`. Delete `extract_visitor_state`, `on_before_agent`, `_DEFAULT_STATE`.

- [ ] **Step 2: Rewrite `main.py`**

```python
"""Resume Q&A Agent — public, unauthenticated demo. Wiring only."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("resume_agent")

resume_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Resume Q&A Agent",
    adk_agent=build_adk_agent(resume_agent),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("resume-agent"),
)
```

(Note: resume previously skipped the artifact/memory/credential services — `build_adk_agent` now supplies them uniformly; harmless and consistent.)

- [ ] **Step 3: Run tests + lint, then commit**

Run: `$PY -m pytest agents/shared/tests agents/gateway/tests -q && $PY -m ruff check agents`

```bash
git add -A agents/resume
git commit -m "refactor(resume): standard agent.py/main.py layout"
```

---

### Task 11: Structure-conformance test

Make the layout self-enforcing so the next agent (or next refactor) can't drift.

**Files:**

- Create: `agents/shared/tests/test_structure.py`

- [ ] **Step 1: Write the test (it should pass immediately — it's a ratchet, not TDD)**

```python
"""Every agent package must follow the standard agent.py/main.py layout."""

import importlib
import inspect
from pathlib import Path

import pytest

AGENT_PACKAGES = [
    "a2ui_agent",
    "fitness_agent",
    "grocery_agent",
    "oralboards_agent",
    "resume_agent",
    "travel_agent",
    "wellness_agent",
]

FORBIDDEN_IN_MAIN = [
    "ADKAgent(",            # use build_adk_agent
    "InMemoryArtifactService",
    "InMemoryMemoryService",
    "InMemoryCredentialService",
    "logging.basicConfig",   # use setup_agent_logging
    "AGENT_PUBLIC_URL",      # dead config, removed
    "PredictStateMapping(",  # use streaming_state_mapping
    "class ",                # domain types live in agent.py
    "def on_before_agent",   # use make_state_initializer
]


@pytest.mark.parametrize("package", AGENT_PACKAGES)
def test_main_is_wiring_only(package):
    main = importlib.import_module(f"{package}.main")
    source = inspect.getsource(main)
    assert hasattr(main, "app"), f"{package}.main must export `app`"
    for fragment in FORBIDDEN_IN_MAIN:
        assert fragment not in source, (
            f"{package}/main.py contains '{fragment}' — that belongs in "
            "agent.py or agents_shared"
        )


@pytest.mark.parametrize("package", AGENT_PACKAGES)
def test_agent_module_exports_build_agent(package):
    agent_mod = importlib.import_module(f"{package}.agent")
    assert callable(agent_mod.build_agent)


@pytest.mark.parametrize("package", AGENT_PACKAGES)
def test_no_utils_module(package):
    mod = importlib.import_module(package)
    pkg_dir = Path(mod.__file__).parent
    assert not (pkg_dir / "utils.py").exists(), (
        f"{package} has utils.py — toolset builders belong in toolsets.py"
    )
```

- [ ] **Step 2: Run it**

Run: `$PY -m pytest agents/shared/tests/test_structure.py -v`
Expected: all PASS. Any failure means an earlier task missed something — fix the agent, not the test.

- [ ] **Step 3: Commit**

```bash
git add agents/shared/tests/test_structure.py
git commit -m "test: enforce standard agent package layout"
```

---

### Task 12: Align dependency pins

Python dependencies now live in the root `pyproject.toml`; per-agent
`pyproject.toml` files have been removed.

**Files:**

- Modify: `pyproject.toml`

- [ ] **Step 1: Keep `ag-ui-adk` pinned once**

Ensure the root dependency list contains one `"ag-ui-adk>=0.6.5"` entry.

- [ ] **Step 2: Re-lock and verify**

Run: `cd /Users/lucas/Projects/agents/.claude/worktrees/focused-ritchie-b20999 && uv lock`
Expected: lockfile updates (or no-op if 0.6.5 already resolved). Then re-run the full test suite.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: align ag-ui-adk pin to >=0.6.5 across agents"
```

---

### Task 13: Update AGENTS.md recipe

**Files:**

- Modify: `AGENTS.md` (the "Adding a new agent" section, step 3)

- [ ] **Step 1: Rewrite step 3 of the recipe**

Replace the current step-3 bullet list with:

```markdown
3. Implement the agent in two files (see `agents/grocery/` as the template):
   - `src/<name>_agent/agent.py` — pydantic state model, domain tools, static
     instruction, and `build_agent()` (use `make_state_initializer`,
     `make_state_instruction_provider`, `build_model`, `DEFAULT_RETRY_CONFIG`,
     `on_model_error_callback`, `shared_after_tool_callback` from `agents_shared`)
   - `src/<name>_agent/main.py` — wiring only: `build_adk_agent(...)` +
     `create_agent_app(...)` + `streaming_state_mapping(...)`; exports `app`
   - MCP/web toolset builders go in `src/<name>_agent/toolsets.py`
   - `GET /health` comes from `create_agent_app`; no standalone `uvicorn.run(...)`
   - `agents/shared/tests/test_structure.py` enforces this layout — add the new
     package to its `AGENT_PACKAGES` list
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update new-agent recipe for the unified layout"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full suite, lint, smoke**

```bash
$PY -m pytest agents/shared/tests agents/gateway/tests -q
$PY -m ruff check agents
$PY -c "from gateway.main import app; print('routes:', len(app.routes))"
```

Expected: all tests pass, lint clean, `routes: 12`.

- [ ] **Step 2: Grep for leftovers**

```bash
grep -rn "AGENT_PUBLIC_URL\|RAILWAY_PUBLIC_DOMAIN" agents/*/src && echo "LEFTOVERS FOUND" || echo clean
grep -rln "utils" agents/*/src/*_agent/*.py || echo clean
```

Expected: `clean` for both (RAILWAY_PUBLIC_DOMAIN may legitimately remain in agents_shared OTEL setup only).

- [ ] **Step 3: Push and update the PR**

The branch already has open PR #67. Push the new commits to the same branch; update the PR description to mention the unification phase (or open a stacked follow-up PR if #67 has been reviewed/merged by then — check `gh pr view 67 --json state` first).

---

## Self-review notes

- **Risk: `mode`/task sub-agent rebuild in wellness.** Task 6 reconstructs the wellness LlmAgent inside `build_agent()`; sub-agent instances must be created INSIDE the function (an ADK agent can only have one parent, and module-level singletons would break if `build_agent()` is ever called twice). The code in Task 6 does this correctly — keep it that way.
- **Risk: `test_agent_imports.py` / `test_wellness_uses_task_mode_sub_agents` reference `*.main` symbols.** Several tasks note this; treat test updates as part of the contract change, not as failures to silence.
- **Risk: ADKAgent constructor details (Task 1).** The plan deliberately tells the implementer to inspect the installed ag-ui-adk before finalizing assertions.
- **Out of scope (deliberate):** per-agent LiteLLM model overrides, gateway-level CORS consolidation (CORS currently lives per-sub-app via `create_agent_app`; moving it to the gateway changes mounted-app behavior and deserves its own change), and any TypeScript-side type generation from the pydantic state models (worth a future task: `packages/types` duplicates these shapes by hand).
