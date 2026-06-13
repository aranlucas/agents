# Oral Boards Frontend Service Import - Design

**Date:** 2026-06-12
**Status:** Design - pending user review

## Summary

Import `aranlucas/oral-boards` into this monorepo as a new Next.js frontend service while keeping `agents/oralboards` as the ADK agent backend. The imported app becomes `apps/oral-boards`: a public study frontend for cases, exam framework content, resources, and source-document search. The existing `agents/oralboards` package remains the examiner agent served through the gateway and used by the multi-agent console.

To avoid duplicating shadcn primitives across `apps/web` and `apps/oral-boards`, add a small `packages/ui` workspace package. This package contains reusable shadcn-style primitives only. Oral-board domain components and data stay inside `apps/oral-boards`.

## Goals

- Add `apps/oral-boards` as an independently deployable Next.js app in the pnpm monorepo.
- Keep `agents/oralboards` as the agent service and preserve the existing `/console/oral-boards` chat examiner flow.
- Reuse shadcn-style primitives between Next.js apps through `@agents/ui`.
- Configure Vercel so the imported frontend can deploy as a separate project with root directory `apps/oral-boards`.
- Import only the runtime data needed by the frontend. Avoid committing the large raw PDF archive unless a runtime path requires it.
- Keep the import aligned with existing repo conventions: pnpm, Oxc/Oxfmt, TypeScript path aliases, and the existing Tailwind setup.

## Non-goals

- Replacing or removing `agents/oralboards`.
- Folding the study frontend into `apps/web`.
- Adding mobile oral-board screens in this pass.
- Moving oral-board domain UI into shared packages.
- Achieving vector-search parity. This import uses lexical FTS search first.

## Architecture

```
apps/oral-boards
  Next.js study frontend
  case library, resources, exam-framework pages
  document search/doc API backed by search.sqlite

apps/web
  multi-agent console
  /oral-boards redirects to /console/oral-boards
  talks to agents/oralboards through CopilotKit runtime

agents/oralboards
  Python ADK examiner agent
  mounted by agents/gateway at /oralboards

packages/ui
  shared shadcn-style primitives for Next.js apps
```

The frontend and agent are similar in domain and source material, but they serve different runtime roles. `apps/oral-boards` is the study/reference surface. `agents/oralboards` is the conversational examiner and grounding backend.

## Shared UI Package

Create `packages/ui` with:

- `package.json` named `@agents/ui`
- `src/index.ts`
- `src/lib/utils.ts` exporting `cn`
- `src/components/*` for shared primitives
- `tsconfig.json` aligned with the existing workspace packages

Seed `packages/ui` from the current `apps/web/src/components/ui` primitives because they match this repo's active design system and dependency choices. Start with the primitives needed by both apps:

- `Button`
- `Badge`
- `Card`
- `Tabs`
- `Select`
- `Separator`
- `Collapsible`

The package should not contain app-specific components such as `CaseCard`, `Navigation`, `PageLayout`, `PageHeader`, chat surfaces, workspace shells, or oral-board data renderers.

`apps/web` should migrate imports for the shared primitives it uses from `@/components/ui/...` to `@agents/ui/...` when those files are moved. Any primitives not needed by `apps/oral-boards` can remain local until there is a real second consumer.

## Oral Boards Frontend App

Create `apps/oral-boards` from the external repo's runtime application:

- `app/` routes:
  - `/`
  - `/all-cases`
  - `/exam-framework`
  - `/study-plan`
  - `/resources`
  - `/search`
  - `/doc/[docid]`
  - `/api/search`
  - `/api/doc/[docid]`
- `components/` domain components
- `data/` case, framework, study-plan, and resource data
- `lib/` case rotation and search store
- `public/case-metadata.json`
- `search.sqlite`

The app should use pnpm workspace dependencies rather than npm lockfiles. Do not import the external `package-lock.json`.

## Search Data

The external app's full repository is roughly 1.4 GB, mostly raw PDFs. Runtime search uses the committed SQLite index and does not need raw PDFs or local embedding model assets.

- commit `apps/oral-boards/search.sqlite` for frontend search
- keep `agents/oralboards/src/oralboards_agent/data/search.sqlite` as the agent's packaged copy
- do not commit `docs/` raw PDFs
- do not commit `models/` embedding assets

Search implementation should start with the reliable deployment path:

- lexical FTS search through `better-sqlite3`
- read full document bodies through `/api/doc/[docid]`
- preserve the existing UI affordances for score, snippet, expansion, and direct doc links

Hybrid vector search is disabled for the initial import. That removes the ONNX/runtime model packaging risk from the Vercel deployment.

## Vercel

Add `apps/oral-boards/vercel.json` for a separate Vercel project:

```json
{
  "buildCommand": "cd ../.. && pnpm --filter oral-boards build",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "outputDirectory": ".next"
}
```

Add `next.config.ts` output tracing includes for `search.sqlite` and `better-sqlite3`. The intended Vercel setup is:

- Project A: `apps/web`, existing multi-agent console
- Project B: `apps/oral-boards`, new study frontend
- Agent backend: Railway gateway, existing `agents/oralboards`

The existing `apps/web/vercel.json` should remain scoped to `apps/web` unless a root script needs to change.

## Package Scripts And Workspace Wiring

Update the root workspace and scripts:

- include `apps/oral-boards` in `pnpm-workspace.yaml`
- add root scripts:
  - `dev:oral-boards`
  - `build:oral-boards`
- ensure `pnpm install` resolves `@agents/ui` and the imported app dependencies

Use the package name `oral-boards` for the app so filtering is clear:

```bash
pnpm --filter oral-boards dev
pnpm --filter oral-boards build
```

## Existing Web App Integration

Keep the current console wiring:

- `apps/web/src/app/oral-boards/page.tsx` redirects to `/console/oral-boards`
- `apps/web/src/app/api/copilotkit/route.ts` maps `oral-boards` to gateway path `oralboards`
- `apps/web/src/app/api/agents/health/route.ts` checks `/oralboards/health`
- `apps/web/src/components/chat/agents/registry.ts` keeps `oral-boards` registered

Add an examiner-console navigation link from `apps/oral-boards` only when `NEXT_PUBLIC_AGENT_CONSOLE_URL` is set. The app renders no broken or placeholder link when the variable is absent.

## Error Handling

- Missing `search.sqlite`: search API returns a clear `500` error and logs the resolved path.
- Empty search query: search API returns `400`.
- Missing doc id: doc API returns `404`.
- Native SQLite package unavailable on Vercel: fail the affected API route with a specific API error rather than breaking static pages.

## Testing And Verification

Verification should include:

- `pnpm --filter oral-boards build`
- `pnpm --filter web test` for existing console behavior
- targeted TypeScript/import checks for `@agents/ui`
- `pnpm lint` and `pnpm fmt:check` if dependency installation and generated import volume make full checks practical
- manual local browser smoke test of:
  - `apps/oral-boards` home page
  - search route
  - document route
  - `apps/web` `/console/oral-boards`

## Migration Order

1. Add `packages/ui` and migrate only the primitives with two consumers.
2. Add `apps/oral-boards` package shell, workspace entry, scripts, and Vercel config.
3. Copy/import the external app runtime files, excluding raw PDFs and npm lockfile.
4. Adapt imports to `@agents/ui`, local aliases, pnpm dependency versions, and repo formatting.
5. Validate search API packaging and Next output tracing.
6. Run build/tests and fix integration issues.
