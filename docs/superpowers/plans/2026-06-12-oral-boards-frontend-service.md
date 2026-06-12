# Oral Boards Frontend Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import `aranlucas/oral-boards` as `apps/oral-boards`, keep `agents/oralboards` as the ADK examiner, and share shadcn-style primitives through `packages/ui`.

**Architecture:** Add a small `@agents/ui` package for shared primitives, then add a standalone Next.js app under `apps/oral-boards`. The new app owns oral-board study pages, data, and search UI; the existing `apps/web` console continues to talk to `agents/oralboards` through the gateway.

**Tech Stack:** pnpm workspaces, Next.js 16, React 19, TypeScript, Tailwind CSS, Base UI/shadcn-style primitives, `better-sqlite3` lexical FTS search, Vercel project config.

---

## File Map

Create:

- `packages/ui/package.json` - package metadata and exports for shared primitives.
- `packages/ui/tsconfig.json` - package TypeScript settings.
- `packages/ui/src/index.ts` - public exports for primitive components and `cn`.
- `packages/ui/src/lib/utils.ts` - shared `cn` helper.
- `packages/ui/src/components/{button,badge,card,tabs,select,separator,collapsible}.tsx` - shared UI primitives copied from `apps/web`.
- `apps/oral-boards/**` - imported study frontend from `aranlucas/oral-boards`.
- `apps/oral-boards/vercel.json` - separate Vercel project build/install config.
- `apps/oral-boards/src/env.ts` - small client env helper for the optional examiner link.

Modify:

- `package.json` - add `dev:oral-boards` and `build:oral-boards`.
- `pnpm-workspace.yaml` - already covers `apps/*` and `packages/*`; verify no change needed.
- `pnpm-lock.yaml` - update after adding workspace dependencies.
- `apps/web/package.json` - add `@agents/ui`.
- `apps/web/tsconfig.json` - add a path entry for `@agents/ui`.
- `apps/web/src/components/chat/ChatSurface.tsx` - import `Button` from `@agents/ui`.
- `apps/web/src/components/approval-dialog.tsx` and other web files that use moved primitives - import moved primitives from `@agents/ui`.
- `apps/oral-boards/package.json` - pnpm package metadata and minimal dependencies.
- `apps/oral-boards/tsconfig.json` - app TypeScript settings and `@/*` alias.
- `apps/oral-boards/next.config.ts` - output tracing for `search.sqlite` and `better-sqlite3`.
- `apps/oral-boards/app/globals.css` - adapt tokens to the shared primitives.
- `apps/oral-boards/lib/searchStore.ts` - lexical-only `better-sqlite3` search.
- `apps/oral-boards/components/Navigation.tsx` - optional examiner-console link when `NEXT_PUBLIC_AGENT_CONSOLE_URL` is present.

Do not modify:

- `agents/oralboards/**` unless verification reveals a direct integration bug.
- `apps/web/src/app/api/copilotkit/route.ts`, `apps/web/src/app/api/agents/health/route.ts`, or `apps/web/src/components/chat/agents/registry.ts` unless existing tests fail. They already register `oral-boards`.

## Task 1: Add `@agents/ui`

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Create: `packages/ui/src/components/tabs.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Create: `packages/ui/src/components/separator.tsx`
- Create: `packages/ui/src/components/collapsible.tsx`

- [ ] **Step 1: Create the package manifest**

Write `packages/ui/package.json`:

```json
{
  "name": "@agents/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@base-ui/react": "^1.5.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.18.0",
    "tailwind-merge": "^3.6.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Write `packages/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create package directories**

Run:

```bash
mkdir -p packages/ui/src/components packages/ui/src/lib
```

Expected: directories exist.

- [ ] **Step 4: Copy the shared `cn` helper**

Write `packages/ui/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Copy primitives from `apps/web`**

Run:

```bash
cp apps/web/src/components/ui/button.tsx packages/ui/src/components/button.tsx
cp apps/web/src/components/ui/badge.tsx packages/ui/src/components/badge.tsx
cp apps/web/src/components/ui/card.tsx packages/ui/src/components/card.tsx
cp apps/web/src/components/ui/tabs.tsx packages/ui/src/components/tabs.tsx
cp apps/web/src/components/ui/select.tsx packages/ui/src/components/select.tsx
cp apps/web/src/components/ui/separator.tsx packages/ui/src/components/separator.tsx
cp apps/web/src/components/ui/collapsible.tsx packages/ui/src/components/collapsible.tsx
```

Expected: seven primitive files exist in `packages/ui/src/components`.

- [ ] **Step 6: Rewrite internal imports in copied primitives**

Replace every import of `@/lib/utils` in `packages/ui/src/components/*.tsx` with `../lib/utils`.

Run:

```bash
perl -pi -e 's#@/lib/utils#../lib/utils#g' packages/ui/src/components/*.tsx
```

Expected: `rg "@/lib/utils" packages/ui` prints no matches.

- [ ] **Step 7: Export the primitives**

Write `packages/ui/src/index.ts`:

```ts
export { cn } from "./lib/utils";
export { Badge, badgeVariants } from "./components/badge";
export { Button, buttonVariants } from "./components/button";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/collapsible";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/select";
export { Separator } from "./components/separator";
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "./components/tabs";
```

- [ ] **Step 8: Type-check the package**

Run:

```bash
pnpm --filter @agents/ui exec tsc --noEmit
```

Expected: command exits 0. If pnpm has not installed the new workspace package yet, run `pnpm install` first and repeat this command.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/ui package.json pnpm-lock.yaml
git commit -m "feat: add shared ui primitives package"
```

Expected: commit succeeds.

## Task 2: Wire `apps/web` To `@agents/ui`

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/src/components/chat/ChatSurface.tsx`
- Modify: every `apps/web/src/**/*.tsx` file importing one of the moved primitives from `@/components/ui/{button,badge,card,tabs,select,separator,collapsible}`

- [ ] **Step 1: Add the workspace dependency**

In `apps/web/package.json`, add:

```json
"@agents/ui": "workspace:*"
```

inside `dependencies`.

- [ ] **Step 2: Add a TypeScript path alias**

In `apps/web/tsconfig.json`, update `compilerOptions.paths`:

```json
"paths": {
  "@/*": ["./src/*"],
  "@agents/ui": ["../../packages/ui/src/index.ts"]
}
```

- [ ] **Step 3: Rewrite imports for moved primitives**

Run:

```bash
rg -l '@/components/ui/(button|badge|card|tabs|select|separator|collapsible)' apps/web/src \
  | xargs perl -pi -e 's#@/components/ui/(button|badge|card|tabs|select|separator|collapsible)#@agents/ui#g'
```

Expected: files that imported moved primitives now import from `@agents/ui`.

- [ ] **Step 4: Verify no moved-primitive imports remain**

Run:

```bash
rg '@/components/ui/(button|badge|card|tabs|select|separator|collapsible)' apps/web/src
```

Expected: no matches.

- [ ] **Step 5: Install workspace dependencies**

Run:

```bash
pnpm install
```

Expected: command exits 0 and updates `pnpm-lock.yaml`.

- [ ] **Step 6: Run web tests**

Run:

```bash
pnpm --filter web test
```

Expected: command exits 0.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "refactor: consume shared ui primitives in web"
```

Expected: commit succeeds.

## Task 3: Add The `apps/oral-boards` Package Shell

**Files:**

- Create: `apps/oral-boards/package.json`
- Create: `apps/oral-boards/tsconfig.json`
- Create: `apps/oral-boards/postcss.config.mjs`
- Create: `apps/oral-boards/next.config.ts`
- Create: `apps/oral-boards/vercel.json`
- Create: `apps/oral-boards/src/env.ts`
- Modify: `package.json`

- [ ] **Step 1: Create app directories**

Run:

```bash
mkdir -p apps/oral-boards/src
```

Expected: `apps/oral-boards/src` exists.

- [ ] **Step 2: Add package manifest**

Write `apps/oral-boards/package.json`:

```json
{
  "name": "oral-boards",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@agents/ui": "workspace:*",
    "@tanstack/react-query": "^5.101.0",
    "@types/better-sqlite3": "^7.6.13",
    "better-sqlite3": "^12.8.0",
    "lucide-react": "^1.18.0",
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.1",
    "@types/node": "^25.9.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "tailwindcss": "^4.3.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 3: Add TypeScript config**

Write `apps/oral-boards/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"],
      "@agents/ui": ["../../packages/ui/src/index.ts"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Add PostCSS config**

Write `apps/oral-boards/postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 5: Add Next config**

Write `apps/oral-boards/next.config.ts`:

```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/api/search": ["./search.sqlite", "./node_modules/better-sqlite3/**"],
    "/api/doc/[docid]": ["./search.sqlite", "./node_modules/better-sqlite3/**"],
  },
  turbopack: {
    root: path.resolve("../.."),
  },
};

export default nextConfig;
```

- [ ] **Step 6: Add Vercel config**

Write `apps/oral-boards/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && pnpm --filter oral-boards build",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "outputDirectory": ".next"
}
```

- [ ] **Step 7: Add env helper**

Write `apps/oral-boards/src/env.ts`:

```ts
export const env = {
  NEXT_PUBLIC_AGENT_CONSOLE_URL: process.env.NEXT_PUBLIC_AGENT_CONSOLE_URL,
};
```

- [ ] **Step 8: Add root scripts**

In root `package.json`, add:

```json
"dev:oral-boards": "pnpm --filter oral-boards dev",
"build:oral-boards": "pnpm --filter oral-boards build"
```

inside `scripts`.

- [ ] **Step 9: Install dependencies**

Run:

```bash
pnpm install
```

Expected: command exits 0 and updates `pnpm-lock.yaml`.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/oral-boards/package.json apps/oral-boards/tsconfig.json apps/oral-boards/postcss.config.mjs apps/oral-boards/next.config.ts apps/oral-boards/vercel.json apps/oral-boards/src/env.ts package.json pnpm-lock.yaml
git commit -m "feat: add oral boards frontend package shell"
```

Expected: commit succeeds.

## Task 4: Import Runtime Files From `aranlucas/oral-boards`

**Files:**

- Create: `apps/oral-boards/app/**`
- Create: `apps/oral-boards/components/**`
- Create: `apps/oral-boards/data/**`
- Create: `apps/oral-boards/lib/**`
- Create: `apps/oral-boards/types/**`
- Create: `apps/oral-boards/public/case-metadata.json`
- Create: `apps/oral-boards/search.sqlite`

- [ ] **Step 1: Ensure source checkout exists**

Run:

```bash
test -d /tmp/oral-boards-src || git clone --depth 1 https://github.com/aranlucas/oral-boards.git /tmp/oral-boards-src
```

Expected: `/tmp/oral-boards-src` exists.

- [ ] **Step 2: Copy runtime directories and files**

Run:

```bash
mkdir -p apps/oral-boards
cp -R /tmp/oral-boards-src/app apps/oral-boards/app
cp -R /tmp/oral-boards-src/components apps/oral-boards/components
cp -R /tmp/oral-boards-src/data apps/oral-boards/data
cp -R /tmp/oral-boards-src/lib apps/oral-boards/lib
cp -R /tmp/oral-boards-src/types apps/oral-boards/types
mkdir -p apps/oral-boards/public
cp /tmp/oral-boards-src/public/case-metadata.json apps/oral-boards/public/case-metadata.json
cp /tmp/oral-boards-src/search.sqlite apps/oral-boards/search.sqlite
```

Expected: routes, components, data, types, public metadata, and SQLite DB exist under `apps/oral-boards`.

- [ ] **Step 3: Remove copied local UI primitives**

Run:

```bash
rm -rf apps/oral-boards/components/ui
```

Expected: `apps/oral-boards/components/ui` does not exist.

- [ ] **Step 4: Confirm excluded heavy assets are absent**

Run:

```bash
test ! -d apps/oral-boards/docs
test ! -d apps/oral-boards/models
test ! -f apps/oral-boards/package-lock.json
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/oral-boards/app apps/oral-boards/components apps/oral-boards/data apps/oral-boards/lib apps/oral-boards/types apps/oral-boards/public apps/oral-boards/search.sqlite
git commit -m "feat: import oral boards study app runtime"
```

Expected: commit succeeds.

## Task 5: Adapt The Imported App To The Monorepo

**Files:**

- Modify: `apps/oral-boards/app/globals.css`
- Modify: `apps/oral-boards/lib/searchStore.ts`
- Modify: `apps/oral-boards/components/Navigation.tsx`
- Modify: all `apps/oral-boards/**/*.{ts,tsx}` files importing `@/components/ui/*`
- Modify: `apps/oral-boards/components/PageLayout.tsx` if it needs app-level background/token cleanup

- [ ] **Step 1: Replace UI primitive imports**

Run:

```bash
rg -l '@/components/ui/' apps/oral-boards \
  | xargs perl -pi -e 's#@/components/ui/(button|badge|card|tabs|select|separator|collapsible)#@agents/ui#g'
```

Expected: imports for the seven shared primitives point to `@agents/ui`.

- [ ] **Step 2: Verify no deleted UI imports remain**

Run:

```bash
rg '@/components/ui/' apps/oral-boards
```

Expected: no matches.

- [ ] **Step 3: Replace `apps/oral-boards/lib/searchStore.ts` with lexical-only search**

Write `apps/oral-boards/lib/searchStore.ts`:

```ts
import Database from "better-sqlite3";
import path from "node:path";

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};

export interface SearchResult {
  docid: string;
  filepath: string;
  title: string;
  score: number;
  snippet?: string;
  collectionName?: string;
  body?: string;
}

export interface DocMeta {
  docid: string;
  filepath: string;
  title: string;
  collectionName?: string;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "search.sqlite");
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}

const FTS_SQL = `
  SELECT
    d.id,
    d.collection,
    fts.filepath,
    fts.title,
    fts.body,
    bm25(documents_fts) AS score,
    snippet(documents_fts, 2, '[[', ']]', '...', 32) AS snippet
  FROM documents_fts fts
  JOIN documents d ON fts.filepath = d.collection || '/' || d.path
  WHERE documents_fts MATCH ?
    AND d.active = 1
  ORDER BY bm25(documents_fts)
  LIMIT ?
`;

const GET_BY_ID_SQL = `
  SELECT d.id, d.collection, d.collection || '/' || d.path AS filepath, d.title
  FROM documents d
  WHERE d.id = ?
    AND d.active = 1
`;

const GET_BODY_SQL = `
  SELECT c.doc
  FROM documents d
  JOIN content c ON d.hash = c.hash
  WHERE d.collection || '/' || d.path = ?
    AND d.active = 1
`;

function cleanQuery(q: string) {
  return q.replace(/[*"]/g, " ").trim().replace(/\s+/g, " ");
}

function scoreBm25(score: number) {
  const abs = Math.abs(score);
  return abs / (1 + abs);
}

export function getStore() {
  const database = getDb();
  const ftsStmt = database.prepare(FTS_SQL);
  const getByIdStmt = database.prepare(GET_BY_ID_SQL);
  const getBodyStmt = database.prepare(GET_BODY_SQL);

  return {
    async searchLex(q: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
      const limit = options.limit ?? 10;
      const escaped = cleanQuery(q);
      if (!escaped) return [];

      const rows = ftsStmt.all(escaped, limit) as Array<{
        id: number;
        collection: string;
        filepath: string;
        title: string;
        body: string;
        score: number;
        snippet: string;
      }>;

      return rows.map((row) => ({
        docid: String(row.id),
        filepath: row.filepath,
        title: row.title,
        body: row.body,
        score: scoreBm25(row.score),
        snippet: row.snippet,
        collectionName: COLLECTION_LABELS[row.collection] ?? row.collection,
      }));
    },

    async get(docRef: string): Promise<DocMeta | { error: string }> {
      const id = docRef.startsWith("#") ? docRef.slice(1) : docRef;
      const row = getByIdStmt.get(Number(id)) as
        | { id: number; collection: string; filepath: string; title: string }
        | undefined;

      if (!row) return { error: "Not found" };

      return {
        docid: String(row.id),
        filepath: row.filepath,
        title: row.title,
        collectionName: COLLECTION_LABELS[row.collection] ?? row.collection,
      };
    },

    async getDocumentBody(filepath: string): Promise<string> {
      const row = getBodyStmt.get(filepath) as { doc: string } | undefined;
      return row?.doc ?? "";
    },
  };
}
```

- [ ] **Step 4: Add optional examiner link to navigation**

In `apps/oral-boards/components/Navigation.tsx`, import the env helper:

```ts
import { env } from "@/src/env";
```

Add this item to the navigation list only when the env value exists:

```ts
const examinerLink = env.NEXT_PUBLIC_AGENT_CONSOLE_URL
  ? [{ href: env.NEXT_PUBLIC_AGENT_CONSOLE_URL, label: "Examiner", external: true }]
  : [];
```

Then render `examinerLink` after the existing internal links. Use `target="_blank"` and `rel="noreferrer"` for the external link.

- [ ] **Step 5: Replace global CSS with repo-compatible tokens**

Write `apps/oral-boards/app/globals.css`:

```css
@import "tailwindcss";

@source "../../packages/ui/src/**/*.{ts,tsx}";

@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--ink);
  --color-card: var(--surface);
  --color-card-foreground: var(--ink);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--surface-soft);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--bg-soft);
  --color-muted-foreground: var(--ink-mute);
  --color-accent: var(--accent-soft);
  --color-accent-foreground: var(--accent-strong);
  --color-destructive: var(--danger);
  --color-border: var(--border);
  --color-input: var(--border);
  --color-ring: var(--accent);
  --radius-md: 0.5rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.5rem;
}

:root {
  color-scheme: light;
  --bg: #f7f6f0;
  --bg-soft: #ece9de;
  --surface: #fffefa;
  --surface-soft: #f8f3ea;
  --ink: #17130f;
  --ink-mute: #6d645a;
  --border: #ddd5c9;
  --accent: #8f2633;
  --accent-soft: #f6dde1;
  --accent-strong: #701923;
  --primary-foreground: #ffffff;
  --danger: #b42318;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 6: Run TypeScript check through Next build**

Run:

```bash
pnpm --filter oral-boards build
```

Expected: build succeeds. If it fails on component API differences from `@agents/ui`, adjust the call site to the shared primitive API rather than re-adding local UI primitives.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/oral-boards package.json pnpm-lock.yaml
git commit -m "feat: adapt oral boards frontend to monorepo"
```

Expected: commit succeeds.

## Task 6: Verify Web Console And Full Workspace

**Files:**

- Modify only files needed to fix concrete failures from the commands below.

- [ ] **Step 1: Run web tests**

Run:

```bash
pnpm --filter web test
```

Expected: command exits 0.

- [ ] **Step 2: Run oral boards build**

Run:

```bash
pnpm --filter oral-boards build
```

Expected: command exits 0.

- [ ] **Step 3: Run package lint**

Run:

```bash
pnpm lint
```

Expected: command exits 0. Oxlint warnings should be fixed only if they are in changed files or cause a non-zero exit.

- [ ] **Step 4: Run format check**

Run:

```bash
pnpm fmt:check
```

Expected: command exits 0. If it fails on changed files, run `pnpm fmt` and repeat `pnpm fmt:check`.

- [ ] **Step 5: Start the oral boards dev server**

Run:

```bash
pnpm --filter oral-boards dev
```

Expected: Next reports a local URL, usually `http://localhost:3000` or the next open port.

- [ ] **Step 6: Browser smoke test**

Open the local oral-boards URL and verify:

```text
/
/all-cases
/exam-framework
/study-plan
/resources
/search
```

Expected: each page renders without a runtime error. On `/search`, query `pulpotomy`; results render. Open one result; `/doc/<docid>` renders a markdown document.

- [ ] **Step 7: Stop the dev server**

Stop the `pnpm --filter oral-boards dev` process with `Ctrl-C`.

Expected: no dev server process remains running for this task.

- [ ] **Step 8: Commit any verification fixes**

If previous steps required code changes, run:

```bash
git add apps/oral-boards apps/web packages/ui package.json pnpm-lock.yaml
git commit -m "fix: verify oral boards frontend integration"
```

Expected: commit succeeds if there were fixes. If there were no fixes, do not create an empty commit.

## Task 7: Final Review

**Files:**

- Read: `docs/superpowers/specs/2026-06-12-oral-boards-frontend-service-design.md`
- Read: `git diff HEAD~5..HEAD --stat`

- [ ] **Step 1: Confirm spec coverage**

Run:

```bash
rg -n "apps/oral-boards|@agents/ui|search.sqlite|vercel|NEXT_PUBLIC_AGENT_CONSOLE_URL" apps packages docs/superpowers/specs/2026-06-12-oral-boards-frontend-service-design.md
```

Expected: matches show the new app, shared UI package, SQLite search, Vercel config, and optional examiner link.

- [ ] **Step 2: Confirm excluded assets were not imported**

Run:

```bash
test ! -d apps/oral-boards/docs
test ! -d apps/oral-boards/models
test ! -f apps/oral-boards/package-lock.json
```

Expected: all commands exit 0.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: clean worktree, or only intentionally uncommitted files called out in the final response.

- [ ] **Step 4: Final response**

Report:

```text
Implemented apps/oral-boards as the standalone study frontend, kept agents/oralboards as the ADK examiner, added @agents/ui for shared primitives, and added Vercel config for the new frontend project.
Verification: pnpm --filter oral-boards build, pnpm --filter web test, pnpm lint, pnpm fmt:check.
```

If any verification command failed, include the exact command and failure reason instead of claiming success.
