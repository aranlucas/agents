# Learnings

## A2UI "Catalog not found" Error

### The Error

```
A2UI render error: Catalog not found: https://a2ui.org/specification/v0_9/basic_catalog.json
```

### Root Cause

The CopilotKit runtime's A2UI middleware (`@ag-ui/a2ui-middleware`) runs server-side in the Next.js API route. When the trends agent's subagent calls `render_a2ui`, the middleware intercepts the streaming tool-call args and emits partial A2UI operations (`createSurface` + `updateComponents`) as `ACTIVITY_SNAPSHOT` events sent to the frontend.

The middleware determines the catalog ID for the streaming `createSurface` via this fallback chain:

1. `this.config.defaultCatalogId` — from the a2ui runtime config (not set)
2. The `catalogId` field from the model's streaming args (the `render_a2ui` tool schema has no `catalogId` param, so this is undefined)
3. Falls back to `"https://a2ui.org/specification/v0_9/basic_catalog.json"`

The frontend registers `trendsCatalog` (with `id = TRENDS_CATALOG_ID`) in the `A2UIProvider`, so `MessageProcessor` can't find a catalog matching `BASIC_CATALOG_ID` and throws.

The Python agent's `build_a2ui_envelope` correctly uses `TRENDS_CATALOG_ID` in its final `createSurface` — but the middleware's streaming race condition means the error fires before the agent's final response arrives.

### Fixes

**Quick fix (applied):** `includeBasicCatalog: false` in `catalog.tsx` — removes basic catalog from the merged trends catalog. Error goes away because no basic-catalog-ID surfaces are emitted. This works because the trends agent only uses custom component types (TrendMetric, TrendBarChart, etc.) and never references basic catalog components.

**Proper fix (not yet applied):** Add `defaultCatalogId: TRENDS_CATALOG_ID` to the A2UI runtime config in `apps/web/src/app/api/copilotkit/route.ts`:

```typescript
export const A2UI_RUNTIME_CONFIG = {
  agents: ["trends"],
  defaultCatalogId: "https://agents-lucas.vercel.app/a2ui/catalogs/trends/v1",
};
```

This tells the middleware to emit streaming `createSurface` operations with the correct catalog ID. Additionally, set `includeBasicCatalog: true` (or remove the flag) in `catalog.tsx` to keep basic catalog components available for future agents.

### Key Files

- `apps/web/src/app/api/copilotkit/route.ts:20` — A2UI runtime config
- `apps/web/src/components/chat/agents/trends/catalog.tsx:212` — catalog creation (includeBasicCatalog toggle)
- `agents/trends/src/trends_agent/agent.py:28` — TRENDS_CATALOG_ID constant
- `node_modules/.pnpm/@a2ui+web_core@0.9.0/node_modules/@a2ui/web_core/src/v0_9/processing/message-processor.js:210-212` — where `A2uiStateError("Catalog not found: …")` is thrown
- `node_modules/.pnpm/@ag-ui+a2ui-middleware@0.0.10_…/node_modules/@ag-ui/a2ui-middleware/dist/index.mjs` — server-side middleware that injects streaming createSurface with the wrong catalog ID
