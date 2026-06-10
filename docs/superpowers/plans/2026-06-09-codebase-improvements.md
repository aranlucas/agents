# Codebase Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the CI test gap, fix per-agent tool correctness issues, extract duplicated FastAPI/ADK scaffolding into `agent-common`, dedupe config, refresh docs, and tighten UI consistency — everything from the 2026-06-09 codebase review except the agent-endpoint auth work (deferred, see bottom).

**Architecture:** Three independent tracks: (1) web/CI hygiene in `apps/web` + `.github/workflows/ci.yml`, (2) Python: shared helpers in `packages/agent-common` then per-agent migration, (3) docs/DX/styling. Tasks within a phase are ordered; phases 1, 2–4, and 5–7 are independent of each other.

**Tech Stack:** Next.js 16 + CopilotKit v2, Google ADK + ag-ui-adk (Python 3.14, uv workspace), vitest, pytest, oxlint/oxfmt, Ruff.

**Sequencing note:** Run this plan on its own branch off `main` after `feat/account-settings-connection-gate` lands — Tasks 3 and 19 touch the same registry files.

**Verification baseline (run before starting):** `pnpm check && pnpm test && uv run pytest` — all green at plan time.

---

## Context from the review

### Per-agent tool findings (drive Phase 3)

- **travel** (`agents/travel/src/travel_agent/main.py`): `set_trip_meta` accepts any strings for dates — no ISO validation, no `end >= start`, no `travelers >= 1`. `add_day` claims to "append or replace" but only appends — calling it twice for the same day produces two `## Day N` headings and breaks the canvas parser. `mark_ready_to_book` succeeds with an empty itinerary. Travel is also the only agent with no `_DEFAULT_STATE` / `on_before_agent` seeding, so the UI can read missing keys on a fresh session.
- **grocery** (`agents/grocery/src/grocery_agent/main.py`): `update_cart` / `update_pantry` accept `list[dict]` with the shape documented only in the docstring — malformed items flow straight into UI state. Otherwise the cleanest auth-gate pattern of the five — reuse it.
- **fitness** (`agents/fitness/src/fitness_agent/main.py`): best error handling (`fetch_activities` returns `ok: False` with reasons). But it returns the **full normalized batch (up to 200 activities) into model context** every call, while `summarize_activities` sits unused in the same file. Token blowup for active athletes.
- **wellness** (`agents/wellness/src/wellness_agent/main.py`): `mark_plan_ready` doesn't check that `weekly_plan` is non-empty (only the instruction asks the model to enforce this; the tool should). `meal_plan` in `_DEFAULT_STATE` is dead — nothing writes it.
- **a2ui**: fine as a showcase; no changes needed.
- **all agents**: `get_current_date` is copy-pasted 4×; state-mutating tools always return `{"ok": True}` with no failure path; the `_DEFAULT_STATE` seeding loop is copy-pasted 4×.

### ADK implementation notes (drive Phases 2 & 4)

- Two competing state-in-prompt patterns: travel uses an `InstructionProvider` (`_build_instruction` → `inject_session_state`); the others prepend via `before_model_callback`. Both work; the factory supports both. New agents should default to `before_model_callback` + `_DEFAULT_STATE` (simpler, testable).
- ~150 lines of identical scaffolding per agent: `_setup_otel`, `trace_requests` middleware, CORS, A2A runner/card/handler wiring, five in-memory services, `/health`, uvicorn block.
- `logging.basicConfig(level=DEBUG)` + litellm/google.adk DEBUG in every agent — litellm debug can log full prompts and credentials. Must be env-driven; default INFO.
- Model + fallback chain hardcoded identically 5×.
- wellness `_TempStateSessionService` relies on `RequestStateSessionService._inject` — keep it in wellness (not worth generalizing); it already has tests. Pass a custom session_service into the factory.
- fitness `throttle_web_search` global is per-process — fine while uvicorn runs one worker per container; the factory docstring calls this out.

### Styling findings (drive Phase 6)

- `globals.css` has a solid token system (`--surface`, `--ink`, per-agent accents) mapped into Tailwind's `@theme`, but the **per-agent accents are not in `@theme`** — so components write `text-[var(--travel)]` bracket-soup instead of `text-travel`.
- Status chip styling (including inline `color-mix(...)`) lives privately in `document-canvas.tsx`; `ArtifactPanel` renders status as plain text. Extract a shared `StatusChip`.
- Registry glyphs mix text glyphs and emoji (`✈` vs `🛒 💪 ☯`) — emoji render inconsistently across platforms and ignore `colorVar`. Swap to `lucide-react` icons.

---

## Phase 1 — CI & web hygiene

### Task 1: Run JS tests and the web build in CI

**Files:**

- Modify: `apps/web/src/env.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `skipValidation` to env.ts**

In `apps/web/src/env.ts`, add to the `createEnv({...})` call (sibling of `server`/`client`/`runtimeEnv`):

```ts
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
```

- [ ] **Step 2: Add CI steps**

In `.github/workflows/ci.yml`, after the `Run Python tests` step, append:

```yaml
- name: Run JS tests
  run: pnpm test

- name: Build web
  run: pnpm build
  env:
    SKIP_ENV_VALIDATION: "1"
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_Y2xlcmsuZXhhbXBsZS5jb20k
    CLERK_SECRET_KEY: sk_test_placeholder
```

- [ ] **Step 3: Verify locally**

```bash
pnpm test
SKIP_ENV_VALIDATION=1 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k CLERK_SECRET_KEY=sk_test_placeholder pnpm build
```

Expected: vitest passes for web + mobile; `next build` completes. If the build fails on a Clerk prerender error, mark the failing page `export const dynamic = "force-dynamic"` rather than weakening env handling.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/env.ts .github/workflows/ci.yml
git commit -m "ci: run JS tests and web build in CI"
```

---

### Task 2: `COPILOTKIT_DEBUG` defaults off; remove per-request token logging

**Files:**

- Modify: `apps/web/src/env.ts`
- Modify: `apps/web/src/app/api/copilotkit/route.ts`
- Test: `apps/web/src/env.test.ts`

- [ ] **Step 1: Update the failing test first**

In `apps/web/src/env.test.ts`, change line 23 (`expect(env.COPILOTKIT_DEBUG).toBe(true)`) to `false`, and add a new case:

```ts
    expect(env.COPILOTKIT_DEBUG).toBe(false);
  });

  it("enables COPILOTKIT_DEBUG only when explicitly 'true'", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "secret");
    vi.stubEnv("TRAVEL_AGENT_URL", "http://127.0.0.1:8000");
    vi.stubEnv("GROCERY_AGENT_URL", "http://127.0.0.1:8001");
    vi.stubEnv("FITNESS_AGENT_URL", "http://127.0.0.1:8002");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("COPILOTKIT_DEBUG", "true");

    const { env } = await import("./env");
    expect(env.COPILOTKIT_DEBUG).toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter web exec vitest run src/env.test.ts
```

Expected: FAIL — `COPILOTKIT_DEBUG` is currently `true` when unset.

- [ ] **Step 3: Flip the transform in env.ts**

```ts
    COPILOTKIT_DEBUG: z
      .string()
      .optional()
      .transform((v) => v === "true"),
```

- [ ] **Step 4: Remove the per-request console.log**

In `apps/web/src/app/api/copilotkit/route.ts`, delete:

```ts
console.log(
  `[copilotkit] building agents stravaTokenPresent=${Boolean(stravaToken)} krogerTokenPresent=${Boolean(krogerToken)}`,
);
```

Keep the `console.error` in the Strava catch block.

- [ ] **Step 5: Run tests, then commit**

```bash
pnpm --filter web exec vitest run src/env.test.ts
```

Expected: PASS.

```bash
git add apps/web/src/env.ts apps/web/src/env.test.ts apps/web/src/app/api/copilotkit/route.ts
git commit -m "fix(web): COPILOTKIT_DEBUG defaults off; drop per-request token log"
```

---

### Task 3: Unknown agent ids 404 instead of silently rendering travel

**Files:**

- Modify: `apps/web/src/components/chat/agents/registry.ts:101-103`
- Modify: `apps/web/src/app/console/[agent]/page.tsx`
- Test: `apps/web/src/components/chat/agents/registry.test.ts`

- [ ] **Step 1: Update the registry test**

Replace the `"falls back to travel for unknown ids"` test case:

```ts
it("returns undefined for unknown ids", () => {
  expect(getAgentConfig("nope")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter web exec vitest run src/components/chat/agents/registry.test.ts
```

Expected: FAIL — currently returns the travel config.

- [ ] **Step 3: Change the registry function return type**

```ts
export function getAgentConfig(id: string): AgentConfig | undefined {
  return isAgentId(id) ? AGENTS[id] : undefined;
}
```

- [ ] **Step 4: Make the console route 404 on bad ids**

In `apps/web/src/app/console/[agent]/page.tsx`, add `import { notFound } from "next/navigation"` and replace the narrowing logic:

```ts
const { agent: raw } = use(params);
if (!isAgentId(raw)) notFound();
const agentId: AgentId = raw;
```

Also add a guard in `Console` after `getAgentConfig`:

```ts
const config = getAgentConfig(agentId);
if (!config) notFound();
```

- [ ] **Step 5: Fix any remaining callers**

```bash
grep -rn "getAgentConfig" apps/web/src --include="*.ts*"
```

Every caller must handle `undefined`. Update tests in `registry.test.ts` that destructure the return value directly.

- [ ] **Step 6: Run and commit**

```bash
pnpm --filter web test
```

Expected: PASS.

```bash
git add apps/web/src/components/chat/agents/registry.ts apps/web/src/components/chat/agents/registry.test.ts "apps/web/src/app/console/[agent]/page.tsx"
git commit -m "fix(web): 404 unknown console agent ids instead of falling back to travel"
```

---

## Phase 2 — agent-common shared helpers

### Task 4: Env-driven logging setup

**Files:**

- Create: `packages/agent-common/src/agent_common/logging_setup.py`
- Test: `packages/agent-common/tests/test_logging_setup.py`
- Modify: all five `agents/*/src/*_agent/main.py` (logging block only)

- [ ] **Step 1: Write the failing test**

`packages/agent-common/tests/test_logging_setup.py`:

```python
import logging

from agent_common.logging_setup import setup_logging


def test_default_level_is_info(monkeypatch):
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    log = setup_logging("test-service")
    assert log.name == "test-service"
    assert logging.getLogger("litellm").level == logging.INFO


def test_log_level_env_override(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "debug")
    setup_logging("test-service")
    assert logging.getLogger("google.adk").level == logging.DEBUG


def test_invalid_level_falls_back_to_info(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "nonsense")
    setup_logging("test-service")
    assert logging.getLogger("ag_ui_adk").level == logging.INFO
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest packages/agent-common/tests/test_logging_setup.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/agent-common/src/agent_common/logging_setup.py`:

```python
"""Env-driven logging configuration shared by all agent services."""

import logging
import os

_NOISY_LOGGERS = ("google.adk", "litellm", "ag_ui_adk")


def setup_logging(service: str) -> logging.Logger:
    """Configure root + framework loggers from LOG_LEVEL (default INFO).

    DEBUG is opt-in: litellm at DEBUG can log full prompts and credentials,
    so production defaults to INFO.
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, None)
    if not isinstance(level, int):
        level = logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(level)
    return logging.getLogger(service)
```

- [ ] **Step 4: Run test** → PASS. Then replace the logging block in each of the five `main.py` files:

Delete the three-line `logging.basicConfig(...)` + `logging.getLogger(...).setLevel(...)` block and replace with:

```python
from agent_common.logging_setup import setup_logging

log = setup_logging("travel_agent")  # or grocery_agent / fitness_agent / wellness_agent / a2ui_agent
```

Add `LOG_LEVEL=DEBUG` to your local `.env` to preserve today's dev behavior.

- [ ] **Step 5: Verify + commit**

```bash
uv run pytest && pnpm lint:py
```

```bash
git add packages/agent-common agents
git commit -m "feat(agents): env-driven LOG_LEVEL via shared setup_logging (default INFO)"
```

---

### Task 5: Centralized LLM factory

**Files:**

- Create: `packages/agent-common/src/agent_common/models.py`
- Test: `packages/agent-common/tests/test_models.py`
- Modify: all five `main.py` (the `LiteLlm(...)` block in `LlmAgent`)

- [ ] **Step 1: Write the failing test**

`packages/agent-common/tests/test_models.py`:

```python
from agent_common.models import DEFAULT_FALLBACKS, DEFAULT_MODEL, create_llm


def test_defaults(monkeypatch):
    monkeypatch.delenv("AGENT_MODEL", raising=False)
    monkeypatch.delenv("AGENT_MODEL_FALLBACKS", raising=False)
    llm = create_llm()
    assert llm.model == DEFAULT_MODEL


def test_env_overrides_model(monkeypatch):
    monkeypatch.setenv("AGENT_MODEL", "mistral/mistral-large-latest")
    llm = create_llm()
    assert llm.model == "mistral/mistral-large-latest"


def test_env_overrides_fallbacks(monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_FALLBACKS", "a/b, c/d ,")
    llm = create_llm()
    # LiteLlm stores fallbacks; inspect the attribute that holds extra kwargs.
    # If LiteLlm exposes no public accessor, just assert create_llm() doesn't raise.
    assert llm is not None
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest packages/agent-common/tests/test_models.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/agent-common/src/agent_common/models.py`:

```python
"""Shared LiteLLM model factory — one env-driven model chain for all agents."""

import os

from google.adk.models.lite_llm import LiteLlm

DEFAULT_MODEL = "openrouter/poolside/laguna-m.1:free"
DEFAULT_FALLBACKS = [
    "mistral/mistral-small-latest",
    "openrouter/owl-alpha",
    "nvidia_nim/deepseek-ai/deepseek-v4-flash",
]


def create_llm() -> LiteLlm:
    model = os.getenv("AGENT_MODEL", DEFAULT_MODEL)
    raw = os.getenv("AGENT_MODEL_FALLBACKS")
    fallbacks = (
        [item.strip() for item in raw.split(",") if item.strip()]
        if raw is not None
        else DEFAULT_FALLBACKS
    )
    return LiteLlm(model=model, fallbacks=fallbacks)
```

- [ ] **Step 4: Run test** → PASS. Replace `model=LiteLlm(model=..., fallbacks=[...])` in all five `LlmAgent(...)` constructions with `model=create_llm()` and add `from agent_common.models import create_llm` to each import block.

- [ ] **Step 5: Verify + commit**

```bash
uv run pytest
```

```bash
git add packages/agent-common agents
git commit -m "refactor(agents): centralize LiteLLM model chain in agent-common (env-overridable)"
```

---

### Task 6: Shared `get_current_date` tool and default-state initializer

**Files:**

- Modify: `packages/agent-common/src/agent_common/tools.py`
- Test: `packages/agent-common/tests/test_tools.py` (append)
- Modify: `agents/{travel,grocery,fitness,wellness}/src/*_agent/main.py`

- [ ] **Step 1: Write failing tests** (append to `packages/agent-common/tests/test_tools.py`):

```python
import datetime

from agent_common.tools import get_current_date, initialize_default_state


def test_get_current_date_shape():
    result = get_current_date()
    parsed = datetime.date.fromisoformat(result["date"])
    assert result["weekday"] == parsed.strftime("%A")
    assert result["month"] == parsed.strftime("%B %Y")


def test_initialize_default_state_only_fills_missing():
    class Ctx:
        state = {"status": "ready"}

    initialize_default_state(Ctx(), {"status": "idle", "plan": ""})
    assert Ctx.state == {"status": "ready", "plan": ""}
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest packages/agent-common/tests/test_tools.py -v
```

Expected: FAIL — functions not found.

- [ ] **Step 3: Implement** (append to `packages/agent-common/src/agent_common/tools.py`):

```python
import datetime


def get_current_date() -> dict:
    """Return today's date (UTC) in ISO 8601 plus human-readable parts.

    Call whenever the agent needs today's date — scheduling a week,
    validating future dates, or anchoring a plan.
    """
    today = datetime.datetime.now(datetime.UTC).date()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


def initialize_default_state(callback_context, defaults: dict) -> None:
    """Seed missing keys in session state without overwriting existing values."""
    for key, default in defaults.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
```

- [ ] **Step 4: Migrate all four agents**

In each of travel / grocery / fitness / wellness `main.py`:

- Delete the local `get_current_date` function definition.
- Extend the `from agent_common.tools import ...` line to include `get_current_date`.
- Keep `get_current_date` in each `tools=[...]` list unchanged.
- In `on_before_agent`, replace the seeding loop body with `initialize_default_state(callback_context, _DEFAULT_STATE)` (import `initialize_default_state` from `agent_common.tools`).

- [ ] **Step 5: Verify + commit**

```bash
uv run pytest
```

```bash
git add packages/agent-common agents
git commit -m "refactor(agents): shared get_current_date tool + default-state initializer"
```

---

## Phase 3 — per-agent tool correctness

### Task 7: travel — validate `set_trip_meta` inputs

**Files:**

- Modify: `agents/travel/src/travel_agent/main.py:108-131`
- Test: `agents/travel/tests/test_travel_tools.py`

For the `ctx` fixture: if none exists, add `import types` and use `ctx = types.SimpleNamespace(state={})` at the top of each test, or create a pytest fixture in `conftest.py`:

```python
# agents/travel/tests/conftest.py (create if absent)
import types
import pytest

@pytest.fixture
def ctx():
    return types.SimpleNamespace(state={})
```

- [ ] **Step 1: Write failing tests**

```python
from travel_agent.main import set_trip_meta


def test_set_trip_meta_rejects_bad_dates(ctx):
    result = set_trip_meta(ctx, "Tokyo", "not-a-date", "2026-07-04")
    assert result["ok"] is False
    assert any("start_date" in e for e in result["errors"])
    assert "destination" not in ctx.state


def test_set_trip_meta_rejects_end_before_start(ctx):
    result = set_trip_meta(ctx, "Tokyo", "2026-07-10", "2026-07-04")
    assert result["ok"] is False
    assert any("end_date" in e for e in result["errors"])


def test_set_trip_meta_rejects_nonpositive_travelers(ctx):
    result = set_trip_meta(ctx, "Tokyo", "2026-07-01", "2026-07-04", travelers=0)
    assert result["ok"] is False


def test_set_trip_meta_happy_path(ctx):
    result = set_trip_meta(ctx, "Tokyo", "2026-07-01", "2026-07-04", travelers=2)
    assert result["ok"] is True
    assert ctx.state["destination"] == "Tokyo"
    assert ctx.state["status"] == "drafting"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/travel/tests/test_travel_tools.py -v
```

- [ ] **Step 3: Implement**

Add `import re` to travel `main.py` imports. Add before `set_trip_meta`:

```python
def _parse_iso_date(value: str) -> datetime.date | None:
    try:
        return datetime.date.fromisoformat(value)
    except (TypeError, ValueError):
        return None
```

Replace `set_trip_meta` body:

```python
def set_trip_meta(
    tool_context: ToolContext,
    destination: str,
    start_date: str,
    end_date: str,
    travelers: int = 1,
    budget_usd: int = 0,
    headline: str = "",
) -> dict:
    """Set the high-level trip card (destination, dates, party size, budget).

    Dates must be ISO YYYY-MM-DD. Returns {"ok": False, "errors": [...]} on
    invalid input — fix and retry.
    """
    errors: list[str] = []
    start = _parse_iso_date(start_date)
    end = _parse_iso_date(end_date)
    if not destination.strip():
        errors.append("destination must be non-empty")
    if start is None:
        errors.append("start_date must be ISO YYYY-MM-DD")
    if end is None:
        errors.append("end_date must be ISO YYYY-MM-DD")
    if start and end and end < start:
        errors.append("end_date must be on or after start_date")
    if travelers < 1:
        errors.append("travelers must be >= 1")
    if budget_usd < 0:
        errors.append("budget_usd must be >= 0")
    if errors:
        return {"ok": False, "errors": errors}

    tool_context.state["destination"] = destination
    tool_context.state["start_date"] = start_date
    tool_context.state["end_date"] = end_date
    tool_context.state["travelers"] = travelers
    tool_context.state["budget_usd"] = budget_usd
    tool_context.state["headline"] = headline
    tool_context.state["status"] = "drafting"
    tool_context.state.setdefault("flights", "")
    return {"ok": True}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/travel
git commit -m "fix(travel): validate set_trip_meta dates, travelers, budget"
```

---

### Task 8: travel — `add_day` replaces an existing day instead of duplicating it

**Files:**

- Modify: `agents/travel/src/travel_agent/main.py:157-169`
- Test: `agents/travel/tests/test_travel_tools.py`

- [ ] **Step 1: Write failing tests**

```python
from travel_agent.main import add_day


def test_add_day_appends_new_day(ctx):
    add_day(ctx, 1, "Arrival", "- 14:00 — Land at HND")
    add_day(ctx, 2, "Markets", "- 09:00 — Tsukiji")
    assert ctx.state["itinerary"].count("## Day 1") == 1
    assert "## Day 2: Markets" in ctx.state["itinerary"]


def test_add_day_replaces_existing_day(ctx):
    add_day(ctx, 1, "Arrival", "- 14:00 — Land at HND")
    result = add_day(ctx, 1, "Arrival v2", "- 15:00 — Land at NRT")
    body = ctx.state["itinerary"]
    assert result["replaced"] is True
    assert body.count("## Day 1") == 1
    assert "Arrival v2" in body
    assert "Land at HND" not in body


def test_add_day_replacement_preserves_other_days(ctx):
    add_day(ctx, 1, "Arrival", "- 14:00 — Land")
    add_day(ctx, 2, "Markets", "- 09:00 — Tsukiji")
    add_day(ctx, 1, "New arrival", "- 16:00 — Land late")
    body = ctx.state["itinerary"]
    assert "## Day 2: Markets" in body
    assert "Tsukiji" in body
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/travel/tests/test_travel_tools.py -k "add_day" -v
```

Expected: FAIL (duplicate `## Day 1`, no `replaced` key).

- [ ] **Step 3: Implement** (ensure `import re` is in travel `main.py` imports)

```python
def add_day(tool_context: ToolContext, day_number: int, theme: str, plan: str) -> dict:
    """Append or replace a single day in the existing itinerary.

    `plan` should be a list of `- HH:MM — activity` bullets. If `## Day N`
    already exists its whole block is replaced; otherwise the day is appended.
    """
    block = f"## Day {day_number}: {theme}\n\n{plan.strip()}"
    current = (tool_context.state.get("itinerary") or "").strip()
    day_block_re = re.compile(
        rf"^##\s*Day\s+{day_number}\s*[:\-–—].*?(?=^##\s*Day\s+\d|\Z)",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    replaced = bool(day_block_re.search(current))
    if replaced:
        updated = day_block_re.sub(block + "\n\n", current).strip()
    else:
        updated = f"{current}\n\n{block}" if current else block
    tool_context.state["itinerary"] = updated
    tool_context.state["status"] = "drafting"
    return {"ok": True, "replaced": replaced}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/travel
git commit -m "fix(travel): add_day replaces an existing day block instead of duplicating"
```

---

### Task 9: travel — default state seeding + `mark_ready_to_book` guard

**Files:**

- Modify: `agents/travel/src/travel_agent/main.py`
- Test: `agents/travel/tests/test_travel_tools.py`

- [ ] **Step 1: Write failing tests**

```python
from travel_agent.main import mark_ready_to_book


def test_mark_ready_to_book_requires_itinerary(ctx):
    result = mark_ready_to_book(ctx, "All set")
    assert result["ok"] is False
    assert ctx.state.get("status") != "ready_to_book"


def test_mark_ready_to_book_with_itinerary(ctx):
    ctx.state["itinerary"] = "## Day 1: Arrival\n\n- 14:00 — Land"
    result = mark_ready_to_book(ctx, "All set")
    assert result["ok"] is True
    assert ctx.state["status"] == "ready_to_book"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/travel/tests/test_travel_tools.py -k "mark_ready" -v
```

- [ ] **Step 3: Implement the guard**

```python
def mark_ready_to_book(tool_context: ToolContext, summary: str) -> dict:
    """Flag the trip as ready to lock in. Fails if there is no itinerary yet."""
    if not (tool_context.state.get("itinerary") or "").strip():
        return {"ok": False, "errors": ["write the itinerary before marking ready"]}
    tool_context.state["status"] = "ready_to_book"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
```

- [ ] **Step 4: Add the missing default-state seeding**

Travel is the only agent without `on_before_agent`. Add near the top of `main.py` after `AGENT_PUBLIC_URL` (add `from google.adk.agents.callback_context import CallbackContext` to imports and extend the `agent_common.tools` import with `initialize_default_state`):

```python
_DEFAULT_STATE: dict = {
    "destination": "",
    "start_date": "",
    "end_date": "",
    "travelers": 1,
    "budget_usd": 0,
    "headline": "",
    "summary": "",
    "itinerary": "",
    "flights": "",
    "status": "idle",
    "review_summary": "",
}


def on_before_agent(callback_context: CallbackContext) -> None:
    initialize_default_state(callback_context, _DEFAULT_STATE)
```

Register it on `collab_trip_agent`:

```python
collab_trip_agent = LlmAgent(
    name="collab_trip_agent",
    ...
    before_agent_callback=on_before_agent,
    ...
)
```

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/travel
git commit -m "fix(travel): seed default state; guard mark_ready_to_book on empty itinerary"
```

---

### Task 10: grocery — validate cart/pantry item shapes

**Files:**

- Modify: `agents/grocery/src/grocery_agent/main.py:128-143`
- Test: `agents/grocery/tests/test_grocery_tools.py`

- [ ] **Step 1: Write failing tests** (use the same `ctx` fixture pattern as travel):

```python
from grocery_agent.main import update_cart, update_pantry


def test_update_cart_rejects_items_missing_name(ctx):
    result = update_cart(ctx, [{"quantity": 2}])
    assert result["ok"] is False
    assert "errors" in result
    assert ctx.state.get("cart") in (None, [])


def test_update_cart_accepts_valid_items(ctx):
    items = [{"name": "Milk", "quantity": 1, "price": 3.49, "upc": "0001"}]
    result = update_cart(ctx, items)
    assert result["ok"] is True
    assert ctx.state["cart"] == items


def test_update_pantry_rejects_non_dict_items(ctx):
    result = update_pantry(ctx, ["eggs"])
    assert result["ok"] is False


def test_update_pantry_accepts_valid_items(ctx):
    items = [{"name": "Eggs", "quantity": "12"}]
    result = update_pantry(ctx, items)
    assert result["ok"] is True
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/grocery/tests/test_grocery_tools.py -v
```

- [ ] **Step 3: Implement**

Add a private helper before `update_cart`:

```python
def _item_errors(items: list, required: tuple[str, ...]) -> list[str]:
    errors = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"item {index} must be an object")
            continue
        missing = [key for key in required if not str(item.get(key, "")).strip()]
        if missing:
            errors.append(f"item {index} missing: {', '.join(missing)}")
    return errors
```

Replace `update_cart`:

```python
def update_cart(tool_context: ToolContext, items: list[dict]) -> dict:
    """Update the cart with Kroger items ready for checkout.

    Each item: {"name": str, "quantity": int, "price": float, "upc": str}.
    Returns {"ok": False, "errors": [...]} if items are malformed.
    """
    errors = _item_errors(items, required=("name", "quantity"))
    if errors:
        return {"ok": False, "errors": errors}
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}
```

Replace `update_pantry`:

```python
def update_pantry(tool_context: ToolContext, items: list[dict]) -> dict:
    """Sync pantry inventory to shared state.

    Each item: {"name": str, "quantity": str, "expires": str (optional)}.
    Returns {"ok": False, "errors": [...]} if items are malformed.
    """
    errors = _item_errors(items, required=("name",))
    if errors:
        return {"ok": False, "errors": errors}
    tool_context.state["pantry"] = items
    return {"ok": True, "count": len(items)}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/grocery
git commit -m "fix(grocery): validate cart/pantry item shapes before writing state"
```

---

### Task 11: fitness — return an activity summary instead of the full batch

**Files:**

- Modify: `agents/fitness/src/fitness_agent/main.py:222-228`
- Test: `agents/fitness/tests/test_fitness_tools.py`

`fetch_activities` currently returns up to 200 normalized activities into model context per page; `summarize_activities` (line 120 of `main.py`) is already implemented but unused by the tool.

- [ ] **Step 1: Write the failing test** (follow the existing Strava mock fixture in `test_fitness_tools.py` for the HTTP stub):

```python
async def test_fetch_activities_returns_summary_not_full_batch(ctx, mock_strava_activities):
    # mock_strava_activities: patch httpx to return a list of 30 raw activity dicts
    result = await fetch_activities(ctx)
    assert result["ok"] is True
    assert "summary" in result
    assert result["summary"]["activity_count"] == len(ctx.state["activities"])
    assert len(result["recent_activities"]) <= 20
    assert "activities" not in result  # full batch no longer dumped into model context
```

If no mock fixture exists yet, create one in `agents/fitness/tests/conftest.py` using `respx` or `httpx` mock that returns a list of 30 minimal activity dicts (`[{"id": i, "name": f"Run {i}", "sport_type": "Run", "distance": 5000} for i in range(30)]`).

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/fitness/tests/test_fitness_tools.py -v
```

- [ ] **Step 3: Change the success return in `fetch_activities`**

Replace the final `return {...}` block:

```python
    return {
        "ok": True,
        "count": len(all_activities),
        "synced_at": synced_at,
        "summary": summarize_activities(all_activities),
        "recent_activities": normalized_batch[:20],
        **({"next_page_token": page + 1} if has_more else {}),
    }
```

- [ ] **Step 4: Update the instruction**

In `_INSTRUCTION` step 2, append to the `fetch_activities` sentence:

```
fetch_activities returns a summary (total distance, hours, sport counts) plus
the 20 most recent activities; the full history is stored in state["activities"].
```

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/fitness
git commit -m "fix(fitness): fetch_activities returns summary + recent sample, not full batch"
```

---

### Task 12: wellness — `mark_plan_ready` guard + drop dead `meal_plan` key

**Files:**

- Modify: `agents/wellness/src/wellness_agent/main.py:70-76,222-226`
- Test: `agents/wellness/tests/test_wellness_state_tools.py`

- [ ] **Step 1: Write failing tests**

```python
from wellness_agent.main import mark_plan_ready


def test_mark_plan_ready_requires_weekly_plan(ctx):
    result = mark_plan_ready(ctx, "done")
    assert result["ok"] is False
    assert "errors" in result


def test_mark_plan_ready_with_plan(ctx):
    ctx.state["weekly_plan"] = "## Monday\n- Run 5k"
    result = mark_plan_ready(ctx, "done")
    assert result["ok"] is True
    assert ctx.state["status"] == "ready"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest agents/wellness/tests/test_wellness_state_tools.py -k "mark_plan_ready" -v
```

- [ ] **Step 3: Implement the guard**

```python
def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the combined weekly wellness plan as ready. Fails if no plan exists."""
    if not (tool_context.state.get("weekly_plan") or "").strip():
        return {"ok": False, "errors": ["call set_weekly_wellness_plan before marking ready"]}
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
```

- [ ] **Step 4: Remove dead `meal_plan` key**

First verify nothing in `apps/web` reads `meal_plan` from wellness state:

```bash
grep -rn '"meal_plan"\|meal_plan' apps/web/src --include="*.ts*"
```

Only grocery usages should appear (different agent). Then remove `"meal_plan": ""` from wellness `_DEFAULT_STATE`.

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/wellness
git commit -m "fix(wellness): guard mark_plan_ready; remove dead meal_plan state key"
```

---

## Phase 4 — FastAPI/ADK scaffolding factory

### Task 13: `create_agent_app` in agent-common

**Files:**

- Create: `packages/agent-common/src/agent_common/app.py`
- Test: `packages/agent-common/tests/test_app.py`

- [ ] **Step 1: Write the failing test**

`packages/agent-common/tests/test_app.py`:

```python
from a2a.types import AgentCapabilities, AgentCard
from fastapi.testclient import TestClient
from google.adk.agents import LlmAgent

from agent_common.app import agent_public_url, create_agent_app


def _card() -> AgentCard:
    return AgentCard(
        name="Test Agent",
        description="test",
        version="1.0.0",
        url="http://localhost:9999",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[],
    )


async def _extract(request, _input_data) -> dict:
    return {"user_id": "test"}


def test_create_agent_app_has_health_and_card_routes():
    agent = LlmAgent(name="test_agent", model="gemini-2.5-flash")
    app = create_agent_app(
        agent=agent,
        agent_card=_card(),
        service_name="test-agent",
        extract_state=_extract,
    )
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    card = client.get("/.well-known/agent-card.json")
    assert card.status_code == 200
    assert card.json()["name"] == "Test Agent"


def test_agent_public_url_default(monkeypatch):
    monkeypatch.delenv("AGENT_PUBLIC_URL", raising=False)
    monkeypatch.delenv("RAILWAY_PUBLIC_DOMAIN", raising=False)
    assert agent_public_url(8000) == "http://localhost:8000"


def test_agent_public_url_railway(monkeypatch):
    monkeypatch.delenv("AGENT_PUBLIC_URL", raising=False)
    monkeypatch.setenv("RAILWAY_PUBLIC_DOMAIN", "x.up.railway.app")
    assert agent_public_url(8000) == "https://x.up.railway.app"


def test_agent_public_url_explicit_env(monkeypatch):
    monkeypatch.setenv("AGENT_PUBLIC_URL", "https://custom.example.com")
    assert agent_public_url(8000) == "https://custom.example.com"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest packages/agent-common/tests/test_app.py -v
```

- [ ] **Step 3: Implement**

`packages/agent-common/src/agent_common/app.py`:

```python
"""Shared FastAPI + ADK + A2A scaffolding for agent services.

Every agent needs: an LlmAgent, an AgentCard, a state extractor, and optional
PredictStateMappings. This module owns the rest: OTEL setup, trace middleware,
CORS, A2A runner/handler wiring, the AG-UI endpoint at /agui, and /health.

Single-process assumption: module-level in-memory services and the fitness
web-search throttle (asyncio.Lock) are per-process. uvicorn must run one
worker per container — do not scale horizontally without replacing InMemory*
services with persistent equivalents.
"""

import logging
import os
import time
from collections.abc import Callable

from a2a.server.apps.jsonrpc import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.types import AgentCard
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.runners import Runner
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

from agent_common.a2a import create_a2a_agent_executor
from agent_common.session_service import SessionServiceContainer, create_session_service
from agent_common.task_store import create_task_store


def agent_public_url(default_port: int) -> str:
    """Resolve the public-facing URL for this agent service."""
    railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
    return os.getenv("AGENT_PUBLIC_URL") or (
        f"https://{railway_domain}" if railway_domain else f"http://localhost:{default_port}"
    )


def setup_otel(service_name: str) -> None:
    """Configure OTLP telemetry via ADK native setup when OTEL env vars are present."""
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", service_name),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        },
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


def create_agent_app(
    *,
    agent: LlmAgent,
    agent_card: AgentCard,
    service_name: str,
    extract_state: Callable,
    predict_state: list | None = None,
    session_service=None,
    session_timeout_seconds: int = 3600,
) -> FastAPI:
    """Build the FastAPI app hosting one agent over AG-UI (/agui) and A2A (/).

    Pass `session_service` to override the default (e.g. wellness uses a
    custom _TempStateSessionService wrapping the standard service).
    """
    setup_otel(service_name)
    tracer = trace.get_tracer(service_name)
    log = logging.getLogger(service_name)

    session_svc = session_service if session_service is not None else create_session_service()
    container = SessionServiceContainer()
    artifact_svc = InMemoryArtifactService()
    memory_svc = InMemoryMemoryService()
    credential_svc = InMemoryCredentialService()

    a2a_runner = Runner(
        app_name=agent.name,
        agent=agent,
        artifact_service=artifact_svc,
        session_service=session_svc,
        memory_service=memory_svc,
        credential_service=credential_svc,
    )

    adk_agent_kwargs: dict = dict(
        adk_agent=agent,
        session_service=session_svc,
        artifact_service=artifact_svc,
        memory_service=memory_svc,
        credential_service=credential_svc,
        session_timeout_seconds=session_timeout_seconds,
    )
    if predict_state:
        adk_agent_kwargs["predict_state"] = predict_state
    adk_agent = ADKAgent(**adk_agent_kwargs)

    app = FastAPI(title=agent_card.name)

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
                log.exception("Unhandled error in %s %s", request.method, request.url.path)
                raise
            span.set_attribute("http.response.status_code", response.status_code)
            span.set_attribute("duration_ms", round((time.perf_counter() - start) * 1000, 2))
            return response

    # TODO(deferred-security): tighten to explicit origins + verify identity headers
    # when the agent-endpoint auth work lands.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    handler = DefaultRequestHandler(
        agent_executor=create_a2a_agent_executor(a2a_runner),
        task_store=create_task_store(),
    )
    A2AFastAPIApplication(agent_card=agent_card, http_handler=handler).add_routes_to_app(app)

    add_adk_fastapi_endpoint(
        app,
        adk_agent,
        path="/agui",
        extract_state_from_request=extract_state,
    )

    @app.get("/health")
    async def health():
        return await container.check_database_connection()

    return app


def run_app(app: FastAPI, default_port: int) -> None:
    """Entry-point helper for `if __name__ == '__main__'` blocks."""
    import uvicorn

    port = int(os.getenv("PORT", str(default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)  # noqa: S104
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-common
git commit -m "feat(agent-common): create_agent_app factory for shared FastAPI/ADK scaffolding"
```

---

### Task 14: Migrate travel onto the factory

**Files:**

- Modify: `agents/travel/src/travel_agent/main.py`

- [ ] **Step 1: Replace the scaffolding**

Delete from travel `main.py`: `_setup_otel` + its call, the `tracer` module-level line, `trace_requests` middleware, CORS block, all five `_shared_*` / `_artifact_svc` / `_memory_svc` / `_credential_svc` / `_session_container` assignments, `_a2a_runner`, `adk_collab_agent`, `app = FastAPI(...)`, the A2A handler block, `add_adk_fastapi_endpoint(...)`, `/health`, the `__main__` block.

Add to imports: `from agent_common.app import agent_public_url, create_agent_app, run_app`

Keep `AGENT_PUBLIC_URL` as a module-level assignment (must exist before `_a2a_agent_card()` uses it):

```python
AGENT_PUBLIC_URL = agent_public_url(8000)
```

Replace everything after `COLLAB_PREDICT_STATE` with:

```python
app = create_agent_app(
    agent=collab_trip_agent,
    agent_card=_a2a_agent_card(),
    service_name="travel-agent",
    extract_state=extract_travel_identity_state,
    predict_state=COLLAB_PREDICT_STATE,
)

if __name__ == "__main__":
    run_app(app, default_port=8000)
```

- [ ] **Step 2: Verify**

```bash
uv run python -m compileall -q agents/travel
uv run pytest agents/travel -v
curl http://localhost:8000/health          # after pnpm dev:agents
curl http://localhost:8000/.well-known/agent-card.json
```

- [ ] **Step 3: Commit**

```bash
git add agents/travel
git commit -m "refactor(travel): adopt create_agent_app factory"
```

---

### Task 15: Migrate grocery and fitness onto the factory

**Files:**

- Modify: `agents/grocery/src/grocery_agent/main.py`
- Modify: `agents/fitness/src/fitness_agent/main.py`

- [ ] **Step 1: Grocery** — same deletions as Task 14. Add `from agent_common.app import agent_public_url, create_agent_app, run_app`. Bottom of file:

```python
AGENT_PUBLIC_URL = agent_public_url(8001)

app = create_agent_app(
    agent=grocery_agent,
    agent_card=_a2a_agent_card(),
    service_name="grocery-agent",
    extract_state=extract_kroger_auth_state,
    predict_state=GROCERY_PREDICT_STATE,
)

if __name__ == "__main__":
    run_app(app, default_port=8001)
```

- [ ] **Step 2: Fitness** — same pattern at port 8002:

```python
AGENT_PUBLIC_URL = agent_public_url(8002)

app = create_agent_app(
    agent=fitness_agent,
    agent_card=_a2a_agent_card(),
    service_name="fitness-agent",
    extract_state=extract_strava_auth_state,
    predict_state=FITNESS_PREDICT_STATE,
)

if __name__ == "__main__":
    run_app(app, default_port=8002)
```

- [ ] **Step 3: Verify + commit**

```bash
uv run python -m compileall -q agents && uv run pytest agents/grocery agents/fitness -v
```

```bash
git add agents/grocery agents/fitness
git commit -m "refactor(grocery,fitness): adopt create_agent_app factory"
```

---

### Task 16: Migrate wellness and a2ui onto the factory

**Files:**

- Modify: `agents/wellness/src/wellness_agent/main.py`
- Modify: `agents/a2ui/src/a2ui_agent/main.py`

- [ ] **Step 1: Wellness** — keep `_TempStateSessionService`; pass it via `session_service`:

```python
AGENT_PUBLIC_URL = agent_public_url(8003)

app = create_agent_app(
    agent=wellness_agent,
    agent_card=_a2a_agent_card(),
    service_name="wellness-agent",
    extract_state=extract_wellness_state,
    predict_state=WELLNESS_PREDICT_STATE,
    session_service=_TempStateSessionService(create_session_service()),
)

if __name__ == "__main__":
    run_app(app, default_port=8003)
```

- [ ] **Step 2: A2UI** — no predict_state:

```python
AGENT_PUBLIC_URL = agent_public_url(8004)

app = create_agent_app(
    agent=a2ui_agent,
    agent_card=_a2a_agent_card(),
    service_name="a2ui-agent",
    extract_state=extract_demo_state,
)

if __name__ == "__main__":
    run_app(app, default_port=8004)
```

- [ ] **Step 3: Verify + commit**

```bash
uv run pytest && uv run python -m compileall -q agents packages
```

Exercise the wellness A2A path specifically: `uv run pytest agents/wellness/tests/test_a2a.py -v` (covers the temp-state bridge).

```bash
git add agents/wellness agents/a2ui
git commit -m "refactor(wellness,a2ui): adopt create_agent_app factory"
```

---

## Phase 5 — config dedup

### Task 17: Derive the runtime agent map from one typed URL table

**Files:**

- Modify: `apps/web/src/app/api/copilotkit/route.ts:13-37`

- [ ] **Step 1: Replace the five hand-written HttpAgent blocks**

```ts
import type { AgentId } from "@/components/chat/agents/registry";

const AGENT_URLS: Record<AgentId, string> = {
  travel: env.TRAVEL_AGENT_URL,
  grocery: env.GROCERY_AGENT_URL,
  fitness: env.FITNESS_AGENT_URL,
  wellness: env.WELLNESS_AGENT_URL,
  a2ui: env.A2UI_AGENT_URL,
};

const runtime = new CopilotSseRuntime({
  agents: Object.fromEntries(
    Object.entries(AGENT_URLS).map(([id, url]) => [
      id,
      new HttpAgent({ url: `${url}/agui`, debug: env.COPILOTKIT_DEBUG }),
    ]),
  ),
  a2ui: { injectA2UITool: true, agents: ["a2ui"] },
  debug: env.COPILOTKIT_DEBUG,
});
```

`Record<AgentId, string>` means adding an agent to the registry without adding its URL here is now a compile error.

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter web test && pnpm lint
```

```bash
git add apps/web/src/app/api/copilotkit/route.ts
git commit -m "refactor(web): derive copilotkit agent map from a typed URL table"
```

---

### Task 18: docker-compose anchors + per-agent SQLite files

**Files:**

- Modify: `docker-compose.yml`

- [ ] **Step 1: Rewrite with a shared anchor**

```yaml
x-agent-base: &agent-base
  build:
    context: .
    dockerfile: Dockerfile.agents
  volumes:
    - adk-session-data:/data

services:
  travel:
    <<: *agent-base
    ports: ["8000:8000"]
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
      - path: ./agents/travel/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: travel-agent
      AGENT_DIR: agents/travel
      AGENT_MODULE: travel_agent.main
      PORT: 8000
      ADK_SESSION_DB_PATH: /data/travel.sqlite
      AGENT_PUBLIC_URL: http://travel:8000

  grocery:
    <<: *agent-base
    ports: ["8001:8001"]
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
      - path: ./agents/grocery/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: grocery-agent
      AGENT_DIR: agents/grocery
      AGENT_MODULE: grocery_agent.main
      PORT: 8001
      ADK_SESSION_DB_PATH: /data/grocery.sqlite
      AGENT_PUBLIC_URL: http://grocery:8001

  fitness:
    <<: *agent-base
    ports: ["8002:8002"]
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
      - path: ./agents/fitness/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: fitness-agent
      AGENT_DIR: agents/fitness
      AGENT_MODULE: fitness_agent.main
      PORT: 8002
      ADK_SESSION_DB_PATH: /data/fitness.sqlite
      AGENT_PUBLIC_URL: http://fitness:8002

  wellness:
    <<: *agent-base
    ports: ["8003:8003"]
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
      - path: ./agents/wellness/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: wellness-agent
      AGENT_DIR: agents/wellness
      AGENT_MODULE: wellness_agent.main
      PORT: 8003
      ADK_SESSION_DB_PATH: /data/wellness.sqlite
      AGENT_PUBLIC_URL: http://wellness:8003
      GROCERY_AGENT_A2A_URL: http://grocery:8001/
      FITNESS_AGENT_A2A_URL: http://fitness:8002/

  a2ui:
    <<: *agent-base
    ports: ["8004:8004"]
    env_file:
      - path: ./.env
        required: false
      - path: ./.env.local
        required: false
      - path: ./agents/a2ui/.env
        required: false
    environment:
      OTEL_SERVICE_NAME: a2ui-agent
      AGENT_DIR: agents/a2ui
      AGENT_MODULE: a2ui_agent.main
      PORT: 8004
      ADK_SESSION_DB_PATH: /data/a2ui.sqlite
      AGENT_PUBLIC_URL: http://a2ui:8004

volumes:
  adk-session-data:
```

Note: per-agent SQLite files end the five-writers-one-file contention. Existing local sessions will reset — expected.

- [ ] **Step 2: Verify + commit**

```bash
docker compose config >/dev/null
pnpm dev:agents
# after containers start:
curl http://localhost:8000/health
curl http://localhost:8001/health
```

```bash
git add docker-compose.yml
git commit -m "chore(compose): shared agent anchor + per-agent sqlite session files"
```

---

## Phase 6 — UI consistency

### Task 19: Agent accents in `@theme`, lucide icons, shared `StatusChip`

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Modify: `apps/web/src/components/chat/AgentSelector.tsx`
- Create: `apps/web/src/components/ui/status-chip.tsx`
- Modify: `apps/web/src/components/document-canvas.tsx`
- Modify: `apps/web/src/components/chat/ArtifactPanel.tsx`

- [ ] **Step 1: Register agent accents in `@theme`**

Append inside the existing `@theme` block in `globals.css`:

```css
--color-travel: var(--travel);
--color-travel-soft: var(--travel-soft);
--color-grocery: var(--grocery);
--color-grocery-soft: var(--grocery-soft);
--color-fitness: var(--fitness);
--color-fitness-soft: var(--fitness-soft);
--color-wellness: var(--wellness);
--color-wellness-soft: var(--wellness-soft);
--color-a2ui: var(--a2ui);
--color-a2ui-soft: var(--a2ui-soft);
```

This makes `text-travel`, `bg-grocery-soft`, etc. available as Tailwind utilities. Do **not** mass-convert existing `text-[var(--travel)]` usages — new code uses utilities; conversion is opportunistic.

- [ ] **Step 2: Swap glyphs for lucide icons**

In `registry.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Dumbbell, LayoutGrid, Leaf, Plane, ShoppingCart } from "lucide-react";

export type AgentConfig = {
  id: AgentId;
  label: string;
  icon: LucideIcon; // replaces glyph: string
  colorVar: string;
  placeholder: string;
  welcome?: string;
  artifact?: ArtifactSource;
  requires?: ProviderId[];
};
```

Per agent — travel: `Plane`, grocery: `ShoppingCart`, fitness: `Dumbbell`, wellness: `Leaf`, a2ui: `LayoutGrid`.

Update `AgentSelector.tsx` line 15:

```tsx
<cfg.icon aria-hidden className="size-4" style={{ color: `var(${cfg.colorVar})` }} />
```

Check for any other `glyph` consumers:

```bash
grep -rn "\.glyph\b" apps/web/src apps/mobile/src --include="*.ts*"
```

Update each one found.

- [ ] **Step 3: Extract `StatusChip`**

`apps/web/src/components/ui/status-chip.tsx` — copy the `STATUS` map verbatim from `document-canvas.tsx` lines 30–61 (all entries: `idle`, `drafting`, `planning`, `syncing`, `ready`, `ready_to_book`, `booked`):

```tsx
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; dotClass: string; chipClass: string }> = {
  idle: {
    label: "Idle",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-mute)] bg-[var(--bg-soft)]",
  },
  drafting: {
    label: "Drafting",
    dotClass: "bg-[var(--accent)]",
    chipClass:
      "text-[var(--accent)] bg-[var(--accent-soft)] dark:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]",
  },
  // ... copy remaining entries from document-canvas.tsx verbatim
};

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? {
    label: status,
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-mute)] bg-[var(--bg-soft)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.chipClass,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dotClass)} />
      {s.label}
    </span>
  );
}
```

In `document-canvas.tsx`: delete the private `STATUS` map and the inline chip markup; replace with `import { StatusChip } from "@/components/ui/status-chip"` and `<StatusChip status={...} />`.

In `ArtifactPanel.tsx` line 34, replace the plain-text status render with:

```tsx
import { StatusChip } from "@/components/ui/status-chip";
// ...
<ArtifactDescription>
  v{view.version} · <StatusChip status={view.status} />
</ArtifactDescription>;
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter web test && pnpm check
pnpm dev:web  # smoke: /console/travel — icons + status chip render correctly
```

```bash
git add apps/web/src
git commit -m "feat(web): lucide agent icons, @theme agent accents, shared StatusChip"
```

---

### Task 20: Itinerary-format regression tests

**Files:**

- Modify: `apps/web/src/components/document-canvas.tsx` (export `parseItinerary`)
- Create: `apps/web/src/components/document-canvas.test.ts`

The travel instruction warns "drift breaks rendering" but nothing tests the contract between agent output and the canvas parser. These tests lock in the format — if they fail after agent changes, the format drifted.

- [ ] **Step 1: Export the parser**

In `document-canvas.tsx`, change:

```ts
function parseItinerary(
```

to:

```ts
export function parseItinerary(
```

- [ ] **Step 2: Write the tests**

`apps/web/src/components/document-canvas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseItinerary } from "./document-canvas";

describe("parseItinerary", () => {
  it("parses the canonical agent format", () => {
    const md =
      "## Day 1: Arrival\n\n- 14:00 — Land at HND\n- 18:00 — Ramen\n\n## Day 2: Markets\n\n- 09:00 — Tsukiji";
    const { days } = parseItinerary(md);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ day: 1, theme: "Arrival" });
    expect(days[0].activities).toEqual(["14:00 — Land at HND", "18:00 — Ramen"]);
    expect(days[1]).toMatchObject({ day: 2, theme: "Markets" });
  });

  it("tolerates dash variants in the day heading", () => {
    for (const sep of [":", "-", "–", "—"]) {
      const { days } = parseItinerary(`## Day 3 ${sep} Onsen\n- 10:00 — Soak`);
      expect(days[0]).toMatchObject({ day: 3, theme: "Onsen" });
    }
  });

  it("keeps preamble text out of the day list", () => {
    const { days, trailing } = parseItinerary(
      "A cozy week in Tokyo.\n\n## Day 1: Arrival\n- 14:00 — Land",
    );
    expect(trailing).toBe("A cozy week in Tokyo.");
    expect(days).toHaveLength(1);
  });

  it("returns empty for blank input", () => {
    expect(parseItinerary("  ")).toEqual({ days: [], trailing: "" });
  });

  it("handles single-day itinerary", () => {
    const { days } = parseItinerary("## Day 1: Rest\n\n- All day — relax");
    expect(days).toHaveLength(1);
    expect(days[0].activities).toEqual(["All day — relax"]);
  });
});
```

- [ ] **Step 3: Run**

```bash
pnpm --filter web exec vitest run src/components/document-canvas.test.ts
```

Expected: all PASS immediately (these are regression locks, not TDD). If any fail, the parser has a real bug — investigate before changing the test.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/document-canvas.tsx apps/web/src/components/document-canvas.test.ts
git commit -m "test(web): lock the itinerary markdown contract that parseItinerary depends on"
```

---

## Phase 7 — docs & DX

### Task 21: Refresh AGENTS.md

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Update the stale sections**

Replace the `## Structure` tree:

```markdown
## Structure

\`\`\`
apps/
web/ Next.js 16 + CopilotKit AG-UI — /console/<agent> workspace (travel, grocery, fitness, wellness, a2ui)
mobile/ Expo Router (iOS/Android) — per-agent screens via @ag-ui/client
agents/
travel/ Trip planning via trvl MCP (port 8000)
grocery/ Grocery/meal planning via Kroger MCP — requires Kroger OAuth (8001)
fitness/ Training plans from Strava history + web search — requires Strava OAuth (8002)
wellness/ Orchestrator: delegates to grocery + fitness over A2A — requires both (8003)
a2ui/ A2UI generative-UI showcase (8004)
packages/
agent-common/ Shared Python: FastAPI app factory (create_agent_app), session service,
A2A helpers, tools (get_current_date, initialize_default_state),
logging setup (setup_logging), LLM factory (create_llm)
types/ Shared TypeScript types (TripState, GroceryState, Preferences, ArtifactKind)
\`\`\`
```

Update auth section: protected routes are `/console/*`; old `/travel`,`/grocery` etc. redirect to `/console/<agent>`. Connection gating reads Clerk `externalAccounts` client-side; per-agent requirements live in the `requires` field in `apps/web/src/components/chat/agents/registry.ts`.

Update the local dev ports sentence: "Travel agent on :8000. Grocery on :8001. Fitness on :8002. Wellness on :8003. A2UI on :8004."

Replace `## Adding a new agent`:

```markdown
## Adding a new agent

1. `mkdir agents/<name>`; copy `agents/a2ui/` as the minimal template
2. `agents/<name>/pyproject.toml` — set `name = "<name>-agent"`
3. Root `pyproject.toml`: add to `[tool.uv.workspace] members`, `pytest.ini_options.pythonpath`, and `tool.coverage.run.source`
4. Implement `agents/<name>/src/<name>_agent/main.py`:
   - Tools + `_DEFAULT_STATE` + instruction + `LlmAgent(model=create_llm(), ...)`
   - Wire with `create_agent_app(...)` from `agent_common.app`
5. Add `agents/<name>/railway.json` pointing at the root `Dockerfile.agents`
6. Add a service to `docker-compose.yml` (copy an existing block; bump port and DB file)
7. **Web:** add `<NAME>_AGENT_URL` to `apps/web/src/env.ts`; add to `AGENT_URLS` in `route.ts`; add an entry to `AGENTS` and `AGENT_ORDER` in `registry.ts` (set `requires` if it needs OAuth)
8. **Mobile:** add a screen at `apps/mobile/src/app/<name>.tsx`
9. **Types:** add state types to `packages/types/src/index.ts`
```

- [ ] **Step 2: Format check + commit**

```bash
pnpm fmt:check
git add AGENTS.md
git commit -m "docs: refresh AGENTS.md for five agents, console routes, factory pattern"
```

---

### Task 22: Pre-push hook running `pnpm check`

**Files:**

- Create: `.githooks/pre-push`
- Modify: `package.json` (root, add `prepare` script)

- [ ] **Step 1: Create the hook**

```bash
mkdir -p .githooks
```

`.githooks/pre-push`:

```sh
#!/bin/sh
# Mirror CI's lint/format gate before pushing. Bypass with --no-verify.
pnpm check
```

```bash
chmod +x .githooks/pre-push
```

- [ ] **Step 2: Wire via `prepare`**

In root `package.json`, add to `scripts`:

```json
    "prepare": "git config core.hooksPath .githooks",
```

- [ ] **Step 3: Install + verify**

```bash
pnpm install  # triggers prepare, configures hooksPath
git push --dry-run 2>&1 | grep -i "check\|lint\|format"
```

Expected: `pnpm check` runs before the push.

- [ ] **Step 4: Commit**

```bash
git add .githooks/pre-push package.json
git commit -m "chore: pre-push hook running pnpm check"
```

---

## Final verification

- [ ] `pnpm check && pnpm test && uv run pytest` — all green
- [ ] `pnpm dev` — all five containers up; smoke `/console/travel` (itinerary streams), `/console/grocery` (connect gate shows when Kroger disconnected)
- [ ] CI green on the PR (now includes JS tests + build)

---

## Deferred — do not implement without Lucas's go-ahead

1. **Agent endpoint authentication** (explicitly deferred 2026-06-09): agents trust `x-clerk-user-id` / token headers with `allow_origins=["*"]` and no endpoint auth. Fix = verify Clerk JWTs (JWKS, ~20 lines with `pyjwt`) or a shared gateway secret in `create_agent_app`, plus explicit CORS origins. The factory has a `TODO(deferred-security)` marker — one landing spot.
2. **Pydantic state schemas → generated TS types**: validated in `shared_after_tool_callback`; `packages/types` generated from them. Needs its own design first.
3. **Nightly LLM-judge eval harness** for instruction regressions (itinerary format, auth-gate compliance). Task 20 covers the cheap half.
4. **Mass conversion of `text-[var(--x)]` utilities** to the new `@theme` tokens — opportunistic, per-file as components get touched.
