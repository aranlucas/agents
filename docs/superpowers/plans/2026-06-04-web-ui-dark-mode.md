# Web UI Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a structured, contrast-checked web UI pass with reliable light/dark mode, shadcn components, and Chrome visual verification.

**Architecture:** Centralize visual decisions in semantic CSS tokens and small shared React components, then update existing pages to consume those components. Theme state is client-side and applies `light`/`dark` classes to the root element so Tailwind/shadcn variables are deterministic.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn-style local primitives, Base UI button, lucide-react, CopilotKit.

---

### Task 1: Theme Tokens And Provider

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/providers.tsx`
- Create: `apps/web/src/components/theme-toggle.tsx`

- [ ] **Step 1: Add explicit `.light` and `.dark` semantic tokens**

Replace preference-only dark mode with deterministic root class tokens. Preserve agent identity tokens and CopilotKit CSS variables.

- [ ] **Step 2: Add a client theme provider**

In `providers.tsx`, apply stored theme to `document.documentElement`, default to system preference when no stored value exists, and expose context for the toggle.

- [ ] **Step 3: Add a shadcn button-based theme toggle**

Create `theme-toggle.tsx` with a compact icon button using `Button`, `Monitor`, `Moon`, and `Sun`.

- [ ] **Step 4: Add hydration-safe root classes**

Update `layout.tsx` to set `suppressHydrationWarning` on `<html>`.

### Task 2: Shared App And Agent Components

**Files:**

- Create: `apps/web/src/components/agent-theme.ts`
- Create: `apps/web/src/components/app-header.tsx`
- Modify: `apps/web/src/components/agent-card.tsx`
- Modify: `apps/web/src/components/agent-key.tsx`
- Modify: `apps/web/src/components/hero-header.tsx`
- Modify: `apps/web/src/components/agent-workspace.tsx`

- [ ] **Step 1: Centralize agent theme metadata**

Move agent color, soft color, label, and CSS variable names into `agent-theme.ts`.

- [ ] **Step 2: Add shared app header**

Use `AgentStatusBar` and `ThemeToggle` in a reusable top bar.

- [ ] **Step 3: Refactor `AgentCard`**

Use `Card`, `Badge`, and `Button`. Remove inline hex hover styles and use per-agent CSS variables.

- [ ] **Step 4: Tighten agent page chrome**

Update `HeroHeader` and `AgentWorkspace` to use semantic surface/card variables, shadcn `Button` where appropriate, and stronger focus/selected states.

### Task 3: Home Page Composition

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/agent-list.tsx`

- [ ] **Step 1: Replace raw header/footer sections with shared components**

Use `AppHeader`, a compact intro band, `AgentList`, and a concise orchestration footer.

- [ ] **Step 2: Ensure responsive card grid/rows**

Keep rows dense on desktop and readable on mobile with stable spacing and no nested cards.

### Task 4: Agent Page Card Coherence

**Files:**

- Modify: `apps/web/src/app/grocery/page.tsx`
- Modify: `apps/web/src/app/fitness/page.tsx`
- Modify: `apps/web/src/app/wellness/page.tsx`
- Modify: `apps/web/src/app/a2ui/page.tsx`
- Modify: `apps/web/src/components/document-canvas.tsx`
- Modify: `apps/web/src/components/preferences-panel.tsx`
- Modify: `apps/web/src/components/approval-dialog.tsx`

- [ ] **Step 1: Align card headers and nested surfaces**

Use `bg-muted`, `bg-card`, `border-border`, `text-muted-foreground`, and page accent variables consistently.

- [ ] **Step 2: Preserve artifact behavior**

Do not change agent state contracts or CopilotKit hooks.

### Task 5: Verification

**Files:**

- Test existing repo checks.
- Use Chrome to inspect local web pages.

- [ ] **Step 1: Run formatting and lint checks**

Run `pnpm fmt:check`, `pnpm lint`, and `pnpm --filter web build` or the broadest feasible equivalent.

- [ ] **Step 2: Start the web dev server**

Run `pnpm dev:web` and keep it alive for browser verification.

- [ ] **Step 3: Verify in Chrome**

Inspect `/`, `/travel`, and `/grocery` in light and dark. Capture screenshots and run script-based contrast checks for token pairs and visible page text.

- [ ] **Step 4: Fix findings**

Address any contrast, overlap, hydration, or visual quality issues found during verification.
