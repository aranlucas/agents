@AGENTS.md

---

# AI Assistant Guide

This section is for AI coding assistants (Claude Code, Copilot, etc.). It covers patterns, gotchas, and quick-navigation pointers that go beyond the human-readable guide above.

## Agent inventory (current)

12 agents are mounted in the gateway. The registry in `apps/web/src/components/chat/agents/registry.ts` is the single source of truth for agent IDs and backend paths — the API routes derive from it automatically.

| Agent | Gateway path | Auth | Key state type |
|-------|-------------|------|----------------|
| travel | `/travel` | Clerk | `TripState` |
| grocery | `/grocery` | Clerk + Kroger | `GroceryState` |
| fitness | `/fitness` | Clerk + Strava | `FitnessState` |
| wellness | `/wellness` | Clerk + both | `WellnessState` |
| expense | `/expense` | Clerk | `ExpenseState` |
| oralboards | `/oralboards` | Clerk | `OralBoardsState` |
| trends | `/trends` | Clerk | `TrendsState` |
| resume | `/resume` | **Public** | — |
| research | `/research` | Clerk | `ResearchState` |
| spreadsheet | `/spreadsheet` | Clerk | `SpreadsheetState` |
| presentation | `/presentation` | Clerk | `PresentationState` |

AGENTS.md listed `a2ui` and `oralboards-v2` as separate directories; the current gateway and registry reflect the table above. Always verify against the gateway `main.py` and registry before adding or renaming agents.

## Key file map

| What you need | Where to look |
|---------------|---------------|
| Agent list + frontend IDs | `apps/web/src/components/chat/agents/registry.ts` |
| TypeScript state types | `packages/types/src/index.ts` |
| Python deps + wheel packages | `pyproject.toml` (root) |
| Gateway agent mounting | `agents/gateway/src/gateway/main.py` |
| Shared Python utilities | `agents/shared/src/agents_shared/` |
| Reference agent pattern | `agents/travel/src/travel_agent/` |
| CopilotKit runtime API route | `apps/web/src/app/api/copilotkit/route.ts` |
| Health-check proxy | `apps/web/src/app/api/agents/health/route.ts` |
| Offline MSW test handlers | `apps/web/src/testing/msw-handlers.ts` |
| CI pipeline | `.github/workflows/ci.yml` |
| Docker build | `agents/Dockerfile` |

## Python agent anatomy

Every agent follows this layout:

```
agents/<name>/
  src/<name>_agent/
    __init__.py
    main.py     # FastAPI sub-app, OTEL, health endpoint
    agent.py    # LlmAgent definition, tools, PredictStateMapping
    toolsets.py # (optional) tool registration helpers
```

The `main.py` pattern (copy from `agents/travel/src/travel_agent/main.py`):
1. `_setup_otel()` — configure OpenTelemetry if `OTEL_EXPORTER_OTLP_ENDPOINT` is set
2. Define the `LlmAgent` with tools and `output_schema`
3. Wrap with `ADKAgent` from `ag-ui-adk`
4. Mount via `add_adk_fastapi_endpoint(app, agent, path="/agui")`
5. Add `GET /health` — required for gateway health aggregation

**Never** add a standalone `uvicorn.run()` call. The gateway is the only entry point.

## Python package registration

When adding a new agent, two places must be updated in `pyproject.toml`:
1. `[project].dependencies` — add any new third-party packages
2. `[tool.hatch.build.targets.wheel].packages` — add `"agents/<name>/src/<name>_agent"`

Then run `uv sync` so the editable install is registered. Without this, the gateway import will fail at startup.

## Shared Python utilities (`agents/shared/src/agents_shared/`)

| Module | Exports |
|--------|---------|
| `app_factory.py` | `build_adk_agent()`, `add_agent_routes()`, `streaming_state_mapping()` |
| `dependencies.py` | `AgentServices` dataclass, DI helpers, session/memory/credential services |
| `session_service.py` | SQLAlchemy async session service, DB health checks |
| `clerk_auth.py` | `ClerkAuthMiddleware` (JWT verification against Clerk JWKS) |
| `tools.py` | LLM provider config, `_ProviderThrottle` rate limiter, fallback chains |
| `toolsets.py` | Tool registry helpers |
| `state.py` | State extraction utilities |
| `prompts.py` | Shared prompt snippets |

## Web app structure (`apps/web/`)

```
src/
  app/
    page.tsx                    # Home — agent card grid
    layout.tsx                  # Root layout (Clerk, CopilotKit providers)
    api/
      copilotkit/               # CopilotKit runtime (routes come from registry)
      agents/health/            # Health-check proxy (aggregates /<agent>/health)
      mcp/token/                # MCP auth token endpoint
      strava/token/             # Strava OAuth callback
    sign-in/  sign-up/          # Clerk auth pages
    console/<agent>/[thread]/   # Per-agent chat consoles (12 routes)
    demo/voice/  demo/tts/      # Voice/TTS demo routes
  components/
    chat/agents/registry.ts     # SINGLE SOURCE OF TRUTH for agent config
    agent-card.tsx
    approval-dialog.tsx         # Human-in-the-loop interrupts
    document-canvas.tsx         # Artifact renderer
  hooks/                        # React hooks
  lib/                          # Auth, env, connection helpers
  testing/                      # MSW handlers for offline mode
```

The registry drives everything: CopilotKit runtime URL, health-proxy map, agent sidebar. When adding an agent, only edit `registry.ts` — do not touch the API route files.

## Offline / test mode

Set `AGENT_TEST_MODE=offline` and `NEXT_PUBLIC_AGENT_TEST_MODE=offline` to run the web app without a live gateway. MSW intercepts all agent requests using handlers in `apps/web/src/testing/msw-handlers.ts`. This is required for CI tests.

## CopilotKit conventions

- Always import hooks from `@copilotkit/react-core/v2` — never from the root package path
- Use `useCoAgent` to read `agent.state` in UI components
- Never paste agent-generated content into chat messages — tools write to ADK shared state and the UI renders from state
- `PredictStateMapping` enables token-level streaming for long-form fields (itineraries, reports, slides)

## State architecture

ADK shared state is the source of truth. The flow is:

```
User message → Agent tool call → writes to ADK shared state
                                       ↓
                              CopilotKit state delta
                                       ↓
                              UI re-renders via useCoAgent
```

Never read state from chat message content. Never accumulate state client-side.

## CI pipeline (`.github/workflows/ci.yml`)

Four parallel jobs run on every push to main and every PR:

| Job | What it runs |
|-----|-------------|
| `js` | Oxlint, Oxfmt check, Turbo typecheck, Vitest (web + mobile), React Doctor |
| `build` | Next.js production build |
| `python` | Ruff check + format, `compileall`, Pyright, Pytest (90% coverage floor) |
| `docker` | Dockerfile smoke-build |

The `python` job runs `uv sync` before tests — always keep `pyproject.toml` wheel packages in sync with the actual directories.

## LLM provider configuration

Agents use `agents/shared/src/agents_shared/tools.py` for provider config. The current model strategy uses a sliding-window throttle with fallback chains (Gemini → Mistral → others). Do not hardcode model names in individual agents — use the shared helpers so the rate-limiting and fallback logic applies uniformly.

## Auth boundaries

- Web runtime mints a Clerk JWT; gateway verifies it against `CLERK_JWKS_URL`
- `ClerkAuthMiddleware` is applied at the gateway level when `CLERK_JWKS_URL` is set
- The `resume` agent is exempt from auth — it is mounted on the gateway but the middleware skips its path
- MCP tokens for trvl and Kroger are issued via the `/api/mcp/token` endpoint on the web

## What NOT to do

- Do not add per-agent `pyproject.toml` files — all Python deps live in the root
- Do not add a `uvicorn.run()` call to any agent — only the gateway starts uvicorn
- Do not import from `@copilotkit/react-core` (non-v2) anywhere in the web app
- Do not write agent output to chat — use state-writing tools
- Do not edit the CopilotKit API route or health-proxy route to add new agents — edit the registry only
- Do not commit `.env` or `.env.local` — use `.env.example` as the template
