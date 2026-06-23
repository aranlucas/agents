# Trends A2UI Migration Design

Date: 2026-06-23

## Summary

The Google Trends agent will become the repository's only A2UI-backed agent. Its
existing SQL generation and BigQuery execution workflow will remain intact, but
the final result will be rendered as a domain-specific interactive surface
instead of a markdown artifact.

The standalone A2UI showcase agent will be removed from the Python gateway, web
console, shared types, and mobile application. A2UI rendering for Trends will be
web-only in this change because the current React Native client handles A2UI
activities as text placeholders and does not render A2UI surfaces.

## Goals

- Render Google Trends results as useful visual analysis rather than generic
  markdown.
- Preserve the current separation between SQL generation and SQL execution.
- Use the supported CopilotKit runtime middleware and provider integration.
- Give the A2UI generator a domain-specific component catalog with charts and
  data tables.
- Preserve structured Trends state for replay, fallback behavior, testing, and
  future export features.
- Remove the obsolete generic A2UI showcase from every surfaced agent registry.

## Non-goals

- Adding an A2UI renderer to React Native.
- Replacing BigQuery or changing the Google Trends public datasets.
- Building a general-purpose dashboard designer.
- Supporting arbitrary custom React code from the agent.
- Rewriting Trends as a single `LlmAgent`.
- Adding user-editable chart configuration in the first release.

## Research Findings

The design is based on current upstream contracts and the installed package
implementations, not the repository's existing showcase agent.

- CopilotKit applies `A2UIMiddleware` only to configured agent IDs and reports
  that scope through `/info`.
- The CopilotKit React provider automatically mounts the A2UI activity renderer
  and catalog context when the runtime reports A2UI as enabled. The application
  must not manually register a duplicate activity renderer.
- `ag-ui-adk` automatic A2UI tool injection requires the ADK root to be an
  `LlmAgent`, because it infers the rendering sub-agent's model from the root.
  The Trends root is a `SequentialAgent`, so automatic injection alone cannot
  give Trends a working `generate_a2ui` tool.
- `ag-ui-adk` supports explicitly constructed A2UI tools on nested
  `LlmAgent` instances and binds each tool to the active event queue per run.
- The standard A2UI v0.9 basic catalog provides layout and form primitives but
  does not provide the chart and analytical table components required for a
  useful Trends result.

Primary references:

- https://docs.copilotkit.ai/google-adk/generative-ui/a2ui/dynamic-schema
- https://docs.copilotkit.ai/google-adk/generative-ui/a2ui/fixed-schema
- https://a2ui.org/specification/v0.9-a2ui/
- https://adk.dev/integrations/a2ui/

Installed implementations inspected:

- `@copilotkit/runtime` 1.61.0
- `@copilotkit/react-core` 1.61.0
- `@ag-ui/client` 0.0.57
- `ag-ui-adk` 0.7.0
- `google-adk` 2.3.0
- `a2ui-agent-sdk` 0.2.4

## Architecture

### Agent workflow

The existing `SequentialAgent` remains the root:

1. `TrendsQueryGeneratorAgent` converts the user's question to bounded BigQuery
   SQL.
2. `TrendsQueryExecutorAgent` executes that exact SQL.
3. The executor normalizes the rows into structured Trends state.
4. The executor writes concise analytical insights into state.
5. The executor calls an explicit `generate_a2ui` tool to create the visible
   Trends surface.
6. The assistant emits only a short textual completion or error summary. The
   surface is the primary result.

The explicit A2UI tool will be created with the executor's model and attached to
the executor. Runtime auto-injection will not be relied upon for this composite
ADK workflow.

### Runtime

The web CopilotKit runtime will configure A2UI for `trends` only:

```ts
a2ui: {
  agents: ["trends"],
}
```

The middleware remains necessary even though Trends uses an explicit backend
generation tool. It translates the nested render events into A2UI activities,
advertises A2UI capability through `/info`, and supplies the catalog schema and
generation guidance to the run.

The runtime will not set `injectA2UITool`. Forwarding automatic injection to the
Trends `SequentialAgent` root would be redundant and would cause `ag-ui-adk` to
skip injection because the root has no inferable model. The explicitly attached
executor tool is the authoritative path.

### Web provider

The Trends console extension will pass an A2UI configuration to
`<CopilotKit>`. CopilotKit will auto-mount its built-in renderer after reading
runtime capability information.

No `renderActivityMessages` entry will be added manually.

The provider configuration will include the Trends component catalog so the
same definitions drive:

- the renderer,
- client-provided catalog schema context,
- middleware validation and recovery,
- the A2UI generation sub-agent.

## Trends State

The Trends state will become structured:

```text
query: string
generated_sql: string
columns: string[]
rows: list[object]
insights: string
status: idle | querying | ready | empty | error
error: string
user_id: string
```

`rows` will contain JSON-safe values. BigQuery-specific date, datetime,
decimal, geography, and other non-JSON-native values will be normalized before
they enter state or tool results.

The old combined markdown `result` field will be removed. The visible A2UI
surface and the structured state replace it.

State remains the durable source for:

- thread replay,
- fallback display if surface generation fails,
- deterministic tests,
- future CSV/JSON export,
- future mobile Trends support.

## Tools and Data Flow

### BigQuery execution tool

`execute_bigquery_sql` will return a structured object rather than a serialized
JSON string:

```json
{
  "ok": true,
  "columns": ["term", "rank", "score", "week"],
  "rows": [],
  "row_count": 0
}
```

Failure responses will use a stable shape:

```json
{
  "ok": false,
  "error": "Safe user-facing error"
}
```

The tool must not place exception representations or credentials in the
response.

### State writer

A Trends-specific state tool will atomically persist:

- the original user question,
- generated SQL,
- columns,
- normalized rows,
- insights,
- final status,
- any safe error message.

The executor must call the state writer before A2UI generation. A renderer
failure therefore cannot erase a successful query result.

### A2UI generation

The executor will call `generate_a2ui` with a clear analytical intent. The
generation prompt will require:

- one stable surface ID per result turn,
- concise labeling,
- no invented values,
- no data beyond the executed rows and state,
- a suitable visualization based on available columns,
- a data table even when a chart is present,
- explicit empty and error states,
- a compact SQL disclosure rather than SQL as the visual focus.

Follow-up requests that modify presentation without requiring new data may
update the existing surface. Requests that change the analytical question must
run the SQL workflow again and create a new result surface.

## Trends A2UI Catalog

The web application will define a custom catalog that includes the basic
catalog plus these domain components:

### `TrendMetric`

Displays a label, primary value, and optional supporting text.

Examples:

- result count,
- highest score,
- largest percent gain,
- latest week represented.

### `TrendBarChart`

Displays ranked categorical comparisons.

Required inputs:

- title,
- category key,
- value key,
- rows.

Optional inputs:

- description,
- maximum item count,
- value format.

### `TrendLineChart`

Displays a metric over time when the result has a temporal dimension.

Required inputs:

- title,
- x-axis key,
- y-axis key,
- rows.

Optional inputs:

- series key,
- description,
- value format.

### `TrendTable`

Displays normalized rows with controlled columns and a bounded visible row
count. It must support horizontal overflow on small screens and accessible
headers.

### `SqlDisclosure`

Displays generated SQL in a collapsed, copyable code disclosure. It is
secondary metadata and must not dominate the surface.

The renderers will use repository UI primitives and lightweight SVG or CSS for
charts. This change will not add a charting dependency unless implementation
proves the native approach insufficient.

## Surface Selection Rules

The generated surface will always include:

- a title derived from the user's question,
- a concise insight summary,
- result context such as region and represented date range when available,
- a bounded data table,
- the generated SQL disclosure.

Visualization selection:

- categorical label plus numeric metric: bar chart,
- temporal column plus numeric metric: line chart,
- both patterns: the most informative chart plus the table,
- no suitable numeric metric: table and insight cards only,
- zero rows: dedicated empty-state card without an empty chart,
- query error: dedicated error-state card without fabricated analysis.

The A2UI generator chooses the presentation, but catalog schemas and prompt
guidelines constrain it to these valid outcomes.

## Failure Handling

### SQL generation failure

- Set status to `error`.
- Preserve a safe explanation in state.
- Do not call BigQuery or A2UI generation.
- Return a concise chat error.

### BigQuery execution failure

- Set status to `error`.
- Do not include raw exception representations in UI state.
- Generate an error surface only if the A2UI tool remains available; otherwise
  the chat message and structured state are sufficient.

### Empty query result

- Set status to `empty`.
- Generate an empty-state surface that includes query context and SQL.
- Do not render empty axes or zero-valued fabricated metrics.

### A2UI generation or validation failure

- Keep successful query rows and insights in state.
- Allow CopilotKit's A2UI recovery UI to show retries and final failure.
- Emit a short chat fallback explaining that the data is available even though
  the visual surface failed.
- Do not restore the old markdown artifact as a second result path.

## Removal Scope

The standalone A2UI showcase will be removed from:

- `agents/a2ui`,
- root Python package paths,
- gateway imports and registration,
- gateway and import tests,
- shared `AgentId`, backend-path maps, and A2UI showcase state types,
- web agent registry and extension map,
- web console routes,
- homepage card and A2UI-specific theme behavior,
- health fixtures and proxy allowlists,
- mobile A2UI screen and tab registration,
- tests that assert the showcase exists.

The A2UI libraries remain dependencies because Trends uses them.

The existing `--a2ui` CSS variables and A2UI theme entry will be removed after
the showcase references are deleted. Trends continues to use its own theme.

## Web Console Behavior

The Trends console keeps the shared sidebar, thread routing, chat surface, and
CopilotKit session architecture.

The markdown artifact configuration is removed from the Trends registry entry.
A2UI activity messages render inline in the conversation through CopilotKit's
built-in renderer. The structured state is not exposed as a separate artifact
panel in this release.

Suggestions will be updated to encourage visualizable questions, including:

- top ranked terms,
- largest rising terms,
- regional comparison,
- change over multiple weeks.

## Mobile Behavior

The generic A2UI tab and screen will be removed.

No mobile Trends screen will be added in this change. The current mobile client
does not render A2UI surfaces, and presenting only an activity placeholder would
ship a materially degraded version of the feature.

Adding a React Native A2UI renderer and then surfacing Trends on mobile is a
separate project.

## Testing

### Python

- Trends state defaults and allowed statuses.
- BigQuery result normalization.
- Stable structured success, empty, and error responses.
- State writer behavior.
- Executor includes the explicit A2UI tool.
- Instructions require state persistence before surface generation.
- Composite agent and gateway route contracts remain valid.
- A2UI showcase import and gateway expectations are removed.

### Web

- Runtime A2UI configuration targets `trends`.
- `/info` fixtures advertise the Trends A2UI scope.
- Trends extension supplies the custom catalog.
- Catalog definitions and renderers have matching keys.
- Each custom component handles valid, empty, and malformed bounded inputs.
- Trends has no markdown artifact configuration.
- The A2UI agent is absent from registry order, routing, homepage, proxy, and
  health expectations.
- The custom chat surface renders A2UI activity messages through CopilotKit's
  activity resolver.

### Mobile

- The obsolete A2UI route and tab tests are removed or replaced.
- Source-smoke tests pass without the deleted screen.
- Agent URL configuration no longer expects the showcase agent.

### Repository gates

At minimum:

```bash
uv run pytest agents/trends agents/gateway agents/shared
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter mobile test
pnpm check
```

A local end-to-end smoke test should run the gateway and web app, execute a
representative Trends query, and verify that:

1. BigQuery returns real rows.
2. Trends state contains those rows and generated SQL.
3. an `a2ui-surface` activity reaches the browser,
4. a chart or table surface renders,
5. refreshing the same thread replays the conversation without losing the
   structured result.

The live smoke test requires valid Google Cloud credentials and is reported
separately if credentials or external services are unavailable.

## Migration Sequence

1. Add structured Trends result/state contracts and tests.
2. Add explicit A2UI generation tooling to the executor.
3. Build and test the Trends web catalog.
4. Switch runtime and provider A2UI scope from `a2ui` to `trends`.
5. Remove the markdown Trends artifact path.
6. Remove the standalone A2UI agent and all surfaced registrations.
7. Update offline fixtures and focused tests.
8. Run repository gates and a credentialed live smoke test when available.

## Acceptance Criteria

- A successful Trends query renders an inline A2UI analytical surface containing
  a table and, when the data supports it, a chart.
- The surface contains only values derived from the executed BigQuery result.
- Generated SQL and normalized rows are persisted in Trends state before visual
  generation.
- A2UI middleware and catalog context are scoped to Trends.
- Refreshing an existing Trends thread does not break chat replay.
- Empty results, query failures, and A2UI failures have explicit fallback
  behavior.
- The standalone A2UI agent is no longer present in gateway, web, shared types,
  or mobile.
- Focused tests and repository quality gates pass, with external credential
  blockers reported distinctly.
