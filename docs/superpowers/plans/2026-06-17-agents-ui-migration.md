# @agents/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/web` consume all UI primitives exclusively through `@agents/ui` — extending the barrel to include ai-elements, normalizing every deep `@agents/ui/components/*` import to the barrel, routing `shadcn add` through `packages/ui`, and pruning duplicate deps from `apps/web/package.json`.

**Architecture:** `packages/ui` is the monorepo's single source for all shadcn and ai-elements components. `apps/web` imports exclusively from the `@agents/ui` barrel (no deep paths), composes rather than creates, and delegates `shadcn add` to `packages/ui` via `components.json` aliases. Duplicate transitive deps (e.g. `clsx`, `motion`, `shiki`) are removed from `apps/web` since they're already declared by `@agents/ui`.

**Tech Stack:** pnpm workspace, shadcn/ui (base-nova), TypeScript 6, Next.js 16, `@agents/ui` workspace package.

---

## File Map

| File                                                             | Action | Purpose                                                                                                                                               |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/index.ts`                                       | Modify | Add barrel re-exports for 6 ai-elements modules                                                                                                       |
| `apps/web/components.json`                                       | Modify | Route all shadcn CLI operations to `@agents/ui/components`                                                                                            |
| `apps/web/src/components/agent-card.tsx`                         | Modify | Normalize `@agents/ui/lib/utils` → `@agents/ui`                                                                                                       |
| `apps/web/src/components/document-canvas.tsx`                    | Modify | Normalize `@agents/ui/lib/utils`, `@agents/ui/components/input`, `@agents/ui/components/scroll-area`, `@agents/ui/components/textarea` → `@agents/ui` |
| `apps/web/src/components/hero-header.tsx`                        | Modify | Normalize `@agents/ui/lib/utils` → `@agents/ui`                                                                                                       |
| `apps/web/src/components/preferences-panel.tsx`                  | Modify | Normalize `@agents/ui/lib/utils`, `@agents/ui/components/input`, `@agents/ui/components/label` → `@agents/ui`                                         |
| `apps/web/src/components/workspace-shell.tsx`                    | Modify | Normalize `@agents/ui/lib/utils` → `@agents/ui`                                                                                                       |
| `apps/web/src/components/approval-dialog.tsx`                    | Modify | Normalize `@agents/ui/components/dialog` → `@agents/ui`                                                                                               |
| `apps/web/src/components/providers.tsx`                          | Modify | Normalize `@agents/ui/components/tooltip` → `@agents/ui`                                                                                              |
| `apps/web/src/components/chat/chat-surface.tsx`                  | Modify | Normalize all `@agents/ui/components/ai-elements/*` → `@agents/ui`                                                                                    |
| `apps/web/src/components/chat/speak-question-tool-call.tsx`      | Modify | Normalize `@agents/ui/components/ai-elements/tool` → `@agents/ui`                                                                                     |
| `apps/web/src/components/chat/artifact-panel.tsx`                | Modify | Normalize `@agents/ui/components/ai-elements/artifact` → `@agents/ui`                                                                                 |
| `apps/web/src/components/chat/transcribe-button.tsx`             | Modify | Normalize `@agents/ui/components/ai-elements/prompt-input` → `@agents/ui`                                                                             |
| `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx` | Modify | Normalize `@agents/ui/components/ai-elements/artifact` → `@agents/ui`                                                                                 |
| `apps/web/package.json`                                          | Modify | Remove duplicate deps that `@agents/ui` already provides                                                                                              |

---

## Task 1: Extend `@agents/ui` barrel with ai-elements exports

**Files:**

- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Append ai-elements re-exports to the barrel**

Open `packages/ui/src/index.ts` and add the following block at the end of the file (after the last `export … from "./components/table"` line):

```typescript
export * from "./components/ai-elements/artifact";
export * from "./components/ai-elements/conversation";
export * from "./components/ai-elements/message";
export * from "./components/ai-elements/reasoning";
export * from "./components/ai-elements/tool";
export * from "./components/ai-elements/prompt-input";
export * from "./components/ai-elements/suggestion";
```

- [ ] **Step 2: Verify no name collisions**

Run:

```bash
cd /path/to/repo && pnpm -F @agents/ui typecheck
```

Expected: no errors. If TypeScript reports a duplicate export, rename the conflicting export in the offending ai-elements file (this is unlikely — all existing exports use `Message*`, `Tool*`, `PromptInput*`, etc. prefixes that don't overlap with the shadcn primitives already in the barrel).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(@agents/ui): re-export ai-elements from package barrel"
```

---

## Task 2: Route `shadcn add` in `apps/web` to `packages/ui`

**Files:**

- Modify: `apps/web/components.json`

- [ ] **Step 1: Update aliases in `apps/web/components.json`**

Replace the `aliases` block so every shadcn CLI path resolves inside `@agents/ui`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../packages/ui/src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@agents/ui/components",
    "hooks": "@agents/ui/hooks",
    "lib": "@agents/ui/lib",
    "utils": "@agents/ui/lib/utils",
    "ui": "@agents/ui/components"
  }
}
```

Key change: `"components"` was `"@/components"` (local web); it now points to `@agents/ui/components` so `shadcn add <component>` inside `apps/web` installs into `packages/ui/src/components/` rather than creating `apps/web/src/components/ui/`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components.json
git commit -m "feat(web): route shadcn add through @agents/ui via components.json"
```

---

## Task 3: Normalize non-ai-elements deep imports in `apps/web`

This task collapses 7 files that use `@agents/ui/lib/utils`, `@agents/ui/components/input`, etc. into clean barrel imports.

**Files:**

- Modify: `apps/web/src/components/agent-card.tsx`
- Modify: `apps/web/src/components/document-canvas.tsx`
- Modify: `apps/web/src/components/hero-header.tsx`
- Modify: `apps/web/src/components/preferences-panel.tsx`
- Modify: `apps/web/src/components/workspace-shell.tsx`
- Modify: `apps/web/src/components/approval-dialog.tsx`
- Modify: `apps/web/src/components/providers.tsx`

- [ ] **Step 1: Fix `agent-card.tsx`**

Replace:

```typescript
import { cn } from "@agents/ui/lib/utils";
```

With:

```typescript
import { cn } from "@agents/ui";
```

- [ ] **Step 2: Fix `document-canvas.tsx`**

Replace these three lines:

```typescript
import { Input } from "@agents/ui/components/input";
import { ScrollArea } from "@agents/ui/components/scroll-area";
import { Textarea } from "@agents/ui/components/textarea";
import { cn } from "@agents/ui/lib/utils";
```

With a single consolidated import that merges with the existing `@agents/ui` barrel import.

After the edit, the `@agents/ui` import block in `document-canvas.tsx` should read:

```typescript
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  ScrollArea,
  Textarea,
} from "@agents/ui";
```

(Merge all existing named imports from the separate `@agents/ui` barrel lines into one statement, and remove the four deep-path imports.)

- [ ] **Step 3: Fix `hero-header.tsx`**

Replace:

```typescript
import { cn } from "@agents/ui/lib/utils";
```

With:

```typescript
import { cn } from "@agents/ui";
```

- [ ] **Step 4: Fix `preferences-panel.tsx`**

Replace:

```typescript
import { Input } from "@agents/ui/components/input";
import { Label } from "@agents/ui/components/label";
import { cn } from "@agents/ui/lib/utils";
```

With consolidated barrel imports. After the edit:

```typescript
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
} from "@agents/ui";
```

- [ ] **Step 5: Fix `workspace-shell.tsx`**

Replace:

```typescript
import { cn } from "@agents/ui/lib/utils";
```

With:

```typescript
import { cn } from "@agents/ui";
```

- [ ] **Step 6: Fix `approval-dialog.tsx`**

Replace the deep dialog import:

```typescript
} from "@agents/ui/components/dialog";
```

With barrel import. The dialog-specific imports (`DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger`) are all exported from the `@agents/ui` barrel. Merge them with the existing `import { Button } from "@agents/ui"` line:

```typescript
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@agents/ui";
```

(Keep only what `approval-dialog.tsx` actually uses — check the file first.)

- [ ] **Step 7: Fix `providers.tsx`**

Replace:

```typescript
import { TooltipProvider } from "@agents/ui/components/tooltip";
```

With:

```typescript
import { TooltipProvider } from "@agents/ui";
```

- [ ] **Step 8: Typecheck**

```bash
pnpm -F web typecheck
```

Expected: no errors. If TypeScript complains that a named export doesn't exist in `@agents/ui`, check the barrel's `index.ts` — the export may be missing its `type` keyword for interfaces.

- [ ] **Step 9: Commit**

```bash
git add \
  apps/web/src/components/agent-card.tsx \
  apps/web/src/components/document-canvas.tsx \
  apps/web/src/components/hero-header.tsx \
  apps/web/src/components/preferences-panel.tsx \
  apps/web/src/components/workspace-shell.tsx \
  apps/web/src/components/approval-dialog.tsx \
  apps/web/src/components/providers.tsx
git commit -m "refactor(web): normalize @agents/ui deep-path imports to barrel"
```

---

## Task 4: Normalize ai-elements deep imports in `apps/web`

Depends on **Task 1** (ai-elements must be in the barrel first).

**Files:**

- Modify: `apps/web/src/components/chat/chat-surface.tsx`
- Modify: `apps/web/src/components/chat/speak-question-tool-call.tsx`
- Modify: `apps/web/src/components/chat/artifact-panel.tsx`
- Modify: `apps/web/src/components/chat/transcribe-button.tsx`
- Modify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`

- [ ] **Step 1: Fix `chat-surface.tsx`**

Replace all five deep ai-elements imports:

```typescript
import { Suggestion, Suggestions } from "@agents/ui/components/ai-elements/suggestion";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@agents/ui/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@agents/ui/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@agents/ui/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@agents/ui/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@agents/ui/components/ai-elements/prompt-input";
```

With a single barrel import merged with the existing `import { Button } from "@agents/ui"`:

```typescript
import {
  Button,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  Suggestion,
  Suggestions,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type PromptInputMessage,
} from "@agents/ui";
```

- [ ] **Step 2: Fix `speak-question-tool-call.tsx`**

Replace:

```typescript
import { Tool, ToolContent, ToolHeader } from "@agents/ui/components/ai-elements/tool";
```

With merged barrel import:

```typescript
import { Button, Tool, ToolContent, ToolHeader } from "@agents/ui";
```

- [ ] **Step 3: Fix `artifact-panel.tsx`**

Replace:

```typescript
} from "@agents/ui/components/ai-elements/artifact";
```

With barrel import. After the edit the `@agents/ui` import should include `Artifact`, `ArtifactContent`, `ArtifactHeader`, `ArtifactTitle` (check what the file actually uses) alongside any other primitives already imported from `@agents/ui`.

- [ ] **Step 4: Fix `transcribe-button.tsx`**

Replace:

```typescript
import {
  PromptInputButton,
  usePromptInputController,
} from "@agents/ui/components/ai-elements/prompt-input";
```

With:

```typescript
import { PromptInputButton, usePromptInputController } from "@agents/ui";
```

- [ ] **Step 5: Fix `oral-boards-panel.tsx`**

Replace:

```typescript
} from "@agents/ui/components/ai-elements/artifact";
```

With barrel import. The file already has a large `@agents/ui` import block — merge `Artifact`, `ArtifactContent`, `ArtifactHeader`, `ArtifactTitle` into it.

- [ ] **Step 6: Typecheck**

```bash
pnpm -F web typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/web/src/components/chat/chat-surface.tsx \
  apps/web/src/components/chat/speak-question-tool-call.tsx \
  apps/web/src/components/chat/artifact-panel.tsx \
  apps/web/src/components/chat/transcribe-button.tsx \
  apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx
git commit -m "refactor(web): normalize ai-elements imports to @agents/ui barrel"
```

---

## Task 5: Remove duplicate deps from `apps/web/package.json`

These packages appear in both `apps/web/package.json` and `packages/ui/package.json` but are **not** directly imported in any `apps/web/src` file. They are transitive deps provided by `@agents/ui` and should not be declared in the consumer.

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Remove the following entries from the `"dependencies"` block**

```
@base-ui/react
@radix-ui/react-use-controllable-state
@rive-app/react-webgl2
@streamdown/cjk
@streamdown/code
@streamdown/math
@streamdown/mermaid
@xyflow/react
ai
ansi-to-react
class-variance-authority
clsx
cmdk
embla-carousel-react
media-chrome
motion
nanoid
react-jsx-parser
shiki
tailwind-merge
tokenlens
use-stick-to-bottom
```

**Do NOT remove** these packages — they are imported directly in `apps/web/src`:

- `lucide-react` — used directly in many web component files
- `next-themes` — imported in `apps/web/src/components/providers.tsx`
- `streamdown` — imported in `oral-boards-panel.tsx`, `artifact-panel.tsx`, `document-canvas.tsx`

- [ ] **Step 2: Sync pnpm lockfile**

```bash
pnpm install
```

Expected: lockfile updates without errors.

- [ ] **Step 3: Typecheck**

```bash
pnpm -F web typecheck
```

Expected: no errors. If TypeScript cannot resolve a removed package, it means that package was imported directly somewhere — add it back and grep for its usage.

- [ ] **Step 4: Run tests**

```bash
pnpm -F web test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): remove duplicate deps already provided by @agents/ui"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full typecheck across the monorepo**

```bash
pnpm typecheck
```

Expected: no errors anywhere.

- [ ] **Step 2: Full test suite**

```bash
pnpm -F web test
```

Expected: all tests pass.

- [ ] **Step 3: Spot-check shadcn CLI routing**

Run a dry-run to verify `shadcn add` would write to `packages/ui`, not `apps/web`:

```bash
cd apps/web && npx shadcn diff button
```

Expected: output references `packages/ui/src/components/button.tsx` (or shows no diff), not `apps/web/src/components/ui/button.tsx`.

---

## Self-Review

**Spec coverage:**

- ✅ All `@agents/ui/components/ai-elements/*` deep imports → barrel (Tasks 1 + 4)
- ✅ All `@agents/ui/lib/utils` and `@agents/ui/components/*` deep imports → barrel (Task 3)
- ✅ `apps/web/components.json` routes shadcn through packages/ui (Task 2)
- ✅ Duplicate transitive deps removed (Task 5)
- ✅ Composition-only: no new components created; only imports consolidated

**What is NOT in scope:**

- Moving the web-specific composition components (`workspace-shell.tsx`, `agent-card.tsx`, etc.) into `packages/ui` — these are app-specific, not primitives
- Changing any component behavior or styling
- Mobile app (`apps/mobile`) — out of scope
