# Fitness Training Agent Goal

Date: 2026-05-25

## What I Am Building

Add a new fitness training AI agent that creates weekly training plans from the user's Strava activity history. The agent will plan endurance work, gym sessions, stretching, recovery, and preparation for hiking or mountaineering objectives.

Users sign in with Google/Gmail through Clerk. After sign-in, they can connect Strava. When Strava is connected, the fitness agent automatically fetches recent activities before creating or revising a plan.

## Backend

I am adding a new Python ADK agent at `agents/fitness` on port `8002`.

The service will include:

- FastAPI app with `GET /health`.
- ADK `LlmAgent` wrapped by `ADKAgent`.
- Token-level streaming for the training plan.
- Strava activity fetching from the connected user's token.
- Web search tools for mountaineering and hiking objective research.

The agent will be registered in Docker and the web CopilotKit runtime as `fitness`.

## Agent Tools

The fitness agent will expose a small local tool set:

- `fetch_activities`: fetch recent Strava activities, normalize them, write them to state, and record `activities_synced_at`.
- `set_objective_research`: write a curated summary of hike or mountaineering research to state.
- `set_training_plan`: write the full weekly training plan to state.
- `mark_plan_ready`: mark the plan ready and write a short review summary.

The agent must call `fetch_activities` before creating or revising a plan when Strava is connected and the current activity snapshot is missing or stale.

## State

Add shared fitness types:

```ts
export type FitnessStatus = "idle" | "syncing" | "planning" | "ready";

export type FitnessActivity = {
  id: string;
  name: string;
  sport_type?: string;
  start_date?: string;
  distance_m?: number;
  moving_time_s?: number;
  elapsed_time_s?: number;
  total_elevation_gain_m?: number;
  average_heartrate?: number;
  perceived_effort?: number;
};

export type FitnessState = {
  strava_connected?: boolean;
  strava_token?: string;
  activities?: FitnessActivity[];
  activities_synced_at?: string;
  objective_research?: string;
  training_plan?: string;
  status?: FitnessStatus;
  review_summary?: string;
};
```

## Web

Add `/fitness` in the Next.js app.

The page will:

- Run inside `CopilotKit` with the `fitness` agent.
- Use Clerk as the signed-in user source.
- Fetch the user's Strava token from `/api/strava/token`.
- Write `strava_connected` and `strava_token` into agent state.
- Show a Strava connection gate when Strava is not connected.
- Show recent activities, objective research, and the weekly training plan when connected.
- Provide Copilot suggestions for syncing activities, planning next week, adding gym work, focusing recovery, and training toward a mountaineering objective.

## Config

Add the required environment and deployment wiring:

- `FITNESS_AGENT_URL`
- Strava Clerk provider constant: `custom_strava`
- Web search MCP service URL and API key
- Docker Compose service for `fitness`
- Railway config for `agents/fitness`

## Verification

I will verify:

- Strava activity normalization and missing-token behavior.
- `/api/strava/token` connected and disconnected responses.
- Shared TypeScript types compile.
- Fitness page renders disconnected, syncing, and planned states.
- Fitness agent health check responds on port `8002`.
- Existing travel and grocery agent registration still works.
