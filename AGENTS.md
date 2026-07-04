# Repository Guide for Coding Agents

This is a **pnpm monorepo** hosting multiple Google ADK agents and the frontends that connect to them.

## Structure

```
apps/
  web/      Next.js 16 + CopilotKit AG-UI — multi-agent console
  mobile/   Expo Router (iOS/Android) — AG-UI client screens
agents/
  gateway/     Single FastAPI gateway mounted by Railway defaults
  travel/      Python ADK agent — trip planning via trvl MCP
  grocery/     Python ADK agent — grocery/meal planning via Kroger MCP
  fitness/     Python ADK agent — Strava-backed training plans
  wellness/    Python ADK orchestrator — in-process grocery + fitness tools
  a2ui/        Python ADK agent — declarative A2UI surfaces
  oralboards/  Python ADK agent — pediatric dentistry oral-board practice
  resume/      Public Python ADK agent — resume Q&A
  shared/      Shared Python helpers for ADK session, gateway auth, invocation state, and tool callbacks
packages/
  types/       Shared TypeScript types (TripState, GroceryState, Preferences)
```

## Running locally

**Prerequisites:** pnpm, Docker, uv (for Python agents outside Docker)

```bash
# Install JS dependencies
pnpm install

# Start web + the single agents gateway (Docker)
pnpm dev

# Web only (gateway must be running separately)
pnpm dev:web

# Mobile (Expo)
pnpm dev:mobile

# Single agents gateway only (via Docker)
pnpm dev:agents
```

The web app runs on :3000. The agents gateway runs on :8000 and mounts each
agent at `/<agent>/agui` plus `/<agent>/health`.

## Quality checks

This repo uses the Oxc toolchain for JavaScript/TypeScript and Ruff for Python.

```bash
# Run all configured checks
pnpm check

# JS/TS linting with Oxlint (type-aware via oxlint-tsgolint)
pnpm lint

# Python linting with Ruff
pnpm lint:py

# Format all supported files with Oxfmt
pnpm fmt
```

Conventions:

- Use `oxlint` instead of ESLint. Keep `.oxlintrc.json` as the source of truth.
- Use `oxfmt` instead of Prettier. Tailwind class sorting is enabled, including `cn()` and `tw()` helper calls.
- Use Ruff for Python linting. The root `pyproject.toml` owns the shared Ruff rule set.
- `react/react-in-jsx-scope` stays off because the web and mobile apps use the React 17+ automatic JSX runtime.
- Treat Oxlint warnings as follow-up cleanup unless the checker exits non-zero.

## Agent filesystem structure

Each agent follows a filesystem-first layout. Every piece of behavior lives in its own file so contributors can find logic without reading the whole module.

```
agents/<name>/src/<name>_agent/
  instructions.md          # Full agent instruction + ADK state template (single file)
  agent.py                 # State model (Pydantic BaseModel) + build_agent()
  main.py                  # FastAPI app, OTEL setup, health endpoint
  tools/
    __init__.py            # Re-exports every tool and toolset factory
    <tool_name>.py         # One file per callable tool; exports tool = FunctionTool(fn)
    _types.py              # (optional) Shared TypedDicts / helpers private to tools/
    <mcp_name>.py          # MCP toolset factory: def <name>_toolset() -> McpToolset
  subagents/               # (optional) Sub-agents used via AgentTool
    __init__.py
    <sub_name>.py          # def build_<sub_name>() -> LlmAgent
```

**Rules:**

- `instructions.md` is loaded at module import time via `pathlib`:
  ```python
  _INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")
  ```
  Pass it as `instruction=_INSTRUCTION` only — no `static_instruction` split.
- Every callable tool must export `tool = FunctionTool(fn)` and live in its own file.
  The `__init__.py` re-exports each as `from .<tool_name> import tool as <tool_name>`.
- MCP toolset factories (`def <name>_toolset() -> McpToolset`) live in their own file
  but are **not** wrapped in `FunctionTool` — they return a `McpToolset` ADK passes
  directly to the `tools=` list.
- Pydantic `BaseModel` state schemas stay in `agent.py`, not in `tools/`.
- `_types.py` (underscore prefix = private to the package) holds TypedDicts,
  shared helpers, and normalisation functions used by multiple tool files.
- If a placeholder must survive Python `.format()` in the instruction template,
  use double braces: `{{RESUME}}` in `instructions.md` and `.replace("{{RESUME}}", value)` in `agent.py`.
- `subagents/` is used for sub-LLM agents called via `AgentTool`; only add it when
  the agent orchestrates sub-agents.

## Prompt optimization (`adk optimize`)

**Canonical flow: drive everything through the `uv run adk optimize` CLI.** Do not write custom Python optimization scripts — the CLI handles `LocalEvalSamplerConfig` parsing, `LocalEvalSetsManager` construction, GEPA invocation, and result printing (`google/adk/cli/cli_tools_click.py::cli_optimize`). Custom scripts duplicate that path and rot against ADK upgrades.

### The three files per agent

Each eval-enabled agent ships three files **inside its module dir** (`agents/<name>/src/<name>_agent/`):

| File                          | Purpose                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `train_eval_set.evalset.json` | Eval cases with `final_response` gold answers.                                                                     |
| `sampler_config.json`         | `LocalEvalSamplerConfig` — uses `response_match_score: 0.75` (ROUGE-based, no LLM judge).                          |
| `optimizer_config.json`       | `GEPARootAgentPromptOptimizerConfig` — Mistral reflection LM, empty `model_configuration`, `max_metric_calls: 12`. |

### Evalset location invariant (do not move these files)

`adk optimize` constructs `LocalEvalSetsManager(agents_dir=os.path.dirname(module_path))`, then resolves evalsets at `<agents_dir>/<app_name>/<eval_set_id>.evalset.json`. So:

- The evalset file **must** live inside the agent module dir (`agents/<name>/src/<name>_agent/train_eval_set.evalset.json`).
- `app_name` in `sampler_config.json` **must** equal `os.path.basename(module_path)` (the CLI asserts this and aborts with a `ClickException` on mismatch — the symptom is `eval set not found`).

`os.path.basename(agents/<name>/src/<name>_agent)` == `<name>_agent`, so `app_name` in every `sampler_config.json` is the snake-case `<name>_agent` string, not the human-readable name.

### Evalset schema requirements for `response_match_score`

Each `conversation[i]` entry needs both `invocation_id` and a `final_response` Content object, not just `user_content`. Omitting `final_response` silently scores 0.0 on ROUGE for every case — GEPA sees a flat-zero signal and reports "no improvement found" even though the path ran end-to-end. Minimum viable case:

```json
{
  "eval_id": "...",
  "session_input": { "app_name": "<name>_agent", "user_id": "eval_user", "state": {} },
  "conversation": [
    {
      "invocation_id": "inv1",
      "user_content": { "role": "user", "parts": [{ "text": "…" }] },
      "final_response": { "role": "model", "parts": [{ "text": "<gold answer>" }] }
    }
  ]
}
```

The gold answer does not need to be verbatim — ROUGE is recall/precision-overlap on n-grams, so a short representative answer (1–2 sentences capturing the must-cover points) is enough. Aim for one gold answer per case; more cases > longer gold answers.

### Why `response_match_score` and not `rubric_based_final_response_quality_v1`

`rubric_based_final_response_quality_v1` is the natural fit for "the agent must call set_trip_meta, must not paste the plan in chat, must ask approval before booking"-style rules. **Do not use it through `adk optimize`'s JSON path.** There is a Pydantic + `RubricBasedEvaluator` mismatch: criteria deserialized from JSON come back as plain `dict`s, but `RubricBasedEvaluator` accesses `r.rubric_content.text_property` as attribute access → `AttributeError` mid-eval. The only supported workaround is the programmatic API (`RubricsBasedCriterion(rubrics=[Rubric(...)])`) — which means leaving the `adk optimize` CLI, i.e. the custom-script path we are explicitly avoiding. Use `response_match_score` + well-written gold answers instead. If rubric-based grading is genuinely required, capture it as a `custom_function` metric in `eval_config.criteria` (code-execution metrics deserialize cleanly because Pydantic just stores the string).

### Why `optimizer_model: mistral/mistral-medium-latest` (not the default `gemini-2.5-flash`)

GEPA's default `optimizer_model` is `gemini-2.5-flash` and it is invoked **directly** via ADK's native `Gemini` adapter (not through LiteLLM). Two problems on this repo:

1. The Ambient Gemini free tier (`GEMINI_API_KEY` from Railway) has a 20 req/day quota on `gemini-2.5-flash`. GEPA's reflection_lm burns through it in one run.
2. The Railway service account (`railway-bigquery-runner@ivory-period-864.iam.gserviceaccount.com`) does **not** have Vertex AI / Agent Platform API enabled in project `ivory-period-864`. Routing to Vertex (`GOOGLE_GENAI_USE_GCA_VERTEX=1`) fails with `403 SERVICE_DISABLED` on `aiplatform.googleapis.com`. Enabling it requires a Console action outside this repo, so Vertex is not currently a fallback.

Setting `optimizer_model: "mistral/mistral-medium-latest"` routes the reflection_lm through `LiteLlm` (the registry matches `mistral/.*`), and Railway's `MISTRAL_API_KEY` is paid with no daily cap. The candidate agent's own inference is **independent** of the optimizer_model — each agent picks its own primary model inline in its `agent.py`, distributed across paid providers to spread load (see Model Distribution below).

### `model_configuration: {}` is required (not optional)

The default `GEPARootAgentPromptOptimizerConfig.model_configuration` ships with `thinking_config(include_thoughts=True, thinking_budget=10240)` — Gemini-only. Leaving it set when `optimizer_model` is a LiteLLM model causes the LiteLLM adapter to reject the request or silently drop the config. Set `model_configuration: {}` in every `optimizer_config.json` to disable it.

### The canonical command

```bash
# 1. pull provider keys from Railway into the shell (Cerebras, Mistral, NVIDIA NIM, Groq, …)
eval "$(railway variables --json | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(f"export {k}=\047{v}\047") for k,v in d.items() if k.endswith(\"_API_KEY\")]')"

# 2. run GEPA via the adk CLI (no custom scripts, no Python entrypoints)
uv run adk optimize agents/<name>/src/<name>_agent \
  --sampler_config_file_path   agents/<name>/src/<name>_agent/sampler_config.json \
  --optimizer_config_file_path agents/<name>/src/<name>_agent/optimizer_config.json \
  --print_detailed_results
```

### Validating configs without spending model budget

Before each run, dry-validate that the configs parse and the evalsets resolve — this catches the `app_name == basename` invariant and missing `final_response` issues in <1s with no API calls:

```bash
uv run python - <<'PY'
import os
from google.adk.optimization.local_eval_sampler import LocalEvalSampler, LocalEvalSamplerConfig
from google.adk.evaluation.local_eval_sets_manager import LocalEvalSetsManager

mod = "agents/<name>/src/<name>_agent"
cfg = LocalEvalSamplerConfig.model_validate_json(open(f"{mod}/sampler_config.json").read())
assert cfg.app_name == os.path.basename(mod), (cfg.app_name, os.path.basename(mod))
mgr  = LocalEvalSetsManager(agents_dir=os.path.dirname(mod))
eset = mgr.get_eval_set(cfg.app_name, cfg.train_eval_set)
assert eset and eset.eval_cases[0].conversation[0].final_response, "missing eval set or gold answer"
LocalEvalSampler(cfg, mgr).get_train_example_ids()  # forces full sampler init
print("OK", mod, cfg.app_name, len(eset.eval_cases), "cases")
PY
```

### Reading GEPA results

The CLI prints the optimized instruction and (with `--print_detailed_results`) the full `gepa_result` JSON. Key fields:

- `total_metric_calls` — how many eval sampler runs were spent (caps at `max_metric_calls`).
- `val_aggregate_scores[best_idx]` — the best validation ROUGE score across all candidates.
- `candidates[best_idx].agent_prompt` — the optimized instruction to paste back into the agent.
- `Iteration N: New subsample score X is not better than old score Y, skipping` — normal; GEPA only propagates candidates that beat their parent on the train subsample.

If the printed optimized instruction is empty and `val_aggregate_scores` is `[0.0]`, the seed prompt already beat every candidate GEPA proposed within the budget. Either (a) bump `max_metric_calls` in `optimizer_config.json`, (b) add more diverse eval cases, or (c) tighten the gold answer so the seed has room to improve.

### Iteration guidance

GEPA is **long-running and expensive** — do not loop on it. Iterate manually on the prompt and the evalset first (the agent's chat output lives in `.tmp/` traces when you run `adk eval` separately), and only run a single final `adk optimize` after manual fixes plateau. 12 metric calls is a tuning budget, not a search budget — for real prompt exploration raise `max_metric_calls` to 40–80.

## Adding a new agent

1. `mkdir agents/<name>` and copy the structure from `agents/travel/` (or `agents/grocery/`)
2. Implement `agents/<name>/src/<name>_agent/main.py` — follow the pattern:
   - `_setup_otel()` → `LlmAgent` → `ADKAgent` → FastAPI with `add_adk_fastapi_endpoint`
   - `GET /health` endpoint required for gateway health aggregation
   - no standalone `uvicorn.run(...)` entrypoint; the gateway is the only server entrypoint
3. Add any new Python third-party dependencies to the root `pyproject.toml`; do not add per-agent `pyproject.toml` files
4. Add the new package to `[tool.hatch.build.targets.wheel].packages` in the root `pyproject.toml`, then run `uv sync` so it installs (this is what makes `agents/<name>/src/<name>_agent` importable everywhere)
5. Mount the app in `agents/gateway/src/gateway/main.py`
6. Register the agent in `apps/web/src/components/chat/agents/registry.ts` (set `id` and `backendPath`) — the CopilotKit runtime and health-proxy routes derive their agent maps from the registry, so there is nothing to edit in the API routes
7. Add a mobile screen/config if the agent should be available in `apps/mobile`
8. Add state types to `packages/types/src/index.ts` when the agent exposes typed shared state

## Deployment

| Surface        | Platform       | Config                                                                                                                                                                          |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents gateway | Railway        | Docker (`agents/Dockerfile`) with repo root as build context; `railway.toml` sets `builder = "DOCKERFILE"` and `dockerfilePath`; `startCommand` runs `uvicorn gateway.main:app` |
| `apps/web/`    | Vercel         | vercel.json — set Root Dir to `apps/web/` in Vercel dashboard; `AGENTS_BASE_URL` points at the gateway                                                                          |
| `apps/mobile/` | EAS Build      | `apps/mobile/eas.json` → App Store / Google Play; `EXPO_PUBLIC_AGENTS_BASE_URL` points at the gateway                                                                           |
| Android APK    | GitHub Actions | `.github/workflows/android-apk.yml` — `expo prebuild` + Gradle, publishes the APK to a GitHub Release via `gh` (push a `v*` tag or run manually)                                |

## Architecture

**Web data flow:**

```
apps/web → CopilotKit runtime (Next.js API route) → HttpAgent → Railway agents gateway
```

**Mobile data flow:**

```
apps/mobile → @ag-ui/client (HttpAgent) → Railway agents gateway (direct HTTP)
```

**Auth:** Clerk — `@clerk/nextjs` on web, `@clerk/clerk-expo` on mobile. Protected routes are enforced in the web proxy/runtime and, when `CLERK_JWKS_URL` is configured, by `ClerkAuthMiddleware` on the gateway. The `resume` agent is intentionally public.

**Agent pattern:**

- Each agent owns a mountable FastAPI sub-app exposing AG-UI via `ag-ui-adk`
- The gateway is the only deployable Python web service
- Cross-agent orchestration is in-process via ADK tools, not remote A2A
- State is written to ADK shared state; the UI re-renders on every delta
- Token-level streaming via `PredictStateMapping` for long-form content

**Model distribution (load spreading):**

Each agent specifies its own primary model in `agent.py` to spread inference
load across providers and reduce single-provider dependency. Agents are
classified by task complexity — the LiteLLM ambient fallback chain (driven
by which API keys are present in the environment) provides dynamic fallback
if the primary provider fails.

Free-tier model IDs and rate limits change frequently. Check
[**freellm.net**](https://freellm.net) /
[awesome-freellm-apis](https://github.com/open-free-llm-api/awesome-freellm-apis)
for current best free models per provider.

| Tier      | Primary provider | Agents                                                                 |
| --------- | ---------------- | ---------------------------------------------------------------------- |
| Reasoning | Cerebras         | travel, research, oralboards orchestrator case_builder phase           |
| Standard  | Groq             | fitness, wellness, trends (+ subagent), presentation,                  |
|           |                  | spreadsheet, excalidraw, oralboards orchestrator questioner phase      |
| Standard  | NVIDIA           | grocery (`nemotron-3-super-120b-a12b`, 128K ctx)                       |
| Light     | OpenRouter       | expense, resume                                                        |
| Light     | Mistral          | oralboards orchestrator evaluator phase (`mistral-large-latest`),      |
|           | (free-tier, low  | scorer phase + GEPA `optimizer_model` (both `mistral-medium-latest`),  |
|           |                  | and the eval-harness agent (`mistral-small-latest`)                    |
| A2UI      | Gemini           | trends A2UI rendering subagent (bypasses LiteLLM entirely — uses       |
|           | (direct ADK)     | `Gemini(model="gemini-2.5-flash")` directly because Gemini can consume |
|           |                  | `reasoning_content` from prior turns that other providers reject.      |

## Conventions

- **Never import from non-v2 paths** in web — all CopilotKit hooks from `@copilotkit/react-core/v2`
- **Never paste agent output into chat** — write to state via tools (`write_itinerary`, `set_shopping_list`, etc.)
- **State is the source of truth** — the UI reads from `agent.state`, not chat messages
