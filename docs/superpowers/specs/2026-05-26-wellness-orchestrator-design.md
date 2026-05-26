# Wellness Orchestrator Agent Design

## Goal

Build a new `wellness` orchestrator agent that plans next week's meals and workouts by calling the existing `grocery` and `fitness` agents over A2A. All agents should use a shared SQLite-backed ADK session database instead of in-memory sessions, and the authenticated Clerk user ID should flow from the web frontend through AG-UI and A2A so state is durable and scoped per user.

## Scope

In scope:

- Add a new `agents/wellness` FastAPI service with AG-UI at `/agui`, A2A JSON-RPC at `/`, an A2A agent card at `/.well-known/agent-card.json`, and `/health`.
- Register the wellness agent in Docker Compose and the web CopilotKit runtime.
- Add shared TypeScript state types for the wellness plan.
- Move travel, grocery, fitness, and wellness to a shared ADK `SqliteSessionService`.
- Propagate Clerk `userId` from the Next.js CopilotKit route to backend agents via a trusted server-side header.
- Propagate user identity through A2A metadata so wellness can call grocery and fitness on behalf of the same user.
- Produce a unified one-week meal and workout plan in wellness state.

Out of scope:

- Replacing the existing grocery or fitness agents.
- Building a full native mobile wellness screen unless the existing mobile app already has a matching low-risk pattern.
- Direct SQL reads across agents as the primary integration contract. A2A remains the delegation boundary.

## Architecture

`agents/wellness` is a new ADK `LlmAgent` wrapped by `ADKAgent`. The service follows the current agent pattern: OTEL setup, state-writing tools, request-state extraction, an A2A `Runner`, `ADKAgentExecutor`, FastAPI middleware, A2A routes, AG-UI endpoint, and a health check.

The wellness agent does not import grocery or fitness internals. Instead, it owns A2A client tools:

- `request_meal_plan`: sends a prompt to the grocery A2A endpoint and stores the returned summary in wellness state.
- `request_workout_plan`: sends a prompt to the fitness A2A endpoint and stores the returned summary in wellness state.
- `set_weekly_wellness_plan`: writes the final combined markdown plan to wellness state.
- `mark_plan_ready`: marks the plan complete with a one-sentence review summary.

The wellness instruction requires the agent to delegate before writing the combined plan. The final plan should reconcile meals and workouts, for example by placing simpler meals on heavy training days and calling out protein, hydration, prep, recovery, and shopping implications.

## Shared Session Storage

All agents use a shared session-service factory. Local SQLite paths use ADK's first-party `SqliteSessionService` from `google.adk.sessions.sqlite_session_service`. Turso/libSQL URLs use ADK's SQLAlchemy-backed `DatabaseSessionService` from `google.adk.sessions.database_session_service`.

Local Docker uses one shared volume mounted into every agent at `/data`, and each service receives:

```text
ADK_SESSION_DB_PATH=/data/adk_sessions.sqlite
```

Local non-Docker execution can override `ADK_SESSION_DB_PATH`; otherwise each service defaults to the same repo-level path:

```text
../../.data/adk_sessions.sqlite
```

The same service instance is passed to both the `ADKAgent` AG-UI path and the A2A `Runner` inside each process. The database is shared across agents, while ADK still separates session rows by `app_name`, `user_id`, and `session_id`.

Turso/libSQL configuration:

```text
TURSO_DATABASE_URL=libsql://<database-host>
TURSO_AUTH_TOKEN=<token>
```

The factory normalizes `TURSO_DATABASE_URL` to SQLAlchemy's `sqlite+libsql://...?...secure=true` form. `ADK_SESSION_DB_URL` can also be set directly when a deployment needs the full SQLAlchemy URL, and `ADK_SESSION_DB_AUTH_TOKEN` can override the token name. The runtime environment must include the SQLAlchemy libSQL dialect package (`sqlalchemy-libsql`) for `sqlite+libsql` URLs; local file-backed SQLite remains the default and does not require it.

## User Identity

The web CopilotKit route reads Clerk identity server-side:

```ts
const { userId } = await auth();
```

The route forwards the ID to backend agents as a trusted internal header:

```text
x-clerk-user-id: <clerk user id>
```

Each agent's `extract_state_from_request` returns `user_id` from this header. Static `user_id="demo_user"` values are removed from `ADKAgent(...)`, because `ag-ui-adk` gives extractor-provided `user_id` precedence only when no static user ID is configured.

For A2A, `ADKAgentExecutor` reads identity from request metadata:

```py
user_id = str(context.metadata.get("user_id") or "anonymous")
```

Wellness A2A delegation tools send the Clerk user ID in A2A metadata when they call grocery and fitness. The chain is:

```text
Clerk auth() -> CopilotKit runtime header -> AG-UI extractor -> ADK user_id -> wellness state/tool context -> A2A metadata -> grocery/fitness executor -> ADK user_id
```

## State Shape

Wellness state includes:

- `status`: `idle`, `delegating`, `planning`, or `ready`.
- `meal_plan`: summary returned by grocery.
- `workout_plan`: summary returned by fitness.
- `weekly_plan`: final combined markdown plan.
- `review_summary`: one-sentence completion summary.
- `last_delegation`: structured metadata about the latest A2A calls.
- `user_id`: Clerk user ID extracted from the request.

The UI reads from state and does not rely on pasted chat output as the source of truth.

## Error Handling

If grocery or fitness A2A calls fail, wellness records a structured failure in `last_delegation`, sets `status` back to `idle`, and replies with the specific unavailable dependency. It should not fabricate delegated output. If one dependency succeeds and the other fails, the final combined plan is not marked ready.

If no Clerk user ID is present, AG-UI falls back to `anonymous` for local development. Protected web routes should normally prevent anonymous production use.

If the shared SQLite path cannot be created or opened, the agent should fail during startup instead of silently falling back to in-memory sessions.

## Testing

Use test-first implementation.

Python tests:

- Shared session factory creates parent directories and returns `SqliteSessionService`.
- AG-UI request-state extractors include Clerk `user_id`.
- A2A executor uses metadata `user_id` and falls back to `anonymous`.
- Wellness A2A client builds requests with `user_id` metadata.
- Wellness routes expose health, agent card, A2A JSON-RPC, and AG-UI.

TypeScript tests or type checks:

- Web CopilotKit route forwards `x-clerk-user-id` to all backend agents.
- Shared wellness state type compiles.

Manual verification:

- `pnpm dev:agents` starts all four services.
- Wellness can request next week's meal and workout plan and writes a combined state plan.
- Reusing the same Clerk user and thread reloads state from SQLite after restart.
