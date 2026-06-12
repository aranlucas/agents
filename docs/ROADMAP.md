# Roadmap

The direction: this monorepo evolves from a showcase of agent patterns into a
**personal assistant platform for Lucas** — one cheap gateway service, a
console + mobile app, and a growing set of agents that each own one slice of
life (food, fitness, travel, career), composable in-process the way wellness
already composes grocery + fitness.

Cost philosophy: free-tier model (OpenRouter free models with fallbacks), one
Railway service, free or generous-free-tier APIs wherever possible.

---

## Now (committed work)

| Item | Where |
| --- | --- |
| Codebase improvements (CI gaps, tool correctness, `create_agent_app` factory, config dedup) | `docs/superpowers/plans/2026-06-09-codebase-improvements.md` |
| Single-gateway consolidation (5 Railway services → 1), drop remote A2A | `docs/superpowers/plans/2026-06-11-audit-followups.md` |
| Auth perimeter: Clerk on `/console/*` + runtime, JWT verification on the gateway | same plan |
| Public **resume** agent (port of `aranlucas/resume-chat`, prompt-embedded resume) | same plan |
| README rewrite + AGENTS.md refresh | both plans |

## Next — platform capabilities (make every agent better)

These are leverage features: each one benefits all current and future agents.

### 1. Scheduled / proactive runs
Agents currently only respond. A personal assistant initiates. Add a tiny
scheduler endpoint on the gateway (`POST /jobs/run/<agent>` guarded by a
secret) and trigger it from a free scheduler (GitHub Actions cron, or
Railway cron). The agent runs a canned prompt ("prepare my morning brief"),
writes the result to shared state, and the result is waiting in the console.
- **Cost:** $0 (GitHub Actions cron).
- **Unlocks:** morning briefs, weekly reviews, price/deal watches.

### 2. Push notifications to mobile
Expo Push API (free) — the scheduled run from #1 ends by calling a
`notify(title, body)` tool that posts to Expo's push endpoint with the device
token stored in agent state. The mobile app already exists; this closes the
loop from "agent did something" to "Lucas finds out".
- **API:** `https://exp.host/--/api/v2/push/send` — free, no key.

### 3. Durable per-user memory
Sessions persist, but nothing remembers *Lucas* across sessions (home airport
lives in UI state; dietary prefs are re-typed). Add a `user_memory` table in
the existing SQLite/Turso DB with `remember(key, value)` / `recall(prefix)`
tools in `agent-common`, injected into every agent. Travel remembers the home
airport; grocery remembers staples; fitness remembers injuries.
- **Cost:** $0 (existing DB).

### 4. Generated state types (un-defer when ready)
Pydantic state schemas → generated TypeScript in `packages/types` so web,
mobile, and agents can't drift. Already spec'd as deferred in the 2026-06-09
plan; becomes more valuable with every new agent.

### 5. Cheap eval loop
A nightly GitHub Actions job replaying ~10 canned conversations per agent
against the free model and diffing tool-call sequences (not prose). Catches
"the free model changed and grocery stopped building carts" before Lucas does.
- **Cost:** $0 (free model + Actions).

## Later — new assistant agents

Each follows the house pattern: state tools (`set_*`, `mark_*`), an artifact
panel in the console, optional in-process composition. Ordered roughly by
value-per-effort. All APIs chosen for free tiers.

### 6. Briefing agent ("chief of staff") — highest leverage
The wellness pattern generalized: composes other agents in-process plus a few
direct APIs into one morning artifact — weather, calendar, today's workout
(fitness), what's for dinner (grocery), inbox highlights (mail). Runs on the
#1 scheduler, notifies via #2.
- **APIs:** Open-Meteo (weather — free, no key), Google Calendar API (free),
  Gmail API (free), sub-agents in-process.
- **State:** `{ brief: markdown, date, status }` → markdown artifact.

### 7. Mail triage agent
Reads the inbox via the Gmail API (OAuth through Clerk custom provider, same
pattern as Kroger/Strava), classifies into act/read/ignore, drafts replies as
Gmail drafts (never sends), and maintains a `triage` artifact. Subscription
renewals and receipts it spots feed agent #10.
- **APIs:** Gmail API — free; Clerk custom OAuth provider (existing pattern in
  `apps/web/src/lib/kroger-token.ts`).
- **Tools:** `set_triage(items)`, `draft_reply(thread_id, body)`,
  `mark_done(id)`.

### 8. Calendar agent
Find-a-slot, plan-my-week, "when can I fit a 10k run?" — pairs naturally with
fitness (in-process sub-agent) and travel (blocks trip dates).
- **APIs:** Google Calendar API — free.
- **Tools:** `propose_schedule(events)`, `set_week_view(markdown)`; writes
  require the existing HITL approval modal (`request_user_approval`).

### 9. Career agent (resume agent grown up)
The public resume agent answers recruiters; the private career agent works for
Lucas: tracks applications, tailors the resume per job description (diff shown
as an artifact), and summarizes GitHub activity into resume bullets.
- **APIs:** GitHub REST/GraphQL (free), Greenhouse/Lever public job-board
  JSON endpoints (free, no auth), the resume.md already in the repo.
- **Tools:** `set_applications(rows)`, `set_tailored_resume(markdown)`,
  `add_resume_bullet(text)`.

### 10. Money agent
Budget awareness without Plaid's price tag: parse CSV/OFX exports Lucas drops
in (free, private), plus receipts surfaced by the mail agent. Tracks
subscriptions, flags renewals before they hit, and budgets groceries against
what the grocery agent actually spends (cart totals are already in state).
- **APIs:** none required (file parsing); optional SimpleFIN Bridge (~$1.50/mo)
  if automatic bank sync ever feels worth it.
- **Tools:** `set_budget_view(markdown)`, `set_subscriptions(rows)`,
  `flag_renewal(item, date)`.

### 11. Reading/news digest agent
RSS + newsletters → one daily digest artifact with 3-sentence summaries,
ranked by Lucas's interests (stored via #3 memory). Brave Search API key
already exists in the stack for follow-up queries.
- **APIs:** RSS (free), Brave Search (existing key, free tier),
  optional Readwise Reader API (paid — skip initially).

### 12. Home/errands agent
Extends grocery beyond food: a household inventory ("when did I last buy
filters?"), maintenance reminders on the #1 scheduler, and price watches
using Kroger weekly deals (tooling already exists in the grocery MCP).
- **APIs:** existing Kroger MCP; no new keys.

## Sequencing suggestion

```
gateway consolidation ─► scheduler (#1) ─► push (#2) ─► briefing agent (#6)
                                   │
            memory (#3) ───────────┴─► mail (#7) ─► money (#10)
```

The platform trio (#1–#3) costs nothing to run and is what turns "chat apps"
into "assistant". The briefing agent is the first thing that makes the system
feel alive; mail triage is the first thing that saves real daily time.

## Explicitly not planned

- Paid model upgrades (free-tier model is a deliberate constraint).
- Plaid or other paid financial aggregators (CSV import first).
- Multi-user/productization — this is Lucas's personal system; auth exists to
  protect his data and his LLM quota, not to onboard users.
- Re-introducing remote A2A — in-process composition covers the need at zero
  network cost; revisit only if an agent must live on different infrastructure.
