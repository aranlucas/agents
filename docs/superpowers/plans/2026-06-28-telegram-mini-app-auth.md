# Telegram Mini App Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the link-token Telegram auth system with Telegram Mini App `initData` authentication so users sign into the Next.js app directly from the bot's "Open App" button — no separate Clerk signup flow needed.

**Architecture:** The Telegram bot is configured (via BotFather) with a Web App button pointing to `/tma`. When a user opens it, Telegram injects `window.Telegram.WebApp.initData` into the webview. The `/tma` page sends that raw string to `POST /api/telegram/auth`, which verifies the HMAC-SHA256 signature server-side using `TELEGRAM_BOT_TOKEN`, then finds or creates a Clerk user keyed by `externalId = telegramUser.id`, issues a Clerk sign-in token, and returns it. The client consumes the token via `signIn.create({ strategy: 'ticket', ticket })` and redirects to `/console`.

**Tech Stack:** Next.js 16 App Router, `@clerk/nextjs` (already installed), Node.js built-in `crypto` (no new deps for HMAC), Vitest + jsdom (existing test setup), `python-telegram-bot>=22` (already installed).

## Global Constraints

- Next.js 16 App Router — all pages are React Server Components unless marked `"use client"`
- No new npm dependencies for HMAC verification — use Node.js `crypto` module
- All server-side Clerk calls go through `clerkClient()` from `@clerk/nextjs/server`
- Tests use Vitest with `vi.mock` and dynamic `await import("./route")` (match existing pattern in `src/app/api/strava/token/route.test.ts`)
- All new TypeScript files must pass `pnpm typecheck`
- Run `pnpm test:py` after Python changes; run `pnpm --filter web test` after TS changes
- `TELEGRAM_BOT_TOKEN` is already in `apps/web/.env.local` — do not generate a new one

---

## File Map

| File                                               | Action | Responsibility                                                          |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/web/src/lib/telegram-init-data.ts`           | Create | Pure HMAC-SHA256 verification + `TelegramUser` type                     |
| `apps/web/src/lib/telegram-init-data.test.ts`      | Create | Unit tests for verification logic                                       |
| `apps/web/src/env.ts`                              | Modify | Add `TELEGRAM_BOT_TOKEN` server env var                                 |
| `apps/web/.env.local`                              | Modify | Already has token —yes just confirm it's there                          |
| `apps/web/src/app/api/telegram/auth/route.ts`      | Create | Exchange endpoint: verify → find/create user → issue sign-in token      |
| `apps/web/src/app/api/telegram/auth/route.test.ts` | Create | Route tests with mocked Clerk                                           |
| `apps/web/src/app/tma/layout.tsx`                  | Create | Standalone layout — injects Telegram Web App script                     |
| `apps/web/src/app/tma/page.tsx`                    | Create | Client component — reads initData, calls exchange, starts Clerk session |
| `agents/telegram/src/telegram_bot/runner.py`       | Modify | Add web_app button to `/start` reply                                    |
| `agents/telegram/tests/test_telegram_runner.py`    | Modify | Test that `/start` sends a web_app button                               |
| Clerk Dashboard (browser)                          | Config | Add Mini App origin to allowed domains; confirm sign-in tokens enabled  |
| `agents/telegram/src/telegram_bot/runner.py`       | Modify | `get_linked_clerk_user_id` falls back to Clerk BAPI `externalId` lookup |

---

### Task 1: initData verification library

**Files:**

- Create: `apps/web/src/lib/telegram-init-data.ts`
- Create: `apps/web/src/lib/telegram-init-data.test.ts`

**Interfaces:**

- Produces:

  ```ts
  type TelegramUser = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  };
  // Returns parsed user if valid, null if HMAC fails or initData is malformed
  function verifyInitData(initData: string, botToken: string): TelegramUser | null;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/telegram-init-data.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram-init-data";

const BOT_TOKEN = "1234567890:test-bot-token";

function makeInitData(user: object, botToken: string): string {
  const userJson = JSON.stringify(user);
  const fields: Record<string, string> = {
    user: userJson,
    auth_date: String(Math.floor(Date.now() / 1000)),
    chat_instance: "-123456789",
    chat_type: "private",
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("verifyInitData", () => {
  it("returns the user for valid initData", () => {
    const user = { id: 42, first_name: "Alice", username: "alice" };
    const result = verifyInitData(makeInitData(user, BOT_TOKEN), BOT_TOKEN);
    expect(result).toMatchObject({ id: 42, first_name: "Alice", username: "alice" });
  });

  it("returns null when hash is tampered", () => {
    const raw = makeInitData({ id: 1, first_name: "Bob" }, BOT_TOKEN);
    const tampered = raw.replace(/hash=[^&]+/, "hash=deadbeef");
    expect(verifyInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it("returns null when initData is missing hash", () => {
    expect(verifyInitData("user=%7B%7D&auth_date=1", BOT_TOKEN)).toBeNull();
  });

  it("returns null when initData is empty", () => {
    expect(verifyInitData("", BOT_TOKEN)).toBeNull();
  });

  it("returns null when user field is missing", () => {
    const raw = makeInitData({ id: 1, first_name: "Bob" }, BOT_TOKEN);
    const noUser = raw.replace(/user=[^&]+&?/, "");
    expect(verifyInitData(noUser, BOT_TOKEN)).toBeNull();
  });

  it("returns null when user JSON is malformed", () => {
    const params = new URLSearchParams({ user: "not-json", auth_date: "1" });
    const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const dcs = "auth_date=1\nuser=not-json";
    const hash = createHmac("sha256", secretKey).update(dcs).digest("hex");
    params.set("hash", hash);
    expect(verifyInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/repo
pnpm --filter web test -- --run src/lib/telegram-init-data.test.ts
```

Expected: `Cannot find module './telegram-init-data'`

- [ ] **Step 3: Implement the verification library**

Create `apps/web/src/lib/telegram-init-data.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export function verifyInitData(initData: string, botToken: string): TelegramUser | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    if (!timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(receivedHash, "hex"))) {
      return null;
    }
  } catch {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw) as TelegramUser;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — all 6 should pass**

```bash
pnpm --filter web test -- --run src/lib/telegram-init-data.test.ts
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/telegram-init-data.ts apps/web/src/lib/telegram-init-data.test.ts
git commit -m "feat(web): add Telegram initData HMAC-SHA256 verification"
```

---

### Task 2: env var + exchange API route

**Files:**

- Modify: `apps/web/src/env.ts`
- Create: `apps/web/src/app/api/telegram/auth/route.ts`
- Create: `apps/web/src/app/api/telegram/auth/route.test.ts`

**Interfaces:**

- Consumes: `verifyInitData(initData, botToken): TelegramUser | null` from Task 1
- Produces:

  ```
  POST /api/telegram/auth
  Body: { initData: string }
  200: { token: string }
  400: { error: "invalid_init_data" }
  500: { error: "auth_failed" }
  ```

- [ ] **Step 1: Add `TELEGRAM_BOT_TOKEN` to `apps/web/src/env.ts`**

Open `apps/web/src/env.ts`. In the `server` object, add after `TELEGRAM_LINK_SECRET`:

```ts
TELEGRAM_BOT_TOKEN: z.string().optional(),
```

In the `runtimeEnv` object, add:

```ts
TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
```

- [ ] **Step 2: Confirm token is in `apps/web/.env.local`**

```bash
grep TELEGRAM_BOT_TOKEN apps/web/.env.local
```

Expected: `TELEGRAM_BOT_TOKEN=8505744637:...` — if missing, add it:

```
TELEGRAM_BOT_TOKEN=<value from root .env.local>
```

- [ ] **Step 3: Write the failing route tests**

Create `apps/web/src/app/api/telegram/auth/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyInitDataMock = vi.fn();
const createUserMock = vi.fn();
const getUserListMock = vi.fn();
const createSignInTokenMock = vi.fn();

vi.mock("@/lib/telegram-init-data", () => ({
  verifyInitData: verifyInitDataMock,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUserList: getUserListMock,
      createUser: createUserMock,
    },
    signInTokens: {
      createSignInToken: createSignInTokenMock,
    },
  })),
}));

describe("POST /api/telegram/auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when initData verification fails", async () => {
    verifyInitDataMock.mockReturnValueOnce(null);
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({ initData: "bad" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_init_data" });
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("issues token for existing Clerk user", async () => {
    const tgUser = { id: 42, first_name: "Alice" };
    verifyInitDataMock.mockReturnValueOnce(tgUser);
    getUserListMock.mockResolvedValueOnce({ data: [{ id: "clerk_user_1" }] });
    createSignInTokenMock.mockResolvedValueOnce({ token: "sit_abc123" });

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({ initData: "valid" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "sit_abc123" });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createSignInTokenMock).toHaveBeenCalledWith({
      userId: "clerk_user_1",
      expiresInSeconds: 300,
    });
  });

  it("creates new Clerk user when none exists, then issues token", async () => {
    const tgUser = { id: 99, first_name: "Bob", last_name: "Smith", username: "bsmith" };
    verifyInitDataMock.mockReturnValueOnce(tgUser);
    getUserListMock.mockResolvedValueOnce({ data: [] });
    createUserMock.mockResolvedValueOnce({ id: "clerk_user_new" });
    createSignInTokenMock.mockResolvedValueOnce({ token: "sit_xyz789" });

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({ initData: "valid" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "sit_xyz789" });
    expect(createUserMock).toHaveBeenCalledWith({
      externalId: "99",
      firstName: "Bob",
      lastName: "Smith",
    });
  });

  it("returns 400 when request body has no initData field", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_init_data" });
  });

  it("returns 500 when Clerk sign-in token creation throws", async () => {
    verifyInitDataMock.mockReturnValueOnce({ id: 1, first_name: "X" });
    getUserListMock.mockResolvedValueOnce({ data: [{ id: "clerk_1" }] });
    createSignInTokenMock.mockRejectedValueOnce(new Error("clerk down"));

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({ initData: "valid" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "auth_failed" });
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
pnpm --filter web test -- --run src/app/api/telegram/auth/route.test.ts
```

Expected: `Cannot find module './route'`

- [ ] **Step 5: Implement the route**

Create `apps/web/src/app/api/telegram/auth/route.ts`:

```ts
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyInitData } from "@/lib/telegram-init-data";
import { env } from "@/env";

export async function POST(req: Request) {
  let initData: string | undefined;
  try {
    const body = await req.json();
    initData = typeof body?.initData === "string" ? body.initData : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  if (!initData || !env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  const tgUser = verifyInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!tgUser) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    const telegramId = String(tgUser.id);

    const { data: existingUsers } = await clerk.users.getUserList({
      externalId: [telegramId],
    });

    let userId: string;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
    } else {
      const newUser = await clerk.users.createUser({
        externalId: telegramId,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
      });
      userId = newUser.id;
    }

    const { token } = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 300,
    });

    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run tests — all 5 should pass**

```bash
pnpm --filter web test -- --run src/app/api/telegram/auth/route.test.ts
```

Expected: `5 passed`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/env.ts apps/web/src/app/api/telegram/auth/
git commit -m "feat(web): add Telegram Mini App initData exchange endpoint"
```

---

### Task 3: Mini App entry page (`/tma`)

**Files:**

- Create: `apps/web/src/app/tma/layout.tsx`
- Create: `apps/web/src/app/tma/page.tsx`

**Interfaces:**

- Consumes: `POST /api/telegram/auth` → `{ token: string }` from Task 2
- Consumes: `useSignIn()` from `@clerk/nextjs/client` — `signIn.create({ strategy: 'ticket', ticket })` and `setActive({ session: createdSessionId })`
- Produces: `/tma` route — opens as Telegram Mini App, authenticates user, redirects to `/console`

**Note on local testing:** The `window.Telegram.WebApp` object is only injected when the page is opened in Telegram's webview. To test locally before BotFather config, temporarily read `initData` from `?initData=` URL query param as a fallback (dev-only, see step 3).

- [ ] **Step 1: Create the layout**

Create `apps/web/src/app/tma/layout.tsx`:

```tsx
import Script from "next/script";
import type { ReactNode } from "react";

export default function TmaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Create the Mini App page**

Create `apps/web/src/app/tma/page.tsx`:

```tsx
"use client";

import { useSignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthState =
  { status: "loading" } | { status: "error"; message: string } | { status: "success" };

function getInitData(): string {
  if (typeof window === "undefined") return "";
  // Telegram injects this when opened via Mini App
  const twa = (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (twa?.initData) return twa.initData;
  // Dev fallback: pass ?initData=... in the URL
  return new URLSearchParams(window.location.search).get("initData") ?? "";
}

export default function TmaPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/console");
      return;
    }

    async function authenticate() {
      const initData = getInitData();
      if (!initData) {
        setState({ status: "error", message: "Not opened from Telegram." });
        return;
      }

      try {
        const res = await fetch("/api/telegram/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState({ status: "error", message: body.error ?? "Auth failed." });
          return;
        }
        const { token } = await res.json();
        const result = await signIn!.create({ strategy: "ticket", ticket: token });
        await setActive!({ session: result.createdSessionId });
        router.replace("/console");
      } catch {
        setState({ status: "error", message: "Unexpected error. Please try again." });
      }
    }

    void authenticate();
  }, [isLoaded, isSignedIn, signIn, setActive, router]);

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Signing in…</p>
    </main>
  );
}
```

- [ ] **Step 3: Type-check the new files**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors related to `tma/`. Fix any type errors before continuing.

- [ ] **Step 4: Start the dev server and navigate to `/tma` without initData**

```bash
pnpm --filter web dev
```

Open `http://localhost:3000/tma` in a browser. Expected: page shows "Not opened from Telegram."

Open `http://localhost:3000/tma?initData=bad` — expected: "invalid_init_data" error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/tma/
git commit -m "feat(web): add Telegram Mini App entry page at /tma"
```

---

### Task 4: Wire the bot to the Mini App

The bot needs to send a Web App button in its `/start` reply so users can open `/tma` directly from the chat. The button requires `TELEGRAM_MINI_APP_URL` (the public HTTPS URL of the web app). In production this is `https://[your-domain]/tma`; locally use an ngrok/tunnel URL.

**Files:**

- Modify: `agents/telegram/src/telegram_bot/runner.py`
- Modify: `agents/telegram/src/telegram_bot/main.py`
- Modify: `agents/telegram/tests/test_telegram_runner.py`

**Interfaces:**

- Consumes: `TELEGRAM_MINI_APP_URL` env var (new)
- Produces: `/start` command handler sends an `InlineKeyboardMarkup` with a `WebAppInfo` button

- [ ] **Step 1: Write the failing test**

Open `agents/telegram/tests/test_telegram_runner.py`. Add at the bottom:

```python
def test_build_application_with_mini_app_url(engine: AsyncEngine) -> None:
    bot = TelegramAgentsBot(
        services=cast(AgentServices, SimpleNamespace(engine=engine)),
        mini_app_url="https://example.com/tma",
    )
    assert bot.mini_app_url == "https://example.com/tma"


def test_build_application_without_mini_app_url(engine: AsyncEngine) -> None:
    bot = TelegramAgentsBot(
        services=cast(AgentServices, SimpleNamespace(engine=engine)),
    )
    assert bot.mini_app_url is None
```

Run:

```bash
uv run pytest agents/telegram/tests/test_telegram_runner.py::test_build_application_with_mini_app_url -v
```

Expected: `AttributeError: 'TelegramAgentsBot' object has no attribute 'mini_app_url'`

- [ ] **Step 2: Add `mini_app_url` to `TelegramAgentsBot`**

Open `agents/telegram/src/telegram_bot/runner.py`.

In `TelegramAgentsBot.__init__`, add the parameter and assignment:

```python
def __init__(
    self,
    *,
    services: AgentServices | None = None,
    allowed_chat_ids: set[int] | None = None,
    link_base_url: str | None = None,
    connect_url: str | None = None,
    mini_app_url: str | None = None,             # new
    credential_state_loader: ...,
    poll_timeout: int = 50,
    debug: bool = False,
) -> None:
    ...
    self.mini_app_url = mini_app_url              # new
```

- [ ] **Step 3: Update `_help_update` to send a Web App button when `mini_app_url` is set**

In `runner.py`, update the import block at the top to include:

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
```

Replace `_help_update`:

```python
async def _help_update(
    self,
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    del context
    message = telegram_message_from_update(update)
    if message is None or not self._is_allowed(message):
        return
    reply_markup = None
    if self.mini_app_url:
        reply_markup = InlineKeyboardMarkup(
            [[InlineKeyboardButton("Open App", web_app=WebAppInfo(url=self.mini_app_url))]]
        )
    await self._send_chunks(message, help_text(), reply_markup=reply_markup)
```

Update `_send_chunks` and `_send_reply` to accept an optional `reply_markup`:

```python
async def _send_chunks(
    self,
    message: TelegramMessage,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks):
        await self._send_reply(
            message,
            chunk,
            reply_markup=reply_markup if i == 0 else None,
        )

async def _send_reply(
    self,
    message: TelegramMessage,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> TelegramSentMessage | None:
    if message.reply_target is None:
        log.warning("Cannot reply to Telegram message without a reply target")
        return None
    return await message.reply_target.reply_text(
        text,
        disable_web_page_preview=True,
        reply_markup=reply_markup,
    )
```

Also update `TelegramReplyTarget` protocol to allow `reply_markup`:

```python
class TelegramReplyTarget(Protocol):
    async def reply_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: object = None,
    ) -> TelegramSentMessage: ...
```

- [ ] **Step 4: Add `TELEGRAM_MINI_APP_URL` to `main.py`**

Open `agents/telegram/src/telegram_bot/main.py`. Add:

```python
mini_app_url = os.getenv("TELEGRAM_MINI_APP_URL")

bot = TelegramAgentsBot(
    allowed_chat_ids=allowed_chat_ids,
    link_base_url=link_base_url,
    connect_url=connect_url,
    mini_app_url=mini_app_url,           # new
    poll_timeout=poll_timeout,
    debug=env_flag("TELEGRAM_DEBUG"),
)
```

- [ ] **Step 5: Run all telegram tests**

```bash
uv run pytest agents/telegram/tests/ -v
```

Expected: all tests pass (13 or more, including the 2 new ones).

- [ ] **Step 6: Add `TELEGRAM_MINI_APP_URL` to `.env.local`**

Append to root `.env.local`:

```
# Set to your public HTTPS URL (use ngrok for local dev, your domain for prod)
TELEGRAM_MINI_APP_URL=https://your-ngrok-url.ngrok.io/tma
```

For production on Railway/Vercel, set to `https://your-web-domain.vercel.app/tma`.

- [ ] **Step 7: Commit**

```bash
git add agents/telegram/src/telegram_bot/runner.py agents/telegram/src/telegram_bot/main.py agents/telegram/tests/test_telegram_runner.py
git commit -m "feat(telegram): add Open App web_app button to /start reply"
```

---

## End-to-End Manual Test

Once all tasks are complete, test the full flow:

1. **Configure BotFather** (one-time): Send `/setmenubutton` to `@BotFather`, select your bot, and enter your `/tma` URL. Or test via the inline button from `/start`.

2. **Start the bot locally** with `pnpm dev:telegram` (bot starts polling with `TELEGRAM_MINI_APP_URL` set).

3. **Send `/start` to `@MittzBot`** in Telegram — should see an "Open App" button.

4. **Tap "Open App"** — Telegram opens a webview at your `/tma` URL.

5. **Wait ~2 seconds** — page automatically signs you in via Clerk and redirects to `/console`.

6. **Verify in Clerk Dashboard** that a new user was created with `externalId` = your Telegram user ID.

---

---

### Task 5: Clerk Dashboard setup (browser automation)

Clerk restricts which origins can use the sign-in token strategy. The Mini App `/tma` page must be served from an origin listed in Clerk's allowed domains. This task uses Chrome browser automation to configure the Clerk dashboard.

**Files:** None — this is a one-time configuration step in the Clerk web console.

**Pre-condition:** You must know the public URL of the Mini App. For local dev this is an ngrok URL (e.g. `https://abc123.ngrok.io`); for production it is the Vercel deploy URL. Prompt the user if unknown.

- [ ] **Step 1: Open the Clerk Dashboard**

Use the Chrome MCP (`mcp__claude-in-chrome__*`) to navigate to `https://dashboard.clerk.com`. The user should already be logged in. Select the project matching this app (check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local` to confirm the correct instance).

- [ ] **Step 2: Check sign-in tokens are enabled**

Navigate to **Configure → Attack Protection → Sign-in tokens**. Confirm "Allow sign-in tokens" is toggled ON. If not, enable it and save.

- [ ] **Step 3: Allow Mini App origin**

Navigate to **Configure → Restrictions → Allowed origins**. Add:

- `https://<ngrok-or-vercel-url>` (whatever `TELEGRAM_MINI_APP_URL` is set to, without `/tma`)

If a wildcard is already in place (e.g. `https://*.vercel.app`), confirm the Mini App URL is covered. Save.

- [ ] **Step 4: Verify by checking the instance URL matches the publishable key**

In Configure → API Keys, confirm the publishable key begins with `pk_test_` or `pk_live_` matching the value in `apps/web/.env.local`. Take a screenshot to confirm.

---

### Task 6: Bot user-lookup via Clerk BAPI externalId

**Problem:** After a user signs in via initData, their Clerk user is created with `externalId = telegram_user_id`. But the bot's `get_linked_clerk_user_id()` currently looks up from the `telegram_account_links` SQLite table, which is only populated by the old link-token flow. So bot messages sent after initData sign-in would still prompt for `/login`.

**Fix:** Add a BAPI fallback — if no row in `telegram_account_links` matches, call Clerk's `GET /v1/users?external_id=<telegram_id>` and return the result if found.

**Files:**

- Modify: `agents/shared/src/agents_shared/telegram_auth.py`
- Modify: `agents/telegram/tests/test_telegram_auth.py` (if it exists) or add tests inline

**Interfaces:**

- `get_linked_clerk_user_id(telegram_user_id: int, engine: AsyncEngine) -> str | None` — no signature change; the fallback is internal

- [ ] **Step 1: Check existing function signature**

Read `agents/shared/src/agents_shared/telegram_auth.py` to see the current `get_linked_clerk_user_id` implementation.

- [ ] **Step 2: Write the failing test**

In the telegram tests, add a test that a bot user whose Clerk account was created via initData (no `telegram_account_links` row) still gets their `clerk_user_id` resolved:

```python
@pytest.mark.asyncio
async def test_get_linked_clerk_user_id_falls_back_to_bapi(
    engine: AsyncEngine, respx_mock: respx.MockRouter
) -> None:
    """Users linked via initData have no telegram_account_links row — resolve via Clerk BAPI."""
    telegram_user_id = 99999
    clerk_user_id = "user_bapi_found"
    clerk_secret_key = "sk_test_fallback"

    with patch.dict(os.environ, {"CLERK_SECRET_KEY": clerk_secret_key}):
        respx_mock.get(
            f"https://api.clerk.com/v1/users",
        ).mock(
            return_value=httpx.Response(
                200, json={"data": [{"id": clerk_user_id}]}
            )
        )
        result = await get_linked_clerk_user_id(telegram_user_id, engine)

    assert result == clerk_user_id
```

Run:

```bash
uv run pytest agents/shared/tests/ -k "test_get_linked_clerk_user_id_falls_back_to_bapi" -v
```

Expected: FAIL — function doesn't call BAPI yet.

- [ ] **Step 3: Implement the BAPI fallback**

In `telegram_auth.py`, after the SQLite lookup returns `None`, add:

```python
import os
import httpx

async def _clerk_user_id_by_external_id(telegram_user_id: int) -> str | None:
    secret = os.getenv("CLERK_SECRET_KEY")
    if not secret:
        return None
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.clerk.com/v1/users",
            params={"external_id": str(telegram_user_id), "limit": 1},
            headers={"Authorization": f"Bearer {secret}"},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return None
        data = resp.json().get("data", [])
        return data[0]["id"] if data else None
```

Then in `get_linked_clerk_user_id`, after the `return None` at the end of the SQLite lookup branch:

```python
    # No row in telegram_account_links — check if user was created via initData (externalId in Clerk)
    return await _clerk_user_id_by_external_id(telegram_user_id)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest agents/shared/tests/ -v
uv run pytest agents/telegram/tests/ -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agents/shared/src/agents_shared/telegram_auth.py agents/shared/tests/
git commit -m "feat(shared): fall back to Clerk BAPI externalId lookup for initData-linked users"
```

---

## Self-Review

**Spec coverage:**

- ✅ initData HMAC-SHA256 verification with `WebAppData` constant key
- ✅ User fields extracted: `id`, `first_name`, `last_name`, `username`
- ✅ Clerk find-or-create by `externalId`
- ✅ Clerk sign-in token issued and returned
- ✅ Client consumes token via `signIn.create({ strategy: 'ticket' })`
- ✅ Bot sends Mini App button on `/start`
- ✅ All Clerk calls server-side only
- ✅ No new npm dependencies
- ✅ Clerk Dashboard configured: sign-in tokens enabled, Mini App origin allowed (Task 5)
- ✅ Bot resolves initData-linked users via Clerk BAPI `externalId` fallback (Task 6)

**Type consistency check:**

- `TelegramUser` defined in Task 1, consumed in Task 2 route — ✅
- `POST /api/telegram/auth` response `{ token: string }` consumed in Task 3 page — ✅
- `mini_app_url` added to `__init__` signature and `main.py` — ✅

**Placeholder scan:** No TBD, TODO, or "implement later" found.
