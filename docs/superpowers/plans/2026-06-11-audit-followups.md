# Audit Follow-ups: Single-Service Consolidation, Auth Perimeter, CI Gates & Resume Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the five (soon six) agent services into ONE FastAPI app — one Railway service instead of five, dropping the remote-A2A machinery entirely — close the auth-perimeter holes from the 2026-06-11 audit, connect the CI gates that exist but aren't enforced, and add a public unauthenticated `resume` agent (port of github.com/aranlucas/resume-chat, simplified to a prompt-embedded resume).

**Architecture:** A new `agents/gateway/` workspace member mounts every agent's existing FastAPI app under a path prefix (`/travel`, `/grocery`, …, `/resume`) and serves them from one uvicorn process on one port. Wellness orchestrates grocery and fitness **in-process** via `AgentTool` (fresh `LlmAgent` instances from `build_agent()` factories) instead of `RemoteA2aAgent`; OAuth tokens reach sub-agents through a shared contextvar in `agent-common` (the mechanism wellness already uses internally). All A2A code, deps, and tests are deleted. The web perimeter is enforced in Clerk middleware (`proxy.ts`) plus a guard around the CopilotKit runtime handler (401 unless signed in, except the public `resume` agent). Agent-side identity becomes trustworthy via `ClerkAuthMiddleware` in `agent-common` — added **once** on the gateway — which verifies the Clerk session JWT against the instance JWKS (PyJWT) and rewrites `x-clerk-user-id` to the verified `sub`.

**Tech Stack:** Python 3.14 / FastAPI / Google ADK / `ag-ui-adk` / PyJWT; Next.js 16 / Clerk / CopilotKit v2; pnpm + uv workspaces; Vitest + pytest.

**Why this is cheaper:** Railway bills per service; this goes 5 services → 1 (the resume agent adds zero services). One container also means one set of idle memory instead of five.

**Relationship to the 2026-06-09 plan** (`docs/superpowers/plans/2026-06-09-codebase-improvements.md`): that plan owns the `create_agent_app` factory (Tasks 13–16), env-driven logging (Task 4), the LLM factory (Task 5), and the AGENTS.md refresh (Task 21). This plan does NOT duplicate those, but it changes their landscape: its Task 18 (per-agent compose SQLite) is superseded by consolidation, and its factory tasks should run **after** this plan (the factory then produces mountable sub-apps). Re-check that plan's unexecuted tasks against this one before running them.

**Open input required from Lucas:** the real resume content for `agents/resume/src/resume_agent/resume.md` (Task 11 ships a clearly-marked seed; replace before deploying).

**Decisions already made by Lucas (2026-06-11):** single service to save money; remote A2A not needed; keep the free OpenRouter model; keep all ai-elements components; resume agent is the only unauthenticated surface; agent JWT verification approved.

---

## Phase 1 — Repo hygiene quick wins

### Task 1: Remove committed runtime artifacts

**Files:**

- Delete (from git): `.data/adk_sessions.sqlite`, `output/playwright/a2ui-chat-first.png`, `output/playwright/a2ui-chat-tabs.png`, `output/playwright/a2ui-working.jpg`
- Modify: `.gitignore`

- [ ] **Step 1: Remove the tracked files but keep them on disk**

```bash
git rm --cached .data/adk_sessions.sqlite
git rm --cached -r output/
```

- [ ] **Step 2: Ignore both directories**

Append to `.gitignore` (after the `.superpowers/` line):

```gitignore
# runtime/session data and local tool output
.data/
output/
```

- [ ] **Step 3: Verify**

Run: `git status --short` — expect `D` entries for the four files plus `.gitignore` modified, no `??` for `.data/` or `output/`.
Run: `git check-ignore .data/adk_sessions.sqlite output/playwright/a2ui-working.jpg` — both echoed, exit 0.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking runtime sqlite and playwright output"
```

### Task 2: Dockerfile dependency-layer caching

Today `Dockerfile.agents` does `COPY . ./` _before_ `uv sync`, so any source change reinstalls the entire Python tree. Split into a cached third-party layer (`--no-install-workspace` skips building workspace members, so their sources aren't needed yet) and a cheap source layer.

**Files:**

- Modify: `Dockerfile.agents`

- [ ] **Step 1: Replace the copy/sync section**

Replace:

```dockerfile
COPY . ./

RUN uv sync --no-dev --all-packages
```

with:

```dockerfile
# Dependency layer: only manifests + lockfile, so third-party installs are
# cached until a manifest changes. --no-install-workspace skips building the
# workspace members themselves (their sources aren't copied yet).
COPY pyproject.toml uv.lock ./
COPY packages/agent-common/pyproject.toml packages/agent-common/
COPY agents/a2ui/pyproject.toml agents/a2ui/
COPY agents/fitness/pyproject.toml agents/fitness/
COPY agents/grocery/pyproject.toml agents/grocery/
COPY agents/travel/pyproject.toml agents/travel/
COPY agents/wellness/pyproject.toml agents/wellness/

RUN uv sync --frozen --no-dev --all-packages --no-install-workspace

COPY . ./

RUN uv sync --frozen --no-dev --all-packages
```

(Tasks 9 and 11 each add one more `COPY agents/<name>/pyproject.toml …` line here for `gateway` and `resume`.)

- [ ] **Step 2: Verify build + caching**

Run: `docker build -f Dockerfile.agents .` — success.
Then `touch agents/grocery/src/grocery_agent/main.py && docker build -f Dockerfile.agents .` — the first `uv sync` step reports `CACHED`.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.agents
git commit -m "build: cache python dependency layer in agent image"
```

### Task 3: Complete `.env.example`

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Replace the per-agent URL block and add auth vars**

Replace the `# ── Agent URLs ──` block contents with:

```bash
# ── Agent URLs ─────────────────────────────────────────────────────────────────
# All agents are served by one gateway service; per-agent endpoints live at
# <base>/<agent>/agui (e.g. http://localhost:8000/travel/agui).
AGENTS_BASE_URL=http://localhost:8000
EXPO_PUBLIC_AGENTS_BASE_URL=http://localhost:8000
```

After the `# ── Agent model providers ──` block, append:

```bash
# ── Agent endpoint auth ────────────────────────────────────────────────────────
# JWKS endpoint of the Clerk instance (Dashboard → API Keys → Show JWT public key,
# or https://<your-clerk-frontend-api>/.well-known/jwks.json). When set, the
# gateway verifies the Clerk session JWT on every /agui route except /resume,
# and rejects spoofed x-clerk-user-id headers. Leave unset for local dev.
CLERK_JWKS_URL=
# Optional issuer check (https://<your-clerk-frontend-api>).
CLERK_ISSUER=
```

(Note: this block intentionally documents the END state of this plan. The old per-agent vars keep working until Task 10 lands; execute Phases in order and this is never wrong for more than a branch.)

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: single gateway base URL and auth vars in .env.example"
```

---

## Phase 2 — CI gates that actually gate

### Task 4: Enforce the Python coverage floor in CI

`pyproject.toml` declares `fail_under = 90` but CI runs plain `uv run pytest`, so the gate never fires.

**Files:**

- Modify: `.github/workflows/ci.yml`
- Possibly modify: `pyproject.toml` (`fail_under`)

- [ ] **Step 1: Measure real coverage locally**

Run: `uv run pytest --cov`
If TOTAL ≥ 90, leave `fail_under = 90`. If below, set `fail_under` (`[tool.coverage.report]`) to the measured total rounded **down** to a whole number — an honest ratchet floor; do not add `exclude_also` entries to inflate it.

- [ ] **Step 2: Make CI run with coverage**

In `.github/workflows/ci.yml`, change:

```yaml
- name: Run Python tests
  run: uv run pytest
```

to:

```yaml
- name: Run Python tests (with coverage gate)
  run: uv run pytest --cov
```

- [ ] **Step 3: Verify locally**

Run: `uv run pytest --cov` — exit 0, `Required test coverage of N% reached`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml pyproject.toml
git commit -m "ci: enforce python coverage floor"
```

### Task 5: Build the agent Docker image in CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a parallel job** (sibling of `check:`):

```yaml
docker:
  name: Build agent image
  runs-on: ubuntu-latest
  steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Build Dockerfile.agents
      run: docker build -f Dockerfile.agents .
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build agent docker image"
```

---

## Phase 3 — Consolidate into one service, drop A2A

### Task 6: Shared invocation temp-state helper in agent-common

Wellness already solves "AgentTool's child runner strips `temp:` keys" with a module-private contextvar (`agents/wellness/src/wellness_agent/main.py:147-170`). In-process orchestration needs grocery/fitness to read that same contextvar, so the mechanism moves to `agent-common`.

**Files:**

- Create: `packages/agent-common/src/agent_common/invocation_state.py`
- Test: `packages/agent-common/tests/test_invocation_state.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-common/tests/test_invocation_state.py`:

```python
from agent_common.invocation_state import (
    get_invocation_temp,
    set_invocation_temp_state,
)


def test_reads_from_state_first():
    set_invocation_temp_state({"temp:kroger_token": "from-contextvar"})
    state = {"temp:kroger_token": "from-state"}
    assert get_invocation_temp("temp:kroger_token", state) == "from-state"


def test_falls_back_to_contextvar_when_state_missing_key():
    set_invocation_temp_state({"temp:strava_token": "tok-123"})
    assert get_invocation_temp("temp:strava_token", {}) == "tok-123"


def test_returns_empty_when_nowhere():
    set_invocation_temp_state(None)
    assert get_invocation_temp("temp:kroger_token", {}) == ""
    assert get_invocation_temp("temp:kroger_token", None) == ""
```

Run: `uv run pytest packages/agent-common/tests/test_invocation_state.py -v` — FAIL (module missing).

- [ ] **Step 2: Implement**

Create `packages/agent-common/src/agent_common/invocation_state.py`:

```python
"""Per-invocation temp-state bridge for in-process sub-agents.

ADK's AgentTool runs a child agent in a fresh session whose state copy strips
`temp:` keys. The orchestrator's session service stashes those keys in this
contextvar (inherited by the child's async context), and child toolsets read
them via get_invocation_temp as a fallback to their own session state.
"""

import contextvars

_invocation_temp_state: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "_invocation_temp_state",
    default=None,
)


def set_invocation_temp_state(temp: dict | None) -> None:
    _invocation_temp_state.set(temp)


def get_invocation_temp(key: str, state) -> str:
    """Read `key` from session state, falling back to the invocation contextvar."""
    if state:
        value = state.get(key)
        if value:
            return str(value)
    fallback = _invocation_temp_state.get() or {}
    return str(fallback.get(key) or "")
```

- [ ] **Step 3: Run the tests**

Run: `uv run pytest packages/agent-common/tests/test_invocation_state.py -v` — PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/agent-common/src/agent_common/invocation_state.py packages/agent-common/tests/test_invocation_state.py
git commit -m "feat(agent-common): shared invocation temp-state bridge"
```

### Task 7: Grocery and fitness read tokens via the bridge and expose `build_agent()`

Two changes per agent: (a) token reads fall back to the contextvar (so they work when invoked in-process by wellness), and (b) the `LlmAgent` construction moves into a `build_agent()` factory so wellness can hold its own instances (ADK agents track a parent; sharing the module-level instance between two runners is unsafe).

**Files:**

- Modify: `agents/grocery/src/grocery_agent/utils.py` (`_header_provider`)
- Modify: `agents/grocery/src/grocery_agent/main.py` (`on_before_agent`, agent construction)
- Modify: `agents/fitness/src/fitness_agent/main.py` (every `temp:strava_token` read, `on_before_agent`, agent construction)
- Test: `agents/grocery/tests/test_grocery_auth.py`, `agents/fitness/tests/test_fitness_tools.py` (extend)

- [ ] **Step 1: Write the failing grocery tests**

Append to `agents/grocery/tests/test_grocery_auth.py`:

```python
def test_header_provider_falls_back_to_invocation_contextvar():
    from agent_common.invocation_state import set_invocation_temp_state

    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    headers = utils._header_provider(DummyContext({}))
    assert headers == {"Authorization": "Bearer ctx-token"}
    set_invocation_temp_state(None)


def test_on_before_agent_derives_kroger_connected_from_contextvar_token():
    from agent_common.invocation_state import set_invocation_temp_state

    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    ctx = DummyContext({})
    main.on_before_agent(ctx)
    assert ctx.state["kroger_connected"] is True
    set_invocation_temp_state(None)
```

(`DummyContext` already exists in that file. If `main.on_before_agent` needs the `_invocation_context` attribute from `apply_a2a_auth_metadata_to_state`, that call is being deleted in this same task — see Step 3.)

Run: `uv run pytest agents/grocery/tests/test_grocery_auth.py -v` — new tests FAIL.

- [ ] **Step 2: Implement in grocery**

`agents/grocery/src/grocery_agent/utils.py` — replace `_header_provider`:

```python
from agent_common.invocation_state import get_invocation_temp


def _header_provider(context: ReadonlyContext) -> dict[str, str]:
    """Return auth headers from session state (or the in-process invocation bridge)."""
    token = get_invocation_temp(KROGER_TOKEN_STATE_KEY, context.state)
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}
```

`agents/grocery/src/grocery_agent/main.py` — replace `on_before_agent`:

```python
def on_before_agent(callback_context: CallbackContext) -> None:
    """Initialize missing state keys with defaults on every turn."""
    token = get_invocation_temp(KROGER_TOKEN_STATE_KEY, callback_context.state)
    if token:
        callback_context.state["kroger_connected"] = True
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
```

with the import `from agent_common.invocation_state import get_invocation_temp` added, and the `apply_a2a_auth_metadata_to_state` import + call removed (A2A is going away in Task 8).

Then wrap the agent construction in a factory — replace `grocery_agent = LlmAgent(...)` with:

```python
def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="grocery_agent",
        model=LiteLlm(
            model="openrouter/poolside/laguna-m.1:free",
            fallbacks=[
                "mistral/mistral-small-latest",
                "openrouter/owl-alpha",
                "nvidia_nim/deepseek-ai/deepseek-v4-flash",
            ],
        ),
        instruction=_INSTRUCTION,
        before_agent_callback=on_before_agent,
        before_model_callback=before_model_modifier,
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


grocery_agent = build_agent()
```

(Identical arguments to today's construction — only the wrapping changes.)

- [ ] **Step 3: Same pattern in fitness**

In `agents/fitness/src/fitness_agent/main.py`:

- `grep -n "temp:strava_token\|STRAVA_TOKEN_STATE_KEY" agents/fitness/src/fitness_agent/main.py` and replace every read of the token from state (`state.get(STRAVA_TOKEN_STATE_KEY...)` or equivalent) with `get_invocation_temp(STRAVA_TOKEN_STATE_KEY, state)` (import as in grocery).
- In `on_before_agent`: set `strava_connected = True` when `get_invocation_temp(STRAVA_TOKEN_STATE_KEY, callback_context.state)` is non-empty; remove the `apply_a2a_auth_metadata_to_state` call/import.
- Wrap the `LlmAgent(...)` construction in `def build_agent() -> LlmAgent:` + `fitness_agent = build_agent()` exactly as in grocery (same arguments as today).

Add a fitness test mirroring the grocery contextvar test (same shape, `temp:strava_token`, asserting `strava_connected` is set) in `agents/fitness/tests/test_fitness_tools.py`.

- [ ] **Step 4: Run the suites**

Run: `uv run pytest agents/grocery agents/fitness -v` — all green (some existing tests asserting A2A-metadata hydration in `on_before_agent` will fail; **delete those specific tests** — the behavior is intentionally removed, Task 8 removes the whole A2A path).

- [ ] **Step 5: Commit**

```bash
git add agents/grocery agents/fitness
git commit -m "refactor(agents): token bridge fallback + build_agent factories for in-process orchestration"
```

### Task 8: Wellness orchestrates in-process; delete all A2A code

`RemoteA2aAgent` → `AgentTool(agent=build_agent())`. Then remove the A2A surface (JSON-RPC app, runner, agent card, task store, executor) from all five agents and delete `agent_common/a2a.py` + `agent_common/task_store.py`.

**Files:**

- Modify: `agents/wellness/src/wellness_agent/main.py`
- Delete: `agents/wellness/src/wellness_agent/utils.py` (only held A2A URLs)
- Modify: `agents/travel/src/travel_agent/main.py`, `agents/grocery/src/grocery_agent/main.py`, `agents/fitness/src/fitness_agent/main.py`, `agents/a2ui/src/a2ui_agent/main.py`
- Delete: `packages/agent-common/src/agent_common/a2a.py`, `packages/agent-common/src/agent_common/task_store.py`, `packages/agent-common/tests/test_a2a.py`, `packages/agent-common/tests/test_task_store.py`
- Delete: `agents/travel/tests/test_a2a.py`, `agents/grocery/tests/test_a2a.py`, `agents/fitness/tests/test_a2a.py`, `agents/wellness/tests/test_a2a.py`, `agents/a2ui/tests/test_a2ui_agent.py` **only if** it is A2A-only (check first; if it tests other behavior, remove just the A2A tests)
- Modify: all six `pyproject.toml`s (drop `a2a-sdk`, change `google-adk[a2a,mcp]`/`google-adk[a2a]` → `google-adk[mcp]`/`google-adk`)
- Modify: `docker-compose.yml` (drop `GROCERY_AGENT_A2A_URL`/`FITNESS_AGENT_A2A_URL` from wellness)

- [ ] **Step 1: Convert wellness to in-process sub-agents**

In `agents/wellness/src/wellness_agent/main.py`:

(a) Replace the remote-agent construction (`grocery_remote_agent = RemoteA2aAgent(...)` and `fitness_remote_agent = RemoteA2aAgent(...)`, plus `_agent_card_url` and `_remote_a2a_metadata_provider`) with:

```python
from fitness_agent.main import build_agent as build_fitness_agent
from grocery_agent.main import build_agent as build_grocery_agent

# In-process sub-agents: one Railway service, no A2A hop. Tokens reach their
# toolsets via agent_common.invocation_state (set by _TempStateSessionService
# below, read by the sub-agents' header providers).
grocery_subagent = build_grocery_agent()
fitness_subagent = build_fitness_agent()
```

and in the wellness `LlmAgent` tools list change `AgentTool(agent=fitness_remote_agent)` / `AgentTool(agent=grocery_remote_agent)` to `AgentTool(agent=fitness_subagent)` / `AgentTool(agent=grocery_subagent)`.

(b) `_TempStateSessionService._inject` keeps its logic but calls the shared bridge instead of the module-local contextvar — replace `_invocation_temp_state.set(temp)` with `set_invocation_temp_state(temp)` (import `from agent_common.invocation_state import set_invocation_temp_state`) and delete the module-level `_invocation_temp_state` contextvar + the `import contextvars`.

(c) Remove A2A wiring from this file: the imports from `a2a.server.*`, `a2a.types`, `agent_common.a2a`, `agent_common.task_store`, `RemoteA2aAgent`/`AGENT_CARD_WELL_KNOWN_PATH`, the `_a2a_runner = Runner(...)`, `_a2a_agent_card()`, `_a2a_handler`, and the `A2AFastAPIApplication(...).add_routes_to_app(app)` block. Remove `from .utils import ...` and delete `agents/wellness/src/wellness_agent/utils.py`. In `on_before_agent`, drop the `apply_a2a_auth_metadata_to_state` call.

(d) Add a dependency on the sibling agents in `agents/wellness/pyproject.toml`:

```toml
  "grocery-agent",
  "fitness-agent",
```

and in root `pyproject.toml` `[tool.uv.sources]` add:

```toml
grocery-agent = { workspace = true }
fitness-agent = { workspace = true }
```

(e) Wellness extract already sets `temp:` tokens from headers (`extract_identity_state`); also set the connected flags so sub-agents inherit them through non-temp state — extend it:

```python
def extract_identity_state(request) -> dict:
    state = {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}
    kroger_token = request.headers.get(KROGER_TOKEN_HEADER)
    if kroger_token:
        state[KROGER_TOKEN_STATE_KEY] = kroger_token
        state["kroger_connected"] = True
    strava_token = request.headers.get(STRAVA_TOKEN_HEADER)
    if strava_token:
        state[STRAVA_TOKEN_STATE_KEY] = strava_token
        state["strava_connected"] = True
    return state
```

- [ ] **Step 2: Strip the A2A surface from the other four agents**

In each of `travel`, `grocery`, `fitness`, `a2ui` `main.py`: remove the `a2a.server.*` / `a2a.types` imports, `agent_common.a2a` and `agent_common.task_store` imports, the `_a2a_runner = Runner(...)` block (and the now-unused `Runner` import), `_a2a_agent_card()`, the `DefaultRequestHandler`/`A2AFastAPIApplication(...).add_routes_to_app(app)` block, and the `AGENT_PUBLIC_URL` constant if nothing else uses it. Keep the `InMemory*Service` instances only where the `ADKAgent` constructor still receives them. In each `on_before_agent`, the `apply_a2a_auth_metadata_to_state` call was already removed for grocery/fitness in Task 7 — remove it from travel and a2ui too.

- [ ] **Step 3: Delete the shared A2A modules, their tests, and the per-agent A2A tests**

```bash
git rm packages/agent-common/src/agent_common/a2a.py packages/agent-common/src/agent_common/task_store.py
git rm packages/agent-common/tests/test_a2a.py packages/agent-common/tests/test_task_store.py
git rm agents/travel/tests/test_a2a.py agents/grocery/tests/test_a2a.py agents/fitness/tests/test_a2a.py agents/wellness/tests/test_a2a.py
```

Check `agents/a2ui/tests/` and `packages/agent-common/tests/test_agent_imports.py` for A2A references; remove only those references/tests. Any remaining test that asserts A2A-metadata hydration (e.g. `test_on_before_agent_hydrates_a2a_kroger_metadata` in `agents/grocery/tests/test_grocery_auth.py`, and similar in `agents/grocery/tests/test_session_identity.py`) is asserting deleted behavior — delete those tests.

- [ ] **Step 4: Drop the dependencies**

In all `pyproject.toml`s under `agents/*` and `packages/agent-common`: remove the `a2a-sdk>=0.3.4,<0.4` line; change `google-adk[a2a,mcp]>=2.2.0` → `google-adk[mcp]>=2.2.0` and `google-adk[a2a]>=2.2.0` → `google-adk>=2.2.0`. In `docker-compose.yml`, remove `GROCERY_AGENT_A2A_URL` and `FITNESS_AGENT_A2A_URL` from the wellness service.

Run: `uv sync --all-packages` — success.

- [ ] **Step 5: Run everything**

Run: `uv run pytest && pnpm lint:py && uv run python -m compileall -q agents packages` — all green.

- [ ] **Step 6: Manual smoke of in-process orchestration**

Run: `docker compose up --build wellness grocery fitness` (still separate until Task 9), sign in on the web app with Kroger+Strava connected, and ask wellness to "Create a coordinated meal and workout plan for this week" — expect it to invoke both sub-agents in-process (single wellness container does the work; grocery/fitness containers stay idle) and stream a combined plan.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor!: in-process wellness orchestration, remove A2A protocol surface"
```

### Task 9: Gateway app — one process, one port

**Files:**

- Create: `agents/gateway/pyproject.toml`
- Create: `agents/gateway/railway.json`
- Create: `agents/gateway/src/gateway/__init__.py`
- Create: `agents/gateway/src/gateway/main.py`
- Create: `agents/gateway/tests/test_gateway.py`
- Modify: root `pyproject.toml` (workspace member, sources, pythonpath, coverage)
- Modify: `Dockerfile.agents` (manifest COPY line)
- Modify: `docker-compose.yml` (replace five services with one)
- Modify: each agent's trace middleware `/health` check (path now prefixed)

- [ ] **Step 1: Register the member**

Root `pyproject.toml`:

- `[tool.uv.workspace] members`: add `"agents/gateway",` (after `"agents/fitness",`).
- `[tool.uv.sources]`: add the agent packages the gateway imports:

```toml
travel-agent = { workspace = true }
wellness-agent = { workspace = true }
a2ui-agent = { workspace = true }
```

(`grocery-agent`/`fitness-agent` were added in Task 8.)

- `[tool.pytest.ini_options] pythonpath`: add `"agents/gateway/src",`.
- `[tool.coverage.run] source`: add `"agents/gateway/src",`.

`agents/gateway/pyproject.toml`:

```toml
[project]
name = "gateway"
version = "0.1.0"
description = "Single-service gateway mounting every agent app under one port"
requires-python = ">=3.14"
dependencies = [
  "agent-common",
  "a2ui-agent",
  "fitness-agent",
  "grocery-agent",
  "travel-agent",
  "wellness-agent",
  "fastapi",
  "uvicorn[standard]",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[build-system]
requires = ["uv_build>=0.11.19,<0.12"]
build-backend = "uv_build"
```

`agents/gateway/railway.json`: identical to `agents/a2ui/railway.json` (DOCKERFILE builder, `/health` healthcheck, ON_FAILURE restart).

`agents/gateway/src/gateway/__init__.py`: empty.

Run: `uv sync --all-packages` — success.

- [ ] **Step 2: Write the failing tests**

Create `agents/gateway/tests/test_gateway.py`:

```python
from fastapi.testclient import TestClient
from gateway import main


def test_mounts_every_agent():
    mounted = {route.path for route in main.app.routes}
    for prefix in ("/travel", "/grocery", "/fitness", "/wellness", "/a2ui"):
        assert prefix in mounted


def test_gateway_health():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}


def test_subapp_health_reachable_under_prefix():
    client = TestClient(main.app)
    assert client.get("/travel/health").status_code == 200
    assert client.get("/grocery/health").status_code == 200
```

Run: `uv run pytest agents/gateway/tests -v` — FAIL (no `gateway.main`).

- [ ] **Step 3: Implement the gateway**

Create `agents/gateway/src/gateway/main.py`:

```python
"""Gateway — mounts every agent FastAPI app on one port (one Railway service)."""

import logging
import os

from a2ui_agent.main import app as a2ui_app
from agent_common.session_service import SessionServiceContainer
from dotenv import load_dotenv
from fastapi import FastAPI
from fitness_agent.main import app as fitness_app
from grocery_agent.main import app as grocery_app
from travel_agent.main import app as travel_app
from wellness_agent.main import app as wellness_app

load_dotenv()

log = logging.getLogger("gateway")

_session_container = SessionServiceContainer()

app = FastAPI(title="Agents Gateway")

MOUNTS = {
    "/travel": travel_app,
    "/grocery": grocery_app,
    "/fitness": fitness_app,
    "/wellness": wellness_app,
    "/a2ui": a2ui_app,
}

for prefix, sub_app in MOUNTS.items():
    app.mount(prefix, sub_app)


@app.get("/health")
async def health():
    # All agents share one session DB; one connectivity check covers them.
    return await _session_container.check_database_connection()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

(Task 11 adds the `/resume` mount.)

- [ ] **Step 4: Fix the per-agent health-path checks under the mount**

Each agent's `trace_requests` middleware skips tracing with `if request.url.path == "/health"`. Under a mount the full URL path is `/travel/health`, so change that line in all five `main.py` files to:

```python
    if request.url.path.endswith("/health"):
        return await call_next(request)
```

- [ ] **Step 5: Run the tests**

Run: `uv run pytest agents/gateway/tests -v` — PASS (3 tests). Then `uv run pytest` — full suite green.

- [ ] **Step 6: Replace the compose services**

Replace the five services in `docker-compose.yml` with one (volume block stays):

```yaml
services:
  agents:
    build:
      context: .
      dockerfile: Dockerfile.agents
    ports:
      - "8000:8000"
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
    environment:
      OTEL_SERVICE_NAME: agents-gateway
      AGENT_DIR: agents/gateway
      AGENT_MODULE: gateway.main
      PORT: 8000
      ADK_SESSION_DB_PATH: /data/adk_sessions.sqlite
    volumes:
      - adk-session-data:/data

volumes:
  adk-session-data:
```

Add to `Dockerfile.agents` manifest copies: `COPY agents/gateway/pyproject.toml agents/gateway/`.

- [ ] **Step 7: Container smoke**

Run: `docker compose up --build`; then:

```bash
curl -s localhost:8000/health          # {"status":"ok",...}
curl -s localhost:8000/travel/health   # {"status":"ok",...}
curl -s -X POST localhost:8000/grocery/agui -H 'content-type: application/json' -d '{}' -o /dev/null -w '%{http_code}\n'  # 4xx (bad AG-UI payload), NOT 404
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(gateway): serve all agents from one FastAPI service"
```

### Task 10: Point web + mobile at the gateway

**Files:**

- Modify: `apps/web/src/env.ts`
- Modify: `apps/web/src/app/api/copilotkit/route.ts`
- Modify: `apps/web/src/app/api/agents/health/route.ts` + `route.test.ts`
- Modify: `apps/mobile/src/utils/agent-config-core.ts` + `apps/mobile/src/utils/agent-config.test.ts`
- Modify: `apps/mobile/src/utils/agent-config.ts`

- [ ] **Step 1: Update the web tests first**

`apps/web/src/app/api/agents/health/route.test.ts` — replace the `vi.mock("@/env", ...)` env object with `{ AGENTS_BASE_URL: "http://agents.test" }` and adjust expectations: `fetchMock` called once per agent with `http://agents.test/<name>/health`; the agents map keys stay the same. Keep totals at 5 (Task 12 bumps to 6).

Run: `pnpm --filter web exec vitest run src/app/api/agents/health/route.test.ts` — FAIL.

- [ ] **Step 2: Implement web changes**

`apps/web/src/env.ts` — replace the five per-agent URL entries in `server:` with:

```ts
    AGENTS_BASE_URL: z.url().default("http://127.0.0.1:8000"),
```

and in `runtimeEnv:` replace the five lines with:

```ts
    AGENTS_BASE_URL: process.env.AGENTS_BASE_URL,
```

`apps/web/src/app/api/copilotkit/route.ts` — replace the `agents:` map with a derived one:

```ts
const AGENT_IDS = ["travel", "grocery", "fitness", "wellness", "a2ui"] as const;

const runtime = new CopilotSseRuntime({
  agents: Object.fromEntries(
    AGENT_IDS.map((id) => [
      id,
      new HttpAgent({
        url: `${env.AGENTS_BASE_URL}/${id}/agui`,
        debug: env.COPILOTKIT_DEBUG,
      }),
    ]),
  ),
  a2ui: { injectA2UITool: true, agents: ["a2ui"] },
  debug: env.COPILOTKIT_DEBUG,
});
```

`apps/web/src/app/api/agents/health/route.ts` — replace `AGENT_URLS` with:

```ts
const AGENT_IDS = ["travel", "grocery", "fitness", "wellness", "a2ui"] as const;
```

and the fan-out with `AGENT_IDS.map((name) => checkAgent(name, `${env.AGENTS_BASE_URL}/${name}`))`.

- [ ] **Step 3: Update mobile config core (tests first)**

In `apps/mobile/src/utils/agent-config.test.ts`, replace tests that exercise per-agent env keys/ports with the new contract (keep the CopilotKit-runtime-URL and android-localhost-rewrite tests as they are):

```ts
it("builds agent urls from the single base url", () => {
  expect(
    getAgentUrl("travel", {}, "ios", { EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com" }),
  ).toBe("https://agents.example.com/travel/agui");
});

it("defaults to localhost:8000 with the agent prefix", () => {
  expect(getAgentUrl("grocery", {}, "ios", {})).toBe("http://localhost:8000/grocery/agui");
  expect(getAgentUrl("grocery", {}, "android", {})).toBe("http://10.0.2.2:8000/grocery/agui");
});
```

Then in `apps/mobile/src/utils/agent-config-core.ts`: delete `AGENT_PORTS` and `EXPO_PUBLIC_ENV_KEYS`; add `const AGENTS_BASE_ENV_KEY = "EXPO_PUBLIC_AGENTS_BASE_URL";` and change `AgentRuntimeConfig` to `{ agentsBaseUrl?: string; copilotKitRuntimeUrl?: string }`; replace the non-runtime branch of `getAgentUrl` with:

```ts
const configured = envOrConfig(env, AGENTS_BASE_ENV_KEY, config.agentsBaseUrl);
const baseUrl = configured ?? `http://${os === "android" ? "10.0.2.2" : "localhost"}:8000`;
return normalizeAguiUrl(
  `${stripTrailingSlash(normalizeLocalhostForPlatform(baseUrl, os))}/${agentId}`,
);
```

(`normalizeAguiUrl` already appends `/agui`; `getDefaultAgentBaseUrl` is deleted — remove its tests.) In `apps/mobile/src/utils/agent-config.ts`, replace the per-agent `extra.*AgentUrl` reads with `agentsBaseUrl: typeof extra.agentsBaseUrl === "string" ? extra.agentsBaseUrl : undefined,`.

- [ ] **Step 4: Run both suites + build**

Run: `pnpm --filter mobile test && pnpm --filter web test` — green.
Run: `SKIP_ENV_VALIDATION=1 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k CLERK_SECRET_KEY=sk_test_placeholder pnpm build` — success.

- [ ] **Step 5: End-to-end smoke**

`docker compose up --build` + `pnpm dev:web`: travel console streams; grocery works with Kroger connected; wellness produces a combined plan.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/mobile
git commit -m "feat: web and mobile target the single agents gateway"
```

**Deployment note (manual, after merge):** create ONE Railway service (Root Dir = repo root, `AGENT_DIR=agents/gateway`), set `AGENTS_BASE_URL` on Vercel and `EXPO_PUBLIC_AGENTS_BASE_URL` in EAS, then delete the five old Railway services. **This is the money step.**

---

## Phase 4 — Web auth perimeter

### Task 11 _(formerly Task 6)_: Protect `/console/*` and `/a2ui` in Clerk middleware (resume stays public)

**Files:**

- Modify: `apps/web/src/proxy.ts`
- Test: `apps/web/src/proxy.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/proxy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { PROTECTED_ROUTES } from "./proxy";

const matcher = createRouteMatcher(PROTECTED_ROUTES);
const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("protected route matcher", () => {
  it.each([
    "/travel",
    "/grocery",
    "/fitness",
    "/wellness",
    "/a2ui",
    "/console/travel",
    "/console/grocery",
    "/console/fitness",
    "/console/wellness",
    "/console/a2ui",
    "/console/settings",
  ])("protects %s", (path) => {
    expect(matcher(req(path))).toBe(true);
  });

  it.each(["/", "/console/resume", "/resume", "/sign-in", "/api/agents/health"])(
    "leaves %s public",
    (path) => {
      expect(matcher(req(path))).toBe(false);
    },
  );
});
```

Run: `pnpm --filter web exec vitest run src/proxy.test.ts` — FAIL (`PROTECTED_ROUTES` not exported).

- [ ] **Step 2: Implement**

In `apps/web/src/proxy.ts`, replace the matcher definition:

```ts
// Every agent surface except the public resume demo. The legacy top-level
// paths redirect into /console/<agent> but are kept here so the redirect
// itself already requires a session. /console/resume is intentionally absent.
export const PROTECTED_ROUTES = [
  "/travel(.*)",
  "/grocery(.*)",
  "/fitness(.*)",
  "/wellness(.*)",
  "/a2ui(.*)",
  "/console/travel(.*)",
  "/console/grocery(.*)",
  "/console/fitness(.*)",
  "/console/wellness(.*)",
  "/console/a2ui(.*)",
  "/console/settings(.*)",
];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTES);
```

(`clerkMiddleware` body and `config` export unchanged.)

- [ ] **Step 3: Run the test** — `pnpm --filter web exec vitest run src/proxy.test.ts` — PASS.

- [ ] **Step 4: Manual smoke** — `pnpm dev:web`, private window: `/console/grocery` → `/sign-in` redirect; `/` loads.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/proxy.ts apps/web/src/proxy.test.ts
git commit -m "fix(web): protect /console and /a2ui routes behind Clerk"
```

### Task 12 _(formerly Task 7)_: Gate `/api/copilotkit` and forward a verified Clerk JWT

(1) Unauthenticated requests are rejected unless they target the public `resume` agent (multi-route paths like `/api/copilotkit/agent/<id>/run`) or `/info`; (2) `onRequest` mints a Clerk session JWT via `getToken()` into the `authorization` header — browsers auth to Next.js with cookies, so without this the gateway (Phase 5) would never see a token on the web path. The runtime already forwards `authorization` + `x-*` headers.

**Files:**

- Create: `apps/web/src/app/api/copilotkit/guard.ts`
- Modify: `apps/web/src/app/api/copilotkit/route.ts`
- Test: `apps/web/src/app/api/copilotkit/route.guard.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/copilotkit/route.guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPublicCopilotPath } from "./guard";

describe("isPublicCopilotPath", () => {
  it.each([
    "/api/copilotkit/agent/resume/run",
    "/api/copilotkit/agent/resume/connect",
    "/api/copilotkit/info",
  ])("allows %s without auth", (path) => {
    expect(isPublicCopilotPath(path)).toBe(true);
  });

  it.each([
    "/api/copilotkit/agent/travel/run",
    "/api/copilotkit/agent/grocery/run",
    "/api/copilotkit/agent/a2ui/run",
    "/api/copilotkit",
    "/api/copilotkit/agent/resumefake/run",
  ])("requires auth for %s", (path) => {
    expect(isPublicCopilotPath(path)).toBe(false);
  });
});
```

Run: `pnpm --filter web exec vitest run src/app/api/copilotkit/route.guard.test.ts` — FAIL (`./guard` missing).

- [ ] **Step 2: Create the guard**

Create `apps/web/src/app/api/copilotkit/guard.ts`:

```ts
// The resume agent is the public demo surface; everything else on the
// CopilotKit runtime requires a Clerk session. /info is the runtime's
// capability-discovery endpoint and must stay reachable pre-auth so the
// provider can boot on the public /console/resume page.
const PUBLIC_AGENT_IDS = new Set(["resume"]);

export function isPublicCopilotPath(pathname: string): boolean {
  if (pathname === "/api/copilotkit/info") return true;
  const match = /^\/api\/copilotkit\/agent\/([^/]+)\//.exec(pathname);
  return match !== null && PUBLIC_AGENT_IDS.has(match[1]);
}
```

Run the test — PASS.

- [ ] **Step 3: Wire the guard and JWT forwarding into the route**

In `apps/web/src/app/api/copilotkit/route.ts`:

(a) `import { isPublicCopilotPath } from "./guard";`

(b) In `onRequest`, replace:

```ts
    onRequest: async ({ request }) => {
      const { userId } = await auth();
```

with:

```ts
    onRequest: async ({ request }) => {
      const { userId, getToken } = await auth();
      // Browsers authenticate to Next.js via Clerk cookies; the gateway
      // verifies a Bearer JWT (agent-common ClerkAuthMiddleware). Mint a fresh
      // session token so the runtime's header forwarding carries it.
      const sessionToken = userId ? await getToken().catch(() => null) : null;
      if (sessionToken) {
        request.headers.set("authorization", `Bearer ${sessionToken}`);
      }
```

(rest of the hook body unchanged.)

(c) Replace the bare method exports with a guard wrapper:

```ts
// Reject unauthenticated requests before they reach the runtime, except for
// the public resume agent and CORS preflight. The catch-all
// [...path]/route.ts re-exports these, so the guard covers every sub-route.
const guarded = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (request.method !== "OPTIONS" && !isPublicCopilotPath(pathname)) {
    const { userId } = await auth();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  return handler(request);
};

export const GET = guarded;
export const POST = guarded;
export const OPTIONS = handler;
export const PATCH = guarded;
export const DELETE = guarded;
```

(`[...path]/route.ts` re-exports these automatically; it has no `OPTIONS` export today — leave as is.)

- [ ] **Step 4: Verify** — `pnpm --filter web test` green; CI-style `pnpm build` succeeds.

- [ ] **Step 5: Manual smoke** — signed out: `curl -i -X POST http://localhost:3000/api/copilotkit/agent/travel/run` → `401`; signed-in travel chat still streams.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/copilotkit/
git commit -m "fix(web): require Clerk session on copilotkit runtime, forward session JWT"
```

---

## Phase 5 — Verified identity on the gateway

### Task 13 _(formerly Task 8+10)_: `ClerkAuthMiddleware` in agent-common, wired once on the gateway

Pure-ASGI middleware protecting every path containing `/agui` (except declared public prefixes): requires a valid Clerk session JWT (RS256 against the instance JWKS) and **rewrites** `x-clerk-user-id` to the verified `sub` — existing `extract_*_state` functions keep working but can't be spoofed. Token verification is injectable for tests (matches the DI style of `session_service.py`). Because all agents live behind the gateway, this is wired exactly once.

**Files:**

- Modify: `packages/agent-common/pyproject.toml` (add PyJWT)
- Create: `packages/agent-common/src/agent_common/clerk_auth.py`
- Modify: `agents/gateway/src/gateway/main.py`
- Test: `packages/agent-common/tests/test_clerk_auth.py`, `agents/gateway/tests/test_gateway.py` (extend)

- [ ] **Step 1: Add the dependency**

`packages/agent-common/pyproject.toml` `dependencies` — append:

```toml
  "pyjwt[crypto]>=2.10",
```

Run: `uv sync --all-packages` — success.

- [ ] **Step 2: Write the failing tests**

Create `packages/agent-common/tests/test_clerk_auth.py`:

```python
import jwt
import pytest
from agent_common.clerk_auth import ClerkAuthMiddleware, clerk_auth_enabled, decode_clerk_jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _app(decoder):
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/travel/agui")
    async def travel_agui(request: Request):
        return {"user_id": request.headers.get("x-clerk-user-id")}

    @app.post("/resume/agui")
    async def resume_agui():
        return {"public": True}

    app.add_middleware(ClerkAuthMiddleware, decoder=decoder, public_prefixes=("/resume",))
    return TestClient(app)


def _ok_decoder(token):
    if token != "good-token":
        raise jwt.InvalidTokenError("bad token")
    return {"sub": "user_verified"}


def test_health_bypasses_auth():
    assert _app(_ok_decoder).get("/health").status_code == 200


def test_public_prefix_bypasses_auth():
    assert _app(_ok_decoder).post("/resume/agui").status_code == 200


def test_agui_rejects_missing_token():
    assert _app(_ok_decoder).post("/travel/agui").status_code == 401


def test_agui_rejects_invalid_token():
    response = _app(_ok_decoder).post(
        "/travel/agui", headers={"authorization": "Bearer nope"}
    )
    assert response.status_code == 401


def test_agui_rewrites_user_id_header_to_verified_sub():
    response = _app(_ok_decoder).post(
        "/travel/agui",
        headers={
            "authorization": "Bearer good-token",
            # A spoofed header must be overwritten, not trusted.
            "x-clerk-user-id": "user_attacker",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"user_id": "user_verified"}


def test_decode_clerk_jwt_verifies_signature_and_expiry(rsa_key):
    token = jwt.encode(
        {"sub": "user_real", "exp": 4102444800},  # 2100-01-01
        rsa_key,
        algorithm="RS256",
    )
    claims = decode_clerk_jwt(token, signing_key=rsa_key.public_key())
    assert claims["sub"] == "user_real"

    expired = jwt.encode({"sub": "user_real", "exp": 1}, rsa_key, algorithm="RS256")
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_clerk_jwt(expired, signing_key=rsa_key.public_key())


def test_clerk_auth_enabled_follows_env(monkeypatch):
    monkeypatch.delenv("CLERK_JWKS_URL", raising=False)
    assert clerk_auth_enabled() is False
    monkeypatch.setenv("CLERK_JWKS_URL", "https://example.clerk.accounts.dev/.well-known/jwks.json")
    assert clerk_auth_enabled() is True
```

Run: `uv run pytest packages/agent-common/tests/test_clerk_auth.py -v` — FAIL (module missing).

- [ ] **Step 3: Implement**

Create `packages/agent-common/src/agent_common/clerk_auth.py`:

```python
"""Clerk session-JWT verification middleware for agent /agui endpoints.

Clerk session tokens are RS256 JWTs verifiable against the instance JWKS
(https://<frontend-api>/.well-known/jwks.json). The middleware verifies the
Bearer token on every path containing "/agui" (minus public prefixes) and
rewrites the x-clerk-user-id header to the verified `sub`, so downstream
extract_*_state functions stay unchanged but cannot be spoofed.

Enable by setting CLERK_JWKS_URL (and optionally CLERK_ISSUER). Wiring:

    if clerk_auth_enabled():
        app.add_middleware(ClerkAuthMiddleware, public_prefixes=("/resume",))
"""

import functools
import json
import os

import jwt

USER_ID_HEADER = b"x-clerk-user-id"


def clerk_auth_enabled() -> bool:
    return bool(os.getenv("CLERK_JWKS_URL"))


@functools.lru_cache(maxsize=1)
def _jwk_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(os.environ["CLERK_JWKS_URL"])


def decode_clerk_jwt(token: str, *, signing_key=None) -> dict:
    """Verify signature + expiry (and issuer when CLERK_ISSUER is set)."""
    if signing_key is None:
        signing_key = _jwk_client().get_signing_key_from_jwt(token).key
    issuer = os.getenv("CLERK_ISSUER")
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=issuer or None,
        # Clerk session tokens carry `azp`, not `aud`.
        options={"verify_aud": False, "verify_iss": bool(issuer)},
        leeway=5,
    )


def _bearer_token(scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            text = value.decode("latin-1")
            if text.lower().startswith("bearer "):
                return text[7:].strip()
    return None


async def _send_401(send, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        },
    )
    await send({"type": "http.response.body", "body": body})


class ClerkAuthMiddleware:
    """Pure-ASGI middleware guarding every path that contains "/agui"."""

    def __init__(self, app, *, decoder=decode_clerk_jwt, public_prefixes: tuple = ()):
        self.app = app
        self.decoder = decoder
        self.public_prefixes = public_prefixes

    def _is_protected(self, path: str) -> bool:
        if "/agui" not in path:
            return False
        return not any(path.startswith(prefix) for prefix in self.public_prefixes)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self._is_protected(scope["path"]):
            return await self.app(scope, receive, send)

        token = _bearer_token(scope)
        if not token:
            return await _send_401(send, "Missing bearer token")
        try:
            claims = self.decoder(token)
        except jwt.PyJWTError:
            return await _send_401(send, "Invalid token")

        sub = str(claims.get("sub") or "")
        if not sub:
            return await _send_401(send, "Token has no subject")

        # Replace any client-supplied identity header with the verified one.
        headers = [(n, v) for n, v in scope["headers"] if n != USER_ID_HEADER]
        headers.append((USER_ID_HEADER, sub.encode("latin-1")))
        scope = {**scope, "headers": headers}
        return await self.app(scope, receive, send)
```

Run: `uv run pytest packages/agent-common/tests/test_clerk_auth.py -v` — PASS (8 tests).

- [ ] **Step 4: Wire it on the gateway**

In `agents/gateway/src/gateway/main.py`, after the mounts:

```python
from agent_common.clerk_auth import ClerkAuthMiddleware, clerk_auth_enabled

if clerk_auth_enabled():
    app.add_middleware(ClerkAuthMiddleware, public_prefixes=("/resume",))
```

Append to `agents/gateway/tests/test_gateway.py`:

```python
def test_agui_requires_token_when_clerk_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    import importlib

    module = importlib.reload(main)
    client = TestClient(module.app)
    assert client.get("/health").status_code == 200
    assert client.post("/travel/agui", json={}).status_code == 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)
```

Run: `uv run pytest agents/gateway/tests packages/agent-common/tests -v` — green; then `uv run pytest` — full suite green.

- [ ] **Step 5: End-to-end smoke**

Set `CLERK_JWKS_URL` (from the Clerk dashboard) in `.env.local`, `docker compose up --build` + `pnpm dev`, sign in, send a travel message — streams normally (the runtime forwards the minted JWT from Task 12). Then `curl -i -X POST localhost:8000/travel/agui -H 'x-clerk-user-id: user_attacker' -d '{}'` — `401`.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-common agents/gateway uv.lock
git commit -m "feat: verify Clerk session JWT on gateway /agui routes"
```

**Deployment note (manual, after merge):** set `CLERK_JWKS_URL` + `CLERK_ISSUER` on the single Railway gateway service. Until set, behavior is unchanged — the rollout is a config flip.

---

## Phase 6 — Resume agent (public demo)

### Task 14 _(formerly Task 11)_: Resume agent Python package

Chat-only ADK agent: no MCP, no PredictState, no auth (the gateway's `public_prefixes=("/resume",)` exempts it). The resume is embedded in the system instruction — a resume is a few KB; no vector store needed.

**Files:**

- Create: `agents/resume/pyproject.toml`
- Create: `agents/resume/src/resume_agent/__init__.py`
- Create: `agents/resume/src/resume_agent/resume.md`
- Create: `agents/resume/src/resume_agent/main.py`
- Create: `agents/resume/tests/test_resume_agent.py`
- Modify: root `pyproject.toml`, `agents/gateway/pyproject.toml`, `agents/gateway/src/gateway/main.py`, `agents/gateway/tests/test_gateway.py`, `Dockerfile.agents`

(No `railway.json`, no compose service, no new port — it rides the gateway.)

- [ ] **Step 1: Register the member**

Root `pyproject.toml`: add `"agents/resume",` to `[tool.uv.workspace] members`; add `resume-agent = { workspace = true }` to `[tool.uv.sources]`; add `"agents/resume/src",` to pythonpath and coverage source lists.

`agents/resume/pyproject.toml`:

```toml
[project]
name = "resume-agent"
version = "0.1.0"
description = "Public resume Q&A agent powered by Google ADK + CopilotKit AG-UI"
requires-python = ">=3.14"
dependencies = [
  "agent-common",
  "fastapi",
  "uvicorn[standard]",
  "python-dotenv",
  "pydantic",
  "google-adk>=2.2.0",
  "google-genai",
  "ag-ui-adk>=0.6.4",
  "litellm",
  "opentelemetry-api",
  "opentelemetry-sdk",
  "opentelemetry-exporter-otlp-proto-http",
  "dependency-injector>=4.49.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[build-system]
requires = ["uv_build>=0.11.19,<0.12"]
build-backend = "uv_build"
```

`agents/resume/src/resume_agent/__init__.py`: empty.

Run: `uv sync --all-packages` — success.

- [ ] **Step 2: Seed the resume content**

Create `agents/resume/src/resume_agent/resume.md`:

```markdown
<!-- REPLACE ME: Lucas's real resume goes here before deploying.
     Source: the content previously embedded in github.com/aranlucas/resume-chat
     (hire-lucas.vercel.app). Plain markdown; the whole file is injected into
     the system prompt. -->

# Lucas Aran

Software engineer. GitHub: github.com/aranlucas.

## Experience

(placeholder — replace with real entries)

## Skills

(placeholder — replace with real entries)
```

**This file is user data — Lucas must replace it (and add the interview Q&A, if porting that) before deploy. Do not invent resume content.**

- [ ] **Step 3: Write the failing tests**

Create `agents/resume/tests/test_resume_agent.py`:

```python
from fastapi.testclient import TestClient
from resume_agent import main


def test_instruction_embeds_resume_content():
    assert "# Lucas Aran" in main.resume_agent.instruction
    assert "only answer questions" in main.resume_agent.instruction.lower()


async def test_extract_state_defaults_to_anonymous():
    class DummyRequest:
        headers = {}

    state = await main.extract_visitor_state(DummyRequest(), None)
    assert state == {"user_id": "anonymous"}


def test_app_exposes_agui_and_health_routes():
    paths = {route.path for route in main.app.routes}
    assert "/health" in paths
    assert any(p.startswith("/agui") for p in paths)


def test_health_endpoint_reports_database():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}
```

Run: `uv run pytest agents/resume/tests -v` — FAIL (`main.py` missing).

- [ ] **Step 4: Implement `main.py`**

Create `agents/resume/src/resume_agent/main.py`:

```python
"""Resume Q&A Agent — public, unauthenticated demo (port of aranlucas/resume-chat)."""

import logging
import os
import time
from pathlib import Path

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from agent_common.session_service import SessionServiceContainer, create_session_service
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from opentelemetry import trace

load_dotenv()

log = logging.getLogger("resume_agent")
tracer = trace.get_tracer("resume-agent")

_RESUME = (Path(__file__).parent / "resume.md").read_text(encoding="utf-8")

_INSTRUCTION = f"""\
You are a friendly assistant that answers questions about Lucas's professional
background on his behalf, for recruiters and curious visitors.

Ground every answer in the resume below. Only answer questions about Lucas's
experience, skills, projects, education, and working style. If asked about
anything else (or for information not in the resume), say you can only speak
to what's on the resume and suggest contacting Lucas directly.

Keep answers short, specific, and positive. Never invent employers, dates, or
accomplishments that are not in the resume.

=== RESUME ===
{_RESUME}
=== END RESUME ===
"""


async def extract_visitor_state(request, _input_data) -> dict:
    # Public demo: no auth. Sessions are keyed by an anonymous visitor id.
    return {"user_id": request.headers.get("x-clerk-user-id") or "anonymous"}


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        model=LiteLlm(
            model="openrouter/poolside/laguna-m.1:free",
            fallbacks=[
                "mistral/mistral-small-latest",
                "openrouter/owl-alpha",
                "nvidia_nim/deepseek-ai/deepseek-v4-flash",
            ],
        ),
        instruction=_INSTRUCTION,
        tools=[AGUIToolset()],
    )


resume_agent = build_agent()

_session_container = SessionServiceContainer()

adk_resume_agent = ADKAgent(
    adk_agent=resume_agent,
    session_service=create_session_service(),
    session_timeout_seconds=3600,
)

app = FastAPI(title="Resume Q&A Agent")


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
            log.exception("Unhandled error in %s %s", request.method, request.url.path)
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute(
            "duration_ms",
            round((time.perf_counter() - start) * 1000, 2),
        )
        return response


# Public demo agent — wide-open CORS is intentional here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(
    app,
    adk_resume_agent,
    path="/agui",
    extract_state_from_request=extract_visitor_state,
)


@app.get("/health")
async def health():
    return await _session_container.check_database_connection()
```

Note: if `ADKAgent` requires artifact/memory/credential services explicitly, pass the same in-memory services the other agents use (`InMemoryArtifactService()`, `InMemoryMemoryService()`, `InMemoryCredentialService()` — import paths as in `agents/a2ui/src/a2ui_agent/main.py:25-29`). No OTEL `_setup_otel()` here — the gateway process already initializes providers via the mounted agents' modules; `trace.get_tracer` picks them up.

- [ ] **Step 5: Mount it on the gateway**

`agents/gateway/pyproject.toml`: add `"resume-agent",` to dependencies.
`agents/gateway/src/gateway/main.py`: add `from resume_agent.main import app as resume_app` and `"/resume": resume_app,` to `MOUNTS`.
`agents/gateway/tests/test_gateway.py`: add `"/resume"` to the prefixes tuple in `test_mounts_every_agent`, and:

```python
def test_resume_agui_is_public_with_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    import importlib

    module = importlib.reload(main)
    client = TestClient(module.app)
    # 401 would mean the public prefix is broken; any other status means the
    # request reached the resume app (bad AG-UI payload → 4xx/5xx, not 401).
    assert client.post("/resume/agui", json={}).status_code != 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)
```

`Dockerfile.agents`: add `COPY agents/resume/pyproject.toml agents/resume/`.

- [ ] **Step 6: Run everything**

Run: `uv sync --all-packages && uv run pytest && pnpm lint:py` — green.

- [ ] **Step 7: Commit**

```bash
git add agents/resume agents/gateway pyproject.toml uv.lock Dockerfile.agents
git commit -m "feat(resume): public resume Q&A agent mounted on the gateway"
```

### Task 15 _(formerly Task 12)_: Register the resume agent in the web app

**Files:**

- Modify: `apps/web/src/app/api/copilotkit/route.ts` (AGENT_IDS)
- Modify: `apps/web/src/app/api/agents/health/route.ts` + `route.test.ts`
- Modify: `apps/web/src/components/chat/agents/registry.ts` + `registry.test.ts`
- Modify: `apps/web/src/app/globals.css` (`--resume` accent)
- Create: `apps/web/src/app/resume/page.tsx`

- [ ] **Step 1: Update tests first**

`registry.test.ts`: order assertion becomes

```ts
it("lists the six agents in display order", () => {
  expect(AGENT_ORDER).toEqual(["travel", "grocery", "fitness", "wellness", "a2ui", "resume"]);
});
```

plus `expect(getAgentConfig("resume").requires ?? []).toEqual([]);` in the requirements test.

`health/route.test.ts`: expect 6 fetches, add `resume: "error"` (and adjust the all-error array to six entries), `total: 6`.

Run both — FAIL.

- [ ] **Step 2: Implement**

- `route.ts` and `health/route.ts`: add `"resume"` to both `AGENT_IDS` tuples.
- `registry.ts`: extend the union — `export type AgentId = "travel" | "grocery" | "fitness" | "wellness" | "a2ui" | "resume";` — and add after the `a2ui` entry:

```ts
  resume: {
    id: "resume",
    label: "Resume",
    glyph: "📄",
    colorVar: "--resume",
    placeholder: "Ask about Lucas's experience, skills, or projects…",
    welcome:
      "Hi! I can answer questions about Lucas's background, experience, and skills. What would you like to know?",
    suggestions: [
      { title: "Experience", message: "Walk me through Lucas's work experience." },
      { title: "Tech stack", message: "What technologies is Lucas strongest in?" },
      { title: "Recent projects", message: "What has Lucas built recently?" },
      { title: "Good fit?", message: "Why would Lucas be a good fit for a senior engineering role?" },
    ],
  },
```

with `export const AGENT_ORDER: AgentId[] = ["travel", "grocery", "fitness", "wellness", "a2ui", "resume"];`

- `globals.css`: find the `--a2ui` accent definition and add a `--resume` line in the same format next to it (light and dark blocks if both exist; pick a neutral slate tone distinct from the other five).
- `apps/web/src/app/resume/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/console/resume");
}
```

- [ ] **Step 3: Verify** — `pnpm --filter web test` green (the Task 11 proxy test already asserts `/console/resume` + `/resume` are public); CI-style `pnpm build` succeeds.

- [ ] **Step 4: End-to-end smoke** — `docker compose up --build` + `pnpm dev:web`; signed-out private window: `/console/resume` loads and chats; `/console/travel` redirects to sign-in.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): public /console/resume surface"
```

**Out of scope (deliberate):** a mobile `resume` screen — the mobile app is a signed-in surface; add later by copying `apps/mobile/src/app/a2ui.tsx` and extending `AgentId` in `apps/mobile/src/utils/agent-config-core.ts`.

---

## Phase 7 — README

### Task 16 _(formerly Task 13)_: Rewrite README.md

The current README documents the pre-monorepo "Trip Studio" single app. Replace entirely.

**Files:**

- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Replace the content**

Write `README.md` with exactly:

```markdown
# Agents Monorepo — CopilotKit × Google ADK

Six collaborative AI agents served from a single gateway, sharing live state
with web and mobile UIs over the [AG-UI](https://docs.copilotkit.ai/ag-ui)
protocol. Built with [CopilotKit](https://copilotkit.ai) v2,
[Google ADK](https://google.github.io/adk-docs/), Next.js 16, and Expo.

| Agent    | What it does                                          | Access           |
| -------- | ----------------------------------------------------- | ---------------- |
| travel   | Trip planning with a live shared itinerary (trvl MCP) | Sign-in required |
| grocery  | Meal planning + shopping lists with live Kroger data  | Sign-in + Kroger |
| fitness  | Training plans from Strava activity                   | Sign-in + Strava |
| wellness | Orchestrates grocery + fitness in-process             | Sign-in + both   |
| a2ui     | Renders declarative A2UI surfaces from chat           | Sign-in required |
| resume   | Public Q&A about Lucas's resume (no account needed)   | Public           |

## Architecture
```

apps/web → CopilotKit runtime (/api/copilotkit) → gateway /<agent>/agui
apps/mobile → @ag-ui/client (HttpAgent) → gateway /<agent>/agui (direct)
wellness → AgentTool (in-process) → grocery + fitness sub-agents

````

- All agents run in ONE FastAPI process (`agents/gateway/` mounts each
  `agents/<name>/` app under a path prefix) — one Railway service.
- State (itineraries, shopping lists, plans) is written to ADK shared state by
  tools, never pasted into chat; the UI re-renders on every state delta.
- Auth is Clerk end to end: the web runtime mints a session JWT per request and
  the gateway verifies it against the Clerk JWKS (`agent-common`'s
  `ClerkAuthMiddleware`), rewriting the identity header to the verified
  subject. The resume agent is intentionally unauthenticated.

## Getting started

Prerequisites: pnpm, Docker, [uv](https://docs.astral.sh/uv/), and API keys
per `.env.example`.

```bash
cp .env.example .env   # fill in Clerk + model provider keys
pnpm install           # JS deps + `uv sync` for Python
pnpm dev               # web on :3000 + the agents gateway on :8000
````

Other entry points: `pnpm dev:web`, `pnpm dev:mobile`, `pnpm dev:agents`.

## Quality checks

```bash
pnpm check     # oxlint + ruff + tailwind canon + oxfmt --check
pnpm test      # vitest (web, mobile) + pytest (agents, agent-common)
pnpm coverage  # both ecosystems with coverage
```

CI (`.github/workflows/ci.yml`) gates lint, format, Python syntax, both test
suites with a coverage floor, the web build, and the agent Docker image.

## Layout, conventions, deployment

See [AGENTS.md](AGENTS.md) — repository guide (also loaded by coding agents),
including the "Adding a new agent" checklist and the Railway/Vercel/EAS
deployment table. Design docs live in `docs/superpowers/`; the forward-looking
roadmap is [docs/ROADMAP.md](docs/ROADMAP.md).

## Acknowledgements

The shared-state, streaming, and HITL patterns are adapted from the CopilotKit
[`google-adk` showcase](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk).

````

- [ ] **Step 2: Verify formatting** — `pnpm fmt:check` (run `pnpm fmt` if oxfmt reflows tables).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the single-gateway monorepo"
````

**Follow-up for the 2026-06-09 plan's Task 21 (AGENTS.md):** when refreshing AGENTS.md, the "Adding a new agent" checklist changes — no new compose service or Railway service; instead "add the package, mount it in `agents/gateway/src/gateway/main.py`, add the id to the two `AGENT_IDS` tuples and the registry."

---

## Final verification

- [ ] `pnpm check` — clean
- [ ] `uv run pytest --cov` — green, coverage floor met
- [ ] `pnpm test` — green
- [ ] CI-style `pnpm build` — succeeds
- [ ] `docker build -f Dockerfile.agents .` — succeeds
- [ ] `docker compose up --build` (single container) then: signed-out `/console/resume` chats; signed-out `/console/travel` redirects; signed-out `POST /api/copilotkit/agent/travel/run` → 401; signed-in travel chat streams; wellness produces a combined plan (in-process)
- [ ] Reminder issued to Lucas: replace `resume.md`; create the single Railway gateway service (`AGENT_DIR=agents/gateway`) with `CLERK_JWKS_URL` + `CLERK_ISSUER`; set `AGENTS_BASE_URL` on Vercel and `EXPO_PUBLIC_AGENTS_BASE_URL` in EAS; **delete the five old Railway services** (the savings)
