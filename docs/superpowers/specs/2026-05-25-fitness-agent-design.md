# Fitness Training Agent Design

Date: 2026-05-25

## Goal

Create a fitness training AI agent that uses a user's Strava history to adapt weekly goals and workouts. The agent should plan endurance work, gym training, stretching, recovery, and progression toward hiking or mountaineering objectives.

The app uses Clerk as the primary identity layer. Users sign in with Google/Gmail and can optionally connect Strava as a secondary OAuth account. Once Strava is connected, the agent automatically syncs recent activities before creating or revising a plan.

## Scope

This first version adds a new `fitness` agent and web page. It includes:

- Strava OAuth token sync through Clerk.
- Automatic recent activity fetch when Strava is connected.
- A weekly training plan rendered from shared agent state.
- Mountaineering objective research through Brave Search MCP.
- A small, explicit state-writing tool surface.

Mobile support can follow the same pattern later. The first implementation focuses on web and the Python ADK agent.

## Architecture

Add a new `agents/fitness` FastAPI service on port `8002`. It follows the existing ADK agent pattern used by travel and grocery:

- `_setup_otel()`
- `LlmAgent`
- `ADKAgent`
- `add_adk_fastapi_endpoint`
- `GET /health`

Register the agent in:

- `docker-compose.yml`
- `apps/web/src/env.ts`
- `apps/web/src/app/api/copilotkit/route.ts`
- `packages/types/src/index.ts`
- `apps/web/src/app/fitness/page.tsx`

The web data flow remains:

```text
apps/web /fitness
  -> CopilotKit runtime
  -> HttpAgent fitness
  -> agents/fitness ADK service
```

## Auth And Token Sync

Clerk remains the primary app auth provider. Users sign in with Google/Gmail. Strava is added as a connected external account, not a replacement login provider.

The `/fitness` page retrieves the current user's Strava OAuth token from `/api/strava/token` and writes these values into agent state:

- `strava_connected`
- `strava_token`

The token route mirrors the Kroger token route pattern and uses `custom_strava` as the Clerk OAuth provider constant. If deployment uses a different Clerk provider name, that name must be changed in one provider constant rather than scattered across the page and route.

## Agent State

Add a shared `FitnessState` type:

```ts
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

`activities_synced_at` is required so the agent can decide whether the activity snapshot is fresh enough or should be fetched again.

## Core Tools

Keep the first-version tool surface small:

### `fetch_activities`

Fetches recent authenticated athlete activities from Strava using `strava_token` from state. It writes normalized activities into state and sets `activities_synced_at`.

Behavior:

- If `strava_connected` is false or no token is present, return a clear disconnected result.
- Set `status` to `syncing` while fetching.
- Normalize Strava responses into the `FitnessActivity` shape.
- Return a concise summary of recent volume, activity mix, and elevation so the agent can adapt the plan.

### `set_objective_research`

Writes the curated mountaineering or hiking research summary into `objective_research`.

The agent should use this after Brave MCP searches, not render raw MCP output directly.

### `set_training_plan`

Writes the complete weekly training plan into `training_plan` and sets `status` to `planning`.

The plan should include weekly goals, endurance sessions, gym work, stretching, recovery, and objective-specific prep. This content can stream through `PredictStateMapping`.

### `mark_plan_ready`

Sets `status` to `ready` and writes `review_summary`.

## Automatic Activity Sync

When `strava_connected` is true, the agent must call `fetch_activities` before creating or revising a training plan if:

- `activities` is empty,
- `activities_synced_at` is missing, or
- the user asks for a new or updated plan and the activity snapshot may be stale.

If Strava is not connected, the agent may still plan from user-provided history, but it must state that the plan is less personalized until Strava is connected.

## Brave Search MCP

Use `brave/brave-search-mcp-server` instead of `crewai_tools` for web search.

Run Brave Search as an MCP service in HTTP mode for local Docker wiring. The Brave MCP server defaults to STDIO in v2, so the local service must explicitly set HTTP transport.

Expected environment:

- `BRAVE_API_KEY`
- `BRAVE_MCP_URL`

The fitness agent attaches a Brave `McpToolset` through `StreamableHTTPConnectionParams`. The agent instruction should use Brave MCP tools for current mountaineering context before objective-specific planning.

Relevant Brave tools:

- `brave_web_search` for route, permit, seasonal access, weather, and official source discovery.
- `brave_llm_context` when richer grounded context is needed.
- `brave_news_search` only when recent closures, incidents, or access changes matter.

## Web UI

Add `/fitness` with:

- A header and status badge.
- Strava connection gate when Strava is not connected.
- Recent activities panel.
- Objective research panel.
- Weekly training plan panel.
- Copilot sidebar.

Suggested prompts:

- "Plan next week from my Strava history."
- "Sync my recent activities."
- "Research Mount Shasta conditions and build a training week."
- "Add two gym sessions and daily mobility."
- "Adapt this week around recovery."

The UI reads from `agent.state`; it should not depend on chat text as the source of truth.

## Error Handling

Strava failures should return clear tool results:

- disconnected or missing token,
- unauthorized token,
- rate limit,
- API/network failure.

Brave MCP failures should not block generic training plans. If research fails, the agent should explain that current objective context could not be fetched and ask for route details or proceed with conservative assumptions.

## Testing

Focus tests on behavior with clear boundaries:

- Strava activity normalization and missing-token handling.
- Token route behavior for connected and disconnected users.
- Env validation for `FITNESS_AGENT_URL` and Brave MCP settings.
- Fitness UI render states for disconnected, syncing, and populated plan states.

Manual verification should run:

- Python tests for `agents/fitness`.
- TypeScript typecheck/lint for web and shared types.
- Local Docker or direct agent health check on port `8002`.

## Deployment Notes

Add Railway config for `agents/fitness` following the travel and grocery services.

Add environment variables to examples:

- `FITNESS_AGENT_URL`
- `BRAVE_API_KEY`
- `BRAVE_MCP_URL`

Clerk must be configured with Google/Gmail sign-in and the Strava OAuth external account provider before production use.
