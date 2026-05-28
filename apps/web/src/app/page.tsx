import { AgentList } from "@/components/agent-list";
import { AgentKey } from "@/components/agent-key";
import { AgentStatusBar } from "@/components/agent-status-bar";
import type { Agent } from "@/components/agent-card";

const AGENTS: Agent[] = [
  {
    id: "01",
    href: "/travel",
    name: "Trip Studio",
    tagline: "Real-time itinerary planning",
    description:
      "Co-plan an itinerary, stream day-by-day, and book with approval.",
    cta: "Plan trip",
    tags: ["Travel", "Approvals", "Streaming"],
    theme: "travel",
  },
  {
    id: "02",
    href: "/grocery",
    name: "Grocery Studio",
    tagline: "Meal plans to Kroger carts",
    description:
      "Plan meals, find weekly deals, and build a cart you can check out.",
    cta: "Plan groceries",
    tags: ["Meals", "Kroger", "Deals"],
    theme: "grocery",
  },
  {
    id: "03",
    href: "/fitness",
    name: "Fitness Studio",
    tagline: "Strava-aware weekly training",
    description:
      "Build weekly training from Strava history and mountain objectives.",
    cta: "Plan training",
    tags: ["Fitness", "Strava", "Recovery"],
    theme: "fitness",
  },
  {
    id: "04",
    href: "/wellness",
    name: "Wellness Studio",
    tagline: "Meals and workouts together",
    description:
      "Coordinate grocery and fitness agents into one practical weekly plan.",
    cta: "Plan week",
    tags: ["A2A", "Meals", "Training"],
    theme: "wellness",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between px-5 md:px-8 h-11 border-b border-[var(--border)] shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-mute)]">
          Agents
        </span>
        <AgentStatusBar />
      </header>

      <div className="flex items-end justify-between px-5 md:px-8 pt-10 pb-8 border-b border-[var(--border)] shrink-0">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-mute)] mb-3">
            Planning system
          </p>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight text-[var(--ink)] leading-[1.0]">
            Agents that work
            <br />
            <span style={{ opacity: 0.3 }}>together.</span>
          </h1>
        </div>
        <AgentKey />
      </div>

      <AgentList agents={AGENTS} />

      <footer className="flex items-center gap-2 px-5 md:px-8 py-3 border-t border-[var(--border)] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--grocery)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
          Grocery
        </span>
        <span className="font-mono text-[9px] text-[var(--border-soft)] select-none">
          +
        </span>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--fitness)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
          Fitness
        </span>
        <span className="font-mono text-[9px] text-[var(--border-soft)] select-none">
          →
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
          Wellness orchestration
        </span>
      </footer>
    </div>
  );
}
