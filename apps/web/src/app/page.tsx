import { AgentList } from "@/components/agent-list";
import { AgentKey } from "@/components/agent-key";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/components/agent-card";

const AGENTS: Agent[] = [
  {
    id: "01",
    href: "/travel",
    name: "Trip Studio",
    tagline: "Real-time itinerary planning",
    description: "Co-plan an itinerary, stream day-by-day, and book with approval.",
    cta: "Plan trip",
    tags: ["Travel", "Approvals", "Streaming"],
    theme: "travel",
  },
  {
    id: "02",
    href: "/grocery",
    name: "Grocery Studio",
    tagline: "Meal plans to Kroger carts",
    description: "Plan meals, find weekly deals, and build a cart you can check out.",
    cta: "Plan groceries",
    tags: ["Meals", "Kroger", "Deals"],
    theme: "grocery",
  },
  {
    id: "03",
    href: "/fitness",
    name: "Fitness Studio",
    tagline: "Strava-aware weekly training",
    description: "Build weekly training from Strava history and mountain objectives.",
    cta: "Plan training",
    tags: ["Fitness", "Strava", "Recovery"],
    theme: "fitness",
  },
  {
    id: "04",
    href: "/wellness",
    name: "Wellness Studio",
    tagline: "Meals and workouts together",
    description: "Coordinate grocery and fitness agents into one practical weekly plan.",
    cta: "Plan week",
    tags: ["A2A", "Meals", "Training"],
    theme: "wellness",
  },
  {
    id: "05",
    href: "/a2ui",
    name: "A2UI Studio",
    tagline: "Generative UI over AG-UI",
    description: "Ask an ADK agent to render declarative A2UI surfaces through CopilotKit.",
    cta: "Render UI",
    tags: ["A2UI", "ADK", "AG-UI"],
    theme: "a2ui",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader />

      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1480px] flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <section className="grid gap-5 border-b border-[var(--border)] pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-[var(--surface)] font-mono">
                Planning system
              </Badge>
              <Badge variant="secondary">CopilotKit x ADK</Badge>
            </div>
            <h1 className="max-w-3xl text-4xl leading-[0.98] font-semibold tracking-tight text-[var(--ink)] md:text-6xl">
              Agents that coordinate useful work.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--ink-soft)] md:text-base">
              A compact control surface for travel, grocery, fitness, wellness, and generative UI
              agents. Pick a workspace, give direction in chat, and watch the live artifact update.
            </p>
          </div>
          <AgentKey />
        </section>

        <AgentList agents={AGENTS} />

        <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--grocery)]" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--ink-mute)] uppercase">
            Grocery
          </span>
          <span className="font-mono text-[10px] text-[var(--ink-mute)] select-none">+</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fitness)]" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--ink-mute)] uppercase">
            Fitness
          </span>
          <span className="font-mono text-[10px] text-[var(--ink-mute)] select-none">to</span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">
            Wellness orchestration
          </span>
        </footer>
      </main>
    </div>
  );
}
