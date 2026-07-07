# Oral-Boards BaseAgent Orchestrator (Phases 1-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Workflow+shim oral-boards variant with a custom `BaseAgent` orchestrator, consolidate to a single `/oralboards` surface, assign models by pedagogical tier, and deepen exam-mode coaching (evaluator grounding, bounded probe, contrastive feedback).

**Architecture:** A custom `OralBoardsOrchestrator(BaseAgent)` routes each invocation to exactly one phase sub-agent (`case_builder` / `questioner` / `evaluator` / `scorer`) based on `state.status`, chaining evaluator→scorer in the same turn when `interview_complete` is set. Real `sub_agents` means `ag-ui-adk`'s per-run copy and `AGUIToolset` replacement work with zero shim. The turn-based backbone stays: the web workspace sets `status` (`"questioning"` on Begin, `"feedback"` on answer submit) and each invocation ends its turn after one phase.

**Tech Stack:** Python 3.14, google-adk 2.3.0, ag-ui-adk 0.7.0, LiteLLM models, FastAPI gateway, Next.js 16 web app, pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-oralboards-tutor-orchestrator-design.md` (this plan covers spec phases 1-3; phases 4-6 — study sheet, adaptive difficulty, study mode — get their own plans later).

## Global Constraints

- Turn-based backbone only: each invocation runs one phase and ends the turn. Do NOT reintroduce the blocking `ask_question` HITL tool on any phase agent.
- `build_telegram_agent` and `build_eval_agent` (and `instructions.md`, which they consume) are retained — only the web monolith path (`build_agent`) is deleted.
- The orchestrator's `name` must be `"oralboards_agent"` — it becomes the ADK `App` name (session storage key) and keeps continuity with existing `/oralboards` sessions.
- Keep on every phase LlmAgent: `include_contents="none"` (questioner/case_builder), `DEFAULT_RETRY_CONFIG`, `on_model_error_callback`, `strip_thinking_before_model`, `state_schema=OralBoardsState`, `before_agent_callback=make_state_initializer(OralBoardsState)` (all already in `_AGENT_DEFAULTS`).
- Scoring stays independent 1-3 per skillset; never introduce /100, /5, or weighted composites in any prompt text you touch.
- Python: run tests with `uv run pytest <path> -q`. Lint with `pnpm lint:py`. JS/TS: `pnpm --filter web test`, `pnpm --filter @agents/types build` not required (types are consumed from source), full check `pnpm check`.
- Commit after every task with the message given in the task's final step.

---

### Task 1: Extract phase builders into `phases.py`

The four phase LlmAgents and their prompt constants currently live in `workflow_agent.py` next to the Workflow shim. Move them to a new `phases.py` so the orchestrator (Task 2) can import them and the shim file can be deleted wholesale (Task 4). Pure move + two renames; no behavior change.

**Files:**

- Create: `agents/oralboards/src/oralboards_agent/phases.py`
- Modify: `agents/oralboards/src/oralboards_agent/workflow_agent.py`

**Interfaces:**

- Consumes: `OralBoardsState`, tool functions re-exported by `agents/oralboards/src/oralboards_agent/agent.py` (`append_exchange`, `search_docs`, `set_case`, `set_loading_step`, `set_phase`, `set_score_card`).
- Produces (Task 2/4/6/7/8/9 rely on these exact names in `phases.py`):
  - `build_case_builder() -> LlmAgent`
  - `build_questioner() -> LlmAgent`
  - `build_evaluator() -> LlmAgent` (renamed from `_build_evaluator`)
  - `build_scorer() -> LlmAgent` (renamed from `_build_scorer`)
  - `complete_examination(tool_context: ToolContext) -> dict[str, object]`
  - module constants `_AGENT_DEFAULTS`, `_CANVAS_HINT`, `_SOURCE_RULES`, `_BLUEPRINT`, `_LOADING_STEPS`, `_STATE_INSTRUCTION`

- [ ] **Step 1: Create `phases.py` with the moved code**

Cut from `workflow_agent.py` (current line ranges): `_STATE_INSTRUCTION` (116-118), `_AGENT_DEFAULTS` (120-128), `_CANVAS_HINT` (130-133), `_SOURCE_RULES` (135-150), `_BLUEPRINT` (152-175), `_LOADING_STEPS` (177-187), `complete_examination` (190-197), `build_case_builder` (227-258), `build_questioner` (261-291), `_build_evaluator` (294-334), `_build_scorer` (337-362). Paste them verbatim into `phases.py` with this header, renaming `_build_evaluator` → `build_evaluator` and `_build_scorer` → `build_scorer`:

```python
"""Phase sub-agents for the oral-boards examiner.

Each phase is a small, single-purpose LlmAgent. Deterministic routing between
them lives in orchestrator.py; nothing here knows about the routing.
"""

from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool, ToolContext

from .agent import (
    OralBoardsState,
    append_exchange,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)

# ... the eleven moved definitions go here, in the same order they had in
# workflow_agent.py, with the two renames applied ...
```

- [ ] **Step 2: Re-point `workflow_agent.py` at the moved code**

Delete the moved definitions from `workflow_agent.py` and replace its now-dangling imports with re-imports so the existing tests and `build_workflow_agent` stay green until Task 4 deletes the file:

```python
from .phases import (
    _AGENT_DEFAULTS,  # noqa: F401 — re-exported for tests until Task 4
    build_case_builder,
    build_evaluator as _build_evaluator,
    build_questioner,
    build_scorer as _build_scorer,
    complete_examination,
)
```

Remove the imports at the top of `workflow_agent.py` that only the moved code used (`make_state_initializer`, `make_state_instruction`, `strip_thinking_before_model`, `DEFAULT_RETRY_CONFIG`, `on_model_error_callback`, `LlmAgent`, `LiteLlm`, `FunctionTool`, and the `.agent` tool imports) — keep `ToolContext` (the routers use it), `Workflow`/`FunctionNode`/`START`, and the pydantic imports for the shim.

- [ ] **Step 3: Verify existing tests still pass**

Run: `uv run pytest agents/oralboards -q`
Expected: all tests pass (test_workflow_hitl.py exercises the builders through `workflow_agent.*` names).

- [ ] **Step 4: Lint**

Run: `pnpm lint:py`
Expected: clean (Ruff will catch any unused import left behind).

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/phases.py agents/oralboards/src/oralboards_agent/workflow_agent.py
git commit -m "refactor(oralboards): extract phase builders into phases.py"
```

---

### Task 2: `orchestrator.py` — route function + `OralBoardsOrchestrator`

**Files:**

- Create: `agents/oralboards/src/oralboards_agent/orchestrator.py`
- Test: `agents/oralboards/tests/test_orchestrator.py`

**Interfaces:**

- Consumes: `build_case_builder`, `build_questioner`, `build_evaluator`, `build_scorer` from `phases.py` (Task 1).
- Produces (Task 3 relies on): `build_orchestrator_agent() -> OralBoardsOrchestrator`; `route_phase(state: Mapping[str, Any]) -> str` returning one of `"case_builder" | "questioner" | "evaluator" | "scorer"`.

- [ ] **Step 1: Write the failing tests**

Create `agents/oralboards/tests/test_orchestrator.py`:

```python
"""Routing + delegation tests for the oral-boards BaseAgent orchestrator."""

from types import SimpleNamespace

import pytest
from google.adk.agents import BaseAgent
from oralboards_agent.orchestrator import (
    OralBoardsOrchestrator,
    build_orchestrator_agent,
    route_phase,
)


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ({}, "case_builder"),
        ({"status": "idle"}, "case_builder"),
        ({"status": "questioning"}, "case_builder"),  # no case yet
        ({"status": "presenting", "case": "c"}, "questioner"),
        ({"status": "questioning", "case": "c"}, "questioner"),
        ({"status": "feedback", "case": "c"}, "evaluator"),
        ({"status": "complete", "case": "c"}, "scorer"),
        ({"status": "garbage", "case": "c"}, "questioner"),  # default edge
    ],
)
def test_route_phase(state: dict, expected: str) -> None:
    assert route_phase(state) == expected


class _StubPhase(BaseAgent):
    """Bypasses BaseAgent.run_async plumbing so units test only delegation."""

    async def run_async(self, ctx):  # noqa: ANN001 — SimpleNamespace in tests
        ctx.calls.append(self.name)
        yield SimpleNamespace(author=self.name)


class _CompletingEvaluator(BaseAgent):
    async def run_async(self, ctx):  # noqa: ANN001
        ctx.calls.append(self.name)
        ctx.session.state["interview_complete"] = True
        yield SimpleNamespace(author=self.name)


def _ctx(state: dict) -> SimpleNamespace:
    return SimpleNamespace(
        session=SimpleNamespace(state=state),
        should_pause_invocation=lambda event: False,
        calls=[],
    )


def _orchestrator(evaluator: BaseAgent | None = None) -> OralBoardsOrchestrator:
    return OralBoardsOrchestrator(
        name="oralboards_agent",
        sub_agents=[
            _StubPhase(name="case_builder"),
            _StubPhase(name="questioner"),
            evaluator or _StubPhase(name="evaluator"),
            _StubPhase(name="scorer"),
        ],
    )


async def _drain(orch: OralBoardsOrchestrator, ctx: SimpleNamespace) -> list:
    return [event async for event in orch._run_async_impl(ctx)]


@pytest.mark.asyncio
async def test_runs_exactly_one_phase_per_invocation() -> None:
    ctx = _ctx({"status": "questioning", "case": "c"})
    await _drain(_orchestrator(), ctx)
    assert ctx.calls == ["questioner"]


@pytest.mark.asyncio
async def test_evaluator_chains_to_scorer_when_interview_complete() -> None:
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(_orchestrator(evaluator=_CompletingEvaluator(name="evaluator")), ctx)
    assert ctx.calls == ["evaluator", "scorer"]


@pytest.mark.asyncio
async def test_evaluator_without_completion_does_not_chain() -> None:
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(_orchestrator(), ctx)
    assert ctx.calls == ["evaluator"]


def test_build_orchestrator_exposes_sub_agents_for_agui() -> None:
    orch = build_orchestrator_agent()
    assert orch.name == "oralboards_agent"
    assert [agent.name for agent in orch.sub_agents] == [
        "case_builder",
        "questioner",
        "evaluator",
        "scorer",
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest agents/oralboards/tests/test_orchestrator.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'oralboards_agent.orchestrator'` (collection error).

- [ ] **Step 3: Implement `orchestrator.py`**

```python
"""Deterministic phase orchestrator for the oral-boards examiner.

Custom BaseAgent instead of ADK Workflow: ag-ui-adk's per-run agent-tree copy
and AGUIToolset replacement traverse ``sub_agents`` only (ag-ui #2036, closed
NOT_PLANNED), so a Workflow graph needs a private-API shim. A BaseAgent with
real ``sub_agents`` is the shape both libraries support natively.
"""

from collections.abc import AsyncGenerator, Mapping
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events.event import Event
from google.adk.utils.context_utils import Aclosing

from .phases import (
    build_case_builder,
    build_evaluator,
    build_questioner,
    build_scorer,
)


def route_phase(state: Mapping[str, Any]) -> str:
    """Pick the phase for this invocation from persisted exam state."""
    status = state.get("status", "idle")
    if status == "feedback":
        return "evaluator"
    if status == "complete":
        return "scorer"
    if status == "idle" or not state.get("case"):
        return "case_builder"
    return "questioner"


class OralBoardsOrchestrator(BaseAgent):
    """Runs exactly one phase per invocation, chosen by ``route_phase``.

    The evaluator chains into the scorer in the same turn when it has called
    ``complete_examination`` (which sets ``interview_complete``).
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        nodes = {agent.name: agent for agent in self.sub_agents}
        node = nodes[route_phase(ctx.session.state)]

        paused = False
        async with Aclosing(node.run_async(ctx)) as agen:
            async for event in agen:
                yield event
                if ctx.should_pause_invocation(event):
                    paused = True
        if paused:
            return

        if node.name == "evaluator" and ctx.session.state.get("interview_complete"):
            async with Aclosing(nodes["scorer"].run_async(ctx)) as agen:
                async for event in agen:
                    yield event


def build_orchestrator_agent() -> OralBoardsOrchestrator:
    """Fresh orchestrator with the four phase sub-agents."""
    return OralBoardsOrchestrator(
        name="oralboards_agent",
        description="Pediatric dentistry oral-board practice (phase-routed).",
        sub_agents=[
            build_case_builder(),
            build_questioner(),
            build_evaluator(),
            build_scorer(),
        ],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest agents/oralboards/tests/test_orchestrator.py -q`
Expected: 12 passed (8 parametrized route cases + 3 delegation tests + 1 builder test).

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/orchestrator.py agents/oralboards/tests/test_orchestrator.py
git commit -m "feat(oralboards): BaseAgent orchestrator with deterministic phase routing"
```

---

### Task 3: Mount the orchestrator at `/oralboards`, unmount `/oralboards-v2`

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/main.py:15,35`
- Modify: `agents/gateway/src/gateway/main.py:29-30,156-157`
- Delete: `agents/oralboards/src/oralboards_agent/workflow_main.py`

**Interfaces:**

- Consumes: `build_orchestrator_agent` (Task 2).
- Produces: gateway serves the orchestrator at `/oralboards/agui` + `/oralboards/health`; `/oralboards-v2/*` no longer exists.

- [ ] **Step 1: Swap the agent in `main.py`**

In `agents/oralboards/src/oralboards_agent/main.py` replace line 15 and line 35:

```python
# line 15: was `from .agent import build_agent`
from .orchestrator import build_orchestrator_agent
```

```python
# line 35: was `_oralboards_agent = build_agent()`
_oralboards_agent = build_orchestrator_agent()
```

`ORALBOARDS_PREDICT_STATE` stays as-is — it is identical to the v2 mapping list (same four `streaming_state_mapping` entries), so token-level streaming of `case` / `score_card` / `active_feedback` / `active_ideal_response` keeps working.

- [ ] **Step 2: Remove the v2 mount from the gateway**

In `agents/gateway/src/gateway/main.py` delete line 30 (`from oralboards_agent.workflow_main import register as register_oralboards_v2`) and line 157 (`register_oralboards_v2,`).

- [ ] **Step 3: Delete `workflow_main.py`**

```bash
git rm agents/oralboards/src/oralboards_agent/workflow_main.py
```

- [ ] **Step 4: Run the backend suites**

Run: `uv run pytest agents/gateway agents/shared agents/oralboards -q`
Expected: all pass. `test_gateway.py::test_mounts_every_agent` asserts `/oralboards/agui` and `/oralboards/health` are mounted (it never asserted v2); `test_agent_imports.py` imports `oralboards_agent.main`, which now pulls in the orchestrator.

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/main.py agents/gateway/src/gateway/main.py
git commit -m "feat(oralboards): serve BaseAgent orchestrator at /oralboards, drop v2 mount"
```

---

### Task 4: Delete the Workflow shim and the web-monolith agent path

**Files:**

- Delete: `agents/oralboards/src/oralboards_agent/workflow_agent.py`
- Delete: `agents/oralboards/tests/test_workflow_hitl.py`
- Modify: `agents/oralboards/src/oralboards_agent/agent.py:56-85`
- Modify: `agents/oralboards/tests/test_orchestrator.py` (port the two still-relevant contract assertions)

**Interfaces:**

- Consumes: nothing new.
- Produces: `agent.py` keeps exporting `OralBoardsState`, the tool re-imports, `build_telegram_agent() -> LlmAgent`, `build_eval_agent() -> LlmAgent`, and `root_agent`. `build_agent` and the `include_agui` branch are gone.

- [ ] **Step 1: Confirm the full list of `build_agent` consumers**

Run: `grep -rn "workflow_agent\|build_agent\b" agents apps --include="*.py" --include="*.ts" | grep -v __pycache__ | grep -v ".claude/worktrees"`
Expected: `workflow_agent.py` itself, `tests/test_workflow_hitl.py` (both deleted this task), and `tests/test_oralboards_state_tools.py` (migrated in Step 4b below). If anything else shows up, stop and update it first.

- [ ] **Step 2: Delete the shim and its test**

```bash
git rm agents/oralboards/src/oralboards_agent/workflow_agent.py agents/oralboards/tests/test_workflow_hitl.py
```

- [ ] **Step 3: Port the surviving contract assertions into `test_orchestrator.py`**

Append to `agents/oralboards/tests/test_orchestrator.py` (these come from `test_workflow_hitl.py::test_workflow_uses_state_driven_terminal_question_steps` and guard the turn-based backbone — Global Constraint #1):

```python
def test_phase_prompts_keep_state_driven_question_contract() -> None:
    from oralboards_agent.phases import build_case_builder, build_questioner

    case_builder = build_case_builder()
    questioner = build_questioner()

    assert "ask_question" not in case_builder.static_instruction
    assert "set_phase('presenting')" in case_builder.static_instruction
    assert "ask_question" not in questioner.static_instruction
    assert questioner.output_key == "current_question"
    assert questioner.tools == []
```

- [ ] **Step 4: Remove the web-monolith path from `agent.py`**

In `agents/oralboards/src/oralboards_agent/agent.py`:

1. Delete the import `from ag_ui_adk import AGUIToolset` (line 5).
2. Replace `_build_agent` (lines 56-85, including `build_agent`) with:

```python
def _build_agent(*, model: BaseLlm | None = None) -> LlmAgent:
    """Chat-only monolithic examiner (Telegram surface)."""
    return LlmAgent(
        name="oralboards_agent",
        description="Pediatric dentistry oral-board practice.",
        model=model or LiteLlm(model="openrouter/tencent/hy3:free"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=OralBoardsState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(OralBoardsState),
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_case),
            FunctionTool(set_phase),
            FunctionTool(set_loading_step),
            FunctionTool(append_exchange),
            FunctionTool(set_score_card),
        ],
    )


def build_telegram_agent() -> LlmAgent:
    return _build_agent(
        model=Gemini(
            model="gemini-3.1-flash-lite",
            retry_options=GEMINI_RETRY_OPTIONS,
        ),
    )
```

(`build_eval_agent` and `root_agent = build_eval_agent()` below stay untouched — the GEPA/evalset flow targets them.)

- [ ] **Step 4b: Migrate `test_oralboards_state_tools.py` off `build_agent`**

Four tests in `agents/oralboards/tests/test_oralboards_state_tools.py` assert `instructions.md` content through `build_agent()` (lines 111, 135, 144, 157). The file is retained (telegram + eval agents load it), so the assertions stay valid — point them at `build_eval_agent` instead:

1. Line 9: change the import to

```python
from oralboards_agent.agent import OralBoardsState, build_eval_agent, build_telegram_agent
```

2. Replace each of the four `agent = build_agent()` calls with `agent = build_eval_agent()`.

- [ ] **Step 5: Run the backend suites and lint**

Run: `uv run pytest agents -q && pnpm lint:py`
Expected: all pass; Ruff clean (it will flag the removed `AGUIToolset` import if you missed it).

- [ ] **Step 6: Commit**

```bash
git add -A agents/oralboards
git commit -m "refactor(oralboards): delete Workflow shim and web-monolith agent path"
```

---

### Task 5: Web + types consolidation to a single `oral-boards` agent

**Files:**

- Modify: `packages/types/src/index.ts:9,27`
- Modify: `apps/web/src/components/chat/agents/registry.ts:194-247`
- Modify: `apps/web/src/components/chat/agents/extensions.tsx:52`
- Modify: `apps/web/src/components/chat/oral-boards-workspace.tsx:27-35,153-164,222-253,282-288`
- Modify: `apps/web/src/components/agent-theme.ts:11,69`
- Modify: `apps/web/src/hooks/use-agent-warmup.ts:15,37`
- Modify: `apps/web/src/proxy.ts:16`
- Modify: `apps/web/src/components/chat/agents/registry.test.ts:14,53`
- Modify: `apps/web/src/components/chat/agents/oral-boards.test.tsx:37`
- Modify: `apps/web/src/app/api/agents/health/route.test.ts:57`
- Delete: `apps/web/src/app/console/oral-boards-v2/` (3 files)
- Delete: `agents/oralboards/tests/eval/oral-boards-v2.json`, `agents/oralboards/eval/datasets/oral-boards-v2.json`

**Interfaces:**

- Consumes: the consolidated backend from Task 3 (`oral-boards` → `oralboards` prefix — unchanged mapping).
- Produces: `AgentId` no longer contains `"oral-boards-v2"`; every consumer compiles against the narrowed union.

- [ ] **Step 1: Narrow the shared types**

In `packages/types/src/index.ts` delete line 9 (`"oral-boards-v2",` from `AGENT_ORDER`) and line 27 (`"oral-boards-v2": "oralboards-v2",` from `AGENT_BACKEND_PATHS`).

- [ ] **Step 2: Registry — drop the v2 entry, move its artifact block to `oral-boards`**

In `apps/web/src/components/chat/agents/registry.ts`: delete the whole `"oral-boards-v2": { ... },` entry (lines 220-247), and add the artifact block it alone had into the `"oral-boards"` entry (after `welcome`):

```ts
artifact: {
  stateField: "case",
  kind: "markdown",
  title: "Case",
  name: "case.md",
},
```

- [ ] **Step 3: Extensions map**

In `apps/web/src/components/chat/agents/extensions.tsx` delete line 52: `"oral-boards-v2": { Mount: OralBoardsExtension },`.

- [ ] **Step 4: Workspace — remove the engine toggle**

In `apps/web/src/components/chat/oral-boards-workspace.tsx`:

1. Delete lines 27-35 (the `OralBoardsAgentId` type and `ENGINES` const) and add in their place:

```ts
const AGENT_ID = "oral-boards" as const;
```

2. Replace the component signature and engine state (lines 153-156):

```ts
function OralBoardsWorkspaceContent() {
  const config = getAgentConfig(AGENT_ID);
```

and replace every remaining use of `engine` and `agentId` in the component body with `AGENT_ID` (lines 158, 160, 164, 168, 222, 230).

3. Delete the engine-toggle header block — the `<span>Examiner engine</span>` and the whole `<Tabs>…</Tabs>` element (lines 235-252) — leaving the header row as:

```tsx
<div className="flex shrink-0 items-center gap-3 border-b px-2 py-1.5 md:hidden">
  <SidebarTrigger />
</div>
```

4. Replace the exported wrapper (lines 282-288):

```tsx
export function OralBoardsWorkspace() {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsWorkspaceContent />
    </OralBoardsQuestionProvider>
  );
}
```

5. Remove now-unused imports (`Tabs`, `TabsList`, `TabsTrigger`, and `useState` if nothing else in the file uses it — oxlint will tell you).

- [ ] **Step 5: Sweep the remaining references**

- `apps/web/src/components/agent-theme.ts`: remove `| "oral-boards-v2"` (line 11) and the `"oral-boards-v2": { ... },` theme entry (line 69's block).
- `apps/web/src/hooks/use-agent-warmup.ts`: remove the `"oral-boards-v2": AgentStatus;` field (line 15) and `"oral-boards-v2": "loading",` initial entry (line 37).
- `apps/web/src/proxy.ts`: remove line 16 `"/console/oral-boards-v2(.*)",` from the protected-routes matcher.
- `apps/web/src/components/chat/agents/registry.test.ts`: remove `"oral-boards-v2",` from the expected order (line 14) and the line 53 expectation `expect(getAgentConfig("oral-boards-v2").requires ?? []).toEqual([]);`.
- `apps/web/src/components/chat/agents/oral-boards.test.tsx`: change line 37 `agentId="oral-boards-v2"` to `agentId="oral-boards"`.
- `apps/web/src/app/api/agents/health/route.test.ts`: remove the `"oral-boards-v2": "error",` fixture line (line 57).

```bash
git rm -r apps/web/src/app/console/oral-boards-v2
git rm agents/oralboards/tests/eval/oral-boards-v2.json agents/oralboards/eval/datasets/oral-boards-v2.json
```

- [ ] **Step 6: Verify nothing is left**

Run: `grep -rn "oral-boards-v2\|oralboards-v2" apps/web/src packages agents --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" | grep -v ".next/"`
Expected: no output (the `test_eval_assets.py` docstring mention `(oralboards-v2 → oralboards)` may remain — it's a comment describing the `-v2` suffix-stripping helper, which is now dead generality; simplify the docstring to "Map backend_path to agents/<dir>." if you touch the file, otherwise leave it).

- [ ] **Step 7: Run web tests and full check**

Run: `pnpm --filter web test && pnpm check`
Expected: all pass, no type errors (a missed `"oral-boards-v2"` reference fails compilation because the `AgentId` union narrowed).

- [ ] **Step 8: Commit**

```bash
git add -A apps/web packages/types agents/oralboards
git commit -m "feat(web): consolidate oral-boards to single orchestrator-backed agent"
```

---

### Task 6: Model tiering per phase

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/phases.py` (the four builders' `model` overrides)
- Test: `agents/oralboards/tests/test_orchestrator.py`

**Interfaces:**

- Produces: each phase pinned to its tier. Later swaps (e.g. an OpenRouter frontier model on the evaluator) are one-line changes here.

- [ ] **Step 1: Write the failing test**

Append to `agents/oralboards/tests/test_orchestrator.py`:

```python
def test_phase_model_tiering() -> None:
    """Strongest model on the evaluator (pedagogically critical); cheap on mechanical phases."""
    from oralboards_agent.phases import (
        build_case_builder,
        build_evaluator,
        build_questioner,
        build_scorer,
    )

    assert build_evaluator().model.model == "mistral/mistral-large-latest"
    assert build_case_builder().model.model == "gemini-3.1-flash-lite"
    assert build_questioner().model.model == "groq/llama-3.3-70b-versatile"
    assert build_scorer().model.model == "mistral/mistral-medium-latest"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest agents/oralboards/tests/test_orchestrator.py::test_phase_model_tiering -q`
Expected: FAIL — all four currently use `mistral/mistral-medium-latest`.

- [ ] **Step 3: Assign the models**

In `phases.py`, set each builder's model override (each builder currently passes `{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-medium-latest")}`):

- `build_case_builder`: `Gemini(model="gemini-3.1-flash-lite")`
- `build_questioner`: `LiteLlm(model="groq/llama-3.3-70b-versatile")`
- `build_evaluator`: `LiteLlm(model="mistral/mistral-large-latest")`
- `build_scorer`: `LiteLlm(model="mistral/mistral-medium-latest")` (unchanged)

Rationale (from spec §2): evaluator gets the strongest reliably-available paid model (`MISTRAL_API_KEY` is paid, no daily cap); case builder uses direct Gemini for large-context vignette composition; questioner is mechanical (one open-ended sentence) and rides Groq's fast Llama; scorer synthesizes the transcript on mid-tier Mistral. The ambient LiteLLM fallback chain still covers provider outages.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest agents/oralboards -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/phases.py agents/oralboards/tests/test_orchestrator.py
git commit -m "feat(oralboards): tier phase models by pedagogical criticality"
```

---

### Task 7: Evaluator grounding — give it `search_docs` and a re-search rule

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/phases.py` (`build_evaluator`: tools list + `## Clinical grounding` prompt section)
- Test: `agents/oralboards/tests/test_orchestrator.py`

**Interfaces:**

- Consumes: `search_docs` (already imported in `phases.py` for the case builder).
- Produces: evaluator tools = `[search_docs, append_exchange, FunctionTool(complete_examination), set_loading_step]`.

- [ ] **Step 1: Write the failing test**

Append to `agents/oralboards/tests/test_orchestrator.py`:

```python
def test_evaluator_can_ground_beyond_case_passages() -> None:
    from oralboards_agent.phases import build_evaluator

    evaluator = build_evaluator()
    tool_names = {getattr(tool, "__name__", getattr(tool, "name", "")) for tool in evaluator.tools}
    assert "search_docs" in tool_names
    assert "Re-search" in evaluator.static_instruction
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest agents/oralboards/tests/test_orchestrator.py::test_evaluator_can_ground_beyond_case_passages -q`
Expected: FAIL — evaluator has no `search_docs` today.

- [ ] **Step 3: Implement**

In `build_evaluator` in `phases.py`:

1. Add `search_docs` first in the `tools` list:

```python
tools=[
    search_docs,
    append_exchange,
    FunctionTool(complete_examination),
    set_loading_step,
],
```

2. Replace the `## Clinical grounding` section of `static_instruction` with:

```text
## Clinical grounding
The case_passages field in state contains the source text retrieved when the
case was built. Ground feedback and the ideal response in it whenever it
covers the topic.
Re-search with search_docs when — and only when — the candidate's answer
raises clinical material the stored passages do not cover (a drug, technique,
guideline, or complication outside the case's original scope). Fire one broad
and one collection-filtered search_docs call in parallel, use the returned
'passage' fields, and add the new sources to the exchange's citations.
Never fill in clinical content from memory. If neither the stored passages
nor a re-search covers the point, say so in the feedback instead of
improvising.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest agents/oralboards -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/phases.py agents/oralboards/tests/test_orchestrator.py
git commit -m "feat(oralboards): evaluator re-searches corpus beyond stored case passages"
```

---

### Task 8: Bounded probing follow-up

One probe per question, max: when an answer is partial (would score 2), the evaluator may ask exactly one follow-up before scoring. The probe rides the existing state channel (`current_question` → exam panel display + speech; `status` stays `"feedback"` so the next turn routes back to the evaluator). `append_exchange` closes the loop by clearing the probe flag.

**Files:**

- Create: `agents/oralboards/src/oralboards_agent/tools/ask_probe.py`
- Modify: `agents/oralboards/src/oralboards_agent/tools/__init__.py`
- Modify: `agents/oralboards/src/oralboards_agent/agent.py` (state field + tool re-import)
- Modify: `agents/oralboards/src/oralboards_agent/tools/append_exchange.py:66-69`
- Modify: `agents/oralboards/src/oralboards_agent/phases.py` (`build_evaluator`: tool + prompt section)
- Test: `agents/oralboards/tests/test_oralboards_state_tools.py`

**Interfaces:**

- Produces: `ask_probe(question: str, tool_context: ToolContext) -> dict[str, object]`; new `OralBoardsState.active_probe: str = ""`. Task 9's prompt text references the probe rules defined here.

- [ ] **Step 1: Write the failing tests**

Append to `agents/oralboards/tests/test_oralboards_state_tools.py` (the file builds stub tool contexts inline as `SimpleNamespace(state={...})` — same pattern here; `SimpleNamespace` is already imported at the top):

```python
def test_ask_probe_sets_question_and_flag() -> None:
    from oralboards_agent.tools.ask_probe import ask_probe

    ctx = SimpleNamespace(state={})
    result = ask_probe("What would change if the tooth were necrotic?", ctx)

    assert result["status"] == "success"
    assert ctx.state["active_probe"] == "What would change if the tooth were necrotic?"
    assert ctx.state["current_question"] == "What would change if the tooth were necrotic?"


def test_ask_probe_refuses_second_probe() -> None:
    from oralboards_agent.tools.ask_probe import ask_probe

    ctx = SimpleNamespace(state={"active_probe": "first probe"})
    result = ask_probe("second probe", ctx)

    assert result["status"] == "error"
    assert ctx.state["active_probe"] == "first probe"


def test_append_exchange_clears_active_probe() -> None:
    from oralboards_agent.tools.append_exchange import append_exchange

    ctx = SimpleNamespace(state={"active_probe": "pending probe"})
    append_exchange(
        ctx,
        question="Q",
        answer="A",
        skillset="Pulp Therapy",
        skill="analyze_evaluate",
        feedback="**Skillset:** Pulp Therapy · analyze_evaluate — fine",
        ideal_response="ideal",
        score=3,
    )
    assert ctx.state["active_probe"] == ""


def test_state_declares_active_probe_default() -> None:
    from oralboards_agent.agent import OralBoardsState

    assert OralBoardsState().active_probe == ""
```

If the file's context helper has a different name than `_tool_context`, use that name — do not add a second helper.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py -q`
Expected: FAIL — `ModuleNotFoundError` for `ask_probe`, missing state field, probe not cleared.

- [ ] **Step 3: Implement the tool**

Create `agents/oralboards/src/oralboards_agent/tools/ask_probe.py`:

```python
from typing import Annotated

from google.adk.tools import ToolContext
from pydantic import Field


def ask_probe(
    question: Annotated[
        str,
        Field(
            description="One probing follow-up question on the CURRENT skillset, asked before scoring a partial answer"
        ),
    ],
    tool_context: ToolContext,
) -> dict[str, object]:
    """Ask exactly one probing follow-up before scoring; displayed in the exam panel."""
    if tool_context.state.get("active_probe"):
        return {
            "status": "error",
            "message": "Probe already used for this question — score the combined answers with append_exchange now.",
        }
    tool_context.state["active_probe"] = question
    tool_context.state["current_question"] = question
    return {"status": "success", "message": "Probe question displayed."}
```

- [ ] **Step 4: Wire it up**

1. `agents/oralboards/src/oralboards_agent/tools/__init__.py`: add `from .ask_probe import ask_probe` alongside the existing re-exports (match the file's existing pattern).
2. `agents/oralboards/src/oralboards_agent/agent.py`: add to `OralBoardsState` (after `active_ideal_response`):

```python
active_probe: str = ""
```

and add `from .tools.ask_probe import ask_probe` next to the other tool imports (so `phases.py` can import it from `.agent` like the rest).

3. `agents/oralboards/src/oralboards_agent/tools/append_exchange.py`: after line 69 (`tool_context.state["active_ideal_response"] = ""`) add:

```python
tool_context.state["active_probe"] = ""
```

4. `phases.py` — add `ask_probe` to the `from .agent import (...)` block and to `build_evaluator`'s tools:

```python
tools=[
    search_docs,
    ask_probe,
    append_exchange,
    FunctionTool(complete_examination),
    set_loading_step,
],
```

5. `build_evaluator`'s `static_instruction` — insert a new section between `## Clinical grounding` and `## Your task`:

```text
## Probing (one per question, max)
If the candidate's answer is partial — it would score 2 because something
specific is missing or undefended — you MAY call ask_probe with ONE follow-up
question targeting exactly that gap, instead of scoring immediately. Real
examiners probe; use it when one more sentence from the candidate would
separate a 2 from a 3.
Rules:
- Check state: if active_probe is non-empty, the probe was already asked and
  the latest user message answers it. You MUST now call append_exchange,
  treating the original answer plus the probe answer together as the
  candidate's response (answer = original answer + " / " + probe answer).
- Never probe an answer that is clearly a 1 or clearly a 3 — score it.
- After calling ask_probe, end your turn with no chat text. The panel
  displays the probe.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest agents/oralboards -q`
Expected: all pass (including Task 7's evaluator tool test — the set-based assertion tolerates the added tool).

- [ ] **Step 6: Commit**

```bash
git add agents/oralboards
git commit -m "feat(oralboards): bounded probing follow-up before scoring partial answers"
```

---

### Task 9: Contrastive feedback + golden eval case

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/phases.py` (`build_evaluator`: the `append_exchange` feedback bullet in `## Your task`)
- Modify: `agents/oralboards/tests/eval/oral-boards.json` (one new rubric case)
- Test: `agents/oralboards/tests/test_orchestrator.py`

**Interfaces:**

- Consumes: probe rules from Task 8 (prompt cross-references them).
- Produces: the evaluator feedback contract that spec phases 4-6 build on.

- [ ] **Step 1: Write the failing test**

Append to `agents/oralboards/tests/test_orchestrator.py`:

```python
def test_evaluator_feedback_is_contrastive_and_cited() -> None:
    from oralboards_agent.phases import build_evaluator

    instruction = build_evaluator().static_instruction
    assert "What you said" in instruction
    assert "What was missing" in instruction
    assert "What a 3 sounds like" in instruction
    assert "quote" in instruction.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest agents/oralboards/tests/test_orchestrator.py::test_evaluator_feedback_is_contrastive_and_cited -q`
Expected: FAIL.

- [ ] **Step 3: Upgrade the feedback bullet**

In `build_evaluator`'s `static_instruction`, replace the `- feedback — markdown starting with **Skillset:** <domain> · <skill level>, then cited feedback` bullet with:

```text
   - feedback — markdown with this exact structure:
     **Skillset:** <domain> · <skill level>
     **What you said:** one sentence crediting what was correct or relevant.
     **What was missing:** the specific gap that set the score, each point
     backed by a short direct quote from the case passages or re-searched
     passages ("...") with its source title.
     **What a 3 sounds like:** 2-3 sentences a full-marks candidate would
     actually say — concrete, committed, and clinically sequenced. Do not
     restate the ideal_response verbatim; this is the spoken version.
```

- [ ] **Step 4: Add the golden eval case**

In `agents/oralboards/tests/eval/oral-boards.json`, append to the `eval_cases` array (after the last existing case):

```json
{
  "eval_case_id": "oral_boards_contrastive_feedback_on_partial_answer",
  "metadata": {
    "agent_id": "oral-boards",
    "backend_path": "oralboards"
  },
  "prompt": {
    "role": "user",
    "parts": [
      {
        "text": "My answer: I would place a stainless steel crown on the tooth after the pulpotomy because it protects the tooth."
      }
    ]
  },
  "rubric_groups": {
    "coaching_quality": {
      "rubrics": [
        {
          "rubric_id": "oralboards_feedback_is_contrastive",
          "content": {
            "property": {
              "description": "The feedback separately identifies what the candidate got right, what specific content was missing for full marks, and models what a score-3 answer sounds like."
            }
          }
        },
        {
          "rubric_id": "oralboards_feedback_quotes_sources",
          "content": {
            "property": {
              "description": "Each missing-content point is supported by a direct quotation from a retrieved guideline or course passage with its source identified, not paraphrased from memory."
            }
          }
        },
        {
          "rubric_id": "oralboards_score_stays_on_abpd_scale",
          "content": {
            "property": {
              "description": "Any score given is an integer 1, 2, or 3 for a named blueprint skillset; no percentage, /5, or composite scores appear."
            }
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 5: Run everything**

Run: `uv run pytest agents -q && pnpm check`
Expected: all Python suites pass (`test_eval_assets.py` validates the dataset shape against the shared eval config); `pnpm check` clean.

- [ ] **Step 6: Commit**

```bash
git add agents/oralboards
git commit -m "feat(oralboards): contrastive cited feedback contract + golden eval case"
```

---

## Verification (after all tasks)

- [ ] `uv run pytest agents -q` — full Python suite green.
- [ ] `pnpm check` — lint + types + web tests green.
- [ ] Manual smoke (see `/run` skill or `pnpm dev`): open `/console/oral-boards`, start a pulp-therapy case, click Begin Examination, answer one question partially → expect a probe → answer the probe → expect contrastive cited feedback → continue to the score card. Confirm the `Examiner engine` toggle is gone and `/console/oral-boards-v2` 404s.

## Deferred (separate plans)

- Spec §4 session review artifact (`set_study_sheet`), §5 adaptive difficulty (`user:skill_profile`), §6 study mode — plan each after this foundation ships.
- Optional upstream PR to ag-ui-protocol/ag-ui adding `graph.nodes` traversal (reopen #2036).
