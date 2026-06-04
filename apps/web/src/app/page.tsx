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
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] px-5 md:px-8">
        <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--ink-mute)] uppercase">
          Agents
        </span>
        <AgentStatusBar />
      </header>

      <div className="flex shrink-0 items-end justify-between border-b border-[var(--border)] px-5 pt-10 pb-8 md:px-8">
        <div>
          <p className="mb-3 font-mono text-[10px] tracking-[0.25em] text-[var(--ink-mute)] uppercase">
            Planning system
          </p>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.0] font-extrabold tracking-tight text-[var(--ink)]">
            Agents that work
            <br />
            <span style={{ opacity: 0.3 }}>together.</span>
          </h1>
        </div>
        <AgentKey />
      </div>

      <AgentList agents={AGENTS} />

      <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-5 py-3 md:px-8">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--grocery)]" />
        <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--ink-mute)] uppercase">
          Grocery
        </span>
        <span className="font-mono text-[9px] text-[var(--border-soft)] select-none">+</span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fitness)]" />
        <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--ink-mute)] uppercase">
          Fitness
        </span>
        <span className="font-mono text-[9px] text-[var(--border-soft)] select-none">→</span>
        <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--ink-mute)] uppercase">
          Wellness orchestration
        </span>
      </footer>
    </div>
  );
}
