# Web UI Dark Mode Design

## Goal

Improve the web app UI so it reads as a deliberate agent operations console, uses structured shadcn-style components, supports reliable light and dark modes, and passes visual and contrast verification in Chrome.

## Scope

This pass targets `apps/web`. It covers the home agent index, shared agent page chrome, reusable cards and status treatments, theme tokens, and manual theme switching. It does not redesign the Python agents, mobile app, auth flows, or CopilotKit runtime behavior.

## Design Direction

The interface should feel quiet, compact, and work-focused. The app is a planning network with multiple agents, so the UI should prioritize scanability, stable panels, clear status, and crisp card hierarchy. Agent colors are identity accents, not page backgrounds. Neutral surfaces carry the layout, while badges, status dots, header strips, and selected states use agent color.

Avoid generic AI visual patterns: no purple gradient hero, no decorative blobs, no marketing card stacks, and no oversized homepage hero. The home page becomes a dense command index with a short system header, health/status context, and structured rows/cards for each agent. Agent pages keep the existing chat/artifact/context workflow but improve contrast, panel shape, card headers, and mobile segmented controls.

## Theming

Use shadcn-compatible semantic tokens in `globals.css`: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, and `ring` continue to map through Tailwind v4 `@theme inline`. Add explicit `.light` and `.dark` selectors so the theme can be switched manually and tested independent of the operating system. Keep `prefers-color-scheme: dark` as a fallback only when no stored theme exists.

Contrast requirements:

- Body text and card text target WCAG AA text contrast, at least 4.5:1 for normal text.
- Large headings and prominent labels target at least 3:1.
- Focus rings, form borders, selected tabs, and essential UI component boundaries target at least 3:1 against adjacent colors.
- Muted text remains readable and is not used for core instructions or primary state labels.

## Components

Add structured components instead of relying on raw Tailwind-only page markup:

- `ThemeProvider` and `ThemeToggle`: client-side theme state, persisted in local storage, applied to the document element.
- `AppHeader`: shared top bar with product label, agent health summary, and theme toggle.
- `PageIntro`: compact page title block for the home page.
- `AgentAccent`: centralized agent color tokens for class names and CSS variables.
- `AgentCard`: row/card treatment using shadcn `Card`, `Badge`, and `Button` instead of inline hex styling.
- Existing `HeroHeader`, `AgentWorkspace`, and section card patterns should use semantic tokens and shadcn button/card primitives where practical.

## Verification

Run repository checks after implementation. Start the Next.js dev server and inspect the site in Chrome. Verify:

- Home page, `/travel`, and at least one artifact-heavy page render correctly in light and dark.
- Theme toggle switches document classes and persists after reload.
- Cards, card headers, borders, buttons, focus rings, and mobile segmented controls remain coherent in both modes.
- There are no obvious text overlaps or clipped controls at desktop and mobile widths.
- Programmatic contrast checks cover common foreground/background token pairs and page-specific accent states.
